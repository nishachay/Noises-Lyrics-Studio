const YTMusic = require('ytmusic-api').default;

const missing = [
  "Soul_lyrics_4u",
  "taeditor1486",
  "jaeguchi",
  "lemonade_esylyr",
  "Musicgenree"
];

async function run() {
  const ytmusic = new YTMusic();
  await ytmusic.initialize();

  for (const name of missing) {
    try {
      const results = await ytmusic.search(name, "artist"); // Or "channel" if ytmusic supports it, though lyrics channels might not show as artists.
      if (results && results.length > 0) {
        console.log(`@${name} -> ${results[0].artistId}`);
      } else {
        const anyResults = await ytmusic.search(name);
        let found = null;
        for (const item of anyResults) {
          if (item.artist && item.artist.artistId) {
            found = item.artist.artistId;
            break;
          }
        }
        console.log(`@${name} -> ${found}`);
      }
    } catch (e) {
      console.log(`@${name} -> ERROR`);
    }
  }
}
run();
