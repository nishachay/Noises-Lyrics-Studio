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
    // Plus Jakarta Sans
    ['Tokotype-PlusJakartaSans-Medium.ttf', 'Plus Jakarta Sans', { weight: '500' }],
    ['Tokotype-PlusJakartaSans-Bold.ttf',   'Plus Jakarta Sans', { weight: '700' }],
    ['PlusJakartaSans-Bold.ttf',            'Plus Jakarta Sans', { weight: '800' }],
    // Noto Sans Devanagari (Hindi)
    ['NotoSansDevanagari.ttf',              'Noto Sans Devanagari', { weight: '400' }],
    ['NotoSansDevanagari-Bold.ttf',         'Noto Sans Devanagari', { weight: '700' }],
    // Noto Sans KR (Korean)
    ['NotoSansKR.ttf',                      'Noto Sans KR', { weight: '400' }],
    ['NotoSansKR-Bold.otf',                 'Noto Sans KR', { weight: '700' }],
  ];
  for (const [file, family, opts] of pairs) {
    const fp = path.join(fontDir, file);
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp, family, opts); } catch (e) {
        // Fallback for older @napi-rs/canvas versions that don't accept opts
        try { GlobalFonts.registerFromPath(fp, family); } catch (_) {}
      }
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
let _leftLayoutCache = null;
let _albumPanelCache = null;
let _introCache = null;
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

// ── Color extraction (Average color, Saturation, and Brightness) ─────────────
function extractColors(img) {
  try {
    const tmp = createCanvas(1, 1);
    const c = tmp.getContext('2d');
    c.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    
    // Calculate saturation (HSL) and relative luminance
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    let s = 0;
    if (max !== min) {
      s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    }
    
    // Relative Luminance
    let rs = r / 255; let gs = g / 255; let bs = b / 255;
    rs = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
    gs = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
    bs = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
    const L = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;

    return { r, g, b, saturation: s, brightness: l, L, avgBrightness: l * 255 };
  } catch (e) {
    return { r: 40, g: 40, b: 40, saturation: 0, brightness: 0.1, L: 0.05, avgBrightness: 25 };
  }
}

// ── Animated background (Apple Music style dynamic blurred art) ───────────────
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

  // Smart darkening overlay
  let alpha = 0.25;
  if (colors) {
    alpha = 0.25 + Math.min(0.35, colors.brightness * 0.35);
  }
  ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette drawn under text overlays
  drawVignette(ctx, w, h);
}
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

// ΓöÇΓöÇ PRE-COMPUTE text wrapping and layout before render loop ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function precomputeWrappedLyrics(ctx, lyrics, fontSpec, maxWidth, defaultActiveSz, linesPerScreen = 1, H = 720) {
  const wrapLine = (txt, fontStr) => {
    if (!txt) return [];
    ctx.font = fontStr;
    const parts = txt.split(/\s*\/\s*/);
    const res = [];
    for (const part of parts) {
      const words = part.split(' ');
      let cur = '';
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(t).width <= maxWidth) { cur = t; }
        else { if (cur) res.push(cur); cur = w; }
      }
      if (cur) res.push(cur);
    }
    return res;
  };

  const N = linesPerScreen;
  let baseActiveSz = defaultActiveSz;
  if (N >= 4) {
    baseActiveSz = Math.min(Math.round(H * 0.048), 50);
  } else if (N >= 3) {
    baseActiveSz = Math.min(Math.round(H * 0.055), 60);
  }

  const wrapped = lyrics.map(line => {
    let activeSz = baseActiveSz;
    const isHindi = /[\u0900-\u097F]/.test(line.text);
    if (isHindi) activeSz *= 1.25;

    const lineFontSpec = fontSpec.replace(defaultActiveSz.toString(), Math.round(activeSz).toString());
    const wText = wrapLine(line.text, lineFontSpec);

    const transSz = activeSz * 0.60;
    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', `normal ${Math.round(transSz)}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`) : [];
    
    return { ...line, wrapped: wText, wrappedTrans: wTrans, activeSz, transSz };
  });

  let currentTop = 0;
  const precomputed = wrapped.map(line => {
    const lh = line.activeSz * 1.38;
    const lhTrans = line.transSz * 1.38;
    const transGap = line.activeSz * 0.3;
    const paraGap = line.activeSz * 0.8;

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

// ΓöÇΓöÇ Left Split Screen Layout (Watermark Cover Art + Player) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawLeftSplitLayout(ctx, coverImg, title, artist, W, H, songTime, duration, font) {
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
    cctx.font = `bold ${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'top';
    cctx.fillStyle = '#ffffff';
    cctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    cctx.shadowBlur = 8;
    cctx.shadowOffsetY = 2;
    cctx.fillText(title, textX, titleY);

    cctx.font = `600 ${artistSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    cctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    cctx.shadowBlur = 6;
    cctx.shadowOffsetY = 2;
    cctx.fillText(artist, textX, titleY + titleSz + 8);
    cctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = layoutAlpha;
  ctx.drawImage(_leftLayoutCache, 0, 0);
  ctx.restore();
}


// ΓöÇΓöÇ Album art + song info panel (Watermark corner card) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawAlbumPanel(ctx, img, title, artist, W, H, font, songTime, duration) {
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

    cctx.font = `bold ${tSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    cctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    cctx.shadowBlur = 8;
    cctx.shadowOffsetY = 2;
    cctx.fillText(title, tx, titleY);

    cctx.font = `${aSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
    cctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    cctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    cctx.shadowBlur = 6;
    cctx.shadowOffsetY = 2;
    cctx.fillText(artist, tx, artistY);
    cctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = layoutAlpha;
  ctx.drawImage(_albumPanelCache, 0, 0);
  ctx.restore();
}


// ΓöÇΓöÇ Scrolling Lyrics Panel ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawLyricsPanel(ctx, W, H, time, wrappedLyrics, font, alignment, duration, defaultActiveSz, linesPerScreen = 1) {
  // We use the activeSz embedded in the active line.
  
  const curYOffset = H * 0.15;
  const isVertical = H > W;
  const actualAlignment = isVertical ? 'center' : alignment;

  if (!wrappedLyrics || wrappedLyrics.length === 0) {
    const interludeX = actualAlignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(ctx, interludeX, H / 2, time);
    return;
  }

  const adjTime = time;

  // Find active line index
  let activeIdx = -1;
  for (let i = 0; i < wrappedLyrics.length; i++) {
    const t = wrappedLyrics[i].time;
    if (t !== null && t !== undefined && t <= adjTime) {
      activeIdx = i;
    } else {
      break;
    }
  }

  const tx = actualAlignment === 'left' ? (W * 0.48) : (W / 2);
  const textAlign = actualAlignment === 'left' ? 'left' : 'center';

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
    const firstTime = wrappedLyrics[0] ? wrappedLyrics[0].time : null;
    if (firstTime !== null && firstTime !== undefined) {
      const timeUntilFirst = firstTime - adjTime;
      if (timeUntilFirst > 2.0) {
        showInterlude = true;
      } else {
        isBlank = true;
      }
    } else {
      isBlank = true;
    }
  }

  if (isBlank) return;

  if (showInterlude) {
    const interludeX = actualAlignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(ctx, interludeX, H / 2, time);
    return;
  }

  const hasIdenticalTimestamps = (activeIdx > 0 && wrappedLyrics[activeIdx - 1].time === wrappedLyrics[activeIdx].time) || 
                                 (activeIdx + 1 < wrappedLyrics.length && wrappedLyrics[activeIdx + 1].time === wrappedLyrics[activeIdx].time);

  if (linesPerScreen > 1 || hasIdenticalTimestamps) {
    let startIndex = activeIdx;
    let endIndex = activeIdx + 1;
    
    // Group lines that share the EXACT same timestamp (created by multi-line tap sync)
    const activeTime = wrappedLyrics[activeIdx].time;
    while (startIndex > 0 && wrappedLyrics[startIndex - 1].time === activeTime) {
      startIndex--;
    }
    while (endIndex < wrappedLyrics.length && wrappedLyrics[endIndex].time === activeTime) {
      endIndex++;
    }
    
    // If lines don't share a timestamp, use the N linesPerScreen logic
    if (endIndex - startIndex < linesPerScreen) {
      const N = linesPerScreen;
      const stanzaIdx = Math.floor(startIndex / N);
      startIndex = stanzaIdx * N;
      endIndex = Math.min(wrappedLyrics.length, startIndex + N);
    }
    
    const stanzaLines = wrappedLyrics.slice(startIndex, endIndex);

    const stanzaStartTime = wrappedLyrics[startIndex] && typeof wrappedLyrics[startIndex].time === 'number' ? wrappedLyrics[startIndex].time : 0;
    const nextStanzaStartTime = endIndex < wrappedLyrics.length && typeof wrappedLyrics[endIndex].time === 'number' ? wrappedLyrics[endIndex].time : Infinity;

    let screenWasBlank = true;
    if (startIndex > 0) {
      const prevLine = wrappedLyrics[startIndex - 1];
      const prevGap = stanzaStartTime - prevLine.time;
      if (prevGap <= 2.0) screenWasBlank = false;
    }

    const elapsed = adjTime - stanzaStartTime;
    const timeLeft = nextStanzaStartTime - adjTime;
    const gapToNext = nextStanzaStartTime - stanzaStartTime;

    const fadeInDur = screenWasBlank ? 0.35 : Math.min(0.2, gapToNext * 0.3);
    const fadeOutDur = Math.min(0.35, Math.max(0.08, gapToNext * 0.4));

    let stanzaOpacity = 1.0;
    if (elapsed < fadeInDur && fadeInDur > 0) {
      stanzaOpacity = elapsed / fadeInDur;
    } else if (timeLeft < fadeOutDur && fadeOutDur > 0) {
      stanzaOpacity = Math.max(0, timeLeft / fadeOutDur);
    }

    const layoutAlpha = Math.max(0, Math.min(1, time) * Math.min(1, duration - time));
    const finalOpacity = stanzaOpacity * layoutAlpha;
    let activeSz = defaultActiveSz;
    const N = linesPerScreen;
    if (N >= 4) {
      activeSz = Math.min(Math.round(H * 0.048), 50);
    } else if (N >= 3) {
      activeSz = Math.min(Math.round(H * 0.055), 60);
    }
    const lh_act = activeSz * 1.38;
    const paraGap = activeSz * 0.7;

    let totalH = 0;
    stanzaLines.forEach((line) => {
      const lineActiveSz = line.activeSz || activeSz;
      const lh = lineActiveSz * 1.38;
      const transSz = line.transSz || Math.round(lineActiveSz * 0.60);
      const lhTrans = transSz * 1.38;
      const transGap = lineActiveSz * 0.3;

      const segments = line.wrapped;
      const transSegments = line.wrappedTrans || [];

      let lineH = segments.length * lh;
      if (transSegments.length > 0) {
        lineH += transGap + (transSegments.length * lhTrans);
      }
      line.calculatedHeight = lineH;
      totalH += lineH;

      if (!line._renderCache) {
        line._renderCache = createCanvas(W, lineH + 100);
        const cctx = line._renderCache.getContext('2d');
        const ccy = line._renderCache.height / 2;
        const ccx = W / 2;

        const drawShadowText = (text, y, fontStr, primaryColor, glowColor) => {
          cctx.font = fontStr;
          cctx.textAlign = textAlign;
          cctx.textBaseline = 'middle';

          // Glow layer (similar to app.js)
          if (glowColor && glowColor !== 'transparent') {
            cctx.shadowColor = glowColor;
            cctx.shadowBlur = 15;
            cctx.shadowOffsetY = 0;
            cctx.fillStyle = primaryColor || '#ffffff';
            cctx.globalAlpha = 0.5; // Half opacity for glow layer
            cctx.fillText(text, ccx, y);
            cctx.globalAlpha = 1.0;
          }

          cctx.fillStyle = primaryColor || '#ffffff';
          cctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          cctx.shadowBlur = (glowColor && glowColor !== 'transparent') ? 4 : 10;
          cctx.shadowOffsetY = 2;
          cctx.fillText(text, ccx, y);

          cctx.shadowColor = 'transparent';
          cctx.fillText(text, ccx, y);
        };

        let curY = ccy - lineH / 2;
        segments.forEach((seg) => {
          curY += lh;
          drawShadowText(seg, curY - lh + lineActiveSz * 0.5, `bold ${Math.round(lineActiveSz)}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.8)');
        });

        if (transSegments.length > 0) {
          curY += transGap;
          transSegments.forEach((seg) => {
            curY += lhTrans;
            drawShadowText(seg, curY - lhTrans + transSz * 0.5, `normal ${Math.round(transSz)}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.6)');
          });
        }
      }
    });

    totalH += (stanzaLines.length - 1) * paraGap;

    ctx.save();
    const targetY = isVertical ? H * 0.45 : H / 2;
    ctx.translate(tx, targetY);

    let curY = -totalH / 2;

    stanzaLines.forEach((line, index) => {
      const isLineActive = (startIndex + index) === activeIdx;
      const lineOpacityMult = isLineActive ? 1.0 : 0.35;

      ctx.save();
      let scale = 1.0;
      if (isLineActive) {
        const lineElapsed = adjTime - line.time;
        scale = Math.min(1, 0.97 + lineElapsed * 0.15);
      }

      ctx.globalAlpha = finalOpacity * lineOpacityMult;
      ctx.translate(-W/2, curY + line.calculatedHeight / 2 - line._renderCache.height / 2);
      ctx.drawImage(
        line._renderCache, 
        0, 0, W, line._renderCache.height, 
        (W - W * scale) / 2, 
        (line._renderCache.height - line._renderCache.height * scale) / 2, 
        W * scale, 
        line._renderCache.height * scale
      );
      
      ctx.restore();
      curY += line.calculatedHeight + paraGap;
    });

    ctx.restore();
    return;
  }

  const line = wrappedLyrics[activeIdx];
  const activeSz = line.activeSz;
  const activeLine = wrappedLyrics[activeIdx];
  const hasNext = activeIdx + 1 < wrappedLyrics.length;

  const hasPrev = activeIdx > 0;
  let screenWasBlank = true;
  if (hasPrev) {
    const prevLine = wrappedLyrics[activeIdx - 1];
    const prevGap = activeLine.time - prevLine.time;
    if (prevGap <= 2.0) screenWasBlank = false;
  }

  const elapsed = adjTime - line.time;
  const timeLeft = showDuration - elapsed;
  const gapToNext = hasNext ? wrappedLyrics[activeIdx + 1].time - activeLine.time : showDuration;

  const fadeInDur = screenWasBlank ? 0.3 : Math.min(0.15, gapToNext * 0.3);
  const fadeOutDur = Math.min(0.3, Math.max(0.08, gapToNext * 0.35));
  const scaleDur = Math.min(0.2, gapToNext * 0.25);

  // Good smooth scale/fade animation
  const scale = scaleDur > 0 ? Math.min(1, 0.96 + (elapsed / scaleDur) * 0.04) : 1.0; 
  let opacity = 1.0;
  if (elapsed < fadeInDur && fadeInDur > 0) {
    opacity = Math.max(0, Math.min(1, elapsed / fadeInDur)); // fade in
  } else if (timeLeft < fadeOutDur && fadeOutDur > 0) {
    opacity = Math.max(0, timeLeft / fadeOutDur); // fade out
  }

  const layoutAlpha = Math.max(0, Math.min(1, time) * Math.min(1, duration - time));

  ctx.save();
  ctx.globalAlpha = opacity * layoutAlpha;
  
  // Shift slightly up for vertical videos to avoid TikTok/IG bottom UI
  const targetY = isVertical ? H * 0.45 : H / 2;
  ctx.translate(tx, targetY);
  
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${activeSz * scale}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;

  const segments = line.wrapped;
  const transSegments = line.wrappedTrans || [];

  const transSz = line.transSz;
  const lh_act = activeSz * 1.38;
  const lhTrans = transSz * 1.38;
  const transGap = activeSz * 0.3;

  let totalH = segments.length * lh_act;
  if (transSegments.length > 0) {
    totalH += transGap + (transSegments.length * lhTrans);
  }
  const top = -totalH / 2;

  if (!line._renderCache) {
    line._renderCache = createCanvas(W, totalH + 100);
    const cctx = line._renderCache.getContext('2d');
    const ccy = line._renderCache.height / 2;
    const ccx = W / 2;

    const drawShadowText = (text, y, fontStr, primaryColor, glowColor) => {
      cctx.font = fontStr;
      cctx.textAlign = textAlign;
      cctx.textBaseline = 'middle';
      cctx.fillStyle = primaryColor || '#ffffff';

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
      drawShadowText(seg, curY - lh_act + activeSz * 0.5, `bold ${activeSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.8)');
    });

    if (transSegments.length > 0) {
      curY += transGap;
      transSegments.forEach((seg) => {
        curY += lhTrans;
        drawShadowText(seg, curY - lhTrans + transSz * 0.5, `600 ${transSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, '#ffffff', 'rgba(255, 255, 255, 0.6)');
      });
    }
  }

  ctx.save();
  ctx.globalAlpha = opacity * layoutAlpha;
  ctx.translate(-W/2, -line._renderCache.height / 2);
  ctx.drawImage(line._renderCache, 0, 0, W, line._renderCache.height, (W - W * scale) / 2, (line._renderCache.height - line._renderCache.height * scale) / 2, W * scale, line._renderCache.height * scale);
  ctx.restore();
  ctx.restore();
}


// ΓöÇΓöÇ Watermark ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawWatermark(ctx, w, h, time, logoImg) {
  if (!logoImg) return;
  ctx.save();
  
  const margin = Math.round(Math.min(w, h) * 0.05);
  
  // Constrain width to 10% of screen width, or height to 5% of screen height
  const aspect = logoImg.width / logoImg.height;
  let drawW = w * 0.10;
  let drawH = drawW / aspect;
  
  if (drawH > h * 0.05) {
    drawH = h * 0.05;
    drawW = drawH * aspect;
  }
  
  const lx = margin;
  const ly = h - margin - drawH;
  
  // Floating offset using sine wave based on time
  const floatY = Math.sin(time * 2.0) * 3.5;
  
  // 100% visible
  ctx.globalAlpha = 1.0;
  
  ctx.drawImage(logoImg, lx, ly + floatY, drawW, drawH);
  ctx.restore();
}
// ΓöÇΓöÇ Audio amplitude envelope ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Audio amplitude start detection ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ SLIDESHOW RENDERER ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function wrapText(ctx, text, fontSize, maxW, fontFam) {
  ctx.font = `bold ${Math.round(fontSize)}px "${fontFam}"`;
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxW) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

// ΓöÇΓöÇ THUMBNAIL ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function drawCoverBackground(ctx, W, H, coverImg) {
  if (!coverImg) {
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Blur: 15px kills any text printed on the cover art while keeping colors/shapes recognisable.
  // (22px was too aggressive — turned everything into a colour blob)
  ctx.filter = 'blur(15px) brightness(82%)';
  
  // Crop & scale to cover 16:9 canvas
  const iW = coverImg.width;
  const iH = coverImg.height;
  const targetRatio = W / H;
  const currentRatio = iW / iH;
  let sx, sy, sw, sh;
  if (currentRatio > targetRatio) {
    sh = iH;
    sw = iH * targetRatio;
    sx = (iW - sw) / 2;
    sy = 0;
  } else {
    sw = iW;
    sh = iW / targetRatio;
    sx = 0;
    sy = (iH - sh) / 2;
  }
  // Expand slightly by 20px on each side to prevent transparent edges from blur
  ctx.drawImage(coverImg, sx, sy, sw, sh, -20, -20, W + 40, H + 40);
  ctx.restore();
  
  // Draw a dark overlay (40% opacity black is enough with the blur and brightness filter)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function generateThumbnail(coverImg, colors, title, artist, font, alignment, wrappedLyrics, duration, logoImg, W = 1280, H = 720, style = 'A') {
  const tc  = createCanvas(W, H);
  const ctx = tc.getContext('2d');

  // 1. Draw background
  if (style === 'B') {
    drawCoverBackground(ctx, W, H, coverImg);
  } else {
    drawBackground(ctx, W, H, coverImg, colors, 10.0, 0.0);
  }

  // 2. Draw content
  if (style === 'B') {
    drawThumbnailBContent(ctx, W, H, title, artist, font);
  } else {
    drawSharedIntro(ctx, W, H, coverImg, title, artist, font);
  }

  // Draw watermark logo removed from thumbnail
  // drawWatermark(ctx, W, H, 0.0, logoImg);

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


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// MAIN RENDER ENGINE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// ΓöÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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
  linesPerScreen = 1,
  progressCallback = () => {},
}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Reset background caches for multi-render safety
      _blobCanvas = null;
      _blobCtx = null;
      _blurCanvas = null;
      _leftLayoutCache = null;
      _albumPanelCache = null;
      _introCache = null;

      // ── Geometry ──────────────────────────────────────────────
      const W   = isShort ? (resolution === '1080' ? 1080 : 720) : (resolution === '1080' ? 1920 : 1280);
      const H   = isShort ? (resolution === '1080' ? 1920 : 1280) : (resolution === '1080' ? 1080 : 720);
      const FPS = parseInt(fps, 10) || 24;
      const FONT = '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"';

      // Shorts need slightly smaller text (around 80-90px) to prevent excessive wrapping
      const ACT_SZ  = isShort ? Math.min(Math.round(W * 0.085), 95) : Math.min(Math.round(H * 0.065), 72);
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

      let resolvedArtPath = artworkPath;
      if (resolvedArtPath && !fs.existsSync(resolvedArtPath)) {
        const tempMatch = resolvedArtPath.match(/temp[/\\]([^?#]+)/);
        if (tempMatch) {
          const localFile = path.join(__dirname, 'temp', tempMatch[1]);
          if (fs.existsSync(localFile)) resolvedArtPath = localFile;
        }
      }

      if (resolvedArtPath && fs.existsSync(resolvedArtPath)) {
        try {
          coverImg = await loadImage(resolvedArtPath);
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
          
          if (colors && colors.saturation > 0.12) {
            bx.filter = 'saturate(200%) brightness(110%)';
          } else {
            bx.filter = 'none';
          }
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
      console.log('[DEBUG] First lyric object in renderer:', adjustedLyrics[0]);
      console.log('[DEBUG] Second lyric object in renderer:', adjustedLyrics[1]);

      // ── Pre-compute wrapped lyrics ────────────────────────────
      ctx.font = `bold ${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`;
      const wrappedLyrics = precomputeWrappedLyrics(ctx, adjustedLyrics, `bold ${ACT_SZ}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"`, maxWidth, ACT_SZ, linesPerScreen, H);
      console.log(`[Renderer] Pre-wrapped ${wrappedLyrics.length} lyric lines ✓`);

      // ── Save thumbnail & metadata ───────────────────────────────
      const thumbPath = outputPath.replace('.mp4', '_thumbnail_A.jpg');
      fs.writeFileSync(thumbPath, generateThumbnail(coverImg, colors, songTitle, songArtist, FONT, alignment, wrappedLyrics, duration, logoImg, W, H, 'A'));

      const thumbPathB = outputPath.replace('.mp4', '_thumbnail_B.jpg');
      fs.writeFileSync(thumbPathB, generateThumbnail(coverImg, colors, songTitle, songArtist, FONT, alignment, wrappedLyrics, duration, logoImg, W, H, 'B'));
      console.log(`[Renderer] Thumbnail saved ✓`);

      const txtPath = outputPath.replace('.mp4', '_metadata.txt');
      const hasTranslation = lyrics.some(l => l.translation);
      const suffix = hasTranslation ? "(Lyrics & English Translation)" : "(Lyrics)";
      
      const seoTitle = `${songArtist} - ${songTitle} ${suffix}`;
      const seoDesc = `Enjoy the beautifully styled lyrics and English translation for "${songTitle}" by ${songArtist}.

Rendered dynamically via Noises Lyrics Studio.`;
      const autoTags = seoKeywords && seoKeywords.length > 0 ? seoKeywords.join(', ') + ', ' : '';
      const seoTags = `${autoTags}${songArtist}, ${songTitle}, Lyrics, ${hasTranslation ? 'English Translation, ' : ''}Pop, Music, Audio`;
      
      const metadataContent = `== YOUTUBE SEO METADATA ==

TITLE:
${seoTitle}

DESCRIPTION:
${seoDesc}

TAGS:
${seoTags}
`;
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
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-vsync', 'cfr',                     // Force Constant Frame Rate (bundled ffmpeg is 4.x — -fps_mode not available until 5.1)
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

          // Fade in Intro Text
          if (!_introCache) {
              _introCache = createCanvas(W, H);
              const cctx = _introCache.getContext('2d');
              drawSharedIntro(cctx, W, H, coverImg, songTitle, songArtist, FONT);
            }
          ctx.drawImage(_introCache, 0, 0);
          ctx.restore();

        
        // ── PLAYBACK ─────────────────────────────────────────────
        } else {
          if (alignment === 'left') {
            drawLeftSplitLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, duration, FONT);
          } else {
            drawAlbumPanel(ctx, coverImg, songTitle, songArtist, W, H, FONT, songTime, duration);
          }

          // Lyrics panel static layout (auto-calculates activeIdx and fades inside)
          drawLyricsPanel(ctx, W, H, songTime + appliedOffset, wrappedLyrics, FONT, alignment, duration, ACT_SZ, linesPerScreen);
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

// ── SLIDESHOW RENDERER ─────────────────────────────────────────────────────────
async function renderSlideshow({
  artworkPath,
  lyrics = [],
  outputPath,
  songTitle = 'Unknown',
  songArtist = 'Unknown',
  resolution = '720',
  alignment = 'center',
  progressCallback = () => {},
}) {
  return new Promise((resolve, reject) => {
    try {
      const W   = 1080;
      const H   = 1080; // Force 1:1 cross-platform square for IG/TikTok
      const FONT = '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"';
      
      const ACT_SZ  = Math.min(Math.round(W * 0.095), 105);
      const maxWidth = Math.round(W * 0.85);

      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // We need to load images sync/async
      loadImage(path.join(__dirname, 'public', 'logo_white.png')).then(logoImg => {
        let coverImg = null, colors = null;
        const processSlides = () => {
          for (let i = 0; i < lyrics.length; i++) {
            const line = lyrics[i];
            const songTime = line.time + 0.1; // offset slightly to ensure it's active

            ctx.clearRect(0, 0, W, H);
            
            // Draw Background (Static 10.0s matches Thumbnail mesh gradient)
            drawBackground(ctx, W, H, coverImg, colors, 10.0, 0.0);

            // Calculate active lyric size
            let activeSz = ACT_SZ;
            const isHindi = /[\u0900-\u097F]/.test(line.text);
            if (isHindi) activeSz *= 1.25;

            // Dimensions and layout calculations
            const artSz = Math.round(H * 0.20); // Small art
            const radius = Math.round(artSz * 0.08);
            const ax = Math.round((W - artSz) / 2);
            const titleSz = Math.round(H * 0.040);
            const artistSz = Math.round(H * 0.024);
            const gap1 = Math.round(H * 0.03); // Art to title
            const gap2 = Math.round(H * 0.01);  // Title to artist
            
            // Measure Lyrics block
            ctx.textAlign = 'center';
            const lines = wrapText(ctx, line.text, activeSz * 0.8, maxWidth, FONT);
            let lyricsBlockH = lines.length * activeSz;
            
            let transLines = [];
            if (line.translation) {
              transLines = wrapText(ctx, line.translation, activeSz * 0.5, maxWidth, FONT);
              lyricsBlockH += (activeSz * 0.5) + (transLines.length * (activeSz * 0.5));
            }

            // Draw Header (exactly like the video mini-player)
            drawAlbumPanel(ctx, coverImg, songTitle, songArtist, W, H, FONT, 10.0, 20.0);

            // 4. Draw Lyrics (Centered perfectly in the canvas)
            let ay = Math.round(H * 0.50) - (lyricsBlockH / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const l of lines) {
              ctx.font = `bold ${Math.round(activeSz * 0.8)}px ${FONT}`;
              ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 2;
                ctx.fillText(l, W / 2, ay);
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 0;
              ay += activeSz;
            }
            
            if (line.translation) {
              ay += (activeSz * 0.5);
              for (const l of transLines) {
                ctx.font = `bold ${Math.round(activeSz * 0.5)}px ${FONT}`;
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 2;
                ctx.fillText(l, W / 2, ay);
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 0;
                ay += (activeSz * 0.5);
              }
            }

            // Watermark
            drawWatermark(ctx, W, H, songTime, logoImg);

            const buf = canvas.toBuffer('image/png');
            zip.addFile(`slide_${(i+1).toString().padStart(3, '0')}.png`, buf);

            progressCallback(Math.floor((i / lyrics.length) * 100));
          }
          
                    // Generate thumbnails for slideshow
          const thumbPathA = outputPath.replace('.zip', '_thumbnail_A.jpg');
          fs.writeFileSync(thumbPathA, generateThumbnail(coverImg, colors, songTitle, songArtist, FONT, alignment, [], 0, logoImg, W, H, 'A'));
          const thumbPathB = outputPath.replace('.zip', '_thumbnail_B.jpg');
          fs.writeFileSync(thumbPathB, generateThumbnail(coverImg, colors, songTitle, songArtist, FONT, alignment, [], 0, logoImg, W, H, 'B'));
          
          zip.writeZip(outputPath);
          console.log(`[Slideshow] Done → ${outputPath}`);
          resolve(outputPath);
        };

        if (artworkPath && fs.existsSync(artworkPath)) {
          loadImage(artworkPath).then(img => {
            coverImg = img;
            colors = extractColors(coverImg);
            
            // Generate _blurCanvas for slideshow background
            _blurCanvas = createCanvas(32, 18);
            const bx = _blurCanvas.getContext('2d');
            const iW = coverImg.width || 1000;
            const iH = coverImg.height || 1000;
            const target = 32 / 18;
            const ratio = iW / iH;
            let sx, sy, sw, sh;
            if (ratio > target) { sh = iH; sw = iH * target; sx = (iW - sw) / 2; sy = 0; }
            else                { sw = iW; sh = iW / target; sx = 0; sy = (iH - sh) / 2; }
            
            if (colors && colors.saturation > 0.12) {
              bx.filter = 'saturate(200%) brightness(110%)';
            } else {
              bx.filter = 'none';
            }
            bx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, 32, 18);
            processSlides();
          });
        } else {
          processSlides();
        }
      });

    } catch (e) {
      reject(e);
    }
  });
}

async function generateThumbnailBuffer({ title, artist, artworkUrl, theme, logoPath, style = 'A' }) {
  const coverImg = await loadImage(artworkUrl);
  const logoImg = logoPath ? await loadImage(logoPath).catch(()=>null) : null;
  
  const colors = extractColors(coverImg);
  
  _blurCanvas = createCanvas(32, 18);
  const bx = _blurCanvas.getContext('2d');
  const iW = coverImg.width || 1000;
  const iH = coverImg.height || 1000;
  const target = 32 / 18;
  const ratio = iW / iH;
  let sx, sy, sw, sh;
  if (ratio > target) { sh = iH; sw = iH * target; sx = (iW - sw) / 2; sy = 0; }
  else                { sw = iW; sh = iW / target; sx = 0; sy = (iH - sh) / 2; }
  
  if (colors && colors.saturation > 0.12) {
    bx.filter = 'saturate(200%) brightness(110%)';
  } else {
    bx.filter = 'none';
  }
  bx.drawImage(coverImg, sx, sy, sw, sh, 0, 0, 32, 18);
  
  const font = '"Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"';
  const buf = generateThumbnail(coverImg, colors, title, artist, font, 'center', [], 0, logoImg, 1280, 720, style);
  
  _blurCanvas = null;
  
  return buf;
}

module.exports = {
  renderVideo,
  renderSlideshow,
  generateThumbnail,
  generateThumbnailBuffer,
};
function drawSharedIntro(ctx, W, H, coverImg, title, artist, font) {
    const artSz = Math.round(H * 0.55);
    const radius = Math.round(artSz * 0.06);
  
    const ax = Math.round((W - artSz) / 2);
    
    // Baseline font sizes
    let titleSz = Math.round(H * 0.095);
    let artistSz = Math.round(H * 0.065); // raised from 0.048 — short names like "The Police" were too small
    
    const gap1 = Math.round(H * 0.05);
    const gap2 = Math.round(H * 0.02);
    const maxTextWidth = Math.round(W * 0.92);

    // Smart Fit: Title
    ctx.font = `bold ${titleSz}px ${font}`;
    let titleWidth = ctx.measureText(title).width;
    if (titleWidth > maxTextWidth) {
      titleSz = Math.floor(titleSz * (maxTextWidth / titleWidth));
      ctx.font = `bold ${titleSz}px ${font}`;
      titleWidth = ctx.measureText(title).width;
    }
    
    // Smart Fit: Artist
    ctx.font = `bold ${artistSz}px ${font}`;
    let artistWidth = ctx.measureText(artist).width;
    if (artistWidth > maxTextWidth) {
      artistSz = Math.floor(artistSz * (maxTextWidth / artistWidth));
      ctx.font = `bold ${artistSz}px ${font}`;
      artistWidth = ctx.measureText(artist).width;
    }

    const titleLineHeight = Math.round(titleSz * 1.25);
    const totalH = artSz + gap1 + titleLineHeight + gap2 + artistSz;
    const ay = Math.round((H - totalH) / 2);
    const titleY = ay + artSz + gap1;
    const artistY = titleY + titleLineHeight + gap2;
  
    // Draw Album Art
    if (coverImg) {
      // Shadow first (drawn before clip so shadow spreads outside)
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.beginPath();
      ctx.roundRect(ax, ay, artSz, artSz, radius);
      ctx.fill();
      ctx.restore();

      // Clipped image
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.beginPath();
      ctx.roundRect(ax, ay, artSz, artSz, radius);
      ctx.clip();
      ctx.drawImage(coverImg, ax, ay, artSz, artSz);
      ctx.restore();

      // Subtle white border ring
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

  
    // Multi-layer drop shadow text helper
    const drawPremiumText = (text, yPos, fontSize, weight = 'bold') => {
      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';

      // Layer 1: Wide ambient dark halo (no offset, just spread)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(text, W / 2, yPos);
      
      // Layer 2: Sharp core drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      ctx.fillText(text, W / 2, yPos);
      
      // Layer 3: Clean crisp white text on top
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(text, W / 2, yPos);
      ctx.restore();
    };

    // Draw Texts — artist uses weight 600 (lighter) to contrast bold title
    drawPremiumText(title, titleY, titleSz, 'bold');
    drawPremiumText(artist, artistY, artistSz, '600');
  }


function drawThumbnailBContent(ctx, W, H, title, artist, font) {
    const titleLen = title.length;
    let baseTitleSz = Math.round(H * 0.28); // Very big default for short titles
    if (titleLen > 12) {
        baseTitleSz = Math.round(H * 0.22); // Standard size for medium titles
    }
    if (titleLen > 25) {
        baseTitleSz = Math.round(H * 0.16); // Smaller size for long titles
    }
    
    const maxTextWidth = Math.round(W * 0.88);
    const gap = Math.round(H * 0.07);

    let titleSz = baseTitleSz;

    // Step 1: Squish Title to fit max width
    ctx.font = `bold ${titleSz}px ${font}`;
    let titleWidth = ctx.measureText(title).width;
    if (titleWidth > maxTextWidth) {
      titleSz = Math.floor(titleSz * (maxTextWidth / titleWidth));
      ctx.font = `bold ${titleSz}px ${font}`;
    }

    // Step 2: Bulletproof Artist Scaling Math
    // Ideal is 45% of the final title size (enough to read clearly without competing with title)
    let idealArtistSz = Math.round(titleSz * 0.45);
    // Legibility floor: never below ~9% of canvas height (64px on 720p) — "The Police" was 43px before
    let floorArtistSz = Math.round(H * 0.09);
    // Hierarchy ceiling: NEVER be bigger than 75% of the title size (so it's always secondary)
    let ceilArtistSz = Math.round(titleSz * 0.75);

    // Apply floor, then ceiling
    let artistSz = Math.max(idealArtistSz, floorArtistSz);
    artistSz = Math.min(artistSz, ceilArtistSz);
    
    // Get true visual height of title for perfect centering
    let titleMetrics = ctx.measureText(title);
    let titleTrueH = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
    let titleAscent = titleMetrics.actualBoundingBoxAscent;

    // Smart Fit: Artist
    ctx.font = `600 ${artistSz}px ${font}`;
    let artistWidth = ctx.measureText(artist).width;
    if (artistWidth > maxTextWidth) {
      artistSz = Math.floor(artistSz * (maxTextWidth / artistWidth));
      ctx.font = `600 ${artistSz}px ${font}`;
    }
    
    // Get true visual height of artist
    let artistMetrics = ctx.measureText(artist);
    let artistTrueH = artistMetrics.actualBoundingBoxAscent + artistMetrics.actualBoundingBoxDescent;
    let artistAscent = artistMetrics.actualBoundingBoxAscent;

    // Treat them as a single group box again and center the group for vertical symmetry
    const totalGroupH = titleTrueH + gap + artistTrueH;
    const groupTop    = (H - totalGroupH) / 2;  

    const titleY  = groupTop + titleAscent;
    const artistY = groupTop + titleTrueH + gap + artistAscent;

    // Note: no gradient band behind text — the 3-layer text shadow (below) handles contrast cleanly
    // without leaving a visible dark rectangle over the cover art.

    // Multi-layer drop shadow text helper (uses alphabetic baseline for true precision)
    const drawPremiumText = (text, yPos, fontSize, weight = 'bold') => {
      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${font}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic'; // ← we manually offset the baseline
      ctx.fillStyle = '#ffffff';

      // Layer 1: Wide ambient dark halo
      ctx.shadowColor   = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur    = 40;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(text, W / 2, yPos);

      // Layer 2: Sharp core drop shadow
      ctx.shadowColor   = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur    = 16;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
      ctx.fillText(text, W / 2, yPos);

      // Layer 3: Clean crisp white on top (no shadow)
      ctx.shadowColor   = 'transparent';
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(text, W / 2, yPos);
      ctx.restore();
    };

    drawPremiumText(title,  titleY,  titleSz,  'bold');
    drawPremiumText(artist, artistY, artistSz, '600');
}
