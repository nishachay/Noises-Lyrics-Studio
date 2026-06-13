const fs = require('fs');

function patchFile(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  // 1. Update Active Lyric Size Base
  // from: Math.min(Math.round(H * 0.058), 64);
  // to:   Math.min(Math.round(H * 0.065), 72);
  code = code.replace(/Math\.min\(Math\.round\(H \* 0\.058\), 64\)/g, 'Math.min(Math.round(H * 0.065), 72)');
  
  // 2. Update Translation Size Ratio
  // from: const transSz = activeSz * 0.75;
  // to:   const transSz = activeSz * 0.60;
  code = code.replace(/const transSz = activeSz \* 0\.75;/g, 'const transSz = activeSz * 0.60;');

  // 3. Update Colors for Translations
  // In app.js:
  // drawTextWithShadows(seg, wy, \`600 \${transSz}px \${FONT}, sans-serif\`, '#e2e8f0', 'rgba(255, 255, 255, 0.4)', 0.85);
  // to:
  // drawTextWithShadows(seg, wy, \`600 \${transSz}px \${FONT}, sans-serif\`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.95);
  
  // In app.js
  code = code.replace(
    /drawTextWithShadows\(seg, wy, `600 \${transSz}px \${FONT}, sans-serif`, '#e2e8f0', 'rgba\(255, 255, 255, 0\.4\)', 0\.85\);/g,
    "drawTextWithShadows(seg, wy, `600 ${transSz}px ${FONT}, sans-serif`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.90);"
  );

  // In video_renderer.js:
  // drawTextWithShadows(seg, wy, \`600 \${transSz \* scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#e2e8f0', 'rgba(255, 255, 255, 0.4)', 0.85);
  // to:
  // drawTextWithShadows(seg, wy, \`600 \${transSz \* scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.90);
  
  code = code.replace(
    /drawTextWithShadows\(seg, wy, `600 \${transSz \* scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#e2e8f0', 'rgba\(255, 255, 255, 0\.4\)', 0\.85\);/g,
    "drawTextWithShadows(seg, wy, `600 ${transSz * scale}px \"Plus Jakarta Sans\", \"Noto Sans Devanagari\", \"Noto Sans KR\"`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.90);"
  );

  fs.writeFileSync(filepath, code);
  console.log('Patched', filepath);
}

patchFile('public/app.js');
patchFile('video_renderer.js');
