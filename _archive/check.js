const fs = require('fs'); 
const app = fs.readFileSync('public/app.js', 'utf8'); 
const vr = fs.readFileSync('video_renderer.js', 'utf8'); 
function getStrings(s) { 
  let res=[]; 
  let match; 
  const r=/(['"`])(.*?)\1/g; 
  while(match=r.exec(s)){ 
    if(match[2].includes('Γ')) res.push(match[0]); 
  } 
  return res; 
} 
console.log('app.js:', getStrings(app)); 
console.log('vr.js:', getStrings(vr));
