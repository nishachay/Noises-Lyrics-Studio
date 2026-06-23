const fs = require("fs");
let lines = fs.readFileSync("public/app.js", "utf8").split("\n");

// Remove lines 552-568 (progress bar function + comment, 0-indexed: 551-567)
// Verify what is there first
console.log("Line 552:", lines[551]);
console.log("Line 568:", lines[567]);

// Remove 16 lines starting at index 551 (line 552)
lines.splice(551, 17);
fs.writeFileSync("public/app.js", lines.join("\n"), "utf8");
console.log("Removed progress bar from app.js");
