const fs = require('fs');

let rendererFile = fs.readFileSync('video_renderer.js', 'utf8');

const archiverString = `const archiver = require('archiver');
`;

if (!rendererFile.includes('archiver')) {
  rendererFile = archiverString + rendererFile;
}

const renderSlideshowFunc = `

// ── SLIDESHOW RENDERER ─────────────────────────────────────────────────────────
async function renderSlideshow({
  artworkPath,
  lyrics = [],
  outputPath,
  songTitle = 'Unknown',
  songArtist = 'Unknown',
  resolution = '720',
  alignment = 'center',
  progressCallback = () => {},
}) {
  return new Promise((resolve, reject) => {
    try {
      const W   = resolution === '1080' ? 1080 : 720;
      const H   = resolution === '1080' ? 1920 : 1280;
      const FONT = 'Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR';
      
      const ACT_SZ  = Math.min(Math.round(W * 0.085), 90);
      const maxWidth = Math.round(W * 0.85);

      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      const archive = archiver('zip', { zlib: { level: 9 } });
      const outputStream = fs.createWriteStream(outputPath);
      
      outputStream.on('close', () => {
        console.log(\`[Slideshow] Done → \${outputPath} (\${archive.pointer()} bytes)\`);
        resolve(outputPath);
      });
      archive.on('error', err => reject(err));
      archive.pipe(outputStream);

      // We need to load images sync/async
      loadImage(path.join(__dirname, 'public', 'logo_white.png')).then(logoImg => {
        let coverImg = null, colors = null;
        const processSlides = () => {
          for (let i = 0; i < lyrics.length; i++) {
            const line = lyrics[i];
            const songTime = line.time + 0.1; // offset slightly to ensure it's active

            ctx.clearRect(0, 0, W, H);
            
            // Draw Background
            drawBackground(ctx, W, H, coverImg, colors, songTime, 0.0);
            
            // Draw Lyrics
            let ay = Math.round(H * 0.45);
            ctx.textAlign = 'center';
            
            const lines = wrapText(ctx, line.text, ACT_SZ * 0.8, maxWidth, FONT);
            let blockH = lines.length * ACT_SZ;
            
            if (line.translation) {
              const transLines = wrapText(ctx, line.translation, ACT_SZ * 0.5, maxWidth, FONT);
              blockH += (ACT_SZ * 0.5) + (transLines.length * (ACT_SZ * 0.5));
            }
            
            ay -= blockH / 2;

            for (const l of lines) {
              ctx.font = \`bold \${Math.round(ACT_SZ * 0.8)}px "\${FONT}"\`;
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(255,255,255,0.5)';
              ctx.shadowBlur = 15;
              ctx.fillText(l, W / 2, ay);
              ctx.shadowBlur = 0;
              ay += ACT_SZ;
            }
            if (line.translation) {
              ay += (ACT_SZ * 0.5);
              const transLines = wrapText(ctx, line.translation, ACT_SZ * 0.5, maxWidth, FONT);
              for (const l of transLines) {
                ctx.font = \`bold \${Math.round(ACT_SZ * 0.5)}px "\${FONT}"\`;
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(255,255,255,0.4)';
                ctx.shadowBlur = 10;
                ctx.fillText(l, W / 2, ay);
                ctx.shadowBlur = 0;
                ay += (ACT_SZ * 0.5);
              }
            }

            // Watermark
            drawWatermark(ctx, W, H, songTime, logoImg);

            const buf = canvas.toBuffer('image/png');
            archive.append(buf, { name: \`slide_\${(i+1).toString().padStart(3, '0')}.png\` });

            progressCallback(Math.floor((i / lyrics.length) * 100));
          }
          
          archive.finalize();
        };

        if (artworkPath && fs.existsSync(artworkPath)) {
          loadImage(artworkPath).then(img => {
            coverImg = img;
            getProminentColors(artworkPath).then(c => { colors = c; processSlides(); });
          });
        } else {
          processSlides();
        }
      });

    } catch (e) {
      reject(e);
    }
  });
}
`;

if (!rendererFile.includes('renderSlideshow')) {
  const exportOld = `module.exports = { renderVideo, generateThumbnail };`;
  const exportNew = `${renderSlideshowFunc}\nmodule.exports = { renderVideo, renderSlideshow, generateThumbnail };`;
  rendererFile = rendererFile.replace(exportOld, exportNew);
  fs.writeFileSync('video_renderer.js', rendererFile);
  console.log('patched video_renderer.js');
}

