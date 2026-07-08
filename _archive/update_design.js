const fs = require('fs');
let vr = fs.readFileSync('video_renderer.js', 'utf8');
vr = vr.replace('const titleSz = Math.round(H * 0.090);', 'const titleSz = Math.round(H * 0.095);');
vr = vr.replace('const artistSz = Math.round(H * 0.040);', 'const artistSz = Math.round(H * 0.048);');
vr = vr.replace('ctx.font = `${artistSz}px "Plus Jakarta Sans"', 'ctx.font = `600 ${artistSz}px "Plus Jakarta Sans"');
vr = vr.replace("ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';", "ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';");
fs.writeFileSync('video_renderer.js', vr, 'utf8');

let app = fs.readFileSync('public/app.js', 'utf8');
app = app.replace(/ctx\.font = \`500 \$\{artistSz\}px/g, 'ctx.font = `600 ${artistSz}px');
app = app.replace(/ctx\.fillStyle = 'rgba\(255, 255, 255, 0\.55\)';/g, "ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';");
app = app.replace(/ctx\.fillStyle = 'rgba\(255, 255, 255, 0\.65\)';/g, "ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';");
fs.writeFileSync('public/app.js', app, 'utf8');
console.log('Done');
