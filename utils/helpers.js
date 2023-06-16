const readline = require("readline");

exports.rewriteLines = (lines) => {
	readline.moveCursor(process.stdout, 0, -lines.length);
	lines.forEach((line, i) => {
		readline.clearLine(process.stdout);
		readline.cursorTo(process.stdout, 0);
		console.log(line);
	});
};
