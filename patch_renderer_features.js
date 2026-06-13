const fs = require('fs');

let file = fs.readFileSync('video_renderer.js', 'utf8');

// 1. Update renderVideo signature
const sigOld = `  youtubeDuration = 0,
  itunesDuration = 0,
  progressCallback = () => {},
}) {`;
const sigNew = `  youtubeDuration = 0,
  itunesDuration = 0,
  isShort = false,
  shortStartTime = 0,
  seoKeywords = [],
  progressCallback = () => {},
}) {`;
file = file.replace(sigOld, sigNew);

// 2. Update Geometry and Loop parameters
const geoOld = `      // ── Geometry ──────────────────────────────────────────────
      const W   = resolution === '1080' ? 1920 : 1280;
      const H   = resolution === '1080' ? 1080 : 720;
      const FPS = parseInt(fps, 10) || 24;
      const FONT = 'Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR';

      const ACT_SZ  = Math.min(Math.round(H * 0.065), 72);  // active line
      const maxWidth = alignment === 'left' ? Math.round(W * 0.44) : Math.round(W * 0.76);

      // Total frames matching song duration
      const TOTAL_FRAMES = Math.ceil(duration * FPS);`;

const geoNew = `      // ── Geometry ──────────────────────────────────────────────
      const W   = isShort ? (resolution === '1080' ? 1080 : 720) : (resolution === '1080' ? 1920 : 1280);
      const H   = isShort ? (resolution === '1080' ? 1920 : 1280) : (resolution === '1080' ? 1080 : 720);
      const FPS = parseInt(fps, 10) || 24;
      const FONT = 'Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR';

      const ACT_SZ  = isShort ? Math.min(Math.round(W * 0.085), 90) : Math.min(Math.round(H * 0.065), 72);
      const maxWidth = isShort ? Math.round(W * 0.85) : (alignment === 'left' ? Math.round(W * 0.44) : Math.round(W * 0.76));
      
      const renderDuration = isShort ? 30 : duration;
      const TOTAL_FRAMES = Math.ceil(renderDuration * FPS);`;
file = file.replace(geoOld, geoNew);

// 3. Update seoKeywords in the text file generator
// We already generated _metadata.txt in a previous step, but let's make sure it accepts seoKeywords.
const seoOld = `      const seoTags = \`\${songArtist}, \${songTitle}, Lyrics, \${hasTranslation ? 'English Translation, ' : ''}Pop, Music, Audio\`;`;
const seoNew = `      const autoTags = seoKeywords && seoKeywords.length > 0 ? seoKeywords.join(', ') + ', ' : '';
      const seoTags = \`\${autoTags}\${songArtist}, \${songTitle}, Lyrics, \${hasTranslation ? 'English Translation, ' : ''}Pop, Music, Audio\`;`;
file = file.replace(seoOld, seoNew);

// 4. Update FFmpeg audio input
const ffOld = `        '-i', '-',                          // canvas frames via stdin
        '-i', audioPath,
        '-filter_complex',
          \`[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=\${duration - 2}:d=2[a]\`,`;
const ffNew = `        '-i', '-',                          // canvas frames via stdin
        ...(isShort ? ['-ss', \`\${shortStartTime}\`, '-t', '30'] : []),
        '-i', audioPath,
        '-filter_complex',
          \`[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=\${renderDuration - 2}:d=2[a]\`,`;
file = file.replace(ffOld, ffNew);

// 5. Update songTime in loop
const loopOld = `      // ── Main render loop ──────────────────────────────────────
      for (let fi = 0; fi < TOTAL_FRAMES; fi++) {
        const now      = fi / FPS;           // time from video start
        const songTime = now;                // time from song start (1:1 timeline alignment)`;
const loopNew = `      // ── Main render loop ──────────────────────────────────────
      for (let fi = 0; fi < TOTAL_FRAMES; fi++) {
        const now      = fi / FPS;           // time from video start
        const songTime = isShort ? shortStartTime + now : now;`;
file = file.replace(loopOld, loopNew);

// 6. Update drawIntroLayout to skip intro if isShort
const introOld = `        const alignmentToDraw = alignment;

        if (songTime < introEnd) {
          drawIntroLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, introEnd, FONT);`;
const introNew = `        const alignmentToDraw = isShort ? 'center' : alignment;

        if (!isShort && songTime < introEnd) {
          drawIntroLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, introEnd, FONT);`;
file = file.replace(introOld, introNew);

// 7. Force album panel to not draw in Shorts mode
const panelOld = `        } else {
          if (alignmentToDraw === 'left') {
            drawLeftSplitLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, duration, FONT);
          } else {
            drawAlbumPanel(ctx, coverImg, songTitle, songArtist, W, H, FONT, songTime, duration);
          }`;
const panelNew = `        } else {
          if (!isShort && alignmentToDraw === 'left') {
            drawLeftSplitLayout(ctx, coverImg, songTitle, songArtist, W, H, songTime, duration, FONT);
          } else if (!isShort) {
            drawAlbumPanel(ctx, coverImg, songTitle, songArtist, W, H, FONT, songTime, duration);
          }`;
file = file.replace(panelOld, panelNew);

// 8. Watermark force center for short
const waterOld = `        drawWatermark(ctx, W, H, songTime, logoImg);`;
const waterNew = `        if (!isShort) drawWatermark(ctx, W, H, songTime, logoImg);`;
file = file.replace(waterOld, waterNew);

fs.writeFileSync('video_renderer.js', file);
console.log('Patched video_renderer.js');
