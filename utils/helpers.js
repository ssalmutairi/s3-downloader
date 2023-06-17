const readline = require("readline");

exports.rewriteLines = (lines) => {
	readline.moveCursor(process.stdout, 0, -lines.length);
	lines.forEach((line, i) => {
		readline.clearLine(process.stdout);
		readline.cursorTo(process.stdout, 0);
		console.log(line);
	});
};

exports.humanFileSize = (bytes, dp = 1) => {
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
