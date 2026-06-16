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

const FONT = 'Plus Jakarta Sans, Noto Sans Devanagari';

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

  // Virtual Timeline
  videoTime: 0,
  isPlaying: false,
  lastFrameTime: 0,
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
const btnTranslate = $('btn-translate');
const btnClearTrans = $('btn-clear-translations');
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
const btnShort     = $('btn-short');
const btnSlideshow = $('btn-slideshow');
const btnSearch    = $('btn-search');
const btnModalClose = $('btn-modal-close');

// Trending
const btnTrending      = $('btn-trending');
const trendingPanel    = $('trending-panel');
const btnTrendingClose = $('btn-trending-close');
const trendingLoading  = $('trending-loading');
const trendingList     = $('trending-list');

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
const donePreviewImage = $('done-preview-image');
const donePreviewLoader = $('done-preview-loader');

// Settings
const selectRes   = $('select-res');
const selectFps   = $('select-fps');
const selectAlign = $('select-align');

// ═══════════════════════════════════════════════════════════════════
// 3. AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════

let audio = null;           // Native <audio> element
let scrubbing = false;
let activeSSE = null;

function initAudio(videoId) {
  if (!audio) {
    audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.style.display = 'none';
    document.body.appendChild(audio);

    audio.addEventListener('canplay', () => {
      const isInitial = !S.audioReady;
      S.audioReady = true;
      S.audioDuration = audio.duration || 0;
      btnPlay.disabled = false;
      audioOverlay.classList.add('hidden');
      if (isInitial) {
        S.videoTime = 0;
        S.isPlaying = false;
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
      }
      updatePlayerUIElements();
    });
    audio.addEventListener('waiting', () => {
      if (!S.audioReady) return;
    });

    audio.addEventListener('timeupdate', () => {
      if (btnShort && audio.currentTime > 0) {
        const m = Math.floor(audio.currentTime / 60);
        const s = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        btnShort.title = `Export 30s Short (Starts at ${m}:${s})`;
      }
    });

    audio.addEventListener('play', () => {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      if (!S.isPlaying) {
        S.isPlaying = true;
        S.lastFrameTime = performance.now() / 1000;
      }
    });
    audio.addEventListener('pause', () => {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      S.isPlaying = false;
    });
    audio.addEventListener('ended', () => {
      const dur = S.track ? S.track.duration : 0;
      S.videoTime = dur;
      S.isPlaying = false;
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      updatePlayerUIElements();
    });
    
    audio.addEventListener('error', (e) => {
      console.error('Audio playback error', e);
      audioLoadTxt.textContent = 'Error loading audio stream.';
      
      const modal = document.getElementById('audio-error-modal');
      const ytLink = document.getElementById('error-yt-link');
      if (modal && ytLink && S.track && S.track.id) {
        ytLink.value = `https://www.youtube.com/watch?v=${S.track.id}`;
        modal.classList.remove('hidden');
      } else {
        alert("Audio stream blocked or unavailable! Please try a different version of the song.");
      }
      
      setTimeout(() => {
        audioOverlay.classList.add('hidden');
      }, 3000);
    });
  }

  if (audio.dataset.videoId === videoId) return;

  // New track — reset and load
  audio.pause();
  audio.dataset.videoId = videoId;
  S.audioReady = false;
  S.audioDuration = 0;
  S.videoTime = 0;
  S.isPlaying = false;
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');

  // Show loading state
  btnPlay.disabled = true;
  audioOverlay.classList.remove('hidden');
  audioLoadTxt.textContent = 'Loading audio stream...';

  // Try to connect
  const params = new URLSearchParams();
  if (S.track && S.track.title) params.append('title', S.track.title);
  if (S.track && S.track.artist) params.append('artist', S.track.artist);
  audio.src = `/api/stream/${videoId}?${params.toString()}`;
  audio.load();
  updatePlayerUIElements();
}

function updatePlayerUIElements() {
  if (!S.track) return;
  const cur = S.videoTime;
  const dur = S.track.duration || 0;

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

  updateSyncHighlight(S.videoTime);
}

function seekTo(t) {
  if (!audio || !S.track) return;
  S.videoTime = Math.max(0, Math.min(t, S.track.duration || 0));
  audio.currentTime = S.videoTime;
  S.lastFrameTime = performance.now() / 1000;
  updatePlayerUIElements();
}

function getCurrentTime() {
  return S.track ? S.videoTime : 0;
}

// ═══════════════════════════════════════════════════════════════════
// 4. CANVAS ENGINE
// ═══════════════════════════════════════════════════════════════════

let rafId = null;

// Cached rendering resources
let blurCanvas = null;        // Low-res album art for background blur
let colorData = null;         // Dominant colors { tl, tr, bl, br, c, rgb }
let artImg = null;            // Full artwork Image object
let logoImg = new Image();    // White logo image for watermarks
logoImg.src = 'logo_white.png';
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
    
    // Set subtle dark background color based on center pixel
    const [r, g, b] = colorData.c;
    document.body.style.setProperty('--art-color', `rgba(${r}, ${g}, ${b}, 0.1)`);
    document.body.style.setProperty('--art-color-dark', `rgba(${r}, ${g}, ${b}, 0.03)`);
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
    
    const dw = Math.max(W, H) * 1.5;
    
    // Base layer
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(1.2, 1.2);
    ctx.drawImage(blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 1 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(W/2 + Math.sin(t * 0.15) * W * 0.3, H/2 + Math.cos(t * 0.18) * H * 0.3);
    ctx.rotate(t * 0.05);
    ctx.scale(1.8, 1.8);
    ctx.drawImage(blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();

    // Fluid blob 2 (slower motion)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.translate(W/2 + Math.cos(t * 0.16) * W * 0.4, H/2 + Math.sin(t * 0.2) * H * 0.4);
    ctx.rotate(-t * 0.06);
    ctx.scale(2.2, 2.2);
    ctx.drawImage(blurCanvas, -dw/2, -dw/2, dw, dw);
    ctx.restore();
    
    ctx.restore();
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
  }

  // Smart darkening overlay for readability
  let baseAlpha = 0.4;
  if (colorData) {
    const getLuma = (c) => 0.299*c[0] + 0.587*c[1] + 0.114*c[2];
    const avgLuma = (getLuma(colorData.tl) + getLuma(colorData.tr) + getLuma(colorData.bl) + getLuma(colorData.br) + getLuma(colorData.c)) / 5;
    if (avgLuma > 100) {
      baseAlpha += Math.min(0.35, ((avgLuma - 100) / 155) * 0.35);
    }
  }

  ctx.fillStyle = `rgba(0,0,0,${baseAlpha.toFixed(2)})`;
  ctx.fillRect(0, 0, W, H);

  // Soft vignette
  const vig = ctx.createRadialGradient(W/2, H/2, W*0.2, W/2, H/2, W*0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ── Draw song info watermark (top-left) ───────────────────────────
function drawSongInfo(W, H) {
  if (!S.track) return;
  const songTime = getCurrentTime();
  const dur = S.track.duration || 0;
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, dur - songTime));

  ctx.save();
  ctx.globalAlpha = layoutAlpha;

  const margin = Math.round(Math.min(W, H) * 0.05);
  const artSz  = Math.round(Math.min(W, H) * 0.095);
  const ax = margin, ay = margin;
  const radius = Math.round(artSz * 0.16);

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

  ctx.font = `700 ${tSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(S.track.title || '', tx, titleY);

  ctx.font = `500 ${aSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText(S.track.artist || '', tx, artistY);
  ctx.restore();

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

// ── Watermark (bottom-left) ───────────────────────────────────────
function drawWatermark(W, H, t) {
  if (!logoImg || !logoImg.complete) return;
  ctx.save();
  
  const margin = Math.round(Math.min(W, H) * 0.05);
  const lgSz   = Math.round(Math.min(W, H) * 0.13);
  const lx     = margin;
  const ly     = H - margin - lgSz;
  
  // Floating offset using sine wave based on time (t)
  const floatY = Math.sin(t * 2.0) * 3.5;
  
  // 100% visible
  ctx.globalAlpha = 1.0;
  
  ctx.drawImage(logoImg, lx, ly + floatY, lgSz, lgSz);
  ctx.restore();
}

// ── Draw floating ♪ musical notes ─────────────────────────────
function drawInterludeDots(cx, cy, t) {
  const notes = ['♪', '♫', '♪'];
  const R = 7, GAP = 30;
  const totalW = 2 * R * 3 + GAP * 2;
  const startX = cx - totalW / 2 + R;

  ctx.save();
  ctx.font = `500 24px Arial, sans-serif`;
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

  // Active line font size: ~42px
  const activeSz = Math.min(Math.round(H * 0.065), 72);
  const fontSpec = `700 ${activeSz}px ${FONT}, sans-serif`;

  const maxWidth = alignment === 'left' ? Math.round(W * 0.44) : Math.round(W * 0.76);

  ctx.save();
  ctx.font = fontSpec;

  const wrapLine = (txt, fontStr) => {
    if (!txt) return [];
    ctx.font = fontStr;
    const words = txt.split(' ');
    const res = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
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
    const transSz = activeSz * 0.60;
    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', `600 ${transSz}px ${FONT}, sans-serif`) : [];
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
  precomputedLyrics = wrapped.map(line => {
    let h = line.wrapped.length * lh;
    if (line.wrappedTrans && line.wrappedTrans.length) {
      h += line.wrappedTrans.length * (activeSz * 0.75 * 1.38) + (activeSz * 0.3); // add translation height + small gap
    }
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

  const validGaps = [];
  for (let i = 0; i < lyrics.length - 1; i++) {
    const g = lyrics[i+1].time - lyrics[i].time;
    if (g > 0.5) validGaps.push(g);
  }
  validGaps.sort((a,b) => a - b);
  precomputedLyrics.medianGap = validGaps.length > 0 ? validGaps[Math.floor(validGaps.length / 2)] : 5.0;
}

// ── Left Split Screen Layout (Watermark Cover Art + Player) ─────────
function drawLeftSplitLayout(W, H, songTime) {
  if (!S.track) return;
  const dur = S.track.duration || 0;
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, dur - songTime));
  
  ctx.save();
  ctx.globalAlpha = layoutAlpha;

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
  ctx.font = `800 ${titleSz}px ${FONT}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText(S.track.title || '', textX, titleY);

  // Artist Name
  ctx.font = `500 ${artistSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(S.track.artist || '', textX, titleY + titleSz + 8);
  ctx.restore();

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
  let activeSz = Math.min(Math.round(H * 0.065), 72);
  
  if (activeIdx >= 0 && precomputedLyrics[activeIdx]) {
    const isHindi = /[\u0900-\u097F]/.test(precomputedLyrics[activeIdx].text);
    if (isHindi) activeSz *= 1.25;
  }
  
  const lh_act = activeSz * 1.38;

  let showInterlude = false;
  let showDuration = 5.0;
  let isBlank = false;

  if (activeIdx >= 0) {
    const activeLine = precomputedLyrics[activeIdx];
    const hasNext = activeIdx + 1 < precomputedLyrics.length;
    const nextLine = hasNext ? precomputedLyrics[activeIdx + 1] : null;
    const gapToNext = hasNext ? nextLine.time - activeLine.time : Infinity;
    
    const medianGap = precomputedLyrics.medianGap || 5.0;
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
    const timeUntilFirst = precomputedLyrics[0].time - adjTime;
    if (timeUntilFirst > 2.0) {
      showInterlude = true;
    } else {
      isBlank = true;
    }
  }

  if (isBlank) return;

  if (showInterlude) {
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

  const dur = S.track ? S.track.duration : 0;
  const layoutAlpha = Math.max(0, Math.min(1, songTime) * Math.min(1, dur - songTime));

  ctx.save();
  ctx.globalAlpha = opacity * layoutAlpha;
  ctx.translate(tx, H / 2);
  ctx.scale(scale, scale);

  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';

  const segments = line.wrapped;
  const transSegments = line.wrappedTrans || [];
  
  let transSz = activeSz * 0.60;
  if (line.translation && /[\u0900-\u097F]/.test(line.translation)) {
    transSz *= 1.25;
  }
  
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
    drawTextWithShadows(seg, wy, `800 ${activeSz}px ${FONT}, sans-serif`, '#ffffff', 'rgba(255, 255, 255, 0.8)', 1.0);
  });

  if (transSegments.length > 0) {
    curY += transGap;
    transSegments.forEach((seg) => {
      curY += lhTrans;
      const wy = curY - lhTrans + transSz * 0.5;
      drawTextWithShadows(seg, wy, `600 ${transSz}px ${FONT}, sans-serif`, '#ffffff', 'rgba(255, 255, 255, 0.6)', 0.90);
    });
  }
  ctx.globalAlpha = opacity * layoutAlpha; // reset

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
  const font = `700 ${sz}px ${FONT}, sans-serif`;
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
  ctx.font = `700 ${Math.round(W * 0.012)}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('NOISES STUDIO', W * 0.034, H - H * 0.038);
  ctx.restore();

  // Search hint
  ctx.save();
  ctx.font = `500 ${Math.round(W * 0.011)}px ${FONT}, sans-serif`;
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
  ctx.font = `500 ${Math.round(W * 0.014)}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Searching for track...', W / 2, H / 2 + 60);
  ctx.restore();
}

// ── Main frame ────────────────────────────────────────────────────
let resolving = false;

function drawIntroLayout(W, H, now) {
  if (!S.track) return;
  const a = now < 1 ? now : now < 2 ? 1 : 3 - now;
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

  if (artImg && artImg.complete) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    
    ctx.beginPath();
    ctx.roundRect(ax, ay, artSz, artSz, radius);
    ctx.clip();
    ctx.drawImage(artImg, ax, ay, artSz, artSz);
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
  ctx.font = `800 ${titleSz}px ${FONT}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText(S.track.title || '', W / 2, titleY);

  // Artist Name
  ctx.font = `500 ${artistSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(S.track.artist || '', W / 2, titleY + titleSz + 10);

  ctx.restore();
}

function drawOutroLayout(W, H, now) {
  if (!S.track) return;
  const dur = S.track.duration || 0;
  const el = now - (dur - 5);
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
  
  ctx.font = `800 ${titleSz}px ${FONT}, sans-serif`;
  ctx.fillText('THANKS FOR WATCHING', W / 2, ay);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = `500 ${artistSz}px ${FONT}, sans-serif`;
  ctx.fillText('LIKE, SHARE & SUBSCRIBE', W / 2, ay + titleSz + gap);

  ctx.restore();
}

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

  // Update playhead if playing
  if (S.isPlaying) {
    const nowTime = performance.now() / 1000;
    const dt = nowTime - S.lastFrameTime;
    S.lastFrameTime = nowTime;

    const dur = S.track.duration || 0;

    if (audio) {
      if (!audio.paused && !scrubbing) {
        S.videoTime = audio.currentTime;
      }
    } else {
      S.videoTime = Math.min(dur, S.videoTime + dt);
    }
    
    if (S.videoTime >= dur) {
      S.videoTime = dur;
      S.isPlaying = false;
      if (audio) audio.pause();
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
    }
    updatePlayerUIElements();
  }

  const songTime = getCurrentTime();
  const now = S.videoTime;
  const dur = S.track.duration || 0;

  drawBackground(W, H, now);

  const alignment = selectAlign.value;
  let introEnd = 3.0;
  if (precomputedLyrics && precomputedLyrics.length > 0) {
    introEnd = Math.min(3.0, Math.max(0, precomputedLyrics[0].time - 0.5));
  }

  if (now < introEnd) {
    // scale opacity so it still fades out
    const fadeOutStart = Math.max(0, introEnd - 1.0);
    let introNow = now;
    if (introEnd < 3.0 && now > fadeOutStart) {
      // Fake 'now' so drawIntroLayout fades out
      introNow = 3.0 - (introEnd - now);
    }
    drawIntroLayout(W, H, introNow);
  } else {
    if (alignment === 'left') {
      drawLeftSplitLayout(W, H, songTime);
      drawLyrics(W, H, songTime);
    } else {
      drawSongInfo(W, H);
      drawLyrics(W, H, songTime);
    }
  }

  if (now >= dur - 5) {
    drawOutroLayout(W, H, now);
  }

  // Draw floating logo watermark everywhere!
  drawWatermark(W, H, now);
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



async function fetchMetadataResults(query) {
  if (!query || query.trim() === '') return;
  S.track = null;
  S.lyrics = [];
  S.lyricsRecords = [];
  S.lyricsType = 'none';
  S.syncOffset = 0;
  S.lastHighlightIdx = -1;
  artImg = null; blurCanvas = null; colorData = null;
  wrapCache.clear();

  resolving = true;
  showSearching('Searching iTunes & YTMusic...');

  try {
    const res = await fetch(`/api/search-metadata?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');

    resolving = false;
    renderMetadataResults(data.results || []);
  } catch (err) {
    console.error('[Search Metadata]', err.message);
    resolving = false;
    showEmpty(`Search failed: ${err.message}`);
  }
}

function showEmpty(msg) {
  modalSuggestions.classList.add('hidden');
  modalResultList.classList.add('hidden');
  modalSearching.classList.add('hidden');
  modalEmpty.classList.remove('hidden');
  modalEmpty.querySelector('span').textContent = msg;
}

function renderMetadataResults(results) {
  if (!results || results.length === 0) {
    showEmpty('No results. Please try a different query.');
    return;
  }
  
  modalSuggestions.classList.add('hidden');
  modalSearching.classList.add('hidden');
  modalEmpty.classList.add('hidden');
  modalResultList.classList.remove('hidden');
  
  modalResultList.innerHTML = '';
  
  results.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.className = 'result-item';
    
    // Fallback thumbnail if no artwork
    const artUrl = item.artworkUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23222"/></svg>';
    
    btn.innerHTML = `
      <img src="${artUrl}" class="result-art" alt="Cover">
      <div class="result-text">
        <div class="result-name">${esc(item.title)}</div>
        <div class="result-artist">${esc(item.artist)} • ${esc(item.album)}</div>
      </div>
      <div class="result-dur">${formatDur(item.duration)}</div>
    `;
    
    btn.addEventListener('click', () => {
      closeSearch();
      resolveSong(item);
    });
    
    modalResultList.appendChild(btn);
  });
}

async function resolveSong(metadata) {
  resolving = true;
  matchSkeleton(true);
  btnCompile.disabled = true;
  if (btnShort) btnShort.disabled = true;
  if (btnSlideshow) btnSlideshow.disabled = true;
  lyricsSource.disabled = true;
  lyricsSource.innerHTML = '<option>Resolving Audio & Lyrics...</option>';

  try {
    const res = await fetch('/api/resolve-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Resolve failed');
    if (!data.bestMatch) throw new Error('No audio match found');

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

    // Auto-fetch LRCLIB from frontend
    if (S.lyricsRecords.length === 0 && S.track.title && S.track.artist) {
      lyricsSource.innerHTML = '<option>Fetching Lyrics from LRCLIB...</option>';
      try {
        let ldata = null;
        
        // 1. Try exact match
        const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(S.track.title)}&artist_name=${encodeURIComponent(S.track.artist)}`;
        const getRes = await fetch(getUrl);
        if (getRes.ok) {
           ldata = await getRes.json();
        } else {
           // 2. Try fuzzy search fallback
           const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(S.track.title + ' ' + S.track.artist)}`;
           const searchRes = await fetch(searchUrl);
           if (searchRes.ok) {
             const items = await searchRes.json();
             if (items && items.length > 0) {
               // Pick the best match (prioritize synced)
               ldata = items.find(i => i.syncedLyrics) || items[0];
             }
           }
        }
        
        if (ldata && ldata.id) {
           S.lyricsRecords = [{
             id: `lrclib_${ldata.id}`,
             trackName: ldata.trackName,
             artistName: ldata.artistName,
             albumName: ldata.albumName || '',
             duration: ldata.duration || 0,
             syncedLyrics: ldata.syncedLyrics,
             plainLyrics: ldata.plainLyrics,
             source: 'LRCLIB (Auto)'
           }];
        }
      } catch (e) {
        console.warn('Frontend LRCLIB fetch failed:', e);
      }
    }

    // Lyrics
    populateLyricsSource();
    autoSelectBestLyrics();

    resolving = false;
    btnCompile.disabled = false;
    if (btnShort) btnShort.disabled = false;
    if (btnSlideshow) btnSlideshow.disabled = false;
    lyricsSource.disabled = false;

  } catch (err) {
    console.error('[Resolve]', err.message);
    resolving = false;
    lyricsSource.innerHTML = `<option>Resolve failed: ${err.message}</option>`;
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
  const rawRE = /(?:^|\s)(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?(?:\s|$)/;
  const out = [];
  
  for (const line of lrc.split(/\r?\n/)) {
    const times = [];
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(line)) !== null) {
      const ms = m[3] ? (m[3].length === 2 ? parseInt(m[3]) * 10 : parseInt(m[3])) : 0;
      times.push(parseInt(m[1]) * 60 + parseInt(m[2]) + ms / 1000);
    }
    
    let text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
    
    if (times.length === 0) {
      const rawMatch = line.match(rawRE);
      if (rawMatch) {
        const ms = rawMatch[3] ? (rawMatch[3].length === 2 ? parseInt(rawMatch[3]) * 10 : parseInt(rawMatch[3])) : 0;
        times.push(parseInt(rawMatch[1]) * 60 + parseInt(rawMatch[2]) + ms / 1000);
        text = line.replace(rawRE, ' ').trim();
      }
    }
    
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
  S.scrollY = undefined; // Reset smooth scroll

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

  S.lyricsRecords.sort((a, b) => {
    if (a.syncedLyrics && !b.syncedLyrics) return -1;
    if (!a.syncedLyrics && b.syncedLyrics) return 1;
    const durA = Math.abs((a.duration || 0) - (S.track.duration || 0));
    const durB = Math.abs((b.duration || 0) - (S.track.duration || 0));
    return durA - durB;
  });

  S.lyricsRecords.forEach((r, i) => {
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
    lyricsSource.value = 'none';
    setLyrics([], 'none', '');
    
    // Auto-switch to Edit Raw tab and pulse it
    const editBtn = document.querySelector('.tab-btn[data-tab="tab-edit"]');
    if (editBtn) editBtn.click();
    
    const editor = document.getElementById('lyrics-editor');
    if (editor) {
      editor.classList.add('pulse-attention');
      setTimeout(() => editor.classList.remove('pulse-attention'), 3000);
    }
    return;
  }
  const bestIdx = S.lyricsRecords.findIndex(r => r.syncedLyrics);
  const targetIdx = bestIdx >= 0 ? bestIdx : 0;
  lyricsSource.value = targetIdx;
  loadLyricsRecord(S.lyricsRecords[targetIdx]);
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
  
  if (btnClearTrans) {
    const hasTrans = S.lyrics.some(l => l.translation);
    btnClearTrans.style.display = hasTrans ? 'inline-block' : 'none';
  }

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

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex;flex-direction:column;flex:1;gap:4px;';
    
    const textEl = document.createElement('span');
    textEl.className = 'line-text';
    textEl.textContent = line.text;
    textWrap.appendChild(textEl);

    if (!S.tapMode) {
      const transInput = document.createElement('input');
      transInput.type = 'text';
      transInput.className = 'line-translation-input';
      transInput.placeholder = 'Add translation (optional)...';
      transInput.value = line.translation || '';
      
      transInput.addEventListener('change', (e) => {
        S.lyrics[idx].translation = e.target.value.trim();
        precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
      });
      transInput.addEventListener('click', e => e.stopPropagation());
      textWrap.appendChild(transInput);
    }

    const timeEl = document.createElement('input');
    timeEl.type = 'text';
    timeEl.className = 'line-time-badge';
    timeEl.style.cssText = 'width:55px; background:transparent; border:1px solid rgba(255,255,255,0.15); border-radius:4px; text-align:center; color:#fff; font-family:monospace; padding:2px; font-size:12px; transition:border 0.2s';
    timeEl.value = isSynced ? formatDur(line.time) : '';
    timeEl.placeholder = '--:--';
    
    timeEl.addEventListener('focus', () => timeEl.style.borderColor = 'rgba(255,255,255,0.8)');
    timeEl.addEventListener('blur', () => timeEl.style.borderColor = 'rgba(255,255,255,0.15)');
    timeEl.addEventListener('click', e => e.stopPropagation());
    timeEl.addEventListener('change', e => {
      const val = e.target.value.trim();
      let parsedTime = null;
      if (val.includes(':')) {
        const parts = val.split(':');
        parsedTime = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else if (val !== '') {
        parsedTime = parseFloat(val);
      }
      
      if (parsedTime !== null && !isNaN(parsedTime)) {
        line.time = parsedTime;
        e.target.value = formatDur(parsedTime);
      } else {
        line.time = null;
        e.target.value = '';
      }
      
      // Auto re-sort array if we change a time, but only if not currently mid-tap-sync
      if (!S.tapMode) {
        S.lyrics.sort((a, b) => (a.time || 0) - (b.time || 0));
        lyricsEditor.value = lyricsToLRC(S.lyrics);
        precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
        renderLyricsList(); // Redraw immediately to reflect order
      } else {
        // If in tap mode, just update the LRC box
        lyricsEditor.value = lyricsToLRC(S.tapLines);
      }
    });

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0';

    if (!S.tapMode) {
      const stampBtn = document.createElement('button');
      stampBtn.className = 'btn-stamp';
      stampBtn.title = 'Stamp current playhead time onto this line';
      stampBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      stampBtn.addEventListener('click', e => { e.stopPropagation(); stampLine(idx); });
      controls.appendChild(stampBtn);
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'lyric-cb';
      checkbox.title = 'Select this line for Slideshow Export';
      checkbox.style.marginLeft = '8px';
      checkbox.style.cursor = 'pointer';
      checkbox.addEventListener('click', e => e.stopPropagation());
      checkbox.addEventListener('change', () => updateSlideshowBtnState());
      controls.appendChild(checkbox);
    }

    controls.appendChild(timeEl);
    div.appendChild(textWrap);
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
  
  if (S.tapMode) {
    const nextLineText = S.tapLines[S.tapIdx] ? S.tapLines[S.tapIdx].text : 'All lines stamped!';
    btnTap.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:4px; width:100%; overflow:hidden;">
        <div style="font-size:10px; opacity:0.6; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:6px;">
          TAP TO STAMP <kbd>Space</kbd>
        </div>
        <div style="font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;">
          ${nextLineText}
        </div>
      </div>
    `;
    
    // Auto-scroll the active line into view smoothly
    setTimeout(() => {
      const activeLine = lyricsList.querySelector('.sync-line.active');
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 10);
  }
  
  updateSlideshowBtnState();
}

function updateSlideshowBtnState() {
  const btnSlideshow = document.getElementById('btn-slideshow');
  if (!btnSlideshow) return;
  const anyChecked = Array.from(document.querySelectorAll('.lyric-cb')).some(cb => cb.checked);
  
  if (anyChecked) {
    btnSlideshow.disabled = false;
    btnSlideshow.style.opacity = '1';
  } else {
    btnSlideshow.disabled = true;
    btnSlideshow.style.opacity = '0.5';
  }
}

function updateSyncHighlight(curTime, force = false) {
  if (S.tapMode) return;
  const adjTime = curTime + S.syncOffset;

  let activeIdx = -1;
  let shortEndIdx = -1;

  for (let i = 0; i < S.lyrics.length; i++) {
    if (S.lyrics[i].time <= adjTime) activeIdx = i;
    if (S.lyrics[i].time <= adjTime + 30) shortEndIdx = i;
  }

  const shortStartIdx = activeIdx >= 0 ? activeIdx : 0;
  
  const regionKey = `${activeIdx}_${S.previewingShort ? shortStartIdx : -1}_${S.previewingShort ? shortEndIdx : -1}`;
  if (regionKey === S.lastHighlightRegion && !force) return;
  
  S.lastHighlightRegion = regionKey;
  S.lastHighlightIdx = activeIdx;

  const items = lyricsList.querySelectorAll('.sync-line');
  items.forEach(item => {
    const i = parseInt(item.dataset.idx, 10);
    item.classList.toggle('active', i === activeIdx);
    item.classList.toggle('passed', i < activeIdx);
    
    const inShortRegion = S.previewingShort && i >= shortStartIdx && i <= shortEndIdx;
    item.classList.toggle('short-region', inShortRegion);
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

function togglePlay() {
  if (!audio || !S.audioReady || !S.track) return;

  if (S.isPlaying) {
    S.isPlaying = false;
    audio.pause();
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  } else {
    S.isPlaying = true;
    S.lastFrameTime = performance.now() / 1000;
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');

    const dur = S.track.duration || 0;
    if (S.videoTime >= dur - 0.1) {
      S.videoTime = 0;
      audio.currentTime = 0;
    }

    audio.currentTime = S.videoTime;
    audio.play().catch(e => {
      console.warn('[Audio]', e);
      alert('Playback error: ' + e.message);
    });
  }
  updatePlayerUIElements();
}

btnPlay.addEventListener('click', togglePlay);

scrubber.addEventListener('mousedown', () => { scrubbing = true; });
scrubber.addEventListener('touchstart', () => { scrubbing = true; });

scrubber.addEventListener('mouseup', () => {
  scrubbing = false;
  if (audio && S.track) {
    const dur = S.track.duration || 0;
    S.videoTime = (scrubber.value / 1000) * dur;
    audio.currentTime = S.videoTime;
    if (S.isPlaying) {
      audio.play().catch(e => console.warn('[Audio]', e));
    }
    S.lastFrameTime = performance.now() / 1000;
  }
  updatePlayerUIElements();
});

scrubber.addEventListener('touchend', () => {
  scrubbing = false;
  if (audio && S.track) {
    const dur = S.track.duration || 0;
    S.videoTime = (scrubber.value / 1000) * dur;
    audio.currentTime = S.videoTime;
    if (S.isPlaying) {
      audio.play().catch(e => console.warn('[Audio]', e));
    }
    S.lastFrameTime = performance.now() / 1000;
  }
  updatePlayerUIElements();
});

scrubber.addEventListener('input', () => {
  if (!S.track) return;
  const dur = S.track.duration || 0;
  const totalDur = dur + 8;
  const pct = scrubber.value / 1000;
  scrubberFill.style.width = `${pct * 100}%`;
  
  S.videoTime = pct * totalDur;
  const cur = S.videoTime;
  const fmt = s => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };
  playerTime.textContent = `${fmt(cur)} / ${fmt(totalDur)}`;
  updateSyncHighlight(S.videoTime - 3);
});

// ═══════════════════════════════════════════════════════════════════
// 9. COMPILATION
// ═══════════════════════════════════════════════════════════════════

let lastPct = 0;

async function startCompile(isShort = false, shortStartTime = 0, isSlideshow = false) {
  if (!S.track || !S.lyrics.length) return;
  if (audio && !audio.paused) audio.pause();
  stopCanvasLoop();

  lastPct = 0;
  progLog.innerHTML = '';
  setProgress(0, 'Initializing...');
  progTitle.textContent  = S.track.title + (isShort ? ' (Short)' : '');
  progArtist.textContent = S.track.artist;
  if (S.track.artworkUrl) { progArt.src = S.track.artworkUrl; progArt.style.display = 'block'; }
  else progArt.style.display = 'none';

  showView('progress');

  const params = new URLSearchParams({
    id:             S.track.youtubeId || S.track.id || 'song',
    videoUrl:       `https://www.youtube.com/watch?v=${S.track.youtubeId || S.track.id || ''}`,
    title:          S.track.title,
    artist:         S.track.artist,
    duration:       S.track.duration,
    lyrics:         JSON.stringify(S.lyrics),
    artworkUrl:     S.track.artworkUrl || '',
    offset:         S.syncOffset,
    resolution:     selectRes.value,
    fps:            selectFps.value,
    alignment:      selectAlign.value,
    isShort:        isShort,
    shortStartTime: shortStartTime,
    isSlideshow:    isSlideshow,
    slideshowIndices: JSON.stringify(window.slideshowIndices || []),
    youtubeDuration: S.track.youtubeDuration || S.track.duration,
    itunesDuration:  S.track.duration,
  });
  if (S.track.customAudioPath) params.append('customAudioPath', S.track.customAudioPath);

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
  
  const ytTags = document.getElementById('yt-tags');
  if (ytTags) ytTags.value = msg.youtubeTags || '';

  doneSub.textContent = `${S.track.artist} · ${S.track.title}`;

  // Load thumbnail preview
  donePreviewImage.classList.remove('loaded');
  donePreviewImage.src = '';
  donePreviewLoader.style.display = 'block';

  if (msg.thumbnailId) {
    donePreviewImage.onload = () => {
      donePreviewLoader.style.display = 'none';
      donePreviewImage.classList.add('loaded');
    };
    donePreviewImage.src = `/api/preview/${msg.thumbnailId}`;
  } else {
    donePreviewLoader.textContent = 'Preview unavailable';
  }

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

// Trending panel
btnTrending.addEventListener('click', toggleTrendingPanel);
btnTrendingClose.addEventListener('click', () => trendingPanel.classList.add('hidden'));

async function toggleTrendingPanel() {
  if (!trendingPanel.classList.contains('hidden')) {
    trendingPanel.classList.add('hidden');
    return;
  }
  
  trendingPanel.classList.remove('hidden');
  trendingList.innerHTML = '';
  trendingList.classList.add('hidden');
  trendingLoading.classList.remove('hidden');
  
  try {
    const res = await fetch('/api/trending');
    const tracks = await res.json();
    
    trendingList.innerHTML = '';
    tracks.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'trending-item';
      item.innerHTML = `
        <div class="trending-rank">${i + 1}</div>
        <img class="trending-art" src="${t.artworkUrl || 'logo.png'}" alt="Art">
        <div class="trending-meta">
          <div class="trending-title">${t.title}</div>
          <div class="trending-artist">${t.artist}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        trendingPanel.classList.add('hidden');
        openSearch();
        fetchMetadataResults(`${t.title} ${t.artist}`);
      });
      trendingList.appendChild(item);
    });
    
    trendingLoading.classList.add('hidden');
    trendingList.classList.remove('hidden');
  } catch (e) {
    console.error('Trending fetch error:', e);
    trendingLoading.innerHTML = '<span>Failed to load charts.</span>';
  }
}


modalQuery.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = modalQuery.value.trim();
    if (q) {
      fetchMetadataResults(q);
    }
  } else if (e.key === 'Escape') {
    closeSearch();
  }
});

// Suggest chips
document.querySelectorAll('.suggest-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    fetchMetadataResults(chip.dataset.query);
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

// Export
btnCompile.addEventListener('click', () => {
  if (!S.track || !S.lyrics.length) return;
  startCompile();
});

if (btnShort) {
  btnShort.addEventListener('mouseenter', () => {
    S.previewingShort = true;
    if (audio) updateSyncHighlight(audio.currentTime, true);
  });
  
  btnShort.addEventListener('mouseleave', () => {
    S.previewingShort = false;
    if (audio) updateSyncHighlight(audio.currentTime, true);
  });

  btnShort.addEventListener('click', () => {
    if (!S.track || !S.lyrics.length) return;
    // Get the current audio time and find the nearest lyric time to start from
    let startTime = 0;
    if (audio) {
      startTime = audio.currentTime;
      // Optionally find nearest lyric line timestamp that has already passed or is close
      const passedLines = S.lyrics.filter(l => l.time <= audio.currentTime);
      if (passedLines.length) startTime = passedLines[passedLines.length - 1].time;
    }
    startCompile(true, startTime);
  });
}

if (btnSlideshow) {
  btnSlideshow.addEventListener('click', () => {
    if (!S.track || !S.lyrics.length) return;
    const checked = Array.from(document.querySelectorAll('.lyric-cb'))
      .map((cb, idx) => cb.checked ? idx : -1)
      .filter(idx => idx !== -1);
    
    if (checked.length === 0) {
      alert("Please check the boxes next to the lyrics you want to include in the slideshow!");
      return;
    }
    
    window.slideshowIndices = checked;
    startCompile(false, 0, true);
  });
}

btnTranslate.addEventListener('click', async () => {
  if (!S.lyrics || S.lyrics.length === 0) return;
  btnTranslate.disabled = true;
  btnTranslate.textContent = 'Translating...';
  try {
    const lines = S.lyrics.map(l => l.text);
    const textBlob = lines.join('\n');
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textBlob, lines: lines })
    });
    
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    
    if (data.translatedText !== undefined) {
      // New backend format
      const translations = data.translatedText.split('\n');
      translations.forEach((t, i) => {
        if (S.lyrics[i]) S.lyrics[i].translation = t.trim();
      });
    } else if (data.translations && Array.isArray(data.translations)) {
      // Old backend format (fallback if server hasn't been restarted)
      data.translations.forEach((t, i) => {
        if (S.lyrics[i]) S.lyrics[i].translation = t.trim();
      });
    }
    renderLyricsList();
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  } catch (err) {
    alert('Translation error: ' + err.message);
  } finally {
    btnTranslate.disabled = false;
    btnTranslate.textContent = 'Auto-Translate';
  }
});

if (btnClearTrans) {
  btnClearTrans.addEventListener('click', () => {
    if (!S.lyrics || S.lyrics.length === 0) return;
    if (confirm("Are you sure you want to remove all translated lyrics?")) {
      S.lyrics.forEach(l => delete l.translation);
      renderLyricsList();
      precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
    }
  });
}

// Editor apply
btnApply.addEventListener('click', () => {
  const text = lyricsEditor.value.trim();
  if (!text) { setLyrics([], 'none', ''); return; }
  if (/(?:\[\d{1,2}:\d{2}|\b\d{1,2}:\d{2}\b)/.test(text)) {
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


// Cancel render
btnCancel.addEventListener('click', () => {
  if (activeSSE) activeSSE.close();
  showView('studio');
  startCanvasLoop();
});

// Done → again
btnAgain.addEventListener('click', () => {
  // Just show the studio again! Don't nuke the loaded song.
  showView('studio');
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
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      showLyricsEmpty('No lyrics found.');
      return;
    }
    manualLyricsResults = data.map(r => ({
      id: `lrclib_${r.id}`,
      trackName: r.trackName,
      artistName: r.artistName,
      albumName: r.albumName,
      duration: r.duration,
      syncedLyrics: r.syncedLyrics,
      plainLyrics: r.plainLyrics,
      source: 'LRCLIB'
    }));
    renderLyricsResults(manualLyricsResults);
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

  // Also push the rest of the search results to the end so they populate the dropdown
  if (typeof manualLyricsResults !== 'undefined') {
    manualLyricsResults.forEach(r => {
      if (r.id !== lrclibRecord.id && !S.lyricsRecords.some(ex => ex.id === r.id)) {
        S.lyricsRecords.push({
          source: 'LRCLIB (Manual Alt)',
          id: r.id,
          duration: r.duration,
          trackName: r.trackName,
          artistName: r.artistName,
          syncedLyrics: r.syncedLyrics,
          plainLyrics: r.plainLyrics
        });
      }
    });
  }
  
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
// 11. INIT & Local Audio
// ═══════════════════════════════════════════════════════════════════
const btnLocalAudio = document.getElementById('btn-local-audio');
const btnErrorUploadAudio = document.getElementById('btn-error-upload-audio');
const localAudioUpload = document.getElementById('local-audio-upload');
const audioErrorModal = document.getElementById('audio-error-modal');
const btnCopyErrorLink = document.getElementById('btn-copy-error-link');
const btnErrorClose = document.getElementById('btn-error-close');

if (btnLocalAudio && localAudioUpload) btnLocalAudio.addEventListener('click', () => localAudioUpload.click());
if (btnErrorUploadAudio && localAudioUpload) btnErrorUploadAudio.addEventListener('click', () => localAudioUpload.click());

if (btnErrorClose && audioErrorModal) btnErrorClose.addEventListener('click', () => audioErrorModal.classList.add('hidden'));

if (btnCopyErrorLink) {
  btnCopyErrorLink.addEventListener('click', () => {
    const input = document.getElementById('error-yt-link');
    input.select();
    document.execCommand('copy');
    btnCopyErrorLink.textContent = 'Copied!';
    setTimeout(() => btnCopyErrorLink.textContent = 'Copy', 2000);
  });
}

if (localAudioUpload) {
  localAudioUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (audioErrorModal) audioErrorModal.classList.add('hidden');
    
    // Upload to server for rendering
    const formData = new FormData();
    formData.append('audio', file);
    
    try {
      const prevText = btnCompile.innerHTML;
      btnCompile.disabled = true;
      btnCompile.textContent = 'Uploading Audio...';
      const res = await fetch('/api/upload-audio', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      if (!S.track) S.track = { title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Local', duration: 0, id: 'local' };
      S.track.customAudioPath = data.path;
      console.log('Uploaded custom audio:', data.path);

      // Play locally immediately
      const localUrl = URL.createObjectURL(file);
      audio.pause();
      audio.src = localUrl;
      audio.load();
      audioOverlay.classList.remove('hidden');
      audioLoadTxt.textContent = 'Loading custom audio...';
      audio.addEventListener('canplay', () => { audioOverlay.classList.add('hidden'); }, { once: true });

      btnCompile.disabled = false;
      btnCompile.innerHTML = prevText;
    } catch (err) {
      alert('Failed to upload custom audio: ' + err.message);
      btnCompile.disabled = false;
      btnCompile.innerHTML = 'Compile Video';
    }
  });
}

showView('studio');
startCanvasLoop();
openSearch();
