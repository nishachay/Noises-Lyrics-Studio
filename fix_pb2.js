const fs = require("fs");
let lines = fs.readFileSync("video_renderer.js", "utf8").split("\n");

// Find and remove drawProgressBar in renderer (lines 579-596)
const start = lines.findIndex(l => l.includes("// \u2500\u2500 Draw progress bar (bottom)"));
const end = lines.findIndex((l, i) => i > start && l.trim() === "}");
console.log("Found progress bar at lines", start+1, "to", end+1);
console.log("Start line:", lines[start]);
console.log("End line:", lines[end]);
lines.splice(start, end - start + 2); // +2 for the blank line after
fs.writeFileSync("video_renderer.js", lines.join("\n"), "utf8");
console.log("Removed progress bar from video_renderer.js");
