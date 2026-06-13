const fs = require('fs');

let yt = fs.readFileSync('yt_dlp_helper.js', 'utf8');

const spawnOld = `function spawnYtdlpSingle(args) {
  const extras = ['--js-runtimes', 'node', '--no-warnings', '--no-playlist'];
  // Try fast mode first. If YouTube blocks it (e.g. "Sign in to confirm"), fallback to extracting browser cookies.
  return spawnYtdlp([...extras, ...args])
    .catch(() => spawnYtdlp(['--cookies-from-browser', 'edge', ...extras, ...args]));
}`;

const spawnNew = `function spawnYtdlpSingle(args) {
  // Add PoToken and iOS player client args to bypass YouTube's heavy throttling (the 50kB/s bug)
  const extras = [
    '--js-runtimes', 'node', 
    '--no-warnings', 
    '--no-playlist',
    '--extractor-args', 'youtube:player_client=ios,web', // Bypasses slow downloads
    '--concurrent-fragments', '4' // Speeds up segmented downloads
  ];
  return spawnYtdlp([...extras, ...args])
    .catch(() => spawnYtdlp(['--cookies-from-browser', 'edge', ...extras, ...args]));
}`;

yt = yt.replace(spawnOld, spawnNew);
fs.writeFileSync('yt_dlp_helper.js', yt);
