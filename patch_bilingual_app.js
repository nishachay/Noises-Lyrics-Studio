const fs = require('fs');

let app = fs.readFileSync('public/app.js', 'utf8');

// Update precomputeWrappedLyrics in app.js
const appPrecomputeOld = `  const wrapped = lyrics.map(line => {
    const words = line.text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? \`\${cur} \${w}\` : w;
      if (ctx.measureText(t).width <= maxWidth) {
        cur = t;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return {
      time: line.time,
      text: line.text,
      wrapped: lines.length ? lines : [line.text]
    };
  });`;

const appPrecomputeNew = `  const wrapLine = (txt, fontStr) => {
    if (!txt) return [];
    ctx.font = fontStr;
    const words = txt.split(' ');
    const res = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? \`\${cur} \${w}\` : w;
      if (ctx.measureText(t).width <= maxWidth) {
        cur = t;
      } else {
        if (cur) res.push(cur);
        cur = w;
      }
    }
    if (cur) res.push(cur);
    return res.length ? res : [txt];
  };

  const wrapped = lyrics.map(line => {
    const wText = wrapLine(line.text, fontSpec);
    const transSz = activeSz * 0.75;
    const wTrans = line.translation ? wrapLine(line.translation, \`600 \${transSz}px \${FONT}, sans-serif\`) : [];
    return {
      time: line.time,
      text: line.text,
      translation: line.translation,
      wrapped: wText,
      wrappedTrans: wTrans
    };
  });`;

app = app.replace(appPrecomputeOld, appPrecomputeNew);

// Also need to update the `h` calculation!
const appHeightOld = `    const h = line.wrapped.length * lh;`;
const appHeightNew = `    let h = line.wrapped.length * lh;
    if (line.wrappedTrans && line.wrappedTrans.length) {
      h += line.wrappedTrans.length * (activeSz * 0.75 * 1.38) + (activeSz * 0.3); // add translation height + small gap
    }`;

app = app.replace(appHeightOld, appHeightNew);

// Update drawLyricLine in app.js
const appDrawOld = `  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.font = \`800 \${activeSz}px \${FONT}, sans-serif\`;

  const segments = line.wrapped;
  const totalH = segments.length * lh_act;
  const top = -totalH / 2;

  segments.forEach((seg, wi) => {
    const wy = top + wi * lh_act + activeSz * 0.5;

    // 1. Subtle white glow to bloom outward
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(seg, 0, wy);

    // 2. Crisp black drop shadow to maintain readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillText(seg, 0, wy);

    // 3. Solid text core
    ctx.shadowColor = 'transparent';
    ctx.fillText(seg, 0, wy);
  });`;

const appDrawNew = `  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';

  const segments = line.wrapped;
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
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, 0, y);

    ctx.shadowColor = 'transparent';
    ctx.fillText(text, 0, y);
  };

  let curY = top;
  segments.forEach((seg) => {
    curY += lh_act;
    const wy = curY - lh_act + activeSz * 0.5;
    drawTextWithShadows(seg, wy, \`800 \${activeSz}px \${FONT}, sans-serif\`, '#ffffff', 'rgba(255, 255, 255, 0.8)', 1.0);
  });

  if (transSegments.length > 0) {
    curY += transGap;
    transSegments.forEach((seg) => {
      curY += lhTrans;
      const wy = curY - lhTrans + transSz * 0.5;
      drawTextWithShadows(seg, wy, \`600 \${transSz}px \${FONT}, sans-serif\`, '#e2e8f0', 'rgba(255, 255, 255, 0.4)', 0.85);
    });
  }
  ctx.globalAlpha = opacity * layoutAlpha; // reset`;

app = app.replace(appDrawOld, appDrawNew);

fs.writeFileSync('public/app.js', app);
