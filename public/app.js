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

  // YouTube captions cache
  ytCaptionsLRC: null,
  ytCaptionsList: null,
  ytCaptionsSearching: false,

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

  // YouTube captions cache
  ytCaptionsLRC: null,
  ytCaptionsList: null,
  ytCaptionsSearching: false,

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
const translationsEditor = $('translations-editor');
const editorFormat = $('editor-format');
const btnFetchGenius = $('btn-fetch-genius');
const btnApply     = $('btn-apply');
const btnGroup2    = $('btn-group-2');
const btnGroup4    = $('btn-group-4');
const btnMapTranslations = $('btn-map-translations');
const btnYtCaptions = $('btn-yt-captions');
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
const selectLinesPerScreen = $('select-lines-per-screen');

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

  // --- Natural Contrast Transformation (Linear RGB Scaling) ---
  const imgData = bx.getImageData(0, 0, bx.canvas.width, bx.canvas.height);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i+1], b = data[i+2];
    let luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma > 70) {
      const scale = 70 / luma;
      data[i] = Math.round(r * scale);
      data[i+1] = Math.round(g * scale);
      data[i+2] = Math.round(b * scale);
    }
  }
  bx.putImageData(imgData, 0, 0);
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

// Group lyrics function
function groupEditorLyrics(groupSize) {
  const text = lyricsEditor.value;
  if (!text.trim()) return;

  // Split into lines, strip timestamps, filter empty
  const lines = text.split(/\r?\n/)
    .map(l => l.replace(/^\[\d+:\d+[.:]?\d*\]\s*/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return;

  const grouped = [];
  for (let i = 0; i < lines.length; i += groupSize) {
    const chunk = lines.slice(i, i + groupSize);
    grouped.push(chunk.join(' / '));
  }

  lyricsEditor.value = grouped.join('\n');
  editorFormat.textContent = `Plain text (grouped ${groupSize}x — tap to sync)`;
  editorFormat.className = 'editor-format';
  
  showToast(`Grouped lyrics into ${groupSize}-line blocks!`);
}

if (btnGroup2) {
  btnGroup2.addEventListener('click', () => groupEditorLyrics(2));
}
if (btnGroup4) {
  btnGroup4.addEventListener('click', () => groupEditorLyrics(4));
}

if (btnFetchGenius) {
  btnFetchGenius.addEventListener('click', async () => {
    if (!S.track || !S.track.title || !S.track.artist) {
      showToast('Please search and load a track first to fetch lyrics.');
      return;
    }
    const oldText = btnFetchGenius.textContent;
    btnFetchGenius.textContent = 'Fetching...';
    try {
      const res = await fetch(`/api/fetch-raw-lyrics?title=${encodeURIComponent(S.track.title)}&artist=${encodeURIComponent(S.track.artist)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch raw lyrics');
      
      lyricsEditor.value = data.lyrics;
      showToast(`Fetched lyrics from ${data.source}!`);
    } catch (e) {
      console.error('Fetch Raw Lyrics Error:', e);
      showToast(e.message || 'Error fetching lyrics from Genius');
    } finally {
      btnFetchGenius.textContent = oldText;
    }
  });
}

// Map Translations line by line
if (btnMapTranslations) {
  btnMapTranslations.addEventListener('click', () => {
    if (!S.lyrics || S.lyrics.length === 0) {
      alert("Please parse or load raw lyrics on the left first.");
      return;
    }
    const transText = translationsEditor.value.trim();
    if (!transText) return;
    
    const lines = transText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) {
      S.lyrics.forEach((lyricObj, idx) => {
        if (lines[idx]) {
          lyricObj.translation = lines[idx];
        } else {
          delete lyricObj.translation;
        }
      });
      renderLyricsList();
      alert(`Mapped ${Math.min(lines.length, S.lyrics.length)} translation lines successfully!`);
    }
  });
}

// Editor apply — read textarea NOW, clear old lyrics, apply new ones, switch to Sync tab
btnApply.addEventListener('click', () => {
  const text = lyricsEditor.value.trim();
  if (!text) {
    setLyrics([], 'none', '');
    return;
  }
  // Detect LRC format (timestamps like [00:12.34] or [0:12])
  if (/\[\d{1,2}:\d{2}/.test(text)) {
    const parsed = parseLRC(text);
    // Preserve the exact text the user typed — don't let setLyrics overwrite it
    S.lyrics = parsed;
    S.lyricsType = 'synced';
    S.lastHighlightIdx = -1;
    S.scrollY = undefined;
    wrapCache.clear();
    editorFormat.textContent = 'Synced LRC';
    editorFormat.className = 'editor-format ok';
    S.tapLines = parsed.map(l => ({ text: l.text, time: l.time }));
    S.tapIdx = 0;
    exitTapMode();
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
    renderLyricsList();
    saveProjectState();
  } else {
    // Plain text — strip any existing timestamps from lines and spread evenly
    const plainText = text.split(/\r?\n/).map(l => l.replace(/^\[\d+:\d+[.:]?\d*\]\s*/, '').trim()).filter(Boolean).join('\n');
    const list = S.track ? spreadPlain(plainText, S.track.duration) : [];
    S.lyrics = list;
    S.lyricsType = 'plain';
    S.lastHighlightIdx = -1;
    S.scrollY = undefined;
    wrapCache.clear();
    editorFormat.textContent = 'Plain text (tap to sync)';
    editorFormat.className = 'editor-format';
    S.tapLines = list.map(l => ({ text: l.text, time: null }));
    S.tapIdx = 0;
    exitTapMode();
    precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
    renderLyricsList();
    saveProjectState();
  }
  // Switch to Sync tab so user can start tapping immediately
  const syncBtn = document.querySelector('.tab-btn[data-tab="tab-sync"]');
  if (syncBtn) syncBtn.click();
});

// ── Shared caption fetch function ─────────────────────────────────────────────
// opts.auto = true  → silent background fetch (no alert on error, show status in editor)
// opts.auto = false → manual button click (show alerts)
async function fetchAndApplyCaptions(opts = {}) {
  const { auto = false } = opts;
  const videoId = S.track?.youtubeId;
  if (!videoId) return;

  const setStatus = (msg, cls = '') => {
    editorFormat.textContent = msg;
    editorFormat.className   = `editor-format${cls ? ' ' + cls : ''}`;
  };

  S.ytCaptionsSearching = true;
  if (btnYtCaptions) {
    btnYtCaptions.disabled = true;
    btnYtCaptions.textContent = '⏳ Searching…';
  }
  
  // Show in dropdown that we are searching
  lyricsSource.disabled = true;
  populateLyricsSource();
  lyricsSource.value = 'loading';
  setStatus('🔍 Searching YouTube for captions…');

  if (auto) {
    lyricsEditor.placeholder = 'Searching YouTube for captions… this may take 10–20 seconds.';
  }

  try {
    const title  = encodeURIComponent(S.track?.title  || '');
    const artist = encodeURIComponent(S.track?.artist || '');
    const res  = await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}&title=${title}&artist=${artist}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'No captions found');

    S.ytCaptionsSearching = false;
    
    // Parse captions and format as LRC with timestamps
    const lrcContent = lyricsToLRC(data.lyrics);
    S.ytCaptionsLRC = lrcContent;
    S.ytCaptionsList = data.lyrics;

    // Check if the user changed the source dropdown while we were loading in background
    if (lyricsSource.value === 'loading') {
      // Apply the captions immediately and set as active source
      setLyrics(data.lyrics, 'synced', lrcContent);

      // Update Lyrics Source dropdown
      lyricsSource.disabled = false;
      populateLyricsSource();
      lyricsSource.value = 'yt-captions';

      if (data.source === 'lyrics_search') {
        setStatus(`✓ ${data.lyrics.length} lines from lyrics video — applied`, 'ok');
        showToast(`Used lyrics video captions: "${data.sourceTitle}"`);
      } else {
        setStatus(`✓ ${data.lyrics.length} caption lines loaded — applied`, 'ok');
      }

      lyricsEditor.placeholder = 'Paste LRC lyrics or plain text here…';
      lyricsEditor.classList.add('pulse-attention');
      setTimeout(() => lyricsEditor.classList.remove('pulse-attention'), 2000);

      // Switch to Sync tab so user sees the timestamped lyrics ready to play!
      const syncBtn = document.querySelector('.tab-btn[data-tab="tab-sync"]');
      if (syncBtn) syncBtn.click();

      saveProjectState();
    } else {
      // User changed source while loading. Just update dropdown options in case they want to switch to it later
      lyricsSource.disabled = false;
      populateLyricsSource();
    }

  } catch (err) {
    S.ytCaptionsSearching = false;
    lyricsSource.disabled = false;
    populateLyricsSource();
    
    // Only restore/reset if the dropdown was still showing the loading state
    if (lyricsSource.value === 'loading') {
      if (S.lyricsRecords.length) {
        lyricsSource.value = '0';
        loadLyricsByIdx('0');
      } else {
        lyricsSource.value = 'none';
        setLyrics([], 'none', '');
      }
    }

    lyricsEditor.placeholder = 'Paste LRC lyrics or plain text lyrics here…';
    setStatus('No captions found — paste lyrics manually');
    if (!auto) alert(`Could not fetch captions: ${err.message}`);
  } finally {
    if (btnYtCaptions) {
      btnYtCaptions.disabled = false;
      btnYtCaptions.innerHTML = 'YT Captions';
    }
  }
}

// Helper: small fade-out toast
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999;pointer-events:none;transition:opacity 0.5s;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
}

// YT Captions button — manual retry
if (btnYtCaptions) {
  btnYtCaptions.addEventListener('click', () => fetchAndApplyCaptions({ auto: false }));
}

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

if (selectLinesPerScreen) {
  selectLinesPerScreen.addEventListener('change', () => {
    localStorage.setItem('noises_lyric_setting_lines_per_screen', selectLinesPerScreen.value);
    if (S.track) {
      precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
      saveProjectState();
    }
  });
}


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

// Ctrl+K opens search
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
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
      
      audio.addEventListener('loadedmetadata', () => {
        if (S.track) {
          S.track.duration = audio.duration;
          S.audioDuration = audio.duration;
          updatePlayerUIElements();
        }
      }, { once: true });
      
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
const savedLines = localStorage.getItem('noises_lyric_setting_lines_per_screen');
if (savedLines && selectLinesPerScreen) {
  selectLinesPerScreen.value = savedLines;
}

showView('studio');
startCanvasLoop();
openSearch();


const channelAuthState = {
  pop: false, hiphop: false, hindi: false, dhh: false, kpop: false
};

async function updateYouTubeChannelNames() {
  try {
    const res = await fetch('/api/youtube-status');
    const status = await res.json();
    for (const [ch, info] of Object.entries(status)) {
      const btn = document.getElementById(`btn-yt-${ch}`);
      if (btn) {
        channelAuthState[ch] = info.authenticated;
        if (info.authenticated && info.name) {
          btn.innerHTML = `▶ ${info.name}`;
          btn.title = `Authenticated as: ${info.name}`;
          btn.style.background = btn.getAttribute('data-bg');
          btn.style.opacity = '1';
        } else {
          const label = ch.charAt(0).toUpperCase() + ch.slice(1);
          btn.innerHTML = `🔑 Auth ${label}`;
          btn.title = `Click to authenticate ${label} channel`;
          btn.style.background = 'rgba(255,255,255,0.1)';
          btn.style.opacity = '0.7';
        }
      }
    }
  } catch (e) {
    console.error('Failed to load YouTube channel names', e);
  }
}

// Add event listeners to the buttons dynamically
document.querySelectorAll('.yt-publish-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const channel = btn.getAttribute('data-channel');
    if (channelAuthState[channel]) {
      publishToYouTube(channel);
    } else {
      window.open(`/api/youtube-auth?channel=${channel}`, '_blank');
      
      const checkInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/youtube-status');
          const status = await res.json();
          if (status[channel] && status[channel].authenticated) {
            clearInterval(checkInterval);
            updateYouTubeChannelNames(); // Refresh UI
            
            const statusEl = document.getElementById('yt-publish-status');
            if (statusEl) {
              statusEl.style.display = 'block';
              statusEl.style.color = '#10b981';
              statusEl.innerText = `Successfully authenticated ${status[channel].name}! Click again to publish.`;
              setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
            }
          }
        } catch(e) {}
      }, 2000);
      
      setTimeout(() => clearInterval(checkInterval), 120000);
    }
  });
});


// --- Quota & Pipeline Dashboard ---
async function fetchQuota() {
  // Quota tracker UI removed — function kept as stub to avoid breaking any callers
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
      // Draw 1 frame instantly to ensure it is visually up to date
      if (typeof drawFrame === 'function') drawFrame();
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      thumbImage.src = dataUrl;
      thumbImage.onload = () => {
        thumbLoading.style.display = 'none';
        thumbImage.style.opacity = '1';
        // Show download button
        if (btnThumbDownload) {
          btnThumbDownload.href = dataUrl;
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
    e.preventDefault();
    // In tap mode, Space stamps the current line — do NOT toggle play
    if (S.tapMode) {
      handleTap();
      return;
    }
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
    if (audio) { audio.volume = Math.min(1, audio.volume + 0.1); flashIndicator(`Vol: ${Math.round(audio.volume * 100)}%`); }
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (audio) { audio.volume = Math.max(0, audio.volume - 0.1); flashIndicator(`Vol: ${Math.round(audio.volume * 100)}%`); }
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

// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 14. TO-DO & COMPETITORS
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const todoInput = document.getElementById('todo-input');
const todoChannel = document.getElementById('todo-channel');
const btnAddTodo = document.getElementById('btn-add-todo');
const todoListEl = document.getElementById('todo-list');

const competitorListEl = document.getElementById('competitor-list');
const btnRefreshCompetitors = document.getElementById('btn-refresh-competitors');

let todos = [];

async function loadTodos() {
  try {
    const res = await fetch('/api/todos');
    todos = await res.json();
    renderTodos();
  } catch (e) {
    console.error('Failed to load todos', e);
  }
}

async function saveTodos() {
  try {
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todos)
    });
  } catch (e) {
    console.error('Failed to save todos', e);
  }
}

function renderTodos() {
  if (!todoListEl) return;
  todoListEl.innerHTML = '';
  
  if (todos.length === 0) {
    todoListEl.innerHTML = '<div style="font-size:11px; color:var(--text-3); text-align:center; margin-top:8px;">No tasks. You are all caught up!</div>';
    return;
  }
  
  todos.forEach((todo, index) => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'space-between';
    el.style.background = 'rgba(255,255,255,0.03)';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '6px';
    el.style.fontSize = '12px';
    
    // Checkbox and Title
    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.gap = '8px';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = todo.completed;
    cb.style.cursor = 'pointer';
    cb.addEventListener('change', () => {
      todo.completed = cb.checked;
      saveTodos();
      renderTodos();
    });
    
    const label = document.createElement('span');
    label.textContent = todo.text;
    if (todo.completed) {
      label.style.textDecoration = 'line-through';
      label.style.opacity = '0.5';
    }
    
    leftWrap.appendChild(cb);
    leftWrap.appendChild(label);
    
    // Channel Badge and Delete
    const rightWrap = document.createElement('div');
    rightWrap.style.display = 'flex';
    rightWrap.style.alignItems = 'center';
    rightWrap.style.gap = '8px';
    
    const badge = document.createElement('span');
    badge.textContent = todo.channel;
    badge.style.fontSize = '10px';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '4px';
    badge.style.background = 'rgba(255,255,255,0.1)';
    badge.style.color = 'var(--text-2)';
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '&times;';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.color = '#ef4444';
    delBtn.style.cursor = 'pointer';
    delBtn.style.fontSize = '16px';
    delBtn.style.padding = '0 4px';
    
    delBtn.addEventListener('click', () => {
      todos.splice(index, 1);
      saveTodos();
      renderTodos();
    });
    
    if (todo.time) {
      const timeBadge = document.createElement('span');
      // Format 24h time to 12h AM/PM if needed, or just show as is.
      const [h, m] = todo.time.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const formattedTime = `${hour % 12 || 12}:${m} ${ampm}`;
      
      timeBadge.textContent = formattedTime;
      timeBadge.style.fontSize = '10px';
      timeBadge.style.padding = '2px 6px';
      timeBadge.style.borderRadius = '4px';
      timeBadge.style.background = 'rgba(16,185,129,0.15)'; // Greenish background for time
      timeBadge.style.color = 'var(--accent)'; // Highlighted color
      rightWrap.appendChild(timeBadge);
    }
    
    rightWrap.appendChild(badge);
    rightWrap.appendChild(delBtn);
    
    el.appendChild(leftWrap);
    el.appendChild(rightWrap);
    
    todoListEl.appendChild(el);
  });
}

const todoTime = document.getElementById('todo-time');

// Auto-fill time based on channel
if (todoChannel && todoTime) {
  todoChannel.addEventListener('change', () => {
    const defaultTimes = {
      'Pop': '10:00',
      'Hip-Hop': '13:00',
      'Hindi': '18:00',
      'DHH': '21:00',
      'K-Pop': '15:00'
    };
    const sel = todoChannel.value;
    if (defaultTimes[sel]) {
      todoTime.value = defaultTimes[sel];
    }
  });
  // Trigger it once on load
  todoChannel.dispatchEvent(new Event('change'));
}

if (btnAddTodo) {
  btnAddTodo.addEventListener('click', () => {
    const text = todoInput.value.trim();
    if (!text) return;
    const channel = todoChannel.value;
    const time = todoTime ? todoTime.value : '';
    todos.push({ text, channel, time, completed: false, id: Date.now() });
    todoInput.value = '';
    if (todoTime) todoTime.value = '';
    saveTodos();
    renderTodos();
  });
  
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnAddTodo.click();
  });
}

let allCompetitorData = [];

function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

function renderCompetitors(filter = 'All') {
  const competitorListEl = document.getElementById('competitor-list');
  if (!competitorListEl) return;
  
  const filtered = filter === 'All' ? allCompetitorData : allCompetitorData.filter(d => d.category === filter);
  
  if (filtered.length === 0) {
    competitorListEl.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-3); font-size:14px;">No recent uploads found for this category.</div>';
    return;
  }
  
  competitorListEl.innerHTML = '';
  
  filtered.forEach(item => {
    const el = document.createElement('a');
    el.href = item.link;
    el.target = '_blank';
    el.className = 'competitor-card';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '12px';
    el.style.padding = '12px 16px';
    el.style.textDecoration = 'none';
    el.style.background = 'var(--surface-2)';
    el.style.borderRadius = '8px';
    el.style.border = '1px solid var(--border)';
    el.style.transition = 'all 0.2s ease';
    el.style.color = 'var(--text)';
    
    el.addEventListener('mouseenter', () => {
      el.style.background = 'var(--surface-3)';
      el.style.borderColor = 'var(--accent)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'var(--surface-2)';
      el.style.borderColor = 'var(--border)';
    });
    
    const catColors = {
      'Pop': 'rgba(16, 185, 129, 0.15)',
      'Hip-Hop': 'rgba(239, 68, 68, 0.15)',
      'Hindi': 'rgba(245, 158, 11, 0.15)',
      'DHH': 'rgba(139, 92, 246, 0.15)',
      'K-Pop': 'rgba(236, 72, 153, 0.15)'
    };
    const catTextColors = {
      'Pop': '#10B981',
      'Hip-Hop': '#EF4444',
      'Hindi': '#F59E0B',
      'DHH': '#8B5CF6',
      'K-Pop': '#EC4899'
    };
    
    const bg = catColors[item.category] || 'rgba(255,255,255,0.1)';
    const textCol = catTextColors[item.category] || '#fff';

    el.innerHTML = `
      <span style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; padding:4px 8px; border-radius:4px; background:${bg}; color:${textCol}; flex-shrink:0; width: 70px; text-align:center;">${esc(item.category)}</span>
      <div style="font-size:13px; font-weight:500; color:var(--text); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${esc(item.title)}
      </div>
      <div style="font-size:12px; font-weight:600; color:var(--text-3); flex-shrink:0;">
        ${esc(item.channel)}
      </div>
      <button class="btn-add-radar" style="background:transparent; border:none; color:var(--text-3); cursor:pointer; padding:6px; margin-left:8px; border-radius:6px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; width:28px; height:28px;" aria-label="Add to To-Do" title="Add to To-Do">
        <svg class="icon-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    `;
    
    const btn = el.querySelector('.btn-add-radar');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      todos.push({ text: item.title, channel: item.category, link: item.link, completed: false, id: Date.now() });
      saveTodos();
      renderTodos();
      
      btn.innerHTML = '<svg class="icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      btn.style.background = 'rgba(16,185,129,0.1)';
      
      setTimeout(() => {
        btn.innerHTML = '<svg class="icon-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        btn.style.background = 'transparent';
      }, 2000);
    });
    
    btn.addEventListener('mouseenter', () => {
      btn.style.color = 'var(--text)';
      btn.style.background = 'rgba(255,255,255,0.05)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'var(--text-3)';
      btn.style.background = 'transparent';
    });
    
    competitorListEl.appendChild(el);
  });
}

async function fetchCompetitors() {
  const competitorListEl = document.getElementById('competitor-list');
  if (!competitorListEl) return;
  
  competitorListEl.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-3);">Loading latest uploads...</div>';
  
  try {
    const res = await fetch('/api/competitors');
    const data = await res.json();
    
    allCompetitorData = data.sort((a, b) => b.timestamp - a.timestamp);
    
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.btn-filter[data-filter="All"]');
    if(allBtn) allBtn.classList.add('active');
    
    renderCompetitors('All');
  } catch (err) {
    competitorListEl.innerHTML = '<div style="grid-column: 1/-1; color:#ff4444; text-align:center; padding: 40px;">Failed to load radar. Refresh to try again.</div>';
  }
}

// Add Modal Events
const btnOpenRadar = document.getElementById('btn-open-competitor-modal');
const btnOpenRadarTab = document.getElementById('btn-open-competitor-modal-tab');
const modalRadar = document.getElementById('competitor-modal');
const btnCloseRadar = document.getElementById('btn-close-competitor-modal');

function openRadarModal() {
  modalRadar.classList.remove('hidden');
  if (allCompetitorData.length === 0) {
    fetchCompetitors();
  }
}

if (btnOpenRadar && modalRadar) {
  btnOpenRadar.addEventListener('click', openRadarModal);
}
if (btnOpenRadarTab && modalRadar) {
  btnOpenRadarTab.addEventListener('click', openRadarModal);
}
if (btnCloseRadar && modalRadar) {
  btnCloseRadar.addEventListener('click', () => {
    modalRadar.classList.add('hidden');
  });
}

if (btnRefreshCompetitors) {
  btnRefreshCompetitors.addEventListener('click', fetchCompetitors);
}

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active', 'primary'));
    e.target.classList.add('active');
    e.target.style.background = 'var(--accent)';
    e.target.style.color = 'var(--bg-a)';
    e.target.style.border = '1px solid transparent';
    
    document.querySelectorAll('.btn-filter:not(.active)').forEach(b => {
      b.style.background = 'var(--surface-2)';
      b.style.color = 'var(--text-2)';
      b.style.border = '1px solid var(--border)';
    });

    renderCompetitors(e.target.getAttribute('data-filter'));
  });
});

window.addEventListener('load', () => {
  loadTodos();
});

