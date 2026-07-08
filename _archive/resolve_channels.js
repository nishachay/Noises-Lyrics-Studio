const fs = require('fs');
const Parser = require('rss-parser');
const parser = new Parser();

async function run() {
  const data = JSON.parse(fs.readFileSync('competitors.json', 'utf-8'));
  
  for (const [cat, channels] of Object.entries(data)) {
    console.log(`\n**${cat}**:`);
    for (const channelId of channels) {
      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        console.log(`- ${feed.title}`);
      } catch (e) {
        console.log(`- (Unknown/Dead Channel: ${channelId})`);
      }
    }
  }
}
run();
