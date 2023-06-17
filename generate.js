require("dotenv").config();
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

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
			if (testMode) {
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

	console.log("\n\n generating signed urls ... of total files", bucketObjects.length, "\n\n");
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

	// sort by LastModified to oldest first
	files.sort((a, b) => a.LastModified - b.LastModified);

	const chunkSizeGigaByte = parseInt(CHUNK_SIZE_GIGABYTE || 0);
	if (chunkSizeGigaByte > 0) {
		// split files into multiple chunks and size of each chunk based on the size of the files less than 400GB
		const chunkSize = Math.round(chunkSizeGigaByte * 1024 * 1024 * 1024);
		const chunks = [];
		let chunk = { size: 0, files: [] };
		for (const file of files) {
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
		fs.writeFileSync("links.json", JSON.stringify(files, null, 2));
	}
};

run();
