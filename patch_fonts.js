const fs = require('fs');

let content = fs.readFileSync('video_renderer.js', 'utf8');

// Replace "Plus Jakarta Sans" with "Plus Jakarta Sans", "Noto Sans Devanagari" only where it's part of a font string
content = content.replace(/px "Plus Jakarta Sans"/g, 'px "Plus Jakarta Sans", "Noto Sans Devanagari"');

// Also fix the FONT constant
content = content.replace(/const FONT = 'Plus Jakarta Sans';/g, 'const FONT = \'Plus Jakarta Sans", "Noto Sans Devanagari\';');

fs.writeFileSync('video_renderer.js', content);
console.log('Fonts patched successfully!');
