require("dotenv").config();
const inquirer = require("inquirer");
const Piscina = require("piscina");
const fs = require("fs");
const path = require("path");
const DownloadManager = require("./utils");
const { rewriteLines, humanFileSize } = require("./utils/helpers");

const { CONCURRENT_REQUESTS = 10, SPLIT_CHUNK_IN_DIR = false } = process.env;

const splitChunkInDir = SPLIT_CHUNK_IN_DIR === "true";
// load json file
let chunks = [];
let selectedChunk = 0;
let chunkSize = CONCURRENT_REQUESTS;
let totalChunks = 0;
let isChunk = false;
let linkCompleted = [];
let complete = { count: 0, size: 0 };
let incomplete = { count: 0, size: 0 };
let monitor = {};
let urls = [];
let totalDownloadedSize = 0;
let totalTotalSize = 0;
let totalProgress = 0;
let totalSpeed = 0; // not used yet
let isReady = false;

const removeDirectory = (d) => !d.key.endsWith("/");
const checkCompleted = (data, { isChunkFiles, chunkIndex }) => {
	const { key, size } = data;
	const downloadPath = path.join(
		__dirname,
		"downloads",
		isChunkFiles && splitChunkInDir ? `part-${chunkIndex}` : "",
		key
	);
	const fileInfo = fs.existsSync(downloadPath) ? fs.statSync(downloadPath) : null;
	if (fileInfo && fileInfo.size === size) {
		complete.size += size;
		complete.count++;
		linkCompleted.push({ key, size });
		return false;
	}
	incomplete.size += size;
	incomplete.count++;
	return true;
};

const PrintDetails = ({ id, progress, totalSize, downloadedSize, speed }) => {
	monitor[id] = { progress, totalSize, downloadedSize, speed };
	totalDownloadedSize = Object.keys(monitor).reduce((a, b) => a + monitor[b].downloadedSize, 0);
	totalTotalSize = Object.keys(monitor).reduce((a, b) => a + monitor[b].totalSize, 0);
	totalProgress = (totalDownloadedSize / totalTotalSize) * 100;

	// calculate the speed of download in MB/s
	totalSpeed = Object.keys(monitor).reduce((a, b) => a + monitor[b].speed || 0, 0);
	totalSpeed = totalSpeed / Object.keys(monitor).length;
	totalSpeed = totalSpeed / 1024 / 1024;
	// convert tp MBit/s
	totalSpeed = totalSpeed * 8;
};

const processFiles = async (urls, { isChunkFiles = false, chunkIndex }) => {
	urls = urls.filter(removeDirectory).filter((d) => checkCompleted(d, { isChunkFiles, chunkIndex }));

	// if incomplete.count is 0 then exit
	if (incomplete.count === 0) {
		ExitLog();
	}

	logList().forEach((line) => console.log(line));
	isReady = true;
	let chunk = [];
	for (const url of urls) {
		if (chunk.length >= chunkSize) {
			chunks.push(chunk);
			chunk = [];
		}
		chunk.push(url);
	}
	chunks.push(chunk);

	for (const chunk of chunks) {
		const promises = [];
		totalChunks = chunk.reduce((a, b) => a + b.size, 0);

		// get key path distinct from all chunks in object then mkdir -p to create the directory
		const paths = chunk.map((data) => {
			const key = data.key;
			const path = key.split("/").slice(0, -1).join("/");
			return path;
		});
		// get distinct paths and create directory
		const distinctPaths = [...new Set(paths)];
		for (const filePath of distinctPaths) {
			fs.mkdirSync(
				path.join(__dirname, "downloads", isChunkFiles && splitChunkInDir ? `part-${chunkIndex}` : "", filePath),
				{
					recursive: true,
				}
			);
		}

		let index = 1;
		// clear the monitor object
		monitor = {};
		for (const data of chunk) {
			const { key, signedUrl, size } = data;
			const filePath = path.join(
				__dirname,
				"downloads",
				isChunkFiles && splitChunkInDir ? `part-${chunkIndex}` : "",
				key
			);
			const manager = new DownloadManager(signedUrl, filePath, index);

			monitor[manager.getId()] = { progress: 0, totalSize: size, downloadedSize: 0 };
			manager.on("progress", PrintDetails);
			promises.push(
				manager.download().then(() => {
					// update the complete object
					complete.size += size;
					complete.count++;

					// update the incomplete object
					incomplete.size -= size;
					incomplete.count--;
				})
			);
			// update the index
			index++;
		}
		await Promise.allSettled(promises);
	}
};

const logList = () => [
	`[Complete] count: ${complete.count} - size: ${humanFileSize(complete.size)}`,
	`[Incomplete] count: ${incomplete.count} - size: ${humanFileSize(incomplete.size)}`,
	``,
	`chunk progress: ${
		totalTotalSize > 0 ? `${humanFileSize(totalDownloadedSize)} from ${humanFileSize(totalTotalSize)}` : ""
	} - speed: ${totalSpeed.toFixed(2)} MBit/s`,
	`[${"=".repeat(Math.floor(totalProgress / 2))}${" ".repeat(
		50 - Math.floor(totalProgress / 2)
	)}] ${totalProgress.toFixed(2)}%`,

	`parallel requests: ${CONCURRENT_REQUESTS}`,
];
const ExitLog = () => {
	if (isChunk && splitChunkInDir) {
		console.log(`part-${selectedChunk} is completed.`);
		console.log(`path: ${path.join(__dirname, "downloads", `part-${selectedChunk}`)}`);
	} else {
		console.log(`all files are completed.`);
		console.log(`path: ${path.join(__dirname, "downloads")}`);
	}
	process.exit(1);
};
const app = async () => {
	// check if links.json exists or exit
	if (!fs.existsSync("links.json")) {
		console.log(`links.json not found,, please run node generate.js`);
		process.exit(1);
	}

	const fileContent = fs.readFileSync("links.json", "utf-8");
	urls = JSON.parse(fileContent);

	// if urls.length is 0 then exit
	if (urls.length === 0) {
		console.log(`links.json file is empty`);
		process.exit(1);
	}

	// check if the first element of urls is an array
	isChunk = Array.isArray(urls[0]?.files);
	if (isChunk) {
		console.log(`\n------ chunks (${urls.length}) ------`);
		// use inquirer to ask user which chunk to download
		const { chunkIndex } = await inquirer.prompt([
			{
				type: "list",
				name: "chunkIndex",
				message: "Select chunk to download",
				choices: urls.map((chunk, index) => {
					const size = chunk.files.reduce((a, b) => a + b.size, 0);
					return {
						name: `${index + 1} - ${chunk.files.length} files - ${humanFileSize(size)}`,
						value: index,
					};
				}),
			},
		]);
		selectedChunk = chunkIndex + 1;
		processFiles(urls[chunkIndex].files, { isChunkFiles: true, chunkIndex: selectedChunk });
	} else {
		processFiles(urls, { isChunkFiles: false });
	}
};

app();

setInterval(() => {
	if (isReady) {
		rewriteLines(logList());

		// if incomplete.count is 0 then exit
		if (incomplete.count === 0) {
			ExitLog();
		}
	}
}, 250); // 100 seconds * 1000 milliseconds/second
