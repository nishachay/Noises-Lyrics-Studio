const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const ytmusic = new YTMusic();

async function test() {
  await ytmusic.initialize();
  
  try {
    const pl = await ytmusic.getPlaylist('PL4fGSI1pLjvn_E7UqBvA8p-7fK_1uD-8_'); // Official US Top Music Videos
    if (pl && pl.length > 0) {
      console.log(`Playlist array: ${pl.length} videos`);
      console.log(pl.slice(0, 5).map(v => `${v.name} by ${v.artist.name}`));
    } else {
      console.log(Object.keys(pl));
    }
  } catch (e) { console.error('failed PL4fGSI1pLjvn_E7UqBvA8p-7fK_1uD-8_', e.message); }
  
  try {
    const pl2 = await ytmusic.getPlaylist('PL4fGSI1pLjvnwILR2tJpEAhxY6H2h28B6'); // Top 100 Songs Global?
    if (pl2 && pl2.length > 0) {
      console.log(`Playlist array 2: ${pl2.length} videos`);
    }
  } catch (e) { console.error('failed PL4fGSI1pLjvnwILR2tJpEAhxY6H2h28B6', e.message); }
}

test();
