const fs = require('fs');

// PATCH SERVER.JS
let server = fs.readFileSync('server.js', 'utf8');

// 1. YouTube Title & Description (Add 'with Translation' if needed)
const serverTitleOld = `    const youtubeTitle       = \`\${songArtist} - \${songTitle} (Lyrics)\`;`;
const serverTitleNew = `    const hasTranslation     = rawLyrics.some(l => l.translation && l.translation.trim() !== '');
    const youtubeTitle       = \`\${songArtist} - \${songTitle} (Lyrics\${hasTranslation ? ' & English Translation' : ''})\`;`;

server = server.replace(serverTitleOld, serverTitleNew);

// 2. Cache Direct Audio URL for smooth playback
const serverStreamOld = `app.get('/api/stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!videoId) return res.status(400).send('Bad videoId');

  console.log(\`[Stream] Proxying direct audio URL for: \${videoId}\`);
  try {
    const directUrl = await getDirectAudioUrl(\`https://www.youtube.com/watch?v=\${videoId}\`);`;

const serverStreamNew = `const directUrlCache = new Map();

app.get('/api/stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!videoId) return res.status(400).send('Bad videoId');

  try {
    let directUrl = directUrlCache.get(videoId);
    if (!directUrl) {
      console.log(\`[Stream] Fetching fresh direct audio URL for: \${videoId}\`);
      directUrl = await getDirectAudioUrl(\`https://www.youtube.com/watch?v=\${videoId}\`);
      if (directUrl) directUrlCache.set(videoId, directUrl);
    }

    if (req.headers.range) {
      // console.log(\`[Stream] Proxying range \${req.headers.range} for \${videoId}\`);
    }`;

server = server.replace(serverStreamOld, serverStreamNew);
fs.writeFileSync('server.js', server);

// PATCH VIDEO_RENDERER.JS
let renderer = fs.readFileSync('video_renderer.js', 'utf8');

// 3. Add Translation Badge to Thumbnail
// Inside generateThumbnail, before ctx.restore() or return output path
const rendererThumbOld = `  const titleY = ay + artSz + gap1;

  // Draw Title
  ctx.save();
  ctx.font = \`bold \${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;`;

const rendererThumbNew = `  const titleY = ay + artSz + gap1;

  const hasTranslation = wrappedLyrics && wrappedLyrics.some(l => l.translation && l.translation.trim() !== '');

  // Draw Title
  ctx.save();
  ctx.font = \`bold \${titleSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;`;

renderer = renderer.replace(rendererThumbOld, rendererThumbNew);

const rendererThumbOld2 = `  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(artist, W / 2, artistY);
  ctx.restore();

  const outBuffer = canvas.toBuffer('image/jpeg', 0.95);`;

const rendererThumbNew2 = `  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(artist, W / 2, artistY);
  ctx.restore();

  if (hasTranslation) {
    ctx.save();
    const badgeSz = Math.round(H * 0.035);
    ctx.font = \`600 \${badgeSz}px "Plus Jakarta Sans", "Noto Sans Devanagari", "Noto Sans KR"\`;
    
    // Draw badge pill
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; // emerald glow background
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 2;
    const paddingX = badgeSz * 1.5;
    const paddingY = badgeSz * 0.8;
    const badgeW = ctx.measureText('English Translation').width + paddingX * 2;
    const badgeH = badgeSz + paddingY * 2;
    const badgeX = W / 2 - badgeW / 2;
    const badgeY = ay - badgeH - 20; // Above the artwork
    
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#10b981'; // vibrant emerald text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('English Translation', W / 2, badgeY + badgeH / 2);
    ctx.restore();
  }

  const outBuffer = canvas.toBuffer('image/jpeg', 0.95);`;

renderer = renderer.replace(rendererThumbOld2, rendererThumbNew2);
fs.writeFileSync('video_renderer.js', renderer);
