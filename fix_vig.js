const fs = require("fs");
let code = fs.readFileSync("video_renderer.js", "utf8");

const replacement = `// -- Animated background (blurred album art + colour blobs) --
function drawBackground(ctx, w, h, coverImg, colors, time, amp) {
  if (_blurCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    
    const dw = Math.max(w, h) * 1.5;
    
    // Base layer
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.scale(1.2, 1.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 1 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.sin(time * 0.15) * w * 0.3, h/2 + Math.cos(time * 0.18) * h * 0.3);
    ctx.rotate(time * 0.05);
    ctx.scale(1.8, 1.8);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 2 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.cos(time * 0.16) * w * 0.4, h/2 + Math.sin(time * 0.2) * h * 0.4);
    ctx.rotate(-time * 0.06);
    ctx.scale(2.2, 2.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();
    
    ctx.restore();
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
  }

  // Smart darkening overlay for readability
  let baseAlpha = 0.4;
  if (colors) {
    const getLuma = (c) => 0.299*c[0] + 0.587*c[1] + 0.114*c[2];
    const avgLuma = (getLuma(colors.tl) + getLuma(colors.tr) + getLuma(colors.bl) + getLuma(colors.br) + getLuma(colors.c)) / 5;
    if (avgLuma > 100) {
      baseAlpha += Math.min(0.35, ((avgLuma - 100) / 155) * 0.35);
    }
  }

  ctx.fillStyle = "rgba(0,0,0," + baseAlpha.toFixed(2) + ")";
  ctx.fillRect(0, 0, w, h);

  // EXACT MATCH WITH PREVIEW VIGNETTE LOGIC:
  const vig = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.9);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)"); // Slightly stronger to compensate for encoding
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}
`;

code = code.replace(/function drawVignette[\s\S]*?\}\s*\n\s*\/\/ [^\n]*Animated background[\s\S]*?drawVignette\(ctx, w, h\);\n\}/, replacement);

fs.writeFileSync("video_renderer.js", code, "utf8");
console.log("Fixed background drawing");
