'use strict';

// ════════════════════════════════════════════════════════════════
// NOISES MUSIC — VIDEO RENDERER
// Beautiful Lyrics-inspired design, written for correctness, speed.
// ════════════════════════════════════════════════════════════════

const fs      = require('fs');
const path    = require('path');
const { spawn }  = require('child_process');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

// ── Font registration ────────────────────────────────────────────────────────
const fontDir = path.join(__dirname, 'bin', 'fonts');
(function registerFonts() {
  const pairs = [
    ['Tokotype-PlusJakartaSans-Medium.ttf', 'Plus Jakarta Sans'],
    ['Tokotype-PlusJakartaSans-Bold.ttf',   'Plus Jakarta Sans'],
    ['NotoSansDevanagari.ttf',              'Noto Sans Devanagari'],
  ];
  for (const [file, family] of pairs) {
    const fp = path.join(fontDir, file);
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp, family); } catch (_) {}
    }
  }
})();

// ── Beautiful Lyrics constants (from Lyrics.scss / LineVocals.ts) ────────────
const BL = {
  IDLE_OPACITY:   0.51,
  ACTIVE_OPACITY: 1.00,
  SUNG_OPACITY:   0.45,
  INACTIVE_SCALE: 0.72,
  GLOW_BASE:      4,
  GLOW_RANGE:     10,
  GLOW_ALPHA:     0.55,
  SPRING_K:       0.10,
  SPRING_D:       0.74,
  INTERLUDE_GAP:  3.5,
  BG_OVERLAY:     0.60,
};

// ── Pre-baked noise canvas for film grain ────────────────────────────────────
let _noise = null;
function getNoiseCanvas() {
  if (_noise) return _noise;
  _noise = createCanvas(128, 128);
  const ctx = _noise.getContext('2d');
  const d   = ctx.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 8;
  }
  ctx.putImageData(d, 0, 0);
  return _noise;
}

// ── Pre-baked vignette canvas ────────────────────────────────────────────────
let _vig = null;
let _blurCanvas = null;
let _blobCanvas = null;
let _blobCtx = null;
function drawVignette(ctx, w, h) {
  if (!_vig) {
    _vig = createCanvas(480, 270);
    const vc = _vig.getContext('2d');
    const g  = vc.createRadialGradient(240, 135, 50, 240, 135, 280);
    g.addColorStop(0,    'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    g.addColorStop(0.80, 'rgba(0,0,0,0.22)');
    g.addColorStop(1,    'rgba(0,0,0,0.70)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, 480, 270);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(_vig, 0, 0, w, h);
  ctx.restore();
}

// ── Color extraction ─────────────────────────────────────────────────────────
function extractColors(img) {
  const tmp = createCanvas(10, 10);
  const c   = tmp.getContext('2d');
  c.drawImage(img, 0, 0, 10, 10);
  const d   = c.getImageData(0, 0, 10, 10).data;
  const px  = (x, y) => { const i = (y * 10 + x) * 4; return [d[i], d[i+1], d[i+2]]; };
  const rgb = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
  return {
    tl: px(1,1), tr: px(8,1), bl: px(1,8), br: px(8,8), c: px(5,5), rgb
  };
}

// ── Animated background (blurred album art + colour blobs) ──────────────────
function drawBackground(ctx, w, h, coverImg, colors, time, amp) {
  if (_blurCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    const dw = Math.max(w, h) * 1.5;
    
    // Base layer
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.scale(1.2, 1.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 1 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.sin(time * 0.15) * w * 0.3, h/2 + Math.cos(time * 0.18) * h * 0.3);
    ctx.rotate(time * 0.05);
    ctx.scale(1.8, 1.8);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 2 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(w/2 + Math.cos(time * 0.16) * w * 0.4, h/2 + Math.sin(time * 0.2) * h * 0.4);
    ctx.rotate(-time * 0.06);
    ctx.scale(2.2, 2.2);
    ctx.drawImage(_blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();
    
    ctx.restore();
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
  }

  // Smart darkening overlay for readability
  let baseAlpha = 0.4;
  if (colors) {
    const getLuma = (c) => 0.299*c[0] + 0.587*c[1] + 0.114*c[2];
    const avgLuma = (getLuma(colors.tl) + getLuma(colors.tr) + getLuma(colors.bl) + getLuma(colors.br) + getLuma(colors.c)) / 5;
    if (avgLuma > 100) {
      baseAlpha += Math.min(0.35, ((avgLuma - 100) / 155) * 0.35);
    }
  }

  ctx.fillStyle = `rgba(0,0,0,${baseAlpha.toFixed(2)})`;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette drawn under text overlays
  drawVignette(ctx, w, h);
}

// ── Floating ♪ musical notes ───────────────────────────────────────────────────
function drawInterludeDots(ctx, x, y, time) {
  const notes = ['♪', '♫', '♪'];
  const R = 7, GAP = 30;
  const totalW = 2 * R * 3 + GAP * 2;
  const startX = x - totalW / 2 + R;

  ctx.save();
  ctx.font = `24px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < 3; i++) {
    const ph = time * 2.5 + i * 0.72;
    const yOffset = Math.sin(ph) * 8;
    const al = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ph));
    
    ctx.fillStyle = `rgba(255,255,255,${al})`;
    ctx.fillText(notes[i], startX + i * (R * 2 + GAP), y + yOffset);
  }
  ctx.restore();
}

// ── PRE-COMPUTE text wrapping and layout before render loop ─────────────────────
function precomputeWrappedLyrics(ctx, lyrics, fontSpec, maxWidth, H) {
  const activeSz = Math.round(H * 0.055);
  const transSz = activeSz * 0.60;

  const wrapLine = (txt, fontStr) => {
    if (!txt) return [];
    ctx.font = fontStr;
    const words = txt.split(' ');
    const res = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width <= maxWidth) { cur = t; }
      else { if (cur) res.push(cur); cur = w; }
    }
    if (cur) res.push(cur);
    return res.length ? res : [txt];
  };

  const wrapped = lyrics.map(line => {
    const wText = wrapLine(line.text, fontSpec);
    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', `600 ${transSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`) : [];
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
  });

  const validGaps = [];
  for (let i = 0; i < lyrics.length - 1; i++) {
    const g = lyrics[i+1].time - lyrics[i].time;
    if (g > 0.5) validGaps.push(g);
  }
  validGaps.sort((a,b) => a - b);
  precomputed.medianGap = validGaps.length > 0 ? validGaps[Math.floor(validGaps.length / 2)] : 5.0;

  return precomputed;
}

// ── Left Split Screen Layout (Watermark Cover Art + Player) ─────────
function drawLeftSplitLayout(ctx, coverImg, title, artist, W, H, songTime, duration, font) {
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, duration - songTime));
  ctx.save();
  ctx.globalAlpha = layoutAlpha;

  const artSz = Math.round(H * 0.52);
  const ax = Math.round(W * 0.225 - artSz / 2);
  const ay = Math.round(H * 0.36 - artSz / 2);

  // Album cover with shadow and rounded corners
  if (coverImg) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
    ctx.clip();
    ctx.drawImage(coverImg, ax, ay, artSz, artSz);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#111115';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
    ctx.fill();
    ctx.restore();
  }

  const textX = Math.round(W * 0.225);
  const titleY = ay + artSz + 36;
  const titleSz = Math.round(H * 0.042);
  const artistSz = Math.round(titleSz * 0.68);

  // Song Title
  ctx.save();
  ctx.font = `bold ${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText(title, textX, titleY);

  // Artist Name
  ctx.font = `${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(artist, textX, titleY + titleSz + 8);
  ctx.restore();

  ctx.restore();
}

// ── Album art + song info panel (Watermark corner card) ──────────────────────
function drawAlbumPanel(ctx, img, title, artist, W, H, font, songTime, duration) {
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, duration - songTime));
  ctx.save();
  ctx.globalAlpha = layoutAlpha;

  const margin = Math.round(Math.min(W, H) * 0.05);
  const artSz  = Math.round(Math.min(W, H) * 0.095);
  const ax = margin, ay = margin;
  const radius = Math.round(artSz * 0.16);

  if (img) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = Math.round(artSz * 0.25);
    ctx.shadowOffsetY = Math.round(artSz * 0.1);
    
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.clip();
    ctx.drawImage(img, ax, ay, artSz, artSz);
    ctx.restore();

    // Elegant inner border for realism
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#111115';
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.fill();
    ctx.restore();
  }

  const tx = ax + artSz + Math.round(artSz * 0.28);
  const tSz = Math.round(artSz * 0.32);
  const aSz = Math.round(tSz * 0.72);
  const gap = Math.round(tSz * 0.28);
  
  // Vertically center the text block relative to the cover art using middle baseline
  const totalTextH = tSz + gap + aSz;
  const textCenterY = ay + artSz / 2;
  const titleY = textCenterY - (totalTextH / 2) + (tSz / 2);
  const artistY = titleY + (tSz / 2) + gap + (aSz / 2);

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = `bold ${tSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(title, tx, titleY);

  ctx.font = `${aSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText(artist, tx, artistY);
  ctx.restore();

  ctx.restore();
}

// ── Scrolling Lyrics Panel ──────────────────────────────────────────────────
function drawLyricsPanel(ctx, W, H, time, wrappedLyrics, font, alignment, duration) {
  if (!wrappedLyrics || wrappedLyrics.length === 0) {
    const interludeX = alignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(ctx, interludeX, H / 2, time);
    return;
  }

  const adjTime = time;

  // Find active line index
  let activeIdx = -1;
  for (let i = 0; i < wrappedLyrics.length; i++) {
    if (wrappedLyrics[i].time <= adjTime) activeIdx = i;
    else break;
  }

  const tx = alignment === 'left' ? (W * 0.48) : (W / 2);
  const textAlign = alignment === 'left' ? 'left' : 'center';

  const activeSz = Math.min(Math.round(H * 0.065), 72);
  const lh_act = activeSz * 1.38;

  let showInterlude = false;
  let showDuration = 5.0;
  let isBlank = false;

  if (activeIdx >= 0) {
    const activeLine = wrappedLyrics[activeIdx];
    const hasNext = activeIdx + 1 < wrappedLyrics.length;
    const nextLine = hasNext ? wrappedLyrics[activeIdx + 1] : null;
    const gapToNext = hasNext ? nextLine.time - activeLine.time : Infinity;
    
    const medianGap = wrappedLyrics.medianGap || 5.0;
    const isInstrumentalBreak = gapToNext > Math.max(15.0, medianGap * 2.5);
    
    if (isInstrumentalBreak) {
      showDuration = Math.max(8.0, medianGap * 1.5);
    } else {
      showDuration = Math.max(2.0, gapToNext - 0.2);
    }
    
    const elapsed = adjTime - activeLine.time;
    if (elapsed > showDuration) {
      const timeUntilNext = hasNext ? (nextLine.time - adjTime) : Infinity;
      if (timeUntilNext > 2.0) {
        showInterlude = true;
      } else {
        isBlank = true;
      }
    }
  } else {
    const timeUntilFirst = wrappedLyrics[0].time - adjTime;
    if (timeUntilFirst > 2.0) {
      showInterlude = true;
    } else {
      isBlank = true;
    }
  }

  if (isBlank) return;

  if (showInterlude) {
    const interludeX = alignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(ctx, interludeX, H / 2, time);
    return;
  }

  const line = wrappedLyrics[activeIdx];
  const elapsed = adjTime - line.time;
  const timeLeft = showDuration - elapsed;

  const scale = Math.min(1, 0.96 + elapsed * 0.2); 
  let opacity = 1.0;
  if (elapsed < 0.3) {
    opacity = elapsed / 0.3;
  } else if (timeLeft < 0.3) {
    opacity = Math.max(0, timeLeft / 0.3);
  }

  const layoutAlpha = Math.max(0, Math.min(1, time) * Math.min(1, duration - time));

  ctx.save();
  ctx.globalAlpha = opacity * layoutAlpha;
  ctx.translate(tx, H / 2);
  
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${activeSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;

  const segments = line.wrapped;
  const transSegments = line.wrappedTrans || [];

  const transSz = activeSz * 0.60;
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
    drawTextWithShadows(seg, wy, `bold ${activeSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.8)', 1.0);
  });

  if (transSegments.length > 0) {
    curY += transGap;
    transSegments.forEach((seg) => {
      curY += lhTrans;
      const wy = (curY - lhTrans + transSz * 0.5) * scale;
      drawTextWithShadows(seg, wy, `600 ${transSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.90);
    });
  }

  ctx.restore();
}

// ── Watermark ────────────────────────────────────────────────────────────────
function drawWatermark(ctx, w, h, time, logoImg) {
  if (!logoImg) return;
  ctx.save();
  
  const margin = Math.round(Math.min(w, h) * 0.05);
  const lgSz   = Math.round(Math.min(w, h) * 0.13);
  const lx     = margin;
  const ly     = h - margin - lgSz;
  
  // Floating offset using sine wave based on time
  const floatY = Math.sin(time * 2.0) * 3.5;
  
  // 100% visible
  ctx.globalAlpha = 1.0;
  
  ctx.drawImage(logoImg, lx, ly + floatY, lgSz, lgSz);
  ctx.restore();
}

// ── Draw progress bar (bottom) ────────────────────────────────────
function drawProgressBar(ctx, w, h, songTime, duration) {
  if (!duration) return;
  const pct = Math.min(1, Math.max(0, songTime / duration));
  const barH = 3;
  const barY = h - barH;

  ctx.save();
  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, barY, w, barH);

  // Fill
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, barY, w * pct, barH);
  ctx.restore();
}

// ── Audio amplitude envelope ─────────────────────────────────────────────────
function getAudioAmplitude(audioPath) {
  return new Promise(resolve => {
    const p = spawn(ffmpegInstaller.path, [
      '-i', audioPath, '-ac', '1', '-ar', '100', '-f', 'f32le', '-'
    ]);
    const chunks = [];
    p.stdout.on('data', c => chunks.push(c));
    p.on('close', code => {
      if (code === 0) {
        const buf = Buffer.concat(chunks);
        resolve(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
      } else resolve(new Float32Array(0));
    });
    p.on('error', () => resolve(new Float32Array(0)));
  });
}

// ── Audio amplitude start detection ──────────────────────────────────────────
function detectAudioStart(pcm) {
  if (!pcm || pcm.length === 0) return 0;
  const windowSize = 15; // 0.15s rolling window
  for (let i = 0; i < pcm.length - windowSize; i++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += Math.abs(pcm[i + j]);
    }
    const avg = sum / windowSize;
    if (avg > 0.015) {
      return i / 100; // time in seconds (100Hz)
    }
  }
  return 0;
}

// ── THUMBNAIL ────────────────────────────────────────────────────────────────
function generateThumbnail(coverImg, colors, title, artist, font, alignment, wrappedLyrics, duration, logoImg, W = 1280, H = 720) {
  const tc  = createCanvas(W, H);
  const ctx = tc.getContext('2d');

  // 1. Draw background (Apple Music style mesh gradient)
  drawBackground(ctx, W, H, coverImg, colors, 10.0, 0.0);

  // 2. Draw centered Album Cover Art
  const artSz = Math.round(H * 0.39); // scales perfectly (e.g. 280 for 720p, 420 for 1080p)
  const radius = Math.round(artSz * 0.06);

  const ax = Math.round((W - artSz) / 2);
  const titleSz = Math.round(H * 0.072);
  const artistSz = Math.round(H * 0.033);
  const gap1 = Math.round(H * 0.06);
  const gap2 = Math.round(H * 0.02);

  // Set the font to measure title
  ctx.font = `bold ${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;

  // Wrap the title if it is too wide
  const maxTitleWidth = Math.round(W * 0.68);
  const words = title.split(' ');
  const titleLines = [];
  let currentLine = '';
  for (const w of words) {
    const testLine = currentLine ? `${currentLine} ${w}` : w;
    if (ctx.measureText(testLine).width <= maxTitleWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) titleLines.push(currentLine);
      currentLine = w;
    }
  }
  if (currentLine) titleLines.push(currentLine);

  // If there are too many lines or it's very long, shrink font size
  let finalTitleSz = titleSz;
  if (titleLines.length > 2) {
    finalTitleSz = Math.round(H * 0.061);
    ctx.font = `bold ${finalTitleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
    titleLines.length = 0;
    currentLine = '';
    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(testLine).width <= maxTitleWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) titleLines.push(currentLine);
        currentLine = w;
      }
    }
    if (currentLine) titleLines.push(currentLine);
  }

  // Draw wrapped title lines
  const titleLineHeight = Math.round(finalTitleSz * 1.25);
  
  // Calculate total height of elements and center them vertically
  const totalH = artSz + gap1 + (titleLines.length * titleLineHeight) + gap2 + artistSz;
  const ay = Math.round((H - totalH) / 2);
  const titleY = ay + artSz + gap1;
  const artistY = titleY + (titleLines.length * titleLineHeight) + gap2;

  // Draw Cover Art
  if (coverImg) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 15;

    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.clip();
    ctx.drawImage(coverImg, ax, ay, artSz, artSz);
    ctx.restore();

    // Subtle white inner border
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#111115';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 15;
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.fill();
    ctx.restore();
  }

  // Draw Song Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${finalTitleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], W / 2, titleY + i * titleLineHeight);
  }

  // Draw Artist Name
  ctx.font = `${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillText(artist, W / 2, artistY);
  ctx.restore();

  // Draw watermark logo in the corner (at static time = 0.0)
  drawWatermark(ctx, W, H, 0.0, logoImg);

  // Film grain overlay
  const nc  = getNoiseCanvas();
  const pat = ctx.createPattern(nc, 'repeat');
  ctx.save();
  ctx.fillStyle = pat;
  ctx.translate(24, 42);
  ctx.fillRect(-24, -42, W + 24, H + 42);
  ctx.restore();

  return tc.toBuffer('image/jpeg', { quality: 96 });
}

// ════════════════════════════════════════════════════════════════
// MAIN RENDER ENGINE
// ════════════════════════════════════════════════════════════════
function renderVideo({
  audioPath,
  artworkPath,        // Square album art from iTunes (or null)
  lyrics = [],
  outputPath,
  duration,
  songTitle  = 'Unknown',
  songArtist = 'Unknown',
  resolution = '720',
  fps = 24,
  alignment = 'center',
  offset = 0,
  youtubeDuration = 0,
  itunesDuration = 0,
  isShort = false,
  shortStartTime = 0,
  seoKeywords = [],
  progressCallback = () => {},
}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Reset background caches for multi-render safety
      _blobCanvas = null;
      _blobCtx = null;
      _blurCanvas = null;

      // ── Geometry ──────────────────────────────────────────────
      const W   = isShort ? (resolution === '1080' ? 1080 : 720) : (resolution === '1080' ? 1920 : 1280);
      const H   = isShort ? (resolution === '1080' ? 1920 : 1280) : (resolution === '1080' ? 1080 : 720);
      const FPS = parseInt(fps, 10) || 24;
      const FONT = 'Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR';

      const ACT_SZ  = isShort ? Math.min(Math.round(W * 0.085), 90) : Math.min(Math.round(H * 0.065), 72);
      const maxWidth = isShort ? Math.round(W * 0.85) : (alignment === 'left' ? Math.round(W * 0.44) : Math.round(W * 0.76));
      
      const renderDuration = isShort ? 30 : duration;
      const TOTAL_FRAMES = Math.ceil(renderDuration * FPS);
      console.log(`[Renderer] ${W}×${H} @${FPS}fps | ${TOTAL_FRAMES} frames | lyrics: ${lyrics.length}`);

      // ── Canvas ────────────────────────────────────────────────
      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      // ── Load cover art ────────────────────────────────────────
      let coverImg = null, colors = null, logoImg = null;
      
      const logoPath = path.join(__dirname, 'public', 'logo_white.png');
      if (fs.existsSync(logoPath)) {
        try {
          logoImg = await loadImage(logoPath);
          console.log('[Renderer] Logo loaded successfully ✓');
        } catch (e) {
          console.error('[Renderer] Logo load failed:', e.message);
        }
      }

      if (artworkPath && fs.existsSync(artworkPath)) {
        try {
          coverImg = await loadImage(artworkPath);
          colors   = extractColors(coverImg);
          
          // Generate _blurCanvas exactly like app.js
          _blurCanvas = createCanvas(32, 18);
          const bx = _blurCanvas.getContext('2d');
          const iW = coverImg.width || 1000;
          const iH = coverImg.height || 1000;
          const target = 32 / 18;
          const ratio = iW / iH;
          let sx, sy, sw, sh;
          if (ratio > target) { sh = iH; sw = iH * target; sx = (iW - sw) / 2; sy = 0; }
          else                { sw = iW; sh = iW / target; sx = 0; sy = (iH - sh) / 2; }
          bx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, 32, 18);
          
          console.log('[Renderer] Cover art loaded ✓');
        } catch (e) { console.error('[Renderer] Cover art:', e.message); }
      }

      // ── Audio amplitude ───────────────────────────────────────
      console.log('[Renderer] Extracting amplitude...');
      const pcm = await getAudioAmplitude(audioPath);
      console.log(`[Renderer] ${pcm.length} PCM samples ✓`);

      // ── Applied Offset from Client directly ──
      const appliedOffset = parseFloat(offset) || 0;
      console.log(`[Renderer] Sync: AppliedOffset=${appliedOffset.toFixed(2)}s`);

      // ── Keep raw lyric timestamps (sync offset is applied at render time) ──
      const adjustedLyrics = lyrics.map(l => ({
        time: parseFloat(l.time),
        text: l.text,
        translation: l.translation
      })).sort((a, b) => a.time - b.time);

      // ── Pre-compute wrapped lyrics ────────────────────────────
      ctx.font = `bold ${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
      const wrappedLyrics = precomputeWrappedLyrics(ctx, adjustedLyrics, `bold ${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, maxWidth, H);
      console.log(`[Renderer] Pre-wrapped ${wrappedLyrics.length} lyric lines ✓`);

      // ── Save thumbnail & metadata ───────────────────────────────
      const thumbPath = outputPath.replace('.mp4', '_thumbnail.jpg');
      fs.writeFileSync(thumbPath, generateThumbnail(coverImg, colors, songTitle, songArtist, FONT, alignment, wrappedLyrics, duration, logoImg, W, H));
      console.log(`[Renderer] Thumbnail saved ✓`);

      const txtPath = outputPath.replace('.mp4', '_metadata.txt');
      const hasTranslation = lyrics.some(l => l.translation);
      const suffix = hasTranslation ? "(Lyrics & English Translation)" : "(Lyrics)";
      
      const seoTitle = `${songArtist} - ${songTitle} ${suffix}`;
      const seoDesc = `Enjoy the beautifully styled lyrics and English translation for "${songTitle}" by ${songArtist}.\\n\\nRendered dynamically via Noises Music Studio.`;
      const autoTags = seoKeywords && seoKeywords.length > 0 ? seoKeywords.join(', ') + ', ' : '';
      const seoTags = `${autoTags}${songArtist}, ${songTitle}, Lyrics, ${hasTranslation ? 'English Translation, ' : ''}Pop, Music, Audio`;
      
      const metadataContent = `== YOUTUBE SEO METADATA ==\\n\\nTITLE:\\n${seoTitle}\\n\\nDESCRIPTION:\\n${seoDesc}\\n\\nTAGS:\\n${seoTags}\\n`;
      fs.writeFileSync(txtPath, metadataContent);
      console.log(`[Renderer] SEO Metadata saved ✓`);

      // ── FFmpeg process ────────────────────────────────────────
      const ffArgs = [
        '-y',
        '-f', 'rawvideo', '-pixel_format', 'rgba',
        '-video_size', `${W}x${H}`,
        '-framerate', `${FPS}`,
        '-i', '-',                          // canvas frames via stdin
        ...(isShort ? ['-ss', `${shortStartTime}`, '-t', '30'] : []),
        '-i', audioPath,
        '-filter_complex',
          `[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=${renderDuration - 2}:d=2[a]`,
        '-map', '0:v', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
        '-vsync', 'cfr',                     // Force Constant Frame Rate to avoid audio drift
        '-r', `${FPS}`,                      // Set explicit output frame rate
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        outputPath,
      ];
      const ffProc = spawn(ffmpegInstaller.path, ffArgs);
      ffProc.stdin.on('error', e => console.warn('[FFmpeg] stdin:', e.message));
      let ffErr = '';
      ffProc.stderr.on('data', d => { ffErr += d.toString(); });
      ffProc.on('error', reject);

      const writeFrame = buf => new Promise((resolve, reject) => {
        if (ffProc.stdin.destroyed) return reject(new Error('FFmpeg stdin destroyed'));
        
        const ok = ffProc.stdin.write(buf);
        if (ok) {
          resolve();
        } else {
          const onDrain = () => {
            ffProc.stdin.removeListener('error', onError);
            resolve();
          };
          const onError = (err) => {
            ffProc.stdin.removeListener('drain', onDrain);
            reject(err);
          };
          ffProc.stdin.once('drain', onDrain);
          ffProc.stdin.once('error', onError);
        }
      });

      // Initialize scroll offset
      let currentScrollY = wrappedLyrics.length > 0 ? wrappedLyrics[0].yCenter : H / 2;

      // ── Main render loop ──────────────────────────────────────
      for (let fi = 0; fi < TOTAL_FRAMES; fi++) {
        const now      = fi / FPS;           // time from video start
        const songTime = isShort ? shortStartTime + now : now;

        // Amplitude sample
        let amp = 0;
        if (pcm.length > 0) {
          const si = Math.floor(now * 100);
          let sum = 0, cnt = 0;
          for (let k = Math.max(0, si - 4); k <= Math.min(pcm.length - 1, si + 4); k++) {
            sum += Math.abs(pcm[k]); cnt++;
          }
          amp = Math.min(1, (cnt > 0 ? sum / cnt : 0) * 2.5);
        }

        // ── Background every frame ──
        drawBackground(ctx, W, H, coverImg, colors, now, amp * 0.3);

        // ── INTRO ────────────────────────────────────────
        let introEnd = 3.0;
        if (wrappedLyrics && wrappedLyrics.length > 0) {
          introEnd = Math.min(3.0, Math.max(0, wrappedLyrics[0].time - 0.5));
        }

        if (now < introEnd) {
          const t = now;
          const fadeOutStart = Math.max(0, introEnd - 1.0);
          let a = 1.0;
          if (t < 1.0) a = t; 
          if (t > fadeOutStart) a = Math.min(a, introEnd - t);
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, a));

          // Draw centered Cover Art
          const artSz = Math.round(H * 0.40);
          const titleSz = Math.round(H * 0.045);
          const artistSz = Math.round(titleSz * 0.68);
          const totalH = artSz + 30 + titleSz + 10 + artistSz;

          const ax = Math.round((W - artSz) / 2);
          const ay = Math.round((H - totalH) / 2);
          const radius = Math.round(artSz * 0.06);

          if (coverImg) {
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
            ctx.shadowBlur = 40;
            ctx.shadowOffsetY = 12;
            
            ctx.beginPath();
            ctx.roundRect(ax, ay, artSz, artSz, radius);
            ctx.clip();
            ctx.drawImage(coverImg, ax, ay, artSz, artSz);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(ax, ay, artSz, artSz, radius);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.fillStyle = '#111115';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
            ctx.shadowBlur = 40;
            ctx.beginPath();
            ctx.roundRect(ax, ay, artSz, artSz, radius);
            ctx.fill();
            ctx.restore();
          }

          const titleY = ay + artSz + 30;

          // Song Title
          ctx.font = `bold ${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 4;
          ctx.fillText(songTitle, W / 2, titleY);

          // Artist Name
          ctx.font = `${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillText(songArtist, W / 2, titleY + titleSz + 10);

          ctx.restore();

        // ── PLAYBACK ─────────────────────────────────────────────
        } else {
          if (alignment === 'left') {
            drawLeftSplitLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, duration, FONT);
          } else {
            drawAlbumPanel(ctx, coverImg, songTitle, songArtist, W, H, FONT, songTime, duration);
          }

          // Lyrics panel static layout (auto-calculates activeIdx and fades inside)
          drawLyricsPanel(ctx, W, H, songTime + appliedOffset, wrappedLyrics, FONT, alignment, duration);
        }

        // ── OUTRO ────────────────────────────────────────────────
        if (now >= duration - 5) {
          const el = now - (duration - 5);
          const a  = Math.max(0, Math.min(1, el < 1 ? el : 1));
          ctx.save();
          ctx.globalAlpha = a;

          const titleSz = Math.round(H * 0.045);
          const artistSz = Math.round(titleSz * 0.68);
          const gap = 16;
          const totalH = titleSz + gap + artistSz;

          const ay = Math.round(H - totalH - H * 0.10);

          // Subtitles
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 4;
          ctx.font = `bold ${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
          ctx.fillText('THANKS FOR WATCHING', W / 2, ay);
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.font = `${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
          ctx.fillText('LIKE, SHARE & SUBSCRIBE', W / 2, ay + titleSz + gap);

          ctx.restore();
        }

        // Draw floating logo watermark everywhere!
        drawWatermark(ctx, W, H, now, logoImg);

        // Film grain every frame
        const nc  = getNoiseCanvas();
        const pat = ctx.createPattern(nc, 'repeat');
        ctx.save();
        ctx.fillStyle = pat;
        const ox = Math.floor(Math.random() * 128);
        const oy = Math.floor(Math.random() * 128);
        ctx.translate(ox, oy);
        ctx.fillRect(-ox, -oy, W, H);
        ctx.restore();

        await writeFrame(canvas.data());

        // Report progress every second
        if (fi % FPS === 0 || fi === TOTAL_FRAMES - 1) {
          progressCallback(Math.floor((fi / (TOTAL_FRAMES - 1)) * 100));
        }
      }

      // ── Finalise ──────────────────────────────────────────────
      console.log('[Renderer] Finalising encode…');
      ffProc.stdin.end();

      ffProc.on('close', code => {
        if (code === 0) {
          console.log(`[Renderer] Done → ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg failed (code ${code}): ${ffErr.slice(-600)}`));
        }
      });

    } catch (err) {
      console.error('[Renderer] Fatal:', err);
      reject(err);
    }
  });
}

module.exports = { renderVideo, getAudioAmplitude, detectAudioStart };
