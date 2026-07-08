const fs = require('fs');
let code = fs.readFileSync('video_renderer.js', 'utf8');

const oldDrawBackground = code.substring(
  code.indexOf('function drawBackground('),
  code.indexOf('function drawInterludeDots(')
);

const newDrawBackground = \unction drawBackground(ctx, w, h, coverImg, colors, time, amp) {
  if (_blurCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    const dw = Math.max(w, h) * 1.5;
    
    // Base layer
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.scale(1.2, 1.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 1 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.sin(time * 0.15) * w * 0.3, h/2 + Math.cos(time * 0.18) * h * 0.3);
    ctx.rotate(time * 0.05);
    ctx.scale(1.8, 1.8);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 2 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.cos(time * 0.16) * w * 0.4, h/2 + Math.sin(time * 0.2) * h * 0.4);
    ctx.rotate(-time * 0.06);
    ctx.scale(2.2, 2.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();
    
    ctx.restore();
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
  }

  // First principles dynamic darkening overlay
  let baseAlpha = 0.55; 
  if (colors) {
    if (colors.avgBrightness > 60) {
      // Scale alpha up to 0.85 aggressively based on brightness
      baseAlpha += Math.min(0.30, ((colors.avgBrightness - 60) / 140) * 0.30);
    }
  }

  ctx.fillStyle = \\\gba(0,0,0,\)\\\;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette drawn under text overlays
  drawVignette(ctx, w, h);
}
\;

code = code.replace(oldDrawBackground, newDrawBackground);
fs.writeFileSync('video_renderer.js', code);
