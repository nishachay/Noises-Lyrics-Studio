'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const isWin    = process.platform === 'win32';
const YTDLP_BIN = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_DIR   = path.join(__dirname, 'bin');
const YTDLP     = path.join(BIN_DIR, YTDLP_BIN);
const TEMP_DIR  = path.join(__dirname, 'temp');

[BIN_DIR, TEMP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

let hasUpdatedYtdlp = false;

// ── Ensure yt-dlp binary ─────────────────────────────────────────────────────
async function ensureYtdlp() {
  if (fs.existsSync(YTDLP)) {
    if (!isWin) {
      try { fs.chmodSync(YTDLP, 0o755); } catch (_) {}
    }
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
  console.log(`[yt-dlp] Downloading ${YTDLP_BIN} binary...`);
  const downloadUrl = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  const res = await axios({ method: 'get', responseType: 'stream', url: downloadUrl });
  await new Promise((ok, fail) => {
    const w = fs.createWriteStream(YTDLP, { mode: 0o755 });
    res.data.pipe(w);
    w.on('finish', ok); w.on('error', fail);
  });
  if (!isWin) {
    try { fs.chmodSync(YTDLP, 0o755); } catch (_) {}
  }
  console.log('[yt-dlp] Downloaded.');
}

// ── Spawn yt-dlp ─────────────────────────────────────────────────────────────
function spawnYtdlp(args) {
  return new Promise((resolve, reject) => {
    // Add a strict 120 second timeout to prevent hanging the server
    const p = spawn(YTDLP, args, { timeout: 120000 });
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
  // Use process.execPath (absolute path to node binary) so yt-dlp can find
  // Node.js for JS runtime even if PATH is stripped in the subprocess env.
  const extras = [
    '--js-runtimes', `node:${process.execPath}`,
    '--no-warnings', 
    '--no-playlist',
    ...getAuthArgs(),
    '--concurrent-fragments', '4' // Speeds up segmented downloads
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
  
  // Extract local file if artworkUrl is a relative or local server URL pointing to temp/
  const tempMatch = artworkUrl.match(/temp[/\\]([^?#]+)/);
  if (tempMatch) {
    const tempFile = path.join(TEMP_DIR, tempMatch[1]);
    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 100) {
      console.log(`[Artwork] Using local temp artwork: ${tempFile}`);
      return path.resolve(tempFile);
    }
  }

  // Check if artworkUrl is already an absolute file path on disk
  if (fs.existsSync(artworkUrl) && fs.statSync(artworkUrl).size > 100) {
    return path.resolve(artworkUrl);
  }

  // Hash artworkUrl to avoid stale cache when cover art URL changes
  const crypto = require('crypto');
  const urlHash = crypto.createHash('md5').update(artworkUrl).digest('hex').slice(0, 8);
  const dest = path.join(TEMP_DIR, `${id}_${urlHash}_artwork.jpg`);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[Artwork] Artwork already downloaded (cached): ${dest}`);
    return dest;
  }

  // Support base64 data URIs directly
  if (artworkUrl.startsWith('data:image/')) {
    try {
      const base64Data = artworkUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(dest, buffer);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
        return dest;
      }
    } catch (e) {
      console.warn('[Artwork] Base64 decode failed:', e.message);
    }
  }

  try {
    const res = await axios({ method: 'get', url: artworkUrl, responseType: 'stream', timeout: 10000 });
    const w   = fs.createWriteStream(dest);
    res.data.pipe(w);
    await new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`[Artwork] Downloaded: ${dest}`);
      return dest;
    }
  } catch (e) {
    console.warn('[Artwork] Download failed:', e.message);
  }
  return null;
}

// ── GET AUTH ARGS ──────────────────────────────────────────────────────────────
function getAuthArgs() {
  const cookiePath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiePath)) {
    console.log('[yt-dlp] Using local cookies.txt for authentication bypass');
    return ['--cookies', cookiePath];
  }
  return [];
}

// ── DOWNLOAD AUDIO ───────────────────────────────────────────────────────────
// Format cascade (in order):
//   1. DASH m4a  — best quality, but some HYBE/BTS tracks return HTTP 403 on DASH CDN
//   2. HLS m3u8  — always accessible, no 403, slightly lower quality ceiling
//   3. bestaudio/best — yt-dlp picks whatever it can download
async function downloadAudio(id, url) {
  const audioPath = path.join(TEMP_DIR, `${id}.m4a`);
  if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
    console.log(`[Audio] Audio already downloaded (cached): ${audioPath}`);
    return audioPath;
  }
  await ensureYtdlp();
  const outTemplate = path.join(TEMP_DIR, `${id}.%(ext)s`);
  const nodeBin = process.execPath;

  const commonArgs = [
    '--js-runtimes', `node:${nodeBin}`,
    '--no-warnings', '--no-playlist',
    '--concurrent-fragments', '4',
    ...getAuthArgs(),
    '--ffmpeg-location', ffmpegInstaller.path,
    '-o', outTemplate,
    url,
  ];

  // Try a format string. Return true if audio landed on disk.
  async function tryFormat(label, formatArgs) {
    try {
      console.log(`[Audio] ${label} for ${id}...`);
      await spawnYtdlp([...commonArgs, ...formatArgs]);
    } catch (e) {
      console.warn(`[Audio] ${label} failed: ${e.message.split('\n')[0].trim()}`);
    }
    if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) return true;
    // yt-dlp may have written a different extension — normalise to .m4a
    const alts = ['.webm', '.opus', '.mp3', '.ogg', '.m4a'];
    for (const ext of alts) {
      const p = path.join(TEMP_DIR, `${id}${ext}`);
      if (p !== audioPath && fs.existsSync(p) && fs.statSync(p).size > 1000) {
        fs.renameSync(p, audioPath);
        return true;
      }
    }
    return false;
  }

  // Tier 1: DASH m4a (fast, high quality — fails with 403 on some protected tracks)
  if (await tryFormat('DASH m4a', ['-f', 'bestaudio[ext=m4a][protocol^=http]/bestaudio[ext=m4a]', '-x', '--audio-format', 'm4a'])) return audioPath;

  // Tier 2: HLS m3u8 combined stream — YouTube never 403s these; works on ALL tracks
  // Formats 91-96 are HLS combined (video+audio); we extract audio via ffmpeg -x
  if (await tryFormat('HLS m3u8', ['-f', '91/92/93/94/95/96', '-x', '--audio-format', 'm4a'])) return audioPath;

  // Tier 3: Let yt-dlp pick anything downloadable
  if (await tryFormat('best available', ['-f', 'bestaudio/best', '-x', '--audio-format', 'm4a'])) return audioPath;

  console.error(`[Audio] All format strategies exhausted for ${id}.`);
  return null;
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
  const rawParsed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match timecode lines: 00:00:16.310 --> 00:00:18.810
    const tc = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->/);
    if (!tc) continue;

    const time = parseInt(tc[1], 10) * 3600 + parseInt(tc[2], 10) * 60 + parseInt(tc[3], 10) + parseInt(tc[4], 10) / 1000;

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

    if (text) {
      rawParsed.push({ time: Math.round(time * 100) / 100, text });
    }
  }

  // Sort chronologically
  rawParsed.sort((a, b) => a.time - b.time);

  // Helper to clean tags, speaker marks, and sound descriptors
  const cleanText = (str) => {
    return str
      .replace(/^>>\s*/g, '')
      .replace(/>>\s*/g, ' ')
      .replace(/\[[^\]]+\]/g, '')
      .replace(/\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const splitIntoSentences = (str) => {
    if (!str) return [];
    // Split on . ? ! followed by a space and capital letter or >>
    // Also split on >> if it appears in the middle
    const rawSegments = str.split(/(?<=[.!?])\s+(?=[A-Za-z>])|(?<=.)\s*>>/g);
    return rawSegments.map(s => s.trim()).filter(Boolean);
  };

  // Step 1: Split, clean, and filter empty/sound-only lines
  const cleaned = [];
  for (const item of rawParsed) {
    const segments = splitIntoSentences(item.text);
    segments.forEach((seg, idx) => {
      const txt = cleanText(seg);
      if (txt) {
        // Estimate small offset (+0.05s per split segment) to preserve order in next steps
        cleaned.push({ time: item.time + (idx * 0.05), text: txt });
      }
    });
  }

  // Step 2: Deduplicate scrolling build-ups (Prefix / Substring check)
  const noPrefixes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const current = cleaned[i];
    let isDupe = false;
    // Look ahead up to 8 lines or 6 seconds
    for (let j = i + 1; j < Math.min(cleaned.length, i + 10); j++) {
      const next = cleaned[j];
      if (next.time - current.time <= 6.0 && next.text.startsWith(current.text)) {
        isDupe = true;
        break;
      }
    }
    if (!isDupe) {
      noPrefixes.push(current);
    }
  }

  // Step 3: Deduplicate trailing residues (Suffix check)
  const noSuffixes = [];
  for (let i = 0; i < noPrefixes.length; i++) {
    const current = noPrefixes[i];
    let isDupe = false;
    // Look back up to 5 lines
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prev = noPrefixes[j];
      if (current.text.length < prev.text.length && prev.text.endsWith(current.text)) {
        isDupe = true;
        break;
      }
    }
    if (!isDupe) {
      noSuffixes.push(current);
    }
  }

  // Step 4: Overlap merging of split scroll sentences
  const findOverlap = (str1, str2) => {
    const minOverlap = 5;
    const maxLen = Math.min(str1.length, str2.length);
    for (let len = maxLen; len >= minOverlap; len--) {
      if (str1.endsWith(str2.slice(0, len))) {
        return len;
      }
    }
    return 0;
  };

  const merged = [];
  for (let i = 0; i < noSuffixes.length; i++) {
    const current = noSuffixes[i];
    if (merged.length === 0) {
      merged.push({ ...current });
      continue;
    }

    const last = merged[merged.length - 1];
    const overlapLen = findOverlap(last.text, current.text);
    
    if (overlapLen > 0 && current.time - last.time <= 8.0) {
      last.text = last.text + current.text.slice(overlapLen);
    } else {
      // If they don't overlap, but last ends with current or current is a duplicate, skip it
      if (last.text.includes(current.text) && current.time - last.time <= 5.0) {
        // skip
      } else {
        merged.push({ ...current });
      }
    }
  }

  // Final trim and format cleanup
  return merged.map(item => ({
    time: Math.round(item.time * 100) / 100,
    text: item.text.trim().replace(/\s+/g, ' ')
  })).filter(item => item.text.length > 0);
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
