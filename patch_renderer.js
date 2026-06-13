const fs = require('fs');

let file = fs.readFileSync('video_renderer.js', 'utf8');

// 1. Update precomputeWrappedLyrics
const precomputeOld = `function precomputeWrappedLyrics(ctx, lyrics, fontSpec, maxWidth, H) {
  const wrapped = lyrics.map(line => {
    ctx.font = fontSpec;
    const words  = line.text.split(' ');
    const wrappedLines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? \`\${cur} \${w}\` : w;
      if (ctx.measureText(t).width <= maxWidth) { cur = t; }
      else { if (cur) wrappedLines.push(cur); cur = w; }
    }
    if (cur) wrappedLines.push(cur);
    return { ...line, wrapped: wrappedLines.length ? wrappedLines : [line.text] };
  });

  const activeSz = Math.round(H * 0.055);
  const lh = activeSz * 1.38;
  const paraGap = activeSz * 0.8;

  let currentTop = 0;
  const precomputed = wrapped.map(line => {
    const h = line.wrapped.length * lh;
    const yTop = currentTop;
    const yCenter = currentTop + h / 2;
    currentTop += h + paraGap;
    return {
      ...line,
      h,
      yTop,
      yCenter
    };
  });`;

const precomputeNew = `function precomputeWrappedLyrics(ctx, lyrics, fontSpec, maxWidth, H) {
  const activeSz = Math.round(H * 0.055);
  const transSz = activeSz * 0.75;

  const wrapLine = (txt, fontStr) => {
    if (!txt) return [];
    ctx.font = fontStr;
    const words = txt.split(' ');
    const res = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? \`\${cur} \${w}\` : w;
      if (ctx.measureText(t).width <= maxWidth) { cur = t; }
      else { if (cur) res.push(cur); cur = w; }
    }
    if (cur) res.push(cur);
    return res.length ? res : [txt];
  };

  const wrapped = lyrics.map(line => {
    const wText = wrapLine(line.text, fontSpec);
    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', \`600 \${transSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`) : [];
    return { ...line, wrapped: wText, wrappedTrans: wTrans };
  });

  const lh = activeSz * 1.38;
  const lhTrans = transSz * 1.38;
  const transGap = activeSz * 0.3;
  const paraGap = activeSz * 0.8;

  let currentTop = 0;
  const precomputed = wrapped.map(line => {
    let h = line.wrapped.length * lh;
    if (line.wrappedTrans.length > 0) {
      h += transGap + (line.wrappedTrans.length * lhTrans);
    }
    const yTop = currentTop;
    const yCenter = currentTop + h / 2;
    currentTop += h + paraGap;
    return { ...line, h, yTop, yCenter };
  });`;

file = file.replace(precomputeOld, precomputeNew);

// 2. Update drawLyricsPanel active lyric drawing
// Search for "const segments = line.wrapped;"
const drawOld = `  const segments = line.wrapped;
  const totalH = segments.length * lh_act;
  const top = -totalH / 2;

  segments.forEach((seg, wi) => {
    const wy = (top + wi * lh_act + activeSz * 0.5) * scale;

    // 1. Subtle white glow to bloom outward
    // Tight 15px blur, but dense 0.8 alpha to bypass Skia culling
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(seg, 0, wy);

    // 2. Crisp black drop shadow to maintain readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillText(seg, 0, wy);

    // 3. Solid text core
    ctx.shadowColor = 'transparent';
    ctx.fillText(seg, 0, wy);
  });`;

const drawNew = `  const segments = line.wrapped;
  const transSegments = line.wrappedTrans || [];

  const transSz = activeSz * 0.75;
  const lhTrans = transSz * 1.38;
  const transGap = activeSz * 0.3;

  let totalH = segments.length * lh_act;
  if (transSegments.length > 0) {
    totalH += transGap + (transSegments.length * lhTrans);
  }
  const top = -totalH / 2;

  const drawTextWithShadows = (text, y, fontStr, primaryColor, glowColor, opacityMult) => {
    ctx.font = fontStr;
    ctx.globalAlpha = opacity * layoutAlpha * opacityMult;
    
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = primaryColor;
    ctx.fillText(text, 0, y);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillText(text, 0, y);

    ctx.shadowColor = 'transparent';
    ctx.fillText(text, 0, y);
  };

  let curY = top;
  segments.forEach((seg) => {
    curY += lh_act;
    const wy = (curY - lh_act + activeSz * 0.5) * scale;
    drawTextWithShadows(seg, wy, \`bold \${activeSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#ffffff', 'rgba(255, 255, 255, 0.8)', 1.0);
  });

  if (transSegments.length > 0) {
    curY += transGap;
    transSegments.forEach((seg) => {
      curY += lhTrans;
      const wy = (curY - lhTrans + transSz * 0.5) * scale;
      drawTextWithShadows(seg, wy, \`600 \${transSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`, '#e2e8f0', 'rgba(255, 255, 255, 0.4)', 0.85);
    });
  }`;

file = file.replace(drawOld, drawNew);

// 3. Update adjustedLyrics map to preserve translation
const adjustedOld = `      const adjustedLyrics = lyrics.map(l => ({
        time: parseFloat(l.time),
        text: l.text
      })).sort((a, b) => a.time - b.time);`;

const adjustedNew = `      const adjustedLyrics = lyrics.map(l => ({
        time: parseFloat(l.time),
        text: l.text,
        translation: l.translation
      })).sort((a, b) => a.time - b.time);`;

file = file.replace(adjustedOld, adjustedNew);

fs.writeFileSync('video_renderer.js', file);
