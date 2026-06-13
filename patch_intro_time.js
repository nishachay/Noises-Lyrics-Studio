const fs = require('fs');

// Patch app.js
let app = fs.readFileSync('public/app.js', 'utf8');

const appOld = `  const alignment = selectAlign.value;
  if (now < 3) {
    drawIntroLayout(W, H, now);
  } else {
    if (alignment === 'left') {`;

const appNew = `  const alignment = selectAlign.value;
  let introEnd = 3.0;
  if (precomputedLyrics && precomputedLyrics.length > 0) {
    introEnd = Math.min(3.0, Math.max(0, precomputedLyrics[0].time - 0.5));
  }

  if (now < introEnd) {
    // scale opacity so it still fades out
    const fadeOutStart = Math.max(0, introEnd - 1.0);
    let introNow = now;
    if (introEnd < 3.0 && now > fadeOutStart) {
      // Fake 'now' so drawIntroLayout fades out
      introNow = 3.0 - (introEnd - now);
    }
    drawIntroLayout(W, H, introNow);
  } else {
    if (alignment === 'left') {`;

app = app.replace(appOld, appNew);
fs.writeFileSync('public/app.js', app);

// Patch video_renderer.js
let renderer = fs.readFileSync('video_renderer.js', 'utf8');

const rendererOld = `        // ── INTRO (0–3s) ────────────────────────────────────────
        if (now < 3) {
          const t = now;
          const a = t < 1 ? t : t < 2 ? 1 : 3 - t;`;

const rendererNew = `        // ── INTRO ────────────────────────────────────────
        let introEnd = 3.0;
        if (wrappedLyrics && wrappedLyrics.length > 0) {
          introEnd = Math.min(3.0, Math.max(0, wrappedLyrics[0].time - 0.5));
        }

        if (now < introEnd) {
          const t = now;
          const fadeOutStart = Math.max(0, introEnd - 1.0);
          let a = 1.0;
          if (t < 1.0) a = t; 
          if (t > fadeOutStart) a = Math.min(a, introEnd - t);`;

renderer = renderer.replace(rendererOld, rendererNew);
fs.writeFileSync('video_renderer.js', renderer);
