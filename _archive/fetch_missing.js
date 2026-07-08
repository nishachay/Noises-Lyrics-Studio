const fs = require('fs');
const https = require('https');

const userRequestedHandles = [
  "@VibeBird.",
  "@IndieIndiaMusic",
  "@Soul_lyrics_4u",
  "@taeditor1486",
  "@itsUniqueVibes",
  "@jaeguchi",
  "@lemonade_esylyr",
  "@Kalamkaar",
  "@GullyGang"
];

function fetchId(handle) {
  return new Promise((resolve) => {
    https.get(`https://www.youtube.com/${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/"channelId":"(UC[^"]+)"/);
        resolve({ handle, id: match ? match[1] : null });
      });
    }).on('error', () => resolve({ handle, id: null }));
  });
}

async function run() {
  for (const handle of userRequestedHandles) {
    const res = await fetchId(handle);
    console.log(`${res.handle} -> ${res.id}`);
    await new Promise(r => setTimeout(r, 1000)); // wait 1s
  }
}
run();
