const fs = require('fs');

let serverFile = fs.readFileSync('server.js', 'utf8');

// Update server.js
const serverOld = `    const outputId   = \`\${safeArtist} - \${safeTitle}_\${Date.now()}\`;
    const outputPath = path.join(OUTPUT_DIR, \`\${outputId}.mp4\`);`;
const serverNew = `    const isSlideshow = req.query.isSlideshow === 'true';
    const outputId   = \`\${safeArtist} - \${safeTitle}_\${Date.now()}\`;
    const outputPath = path.join(OUTPUT_DIR, \`\${outputId}\${isSlideshow ? '.zip' : '.mp4'}\`);`;
serverFile = serverFile.replace(serverOld, serverNew);

const serverRenderOld = `    await renderVideo({
      audioPath,
      artworkPath,`;
const serverRenderNew = `    if (isSlideshow) {
      await require('./video_renderer').renderSlideshow({
        artworkPath,
        lyrics: rawLyrics,
        outputPath,
        songTitle,
        songArtist,
        resolution: outRes,
        alignment: outAlign,
        progressCallback: pct => {
          const mapped = 18 + Math.round(pct * 0.79);
          send({ status: 'progress', progress: mapped, message: \`Generating Slideshow \${pct}%\` });
        },
      });
    } else {
      await renderVideo({
        audioPath,
        artworkPath,`;
serverFile = serverFile.replace(serverRenderOld, serverRenderNew);

// Fix the closing brace of else block in server.js
const serverClosingOld = `        const mapped = 18 + Math.round(pct * 0.79);
        send({ status: 'progress', progress: mapped, message: \`Rendering \${pct}%\` });
      },
    });`;
const serverClosingNew = `        const mapped = 18 + Math.round(pct * 0.79);
        send({ status: 'progress', progress: mapped, message: \`Rendering \${pct}%\` });
      },
    });
    }`;
serverFile = serverFile.replace(serverClosingOld, serverClosingNew);

// Update payload for zip
const serverPayloadOld = `    send({ status: 'completed', progress: 100, fileId: \`\${outputId}.mp4\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, youtubeTitle, youtubeDescription, youtubeTags });`;
const serverPayloadNew = `    send({ status: 'completed', progress: 100, fileId: \`\${outputId}\${isSlideshow ? '.zip' : '.mp4'}\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, youtubeTitle, youtubeDescription, youtubeTags });`;
serverFile = serverFile.replace(serverPayloadOld, serverPayloadNew);

fs.writeFileSync('server.js', serverFile);
console.log('patched server.js');

// ─────────────────────────────────────────────────────────────────
// Update app.js
let appFile = fs.readFileSync('public/app.js', 'utf8');

const appOld = `    alignment:      selectAlign.value,
    isShort:        isShort,
    shortStartTime: shortStartTime,
    youtubeDuration: S.track.youtubeDuration || S.track.duration,`;
const appNew = `    alignment:      selectAlign.value,
    isShort:        isShort,
    shortStartTime: shortStartTime,
    isSlideshow:    isSlideshow,
    youtubeDuration: S.track.youtubeDuration || S.track.duration,`;
appFile = appFile.replace(appOld, appNew);

const appSigOld = `async function startCompile(isShort = false, shortStartTime = 0) {`;
const appSigNew = `async function startCompile(isShort = false, shortStartTime = 0, isSlideshow = false) {`;
appFile = appFile.replace(appSigOld, appSigNew);

const appBtnOld = `btnExport.addEventListener('click', () => {
  startCompile();
});`;
const appBtnNew = `btnExport.addEventListener('click', () => {
  startCompile(false, 0, false);
});
document.getElementById('btn-export-slideshow')?.addEventListener('click', () => {
  startCompile(false, 0, true);
});`;
appFile = appFile.replace(appBtnOld, appBtnNew);

fs.writeFileSync('public/app.js', appFile);
console.log('patched app.js');

// ─────────────────────────────────────────────────────────────────
// Update index.html
let indexFile = fs.readFileSync('public/index.html', 'utf8');

const indexBtnOld = `<button id="btn-export" class="btn-action">
          Export Video
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>`;
const indexBtnNew = `<div style="display: flex; gap: 8px;">
          <button id="btn-export-slideshow" class="btn-action secondary" style="background: rgba(255,255,255,0.1)">
            Slideshow (.zip)
          </button>
          <button id="btn-export" class="btn-action" style="flex:1">
            Export Video
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>`;
indexFile = indexFile.replace(indexBtnOld, indexBtnNew);

const indexDlOld = `<a id="btn-dl-video" href="#" class="btn-dl primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download MP4
        </a>`;
const indexDlNew = `<a id="btn-dl-video" href="#" class="btn-dl primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download File
        </a>`;
indexFile = indexFile.replace(indexDlOld, indexDlNew);

fs.writeFileSync('public/index.html', indexFile);
console.log('patched index.html');
