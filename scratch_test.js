const YTMusic = require('ytmusic-api').default || require('ytmusic-api');
const ytmusic = new YTMusic();

async function test() {
  await ytmusic.initialize();
  
  const songs = await ytmusic.searchSongs('latest desi hip hop rap hits 2024');
  console.log('DHH Hits:');
  songs.slice(0, 5).forEach(s => console.log(`${s.name} by ${s.artists.map(a => a.name).join(', ')}`));

  const kpop = await ytmusic.searchSongs('trending k-pop hits 2024');
  console.log('\nK-Pop Hits:');
  kpop.slice(0, 5).forEach(s => console.log(`${s.name} by ${s.artists.map(a => a.name).join(', ')}`));
}
test();
