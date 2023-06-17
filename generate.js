require("dotenv").config();
const inquirer = require("inquirer");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { humanFileSize } = require("./utils/helpers");

const {
	BUCKET_NAME,
	ACCESS_KEY_ID,
	SECRET_ACCESS_KEY,
	URL_EXPIRE_HOUR = 24,
	CHUNK_SIZE_GIGABYTE = 0,
	TEST = false,
} = process.env;

const testMode = TEST === "true";

if (!BUCKET_NAME || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !URL_EXPIRE_HOUR) {
	console.log("BUCKET_NAME, ACCESS_KEY_ID, SECRET_ACCESS_KEY is not set");
	process.exit(1);
}

const s3 = new AWS.S3({
	accessKeyId: ACCESS_KEY_ID,
	secretAccessKey: SECRET_ACCESS_KEY,
});

const bucketName = BUCKET_NAME;
const urlExpirationMinutes = 60 * parseInt(URL_EXPIRE_HOUR); // Set URL expiry time in minutes

const listBucketObjects = async () => {
	let isTruncated = true;
	let marker;
	let contents = [];
	while (isTruncated) {
		let params = { Bucket: bucketName };
		if (marker) params.ContinuationToken = marker;

		try {
			const data = await s3.listObjectsV2(params).promise();
			contents = [...contents, ...data.Contents];
			// print on same line the status of number of files processed
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			process.stdout.write(`number of files detected ${contents.length} ...`);
			//? for testing purpose
			if (testMode && contents.length > 3000) {
				isTruncated = false;
				continue;
			}
			isTruncated = data.IsTruncated;
			marker = data.NextContinuationToken;
		} catch (err) {
			console.log(err);
		}
	}

	return contents;
};

const generateSignedUrl = async (key) => {
	const params = {
		Bucket: bucketName,
		Key: key,
		Expires: urlExpirationMinutes * 60, // convert minutes to seconds
	};

	try {
		const url = await s3.getSignedUrlPromise("getObject", params);
		return url;
	} catch (err) {
		console.log(err);
	}
};

const run = async () => {
	const bucketObjects = await listBucketObjects();

	console.log(`\n\ntotal number of files detected ${bucketObjects.length}`);
	const files = [];
	for (const object of bucketObjects) {
		const signedUrl = await generateSignedUrl(object.Key);
		const file = {
			bucket: BUCKET_NAME,
			key: object.Key,
			size: object.Size,
			signedUrl: signedUrl,
			LastModified: object.LastModified,
		};
		files.push(file);
	}

	// list of directories in the bucket first level only
	const directories = {};
	for (const file of files) {
		const key = file.key;
		// get first level directory
		const path = key.split("/")[0];
		if (directories[path]) {
			directories[path].count += 1;
			directories[path].size += file.size;
		} else {
			directories[path] = { count: 1, size: file.size };
		}
	}

	// use inquirer to select multiple directories
	const choices = Object.keys(directories).map((directory) => {
		const { count, size } = directories[directory];
		return {
			name: `${directory} (${count} files, ${humanFileSize(size)})`,
			value: directory,
		};
	});

	const { directory } = await inquirer.prompt([
		{
			type: "checkbox",
			name: "directory",
			message: "Select directories to download",
			choices,
			validate: function (answer) {
				if (answer.length < 1) {
					return "You must choose at least one directory.";
				}
				return true;
			},
		},
	]);

	// filter files based on selected directories
	const filteredFiles = files.filter((file) => {
		const key = file.key;
		const path = key.split("/")[0];
		return directory.includes(path);
	});

	// list of all directories selected and number of files in each directory
	const selectedDirectories = {};
	for (const file of filteredFiles) {
		const key = file.key;
		// get first level directory
		const path = key.split("/")[0];
		if (selectedDirectories[path]) {
			selectedDirectories[path].count += 1;
			selectedDirectories[path].size += file.size;
		} else {
			selectedDirectories[path] = { count: 1, size: file.size };
		}
	}

	console.log(`\n\n------ selected directories (${Object.keys(selectedDirectories).length}) ------`);
	for (const directory in selectedDirectories) {
		const { count, size } = selectedDirectories[directory];
		console.log(`${directory} (${count} files, ${humanFileSize(size)})`);
	}

	const chunkSizeGigaByte = parseInt(CHUNK_SIZE_GIGABYTE || 0);
	if (chunkSizeGigaByte > 0) {
		// split files into multiple chunks and size of each chunk based on the size of the files less than 400GB
		const chunkSize = Math.round(chunkSizeGigaByte * 1024 * 1024 * 1024);
		const chunks = [];
		let chunk = { size: 0, files: [] };
		for (const file of filteredFiles) {
			if (chunk.size + file.size > chunkSize) {
				chunks.push(chunk);
				chunk = { size: 0, files: [] };
			}
			chunk.size += file.size;
			chunk.files.push(file);
		}
		chunks.push(chunk);
		// write to links.json
		fs.writeFileSync("links.json", JSON.stringify(chunks, null, 2));
	} else {
		// write to links.json
		fs.writeFileSync("links.json", JSON.stringify(filteredFiles, null, 2));
	}
};

run();
