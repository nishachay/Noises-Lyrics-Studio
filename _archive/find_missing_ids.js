const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

const regex = /getElementById\(['"]([^'"]+)['"]\)|querySelector\(['"]#([^'"]+)['"]\)|const \w+ = \$\(['"]([^'"]+)['"]\)/g;
const ids = [...app.matchAll(regex)].map(m => m[1] || m[2] || m[3]).filter(Boolean);

const missing = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
console.log('Missing IDs:', missing);
