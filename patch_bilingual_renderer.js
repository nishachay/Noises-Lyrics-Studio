const fs = require('fs');

let renderer = fs.readFileSync('video_renderer.js', 'utf8');

const rendererPrecomputeOld = `function precomputeWrappedLyrics(ctx, lyrics, fontStr, maxWidth, H) {
  ctx.save();
  ctx.font = fontStr;

  const wrapped = lyrics.map(line => {
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
  });
  ctx.restore();

  const lh = parseFloat(fontStr.match(/\\d+px/)[0]) * 1.38;
  const paraGap = parseFloat(fontStr.match(/\\d+px/)[0]) * 0.8;

  let currentTop = 0;
  const precomputed = wrapped.map(line => {
    const h = line.wrapped.length * lh;
    const yTop = currentTop;
    const yCenter = currentTop + h / 2;
    currentTop += h + paraGap;
    return { ...line, h, yTop, yCenter };
  });`;

const rendererPrecomputeNew = `function precomputeWrappedLyrics(ctx, lyrics, fontStr, maxWidth, H) {
  const FONT = '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"';
  ctx.save();

  const wrapLine = (txt, fStr) => {
    if (!txt) return [];
    ctx.font = fStr;
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

  const activeSz = parseFloat(fontStr.match(/\\d+px/)[0]);

  const wrapped = lyrics.map(line => {
    const wText = wrapLine(line.text, fontStr);
    const transSz = activeSz * 0.75;
    const wTrans = line.translation ? wrapLine(line.translation, \`600 \${transSz}px \${FONT}\`) : [];
    return {
      time: line.time,
      text: line.text,
      translation: line.translation,
      wrapped: wText,
      wrappedTrans: wTrans
    };
  });
  ctx.restore();

  const lh = activeSz * 1.38;
  const paraGap = activeSz * 0.8;

  let currentTop = 0;
  const precomputed = wrapped.map(line => {
    let h = line.wrapped.length * lh;
    if (line.wrappedTrans && line.wrappedTrans.length) {
      h += line.wrappedTrans.length * (activeSz * 0.75 * 1.38) + (activeSz * 0.3);
    }
    const yTop = currentTop;
    const yCenter = currentTop + h / 2;
    currentTop += h + paraGap;
    return { ...line, h, yTop, yCenter };
  });`;

renderer = renderer.replace(rendererPrecomputeOld, rendererPrecomputeNew);

const rendererDrawOld = `          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = \`bold \${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;

          const segments = line.wrapped;
          const totalH = segments.length * lh_act;
          const top = -totalH / 2;

          segments.forEach((seg, wi) => {
            const wy = top + wi * lh_act + ACT_SZ * 0.5;

            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(seg, 0, wy);

            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;
            ctx.fillText(seg, 0, wy);

            ctx.shadowColor = 'transparent';
            ctx.fillText(seg, 0, wy);
          });`;

const rendererDrawNew = `          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const segments = line.wrapped;
          const transSegments = line.wrappedTrans || [];
          
          const transSz = ACT_SZ * 0.75;
          const lhTrans = transSz * 1.38;
          const transGap = ACT_SZ * 0.3;
          
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

          const FONT = '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"';

          let curY = top;
          segments.forEach((seg) => {
            curY += lh_act;
            const wy = curY - lh_act + ACT_SZ * 0.5;
            drawTextWithShadows(seg, wy, \`bold \${ACT_SZ}px \${FONT}\`, '#ffffff', 'rgba(255, 255, 255, 0.8)', 1.0);
          });

          if (transSegments.length > 0) {
            curY += transGap;
            transSegments.forEach((seg) => {
              curY += lhTrans;
              const wy = curY - lhTrans + transSz * 0.5;
              drawTextWithShadows(seg, wy, \`600 \${transSz}px \${FONT}\`, '#e2e8f0', 'rgba(255, 255, 255, 0.4)', 0.85);
            });
          }
          ctx.globalAlpha = opacity * layoutAlpha; // reset`;

// Note: Left alignment code block needs similar updates!
const rendererDrawLeftOld = `          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = \`bold \${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;

          const segments = line.wrapped;
          const totalH = segments.length * lh_act;
          const top = -totalH / 2;

          segments.forEach((seg, wi) => {
            const wy = top + wi * lh_act + ACT_SZ * 0.5;

            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(seg, 0, wy);

            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;
            ctx.fillText(seg, 0, wy);

            ctx.shadowColor = 'transparent';
            ctx.fillText(seg, 0, wy);
          });`;

const rendererDrawLeftNew = rendererDrawNew.replace("ctx.textAlign = 'center';", "ctx.textAlign = 'left';");

renderer = renderer.replace(rendererDrawOld, rendererDrawNew);
renderer = renderer.replace(rendererDrawLeftOld, rendererDrawLeftNew);

fs.writeFileSync('video_renderer.js', renderer);
