const fs = require('fs');
const ytsr = require('youtube-sr').default;

const categories = {
  "Pop": "pop song lyrics",
  "Hip-Hop": "hip hop rap lyrics",
  "Hindi": "bollywood hindi lyrics",
  "DHH": "desi hip hop lyrics",
  "K-Pop": "kpop color coded lyrics"
};

async function run() {
  const data = JSON.parse(fs.readFileSync('competitors.json', 'utf-8'));
  let updated = false;
  
  for (const [cat, query] of Object.entries(categories)) {
    // Check existing
    const active = [];
    const Parser = require('rss-parser');
    const parser = new Parser();
    for (const channelId of data[cat]) {
      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        const latest = feed.items[0];
        if (latest) {
          const daysAgo = Math.floor((Date.now() - new Date(latest.pubDate)) / (1000 * 60 * 60 * 24));
          if (daysAgo < 30) {
            active.push(channelId);
          }
        }
      } catch (e) {}
    }
    
    // Fill up to 5
    if (active.length < 5) {
      console.log(`\nFinding more active channels for ${cat}...`);
      try {
        // Find recent videos to ensure channel activity
        const videos = await ytsr.search(query, { limit: 30, type: 'video' });
        for (const v of videos) {
          if (v.uploadedAt && (v.uploadedAt.includes('hour') || v.uploadedAt.includes('day') || v.uploadedAt.includes('week'))) {
             if (v.channel && v.channel.id && !active.includes(v.channel.id)) {
               active.push(v.channel.id);
               console.log(`  + Added ${v.channel.name} (uploaded ${v.uploadedAt})`);
               updated = true;
             }
          }
          if (active.length >= 5) break;
        }
      } catch (e) {}
    }
    data[cat] = active.slice(0, 5);
  }
  
  if (updated) {
    fs.writeFileSync('competitors.json', JSON.stringify(data, null, 2));
    console.log('\ncompetitors.json updated with active channels only!');
  } else {
    console.log('\nAll good.');
  }
}
run();
