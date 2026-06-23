const fs = require("fs");
let code = fs.readFileSync("video_renderer.js", "utf8");

// Replace the broken block lines 46-59 (the garbled leftover old vignette code)
const broken = `// \u2500\u2500 Pre-baked noise canvas for film grain \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const g  = vc.createRadialGradient(240, 135, 50, 240, 135, 280);
    g.addColorStop(0,    'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    g.addColorStop(0.80, 'rgba(0,0,0,0.22)');
    g.addColorStop(1,    'rgba(0,0,0,0.70)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, 480, 270);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(_vig, 0, 0, w, h);
  ctx.restore();
}`;

const fixed = `// \u2500\u2500 Pre-baked noise canvas for film grain \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _noise = null;
function getNoiseCanvas() {
  if (_noise) return _noise;
  _noise = createCanvas(128, 128);
  const ctx = _noise.getContext('2d');
  const d   = ctx.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 8;
  }
  ctx.putImageData(d, 0, 0);
  return _noise;
}

// \u2500\u2500 Globals \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _blurCanvas = null;
let _blobCanvas = null;
let _blobCtx = null;
let _leftLayoutCache = null;
let _albumPanelCache = null;
let _introCache = null;

// \u2500\u2500 Vignette matches preview exactly (dynamic radial gradient) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function drawVignette(ctx, w, h) {
  const vig = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}`;

if (code.includes(broken)) {
  code = code.replace(broken, fixed);
  fs.writeFileSync("video_renderer.js", code, "utf8");
  console.log("Fixed top section");
} else {
  console.log("Broken pattern not found, writing by lines");
  const lines = code.split("\n");
  // Find and replace lines 46-59 (index 45-58)
  const newLines = [
    ...lines.slice(0, 45),
    "let _noise = null;",
    "function getNoiseCanvas() {",
    "  if (_noise) return _noise;",
    "  _noise = createCanvas(128, 128);",
    "  const ctx = _noise.getContext('2d');",
    "  const d   = ctx.createImageData(128, 128);",
    "  for (let i = 0; i < d.data.length; i += 4) {",
    "    const v = Math.floor(Math.random() * 255);",
    "    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;",
    "    d.data[i + 3] = 8;",
    "  }",
    "  ctx.putImageData(d, 0, 0);",
    "  return _noise;",
    "}",
    "",
    "let _blurCanvas = null;",
    "let _blobCanvas = null;",
    "let _blobCtx = null;",
    "let _leftLayoutCache = null;",
    "let _albumPanelCache = null;",
    "let _introCache = null;",
    "",
    "function drawVignette(ctx, w, h) {",
    "  const vig = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.9);",
    "  vig.addColorStop(0, 'rgba(0,0,0,0)');",
    "  vig.addColorStop(1, 'rgba(0,0,0,0.4)');",
    "  ctx.fillStyle = vig;",
    "  ctx.fillRect(0, 0, w, h);",
    "}",
    ...lines.slice(59)
  ];
  fs.writeFileSync("video_renderer.js", newLines.join("\n"), "utf8");
  console.log("Fixed top section via line splice");
}
