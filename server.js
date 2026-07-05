'use strict';
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const axios   = require('axios');
const multer  = require('multer');
const { GlobalFonts } = require('@napi-rs/canvas');

const upload = multer({
  dest: path.join(__dirname, 'temp'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const { searchYoutube, searchItunes, searchDeezer, downloadArtwork, downloadAudio, getDirectAudioUrl, getVideoInfo, fetchYouTubeCaptions } = require('./yt_dlp_helper');
const { renderVideo, getAudioAmplitude, detectAudioStart } = require('./video_renderer');

// YTMusic integration
const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const ytmusic = new YTMusic();
const FormData = require('form-data');

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
    return list.map(r => {
      let artwork = r.thumbnails?.pop()?.url || null;
      // YT Music thumbnails usually look like: https://lh3.googleusercontent.com/...=w120-h120-l90-rj
      // We can force high-res by modifying the query parameter.
      if (artwork && artwork.includes('=')) {
        artwork = artwork.replace(/=[wsdh\-ljr0-9]+$/, '=w3000-h3000-l90-rj');
      }
      
      return {
        id:          r.videoId,
        title:       r.name,
        artist:      r.artist?.name || '',
        albumName:   r.album?.name || '',
        duration:    r.duration || 0,
        artworkUrl:  artwork
      };
    });
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

const ytAuth = require('./youtube_auth');

// ══════════════════════════════════════════════════════════════
// YOUTUBE OAUTH ENDPOINTS
// ══════════════════════════════════════════════════════════════

app.get('/api/youtube-auth', (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).send('Missing channel parameter');
  
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return res.status(500).send(`
      <div style="font-family:sans-serif; padding:40px; text-align:center; color:#333;">
        <h2 style="color:#ef4444;">YouTube API Keys Missing!</h2>
        <p>You need to provide your <b>YOUTUBE_CLIENT_ID</b> and <b>YOUTUBE_CLIENT_SECRET</b> in a <code>.env</code> file in the root folder before authenticating.</p>
        <p style="font-size:12px; color:#666;">Check the comments at the top of <i>youtube_auth.js</i> for instructions on how to get these keys from Google Cloud Console.</p>
      </div>
    `);
  }
  
  const url = ytAuth.getAuthUrl(channel);
  res.redirect(url);
});

app.get('/api/youtube-callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(`Auth failed: ${error}`);
  if (!code || !state) return res.send('Missing code or state');
  
  const success = await ytAuth.handleCallback(code, state);
  if (success) {
    res.send(`<h1>Successfully authenticated ${state} channel!</h1><p>You can close this window and return to Noises Studio.</p>`);
  } else {
    res.send('<h1>Failed to get refresh token.</h1>');
  }
});

app.get('/api/youtube-status', (req, res) => {
  const channels = ['pop', 'hiphop', 'hindi', 'dhh', 'kpop'];
  const status = {};
  channels.forEach(ch => {
    status[ch] = ytAuth.isChannelAuthenticated(ch);
  });
  res.json(status);
});

app.get('/api/quota', (req, res) => {
  res.json({ quota: ytAuth.getQuota() });
});

app.get('/api/daily-status', (req, res) => {
  res.json(ytAuth.getDailyStatus());
});

app.get('/api/schedule-preview', (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).send('Missing channel');
  res.json({ preview: ytAuth.getSchedulePreview(channel) });
});

app.post('/api/thumbnail-preview', async (req, res) => {
  try {
    const { title, artist, artworkUrl, theme, logoPath } = req.body;
    if (!title || !artworkUrl) return res.status(400).send('Missing fields');
    
    // We need to generate just the thumbnail buffer
    const videoRenderer = require('./video_renderer');
    const thumbBuffer = await videoRenderer.generateThumbnailBuffer({
      title,
      artist,
      artworkUrl,
      theme,
      logoPath: logoPath || path.join(__dirname, 'public', 'logo.png')
    });
    
    res.set('Content-Type', 'image/jpeg');
    res.send(thumbBuffer);
  } catch(e) {
    console.error('Thumbnail preview error:', e);
    res.status(500).send(e.message);
  }
});

// ----------------------------------------------------
// YT UPLOAD ENDPOINT
// ----------------------------------------------------
app.post('/api/youtube-upload', async (req, res) => {
  const { channel, videoPath, thumbnailPath, title, description, tags } = req.body;
  if (!channel || !videoPath || !title) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const editUrl = await ytAuth.uploadToYouTube({
      channelIdLabel: channel,
      videoPath: path.resolve(videoPath),
      thumbnailPath: thumbnailPath ? path.resolve(thumbnailPath) : null,
      title,
      description,
      tags
    });
    res.json({ success: true, editUrl });
  } catch (err) {
    console.error('YouTube Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// GITHUB ACTIONS STATUS
// ----------------------------------------------------

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
      const { data } = await axios.get(url, { timeout: 10000, headers: LRCLIB_UA });
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

  // Run all variations in parallel to maximize lyrics resolution success
  await Promise.all([
    fetchAndMerge(`${LRCLIB}/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`, 'Cleaned Get'),
    fetchAndMerge(`${LRCLIB}/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`, 'Raw Get'),
    fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(cleanArtist + ' ' + cleanTitle)}`, 'Cleaned Search'),
    fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(artist + ' ' + title)}`, 'Raw Search')
  ]);

  // Absolute fallback: Title only (if the artist is super obscure or parsed wrong)
  if (map.size === 0) {
    await Promise.all([
      fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(cleanTitle)}`, 'Cleaned Title Only Search'),
      fetchAndMerge(`${LRCLIB}/search?q=${encodeURIComponent(title)}`, 'Raw Title Only Search')
    ]);
  }

  const list = Array.from(map.values());
  lyricsCache.set(cacheKey, list);
  return list;
}

// Score YouTube videos to find the cleanest, most official audio
function scoreYoutubeResult(y, targetTitle, targetArtist, targetDur) {
  let score = 0;
  let durDiff = 0;
  if (targetDur) {
    durDiff = Math.abs(y.duration - targetDur);
    score += durDiff * 2;
  }
  const channel = (y.uploader || '').toLowerCase();
  const title = (y.title || '').toLowerCase();
  
  if (channel.includes('topic') || channel.includes('auto-generated')) {
    // HUGE bonus for official Topic audio, BUT ONLY if duration is a reasonable match
    if (!targetDur || durDiff <= 15) {
      score -= 1000; 
    } else {
      score -= 50; // minor bonus if duration is way off, to let accurate music videos win
    }
  }
  if (channel.includes('vevo') || title.includes('official audio') || title.includes('official stream')) {
    score -= 15;
  }
  const isTargetLive = (targetTitle || '').toLowerCase().includes('live');
  const isTargetRemix = (targetTitle || '').toLowerCase().includes('remix');
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
// Fetches authentic Spotify Playlists per category
// ══════════════════════════════════════════════════════════════
const trendingCache = {};

app.get('/api/trending', async (req, res) => {
  try {
    const category = req.query.category || 'pop';
    
    if (trendingCache[category] && (Date.now() - trendingCache[category].timestamp) < 3600000) {
      return res.json(trendingCache[category].data);
    }

    const { getTracks, getData } = require('spotify-url-info')(fetch);
    
    // Using stable Editorial Playlists that support embed scraping
    // New Music Friday & New Joints provide the absolute newest drops.
    const playlists = {
      pop: 'https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk',     // New Music Friday (Global Drops)
      hiphop: 'https://open.spotify.com/playlist/37i9dQZF1DWY4xHQp97fN6',  // New Joints (New Hip-Hop Drops)
      hindi: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM',   // Hot Hits Hindi (Stable)
      dhh: 'https://open.spotify.com/playlist/37i9dQZF1DX1ct2TQrAvRf',     // Rap 91 (Stable DHH Drops)
      kpop: 'https://open.spotify.com/playlist/37i9dQZF1DX9tPFwDMOaN1'     // K-Pop ON! (Stable K-Pop Drops)
    };
    
    const url = (playlists[category] || playlists['pop']) + '?_t=' + Date.now();

    // getData returns the playlist metadata including coverArt
    const data = await getData(url);
    const playlistArtwork = (data.coverArt && data.coverArt.sources && data.coverArt.sources.length > 0) 
                            ? data.coverArt.sources[0].url : null;
    
    const tracks = await getTracks(url);

    const songs = tracks.slice(0, 50).map(t => {
      // spotify-url-info getTracks returns { artist: 'Name', name: 'Title', duration: ... }
      return {
        title: t.name || t.title || 'Unknown Title',
        artist: t.artist || t.subtitle || 'Unknown Artist',
        artworkUrl: playlistArtwork, // Use playlist cover as fallback since tracks lack individual art
        duration: t.duration ? Math.round(t.duration / 1000) : (t.duration_ms ? Math.round(t.duration_ms / 1000) : 0)
      };
    });

    // Cache for only 5 minutes to ensure freshness
    trendingCache[category] = {
      timestamp: Date.now(),
      data: songs
    };

    res.json(songs);
  } catch (err) {
    console.error('[Trending] Failed to fetch Spotify Playlists:', err.message);
    res.status(500).json({ error: 'Failed to fetch trending songs' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/itunes-trending
// Fetches live iTunes Top Songs via Apple RSS feed
// ══════════════════════════════════════════════════════════════
let itunesCache = { timestamp: 0, data: null };

app.get('/api/itunes-trending', async (req, res) => {
  try {
    if (itunesCache.data && (Date.now() - itunesCache.timestamp) < 300000) { // 5 minutes cache
      return res.json(itunesCache.data);
    }
    
    const url = `https://itunes.apple.com/us/rss/topsongs/limit=50/json?_t=${Date.now()}`;
    const response = await fetch(url);
    const data = await response.json();
    
    const entries = data.feed.entry || [];
    const songs = entries.map(entry => {
      let artworkUrl = '';
      if (entry['im:image'] && entry['im:image'].length > 0) {
        artworkUrl = entry['im:image'][entry['im:image'].length - 1].label;
      }
      return {
        title: entry['im:name'].label || 'Unknown Title',
        artist: entry['im:artist'].label || 'Unknown Artist',
        artworkUrl: artworkUrl,
        duration: 0
      };
    });
    
    itunesCache = {
      timestamp: Date.now(),
      data: songs
    };
    res.json(songs);
  } catch (err) {
    console.error('[iTunes Trending] Failed to fetch iTunes RSS:', err.message);
    res.status(500).json({ error: 'Failed to fetch iTunes trending' });
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

  // Direct YouTube Link Resolving
  if (q.includes('youtube.com/') || q.includes('youtu.be/')) {
    console.log(`[Search Metadata] Detected YouTube URL: "${q}"`);
    try {
      const info = await getVideoInfo(q);
      if (info) {
        const meta = cleanYoutubeMeta(info.title, info.uploader);
        const results = [{
          source: 'youtube',
          title: meta.title,
          artist: meta.artist,
          album: '',
          duration: info.duration,
          artworkUrl: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
          youtubeId: info.id
        }];
        const payload = { results };
        searchCache.set(cacheKey, payload);
        return res.json(payload);
      }
    } catch (err) {
      console.error('[Search Metadata] YouTube URL resolve failed:', err.message);
    }
  }

  // Direct Spotify Track Link Resolving
  if (q.includes('spotify.com/track/')) {
    console.log(`[Search Metadata] Detected Spotify Track URL: "${q}"`);
    try {
      const { getData } = require('spotify-url-info')(fetch);
      const data = await getData(q);
      if (data) {
        const title = data.name;
        const artist = data.artists?.[0]?.name || '';
        const album = data.album?.name || '';
        const duration = Math.round((data.duration_ms || 0) / 1000);
        const artworkUrl = data.album?.images?.[0]?.url || null;
        
        const results = [{
          source: 'spotify',
          title,
          artist,
          album,
          duration,
          artworkUrl
        }];
        const payload = { results };
        searchCache.set(cacheKey, payload);
        return res.json(payload);
      }
    } catch (err) {
      console.error('[Search Metadata] Spotify URL resolve failed:', err.message);
    }
  }

  try {
    const [itunesResult, ytmResult] = await Promise.all([
      searchItunes(q),
      searchYTMusic(q)
    ]);

    const results = [];
    const seen = new Set();
    
    // Normalize key helper to filter duplicate search results
    const getCleanKey = (title, artist) => {
      const cleanT = cleanTrackTitle(title);
      const cleanA = cleanArtistName(artist);
      return `${cleanT}|${cleanA}`;
    };
    
    // Prioritize iTunes as it has better high-res artwork and clean studio durations
    itunesResult.forEach(item => {
      const key = getCleanKey(item.trackName, item.artistName);
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
      const key = getCleanKey(item.title, item.artist);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          source: 'ytmusic',
          title: item.title,
          artist: item.artist,
          album: item.albumName || '',
          duration: item.duration,
          artworkUrl: item.artworkUrl || (item.id ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : null)
        });
      }
    });

    // FALLBACK: If both failed or returned 0 results, use standard YouTube search
    if (results.length === 0) {
      console.log(`[Search Metadata] Falling back to standard YouTube search...`);
      const fallback = await searchYoutube(q).catch(() => []);
      fallback.forEach(item => {
        const meta = cleanYoutubeMeta(item.title, item.uploader || item.channel?.name);
        const key = getCleanKey(meta.title, meta.artist);
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            source: 'youtube',
            title: meta.title,
            artist: meta.artist,
            album: '',
            duration: item.duration,
            artworkUrl: item.id ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : null
          });
        }
      });
    }

    // Smart Sorting: Boost results that match the search query words exactly
    const lowerQ = q.toLowerCase().replace(/ by /g, ' ').replace(/[^a-z0-9\s]/g, '').trim();
    const queryWords = lowerQ.split(/\s+/).filter(w => w.length > 0);
    
    results.forEach(r => {
      r.score = 0;
      const titleLower = r.title.toLowerCase();
      const artistLower = r.artist.toLowerCase();
      const targetStr1 = `${titleLower} ${artistLower}`;
      const targetStr2 = `${artistLower} ${titleLower}`;
      
      // 1. Exact match for full title or full title+artist
      if (titleLower === lowerQ) {
        r.score += 200;
      } else if (targetStr1 === lowerQ || targetStr2 === lowerQ) {
        r.score += 250;
      } else if (targetStr1.includes(lowerQ) || targetStr2.includes(lowerQ)) {
        r.score += 150;
      }
      
      // 2. Query words containment: if all words in the query match the result
      const allWordsMatch = queryWords.every(w => targetStr1.includes(w));
      if (allWordsMatch) {
        r.score += 100;
      }
      
      // 3. Individual word matches
      queryWords.forEach(w => {
        if (targetStr1.includes(w)) r.score += 10;
        if (titleLower.includes(w)) r.score += 5; // Boost if word is in title
      });
      
      // 4. Source prioritization
      if (r.source === 'itunes') {
        r.score += 15;
      }
      
      // 5. Penalize unwanted versions unless the user explicitly searched for them
      const badWords = ['karaoke', 'cover', 'instrumental', 'tribute', 'slowed', 'reverb', 'type beat', 'remix'];
      badWords.forEach(w => {
        if (targetStr1.includes(w) && !lowerQ.includes(w)) {
          r.score -= 80;
        }
      });
    });
    
    // Sort highest score first
    results.sort((a, b) => b.score - a.score);

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
  const { title, artist, duration, album, artworkUrl, youtubeId } = req.body;
  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing required metadata (title, artist)' });
  }

  const query = `${title} ${artist}`;
  const cacheKey = `resolve:${query.toLowerCase()}${youtubeId ? `:${youtubeId}` : ''}`;
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Resolve Audio] Metadata: "${title}" by "${artist}" [${duration}s]`);

  try {
    let bestYt = null;
    let minDiff = Infinity;

    if (youtubeId) {
      console.log(`[Resolve Audio] Using provided YouTube ID: ${youtubeId}`);
      bestYt = {
        id: youtubeId,
        title: title,
        duration: duration,
        webpage_url: `https://www.youtube.com/watch?v=${youtubeId}`
      };
    } else {
      // Step 1: Search YTMusic (Guarantees clean, official 'Topic' audio without music video intros)
      let ytResult = [];
      try {
        const ytm = await searchYTMusic(query);
        if (ytm && ytm.length > 0) {
          ytResult = ytm.map(item => ({
            id: item.id,
            title: item.title,
            uploader: item.artist + ' - Topic',
            duration: item.duration,
            webpage_url: `https://www.youtube.com/watch?v=${item.id}`
          }));
        }
      } catch (e) {
        console.error('[Resolve Audio] searchYTMusic failed:', e.message);
      }

      // Fallback: If YTMusic fails or returns nothing, search standard YouTube
      if (!ytResult || ytResult.length === 0) {
        console.log('[Resolve Audio] YTMusic returned no results. Trying standard YouTube fallback...');
        try {
          ytResult = await searchYoutube(query);
        } catch (e) {
          console.error('[Resolve Audio] standard YouTube search failed:', e.message);
        }
      }
      
      if (ytResult && ytResult.length > 0) {
        let bestScore = Infinity;
        for (const y of ytResult) {
          const score = scoreYoutubeResult(y, title, artist, duration);
          if (score < bestScore) {
            bestScore = score;
            bestYt = y;
            minDiff = Math.abs(y.duration - duration);
          }
        }

        // Fallback: If duration is wildly off (e.g., only a 7 minute music video exists), fallback to the absolute top result.
        if (!bestYt || minDiff > 15) {
          bestYt = ytResult[0];
          console.log(`[Resolve Audio] No exact duration match. Falling back to top result: diff=${minDiff}s`);
        } else {
          console.log(`[Resolve Audio] Found audio match with duration diff: ${minDiff}s`);
        }
      }
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
      youtubeDuration: bestYt?.duration || duration
    };

    // Step 2: Fetch LRCLIB lyrics using the guaranteed clean iTunes title and artist
    let lyricsRecords = [];
    try {
      lyricsRecords = await fetchLyricsList(title, artist);
    } catch (e) {
      console.error('[Resolve Lyrics] fetchLyricsList failed:', e.message);
    }
    console.log(`[Resolve Lyrics] LRCLIB found ${lyricsRecords.length} record(s)`);

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
// GET /api/captions?videoId=xxx&title=xxx&artist=xxx
// 1. Try the matched video first
// 2. If no captions, search YouTube for "[title] [artist] lyrics"
//    and try the top 3 results until one has captions
// ══════════════════════════════════════════════════════════════
app.get('/api/captions', async (req, res) => {
  const { videoId, title, artist } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    // ── Step 1: Try the primary matched video ──────────────────
    console.log(`[Captions] Trying primary video: ${videoId}`);
    let lyrics = await fetchYouTubeCaptions(videoId);
    if (lyrics && lyrics.length > 0) {
      return res.json({ lyrics, source: 'primary', sourceId: videoId });
    }
    console.log(`[Captions] Primary video has no captions.`);

    // ── Step 2: If title+artist provided, search for a lyrics video ──
    if (!title || !artist) {
      return res.status(404).json({
        error: 'No captions on this video. Provide title & artist so we can search for a lyrics video.'
      });
    }

    const query = `${title} ${artist} lyrics`;
    console.log(`[Captions] Searching YouTube for: "${query}"`);
    const results = await searchYoutube(query);

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'No captions found and no lyrics videos found on YouTube.' });
    }

    // Try up to top 3 results, skip the original video
    const candidates = results.filter(r => r.id !== videoId).slice(0, 3);
    for (const video of candidates) {
      console.log(`[Captions] Trying lyrics video: ${video.id} — "${video.title}"`);
      lyrics = await fetchYouTubeCaptions(video.id);
      if (lyrics && lyrics.length > 0) {
        return res.json({ lyrics, source: 'lyrics_search', sourceId: video.id, sourceTitle: video.title });
      }
    }

    return res.status(404).json({
      error: 'No captions found on the matched video or any lyrics video. Try pasting lyrics manually.'
    });

  } catch (err) {
    console.error('[Captions API] Error:', err.message);
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
      
      // Merge results, prioritizing YTMusic (clean audio, no music video intros)
      ytResult = [];
      if (ytmResult.length > 0) {
        ytmResult.forEach(item => {
          ytResult.push({
            id:          item.id,
            title:       item.title,
            uploader:    item.artist + ' - Topic', // Spoof 'Topic' to heavily weight YTMusic results
            duration:    item.duration,
            webpage_url: `https://www.youtube.com/watch?v=${item.id}`,
          });
        });
      }
      if (ytSearchLogs.length > 0) {
        ytSearchLogs.forEach(item => {
          if (!ytResult.some(y => y.id === item.id)) {
            ytResult.push(item);
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
  const { id, videoUrl, title, artist, duration: durStr, lyrics: lyricsParam, artworkUrl: rawArtworkUrl, offset: offsetStr, resolution, fps, alignment, youtubeDuration, itunesDuration, isSlideshow: isSlideshowStr, slideshowIndices: slideshowIndicesStr, customAudioPath, linesPerScreen } = req.query;
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
      if (customAudioPath && customAudioPath.includes('temp') && fs.existsSync(path.resolve(customAudioPath))) {
        console.log('[Render] Using manually uploaded custom audio:', customAudioPath);
        audioPath = path.resolve(customAudioPath);
      } else {
        send({ status: 'downloading', message: 'Downloading audio…', progress: 5 });
        audioPath = await downloadAudio(id, decodeURIComponent(videoUrl));
        if (!audioPath) { send({ error: 'Audio download failed' }); return res.end(); }
      }
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
      linesPerScreen: parseInt(linesPerScreen || '1', 10) || 1,
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
    
    const networkBlock       = `\n\n🌐 Follow Our Network:\n- Noises Music: https://www.youtube.com/@NoisesMusic\n- Noises HipHop: https://www.youtube.com/@NoisesHipHop\n- Noises DHH: https://www.youtube.com/@NoisesDHH\n- Noises Kpop: https://www.youtube.com/@NoisesKpop\n- Noises Geet: https://www.youtube.com/@NoisesGeet`;
    
    const youtubeDescription = `🎵 ${songArtist} - ${songTitle} (Lyrics Video)\n\n${decodeURIComponent(videoUrl)}\n\n${lyricLines}\n\n${tags}${seoBlock}${networkBlock}${disclaimer}`;
    
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

// proxyAudioStream removed in favor of native browser redirect

// ══════════════════════════════════════════════════════════════
// GET /api/stream/:videoId
// Serves the completely downloaded audio file statically to the browser
// ══════════════════════════════════════════════════════════════
const directUrlCache = new Map();

app.get('/api/stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!videoId) return res.status(400).send('Bad videoId');

  try {
    const cachedPath = directUrlCache.get(videoId);
    const fs = require('fs');
    if (cachedPath && fs.existsSync(cachedPath)) {
      console.log(`[Stream] Serving natively downloaded file from cache: ${cachedPath}`);
      return res.sendFile(cachedPath);
    }
    
    // If it missed the prepare-stream cache, download it on the fly
    const directPath = await downloadAudio(videoId, `https://www.youtube.com/watch?v=${videoId}`);
    if (directPath && fs.existsSync(directPath)) {
      console.log(`[Stream] Serving natively downloaded file on-the-fly: ${directPath}`);
      return res.sendFile(directPath);
    }
    
    return res.status(500).send('Audio file could not be downloaded to disk.');
  } catch (err) {
    console.error('[Stream] Error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error: ' + err.message);
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/prepare-stream/:videoId
// Downloads the full audio file to disk instantly via yt-dlp
// ══════════════════════════════════════════════════════════════
app.get('/api/prepare-stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const title = req.query.title;
  const artist = req.query.artist;
  if (!videoId) return res.status(400).json({ success: false, error: 'Bad videoId' });

  try {
    const fs = require('fs');
    if (directUrlCache.has(videoId) && fs.existsSync(directUrlCache.get(videoId))) {
      return res.json({ success: true, cached: true });
    }

    console.log(`[Prepare Stream] Triggering native disk download for: ${videoId}`);
    let audioPath = await downloadAudio(videoId, `https://www.youtube.com/watch?v=${videoId}`);
    
    if (!audioPath || !fs.existsSync(audioPath)) {
      console.log(`[Prepare Stream] Primary download failed for ${videoId}.`);
      if (title && artist) {
        console.log(`[Prepare Stream] Auto-fallback: Searching standard YouTube for "${title} ${artist}"...`);
        const results = await searchYoutube(`${title} ${artist} audio`);
        for (let i = 0; i < Math.min(results.length, 2); i++) {
          const altId = results[i].id;
          if (altId === videoId) continue;
          console.log(`[Prepare Stream] Fallback trying: ${altId} (${results[i].title})`);
          const altPath = await downloadAudio(altId, `https://www.youtube.com/watch?v=${altId}`);
          if (altPath && fs.existsSync(altPath)) {
            console.log(`[Prepare Stream] Fallback SUCCESS with ${altId}!`);
            directUrlCache.set(videoId, altPath); 
            setTimeout(() => directUrlCache.delete(videoId), 4 * 60 * 60 * 1000);
            return res.json({ success: true, fallback: true });
          }
        }
        return res.status(500).json({ success: false, error: 'All fallback downloads failed' });
      } else {
        return res.status(500).json({ success: false, error: 'Download failed' });
      }
    }
    
    directUrlCache.set(videoId, audioPath);
    setTimeout(() => directUrlCache.delete(videoId), 4 * 60 * 60 * 1000);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Prepare Stream] Error:', err.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/proxy
// Proxies external images with CORS headers
// ══════════════════════════════════════════════════════════════
app.get('/api/proxy', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send('No URL provided');
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=31536000');
    
    response.data.pipe(res);
  } catch (err) {
    console.error('[Proxy] Error fetching image:', err.message);
    res.status(500).send('Error proxying image');
  }
});
// ══════════════════════════════════════════════════════════════
// POST /api/upload-audio
// Manually upload a local audio file to bypass YouTube blocks
// ══════════════════════════════════════════════════════════════
app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    const ext = path.extname(req.file.originalname) || '.mp3';
    const newPath = path.join(__dirname, 'temp', req.file.filename + ext);
    fs.renameSync(req.file.path, newPath);
    res.json({ path: newPath, originalName: req.file.originalname });
  } catch (err) {
    console.error('[Upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/translate
// Proxies Google Translate to avoid CORS
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
// GET /api/fetch-raw-lyrics
// ══════════════════════════════════════════════════════════════
app.get('/api/fetch-raw-lyrics', async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'Missing title or artist' });

  try {
    // 1. Try LRCLIB first for incredibly clean plain lyrics
    console.log(`[Raw Lyrics] Checking LRCLIB for: ${title} - ${artist}`);
    const lrclibRecords = await fetchLyricsList(title, artist);
    // Find the first record that actually has plainLyrics
    const lrcMatch = lrclibRecords.find(r => r.plainLyrics && r.plainLyrics.length > 10);
    
    if (lrcMatch) {
      console.log(`[Raw Lyrics] Found clean lyrics on LRCLIB`);
      return res.json({ source: 'LRCLIB', url: 'https://lrclib.net', lyrics: lrcMatch.plainLyrics });
    }

    // 2. Fallback to Genius
    const cheerio = require('cheerio');
    const query = `${title} ${artist}`;
    
    console.log(`[Genius] Searching for: ${query}`);
    const searchUrl = `https://genius.com/api/search/song?q=${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, { timeout: 10000 });
    
    const hits = searchRes.data?.response?.sections?.[0]?.hits;
    if (!hits || hits.length === 0) {
      return res.status(404).json({ error: 'No lyrics found on Genius' });
    }
    
    const songUrl = hits[0].result.url;
    console.log(`[Genius] Scraping URL: ${songUrl}`);
    
    const htmlRes = await axios.get(songUrl, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const $ = cheerio.load(htmlRes.data);
    let lyricsHtml = $('[data-lyrics-container="true"]').map((i, el) => $(el).html()).get().join('<br/>');
    
    if (!lyricsHtml) {
      return res.status(404).json({ error: 'Could not parse lyrics from Genius' });
    }
    
    // Convert HTML to plain text
    // Replace <br> tags with newlines
    let plainLyrics = lyricsHtml.replace(/<br\s*[\/]?>/gi, '\n');
    // Remove other HTML tags (like <a> tags wrapping annotations)
    plainLyrics = plainLyrics.replace(/<[^>]+>/g, '');
    // Clean up HTML entities
    plainLyrics = plainLyrics
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
      
    // Strip [Chorus], [Verse 1], etc.
    plainLyrics = plainLyrics.replace(/^\[.*?\]$/gm, '');

    // Genius sometimes includes metadata at the very beginning
    const lines = plainLyrics.split('\n');
    let startIndex = 0;
    // Look through the first 10 lines for garbage metadata
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (lines[i].includes('ContributorsTranslations') || lines[i].includes('Read More') || lines[i].includes('Lyrics')) {
        startIndex = i + 1; // skip this line
        while(startIndex < lines.length && lines[startIndex].trim() === '') {
          startIndex++; // skip empty lines after metadata
        }
      }
    }
    plainLyrics = lines.slice(startIndex).join('\n');

    // Remove extra blank lines
    plainLyrics = plainLyrics.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    res.json({ source: 'Genius', url: songUrl, lyrics: plainLyrics });
  } catch (err) {
    console.error('[Genius] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch raw lyrics' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET & POST /api/todos
// ══════════════════════════════════════════════════════════════
app.get('/api/todos', (req, res) => {
  const fp = path.join(__dirname, 'todos.json');
  if (!fs.existsSync(fp)) return res.json([]);
  try {
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/todos', express.json(), (req, res) => {
  const fp = path.join(__dirname, 'todos.json');
  try {
    fs.writeFileSync(fp, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/competitors
// ══════════════════════════════════════════════════════════════
let competitorCache = { time: 0, data: [] };

app.get('/api/competitors', async (req, res) => {
  if (Date.now() - competitorCache.time < 15 * 60 * 1000) {
    return res.json(competitorCache.data);
  }

  const fp = path.join(__dirname, 'competitors.json');
  if (!fs.existsSync(fp)) return res.json([]);
  
  let competitors = {};
  try {
    competitors = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    return res.json([]);
  }

  const Parser = require('rss-parser');
  const parser = new Parser();
  let results = [];
  
  const fetchPromises = [];

  for (const [category, channels] of Object.entries(competitors)) {
    for (const channelId of channels) {
      if (!channelId) continue;
      
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      fetchPromises.push(
        parser.parseURL(feedUrl)
          .then(feed => {
            // Get the latest 1 video uploaded (no time limit so it's never empty)
            const recent = feed.items.slice(0, 1);

            recent.forEach(item => {
              const videoIdMatch = item.id.match(/yt:video:(.+)/);
              const videoId = videoIdMatch ? videoIdMatch[1] : null;
              const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null;

              results.push({
                category,
                channel: feed.title,
                title: item.title,
                link: item.link,
                thumbnail: thumbnail,
                timestamp: new Date(item.pubDate).getTime()
              });
            });
          })
          .catch(err => {
            console.error(`[RSS Error] Failed to fetch feed for ${channelId}:`, err.message);
          })
      );
    }
  }
  
  await Promise.allSettled(fetchPromises);
  
  // Sort by newest first
  results.sort((a, b) => b.timestamp - a.timestamp);

  competitorCache = { time: Date.now(), data: results };
  res.json(results);
});

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
  
// ==========================================
// TODAY'S PLAN (Kworb Trending Scraper)
// ==========================================
app.get('/api/todays-plan', async (req, res) => {
  try {
    const fetchKworb = async (url) => {
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = response.data;
      
      // Extract the first 3 songs from the Kworb table
      // Kworb rows: <tr><td class="pos">1</td><td><div><a href="...">Artist - Title</a>...</div></td></tr>
      const matches = [...html.matchAll(/<td class="text"><div[^>]*><a href="[^"]*">([^<]+)<\/a><\/div>/g)];
      
      return matches.slice(0, 3).map(m => {
        const text = m[1].replace(/&amp;/g, '&');
        const parts = text.split(' - ');
        return {
          artist: parts[0] ? parts[0].trim() : 'Unknown Artist',
          title: parts[1] ? parts.slice(1).join(' - ').trim() : text
        };
      });
    };

    const fetchYouTubeKworb = async (url) => {
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = response.data;
      // YouTube kworb rows: <tr><td class="pos">1</td><td><a href="...">Artist - Title</a></td></tr>
      const matches = [...html.matchAll(/<td class="text"><a href="[^"]*">([^<]+)<\/a>/g)];
      
      return matches.slice(0, 3).map(m => {
        const text = m[1].replace(/&amp;/g, '&');
        const parts = text.split(' - ');
        return {
          artist: parts[0] ? parts[0].trim() : 'Unknown Artist',
          title: parts[1] ? parts.slice(1).join(' - ').trim() : text
        };
      });
    }

    const [pop, hiphop, hindi, kpop] = await Promise.all([
      fetchKworb('https://kworb.net/charts/itunes/us.html'), // Using US iTunes for Pop proxy
      fetchYouTubeKworb('https://kworb.net/youtube/'),       // Global YouTube for HipHop/Global hits proxy
      fetchKworb('https://kworb.net/charts/itunes/in.html'), // India iTunes for Hindi/DHH
      fetchKworb('https://kworb.net/charts/itunes/kr.html')  // Korea iTunes for K-Pop
    ]);

    res.json({
      success: true,
      data: {
        Pop: pop.map(s => ({ ...s, reason: 'Trending #1 on US iTunes' })),
        'Hip-Hop': hiphop.map(s => ({ ...s, reason: 'Viral Global YouTube hit' })),
        Hindi: hindi.map(s => ({ ...s, reason: 'Trending #1 in India' })),
        DHH: hindi.slice(1).map(s => ({ ...s, reason: 'High engagement DHH' })), // Reusing India charts for DHH
        'K-Pop': kpop.map(s => ({ ...s, reason: 'Trending #1 in South Korea' }))
      }
    });

  } catch (error) {
    console.error('Todays plan fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trending data' });
  }
});

app.listen(PORT, () => {
    console.log('═'.repeat(52));
    console.log(`  Noises Music — http://localhost:${PORT}`);
    console.log('═'.repeat(52));
  });
});

