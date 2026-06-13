const fs = require('fs');

// Patch app.js
let app = fs.readFileSync('public/app.js', 'utf8');

// 1. Add precomputeLyricsLayout to input change listener
const inputChangeOld = `      transInput.addEventListener('change', (e) => {
        S.lyrics[idx].translation = e.target.value.trim();
        // Do not update the raw LRC editor because LRC does not natively support translations this way,
        // we just keep it in memory (S.lyrics) and it will be sent to the backend on render.
      });`;
const inputChangeNew = `      transInput.addEventListener('change', (e) => {
        S.lyrics[idx].translation = e.target.value.trim();
        precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);
      });`;
app = app.replace(inputChangeOld, inputChangeNew);

// 2. Add precomputeLyricsLayout to auto-translate finish
const autoTranslateOld = `      data.translations.forEach((t, i) => {
        S.lyrics[i].translation = t;
      });
      renderLyricsList();`;
const autoTranslateNew = `      data.translations.forEach((t, i) => {
        S.lyrics[i].translation = t;
      });
      renderLyricsList();
      precomputeLyricsLayout(canvas.width, canvas.height, selectAlign.value);`;
app = app.replace(autoTranslateOld, autoTranslateNew);

// 3. Add parenthesis to mapping in app.js
const appMapOld = `    const wTrans = line.translation ? wrapLine(line.translation, \`600 \${transSz}px \${FONT}, sans-serif\`) : [];`;
const appMapNew = `    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', \`600 \${transSz}px \${FONT}, sans-serif\`) : [];`;
app = app.replace(appMapOld, appMapNew);

fs.writeFileSync('public/app.js', app);

// Patch video_renderer.js
let renderer = fs.readFileSync('video_renderer.js', 'utf8');

// 4. Add parenthesis to mapping in video_renderer.js
const rendererMapOld = `    const wTrans = line.translation ? wrapLine(line.translation, \`600 \${transSz}px \${FONT}\`) : [];`;
const rendererMapNew = `    const wTrans = line.translation ? wrapLine('(' + line.translation + ')', \`600 \${transSz}px \${FONT}\`) : [];`;
renderer = renderer.replace(rendererMapOld, rendererMapNew);

fs.writeFileSync('video_renderer.js', renderer);
