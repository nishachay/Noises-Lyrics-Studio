const fs = require('fs');
const ytsr = require('youtube-sr').default;

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

async function run() {
  const result = {};
  for (const [cat, handleList] of Object.entries(handles)) {
    console.log(`\nFetching ${cat}...`);
    result[cat] = [];
    for (const handle of handleList) {
      try {
        const channels = await ytsr.search(handle, { type: 'channel', limit: 1 });
        if (channels && channels.length > 0) {
          console.log(`  [OK] ${handle} -> ${channels[0].id}`);
          result[cat].push(channels[0].id);
        } else {
          console.log(`  [FAIL] Could not find channel: ${handle}`);
        }
      } catch (e) {
        console.log(`  [ERROR] ${handle}: ${e.message}`);
      }
    }
  }
  fs.writeFileSync('competitors.json', JSON.stringify(result, null, 2));
  console.log('\nSaved competitors.json!');
}

run();
