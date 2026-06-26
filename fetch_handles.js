const fs = require('fs');
const https = require('https');

const handles = {
  "Pop": [
    "@vibemusic.",
    "@7clouds",
    "@itsUniqueVibes",
    "@SyrebralVibes",
    "@TazNetwork"
  ],
  "Hip-Hop": [
    "@RapCity",
    "@RapNation",
    "@HipHopUniverse",
    "@WORLDSTARHIPHOP",
    "@LyricalLemonade"
  ],
  "Hindi": [
    "@VibeBird.",
    "@IndieIndiaMusic",
    "@Soul_lyrics_4u",
    "@taeditor1486",
    "@TSeries"
  ],
  "DHH": [
    "@Kalamkaar",
    "@GullyGang",
    "@AzadiRecords",
    "@MassAppealIndia",
    "@DefJamIndia"
  ],
  "K-Pop": [
    "@jaeguchi",
    "@lemonade_esylyr",
    "@ZatyFarhani",
    "@K-PopLyricsColorCoded",
    "@1theK"
  ]
};

function fetchChannelId(handle) {
  return new Promise((resolve) => {
    https.get(`https://www.youtube.com/${handle}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 303) {
         // handle redirect if any, but youtube handles usually return 200 with ytInitialData
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/"channelId":"(UC[^"]+)"/);
        if (match) {
          resolve(match[1]);
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function run() {
  const result = {};
  for (const [cat, handleList] of Object.entries(handles)) {
    console.log(`\nFetching ${cat}...`);
    result[cat] = [];
    for (const handle of handleList) {
      const id = await fetchChannelId(handle);
      if (id) {
        console.log(`  [OK] ${handle} -> ${id}`);
        result[cat].push(id);
      } else {
        console.log(`  [FAIL] Could not find ID for ${handle}`);
      }
    }
  }
  fs.writeFileSync('competitors.json', JSON.stringify(result, null, 2));
  console.log('\nSaved competitors.json!');
}

run();
