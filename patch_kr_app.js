const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');
c = c.replace(/'"Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif'/g, '\'"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR", sans-serif\'');
fs.writeFileSync('public/app.js', c);
