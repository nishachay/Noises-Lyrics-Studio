/**
 * NOISES STUDIO — app.js v4.0
 * First-principles rebuild. Clean architecture.
 * 
 * Sections:
 *   1. STATE
 *   2. DOM REFERENCES
 *   3. AUDIO ENGINE  (native <audio> + /api/stream)
 *   4. CANVAS ENGINE (60fps preview matching the output video)
 *   5. SEARCH ENGINE (debounced iTunes + YouTube search)
 *   6. LYRICS ENGINE (LRC parse, spread, wrap, find active)
 *   7. SYNC UI       (vertical list, tap-stamp, inline edit)
 *   8. PLAYER UI     (scrubber, time display, play/pause)
 *   9. COMPILATION   (SSE render stream)
 *  10. EVENT LISTENERS
 *  11. INIT
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. STATE
// ═══════════════════════════════════════════════════════════════════

const S = {
  // Track metadata
  track: null,          // { title, artist, artworkUrl, duration, youtubeId }
  lyricsRecords: [],    // Raw records from LRCLIB
  lyrics: [],           // Active working set: [{ time, text }]
  lyricsType: 'none',   // 'synced' | 'plain' | 'none'
  syncOffset: 0.0,

  // UI state
  activeTab: 'tab-sync',
  lastHighlightIdx: -1,

  // Tap-sync state
  tapMode: false,
  tapLines: [],
  tapIdx: 0,

  // Search
  searchResults: [],
  searchHighlight: -1,

  // Audio
  audioReady: false,
  audioDuration: 0,

  // Lyrics scroll state
  currentScrollY: 0,
};

// ═══════════════════════════════════════════════════════════════════
// 2. DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

// Views
const viewStudio    = $('view-studio');
const viewProgress  = $('view-progress');
const viewDone      = $('view-done');

// Search modal
const searchModal   = $('search-modal');
const modalQuery    = $('modal-query');
const modalSuggestions = $('modal-suggestions');
const modalResultList  = $('modal-result-list');
const modalSearching   = $('modal-searching');
const modalEmpty       = $('modal-empty');
const btnSearchYtFallback = $('btn-search-yt-fallback');

// Lyrics Search modal
const lyricsModal         = $('lyrics-modal');
const modalLyricsQuery    = $('modal-lyrics-query');
const modalLyricsList     = $('modal-lyrics-list');
const modalLyricsSearching= $('modal-lyrics-searching');
const modalLyricsEmpty    = $('modal-lyrics-empty');
const btnLyricsModalClose = $('btn-lyrics-modal-close');
const btnManualLyrics     = $('btn-manual-lyrics');

// Header
const headerSkeleton  = $('header-skeleton');
const headerTrackContent = $('header-track-content');
const headerArt       = $('header-art');
const headerTitle     = $('header-title');
const headerArtist    = $('header-artist');

// Canvas
const canvas       = $('preview-canvas');
const ctx          = canvas.getContext('2d');
const audioOverlay = $('audio-loading-overlay');
const audioLoadTxt = $('audio-loading-text');

// Player
const btnPlay        = $('btn-play');
const iconPlay       = $('icon-play');
const iconPause      = $('icon-pause');
const playerTime     = $('player-time');
const scrubber       = $('player-scrubber');
const scrubberFill   = $('scrubber-fill');

// Sidebar
const lyricsSource = $('lyrics-source');
const editTitle    = $('edit-title');
const editArtist   = $('edit-artist');
const btnTapToggle = $('btn-tap-toggle');
const btnReset     = $('btn-reset-timings');
const tapBanner    = $('tap-banner');
const lyricsList   = $('lyrics-list');
const tapFooter    = $('tap-footer');
const btnTap       = $('btn-tap');
const lyricsEditor = $('lyrics-editor');
const editorFormat = $('editor-format');
const btnApply     = $('btn-apply');
const syncOffsetEl = $('sync-offset');
const offsetLabel  = $('offset-label');
const btnCompile   = $('btn-compile');
const btnSearch    = $('btn-search');
const btnModalClose = $('btn-modal-close');

// Progress view
const progArt    = $('prog-art');
const progTitle  = $('prog-title');
const progArtist = $('prog-artist');
const progStatus = $('prog-status');
const progFill   = $('prog-fill');
const progPct    = $('prog-pct');
const progLog    = $('prog-log');
const btnCancel  = $('btn-cancel');

// Done view
const doneSub      = $('done-sub');
const btnDlVideo   = $('btn-dl-video');
const btnDlThumb   = $('btn-dl-thumb');
const ytTitle      = $('yt-title');
const ytDesc       = $('yt-desc');
const btnAgain     = $('btn-again');

// Settings
const selectRes   = $('select-res');
const selectFps   = $('select-fps');
const selectAlign = $('select-align');

// ═══════════════════════════════════════════════════════════════════
// 3. AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════

let audio = null;           // Native <audio> element
let scrubbing = false;
let trackingInterval = null;
let activeSSE = null;

function initAudio(videoId) {
  if (!audio) {
    audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.style.display = 'none';
    document.body.appendChild(audio);

    audio.addEventListener('canplay', () => {
      S.audioReady = true;
      S.audioDuration = audio.duration || 0;
      btnPlay.disabled = false;
      audioOverlay.classList.add('hidden');
    });
    audio.addEventListener('waiting', () => {
      if (!S.audioReady) return; // Only show if we were previously ready
    });
    audio.addEventListener('play', () => {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      startTracking();
    });
    audio.addEventListener('pause', () => {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      stopTracking();
    });
    audio.addEventListener('ended', () => {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      stopTracking();
    });
  }

  if (audio.dataset.videoId === videoId) return;

  // New track — reset and load
  audio.pause();
  audio.dataset.videoId = videoId;
  S.audioReady = false;
  S.audioDuration = 0;

  // Show loading state
  btnPlay.disabled = true;
  audioOverlay.classList.remove('hidden');
  audioLoadTxt.textContent = 'Loading audio stream...';

  // Try to connect
  audio.src = `/api/stream/${videoId}`;
  audio.load();
}

function startTracking() {
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(updatePlayerUI, 80);
}

function stopTracking() {
  if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
}

function updatePlayerUI() {
  if (!audio || !S.audioReady) return;
  const cur = audio.currentTime || 0;
  const dur = audio.duration || 0;

  const fmt = s => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  playerTime.textContent = `${fmt(cur)} / ${fmt(dur)}`;

  if (!scrubbing && dur > 0) {
    const pct = cur / dur;
    scrubber.value = pct * 1000;
    scrubberFill.style.width = `${pct * 100}%`;
  }

  updateSyncHighlight(cur);
}

function seekTo(t) {
  if (!audio) return;
  audio.currentTime = Math.max(0, Math.min(t, audio.duration || 0));
}

function getCurrentTime() {
  return audio ? (audio.currentTime || 0) : 0;
}

// ═══════════════════════════════════════════════════════════════════
// 4. CANVAS ENGINE
// ═══════════════════════════════════════════════════════════════════

let rafId = null;

// Cached rendering resources
let blurCanvas = null;        // Low-res album art for background blur
let colorData = null;         // Dominant colors { tl, tr, bl, br, c, rgb }
let artImg = null;            // Full artwork Image object
let blobCanvas = null;        // Offscreen canvas for color blobs
let blobCtx = null;

// Wrap cache — prevents repeated measureText calls
const wrapCache = new Map();

function startCanvasLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  const frame = () => {
    drawFrame();
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function stopCanvasLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── Draw blur background source from album art ────────────────────
function prepareBlurSource(img) {
  // 32x18 gives a super soft, premium gradient blur on stretch
  blurCanvas = document.createElement('canvas');
  blurCanvas.width = 32;
  blurCanvas.height = 18;
  const bx = blurCanvas.getContext('2d');

  // Cover-fit crop
  const W = img.naturalWidth || 1000;
  const H = img.naturalHeight || 1000;
  const target = 32 / 18;
  const ratio = W / H;
  let sx, sy, sw, sh;
  if (ratio > target) { sh = H; sw = H * target; sx = (W - sw) / 2; sy = 0; }
  else                { sw = W; sh = W / target; sx = 0; sy = (H - sh) / 2; }
  bx.drawImage(img, sx, sy, sw, sh, 0, 0, 32, 18);
}

// ── Extract dominant colors from album art ───────────────────────
function extractColors(img) {
  try {
    const tmp = document.createElement('canvas');
    tmp.width = 10; tmp.height = 10;
    const t = tmp.getContext('2d');
    t.drawImage(img, 0, 0, 10, 10);
    const d = t.getImageData(0, 0, 10, 10).data;
    const px = (x, y) => { const i = (y * 10 + x) * 4; return [d[i], d[i+1], d[i+2]]; };
    colorData = {
      tl: px(1,1), tr: px(8,1), bl: px(1,8), br: px(8,8), c: px(5,5),
      rgb: (r, g, b, a) => `rgba(${r},${g},${b},${a})`
    };
  } catch(e) { colorData = null; }
}

// ── Load artwork image ────────────────────────────────────────────
function loadArtwork(url) {
  if (!url) { artImg = null; blurCanvas = null; colorData = null; return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    artImg = img;
    prepareBlurSource(img);
    extractColors(img);
  };
  img.src = `/api/proxy?url=${encodeURIComponent(url)}`;
}

// ── Draw background (Apple Music style blurred art) ────
function drawBackground(W, H, t) {
  if (blurCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Apple music style: massive blur, slow breathe and slight rotation
    const zoom = 1.2 + 0.05 * Math.sin(t * 0.05);
    const angle = Math.sin(t * 0.02) * 0.05; // very subtle sway
    
    ctx.translate(W / 2, H / 2);
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);
    
    const dw = Math.max(W, H) * 1.5;
    const dh = dw;
    
    // Draw the extreme downsampled canvas (which creates a mesh gradient)
    ctx.drawImage(blurCanvas, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
  }

  // Soft darkening overlay for readability
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H);

  // Soft vignette
  const vig = ctx.createRadialGradient(W/2, H/2, W*0.2, W/2, H/2, W*0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ── Draw song info watermark (top-left) ───────────────────────────
function drawSongInfo(W, H) {
  if (!S.track) return;
  const margin = Math.round(Math.min(W, H) * 0.05);
  const artSz  = Math.round(Math.min(W, H) * 0.08);
  const ax = margin, ay = margin;
  const radius = Math.round(artSz * 0.15);

  if (artImg && artImg.complete) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = Math.round(artSz * 0.25);
    ctx.shadowOffsetY = Math.round(artSz * 0.1);
    
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.clip();
    ctx.drawImage(artImg, ax, ay, artSz, artSz);
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

  const tx = ax + artSz + Math.round(artSz * 0.25);
  const tSz = Math.round(artSz * 0.34);
  const aSz = Math.round(tSz * 0.70);
  const gap = Math.round(tSz * 0.15);
  
  // Vertically center the text block relative to the cover art using middle baseline
  const totalTextH = tSz + gap + aSz;
  const textCenterY = ay + artSz / 2;
  const titleY = textCenterY - (totalTextH / 2) + (tSz / 2);
  const artistY = titleY + (tSz / 2) + gap + (aSz / 2);

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = `700 ${tSz}px "Inter", "Noto Sans Devanagari", sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(S.track.title || '', tx, titleY);

  ctx.font = `500 ${aSz}px "Inter", "Noto Sans Devanagari", sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText(S.track.artist || '', tx, artistY);
  ctx.restore();
}

// ── Draw progress bar (bottom) ────────────────────────────────────
function drawProgressBar(W, H, songTime) {
  const dur = S.track ? S.track.duration : 0;
  if (!dur) return;
  const pct = Math.min(1, Math.max(0, songTime / dur));
  const barH = 3;
  const barY = H - barH;

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, barY, W, barH);

  // Fill
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, barY, W * pct, barH);
}

// ── Draw floating ♪ musical notes ─────────────────────────────
function drawInterludeDots(cx, cy, t) {
  const notes = ['♪', '♫', '♪'];
  const R = 7, GAP = 30;
  const totalW = 2 * R * 3 + GAP * 2;
  const startX = cx - totalW / 2 + R;

  ctx.save();
  ctx.font = `500 24px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < 3; i++) {
    const ph = t * 2.5 + i * 0.72;
    // float up and down
    const yOffset = Math.sin(ph) * 8;
    const al = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ph));
    
    ctx.fillStyle = `rgba(255,255,255,${al})`;
    ctx.fillText(notes[i], startX + i * (R * 2 + GAP), cy + yOffset);
  }
  ctx.restore();
}

// ── Text wrapping helper ──────────────────────────────────────────
function wrapText(text, maxW, font) {
  const key = `${text}|${maxW}|${font}`;
  if (wrapCache.has(key)) return wrapCache.get(key);
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW) { cur = t; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const result = lines.length ? lines : [text];
  wrapCache.set(key, result);
  return result;
}

let precomputedLyrics = [];

// ── Precompute wrapped lyrics and layout coordinates ──────────────
function precomputeLyricsLayout(W, H, alignment) {
  const lyrics = S.lyrics;
  if (!lyrics || !lyrics.length) {
    precomputedLyrics = [];
    return;
  }

  // Active line font size: ~40px
  const activeSz = Math.round(H * 0.055);
  const fontSpec = `700 ${activeSz}px "Inter", "Noto Sans Devanagari", sans-serif`;

  // Maximum width for lyrics:
  // - Left alignment (split screen): right panel gets 44% of width (~560px)
  // - Center alignment (fullscreen): 76% of width (~970px)
  const maxWidth = alignment === 'left' ? Math.round(W * 0.44) : Math.round(W * 0.76);

  ctx.save();
  ctx.font = fontSpec;

  const wrapped = lyrics.map(line => {
    const words = line.text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
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

  const lh = activeSz * 1.38;
  const paraGap = activeSz * 0.8;

  let currentTop = 0;
  precomputedLyrics = wrapped.map(line => {
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
  });
}

// ── Left Split Screen Layout (Watermark Cover Art + Player) ─────────
function drawLeftSplitLayout(W, H, songTime) {
  if (!S.track) return;

  const artSz = Math.round(H * 0.52);
  const ax = Math.round(W * 0.225 - artSz / 2);
  const ay = Math.round(H * 0.36 - artSz / 2);

  // Album cover with shadow and rounded corners
  if (artImg && artImg.complete) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, Math.round(artSz * 0.06));
    ctx.clip();
    ctx.drawImage(artImg, ax, ay, artSz, artSz);
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
  ctx.font = `800 ${titleSz}px "Inter", "Noto Sans Devanagari", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText(S.track.title || '', textX, titleY);

  // Artist Name
  ctx.font = `500 ${artistSz}px "Inter", "Noto Sans Devanagari", sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(S.track.artist || '', textX, titleY + titleSz + 8);
  ctx.restore();

  // Progress Bar
  const barW = artSz;
  const barH = 5;
  const bx = Math.round(W * 0.225 - barW / 2);
  const by = titleY + titleSz + artistSz + 42;

  const dur = S.track.duration || 0;
  const pct = dur > 0 ? Math.min(1, Math.max(0, songTime / dur)) : 0;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.roundRect(bx, by, barW, barH, barH / 2);
  ctx.fill();

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(bx, by, barW * pct, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  // Time stamps
  const fmt = s => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  ctx.save();
  ctx.font = `500 12px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.textBaseline = 'top';

  ctx.textAlign = 'left';
  ctx.fillText(fmt(songTime), bx, by + 12);

  ctx.textAlign = 'right';
  ctx.fillText(fmt(dur), bx + barW, by + 12);
  ctx.restore();
}

function drawLyrics(W, H, songTime) {
  if (!precomputedLyrics || !precomputedLyrics.length) {
    const alignment = selectAlign.value;
    const interludeX = alignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(interludeX, H / 2, songTime);
    return;
  }

  const adjTime = songTime + S.syncOffset;

  // Find active line index
  let activeIdx = -1;
  for (let i = 0; i < precomputedLyrics.length; i++) {
    if (precomputedLyrics[i].time <= adjTime) activeIdx = i;
    else break;
  }

  const alignment = selectAlign.value;
  const tx = alignment === 'left' ? Math.round(W * 0.48) : Math.round(W / 2);
  const textAlign = alignment === 'left' ? 'left' : 'center';

  // Make font size responsive but contained
  const activeSz = Math.min(Math.round(H * 0.058), 64);
  const lh_act = activeSz * 1.35;

  let showInterlude = false;
  let showDuration = 5.0;

  if (activeIdx >= 0) {
    const activeLine = precomputedLyrics[activeIdx];
    const hasNext = activeIdx + 1 < precomputedLyrics.length;
    const nextLine = hasNext ? precomputedLyrics[activeIdx + 1] : null;
    const gapToNext = hasNext ? nextLine.time - activeLine.time : Infinity;
    const elapsed = adjTime - activeLine.time;
    showDuration = Math.min(5.0, gapToNext);
    if (elapsed > 5.0 && gapToNext > 10.0) {
      showInterlude = true;
    }
  } else {
    showInterlude = true;
  }

  if (showInterlude || activeIdx === -1) {
    const interludeX = alignment === 'left' ? (W * 0.48 + W * 0.22) : (W / 2);
    drawInterludeDots(interludeX, H / 2, songTime);
    return;
  }

  const line = precomputedLyrics[activeIdx];
  const elapsed = adjTime - line.time;
  const timeLeft = showDuration - elapsed;

  // Good smooth scale/fade animation
  const scale = Math.min(1, 0.96 + elapsed * 0.2); 
  let opacity = 1.0;
  if (elapsed < 0.3) {
    opacity = elapsed / 0.3; // fade in
  } else if (timeLeft < 0.3) {
    opacity = Math.max(0, timeLeft / 0.3); // fade out
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(tx, H / 2);
  ctx.scale(scale, scale);

  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${activeSz}px "Inter", "Noto Sans Devanagari", sans-serif`;

  const segments = line.wrapped;
  const totalH = segments.length * lh_act;
  const top = -totalH / 2;

  segments.forEach((seg, wi) => {
    const wy = top + wi * lh_act + activeSz * 0.5;

    // Soft drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(seg, 0, wy);

    // Subtle glow instead of massive one
    ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 0;
    ctx.fillText(seg, 0, wy);
  });

  ctx.restore();
}


// ── Empty state canvas (no track loaded) ─────────────────────────
function drawEmptyState(W, H, t) {
  // Dark base
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);

  // Subtle emerald glow
  const gx = W * 0.5, gy = H * 0.5;
  const gr = Math.max(W, H) * 0.5;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
  g.addColorStop(0, 'rgba(16,185,129,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Pulsing center dot
  const pulse = 1 + 0.05 * Math.sin(t * 2.2);
  ctx.save();
  ctx.translate(W / 2, H / 2 - 38);

  // Outer rings
  for (let i = 0; i < 2; i++) {
    const r = (60 + i * 32) * pulse;
    ctx.strokeStyle = `rgba(16,185,129,${0.06 - i * 0.02})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center emerald dot
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 16 + 6 * Math.sin(t * 3);
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Demo lyric text
  const demo = 'We don\'t make music, we make music beautiful.';
  const sz = Math.round(H * 0.048);
  const lw = W * 0.72;
  const font = `700 ${sz}px "Inter", sans-serif`;
  const demoLine = demo;
  const segments = wrapText(demoLine, lw, font);

  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.shadowColor = 'rgba(255,255,255,0.2)';
  ctx.shadowBlur = 12;
  const lh = sz * 1.38;
  const totalH = segments.length * lh;
  const startY = H / 2 + 30;
  segments.forEach((s, i) => ctx.fillText(s, W / 2, startY - totalH / 2 + i * lh + sz * 0.5));
  ctx.restore();

  // Watermark
  ctx.save();
  ctx.font = `700 ${Math.round(W * 0.012)}px "Inter", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('NOISES STUDIO', W * 0.034, H - H * 0.038);
  ctx.restore();

  // Search hint
  ctx.save();
  ctx.font = `500 ${Math.round(W * 0.011)}px "Inter", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Ctrl K to search a song', W - W * 0.034, H - H * 0.038);
  ctx.restore();
}

// ── Loading state canvas (resolving track) ────────────────────────
function drawLoadingState(W, H, t) {
  // Background
  if (blurCanvas) {
    drawBackground(W, H, t);
  } else {
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, W, H);
  }

  // Pulsing rings
  ctx.save();
  ctx.translate(W / 2, H / 2 - 30);
  for (let i = 0; i < 3; i++) {
    const ringT = (t * 0.9 + i / 3) % 1;
    const r = ringT * 80;
    const op = (1 - ringT) * 0.5;
    ctx.strokeStyle = `rgba(16,185,129,${op})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Center dot
  ctx.fillStyle = '#10b981';
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 10 + 5 * Math.sin(t * 4);
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Status text
  ctx.save();
  ctx.font = `500 ${Math.round(W * 0.014)}px "Inter", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Searching for track...', W / 2, H / 2 + 60);
  ctx.restore();
}

// ── Main frame ────────────────────────────────────────────────────
let resolving = false;

function drawFrame() {
  const W = canvas.width;
  const H = canvas.height;
  const t = performance.now() / 1000;

  if (resolving) {
    drawLoadingState(W, H, t);
    return;
  }

  if (!S.track) {
    drawEmptyState(W, H, t);
    return;
  }

  const songTime = getCurrentTime();
  drawBackground(W, H, t);

  const alignment = selectAlign.value;
  if (alignment === 'left') {
    drawLeftSplitLayout(W, H, songTime);
    drawLyrics(W, H, songTime);
  } else {
    drawSongInfo(W, H);
    drawLyrics(W, H, songTime);
    drawProgressBar(W, H, songTime);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. SEARCH ENGINE
// ═══════════════════════════════════════════════════════════════════

let searchTimer = null;

function openSearch() {
  searchModal.classList.remove('hidden');
  modalQuery.value = '';
  modalQuery.focus();
  showSuggestions();
}

function closeSearch() {
  searchModal.classList.add('hidden');
  modalQuery.blur();
}

function showSuggestions() {
  modalSuggestions.classList.remove('hidden');
  modalResultList.classList.add('hidden');
  modalSearching.classList.add('hidden');
  modalEmpty.classList.add('hidden');
  S.searchResults = [];
  S.searchHighlight = -1;
}

function showSearching(msg = 'Searching iTunes...') {
  modalSuggestions.classList.add('hidden');
  modalResultList.classList.add('hidden');
  modalSearching.classList.remove('hidden');
  modalEmpty.classList.add('hidden');
  modalSearching.querySelector('span').textContent = msg;
}

// (Removed showResults and yt fallback)

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDur(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}



async function performSearch(query, prefilledResult = null) {
  // Reset state
  S.track = null;
  S.lyrics = [];
  S.lyricsRecords = [];
  S.lyricsType = 'none';
  S.syncOffset = 0;
  S.lastHighlightIdx = -1;
  artImg = null; blurCanvas = null; colorData = null;
  wrapCache.clear();

  resolving = true;
  matchSkeleton(true);
  btnCompile.disabled = true;
  lyricsSource.disabled = true;
  lyricsSource.innerHTML = '<option>Searching...</option>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    if (!data.bestMatch) throw new Error('No match found');

    S.track = data.bestMatch;
    S.lyricsRecords = data.lyricsRecords || [];

    // Load artwork
    loadArtwork(S.track.artworkUrl);

    // Header UI
    matchSkeleton(false);
    headerTitle.textContent  = S.track.title;
    headerArtist.textContent = S.track.artist;
    editTitle.value = S.track.title || '';
    editArtist.value = S.track.artist || '';
    
    const editCover = document.getElementById('edit-cover');
    const editCoverPreview = document.getElementById('edit-cover-preview');
    if (editCover) editCover.value = S.track.artworkUrl || '';
    if (editCoverPreview) {
      if (S.track.artworkUrl) {
        editCoverPreview.src = S.track.artworkUrl;
        editCoverPreview.classList.remove('hidden');
      } else {
        editCoverPreview.classList.add('hidden');
      }
    }

    if (S.track.artworkUrl) {
      headerArt.src = S.track.artworkUrl;
      headerArt.style.display = 'block';
    }

    // Init audio
    if (S.track.youtubeId) {
      initAudio(S.track.youtubeId);
    }

    // Lyrics
    populateLyricsSource();
    autoSelectBestLyrics();

    // Offset
    if (data.detectedOffset !== undefined) {
      const off = Math.max(-15, Math.min(15, data.detectedOffset));
      S.syncOffset = off;
      syncOffsetEl.value = off;
      offsetLabel.textContent = `${off >= 0 ? '+' : ''}${off.toFixed(1)}s`;
    }

    resolving = false;
    btnCompile.disabled = false;
    lyricsSource.disabled = false;

  } catch (err) {
    console.error('[Search]', err.message);
    resolving = false;
    lyricsSource.innerHTML = `<option>Search failed: ${err.message}</option>`;
    alert(`Could not load song: ${err.message}`);
  }
}

function matchSkeleton(show) {
  if (show) {
    headerSkeleton.classList.remove('hidden');
    headerTrackContent.classList.add('hidden');
  } else {
    headerSkeleton.classList.add('hidden');
    headerTrackContent.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. LYRICS ENGINE
// ═══════════════════════════════════════════════════════════════════

function parseLRC(lrc) {
  if (!lrc) return [];
  const RE = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  const out = [];
  for (const line of lrc.split(/\r?\n/)) {
    const times = [];
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(line)) !== null) {
      const ms = m[3] ? (m[3].length === 2 ? parseInt(m[3]) * 10 : parseInt(m[3])) : 0;
      times.push(parseInt(m[1]) * 60 + parseInt(m[2]) + ms / 1000);
    }
    const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
    if (times.length && text) times.forEach(t => out.push({ time: t, text }));
  }
  return out.sort((a, b) => a.time - b.time);
}

function lyricsToLRC(lines) {
  return lines.map(l => {
    if (l.time === null || l.time === undefined) return l.text;
    const m = String(Math.floor(l.time / 60)).padStart(2, '0');
    const s = String(Math.floor(l.time % 60)).padStart(2, '0');
    const ms = String(Math.floor((l.time % 1) * 100)).padStart(2, '0');
    return `[${m}:${s}.${ms}] ${l.text}`;
  }).join('\n');
}

function spreadPlain(text, duration) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length || !duration) return [];
  const step = (duration * 0.85) / lines.length;
  return lines.map((text, i) => ({ time: Math.round((i * step + 4) * 100) / 100, text }));
}

function setLyrics(list, type, rawText) {
  wrapCache.clear();
  S.lyrics = list;
  S.lyricsType = type;
  lyricsEditor.value = rawText || '';
  S.lastHighlightIdx = -1;

  if (type === 'synced') {
    editorFormat.textContent = 'Synced LRC';
    editorFormat.className = 'editor-format ok';
  } else if (type === 'plain') {
    editorFormat.textContent = 'Plain text (auto-distributed)';
    editorFormat.className = 'editor-format';
  } else {
    editorFormat.textContent = 'No lyrics';
    editorFormat.className = 'editor-format';
  }

  S.tapLines = list.map(l => ({ text: l.text, time: type === 'synced' ? l.time : null }));
  S.tapIdx = 0;
  exitTapMode();
  precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  renderLyricsList();
}

function populateLyricsSource() {
  lyricsSource.innerHTML = '';
  if (!S.lyricsRecords.length) {
    const o = document.createElement('option');
    o.value = 'none';
    o.textContent = 'No lyrics found — paste manually in Edit Raw';
    lyricsSource.appendChild(o);
    return;
  }

  const sorted = [...S.lyricsRecords].sort((a, b) => {
    if (a.syncedLyrics && !b.syncedLyrics) return -1;
    if (!a.syncedLyrics && b.syncedLyrics) return 1;
    const durA = Math.abs((a.duration || 0) - (S.track.duration || 0));
    const durB = Math.abs((b.duration || 0) - (S.track.duration || 0));
    return durA - durB;
  });

  sorted.forEach((r, i) => {
    const o = document.createElement('option');
    o.value = i;
    const type = r.syncedLyrics ? 'Synced' : r.plainLyrics ? 'Plain' : 'Instr';
    const diff = r.duration ? ` (${Math.abs(r.duration - (S.track.duration || 0))}s diff)` : '';
    o.textContent = `[${type}] ${r.trackName || r.artistName || '—'}${diff}`;
    lyricsSource.appendChild(o);
  });

  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = '✎ Paste Custom Lyrics';
  lyricsSource.appendChild(custom);
}

function autoSelectBestLyrics() {
  if (!S.lyricsRecords.length) {
    setLyrics([], 'none', '');
    return;
  }
  const best = S.lyricsRecords.find(r => r.syncedLyrics) || S.lyricsRecords[0];
  loadLyricsRecord(best);
}

function loadLyricsRecord(r) {
  if (!r) return;
  if (r.syncedLyrics) {
    setLyrics(parseLRC(r.syncedLyrics), 'synced', r.syncedLyrics);
  } else if (r.plainLyrics) {
    setLyrics(spreadPlain(r.plainLyrics, S.track?.duration), 'plain', r.plainLyrics);
  } else {
    setLyrics([], 'none', '');
  }
}

function loadLyricsByIdx(idx) {
  if (idx === 'custom') { setLyrics([], 'none', ''); return; }
  const r = S.lyricsRecords[parseInt(idx, 10)];
  if (r) loadLyricsRecord(r);
}

// ═══════════════════════════════════════════════════════════════════
// 7. SYNC UI
// ═══════════════════════════════════════════════════════════════════

function renderLyricsList() {
  lyricsList.innerHTML = '';

  const lines = S.tapMode ? S.tapLines : S.lyrics;

  if (!lines.length) {
    lyricsList.innerHTML = `<div class="hint-state">${
      S.track 
        ? 'No lyrics loaded. Go to <strong>Edit Raw</strong> to paste lyrics.'
        : 'Press <kbd>Ctrl K</kbd> to search and load a song.'
    }</div>`;
    return;
  }

  lines.forEach((line, idx) => {
    const isSynced  = line.time !== null && line.time !== undefined;
    const isCurrent = S.tapMode && idx === S.tapIdx;
    const isPassed  = S.tapMode && idx < S.tapIdx;

    const div = document.createElement('div');
    div.className = `sync-line ${isCurrent ? 'active' : ''} ${isPassed ? 'passed' : ''} ${isSynced ? 'synced' : ''}`;
    div.dataset.idx = idx;

    const textEl = document.createElement('span');
    textEl.className = 'line-text';
    textEl.textContent = line.text;

    const timeEl = document.createElement('span');
    timeEl.className = 'line-time-badge';
    timeEl.textContent = isSynced ? formatDur(line.time) : '--:--';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0';

    if (!S.tapMode) {
      const stampBtn = document.createElement('button');
      stampBtn.className = 'btn-stamp';
      stampBtn.title = 'Stamp current playhead time onto this line';
      stampBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      stampBtn.addEventListener('click', e => { e.stopPropagation(); stampLine(idx); });
      controls.appendChild(stampBtn);
    }

    controls.appendChild(timeEl);
    div.appendChild(textEl);
    div.appendChild(controls);

    // Click to seek
    if (!S.tapMode && isSynced) {
      div.addEventListener('click', () => {
        const t = Math.max(0, line.time - S.syncOffset);
        seekTo(t);
        if (audio && audio.paused) audio.play().catch(() => {});
      });
    }

    lyricsList.appendChild(div);
  });
}

function updateSyncHighlight(curTime) {
  if (S.tapMode) return;
  const adjTime = curTime + S.syncOffset;

  let activeIdx = -1;
  for (let i = 0; i < S.lyrics.length; i++) {
    if (S.lyrics[i].time <= adjTime) activeIdx = i;
    else break;
  }

  if (activeIdx === S.lastHighlightIdx) return;
  S.lastHighlightIdx = activeIdx;

  const items = lyricsList.querySelectorAll('.sync-line');
  items.forEach(item => {
    const i = parseInt(item.dataset.idx, 10);
    item.classList.toggle('active', i === activeIdx);
    item.classList.toggle('passed', i < activeIdx);
  });

  if (activeIdx >= 0) {
    const activeEl = lyricsList.querySelector('.sync-line.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function stampLine(idx) {
  if (!audio) return;
  const cur = audio.currentTime || 0;
  const t   = Math.max(0, cur - S.syncOffset);
  S.lyrics[idx].time = Math.round(t * 100) / 100;
  S.lyrics.sort((a, b) => (a.time || 0) - (b.time || 0));
  S.tapLines = S.lyrics.map(l => ({ text: l.text, time: l.time }));
  lyricsEditor.value = lyricsToLRC(S.lyrics);
  editorFormat.textContent = 'Synced LRC';
  editorFormat.className = 'editor-format ok';
  precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  renderLyricsList();
}

// ── Tap sync mode ─────────────────────────────────────────────────
function enterTapMode() {
  S.tapMode = true;
  S.tapIdx  = 0;
  S.tapLines = (S.lyrics.length ? S.lyrics : parseLRC(lyricsEditor.value))
    .map(l => ({ text: l.text, time: null }));

  btnTapToggle.classList.add('active');
  btnTapToggle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Tap Sync: ON`;
  tapBanner.classList.remove('hidden');
  tapFooter.classList.remove('hidden');

  if (audio && audio.paused) audio.play().catch(() => {});
  renderLyricsList();
}

function exitTapMode() {
  S.tapMode = false;
  btnTapToggle.classList.remove('active');
  btnTapToggle.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Tap Sync`;
  tapBanner.classList.add('hidden');
  tapFooter.classList.add('hidden');
}

function handleTap() {
  if (!S.tapMode || !audio) return;
  if (S.tapIdx >= S.tapLines.length) return;

  const cur = audio.currentTime || 0;
  S.tapLines[S.tapIdx].time = Math.max(0, cur - S.syncOffset);
  S.tapIdx++;

  if (S.tapIdx >= S.tapLines.length) {
    const sorted = [...S.tapLines].sort((a, b) => (a.time || 0) - (b.time || 0));
    S.lyrics = sorted;
    S.lyricsType = 'synced';
    lyricsEditor.value = lyricsToLRC(sorted);
    editorFormat.textContent = 'Synced LRC';
    editorFormat.className = 'editor-format ok';
    exitTapMode();
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  }

  renderLyricsList();
}

function resetTimings() {
  if (!confirm('Reset all timing stamps?')) return;
  S.lyrics.forEach(l => { l.time = null; });
  S.tapLines.forEach(l => { l.time = null; });
  S.tapIdx = 0;
  S.lyricsType = 'none';
  lyricsEditor.value = S.lyrics.map(l => l.text).join('\n');
  editorFormat.textContent = 'No timestamps';
  editorFormat.className = 'editor-format';
  exitTapMode();
  renderLyricsList();
}

// ═══════════════════════════════════════════════════════════════════
// 8. TRACK INFO EDITORS
// ═══════════════════════════════════════════════════════════════════

editTitle.addEventListener('input', () => {
  if (S.track) {
    S.track.title = editTitle.value;
    headerTitle.textContent = editTitle.value;
  }
});

editArtist.addEventListener('input', () => {
  if (S.track) {
    S.track.artist = editArtist.value;
    headerArtist.textContent = editArtist.value;
  }
});

// ═══════════════════════════════════════════════════════════════════
// 9. PLAYER UI
// ═══════════════════════════════════════════════════════════════════

btnPlay.addEventListener('click', () => {
  if (!audio) return;
  if (audio.paused) audio.play().catch(e => console.warn('[Audio]', e));
  else audio.pause();
});

scrubber.addEventListener('mousedown', () => { scrubbing = true; });
scrubber.addEventListener('touchstart', () => { scrubbing = true; });

scrubber.addEventListener('mouseup', () => {
  scrubbing = false;
  if (audio && audio.duration) {
    audio.currentTime = (scrubber.value / 1000) * audio.duration;
  }
});
scrubber.addEventListener('touchend', () => {
  scrubbing = false;
  if (audio && audio.duration) {
    audio.currentTime = (scrubber.value / 1000) * audio.duration;
  }
});

scrubber.addEventListener('input', () => {
  if (!audio || !audio.duration) return;
  const pct = scrubber.value / 1000;
  scrubberFill.style.width = `${pct * 100}%`;
  const cur = pct * audio.duration;
  const m = Math.floor(cur / 60), ss = Math.floor(cur % 60);
  playerTime.textContent = `${m}:${ss < 10 ? '0' : ''}${ss} / ${formatDur(audio.duration)}`;
  updateSyncHighlight(cur);
});

// ═══════════════════════════════════════════════════════════════════
// 9. COMPILATION
// ═══════════════════════════════════════════════════════════════════

let lastPct = 0;

async function startCompile() {
  if (!S.track || !S.lyrics.length) return;
  if (audio && !audio.paused) audio.pause();
  stopCanvasLoop();

  lastPct = 0;
  progLog.innerHTML = '';
  setProgress(0, 'Initializing...');
  progTitle.textContent  = S.track.title;
  progArtist.textContent = S.track.artist;
  if (S.track.artworkUrl) { progArt.src = S.track.artworkUrl; progArt.style.display = 'block'; }
  else progArt.style.display = 'none';

  showView('progress');

  const params = new URLSearchParams({
    id:             S.track.youtubeId || 'song',
    videoUrl:       `https://www.youtube.com/watch?v=${S.track.youtubeId}`,
    title:          S.track.title,
    artist:         S.track.artist,
    duration:       S.track.duration,
    lyrics:         JSON.stringify(S.lyrics),
    artworkUrl:     S.track.artworkUrl || '',
    offset:         S.syncOffset,
    resolution:     selectRes.value,
    fps:            selectFps.value,
    alignment:      selectAlign.value,
    youtubeDuration: S.track.youtubeDuration || S.track.duration,
    itunesDuration:  S.track.duration,
  });

  if (activeSSE) activeSSE.close();
  activeSSE = new EventSource(`/api/render?${params}`);

  activeSSE.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.error) {
      activeSSE.close();
      logLine(`ERROR: ${msg.error}`, 'error');
      setProgress(lastPct, 'Failed.');
      return;
    }
    switch (msg.status) {
      case 'downloading': setProgress(msg.progress ?? 5, msg.message); break;
      case 'rendering':   setProgress(msg.progress ?? 18, msg.message); break;
      case 'progress':    setProgress(msg.progress, `Rendering... ${msg.progress}%`); break;
      case 'completed':
        activeSSE.close();
        setProgress(100, 'Done!');
        logLine('Video ready!', 'ok');
        showDone(msg);
        break;
    }
    logLine(msg.message || '');
  };

  activeSSE.onerror = () => {
    if (activeSSE.readyState === EventSource.CLOSED) return;
    activeSSE.close();
    logLine('Connection lost.', 'error');
  };
}

function setProgress(pct, label) {
  const p = Math.max(lastPct, Math.min(100, Math.round(pct)));
  lastPct = p;
  progFill.style.width = `${p}%`;
  progPct.textContent  = `${p}%`;
  progStatus.textContent = label || '';
}

function logLine(text, cls = '') {
  if (!text) return;
  const d = document.createElement('div');
  d.className = `log-line ${cls}`;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  progLog.appendChild(d);
  progLog.scrollTop = progLog.scrollHeight;
}

function showDone(msg) {
  btnDlVideo.href = `/api/download/${msg.fileId}`;
  btnDlThumb.href = `/api/download/${msg.thumbnailId}`;
  ytTitle.value = msg.youtubeTitle || '';
  ytDesc.value  = msg.youtubeDescription || '';
  doneSub.textContent = `${S.track.artist} · ${S.track.title}`;
  showView('done');
}

// ═══════════════════════════════════════════════════════════════════
// 10. EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════

// View routing
function showView(name) {
  viewStudio.classList.toggle('hidden', name !== 'studio');
  viewProgress.classList.toggle('hidden', name !== 'progress');
  viewDone.classList.toggle('hidden', name !== 'done');
  if (name === 'studio') startCanvasLoop();
}

// Search modal
btnSearch.addEventListener('click', openSearch);
btnModalClose.addEventListener('click', closeSearch);
searchModal.addEventListener('click', e => { if (e.target === searchModal) closeSearch(); });

modalQuery.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = modalQuery.value.trim();
    if (q) {
      closeSearch();
      performSearch(q);
    }
  } else if (e.key === 'Escape') {
    closeSearch();
  }
});

// Suggest chips
document.querySelectorAll('.suggest-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    closeSearch();
    performSearch(chip.dataset.query);
  });
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
    btn.classList.add('active');
    const pane = document.getElementById(btn.dataset.tab);
    pane.classList.remove('hidden');
    pane.classList.add('active');
    S.activeTab = btn.dataset.tab;
    if (btn.dataset.tab === 'tab-sync') renderLyricsList();
  });
});

// Lyrics source select
lyricsSource.addEventListener('change', () => {
  loadLyricsByIdx(lyricsSource.value);
});

// Tap sync
btnTapToggle.addEventListener('click', () => {
  if (S.tapMode) exitTapMode();
  else enterTapMode();
});
btnTap.addEventListener('click', handleTap);
btnReset.addEventListener('click', resetTimings);

// Editor apply
btnApply.addEventListener('click', () => {
  const text = lyricsEditor.value.trim();
  if (!text) { setLyrics([], 'none', ''); return; }
  if (/\[\d{2}:\d{2}/.test(text)) {
    setLyrics(parseLRC(text), 'synced', text);
  } else if (S.track) {
    setLyrics(spreadPlain(text, S.track.duration), 'plain', text);
  }
});

// Sync offset
syncOffsetEl.addEventListener('input', () => {
  const v = parseFloat(syncOffsetEl.value);
  S.syncOffset = v;
  offsetLabel.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}s`;
});

// Alignment change recomputes lyrics layout
selectAlign.addEventListener('change', () => {
  if (S.track) {
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  }
});

// Compile
btnCompile.addEventListener('click', startCompile);

// Cancel render
btnCancel.addEventListener('click', () => {
  if (activeSSE) activeSSE.close();
  showView('studio');
  startCanvasLoop();
});

// Done → again
btnAgain.addEventListener('click', () => {
  S.track = null; S.lyrics = []; S.lyricsRecords = [];
  artImg = null; blurCanvas = null; colorData = null;
  if (audio) { audio.pause(); audio.src = ''; audio.dataset.videoId = ''; S.audioReady = false; }
  btnPlay.disabled = true;
  btnCompile.disabled = true;
  lyricsSource.innerHTML = '<option>No song loaded</option>';
  lyricsSource.disabled = true;
  matchSkeleton(true);
  renderLyricsList();
  showView('studio');
  openSearch();
});

// Copy buttons
document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.target);
    if (!el) return;
    navigator.clipboard.writeText(el.value).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    });
  });
});

// Keyboard global
document.addEventListener('keydown', e => {
  // Ctrl+K → open search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }
  // Spacebar → tap sync (when in tap mode and not in input)
  if (e.code === 'Space' && S.tapMode) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      handleTap();
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// QUICK SEARCH ENDPOINT (Removed - Unified Search Restored)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// MANUAL LRCLIB SEARCH
// ═══════════════════════════════════════════════════════════════════

let lyricsSearchTimeout;
let manualLyricsResults = [];
let lyricsSearchHighlight = -1;

btnManualLyrics.addEventListener('click', () => {
  lyricsModal.classList.remove('hidden');
  modalLyricsQuery.value = S.track ? `${S.track.title} ${S.track.artist}` : '';
  modalLyricsQuery.focus();
  modalLyricsQuery.select();
  if (modalLyricsQuery.value) {
    runLyricsSearch(modalLyricsQuery.value);
  } else {
    showLyricsEmpty('Type to search LRCLIB for synced lyrics.');
  }
});

btnLyricsModalClose.addEventListener('click', closeLyricsModal);

function closeLyricsModal() {
  lyricsModal.classList.add('hidden');
  modalLyricsQuery.value = '';
}

modalLyricsQuery.addEventListener('input', () => {
  clearTimeout(lyricsSearchTimeout);
  const q = modalLyricsQuery.value.trim();
  if (!q) { showLyricsEmpty('Type to search LRCLIB for synced lyrics.'); return; }
  lyricsSearchTimeout = setTimeout(() => runLyricsSearch(q), 350);
});

async function runLyricsSearch(query) {
  showLyricsSearching();
  try {
    const res = await fetch(`/api/lyrics-search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      showLyricsEmpty('No lyrics found.');
      return;
    }
    manualLyricsResults = data;
    renderLyricsResults(data);
  } catch(e) {
    showLyricsEmpty('Error searching lyrics.');
  }
}

function renderLyricsResults(results) {
  modalLyricsSearching.classList.add('hidden');
  modalLyricsEmpty.classList.add('hidden');
  modalLyricsList.classList.remove('hidden');
  modalLyricsList.innerHTML = '';
  lyricsSearchHighlight = -1;

  results.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'result-item';
    
    // Icon
    const isSynced = !!r.syncedLyrics;
    const icon = isSynced 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;
      
    // Text
    const metaHtml = `
      <div class="result-text">
        <div class="result-title">${r.trackName} <span style="color:#666; font-size: 11px;">(${formatDur(r.duration)})</span></div>
        <div class="result-artist">${r.artistName} • ${r.albumName}</div>
      </div>
    `;
    
    el.innerHTML = `<div class="result-icon">${icon}</div>${metaHtml}`;
    
    el.addEventListener('click', () => selectManualLyrics(r));
    el.addEventListener('mousemove', () => {
      lyricsSearchHighlight = i;
      updateLyricsHighlight();
    });
    modalLyricsList.appendChild(el);
  });
}

function updateLyricsHighlight() {
  const items = modalLyricsList.querySelectorAll('.result-item');
  items.forEach((el, i) => el.classList.toggle('highlighted', i === lyricsSearchHighlight));
}

function showLyricsSearching() {
  modalLyricsList.classList.add('hidden');
  modalLyricsEmpty.classList.add('hidden');
  modalLyricsSearching.classList.remove('hidden');
}

function showLyricsEmpty(msg) {
  modalLyricsList.classList.add('hidden');
  modalLyricsSearching.classList.add('hidden');
  modalLyricsEmpty.classList.remove('hidden');
  if(msg) modalLyricsEmpty.querySelector('span').textContent = msg;
}

function selectManualLyrics(lrclibRecord) {
  closeLyricsModal();
  
  // Create a record format that matches our internal structure exactly
  const record = {
    source: 'LRCLIB (Manual)',
    id: lrclibRecord.id,
    duration: lrclibRecord.duration,
    trackName: lrclibRecord.trackName,
    artistName: lrclibRecord.artistName,
    syncedLyrics: lrclibRecord.syncedLyrics,
    plainLyrics: lrclibRecord.plainLyrics
  };
  
  // Put it at the top of the records
  S.lyricsRecords.unshift(record);
  
  // Rebuild the select
  populateLyricsSource();
  
  // Select it
  lyricsSource.value = "0";
  loadLyricsByIdx("0");
}

modalLyricsQuery.addEventListener('keydown', e => {
  const items = modalLyricsList.querySelectorAll('.result-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    lyricsSearchHighlight = Math.min(lyricsSearchHighlight + 1, items.length - 1);
    updateLyricsHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    lyricsSearchHighlight = Math.max(lyricsSearchHighlight - 1, -1);
    updateLyricsHighlight();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (lyricsSearchHighlight >= 0 && manualLyricsResults[lyricsSearchHighlight]) {
      selectManualLyrics(manualLyricsResults[lyricsSearchHighlight]);
    }
  } else if (e.key === 'Escape') {
    closeLyricsModal();
  }
});

// ═══════════════════════════════════════════════════════════════════
// 11. INIT
// ═══════════════════════════════════════════════════════════════════

showView('studio');
startCanvasLoop();
openSearch();
