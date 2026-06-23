const fs = require("fs");
let lines = fs.readFileSync("video_renderer.js", "utf8").split("\n");

// Find the line with "ctx.textBaseline = 'top';" inside outro block (around line 1093)
// and replace from there to "if (fi % FPS" with the correct outro + progressBar + watermark + grain
const startMarker = "          ctx.fillStyle = '#ffffff';";
const endMarker = "        if (fi % FPS === 0 || fi === TOTAL_FRAMES - 1) {";

let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === "ctx.fillStyle = '#ffffff';" && startIdx === -1) startIdx = i;
  if (lines[i].includes("if (fi % FPS === 0 || fi === TOTAL_FRAMES - 1)") && endIdx === -1) endIdx = i;
}

console.log("startIdx:", startIdx, "endIdx:", endIdx);

if (startIdx === -1 || endIdx === -1) {
  console.log("Could not find markers");
  process.exit(1);
}

const replacement = [
  "          ctx.fillStyle = '#ffffff';",
  "          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';",
  "          ctx.shadowBlur = 4;",
  "          ctx.font = `bold ${titleSz}px \"Plus Jakarta Sans\", \"Noto Sans Devanagari\", \"Noto Sans KR\"`;",
  "          ctx.fillText('THANKS FOR WATCHING', W / 2, ay);",
  "          ",
  "          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';",
  "          ctx.font = `${artistSz}px \"Plus Jakarta Sans\", \"Noto Sans Devanagari\", \"Noto Sans KR\"`;",
  "          ctx.fillText('LIKE, SHARE & SUBSCRIBE', W / 2, ay + titleSz + gap);",
  "",
  "          ctx.restore();",
  "        }",
  "",
  "        // Progress bar (matches preview exactly)",
  "        drawProgressBar(ctx, W, H, songTime, duration);",
  "",
  "        // Draw floating logo watermark everywhere!",
  "        drawWatermark(ctx, W, H, now, logoImg);",
  "",
  "        // Film grain every frame",
  "        const nc  = getNoiseCanvas();",
  "        const pat = ctx.createPattern(nc, 'repeat');",
  "        ctx.save();",
  "        ctx.fillStyle = pat;",
  "        const ox = Math.floor(Math.random() * 128);",
  "        const oy = Math.floor(Math.random() * 128);",
  "        ctx.translate(ox, oy);",
  "        ctx.fillRect(-ox, -oy, W, H);",
  "        ctx.restore();",
  "",
  "        await writeFrame(canvas.data());",
  "",
  "        // Report progress every second",
  "        if (fi % FPS === 0 || fi === TOTAL_FRAMES - 1) {"
];

lines.splice(startIdx, endIdx - startIdx + 1, ...replacement);
fs.writeFileSync("video_renderer.js", lines.join("\n"), "utf8");
console.log("Fixed render loop - wrote", lines.length, "lines");
