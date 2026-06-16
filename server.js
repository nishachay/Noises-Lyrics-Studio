'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const axios   = require('axios');
const { GlobalFonts } = require('@napi-rs/canvas');

const { searchYoutube, searchItunes, searchDeezer, downloadArtwork, downloadAudio, getDirectAudioUrl, getVideoInfo, fetchYouTubeCaptions } = require('./yt_dlp_helper');
const { renderVideo, getAudioAmplitude, detectAudioStart } = require('./video_renderer');

// YTMusic integration
const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const ytmusic = new YTMusic();

let ytmusicInitialized = false;
async function ensureYTMusic() {
  if (ytmusicInitialized) return;
  try {
    await ytmusic.initialize();
    ytmusicInitialized = true;
    console.log('[YTMusic] Initialized successfully.');
  } catch (e) {
    console.error('[YTMusic] Initialization failed:', e.message);
  }
}

async function searchYTMusic(query) {
  await ensureYTMusic();
  if (!ytmusicInitialized) return [];
  try {
    const list = await ytmusic.searchSongs(query);
    return list.map(r => ({
      id:          r.videoId,
      title:       r.name,
      artist:      r.artist?.name || '',
      albumName:   r.album?.name || '',
      duration:    r.duration || 0,
      artworkUrl:  r.thumbnails?.pop()?.url || null
    }));
  } catch (e) {
    console.error('[YTMusic] search failed:', e.message);
    return [];
  }
}

const app  = express();
const PORT = process.env.PORT || 3000;

// In-memory caches to make searches and resolves instant
const searchCache = new Map();
const resolveCache = new Map();
const lyricsCache = new Map();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/temp', express.static(path.join(__dirname, 'temp')));


const OUTPUT_DIR = path.join(__dirname, 'output');
const TEMP_DIR   = path.join(__dirname, 'temp');
[OUTPUT_DIR, TEMP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ══════════════════════════════════════════════════════════════
// FONTS
// ══════════════════════════════════════════════════════════════
async function ensureFonts() {
  const fontDir = path.join(__dirname, 'bin', 'fonts');
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true });
  const fonts = [
    { name: 'Montserrat',       file: 'Montserrat-Bold.ttf',       url: 'https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf' },
    { name: 'Plus Jakarta Sans', file: 'PlusJakartaSans-Medium.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf' },
    { name: 'Noto Sans Devanagari', file: 'NotoSansDevanagari.ttf',  url: 'https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf' },
    { name: 'Noto Sans KR',     file: 'NotoSansKR.ttf',            url: 'https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf' }
  ];
  for (const f of fonts) {
    const fp = path.join(fontDir, f.file);
    if (!fs.existsSync(fp)) {
      try {
        const res = await axios({ method: 'get', url: f.url, responseType: 'stream' });
        const w   = fs.createWriteStream(fp);
        res.data.pipe(w);
        await new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
      } catch (e) { console.error(`Font download failed: ${f.name}`, e.message); }
    }
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp, f.name); } catch (_) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════
// LRC PARSER
// ══════════════════════════════════════════════════════════════
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

function spreadPlainLyrics(plain, duration) {
  if (!plain || !duration) return [];
  const lines = plain.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const step = (duration * 0.85) / lines.length;
  return lines.map((text, i) => ({ time: Math.round((i * step + 4) * 100) / 100, text }));
}

// ══════════════════════════════════════════════════════════════
// LRCLIB LYRICS FETCH
// Uses track_name + artist_name (from iTunes, which is authoritative).
// Picks the result whose duration is closest to the real song duration.
// Tries artist name variants to handle "YE" ↔ "Kanye West" etc.
// ══════════════════════════════════════════════════════════════
const LRCLIB    = 'https://lrclib.net/api';
const LRCLIB_UA = { 'User-Agent': 'NoisesMusic/2.0 (https://noises.music)' };

// Build artist name variants to maximise LRCLIB match rate
function artistVariants(artist) {
  const variants = new Set([artist]);
  const a = artist.toLowerCase();
  if (a === 'ye')                  variants.add('Kanye West');
  if (a.includes('kanye'))         variants.add('YE').add('Ye');
  if (a.includes('weeknd') && !a.includes('the')) variants.add('The Weeknd');
  if (a === 'the weeknd')          variants.add('Weeknd');
  if (a.includes('travis'))        variants.add('Travis Scott');
  if (a.includes('drake'))         variants.add('Drake');
  if (a.includes('21 savage'))     variants.add('21Savage');
  return [...variants];
}

// Clean track title (strip parenthetical noise like (feat. ...), (Official Video), [Remix], etc.)
function cleanTrackTitle(title) {
  let t = title.toLowerCase();
  
  // Split off common separators if they got into the track name
  const separators = [' | ', ' - ', ' : '];
  for (const sep of separators) {
    if (t.includes(sep)) {
      t = t.split(sep)[0];
    }
  }

  const noise = [
    /\(feat\..*?\)/g,
    /\(featuring.*?\)/g,
    /\(ft\..*?\)/g,
    /\[feat\..*?\]/g,
    /\[ft\..*?\]/g,
    /\(official.*?\)/g,
    /\[official.*?\]/g,
    /\(lyric.*?\)/g,
    /\[lyric.*?\]/g,
    /\(audio\)/g,
    /\[audio\]/g,
    /\(video\)/g,
    /\[video\]/g,
    /\(deluxe.*?\)/g,
    /\[deluxe.*?\]/g,
    /\(remastered.*?\)/g,
    /\[remastered.*?\]/g,
    /\(remix.*?\)/g,
    /\[remix.*?\]/g,
  ];
  for (const rx of noise) {
    t = t.replace(rx, '');
  }
  return t.trim().replace(/\s+/g, ' ');
}

// Clean artist name to extract the primary artist (splitting by &, feat, ft, with, x, comma)
function cleanArtistName(artist) {
  let a = artist.toLowerCase();
  const delimiters = [/\s*&\s*/, /\s*,\s*/, /\s+feat\.?\s+/, /\s+ft\.?\s+/, /\s+with\s+/, /\s*;\s*/, /\s*\|\s*/, /\s+x\s+/];
  for (const d of delimiters) {
    const parts = a.split(d);
    if (parts.length > 1) {
      a = parts[0];
      break;
    }
  }
  return a.trim();
}

async function fetchLyricsList(title, artist) {
  const cacheKey = `${title}|${artist}`.toLowerCase();
  if (lyricsCache.has(cacheKey)) {
    console.log(`[LRCLIB] [Cache Hit] "${title}" by "${artist}"`);
    return lyricsCache.get(cacheKey);
  }

  const cleanTitle = cleanTrackTitle(title);
  const cleanArtist = cleanArtistName(artist);

  const map = new Map();

  // Helper to fetch and merge records
  const fetchAndMerge = async (url, label) => {
    try {
      console.log(`[LRCLIB] ${label}: ${url}`);
      const { data } = await axios.get(url, { timeout: 5000, headers: LRCLIB_UA });
      if (Array.isArray(data)) {
        for (const record of data) {
          if (record.id) map.set(record.id, record);
        }
      } else if (data && data.id) {
        map.set(data.id, data);
      }
    } catch (e) {
      console.log(`[LRCLIB] ${label} failed: ${e.message}`);
    }
  };

  // 1 & 2. Try exact /get endpoint AND general /search?q= query concurrently to get ALL options
  await Promise.all([
    fetchAndMerge(`${LRCLIB}/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`, 'Exact Get'),
    fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(cleanArtist + ' ' + cleanTitle)}`, 'General Search')
  ]);

  // 3. Absolute fallback: Title only (if the artist is super obscure or parsed wrong)
  if (map.size === 0) {
    await fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(cleanTitle)}`, 'Title Only Search');
  }

  const list = Array.from(map.values());
  lyricsCache.set(cacheKey, list);
  return list;
}

// Score YouTube videos to find the cleanest, most official audio
function scoreYoutubeResult(y, targetTitle, targetArtist, targetDur) {
  let score = 0;
  if (targetDur) {
    score += Math.abs(y.duration - targetDur) * 2;
  }
  const channel = (y.uploader || '').toLowerCase();
  const title = (y.title || '').toLowerCase();
  if (channel.includes('topic')) {
    score -= 30; // Large bonus for official Topic upload
  }
  if (channel.includes('vevo') || title.includes('official audio') || title.includes('official stream')) {
    score -= 15;
  }
  const isTargetLive = targetTitle.toLowerCase().includes('live');
  const isTargetRemix = targetTitle.toLowerCase().includes('remix');
  if (title.includes('live') && !isTargetLive) score += 50;
  if (title.includes('cover')) score += 100;
  if (title.includes('remix') && !isTargetRemix) score += 40;
  return score;
}

// ══════════════════════════════════════════════════════════════
// TITLE / ARTIST CLEANER  (YouTube channel names → clean names)
// Only used when iTunes lookup fails.
// ══════════════════════════════════════════════════════════════
function cleanYoutubeMeta(rawTitle, rawChannel) {
  let artist = (rawChannel || '').replace(/\s*[-–]\s*Topic$/i, '').replace(/\s*VEVO$/i, '').replace(/\s*Official$/i, '').replace(/\s*Music$/i, '').trim();
  let title  = rawTitle || '';
  if (title.includes(' - ')) { 
    const [l, r] = title.split(' - '); 
    artist = l.trim(); 
    title = r.trim(); 
  } else if (title.includes(' | ')) {
    const parts = title.split(' | ');
    title = parts[0].trim();
    if (parts.length > 1 && (!artist || artist.toLowerCase() === 'krsna' || artist.toLowerCase() === 'kettle')) {
      artist = parts[1].trim();
    }
  }
  const NOISE = [/\[.*?\]/g, /\(official\s*(music\s*)?video\)/gi, /\(official\s*audio\)/gi, /\(lyric[s]?\s*video\)/gi, /\(visualizer\)/gi, /\(official\)/gi, /\bft\.?\b.*/gi, /\bfeat\.?\b.*/gi, /\bofficial\b/gi, /\baudio\b/gi, /\bvideo\b/gi];
  for (const rx of NOISE) title = title.replace(rx, '');
  return { title: title.trim().replace(/\s+/g, ' ') || rawTitle, artist: artist || rawChannel };
}

// ══════════════════════════════════════════════════════════════
// GET /api/trending
// Fetches the global Top 50 from iTunes public RSS
// ══════════════════════════════════════════════════════════════
app.get('/api/trending', async (req, res) => {
  try {
    const itunesRes = await axios.get('https://itunes.apple.com/us/rss/topsongs/limit=50/json', { timeout: 10000 });
    const tracks = itunesRes.data.feed.entry.map(e => {
      let artworkUrl = e['im:image'] && e['im:image'].length > 0 ? e['im:image'][e['im:image'].length - 1].label : '';
      if (artworkUrl) artworkUrl = artworkUrl.replace(/\d+x\d+bb\./, '3000x3000bb.');
      
      return {
        title: e['im:name'].label,
        artist: e['im:artist'].label,
        artworkUrl: artworkUrl
      };
    });
    res.json(tracks);
  } catch (err) {
    console.error('[Trending] Failed to fetch iTunes RSS:', err.message);
    res.status(500).json({ error: 'Failed to fetch trending songs' });
  }
});



// ══════════════════════════════════════════════════════════════
// GET /api/search-metadata
// YouTube is the ground truth anchor (it has the audio).
// iTunes enriches with artwork + clean metadata only when its
// duration matches the YouTube result (within 5s).
// LRCLIB is always searched with confirmed title/artist.
// ══════════════════════════════════════════════════════════════
app.get('/api/search-metadata', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });

  const cacheKey = `meta:${q.toLowerCase()}`;
  if (searchCache.has(cacheKey)) {
    return res.json(searchCache.get(cacheKey));
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Search Metadata] "${q}"`);

  try {
    const [itunesResult, ytmResult] = await Promise.all([
      searchItunes(q),
      searchYTMusic(q)
    ]);

    const results = [];
    const seen = new Set();
    
    // Prioritize iTunes as it has better high-res artwork and clean studio durations
    itunesResult.forEach(item => {
      const key = `${item.trackName}|${item.artistName}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          source: 'itunes',
          title: item.trackName,
          artist: item.artistName,
          album: item.albumName || '',
          duration: Math.round((item.durationMs || 0) / 1000),
          artworkUrl: item.artworkUrl || null
        });
      }
    });
    ytmResult.forEach(item => {
      const key = `${item.title}|${item.artist}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          source: 'ytmusic',
          title: item.title,
          artist: item.artist,
          album: item.albumName || '',
          duration: item.duration,
          artworkUrl: item.artworkUrl || null
        });
      }
    });

    // FALLBACK: If both failed or returned 0 results, use standard YouTube search
    if (results.length === 0) {
      console.log(`[Search Metadata] Falling back to standard YouTube search...`);
      const fallback = await searchYoutube(q).catch(() => []);
      fallback.forEach(item => {
        const meta = cleanYoutubeMeta(item.title, item.uploader || item.channel?.name);
        results.push({
          source: 'youtube',
          title: meta.title,
          artist: meta.artist,
          album: '',
          duration: item.duration,
          artworkUrl: item.thumbnail || (item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[0].url : null)
        });
      });
    }

    const payload = { results };
    searchCache.set(cacheKey, payload);
    res.json(payload);

  } catch (err) {
    console.error('[Search Metadata] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/resolve-song
// ══════════════════════════════════════════════════════════════
app.post('/api/resolve-song', async (req, res) => {
  const { title, artist, duration, album, artworkUrl } = req.body;
  if (!title || !artist || !duration) {
    return res.status(400).json({ error: 'Missing required metadata (title, artist, duration)' });
  }

  const query = `${title} ${artist}`;
  const cacheKey = `resolve:${query.toLowerCase()}`;
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Resolve Audio] Metadata: "${title}" by "${artist}" [${duration}s]`);

  try {
    // Step 1: Search YouTube for the audio
    const ytResult = await searchYoutube(query);
    
    let bestYt = null;
    let minDiff = Infinity;

    // Scan top 10 results to find the studio version that perfectly matches the iTunes duration
    const searchLimit = Math.min(10, ytResult.length);
    for (let i = 0; i < searchLimit; i++) {
      const y = ytResult[i];
      const diff = Math.abs(y.duration - duration);
      // Fuzziness: if it's within 3 seconds, it's virtually a perfect match.
      if (diff < minDiff) {
        minDiff = diff;
        bestYt = y;
      }
      if (diff <= 3) break; // Perfect studio match found, stop scanning!
    }

    // Fallback: If duration is wildly off (e.g., only a 7 minute music video exists), fallback to the absolute top result.
    if (!bestYt || minDiff > 15) {
      bestYt = ytResult[0];
      console.log(`[Resolve Audio] No exact duration match. Falling back to top result: diff=${minDiff}s`);
    } else {
      console.log(`[Resolve Audio] Found audio match with duration diff: ${minDiff}s`);
    }

    const bestMatch = {
      title,
      artist,
      albumName: album || '',
      duration,
      artworkUrl,
      youtubeThumbnail: bestYt?.id ? `https://i.ytimg.com/vi/${bestYt.id}/maxresdefault.jpg` : null,
      youtubeId: bestYt?.id || null,
      youtubeUrl: bestYt?.webpage_url || null,
      youtubeTitle: bestYt?.title || null,
    };

    // Step 2: Fetch LRCLIB lyrics using the guaranteed clean iTunes title and artist
    let lyricsRecords = await fetchLyricsList(title, artist);
    console.log(`[Resolve Lyrics] LRCLIB found ${lyricsRecords.length} record(s)`);

    if (lyricsRecords.length === 0 && bestYt?.id) {
      console.log('[Resolve Lyrics] LRCLIB empty — trying YouTube auto-captions...');
      try {
        const ytCaptions = await fetchYouTubeCaptions(bestYt.id);
        if (ytCaptions && ytCaptions.length > 0) {
          console.log(`[Resolve Lyrics] YouTube captions found: ${ytCaptions.length} lines ✓`);
          lyricsRecords = [{
            id: `yt_${bestYt.id}`,
            trackName: title,
            artistName: artist,
            albumName: album || '',
            duration,
            syncedLyrics: ytCaptions.map(l =>
              `[${String(Math.floor(l.time / 60)).padStart(2,'0')}:${(l.time % 60).toFixed(2).padStart(5,'0')}]${l.text}`
            ).join('\n'),
            plainLyrics: ytCaptions.map(l => l.text).join('\n'),
            source: 'youtube-captions',
          }];
        }
      } catch (e) {
        console.warn('[Resolve Lyrics] YT captions fallback failed:', e.message);
      }
    }

    const payload = { bestMatch, lyricsRecords };
    resolveCache.set(cacheKey, payload);
    res.json(payload);

  } catch (err) {
    console.error('[Resolve] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/lyrics
// ══════════════════════════════════════════════════════════════
app.get('/api/lyrics', async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'Missing title or artist' });
  try {
    const list = await fetchLyricsList(title, artist);
    res.json({ records: list });
  } catch (err) {
    console.error('[Lyrics API] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/lyrics-search
// ══════════════════════════════════════════════════════════════
app.get('/api/lyrics-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  try {
    const response = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'NoisesStudio/1.0 (https://github.com/surfbryce/beautiful-lyrics)' }
    });
    res.json(response.data);
  } catch (err) {
    console.error('[LyricsSearch] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/resolve
// Resolves YouTube audio matches and LRCLIB lyrics for a given track details in parallel.
// ══════════════════════════════════════════════════════════════
app.get('/api/resolve', async (req, res) => {
  const { title, artist, duration: durStr, url } = req.query;

  try {
    let targetTitle = title || '';
    let targetArtist = artist || '';
    let duration = parseInt(durStr, 10) || 0;

    const cacheKey = url ? url.toLowerCase() : `${targetTitle}|${targetArtist}|${duration}`.toLowerCase();
    if (resolveCache.has(cacheKey)) {
      console.log(`[Resolve] [Cache Hit] "${cacheKey}"`);
      return res.json(resolveCache.get(cacheKey));
    }

    let ytResult = [];
    let bestYt = null;

    if (url) {
      console.log(`[Resolve] Direct URL: "${url}"`);
      const info = await getVideoInfo(url);
      if (!info) {
        return res.status(400).json({ error: 'Failed to retrieve video metadata from URL' });
      }
      bestYt = info;
      ytResult = [info];
      duration = info.duration;
      const clean = cleanYoutubeMeta(info.title, info.uploader);
      targetTitle = clean.title;
      targetArtist = clean.artist;
    } else {
      if (!targetTitle || !targetArtist) {
        return res.status(400).json({ error: 'Missing title or artist' });
      }
      console.log(`[Resolve] "${targetTitle}" by "${targetArtist}" (dur: ${duration}s)`);
      
      const [ytmResult, ytSearchLogs] = await Promise.all([
        searchYTMusic(`${targetTitle} ${targetArtist}`),
        searchYoutube(`${targetTitle} ${targetArtist}`)
      ]);
      
      // Merge results, prioritizing standard YouTube search results (guarantees browser embeddability)
      ytResult = [];
      if (ytSearchLogs.length > 0) {
        ytSearchLogs.forEach(item => {
          ytResult.push(item);
        });
      }
      if (ytmResult.length > 0) {
        ytmResult.forEach(item => {
          if (!ytResult.some(y => y.id === item.id)) {
            ytResult.push({
              id:          item.id,
              title:       item.title,
              uploader:    item.artist,
              duration:    item.duration,
              webpage_url: `https://www.youtube.com/watch?v=${item.id}`,
            });
          }
        });
      }

      bestYt = ytResult[0] || null;
      if (ytResult.length > 0) {
        let bestScore = Infinity;
        for (const y of ytResult) {
          const score = scoreYoutubeResult(y, targetTitle, targetArtist, duration);
          if (score < bestScore) {
            bestScore = score;
            bestYt = y;
          }
        }
      }
    }

    const lyricsRecords = await fetchLyricsList(targetTitle, targetArtist);

    const payload = {
      youtubeVideos: ytResult,
      bestYoutubeId: bestYt?.id || null,
      lyricsRecords,
      detectedStart: 0,
      resolvedMeta: url ? { title: targetTitle, artist: targetArtist, duration } : null
    };
    resolveCache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Resolve] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/render  (SSE stream)
// ══════════════════════════════════════════════════════════════
app.get('/api/render', async (req, res) => {
  const { id, videoUrl, title, artist, duration: durStr, lyrics: lyricsParam, artworkUrl: rawArtworkUrl, offset: offsetStr, resolution, fps, alignment, youtubeDuration, itunesDuration, isSlideshow: isSlideshowStr, slideshowIndices: slideshowIndicesStr } = req.query;
  if (!id || !videoUrl) return res.status(400).end('Missing id or videoUrl');

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const songTitle   = decodeURIComponent(title  || '') || 'Unknown';
    const songArtist  = decodeURIComponent(artist || '') || 'Unknown';
    const duration    = parseFloat(durStr) || 0;
    const rawLyrics   = JSON.parse(decodeURIComponent(lyricsParam || '[]'));
    const artworkUrl  = rawArtworkUrl ? decodeURIComponent(rawArtworkUrl) : null;

    // Parse options
    const offset      = parseFloat(offsetStr || '0');
    const outRes      = resolution === '1080' ? '1080' : '720';
    const outFps      = parseInt(fps || '24', 10) || 24;
    const outAlign    = alignment === 'left' ? 'left' : 'center';
    
    const isSlideshow = isSlideshowStr === 'true';
    let slideshowIndices = [];
    try { if (slideshowIndicesStr) slideshowIndices = JSON.parse(decodeURIComponent(slideshowIndicesStr)); } catch(e) {}

    // 1. Download audio
    let audioPath = null;
    if (!isSlideshow) {
      send({ status: 'downloading', message: 'Downloading audio…', progress: 5 });
      audioPath = await downloadAudio(id, decodeURIComponent(videoUrl));
      if (!audioPath) { send({ error: 'Audio download failed' }); return res.end(); }
    }

    // 2. Download square artwork from iTunes CDN
    send({ status: 'downloading', message: 'Downloading album artwork…', progress: 14 });
    const artworkPath = await downloadArtwork(artworkUrl, id);
    if (artworkPath) {
      console.log('[Render] Artwork ready:', artworkPath);
    } else {
      console.log('[Render] No artwork — will use generated background.');
    }



    // 3. Render
    send({ status: 'rendering', message: 'Starting video render…', progress: 18 });

    const safeTitle = songTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeArtist = songArtist.replace(/[\\/:*?"<>|]/g, '_').trim();
    const isShort = req.query.isShort === 'true';
    const suffix = isSlideshow ? '_slideshow' : (isShort ? '_short' : '');
    const outputId   = `${safeArtist} - ${safeTitle}_${Date.now()}${suffix}`;
    const outputPath = path.join(OUTPUT_DIR, `${outputId}${isSlideshow ? '.zip' : '.mp4'}`);
    
    // Auto-generate free SEO Tags using YouTube's internal autocomplete API
    let seoKeywords = [];
    try {
      const q = encodeURIComponent(`${songArtist} ${songTitle}`);
      const { data } = await axios.get(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${q}`);
      if (data && data[1] && data[1].length > 0) {
        seoKeywords = data[1];
      }
    } catch (e) {
      console.log('[SEO] Could not fetch autocomplete tags:', e.message);
    }

    if (isSlideshow) {
      const selectedLyrics = slideshowIndices && slideshowIndices.length > 0 
        ? slideshowIndices.map(idx => rawLyrics[idx]).filter(Boolean)
        : rawLyrics;
        
      await require('./video_renderer').renderSlideshow({
        artworkPath,
        lyrics: selectedLyrics,
        outputPath,
        songTitle,
        songArtist,
        resolution: outRes,
        alignment: outAlign,
        progressCallback: pct => {
          const mapped = 18 + Math.round(pct * 0.79);
          send({ status: 'progress', progress: mapped, message: `Generating Slideshow ${pct}%` });
        },
      });
    } else {
      await renderVideo({
        audioPath,
        artworkPath,          // Square album art (or null → generated background)
      lyrics: rawLyrics,
      outputPath,
      duration,
      songTitle,
      songArtist,
      resolution: outRes,
      fps: outFps,
      alignment: outAlign,
      offset,
      isShort,
      shortStartTime: parseFloat(req.query.shortStartTime) || 0,
      seoKeywords,
      youtubeDuration: parseFloat(youtubeDuration) || duration,
      itunesDuration: parseFloat(itunesDuration) || duration,
      progressCallback: pct => {
        // Map renderer 0–100 → SSE 18–97  (never goes backwards or reaches 100 prematurely)
        const mapped = 18 + Math.round(pct * 0.79);
        send({ status: 'progress', progress: mapped, message: `Rendering ${pct}%` });
      },
    });
    }

    // 4. Cleanup
    try {
      // Keep files cached in the temp/ folder for subsequent preview and rendering.
      // if (fs.existsSync(audioPath))  fs.unlinkSync(audioPath);
      // if (artworkPath && fs.existsSync(artworkPath)) fs.unlinkSync(artworkPath);
    } catch (_) {}

    const hasTranslation     = rawLyrics.some(l => l.translation && l.translation.trim() !== '');
    const youtubeTitle       = `${songArtist} - ${songTitle} (Lyrics${hasTranslation ? ' & English Translation' : ''})`;
    const lyricLines         = rawLyrics.map(l => l.text).join('\n');
    

    
    const tags               = `#${songArtist.replace(/\s+/g,'')} #${songTitle.replace(/\s+/g,'')} #Lyrics #NoisesMusic`;
    const seoBlock           = seoKeywords.length > 0 ? `\n\nSearch terms:\n${seoKeywords.join(', ')}` : '';
    const disclaimer         = `\n\n────────────────────────────────────────────────────────────\n⚠️ COPYRIGHT DISCLAIMER:\nWe do not own the rights to this song. All credits go to the original artists and their respective record labels. This video is created for entertainment purposes only.\n────────────────────────────────────────────────────────────`;
    const youtubeDescription = `🎵 ${songArtist} - ${songTitle} (Lyrics Video)\n\n${decodeURIComponent(videoUrl)}\n\n${lyricLines}\n\n${tags}${seoBlock}${disclaimer}`;
    
    // Create a pure comma-separated tags string for the YouTube Tags box
    const fallbackTags = `${songArtist}, ${songTitle}, Lyrics, Pop, Music`;
    const youtubeTags = seoKeywords.length > 0 ? seoKeywords.join(', ') + `, ${fallbackTags}` : fallbackTags;

    send({ status: 'completed', progress: 100, fileId: `${outputId}${isSlideshow ? '.zip' : '.mp4'}`, thumbnailId: `${outputId}_thumbnail.jpg`, youtubeTitle, youtubeDescription, youtubeTags });
    res.end();

  } catch (err) {
    console.error('[Render] Error:', err.message);
    send({ error: err.message });
    res.end();
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/stream/:videoId
// Redirects to direct YouTube audio stream URL.
// ══════════════════════════════════════════════════════════════
const directUrlCache = new Map();

app.get('/api/stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const title = req.query.title;
  const artist = req.query.artist;
  if (!videoId) return res.status(400).send('Bad videoId');

  try {
    console.log(`[Stream] Ensuring local audio cache for: ${videoId}`);
    let audioPath = await downloadAudio(videoId, `https://www.youtube.com/watch?v=${videoId}`);
    
    if (!audioPath || !fs.existsSync(audioPath)) {
      console.log(`[Stream] Primary download failed for ${videoId}.`);
      
      if (title && artist) {
        console.log(`[Stream] Auto-fallback: Searching standard YouTube for "${title} ${artist}"...`);
        const results = await searchYoutube(`${title} ${artist} audio`);
        let fallbackSuccess = false;
        
        // Try top 2 alternative results
        for (let i = 0; i < Math.min(results.length, 2); i++) {
          const altId = results[i].id;
          if (altId === videoId) continue;
          
          console.log(`[Stream] Fallback trying: ${altId} (${results[i].title})`);
          audioPath = await downloadAudio(altId, `https://www.youtube.com/watch?v=${altId}`);
          
          if (audioPath && fs.existsSync(audioPath)) {
            console.log(`[Stream] Fallback SUCCESS with ${altId}!`);
            fallbackSuccess = true;
            break;
          }
        }
        
        if (!fallbackSuccess) {
          return res.status(500).send('Could not download audio stream and all fallbacks failed.');
        }
      } else {
        return res.status(500).send('Could not download audio stream');
      }
    }
    
    // Express res.sendFile automatically handles Range headers for scrubbing!
    res.sendFile(path.resolve(audioPath));
  } catch (err) {
    console.error('[Stream] Error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error: ' + err.message);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/proxy
// Proxies external images with CORS headers
// ══════════════════════════════════════════════════════════════
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });
    
    // We use POST with form data to bypass URL length limits for long songs
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t`;
    const response = await axios.post(url, 'q=' + encodeURIComponent(text), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    const data = response.data;
    let translatedText = '';
    if (data && data[0]) {
      data[0].forEach(part => {
        if (part[0]) translatedText += part[0];
      });
    }
    res.json({ translatedText });
  } catch (err) {
    console.error('[Translate] error:', err.message);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.get('/api/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('No URL');
  try {
    const response = await axios({ method: 'get', url, responseType: 'stream' });
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/download/:fileId
// ══════════════════════════════════════════════════════════════
app.get('/api/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fp = path.join(OUTPUT_DIR, fileId);
  if (!fs.existsSync(fp)) return res.status(404).send('Not found');

  // Strip the _timestamp and _thumbnail suffix for a beautiful download filename
  let downloadName = fileId;
  const rx = /_(?:\d+)(?:_thumbnail)?(\.[a-zA-Z0-9]+)$/;
  const match = fileId.match(rx);
  if (match) {
    const ext = match[1];
    downloadName = fileId.replace(rx, ext);
  }

  res.download(fp, downloadName);
});

// ══════════════════════════════════════════════════════════════
// Smart Garbage Collection (Runs every hour)
// Cleans up any leftover temp/output files older than 24 hours
// ══════════════════════════════════════════════════════════════
function cleanupOldFiles() {
  const dirs = [path.join(__dirname, 'temp'), path.join(__dirname, 'output')];
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const fp = path.join(dir, file);
        fs.stat(fp, (err, stats) => {
          if (err || !stats.isFile()) return;
          if (Date.now() - stats.mtimeMs > MAX_AGE) {
            fs.unlink(fp, () => console.log(`[Cleanup] Deleted old file: ${file}`));
          }
        });
      });
    });
  });
}
cleanupOldFiles();
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// ══════════════════════════════════════════════════════════════
// GET /api/preview/:fileId
// ══════════════════════════════════════════════════════════════
app.get('/api/preview/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fp = path.join(OUTPUT_DIR, fileId);
  if (!fs.existsSync(fp)) return res.status(404).send('Not found');
  res.sendFile(fp);
});

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
ensureFonts().then(() => {
  ensureYTMusic();
  app.listen(PORT, () => {
    console.log('═'.repeat(52));
    console.log(`  Noises Music — http://localhost:${PORT}`);
    console.log('═'.repeat(52));
  });
});
