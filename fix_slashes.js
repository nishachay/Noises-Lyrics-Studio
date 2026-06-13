const fs = require('fs');
let text = fs.readFileSync('video_renderer.js', 'utf8');
text = text.replace(/\\\\`/g, '\`');
text = text.replace(/\\\\\\$/g, '$');
fs.writeFileSync('video_renderer.js', text);
console.log('fixed backslashes');
