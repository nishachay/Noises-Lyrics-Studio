const fs = require('fs');
const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    item: [
      ['media:group', 'mediaGroup']
    ]
  }
});

async function run() {
  const data = JSON.parse(fs.readFileSync('competitors.json', 'utf-8'));
  for (const [cat, channels] of Object.entries(data)) {
    console.log(`\n=== ${cat} ===`);
    for (let i = 0; i < channels.length; i++) {
      const channelId = channels[i];
      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        const latest = feed.items[0];
        if (!latest) {
          console.log(`[X] ${channelId} (${feed.title}): NO VIDEOS`);
          continue;
        }
        const pubDate = new Date(latest.pubDate);
        const daysAgo = Math.floor((Date.now() - pubDate) / (1000 * 60 * 60 * 24));
        const viewsMatch = latest.mediaGroup && latest.mediaGroup['media:community'] && latest.mediaGroup['media:community'][0]['media:statistics'] ? latest.mediaGroup['media:community'][0]['media:statistics'][0]['$']['views'] : 'Unknown';
        
        console.log(`[${daysAgo < 30 ? 'OK' : 'OLD'}] ${feed.title} | Latest upload: ${daysAgo} days ago | Views: ${viewsMatch}`);
      } catch (e) {
        console.log(`[!] ${channelId} ERROR: ${e.message}`);
      }
    }
  }
}
run();
