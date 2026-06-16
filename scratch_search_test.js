const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const ytmusic = new YTMusic();

async function test() {
  await ytmusic.initialize();
  try {
    const songs = await ytmusic.search('never do Olivia Rodrigo');
    console.log(songs.slice(0, 5).map(s => `${s.name} by ${s.artist.name} (${s.type})`));
  } catch (e) { console.error('failed', e.message); }
}

test();
