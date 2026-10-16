'use strict';
// Cloud render entry point, used by .github/workflows/cloud-render.yml.
//
// Runs a single render on GitHub Actions and optionally uploads the result to
// YouTube. ALL credentials come from environment variables (GitHub Secrets) —
// never from the project payload and never from a committed file.
// See README.md → "Optional: Cloud render".
//
// Usage: node run-cloud.js <project.json> <audio-file>

const fs = require('fs');
const path = require('path');
const { renderVideo, generateThumbnailBuffer } = require('./video_renderer');

async function main() {
  const projectPath = process.argv[2];
  const audioPath = process.argv[3];

  if (!projectPath || !audioPath) {
    console.error('Usage: node run-cloud.js <project.json> <audio.mp3>');
    process.exit(1);
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

  // Credentials come ONLY from the environment (GitHub Secrets / env vars).
  // youtube_auth.js itself reads YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.

  // If an upload was requested, materialise the refresh token from the
  // environment into the gitignored .data/tokens/ folder for youtube_auth.
  const channel = project.channel && project.channel !== 'local' ? project.channel : null;
  if (channel && process.env.YOUTUBE_REFRESH_TOKEN) {
    const tokensDir = path.join(__dirname, '.data', 'tokens');
    fs.mkdirSync(tokensDir, { recursive: true });
    fs.writeFileSync(path.join(tokensDir, `${channel}.json`), JSON.stringify({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      channel_name: process.env.YOUTUBE_CHANNEL_NAME || channel,
    }));
    console.log(`[Cloud] Prepared upload token for channel: ${channel}`);
  }

  const ytAuth = require('./youtube_auth');

  const outputPath = path.join(__dirname, 'temp', 'output_video.mp4');
  const thumbnailPath = path.join(__dirname, 'temp', 'output_thumbnail.png');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`[Cloud] Starting render for: ${project.songTitle} by ${project.songArtist}`);

  // Download artwork if available.
  const { downloadArtwork } = require('./yt_dlp_helper');
  let artworkUrl = project.artworkUrl;
  if (!artworkUrl && project.videoUrl && project.videoUrl.includes('v=')) {
    const vidId = project.videoUrl.split('v=')[1] && project.videoUrl.split('v=')[1].split('&')[0];
    if (vidId) artworkUrl = `https://i.ytimg.com/vi/${vidId}/maxresdefault.jpg`;
  }

  let downloadedArtworkPath = null;
  if (artworkUrl) {
    console.log('[Cloud] Downloading artwork from:', artworkUrl);
    downloadedArtworkPath = await downloadArtwork(artworkUrl, project.id || 'cloud_render');
    // maxresdefault often does not exist — fall back to hqdefault.
    if (!downloadedArtworkPath && artworkUrl.includes('maxresdefault.jpg')) {
      console.log('[Cloud] maxresdefault failed, trying hqdefault...');
      downloadedArtworkPath = await downloadArtwork(artworkUrl.replace('maxresdefault.jpg', 'hqdefault.jpg'), project.id || 'cloud_render');
    }
    if (downloadedArtworkPath) console.log('[Cloud] Artwork downloaded to:', downloadedArtworkPath);
    else console.log('[Cloud] Failed to download artwork, proceeding without it.');
  }

  // 1. Render video
  await renderVideo({
    audioPath,
    artworkPath: downloadedArtworkPath,
    lyrics: project.lyrics,
    outputPath,
    duration: project.duration || 180,
    songTitle: project.songTitle,
    songArtist: project.songArtist,
    resolution: project.outRes || 1080,
    fps: project.outFps || 30,
    alignment: project.outAlign || 'center',
    offset: project.offset || 0,
    isShort: project.isShort || false,
    shortStartTime: project.shortStartTime || 0,
    seoKeywords: project.seoKeywords || [],
    youtubeDuration: project.youtubeDuration,
    itunesDuration: project.itunesDuration,
    progressCallback: pct => {
      if (Math.round(pct) % 10 === 0) console.log(`[Cloud Render] ${Math.round(pct)}%`);
    }
  });
  console.log('[Cloud] Render complete! Video saved to:', outputPath);

  // 2. Thumbnail
  try {
    const thumbBuffer = await generateThumbnailBuffer({
      title: project.songTitle,
      artist: project.songArtist,
      artworkUrl: downloadedArtworkPath,
      theme: project.outAlign,
      logoPath: path.join(__dirname, 'public', 'logo.png'),
    });
    fs.writeFileSync(thumbnailPath, thumbBuffer);
    console.log('[Cloud] Thumbnail generated.');
  } catch (err) {
    console.log('[Cloud] Thumbnail generation failed, proceeding without one:', err.message);
  }

  // 3. YouTube metadata
  const rawLyrics = project.lyrics || [];
  const hasTranslation = rawLyrics.some(l => l.translation && l.translation.trim() !== '');
  const finalTitle = `${project.songArtist} - ${project.songTitle} (Lyrics${hasTranslation ? ' & English Translation' : ''})`;
  const lyricLines = rawLyrics.map(l => l.text).join('\n');
  const tagsText = `#${project.songArtist.replace(/\s+/g, '')} #${project.songTitle.replace(/\s+/g, '')} #Lyrics`;
  const seoKeywords = project.seoKeywords || [];
  const seoBlock = seoKeywords.length > 0 ? `\n\nSearch terms:\n${seoKeywords.join(', ')}` : '';
  const disclaimer = `\n\n────────────────────────────────────────────────────────────\n⚠️ COPYRIGHT DISCLAIMER:\nWe do not own the rights to this song. All credits go to the original artists and their respective record labels. This video is created for entertainment purposes only.\n────────────────────────────────────────────────────────────`;
  const finalDescription = `🎵 ${project.songArtist} - ${project.songTitle} (Lyrics Video)\n\n${project.videoUrl}\n\n${lyricLines}\n\n${tagsText}${seoBlock}${disclaimer}`;

  const fallbackTags = `${project.songArtist}, ${project.songTitle}, Lyrics, Pop, Music`;
  const rawFinalTags = seoKeywords.length > 0 ? seoKeywords.concat(fallbackTags.split(', ')) : fallbackTags.split(', ');

  // Enforce YouTube's 500-character total tags limit.
  const finalTagsArray = [];
  let totalLen = 0;
  for (const t of rawFinalTags) {
    const tTrim = (t || '').trim();
    if (!tTrim) continue;
    if (totalLen + tTrim.length + 1 <= 500) {
      finalTagsArray.push(tTrim);
      totalLen += tTrim.length + 1;
    }
  }

  // 4. Upload to YouTube (only if a real channel was requested)
  if (channel) {
    if (!process.env.YOUTUBE_REFRESH_TOKEN) {
      console.error('[Cloud] Upload requested but YOUTUBE_REFRESH_TOKEN is not set. Skipping upload.');
      return;
    }
    console.log(`[Cloud] Uploading to channel: ${channel}`);
    try {
      const editUrl = await ytAuth.uploadToYouTube({
        channelIdLabel: channel,
        videoPath: outputPath,
        thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : null,
        title: finalTitle,
        description: finalDescription,
        tags: finalTagsArray,
        publishAtOverride: project.publishAt,
      });
      console.log('[Cloud] YouTube Upload Success! Edit URL:', editUrl);
    } catch (err) {
      console.error('[Cloud] YouTube Upload Failed:', err);
      process.exit(1);
    }
  } else {
    console.log('[Cloud] Local destination selected. Skipping YouTube upload.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
