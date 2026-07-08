const ytsr = require('youtube-sr').default;

const missing = [
  "Soul_lyrics_4u",
  "taeditor1486",
  "jaeguchi",
  "lemonade_esylyr",
  "Musicgenree"
];

async function run() {
  for (const query of missing) {
    try {
      const channels = await ytsr.search(query, { type: 'channel', limit: 1 });
      if (channels && channels.length > 0) {
        console.log(`${query} -> ${channels[0].id}`);
      } else {
        console.log(`${query} -> NOT FOUND`);
      }
    } catch (e) {
      console.log(`${query} -> ERROR: ${e.message}`);
    }
  }
}
run();
