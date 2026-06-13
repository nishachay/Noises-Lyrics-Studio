const fs = require('fs');

// 1. Update app.js UI
let appFile = fs.readFileSync('public/app.js', 'utf8');

const uiOld = `      const shortBtn = document.createElement('button');
      shortBtn.className = 'btn-short';
      shortBtn.innerHTML = \`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>\`;
      shortBtn.title = 'Export YouTube Short from here';
      shortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!line.time) return alert('This line has no timestamp!');
        startCompile(true, line.time, false);
      });
      div.appendChild(shortBtn);`;
const uiNew = `      const slidesCheck = document.createElement('input');
      slidesCheck.type = 'checkbox';
      slidesCheck.className = 'slide-check';
      slidesCheck.dataset.idx = idx;
      slidesCheck.title = 'Include in Slideshow';
      slidesCheck.style.cssText = 'margin-right: 8px; cursor: pointer; accent-color: #ff3366;';
      div.appendChild(slidesCheck);

      const shortBtn = document.createElement('button');
      shortBtn.className = 'btn-short';
      shortBtn.innerHTML = \`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>\`;
      shortBtn.title = 'Export YouTube Short from here';
      shortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!line.time) return alert('This line has no timestamp!');
        startCompile(true, line.time, false);
      });
      div.appendChild(shortBtn);`;

appFile = appFile.replace(uiOld, uiNew);

const btnExportOld = `document.getElementById('btn-export-slideshow')?.addEventListener('click', () => {
  startCompile(false, 0, true);
});`;
const btnExportNew = `document.getElementById('btn-export-slideshow')?.addEventListener('click', () => {
  const selectedIndices = Array.from(document.querySelectorAll('.slide-check:checked')).map(cb => parseInt(cb.dataset.idx));
  if (selectedIndices.length === 0) return alert('Please select at least one lyric line for the slideshow using the checkboxes!');
  
  // Attach the selected indices to the global state temporarily so startCompile can grab it
  window.slideshowIndices = selectedIndices;
  startCompile(false, 0, true);
});`;
appFile = appFile.replace(btnExportOld, btnExportNew);

const compilePayloadOld = `    alignment:      selectAlign.value,
    isShort:        isShort,
    shortStartTime: shortStartTime,
    isSlideshow:    isSlideshow,
    youtubeDuration: S.track.youtubeDuration || S.track.duration,`;
const compilePayloadNew = `    alignment:      selectAlign.value,
    isShort:        isShort,
    shortStartTime: shortStartTime,
    isSlideshow:    isSlideshow,
    slideshowIndices: window.slideshowIndices || [],
    youtubeDuration: S.track.youtubeDuration || S.track.duration,`;
appFile = appFile.replace(compilePayloadOld, compilePayloadNew);

fs.writeFileSync('public/app.js', appFile);


// 2. Update server.js
let serverFile = fs.readFileSync('server.js', 'utf8');

const serverRenderOld = `    if (isSlideshow) {
      await require('./video_renderer').renderSlideshow({
        artworkPath,
        lyrics: rawLyrics,`;
const serverRenderNew = `    if (isSlideshow) {
      const selectedLyrics = req.body.slideshowIndices && req.body.slideshowIndices.length > 0 
        ? req.body.slideshowIndices.map(idx => rawLyrics[idx]).filter(Boolean)
        : rawLyrics;
        
      await require('./video_renderer').renderSlideshow({
        artworkPath,
        lyrics: selectedLyrics,`;
serverFile = serverFile.replace(serverRenderOld, serverRenderNew);
fs.writeFileSync('server.js', serverFile);


// 3. Update video_renderer.js dimensions for Cross-platform Square (1:1)
let rendererFile = fs.readFileSync('video_renderer.js', 'utf8');
const renderDimOld = `      const W   = resolution === '1080' ? 1080 : 720;
      const H   = resolution === '1080' ? 1920 : 1280;`;
const renderDimNew = `      const W   = 1080;
      const H   = 1080; // Force 1:1 cross-platform square for IG/TikTok`;
rendererFile = rendererFile.replace(renderDimOld, renderDimNew);
fs.writeFileSync('video_renderer.js', rendererFile);

console.log('patched pro workflow');
