const fs = require('fs');

const file = 'video_renderer.js';
let lines = fs.readFileSync(file, 'utf8').split('\n');

function spliceBetween(startStr, endStr, newLines) {
  const startIdx = lines.findIndex(l => l.includes(startStr));
  if (startIdx === -1) return false;
  
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes(endStr));
  if (endIdx === -1) return false;

  lines.splice(startIdx, endIdx - startIdx, ...newLines);
  return true;
}

// 1. Top level
let blobIdx = lines.findIndex(l => l.includes('let _blobCtx = null;'));
if (blobIdx !== -1 && !lines[blobIdx+1].includes('_leftLayoutCache')) {
  lines.splice(blobIdx + 1, 0, 'let _leftLayoutCache = null;', 'let _albumPanelCache = null;', 'let _introCache = null;');
}

let blurIdx = lines.findIndex(l => l.includes('_blurCanvas = null;'));
if (blurIdx !== -1 && !lines[blurIdx+1].includes('_leftLayoutCache')) {
  lines.splice(blurIdx + 1, 0, '      _leftLayoutCache = null;', '      _albumPanelCache = null;', '      _introCache = null;');
}

// 4. Intro Text (Doing bottom-up or just using spliceBetween)
spliceBetween('// Fade in Intro Text', '// ── PLAYBACK', `          // Fade in Intro Text
          if (!_introCache) {
            _introCache = createCanvas(W, H);
            const cctx = _introCache.getContext('2d');
            const titleSz = Math.round(H * 0.08);
            const artistSz = Math.round(H * 0.038);
            const artSz = Math.round(H * 0.55);

            cctx.save();
            const totalH = artSz + 40 + titleSz + 15 + artistSz;

            const ax = Math.round((W - artSz) / 2);
            const ay = Math.round((H - totalH) / 2);
            const radius = Math.round(artSz * 0.06);

            if (coverImg) {
              cctx.save();
              cctx.imageSmoothingEnabled = true;
              cctx.imageSmoothingQuality = 'high';
              cctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
              cctx.shadowBlur = 40;
              cctx.shadowOffsetY = 12;
              
              cctx.beginPath();
              cctx.roundRect(ax, ay, artSz, artSz, radius);
              cctx.clip();
              cctx.drawImage(coverImg, ax, ay, artSz, artSz);
              cctx.restore();

              cctx.save();
              cctx.beginPath();
              cctx.roundRect(ax, ay, artSz, artSz, radius);
              cctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
              cctx.lineWidth = 1.5;
              cctx.stroke();
              cctx.restore();
            } else {
              cctx.save();
              cctx.fillStyle = '#111115';
              cctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
              cctx.shadowBlur = 40;
              cctx.beginPath();
              cctx.roundRect(ax, ay, artSz, artSz, radius);
              cctx.fill();
              cctx.restore();
            }

            const titleY = ay + artSz + 30;

            cctx.font = \`bold \${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
            cctx.textAlign = 'center';
            cctx.textBaseline = 'top';
            cctx.fillStyle = '#ffffff';
            cctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            cctx.shadowBlur = 4;
            cctx.fillText(songTitle, W / 2, titleY);

            cctx.font = \`\${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
            cctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            cctx.fillText(songArtist, W / 2, titleY + titleSz + 10);
            cctx.restore();
          }
          ctx.drawImage(_introCache, 0, 0);
          ctx.restore();

        `.split('\n'));


// 5. Lyrics Loop
spliceBetween('  const drawTextWithShadows = (text,', '// ΓöÇΓöÇ Watermark', `  if (!line._renderCache) {
    line._renderCache = createCanvas(W, totalH + 100);
    const cctx = line._renderCache.getContext('2d');
    const ccy = line._renderCache.height / 2;
    const ccx = W / 2;

    const drawShadowText = (text, y, fontStr, primaryColor, glowColor) => {
      cctx.font = fontStr;
      cctx.textAlign = textAlign;
      cctx.textBaseline = 'middle';
      
      cctx.shadowColor = glowColor;
      cctx.shadowBlur = 15;
      cctx.shadowOffsetY = 0;
      cctx.fillStyle = primaryColor;
      cctx.fillText(text, ccx, y);

      cctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      cctx.shadowBlur = 10;
      cctx.shadowOffsetY = 2;
      cctx.fillText(text, ccx, y);

      cctx.shadowColor = 'transparent';
      cctx.fillText(text, ccx, y);
    };

    let curY = ccy + top;
    segments.forEach((seg) => {
      curY += lh_act;
      drawShadowText(seg, curY - lh_act + activeSz * 0.5, \`bold \${activeSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#ffffff', 'rgba(255, 255, 255, 0.8)');
    });

    if (transSegments.length > 0) {
      curY += transGap;
      transSegments.forEach((seg) => {
        curY += lhTrans;
        drawShadowText(seg, curY - lhTrans + transSz * 0.5, \`600 \${transSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#ffffff', 'rgba(255, 255, 255, 0.6)');
      });
    }
  }

  ctx.save();
  ctx.globalAlpha = opacity * layoutAlpha;
  ctx.translate(-W/2, -line._renderCache.height / 2);
  ctx.drawImage(line._renderCache, 0, 0, W, line._renderCache.height, (W - W * scale) / 2, (line._renderCache.height - line._renderCache.height * scale) / 2, W * scale, line._renderCache.height * scale);
  ctx.restore();
}

`.split('\n'));


// 3. Album Panel
spliceBetween('function drawAlbumPanel(', '// ΓöÇΓöÇ Scrolling Lyrics Panel', `function drawAlbumPanel(ctx, img, title, artist, W, H, font, songTime, duration) {
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, duration - songTime));
  if (layoutAlpha <= 0) return;

  if (!_albumPanelCache) {
    _albumPanelCache = createCanvas(W, H);
    const cctx = _albumPanelCache.getContext('2d');
    const margin = Math.round(Math.min(W, H) * 0.05);
    const artSz  = Math.round(Math.min(W, H) * 0.095);
    const ax = margin, ay = margin;
    const radius = Math.round(artSz * 0.16);

    if (img) {
      cctx.save();
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = 'high';
      cctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      cctx.shadowBlur = Math.round(artSz * 0.25);
      cctx.shadowOffsetY = Math.round(artSz * 0.1);
      
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, radius);
      cctx.clip();
      cctx.drawImage(img, ax, ay, artSz, artSz);
      cctx.restore();

      cctx.save();
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, radius);
      cctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      cctx.lineWidth = 1;
      cctx.stroke();
      cctx.restore();
    } else {
      cctx.save();
      cctx.fillStyle = '#111115';
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, radius);
      cctx.fill();
      cctx.restore();
    }

    const tx = ax + artSz + Math.round(artSz * 0.28);
    const tSz = Math.round(artSz * 0.32);
    const aSz = Math.round(tSz * 0.72);
    const gap = Math.round(tSz * 0.28);
    
    const totalTextH = tSz + gap + aSz;
    const textCenterY = ay + artSz / 2;
    const titleY = textCenterY - (totalTextH / 2) + (tSz / 2);
    const artistY = titleY + (tSz / 2) + gap + (aSz / 2);

    cctx.save();
    cctx.shadowBlur = 0;
    cctx.textAlign = 'left';
    cctx.textBaseline = 'middle';

    cctx.font = \`bold \${tSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    cctx.fillText(title, tx, titleY);

    cctx.font = \`\${aSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    cctx.fillText(artist, tx, artistY);
    cctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = layoutAlpha;
  ctx.drawImage(_albumPanelCache, 0, 0);
  ctx.restore();
}

`.split('\n'));


// 2. Left Split Layout
spliceBetween('function drawLeftSplitLayout(', '// ΓöÇΓöÇ Album art + song info panel', `function drawLeftSplitLayout(ctx, coverImg, title, artist, W, H, songTime, duration, font) {
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, duration - songTime));
  if (layoutAlpha <= 0) return;

  if (!_leftLayoutCache) {
    _leftLayoutCache = createCanvas(W, H);
    const cctx = _leftLayoutCache.getContext('2d');
    const artSz = Math.round(H * 0.52);
    const ax = Math.round(W * 0.225 - artSz / 2);
    const ay = Math.round(H * 0.36 - artSz / 2);

    if (coverImg) {
      cctx.save();
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = 'high';
      cctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      cctx.shadowBlur = 40;
      cctx.shadowOffsetY = 12;
      
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
      cctx.clip();
      cctx.drawImage(coverImg, ax, ay, artSz, artSz);
      cctx.restore();

      cctx.save();
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
      cctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      cctx.lineWidth = 1.5;
      cctx.stroke();
      cctx.restore();
    } else {
      cctx.save();
      cctx.fillStyle = '#111115';
      cctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      cctx.shadowBlur = 40;
      cctx.beginPath();
      cctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
      cctx.fill();
      cctx.restore();
    }

    const textX = Math.round(W * 0.225);
    const titleY = ay + artSz + 36;
    const titleSz = Math.round(H * 0.042);
    const artistSz = Math.round(titleSz * 0.68);

    cctx.save();
    cctx.font = \`bold \${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'top';
    cctx.fillStyle = '#ffffff';
    cctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    cctx.shadowBlur = 4;
    cctx.fillText(title, textX, titleY);

    cctx.font = \`600 \${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    cctx.fillText(artist, textX, titleY + titleSz + 8);
    cctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = layoutAlpha;
  ctx.drawImage(_leftLayoutCache, 0, 0);
  ctx.restore();
}

`.split('\n'));


fs.writeFileSync(file, lines.join('\n'));
console.log('Final reliable patch successful');
