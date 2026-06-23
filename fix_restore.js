const fs = require('fs');
let code = fs.readFileSync('video_renderer.js', 'utf8');
code = code.replace('ctx.drawImage(line._renderCache, 0, 0, W, line._renderCache.height, (W - W * scale) / 2, (line._renderCache.height - line._renderCache.height * scale) / 2, W * scale, line._renderCache.height * scale);\n  ctx.restore();', 'ctx.drawImage(line._renderCache, 0, 0, W, line._renderCache.height, (W - W * scale) / 2, (line._renderCache.height - line._renderCache.height * scale) / 2, W * scale, line._renderCache.height * scale);\n  ctx.restore();\n  ctx.restore();');
fs.writeFileSync('video_renderer.js', code, 'utf8');
console.log('Fixed restore');
