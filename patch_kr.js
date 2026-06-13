const fs = require('fs');
let c = fs.readFileSync('video_renderer.js', 'utf8');
c = c.replace(/"Plus Jakarta Sans", "Noto Sans Devanagari"/g, '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"');
c = c.replace(/'Plus Jakarta Sans", "Noto Sans Devanagari'/g, '\'Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR\'');
fs.writeFileSync('video_renderer.js', c);
