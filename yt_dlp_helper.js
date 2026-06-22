'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const BIN_DIR  = path.join(__dirname, 'bin');
const YTDLP    = path.join(BIN_DIR, 'yt-dlp.exe');
const TEMP_DIR = path.join(__dirname, 'temp');

[BIN_DIR, TEMP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

let hasUpdatedYtdlp = false;

// ── Ensure yt-dlp binary ─────────────────────────────────────────────────────
async function ensureYtdlp() {
  if (fs.existsSync(YTDLP)) {
    if (!hasUpdatedYtdlp) {
      console.log('[yt-dlp] Checking for updates in the background...');
      hasUpdatedYtdlp = true;
      spawn(YTDLP, ['-U']).on('close', code => {
        if (code === 0) console.log('[yt-dlp] Successfully updated to the latest anti-bot patch.');
        else console.log('[yt-dlp] Update check finished (already up to date or failed).');
      });
    }
    return;
  }
  console.log('[yt-dlp] Downloading binary from nightly branch...');
  const res = await axios({ method: 'get', responseType: 'stream', 
    url: 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe' });
  await new Promise((ok, fail) => {
    const w = fs.createWriteStream(YTDLP);
    res.data.pipe(w);
    w.on('finish', ok); w.on('error', fail);
  });
  console.log('[yt-dlp] Downloaded.');
}

// ── Spawn yt-dlp ─────────────────────────────────────────────────────────────
function spawnYtdlp(args) {
  return new Promise((resolve, reject) => {
    // Add a strict 15 second timeout to prevent hanging the server
    const p = spawn(YTDLP, args, { timeout: 15000 });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    
    p.on('close', code => {
      if (out.trim().length > 0) {
        resolve(out);
      } else if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(err || `Exit code ${code}`));
      }
    });
    p.on('error', (e) => reject(new Error(e.message || 'spawn error')));
  });
}

function spawnYtdlpSingle(args) {
  // Add PoToken and iOS player client args to bypass YouTube's heavy throttling (the 50kB/s bug) and 403 blocks
  const extras = [
    '--js-runtimes', 'node', 
    '--no-warnings', 
    '--no-playlist',
    '--concurrent-fragments', '4', // Speeds up segmented downloads
    '--extractor-args', 'youtube:player_client=ios,android,web' // Bypasses the 403 block by spoofing mobile API clients
  ];
  return spawnYtdlp([...extras, ...args]);
}

// ── YOUTUBE SEARCH ───────────────────────────────────────────────────────────
// We only need the video ID and URL from YouTube.
// Artwork comes from iTunes, NOT from the YouTube video thumbnail.
let _yt = null;
async function getYoutubeSR() {
  if (_yt) return _yt;
  try {
    const m = require('youtube-sr');
    _yt = m.default || m.YouTube || m;
    return _yt;
  } catch { return null; }
}

async function searchYoutube(query) {
  // 1. youtube-sr (pure Node.js, ~500ms, no subprocess)
  try {
    const yt = await getYoutubeSR();
    if (yt) {
      console.log('[YouTube] youtube-sr search...');
      const list = await Promise.race([
        yt.search(query, { limit: 5, type: 'video' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('youtube-sr timeout')), 5000))
      ]);
      
      if (list && list.length > 0) {
        return list.map(result => ({
          id:          result.id,
          title:       result.title  || query,
          uploader:    result.channel?.name || result.author?.name || '',
          duration:    result.duration ? Math.round(result.duration / 1000) : 0,
          webpage_url: `https://www.youtube.com/watch?v=${result.id}`,
        }));
      }
    }
  } catch (e) {
    console.warn('[YouTube] youtube-sr failed:', e.message);
  }

  // 2. Fallback: yt-dlp --flat-playlist --print (much faster than --dump-json)
  console.log('[YouTube] yt-dlp fallback...');
  await ensureYtdlp();
  try {
    const raw = await spawnYtdlpSingle([
      '--flat-playlist',
      '--print', '%(id)s|%(title)s|%(uploader)s|%(duration)s',
      '--ffmpeg-location', ffmpegInstaller.path,
      `ytsearch5:${query}`,
    ]);
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      return lines.map(line => {
        const [id, title, uploader, durStr] = line.split('|');
        return {
          id,
          title:       title    || query,
          uploader:    uploader || '',
          duration:    parseInt(durStr, 10) || 0,
          webpage_url: `https://www.youtube.com/watch?v=${id}`,
        };
      });
    }
  } catch (e) {
    console.error('[YouTube] yt-dlp search fallback failed:', e.message);
  }
  return [];
}

// ── ITUNES SEARCH — Square album artwork + accurate metadata ─────────────────
// Free, no API key, returns 3000×3000 square artwork URLs.
// This is the authoritative source for: trackName, artistName, albumName, duration.
async function searchItunes(query) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`;
    console.log(`[iTunes] Searching: "${query}"`);
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'NoisesMusic/2.0' }
    });

    if (!data.results?.length) {
      console.log('[iTunes] No results.');
      return [];
    }

    return data.results.map(r => {
      const artworkUrl = (r.artworkUrl100 || r.artworkUrl60 || '')
        .replace(/\d+x\d+bb\./, '3000x3000bb.');
      return {
        trackName:   r.trackName,
        artistName:  r.artistName,
        albumName:   r.collectionName || '',
        durationMs:  r.trackTimeMillis || 0,
        artworkUrl:  artworkUrl || null,
      };
    });
  } catch (e) {
    console.warn('[iTunes] Search failed:', e.message);
    return [];
  }
}

// ── DOWNLOAD SQUARE ARTWORK ──────────────────────────────────────────────────
// Downloads album artwork from iTunes CDN (square, proper aspect ratio).
async function downloadArtwork(artworkUrl, id) {
  if (!artworkUrl) return null;
  const dest = path.join(TEMP_DIR, `${id}_artwork.jpg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[Artwork] Artwork already downloaded (cached): ${dest}`);
    return dest;
  }
  try {
    const res = await axios({ 
      method: 'get', 
      url: artworkUrl, 
      responseType: 'stream', 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const w   = fs.createWriteStream(dest);
    res.data.pipe(w);
    await new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
      console.log(`[Artwork] Downloaded: ${dest}`);
      return dest;
    } else {
      console.warn(`[Artwork] File size too small, might be invalid: ${fs.statSync(dest).size} bytes`);
    }
  } catch (e) {
    console.warn('[Artwork] Download failed:', e.message);
  }
  return null;
}

// ── DOWNLOAD AUDIO ───────────────────────────────────────────────────────────
async function downloadAudio(id, url) {
  const audioPath = path.join(TEMP_DIR, `${id}.m4a`);
  if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
    console.log(`[Audio] Audio already downloaded (cached): ${audioPath}`);
    return audioPath;
  }
  await ensureYtdlp();
  const out = path.join(TEMP_DIR, `${id}.%(ext)s`);
  const baseArgs = [
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '-x', '--audio-format', 'm4a',
    '--ffmpeg-location', ffmpegInstaller.path,
    '-o', out,
    url,
  ];

  try {
    console.log(`[Audio] Downloading ${id} (Standard)`);
    await spawnYtdlpSingle(baseArgs);
  } catch (err) {
    console.warn(`[Audio] Standard download failed. Trying with Chrome cookies...`);
    try {
      await spawnYtdlpSingle(['--cookies-from-browser', 'chrome', ...baseArgs]);
    } catch (err2) {
      console.warn(`[Audio] Chrome cookie fallback failed. Trying with Edge cookies...`);
      try {
        await spawnYtdlpSingle(['--cookies-from-browser', 'edge', ...baseArgs]);
      } catch (err3) {
        console.error(`[Audio] All download attempts failed for ${id}`);
      }
    }
  }

  return fs.existsSync(audioPath) ? audioPath : null;
}

// ── GET DIRECT AUDIO URL (for instant streaming without download) ────────────
async function getDirectAudioUrl(url) {
  await ensureYtdlp();
  const baseArgs = [
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '-g',
    url
  ];

  try {
    const raw = await spawnYtdlpSingle(baseArgs);
    return raw.trim().split('\n')[0];
  } catch (e) {
    console.warn('[YouTube] getDirectAudioUrl failed, trying Chrome cookies...');
    try {
      const raw = await spawnYtdlpSingle(['--cookies-from-browser', 'chrome', ...baseArgs]);
      return raw.trim().split('\n')[0];
    } catch (e2) {
      console.warn('[YouTube] getDirectAudioUrl Chrome fallback failed, trying Edge cookies...');
      try {
        const raw = await spawnYtdlpSingle(['--cookies-from-browser', 'edge', ...baseArgs]);
        return raw.trim().split('\n')[0];
      } catch (e3) {
        console.error('[YouTube] getDirectAudioUrl all attempts failed:', e3.message);
        return null;
      }
    }
  }
}

// ── GET VIDEO INFO (for custom URLs) ─────────────────────────────────────────
async function getVideoInfo(url) {
  await ensureYtdlp();
  try {
    const raw = await spawnYtdlpSingle([
      '--flat-playlist',
      '--print', '%(id)s|%(title)s|%(uploader)s|%(duration)s',
      '--ffmpeg-location', ffmpegInstaller.path,
      url,
    ]);
    const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.includes('|'));
    if (lines.length === 0) return null;
    const [id, title, uploader, durStr] = lines[0].split('|');
    return {
      id: id || '',
      title: title || '',
      uploader: uploader || '',
      duration: parseInt(durStr, 10) || 0,
      webpage_url: url,
    };
  } catch (e) {
    console.error('[YouTube] getVideoInfo failed:', e.message);
    return null;
  }
}

// ── DEEZER SEARCH — Free fallback when iTunes finds nothing ──────────────────
// No API key, no auth. Works server-side with axios.
// Artwork: cover_xl = 1000×1000 (less than iTunes 3000×3000 but better than nothing).
// Duration: integer seconds (no /1000 conversion needed).
async function searchDeezer(query) {
  try {
    // Try strict artist+track search first, fall back to fuzzy
    const encoded = encodeURIComponent(query);
    const url = `https://api.deezer.com/search?q=${encoded}&limit=5&order=RANKING`;
    console.log(`[Deezer] Searching: "${query}"`);
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'NoisesMusic/2.0' }
    });

    // Check for Deezer error envelope (returns HTTP 200 even on errors)
    if (data.error || !data.data?.length) {
      console.log('[Deezer] No results or error.');
      return [];
    }

    return data.data.map(r => ({
      trackName:   r.title_short || r.title,
      artistName:  r.artist?.name || '',
      albumName:   r.album?.title || '',
      durationMs:  (r.duration || 0) * 1000,   // Deezer gives seconds, convert to ms for consistency
      artworkUrl:  r.album?.cover_xl || r.album?.cover_big || null,  // 1000×1000 or 500×500
      deezerRank:  r.rank || 0,
      previewUrl:  r.preview || null,           // 30s MP3 preview
    }));
  } catch (e) {
    console.warn('[Deezer] Search failed:', e.message);
    return [];
  }
}

// ── YOUTUBE AUTO-CAPTIONS — Last-resort lyrics for songs not in LRCLIB ───────
// Uses yt-dlp to download auto-generated subtitles, then parses them into
// the same {time, text} format as LRC lyrics.
// Returns null if no captions available.
async function fetchYouTubeCaptions(videoId) {
  await ensureYtdlp();
  const captionDir = path.join(require('os').tmpdir(), 'noises_captions');
  if (!fs.existsSync(captionDir)) fs.mkdirSync(captionDir, { recursive: true });

  const basePath = path.join(captionDir, videoId);
  // Clean up old caption files for this video first
  for (const f of fs.readdirSync(captionDir)) {
    if (f.startsWith(videoId)) {
      try { fs.unlinkSync(path.join(captionDir, f)); } catch (_) {}
    }
  }

  try {
    console.log(`[Captions] Fetching auto-captions for: ${videoId}`);
    await spawnYtdlpSingle([
      '--skip-download',
      '--write-auto-subs',
      '--sub-format', 'vtt',
      '--sub-langs', 'en.*,hi.*',
      '-o', basePath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    // Find the downloaded .vtt file
    const files = fs.readdirSync(captionDir).filter(f => f.startsWith(videoId) && f.endsWith('.vtt'));
    if (files.length === 0) {
      console.log('[Captions] No auto-captions available.');
      return null;
    }

    const vttContent = fs.readFileSync(path.join(captionDir, files[0]), 'utf8');
    const lyrics = parseVTT(vttContent);
    console.log(`[Captions] Parsed ${lyrics.length} caption lines from VTT.`);

    // Cleanup
    for (const f of files) {
      try { fs.unlinkSync(path.join(captionDir, f)); } catch (_) {}
    }

    return lyrics.length > 0 ? lyrics : null;
  } catch (e) {
    console.warn('[Captions] Failed to fetch auto-captions:', e.message);
    return null;
  }
}

// Parse WebVTT caption format into {time, text} objects (same format as LRC)
function parseVTT(vtt) {
  const lines = vtt.split(/\r?\n/);
  const result = [];
  const seen = new Set(); // deduplicate repeated lines (VTT often has overlapping segments)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match timecode lines: 00:00:16.310 --> 00:00:18.810
    const tc = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->/);
    if (!tc) continue;

    const time = parseInt(tc[1]) * 3600 + parseInt(tc[2]) * 60 + parseInt(tc[3]) + parseInt(tc[4]) / 1000;

    // Collect text lines after the timecode
    let text = '';
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '') {
      // Strip VTT tags like <c>, <00:00:16.560><c>, </c>, etc.
      const cleaned = lines[j].trim()
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (cleaned) text += (text ? ' ' : '') + cleaned;
      j++;
    }

    if (text && !seen.has(text)) {
      seen.add(text);
      result.push({ time: Math.round(time * 100) / 100, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

module.exports = {
  searchYoutube,
  searchItunes,
  searchDeezer,
  downloadArtwork,
  downloadAudio,
  getDirectAudioUrl,
  getVideoInfo,
  fetchYouTubeCaptions,
  ensureYtdlp,
};
