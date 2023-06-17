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

	getId() {
		return this.id;
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
		let previousSize = 0;
		let previousTime = Date.now();
		let speed = 0;
		let intervalId = setInterval(() => {
			let currentTime = Date.now();
			let timeDifference = (currentTime - previousTime) / 1000; // in seconds
			let sizeDifference = downloadedSize - previousSize; // in bytes

			// speed in bytes per second (B/s). You can convert it to KB/s or MB/s if you want.
			speed = sizeDifference / timeDifference;

			previousSize = downloadedSize;
			previousTime = currentTime;
		}, 1000); // update speed every second

		response.data.on("data", (chunk) => {
			downloadedSize += chunk.length;
			let progress = (downloadedSize / totalSize) * 100;
			this.emit("progress", { id: this.id, progress, totalSize: parseInt(totalSize), downloadedSize, speed });
		});

		response.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer.on("finish", () => {
				clearInterval(intervalId); // Stop interval when download is complete
				// this.emit("finish", { id: this.id, totalSize: parseInt(totalSize), downloadedSize });
				resolve();
			});
			writer.on("error", () => {
				clearInterval(intervalId); // Stop interval when download is complete
				// this.emit("error", { id: this.id, totalSize: parseInt(totalSize), downloadedSize });
				reject();
			});
		});
	}
}

module.exports = DownloadManager;
