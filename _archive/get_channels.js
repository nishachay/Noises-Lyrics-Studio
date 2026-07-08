const ytsr = require('youtube-sr').default;

const handles = [
  "vibemusic.",
  "7clouds",
  "itsUniqueVibes",
  "VibeBird.",
  "IndieIndiaMusic",
  "Soul_lyrics_4u",
  "taeditor1486",
  "jaeguchi",
  "lemonade_esylyr",
  "Musicgenree"
];

async function run() {
  for (const h of handles) {
    try {
      const channel = await ytsr.getChannel(`https://www.youtube.com/@${h}`);
      console.log(`@${h} -> ${channel.id}`);
    } catch (e) {
      console.log(`@${h} -> ERROR: ${e.message}`);
    }
  }
}
run();
