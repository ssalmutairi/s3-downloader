const axios = require("axios");
const fs = require("fs");
const EventEmitter = require("events");

class DownloadManager extends EventEmitter {
	constructor(downloadUrl, filePath, id) {
		super(); // call the EventEmitter constructor
		this.downloadUrl = downloadUrl;
		this.filePath = filePath;
		this.id = id;
	}

	async download() {
		const writer = fs.createWriteStream(this.filePath, { flags: "a" });
		const fileInfo = fs.existsSync(this.filePath) ? fs.statSync(this.filePath) : null;

		const headers = {};
		if (fileInfo && fileInfo.size > 0) {
			headers.Range = `bytes=${fileInfo.size}-`;
			// log the http header key Content-Range
			// console.log(headers);
		}

		const response = await axios({
			url: this.downloadUrl,
			method: "GET",
			responseType: "stream",
			headers,
		});

		const totalSize = response.headers["content-length"];
		let downloadedSize = 0;

		response.data.on("data", (chunk) => {
			downloadedSize += chunk.length;
			let progress = (downloadedSize / totalSize) * 100;
			this.emit("progress", { id: this.id, progress, totalSize: parseInt(totalSize), downloadedSize });
		});

		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on("finish", resolve);
			writer.on("error", reject);
		});
	}
}

module.exports = DownloadManager;
