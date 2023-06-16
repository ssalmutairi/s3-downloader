require("dotenv").config();
const fs = require("fs");
const path = require("path");
const DownloadManager = require("./utils");

const { CONCURRENT_REQUESTS = 10 } = process.env;
// load json file
let chunks = [];
let chunkSize = CONCURRENT_REQUESTS;
let linkCompleted = [];
let complete = { count: 0, size: 0 };
let incomplete = { count: 0, size: 0 };
let monitor = {};
let urls = [];
let totalDownloadedSize = 0;
let totalTotalSize = 0;
let totalProgress = 0;
const humanFileSize = (bytes, dp = 1) => {
	const thresh = 1024;
	if (Math.abs(bytes) < thresh) return bytes + " B";
	const units = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	let u = -1;
	const r = 10 ** 1;
	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	return bytes.toFixed(dp) + " " + units[u];
};
const isDirectory = (d) => !d.key.endsWith("/");
const checkCompleted = (data) => {
	const { key, size } = data;
	const downloadPath = path.join(__dirname, "downloads", key);
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

const PrintDetails = ({ id, progress, totalSize, downloadedSize }) => {
	monitor[id] = { progress, totalSize, downloadedSize };
	const values = Object.values(monitor);
	totalDownloadedSize = values.reduce((a, b) => a + b.downloadedSize, 0);
	totalTotalSize = values.reduce((a, b) => a + b.totalSize, 0);
	totalProgress = (totalDownloadedSize / totalTotalSize) * 100;
};

const app = async () => {
	const fileContent = fs.readFileSync("links.json", "utf-8");
	urls = JSON.parse(fileContent).filter(isDirectory).filter(checkCompleted);

	// split urls into chunks to download parallel

	for (let i = 0; i < urls.length; i += chunkSize) {
		chunks.push(urls.slice(i, i + chunkSize));
	}

	let doneSize = 0;
	let count = 1;
	for (const chunk of chunks) {
		const promises = [];
		let totalSize = chunk.reduce((a, b) => a + b.size, 0);
		doneSize += totalSize;
		// console.log(
		// 	"process",
		// 	count++,
		// 	"of",
		// 	chunks.length,
		// 	"size chunk",
		// 	humanFileSize(totalSize),
		// 	"done",
		// 	humanFileSize(doneSize)
		// );

		// get key path distinct from all chunks in object then mkdir -p to create the directory
		const paths = chunk.map((data) => {
			const key = data.key;
			const path = key.split("/").slice(0, -1).join("/");
			return path;
		});
		const distinctPaths = [...new Set(paths)];
		for (const filePath of distinctPaths) {
			const downloadPath = path.join(__dirname, "downloads", filePath);
			fs.mkdirSync(downloadPath, { recursive: true });
		}

		let index = 0;
		for (const data of chunk) {
			const { key, signedUrl, size } = data;
			const filePath = path.join(__dirname, "downloads", key);
			const manager = new DownloadManager(signedUrl, filePath, index++);
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
		}
		await Promise.allSettled(promises);
	}
};

app();
setInterval(() => {
	console.clear();
	console.log("------", "remaining links", urls.length, "------");
	console.log("complete files", complete.count, "size", humanFileSize(complete.size));
	console.log("incomplete files", incomplete.count, "size", humanFileSize(incomplete.size));
	console.log(
		"progress",
		`${totalProgress.toFixed(2)}%`,
		"downloaded",
		humanFileSize(totalDownloadedSize),
		"total",
		humanFileSize(totalTotalSize),
		"=> parallel downloads",
		Object.keys(monitor).length
	);
}, 250); // 100 seconds * 1000 milliseconds/second
