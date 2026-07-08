const fs = require('fs');
const Parser = require('rss-parser');
const parser = new Parser();

async function run() {
  const file = 'e:/noises lyric/competitors.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  
  let removedCount = 0;
  
  for (const cat in data) {
    const channels = data[cat];
    const validChannels = [];
    
    for (const channelId of channels) {
      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        let shortsCount = 0;
        let totalCount = feed.items.length;
        
        feed.items.forEach(item => {
          const title = item.title.toLowerCase();
          // Shorts often have #shorts in the title
          if (title.includes('#shorts') || title.includes('#short')) {
            shortsCount++;
          }
        });
        
        // If more than 60% of recent videos are shorts, or if total videos is 0, we flag it
        if (totalCount > 0 && (shortsCount / totalCount) >= 0.6) {
          console.log(`[REMOVED] ${feed.title} (${channelId}) - Mostly Shorts (${shortsCount}/${totalCount})`);
          removedCount++;
        } else {
          validChannels.push(channelId);
        }
      } catch (e) {
        console.log(`[REMOVED] Dead/Unknown Channel: ${channelId}`);
        // Remove dead channels too
        removedCount++;
      }
    }
    data[cat] = validChannels;
  }
  
  if (removedCount > 0) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`\nSuccessfully removed ${removedCount} unwanted/shorts channels!`);
  } else {
    console.log('\nNo shorts-heavy channels found.');
  }
}

run();
