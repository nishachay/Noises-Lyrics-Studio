const fs = require('fs');
const path = require('path');
const { renderVideo } = require('./video_renderer');

async function main() {
  const projectPath = process.argv[2];
  const audioPath = process.argv[3];

  if (!projectPath || !audioPath) {
    console.error("Usage: node run-cloud.js <project.json> <audio.mp3>");
    process.exit(1);
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

  // Extract bundled credentials safely
  if (project.youtubeClientId && project.youtubeClientSecret) {
    const envPath = path.join(__dirname, '.env');
    fs.writeFileSync(envPath, `YOUTUBE_CLIENT_ID=${project.youtubeClientId}\nYOUTUBE_CLIENT_SECRET=${project.youtubeClientSecret}\n`);
    process.env.YOUTUBE_CLIENT_ID = project.youtubeClientId;
    process.env.YOUTUBE_CLIENT_SECRET = project.youtubeClientSecret;
    console.log('[Cloud] Extracted OAuth credentials from payload.');
  }

  const ytAuth = require('./youtube_auth');

  if (project.channel && project.channel !== 'local' && project.channelTokenJson) {
    const tokensDir = path.join(__dirname, 'tokens');
    if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir);
    fs.writeFileSync(path.join(tokensDir, `${project.channel}.json`), project.channelTokenJson);
    console.log(`[Cloud] Extracted channel token for: ${project.channel}`);
  }

  const outputPath = path.join(__dirname, 'temp', 'output_video.mp4');
  const thumbnailPath = path.join(__dirname, 'temp', 'output_thumbnail.png');

  console.log(`[Cloud] Starting render for: ${project.songTitle} by ${project.songArtist}`);

  // Download artwork if available
  const { downloadArtwork } = require('./yt_dlp_helper');
  let artworkUrl = project.artworkUrl;
  
  if (!artworkUrl && project.videoUrl && project.videoUrl.includes('youtube.com/watch?v=')) {
    const vidId = project.videoUrl.split('v=')[1]?.split('&')[0];
    if (vidId) artworkUrl = `https://i.ytimg.com/vi/${vidId}/maxresdefault.jpg`;
  }
  
  let downloadedArtworkPath = null;
  if (artworkUrl) {
    console.log('[Cloud] Downloading artwork from:', artworkUrl);
    downloadedArtworkPath = await downloadArtwork(artworkUrl, project.id || 'cloud_render');
    
    // Fallback to hqdefault if maxresdefault fails (often maxres doesn't exist)
    if (!downloadedArtworkPath && artworkUrl.includes('maxresdefault.jpg')) {
      console.log('[Cloud] maxresdefault failed, trying hqdefault...');
      artworkUrl = artworkUrl.replace('maxresdefault.jpg', 'hqdefault.jpg');
      downloadedArtworkPath = await downloadArtwork(artworkUrl, project.id || 'cloud_render');
    }
    
    if (downloadedArtworkPath) {
      console.log('[Cloud] Artwork downloaded successfully to:', downloadedArtworkPath);
    } else {
      console.log('[Cloud] Failed to download artwork, will proceed without it.');
    }
  }

  // 1. Render Video
  await renderVideo({
    audioPath: audioPath,
    artworkPath: downloadedArtworkPath, // We'll rely on generated background for now or download it if needed
    lyrics: project.lyrics,
    outputPath: outputPath,
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
      // Print every 10%
      if (Math.round(pct) % 10 === 0) {
        console.log(`[Cloud Render] ${Math.round(pct)}%`);
      }
    }
  });

  console.log('[Cloud] Render complete! Video saved to:', outputPath);

  // 2. Generate Thumbnail
  console.log('[Cloud] Generating thumbnail...');
  const { generateThumbnailBuffer } = require('./video_renderer');
  try {
    const thumbBuffer = await generateThumbnailBuffer({
      title: project.songTitle,
      artist: project.songArtist,
      artworkUrl: downloadedArtworkPath, // Use downloaded artwork instead of youtube video URL
      theme: project.outAlign,
      logoPath: path.join(__dirname, 'public', 'logo.png')
    });
    fs.writeFileSync(thumbnailPath, thumbBuffer);
    console.log('[Cloud] Thumbnail generated successfully.');
  } catch (err) {
    console.log('[Cloud] Thumbnail generation failed, proceeding without one:', err.message);
  }

  // 3. Generate YouTube Metadata
  const rawLyrics = project.lyrics || [];
  const hasTranslation = rawLyrics.some(l => l.translation && l.translation.trim() !== '');
  const finalTitle = `${project.songArtist} - ${project.songTitle} (Lyrics${hasTranslation ? ' & English Translation' : ''})`;
  const lyricLines = rawLyrics.map(l => l.text).join('\n');
  const tagsText = `#${project.songArtist.replace(/\s+/g,'')} #${project.songTitle.replace(/\s+/g,'')} #Lyrics #NoisesMusic`;
  const seoKeywords = project.seoKeywords || [];
  const seoBlock = seoKeywords.length > 0 ? `\n\nSearch terms:\n${seoKeywords.join(', ')}` : '';
  const disclaimer = `\n\n────────────────────────────────────────────────────────────\n⚠️ COPYRIGHT DISCLAIMER:\nWe do not own the rights to this song. All credits go to the original artists and their respective record labels. This video is created for entertainment purposes only.\n────────────────────────────────────────────────────────────`;
  const finalDescription = `🎵 ${project.songArtist} - ${project.songTitle} (Lyrics Video)\n\n${project.videoUrl}\n\n${lyricLines}\n\n${tagsText}${seoBlock}${disclaimer}`;
  
  const fallbackTags = `${project.songArtist}, ${project.songTitle}, Lyrics, Pop, Music`;
  const rawFinalTags = seoKeywords.length > 0 ? seoKeywords.concat(fallbackTags.split(', ')) : fallbackTags.split(', ');
  
  // Enforce YouTube's 500-character total tags limit
  const finalTagsArray = [];
  let totalLen = 0;
  for (const t of rawFinalTags) {
    const tTrim = t.trim();
    if (!tTrim) continue;
    if (totalLen + tTrim.length + 1 <= 500) {
      finalTagsArray.push(tTrim);
      totalLen += tTrim.length + 1;
    }
  }

  // 4. Upload to YouTube
  if (project.channel && project.channel !== 'local') {
    console.log(`[Cloud] Uploading to channel: ${project.channel}`);
    
    // We need to generate a thumbnail. We can do a basic one, or omit it.
    // The previous uploadToYouTube handles null thumbnail.
    
    try {
      const editUrl = await ytAuth.uploadToYouTube({
        channelIdLabel: project.channel,
        videoPath: outputPath,
        thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : null, 
        title: finalTitle,
        description: finalDescription,
        tags: finalTagsArray,
        publishAtOverride: project.publishAt
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

main().catch(console.error);
