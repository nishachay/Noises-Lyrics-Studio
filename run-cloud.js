const fs = require('fs');
const path = require('path');
const { renderVideo } = require('./video_renderer');
const ytAuth = require('./youtube_auth');

async function main() {
  const projectPath = process.argv[2];
  const audioPath = process.argv[3];

  if (!projectPath || !audioPath) {
    console.error("Usage: node run-cloud.js <project.json> <audio.mp3>");
    process.exit(1);
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

  const outputPath = path.join(__dirname, 'temp', 'output_video.mp4');

  console.log(`[Cloud] Starting render for: ${project.songTitle} by ${project.songArtist}`);

  // 1. Render Video
  await renderVideo({
    audioPath: audioPath,
    artworkPath: null, // We'll rely on generated background for now or download it if needed
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

  // 2. Upload to YouTube
  if (project.channel && project.channel !== 'local') {
    console.log(`[Cloud] Uploading to channel: ${project.channel}`);
    
    // We need to generate a thumbnail. We can do a basic one, or omit it.
    // The previous uploadToYouTube handles null thumbnail.
    
    try {
      const editUrl = await ytAuth.uploadToYouTube({
        channelIdLabel: project.channel,
        videoPath: outputPath,
        thumbnailPath: null, 
        title: project.youtubeTitle || `${project.songArtist} - ${project.songTitle} (Lyrics)`,
        description: project.youtubeDescription || `Lyrics for ${project.songTitle} by ${project.songArtist}.`,
        tags: project.seoKeywords || []
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
