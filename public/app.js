/**
 * NOISES STUDIO — app.js v7.0.16
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 1. STATE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

const FONT = 'Plus Jakarta Sans, Noto Sans Devanagari';

const S = {
  // Track metadata
  track: null,          // { title, artist, artworkUrl, duration, youtubeId }
  lyricsRecords: [],    // Raw records from LRCLIB
  lyrics: [],           // Active working set: [{ time, text }]
  lyricsType: 'none',   // 'synced' | 'plain' | 'none'
  syncOffset: 0.0,

  // UI state
  activeTab: 'tab-track',
  showTranslations: false,
  targetScrollTop: null,
  currentScrollTop: 0,
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 2. DOM REFERENCES
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
const btnToggleTrans = $('btn-toggle-translations');
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 3. AUDIO ENGINE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
      
      // Prevent race conditions: check if the audio is already playing
      S.isPlaying = !audio.paused;
      if (S.isPlaying) {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
      } else {
        if (isInitial) {
          S.videoTime = 0;
        }
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
      btnPlay.disabled = false;
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      if (!S.isPlaying) {
        S.isPlaying = true;
        S.lastFrameTime = performance.now() / 1000;
      }
    });
    audio.addEventListener('pause', () => {
      btnPlay.disabled = false;
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
      if (modal && ytLink && S.track && S.track.youtubeId) {
        ytLink.value = `https://www.youtube.com/watch?v=${S.track.youtubeId}`;
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
  audio.removeAttribute('src');
  audio.load();
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
  
  fetch(`/api/prepare-stream/${videoId}?${params.toString()}`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        audio.src = `/api/stream/${videoId}?${params.toString()}`;
        audio.load();
        updatePlayerUIElements();
      } else {
        throw new Error(data.error || 'Failed to prepare stream');
      }
    })
    .catch(e => {
      console.error('Prepare stream error:', e);
      // Trigger the standard audio error handler
      audio.dispatchEvent(new Event('error'));
    });
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

  const btnPreviewThumb = document.getElementById('btn-preview-thumb');
  if (S.track && btnPreviewThumb) {
    btnPreviewThumb.disabled = false;
  }
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 4. CANVAS ENGINE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

// ΓöÇΓöÇ Draw blur background source from album art ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Extract dominant colors from album art ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Load artwork image ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Draw background (Apple Music style blurred art) ΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Draw song info watermark (top-left) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Draw progress bar (bottom) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Watermark (bottom-left) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawWatermark(W, H, t) {
  if (!logoImg || !logoImg.complete) return;
  ctx.save();
  
  const margin = Math.round(Math.min(W, H) * 0.05);
  
  // Constrain width to 10% of screen width, or height to 5% of screen height
  const aspect = logoImg.width / logoImg.height;
  let drawW = W * 0.10;
  let drawH = drawW / aspect;
  
  if (drawH > H * 0.05) {
    drawH = H * 0.05;
    drawW = drawH * aspect;
  }
  
  const lx = margin;
  const ly = H - margin - drawH;
  
  // Floating offset using sine wave based on time (t)
  const floatY = Math.sin(t * 2.0) * 3.5;
  
  // 100% visible
  ctx.globalAlpha = 1.0;
  
  ctx.drawImage(logoImg, lx, ly + floatY, drawW, drawH);
  ctx.restore();
}

// ΓöÇΓöÇ Draw floating ΓÖ¬ musical notes ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Text wrapping helper ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Precompute wrapped lyrics and layout coordinates ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function precomputeLyricsLayout(W, H, alignment) {
  // Sort a copy chronologically for rendering, keeping S.lyrics in its natural text order
  const lyrics = [...S.lyrics].sort((a, b) => (a.time || 0) - (b.time || 0));
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

// ΓöÇΓöÇ Left Split Screen Layout (Watermark Cover Art + Player) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
  ctx.font = `600 ${artistSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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


// ΓöÇΓöÇ Empty state canvas (no track loaded) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function drawEmptyState(W, H, t) {
  // Dark base
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, W, H);

  // Subtle white glow
  const gx = W * 0.5, gy = H * 0.5;
  const gr = Math.max(W, H) * 0.5;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
  g.addColorStop(0, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Draw floating logo in center
  if (logoImg && logoImg.complete) {
    const pulse = 1 + 0.015 * Math.sin(t * 1.5);
    const aspect = logoImg.width / logoImg.height;
    const lgSz = Math.round(H * 0.12) * pulse; // Height of logo
    const drawW = lgSz * aspect;
    const drawH = lgSz;
    const floatY = Math.sin(t * 2.0) * 8;
    
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = 'rgba(255,255,255,0.15)';
    ctx.shadowBlur = 40 + 10 * Math.sin(t * 3);
    ctx.drawImage(logoImg, (W - drawW) / 2, (H - drawH) / 2 + floatY - 30, drawW, drawH);
    ctx.restore();
  }

  // Subtitle text
  const msg = 'Ready to create.';
  const sz = Math.round(H * 0.035);
  const font = `500 ${sz}px ${FONT}, sans-serif`;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.shadowColor = 'rgba(255,255,255,0.1)';
  ctx.shadowBlur = 10;
  ctx.fillText(msg, W / 2, H / 2 + 80);
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

// ΓöÇΓöÇ Loading state canvas (resolving track) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

// ΓöÇΓöÇ Main frame ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
  ctx.font = `600 ${artistSz}px ${FONT}, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `600 ${artistSz}px ${FONT}, sans-serif`;
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 5. SEARCH ENGINE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

let searchTimer = null;

let viralDataFetched = false;

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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// TRENDING MODAL & AUTO-LOAD LOGIC
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
const trendingModal = document.getElementById('trending-modal');
const btnTrending = document.getElementById('btn-trending');
const btnTrendingClose = document.getElementById('btn-trending-close');

if (btnTrending && trendingModal) {
  btnTrending.addEventListener('click', () => {
    trendingModal.classList.remove('hidden');
    if (!viralDataFetched) {
      fetchTrendingInsights('pop');
    }
  });
}

if (btnTrendingClose && trendingModal) {
  btnTrendingClose.addEventListener('click', () => {
    trendingModal.classList.add('hidden');
  });
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// PUBLISH MODAL LOGIC
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
const publishModal = document.getElementById('publish-modal');
const btnPublishModal = document.getElementById('btn-publish-modal');
const btnPublishClose = document.getElementById('btn-publish-close');

if (btnPublishModal && publishModal) {
  btnPublishModal.addEventListener('click', () => {
    publishModal.classList.remove('hidden');
  });
}

if (btnPublishClose && publishModal) {
  btnPublishClose.addEventListener('click', () => {
    publishModal.classList.add('hidden');
  });
}

document.querySelectorAll('.trending-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.trending-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    // Update YouTube Charts Link
    const cat = e.target.dataset.cat;
    const ytLink = document.getElementById('youtube-charts-link');
    if (ytLink) {
      if (cat === 'pop') ytLink.href = 'https://charts.youtube.com/charts/TrendingVideos/US';
      else ytLink.href = `https://www.youtube.com/results?search_query=top+trending+${cat}+music`;
    }

    fetchTrendingInsights(cat);
  });
});

async function autoLoadAndPlay(query) {
  if (trendingModal) trendingModal.classList.add('hidden');
  closeSearch();
  
  const overlay = document.getElementById('audio-loading-overlay');
  const text = document.getElementById('audio-loading-text');
  if (overlay && text) {
    overlay.classList.remove('hidden');
    text.textContent = 'Auto-loading track...';
  }
  
  try {
    const res = await fetch(`/api/search-metadata?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('No results found');
    
    const item = data.results[0];
    
    // 1. Resolve Song (fetches lyrics)
    if (text) text.textContent = 'Fetching lyrics & metadata...';
    await resolveSong(item);
    
    // 2. Audio is already initialized inside resolveSong
    if (text) text.textContent = 'Connecting to audio stream...';
    
    // 3. Play automatically
    audio.play().catch(() => {});
    
    if (overlay) overlay.classList.add('hidden');
  } catch (err) {
    console.error('Auto-load failed', err);
    if (overlay) overlay.classList.add('hidden');
    alert('Auto-load failed: ' + err.message);
  }
}

// Close trending modal on Esc
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && trendingModal && !trendingModal.classList.contains('hidden')) {
    trendingModal.classList.add('hidden');
  }
});

async function fetchTrendingInsights(category) {
  const loading = document.getElementById('viral-loading');
  const content = document.getElementById('viral-content');
  const hotList = document.getElementById('viral-hot-list');
  
  const itunesLoading = document.getElementById('itunes-loading');
  const itunesContent = document.getElementById('itunes-content');
  const itunesHotList = document.getElementById('itunes-hot-list');
  
  if (!loading || !content || !hotList) return;
  
  loading.classList.remove('hidden');
  content.classList.add('hidden');
  if (itunesLoading) {
    itunesLoading.classList.remove('hidden');
    itunesContent.classList.add('hidden');
  }
  
  // Fetch Spotify Drops
  fetch(`/api/trending?category=${category}`).then(res => res.json()).then(data => {
    hotList.innerHTML = '';
    data.forEach(t => {
      const el = document.createElement('div');
      el.className = 'viral-card';
      el.innerHTML = `
        <img src="${t.artworkUrl || 'logo.png'}" class="viral-card-img">
        <div class="viral-card-info">
          <div class="viral-card-title">${esc(t.title)}</div>
          <div class="viral-card-artist">${esc(t.artist)}</div>
        </div>
      `;
      el.onclick = () => autoLoadAndPlay(`${t.title} ${t.artist}`);
      hotList.appendChild(el);
    });
    loading.classList.add('hidden');
    content.classList.remove('hidden');
  }).catch(e => {
    console.error('Spotify trending fetch error:', e);
    loading.innerHTML = 'Failed to load Spotify trends.';
  });

  // Fetch iTunes Trending
  if (itunesLoading) {
    fetch('/api/itunes-trending').then(res => res.json()).then(data => {
      itunesHotList.innerHTML = '';
      data.forEach(t => {
        const el = document.createElement('div');
        el.className = 'viral-card';
        el.innerHTML = `
          <img src="${t.artworkUrl || 'logo.png'}" class="viral-card-img">
          <div class="viral-card-info">
            <div class="viral-card-title">${esc(t.title)}</div>
            <div class="viral-card-artist">${esc(t.artist)}</div>
          </div>
        `;
        el.onclick = () => autoLoadAndPlay(`${t.title} ${t.artist}`);
        itunesHotList.appendChild(el);
      });
      itunesLoading.classList.add('hidden');
      itunesContent.classList.remove('hidden');
    }).catch(e => {
      console.error('iTunes fetch error:', e);
      itunesLoading.innerHTML = 'Failed to load iTunes charts.';
    });
  }
  
  viralDataFetched = true;
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
        <div class="result-artist">${esc(item.artist)} &bull; ${esc(item.album)}</div>
      </div>
      <div class="result-dur">${formatDur(item.duration)}</div>
    `;
    
    btn.addEventListener('click', async () => {
      closeSearch();
      
      const overlay = document.getElementById('audio-loading-overlay');
      const text = document.getElementById('audio-loading-text');
      if (overlay && text) {
        overlay.classList.remove('hidden');
        text.textContent = 'Fetching lyrics & metadata...';
      }
      
      await resolveSong(item);
      
      if (text) text.textContent = 'Connecting to audio stream...';
      audio.play().catch(() => {});
      
      if (overlay) overlay.classList.add('hidden');
    });
    
    modalResultList.appendChild(btn);
  });
}

async function resolveSong(metadata) {
  resolving = true;
  matchSkeleton(true);
  btnCompile.disabled = true;
  if(btnCloudExport) btnCloudExport.disabled = true;
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
    
    // Auto-fetch LRCLIB from frontend proxy
    if (S.lyricsRecords.length === 0 && S.track.title && S.track.artist) {
      lyricsSource.innerHTML = '<option>Fetching Lyrics from LRCLIB...</option>';
      try {
        const getUrl = `/api/lyrics?title=${encodeURIComponent(S.track.title)}&artist=${encodeURIComponent(S.track.artist)}`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        const getRes = await fetch(getUrl, { signal: controller.signal }).catch(() => null);
        clearTimeout(id);

        if (getRes && getRes.ok) {
           const lres = await getRes.json();
           if (lres.records && lres.records.length > 0) {
             S.lyricsRecords = lres.records.map(r => ({
               id: `lrclib_${r.id}`,
               trackName: r.trackName,
               artistName: r.artistName,
               albumName: r.albumName || '',
               duration: r.duration || 0,
               syncedLyrics: r.syncedLyrics,
               plainLyrics: r.plainLyrics,
               source: 'LRCLIB (Auto)'
             }));
           }
        }
      } catch (e) {
        console.warn('Frontend LRCLIB fetch failed:', e);
      }
    }

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



    // Try to load saved state from localStorage
    const loaded = loadProjectState();
    if (!loaded) {
      populateLyricsSource();
      autoSelectBestLyrics();
    }

    resolving = false;
    btnCompile.disabled = false;
    if(btnCloudExport) btnCloudExport.disabled = false;
    if (btnShort) btnShort.disabled = false;
    if (btnSlideshow) btnSlideshow.disabled = false;
    lyricsSource.disabled = false;
    return true;

  } catch (err) {
    console.error('[Resolve]', err.message);
    resolving = false;
    lyricsSource.innerHTML = `<option>Resolve failed: ${err.message}</option>`;
    alert(`Could not load song: ${err.message}`);
    return false;
  }
}

function matchSkeleton(show) {
  if (show) {
    headerTitle.textContent = 'Resolving Audio...';
    headerArtist.textContent = 'Please wait';
    headerArt.style.display = 'none';
    headerArt.src = '';
  }
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 6. LYRICS ENGINE
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
  saveProjectState();
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
    
    // Smart Heuristic: Prioritize exact Album Name matches (worth a 10-second duration grace)
    const trackAlbum = (S.track.albumName || '').toLowerCase();
    const albumBonusA = trackAlbum && (a.albumName || '').toLowerCase() === trackAlbum ? 10 : 0;
    const albumBonusB = trackAlbum && (b.albumName || '').toLowerCase() === trackAlbum ? 10 : 0;

    const targetDur = S.track.youtubeDuration || S.track.duration || 0;
    const durA = Math.abs((a.duration || 0) - targetDur) - albumBonusA;
    const durB = Math.abs((b.duration || 0) - targetDur) - albumBonusB;
    
    return durA - durB;
  });

  S.lyricsRecords.forEach((r, i) => {
    const o = document.createElement('option');
    o.value = i;
    const type = r.syncedLyrics ? 'Synced' : r.plainLyrics ? 'Plain' : 'Instr';
    const targetDur = S.track.youtubeDuration || S.track.duration || 0;
    const diff = r.duration ? ` (${Math.abs(r.duration - targetDur)}s diff)` : '';
    o.textContent = `[${type}] ${r.trackName || r.artistName || '—'}${diff}`;
    lyricsSource.appendChild(o);
  });

  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = '📝 Paste Custom Lyrics';
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

  // Switch to Sync & Lyrics tab
  const syncBtn = document.querySelector('.tab-btn[data-tab="tab-sync"]');
  if (syncBtn) syncBtn.click();
}

function loadLyricsByIdx(idx) {
  if (idx === 'custom') { setLyrics([], 'none', ''); return; }
  const r = S.lyricsRecords[parseInt(idx, 10)];
  if (r) loadLyricsRecord(r);
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 7. SYNC UI
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

function renderLyricsList() {
  lyricsList.innerHTML = '';

  const lines = S.tapMode ? S.tapLines : S.lyrics;
  
  if (btnClearTrans) {
    const hasTrans = S.lyrics.some(l => l.translation);
    btnClearTrans.style.display = hasTrans ? 'inline-block' : 'none';
  }
  if (btnToggleTrans) {
    btnToggleTrans.style.display = lines.length ? 'inline-block' : 'none';
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
      if (S.showTranslations) {
        const transInput = document.createElement('input');
        transInput.type = 'text';
        transInput.className = 'line-translation-input';
        transInput.placeholder = 'Add translation...';
        transInput.value = line.translation || '';
        
        transInput.addEventListener('change', (e) => {
          S.lyrics[idx].translation = e.target.value.trim();
          precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
        });
        transInput.addEventListener('click', e => e.stopPropagation());
        textWrap.appendChild(transInput);
      } else if (line.translation) {
        const transEl = document.createElement('span');
        transEl.className = 'line-translation-label';
        transEl.style.cssText = 'font-size:12px; color:var(--text-3); font-style:italic; margin-top:2px;';
        transEl.textContent = line.translation;
        textWrap.appendChild(transEl);
      }
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
      
      // Update the LRC box and layouts without sorting the array to prevent scrambling the lyrics structure
      if (!S.tapMode) {
        lyricsEditor.value = lyricsToLRC(S.lyrics);
        precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
        renderLyricsList(); // Redraw immediately
      } else {
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
      checkbox.addEventListener('change', (e) => {
        updateSlideshowBtnState();
        if (e.target.checked) div.classList.add('selected');
        else div.classList.remove('selected');
      });
      controls.appendChild(checkbox);
    }

    controls.appendChild(timeEl);
    div.appendChild(textWrap);
    div.appendChild(controls);

    // Double-Click to seek
    if (!S.tapMode && isSynced) {
      div.addEventListener('dblclick', () => {
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

  let maxTime = -1;
  let maxShortEndTime = -1;

  for (let i = 0; i < S.lyrics.length; i++) {
    const l = S.lyrics[i];
    if (l.time !== null && l.time !== undefined) {
      if (l.time <= adjTime && l.time > maxTime) {
        maxTime = l.time;
        activeIdx = i;
      }
      if (l.time <= adjTime + 30 && l.time > maxShortEndTime) {
        maxShortEndTime = l.time;
        shortEndIdx = i;
      }
    }
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
    if (activeEl) {
      const containerHeight = lyricsList.clientHeight;
      const activeTop = activeEl.offsetTop;
      const activeHeight = activeEl.clientHeight;
      const target = activeTop - (containerHeight / 2) + (activeHeight / 2);
      S.targetScrollTop = Math.max(0, Math.min(lyricsList.scrollHeight - containerHeight, target));
      triggerSmoothScroll();
    }
  }
}

let scrollAnimId = null;
function triggerSmoothScroll() {
  if (scrollAnimId) return;
  if (S.currentScrollTop === undefined || S.currentScrollTop === null) {
    S.currentScrollTop = lyricsList.scrollTop;
  }
  const animate = () => {
    if (S.targetScrollTop === null || S.targetScrollTop === undefined) {
      scrollAnimId = null;
      return;
    }
    const diff = S.targetScrollTop - S.currentScrollTop;
    if (Math.abs(diff) > 0.5) {
      S.currentScrollTop += diff * 0.12;
      lyricsList.scrollTop = Math.round(S.currentScrollTop);
      scrollAnimId = requestAnimationFrame(animate);
    } else {
      S.currentScrollTop = S.targetScrollTop;
      lyricsList.scrollTop = Math.round(S.currentScrollTop);
      scrollAnimId = null;
    }
  };
  scrollAnimId = requestAnimationFrame(animate);
}

// Sync current scroll position on manual user scroll
lyricsList.addEventListener('scroll', () => {
  if (!scrollAnimId) {
    S.currentScrollTop = lyricsList.scrollTop;
  }
});

function stampLine(idx) {
  if (!audio) return;
  const cur = audio.currentTime || 0;
  const t   = Math.max(0, cur - S.syncOffset);
  S.lyrics[idx].time = Math.round(t * 100) / 100;
  S.tapLines = S.lyrics.map(l => ({ text: l.text, time: l.time }));
  lyricsEditor.value = lyricsToLRC(S.lyrics);
  editorFormat.textContent = 'Synced LRC';
  editorFormat.className = 'editor-format ok';
  precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
  renderLyricsList();
  saveProjectState();
}

// ΓöÇΓöÇ Tap sync mode ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    saveProjectState();
  } else {
    // Save intermediate tap sync data too!
    saveProjectState();
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
  saveProjectState();
}

// ΓöÇΓöÇ Project State Autosave & Restore ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function saveProjectState() {
  if (!S.track || !S.track.youtubeId) return;
  const state = {
    lyrics: S.lyrics,
    lyricsType: S.lyricsType,
    lyricsRecords: S.lyricsRecords,
    syncOffset: S.syncOffset,
    lyricsSourceValue: lyricsSource.value,
    trackTitle: S.track.title,
    trackArtist: S.track.artist
  };
  localStorage.setItem(`noises_lyric_project_${S.track.youtubeId}`, JSON.stringify(state));
}

function loadProjectState() {
  if (!S.track || !S.track.youtubeId) return false;
  const stored = localStorage.getItem(`noises_lyric_project_${S.track.youtubeId}`);
  if (!stored) return false;
  try {
    const state = JSON.parse(stored);
    S.lyrics = state.lyrics || [];
    S.lyricsType = state.lyricsType || 'none';
    S.lyricsRecords = state.lyricsRecords || [];
    S.syncOffset = state.syncOffset || 0.0;
    if (state.trackTitle) S.track.title = state.trackTitle;
    if (state.trackArtist) S.track.artist = state.trackArtist;
    
    // Restore UI elements
    syncOffsetEl.value = S.syncOffset;
    offsetLabel.textContent = `${S.syncOffset >= 0 ? '+' : ''}${S.syncOffset.toFixed(1)}s`;
    headerTitle.textContent = S.track.title;
    headerArtist.textContent = S.track.artist;
    editTitle.value = S.track.title;
    editArtist.value = S.track.artist;
    
    populateLyricsSource();
    lyricsSource.value = state.lyricsSourceValue || 'none';
    
    lyricsEditor.value = lyricsToLRC(S.lyrics);
    if (S.lyricsType === 'synced') {
      editorFormat.textContent = 'Synced LRC';
      editorFormat.className = 'editor-format ok';
    } else if (S.lyricsType === 'plain') {
      editorFormat.textContent = 'Plain text (auto-distributed)';
      editorFormat.className = 'editor-format';
    } else {
      editorFormat.textContent = 'No lyrics';
      editorFormat.className = 'editor-format';
    }
    
    S.tapLines = S.lyrics.map(l => ({ text: l.text, time: S.lyricsType === 'synced' ? l.time : null }));
    S.tapIdx = 0;
    
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
    renderLyricsList();
    return true;
  } catch (e) {
    console.error('Failed to parse project state', e);
    return false;
  }
}


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 8. TRACK INFO EDITORS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

editTitle.addEventListener('input', () => {
  if (S.track) {
    S.track.title = editTitle.value;
    headerTitle.textContent = editTitle.value;
    saveProjectState();
  }
});

editArtist.addEventListener('input', () => {
  if (S.track) {
    S.track.artist = editArtist.value;
    headerArtist.textContent = editArtist.value;
    saveProjectState();
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 9. PLAYER UI
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 9. COMPILATION
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

let lastPct = 0;

async function startCompile(isShort = false, shortStartTime = 0, isSlideshow = false) {
  if (!S.track || !S.lyrics.length) return;
  if (audio && !audio.paused) audio.pause();
  stopCanvasLoop();

  // Hide the publish modal so it doesn't cover the progress view
  const pubModal = document.getElementById('publish-modal');
  if (pubModal) pubModal.classList.add('hidden');

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
      case 'error':
        activeSSE.close();
        setProgress(lastPct, 'Error!');
        logLine(msg.error || 'Unknown error occurred', 'error');
        showView('publish'); // Optionally go back or just let them read the log
        break;
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

  // Check if a YouTube destination was selected
  const destInput = document.querySelector('input[name="export-dest"]:checked');
  if (destInput && destInput.value !== 'local') {
    // Automatically trigger publish
    publishToYouTube(destInput.value);
  }
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 10. EVENT LISTENERS
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
  saveProjectState();
});

// Tap sync
btnTapToggle.addEventListener('click', () => {
  if (S.tapMode) exitTapMode();
  else enterTapMode();
});
btnTap.addEventListener('click', handleTap);
btnReset.addEventListener('click', resetTimings);

// Toggle translations
btnToggleTrans.addEventListener('click', () => {
  S.showTranslations = !S.showTranslations;
  btnToggleTrans.classList.toggle('active', S.showTranslations);
  btnToggleTrans.textContent = S.showTranslations ? 'Hide Trans' : 'Show Trans';
  renderLyricsList();
});

// Export
btnCompile.addEventListener('click', () => {
  if (!S.track || !S.lyrics.length) return;
  startCompile();
});

const btnCloudExport = document.getElementById('btn-cloud-export');
if (btnCloudExport) {
  btnCloudExport.addEventListener('click', async () => {
    if (!S.track || !S.lyrics.length) return;
    
    const channelSelect = document.querySelector('input[name="export-dest"]:checked');
    if (!channelSelect || channelSelect.value === 'local') {
      // Local selected, will not upload to YouTube
    }

    const pubModal = document.getElementById('publish-modal');
    if (pubModal) pubModal.classList.add('hidden');

    showView('progress');
    progLog.innerHTML = '';
    setProgress(5, 'Preparing payload for cloud...');
    progTitle.textContent  = S.track.title + ' (Cloud Render)';
    progArtist.textContent = S.track.artist;
    if (S.track.artworkUrl) { progArt.src = S.track.artworkUrl; progArt.style.display = 'block'; }
    else progArt.style.display = 'none';

    try {
      const formData = new FormData();
      
      const projectData = {
        id: S.track.youtubeId || S.track.id || 'song',
        videoUrl: `https://www.youtube.com/watch?v=${S.track.youtubeId || S.track.id || ''}`,
        artworkUrl: S.track.artworkUrl,
        songTitle: S.track.title,
        songArtist: S.track.artist,
        duration: S.track.duration,
        lyrics: S.lyrics,
        offset: S.syncOffset,
        outRes: document.getElementById('select-res').value,
        outFps: parseInt(document.getElementById('select-fps').value, 10),
        outAlign: document.getElementById('select-align').value,
        isShort: false, // Cloud Export does not currently support the 'short' override via UI toggle
        shortStartTime: 0,
        customAudioPath: S.track.customAudioPath,
        channel: channelSelect ? channelSelect.value : 'local',
        seoKeywords: Array.from(document.querySelectorAll('#tag-list .tag')).map(t => t.textContent.replace('├ù','').trim())
      };

      formData.append('project', JSON.stringify(projectData));

      lastPct = 0; // Reset progress bar state
      setProgress(20, 'Uploading audio & payload to cloud...');
      
      const res = await fetch('/api/cloud-export', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      
      if (data.success) {
        setProgress(100, 'Cloud Render Queued!');
        logLine('Video successfully queued in GitHub Actions!', 'ok');
        logLine('You can safely close this app or start another project.', 'ok');
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      logLine(`ERROR: ${e.message}`, 'error');
      setProgress(20, 'Cloud Export Failed.');
    }
  });
}

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
  
  // Immediately update the lyrics highlight in the sync tab
  const curTime = audio ? audio.currentTime : S.videoTime;
  updateSyncHighlight(curTime, true);
  
  // Re-render the canvas if paused to reflect the new offset
  if (!S.isPlaying) {
    drawFrame(curTime);
  }
  
  saveProjectState();
});

// Alignment change recomputes lyrics layout
selectAlign.addEventListener('change', () => {
  localStorage.setItem('noises_lyric_setting_align', selectAlign.value);
  if (S.track) {
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
    saveProjectState();
  }
});


// Cancel render
btnCancel.addEventListener('click', () => {
  if (activeSSE) activeSSE.close();
  showView('studio');
  startCanvasLoop();
});

// Done ΓåÆ again
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
  // Ctrl+K ΓåÆ open search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }
  // Spacebar ΓåÆ tap sync (when in tap mode and not in input)
  if (e.code === 'Space' && S.tapMode) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      handleTap();
    }
  }
});

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// QUICK SEARCH ENDPOINT (Removed - Unified Search Restored)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// MANUAL LRCLIB SEARCH
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
        <div class="result-artist">${r.artistName} &bull; ${r.albumName}</div>
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
  saveProjectState();
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

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// 11. INIT & Local Audio
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
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
      if(btnCloudExport) btnCloudExport.disabled = true;
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
      if(btnCloudExport) btnCloudExport.disabled = false;
      btnCompile.innerHTML = prevText;
    } catch (err) {
      alert('Failed to upload custom audio: ' + err.message);
      btnCompile.disabled = false;
      if(btnCloudExport) btnCloudExport.disabled = false;
      btnCompile.innerHTML = 'Compile Video';
    }
  });
}

// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// YOUTUBE AUTO-PUBLISH
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
async function publishToYouTube(channel) {
  const statusEl = document.getElementById('yt-publish-status');
  const videoBtn = document.getElementById('btn-dl-video');
  const thumbBtn = document.getElementById('btn-dl-thumb');
  const titleEl = document.getElementById('yt-title');
  const descEl = document.getElementById('yt-desc');
  const tagsEl = document.getElementById('yt-tags');

  if (!videoBtn.href || videoBtn.href === '#') {
    statusEl.style.display = 'block';
    statusEl.style.color = '#ef4444';
    statusEl.innerText = 'Error: Video not ready.';
    return;
  }

  // Extract filenames from the download links
  const videoFilename = decodeURIComponent(new URL(videoBtn.href, window.location.origin).pathname.split('/').pop()); 
  const thumbFilename = decodeURIComponent(new URL(thumbBtn.href, window.location.origin).pathname.split('/').pop()); 

  // Format paths to point exactly to the output folder for the backend
  const videoPath = 'output/' + videoFilename; 
  const thumbnailPath = 'output/' + thumbFilename;

  const title = titleEl.value;
  const description = descEl.value;
  const rawTags = tagsEl.value.split(',').map(t => t.trim());
  
  // Enforce YouTube's 500-character total tags limit
  const tags = [];
  let totalLen = 0;
  for (const t of rawTags) {
    if (!t) continue;
    if (totalLen + t.length + 1 <= 500) {
      tags.push(t);
      totalLen += t.length + 1;
    }
  }

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-1)';
  statusEl.innerText = 'Uploading to YouTube...';

  try {
    const res = await fetch('/api/youtube-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        videoPath,
        thumbnailPath,
        title,
        description,
        tags
      })
    });
    
    const data = await res.json();
    if (data.error) {
      statusEl.style.color = '#ef4444';
      statusEl.innerText = `Error: ${data.error}`;
    } else {
      statusEl.style.color = 'var(--accent)';
      statusEl.innerHTML = `Success! <a href="${data.editUrl}" target="_blank" style="color:var(--accent); text-decoration:underline;">Review & Publish Video &rarr;</a>`;
    }
  } catch (err) {
    statusEl.style.color = '#ef4444';
    statusEl.innerText = `Error: ${err.message}`;
  }
}

const savedAlign = localStorage.getItem('noises_lyric_setting_align');
if (savedAlign && selectAlign) {
  selectAlign.value = savedAlign;
}

showView('studio');
startCanvasLoop();
openSearch();

async function updateYouTubeChannelNames() {
  try {
    const res = await fetch('/api/youtube-status');
    const status = await res.json();
    for (const [ch, info] of Object.entries(status)) {
      const btn = document.getElementById(`btn-yt-${ch}`);
      if (btn && info.authenticated && info.name) {
        btn.innerHTML = `&#9654; ${info.name}`;
        btn.title = `Authenticated as: ${info.name}`;
      }
    }
  } catch (e) {
    console.error('Failed to load YouTube channel names', e);
  }
}

// --- Quota & Pipeline Dashboard ---
async function fetchQuota() {
  try {
    const res = await fetch('/api/quota');
    const { quota } = await res.json();
    const pct = Math.min(100, Math.round((quota / 10000) * 100));
    document.getElementById('quota-text').innerText = `${quota} / 10000`;
    document.getElementById('quota-bar-fill').style.width = `${pct}%`;
    if (pct > 90) document.getElementById('quota-bar-fill').style.background = '#ef4444';
  } catch (e) {}
}

async function fetchDailyStatus() {
  try {
    const res = await fetch('/api/daily-status');
    const status = await res.json();
    const channels = ['pop', 'hiphop', 'hindi', 'dhh', 'kpop'];
    channels.forEach(ch => {
      const el = document.getElementById(`pipe-${ch}`);
      if (el) {
        const dot = el.querySelector('.dot');
        if (status[ch]) {
          dot.style.background = '#10b981'; // Green
        } else {
          dot.style.background = '#ef4444'; // Red
        }
      }
    });
  } catch (e) {}
}





// --- Schedule Indicator ---
async function updateSchedulePreview(channel) {
  const ind = document.getElementById('schedule-indicator');
  if (!ind) return;
  try {
    const res = await fetch(`/api/schedule-preview?channel=${channel}`);
    const { preview } = await res.json();
    if (preview) {
      const d = new Date(preview);
      const formatted = d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      ind.innerText = `Scheduled for: ${formatted}`;
    }
  } catch (e) {}
}

// --- Thumbnail Preview Modal ---
const btnPreviewThumb = document.getElementById('btn-preview-thumb');
const thumbModal = document.getElementById('thumb-modal');
const thumbImage = document.getElementById('thumb-image');
const thumbLoading = document.getElementById('thumb-loading');
const btnThumbDownload = document.getElementById('btn-thumb-download');

document.getElementById('btn-thumb-modal-close')?.addEventListener('click', () => {
  thumbModal.classList.add('hidden');
});

// Click outside to close
thumbModal?.addEventListener('click', (e) => {
  if (e.target === thumbModal) thumbModal.classList.add('hidden');
});

if (btnPreviewThumb) {
  btnPreviewThumb.addEventListener('click', async () => {
    if (!S.track) return;
    
    // Hide publish modal so thumb modal is visible
    const publishModal = document.getElementById('publish-modal');
    if (publishModal) publishModal.classList.add('hidden');
    
    thumbModal.classList.remove('hidden');
    thumbImage.style.opacity = '0';
    thumbLoading.style.display = 'block';
    if (btnThumbDownload) btnThumbDownload.style.display = 'none';

    try {
      const req = await fetch('/api/thumbnail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: S.track.title,
          artist: S.track.artist,
          artworkUrl: S.track.artworkUrl,
          theme: selectAlign ? selectAlign.value : 'center'
        })
      });
      if (!req.ok) throw new Error('Failed to generate thumbnail');
      const blob = await req.blob();
      const url = URL.createObjectURL(blob);
      thumbImage.src = url;
      thumbImage.onload = () => {
        thumbLoading.style.display = 'none';
        thumbImage.style.opacity = '1';
        // Show download button
        if (btnThumbDownload) {
          btnThumbDownload.href = url;
          btnThumbDownload.download = `${S.track.artist} - ${S.track.title} Thumbnail.jpg`;
          btnThumbDownload.style.display = 'flex';
        }
      };
    } catch (e) {
      thumbLoading.style.display = 'none';
      thumbModal.classList.add('hidden');
      alert('Error previewing thumbnail: ' + e.message);
    }
  });
}

// --- Enable Buttons when Track is Ready ---
// Moved btnPreviewThumb logic to updatePlayerUIElements()

// --- Visual Canvas Indicator Helper ---
let indicatorTimeout;
function flashIndicator(content) {
  const indicator = document.getElementById('canvas-action-indicator');
  const icon = indicator.querySelector('.indicator-icon');
  if (!indicator || !icon) return;
  
  icon.innerHTML = content;
  indicator.classList.remove('flash');
  void indicator.offsetWidth; // trigger reflow
  indicator.classList.add('flash');
  
  clearTimeout(indicatorTimeout);
  indicatorTimeout = setTimeout(() => {
    indicator.classList.remove('flash');
  }, 600);
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  // Ignore if typing in an input or textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  if (e.code === 'Space') {
    e.preventDefault(); // Stop focused buttons from being clicked
    togglePlay();
    if (S.isPlaying) {
      flashIndicator('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>');
    } else {
      flashIndicator('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>');
    }
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    seekTo(S.videoTime + 5);
    flashIndicator('+5s');
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    seekTo(S.videoTime - 5);
    flashIndicator('-5s');
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    audio.volume = Math.min(1, audio.volume + 0.1);
    flashIndicator(`Vol: ${Math.round(audio.volume * 100)}%`);
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    audio.volume = Math.max(0, audio.volume - 0.1);
    flashIndicator(`Vol: ${Math.round(audio.volume * 100)}%`);
  } else if (e.ctrlKey && e.code === 'Enter') {
    e.preventDefault();
    const btnCompile = document.getElementById('btn-compile');
    if (btnCompile && !btnCompile.disabled) btnCompile.click();
  }
});

// --- Canvas Click to Play/Pause ---
const previewCanvas = document.getElementById('preview-canvas');
if (previewCanvas) {
  previewCanvas.addEventListener('click', () => {
    togglePlay();
    if (S.isPlaying) {
      flashIndicator('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>');
    } else {
      flashIndicator('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>');
    }
  });
}

updateYouTubeChannelNames();
fetchQuota();
fetchDailyStatus();



