const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

const getSeoOld = `    const youtubeTitle       = \`\${songArtist} - \${songTitle} (Lyrics\${hasTranslation ? ' & English Translation' : ''})\`;
    const lyricLines         = rawLyrics.map(l => l.text).join('\\n');
    const tags               = \`#\${songArtist.replace(/\\s+/g,'')} #\${songTitle.replace(/\\s+/g,'')} #Lyrics #NoisesMusic\`;
    const youtubeDescription = \`🎵 \${songArtist} - \${songTitle} (Lyrics Video)\\n\\n\${decodeURIComponent(videoUrl)}\\n\\n\${lyricLines}\\n\\n\${tags}\`;

    send({ status: 'completed', progress: 100, fileId: \`\${outputId}.mp4\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, youtubeTitle, youtubeDescription });`;

const getSeoNew = `    const youtubeTitle       = \`\${songArtist} - \${songTitle} (Lyrics\${hasTranslation ? ' & English Translation' : ''})\`;
    const lyricLines         = rawLyrics.map(l => l.text).join('\\n');
    
    // Auto-generate free SEO Tags using YouTube's internal autocomplete API
    let seoKeywords = [];
    try {
      const q = encodeURIComponent(\`\${songArtist} \${songTitle}\`);
      const { data } = await axios.get(\`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=\${q}\`);
      if (data && data[1] && data[1].length > 0) {
        seoKeywords = data[1];
      }
    } catch (e) {
      console.log('[SEO] Could not fetch autocomplete tags:', e.message);
    }
    
    const tags               = \`#\${songArtist.replace(/\\s+/g,'')} #\${songTitle.replace(/\\s+/g,'')} #Lyrics #NoisesMusic\`;
    const seoBlock           = seoKeywords.length > 0 ? \`\\n\\nSearch terms:\\n\${seoKeywords.join(', ')}\` : '';
    const youtubeDescription = \`🎵 \${songArtist} - \${songTitle} (Lyrics Video)\\n\\n\${decodeURIComponent(videoUrl)}\\n\\n\${lyricLines}\\n\\n\${tags}\${seoBlock}\`;

    send({ status: 'completed', progress: 100, fileId: \`\${outputId}.mp4\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, youtubeTitle, youtubeDescription });`;

server = server.replace(getSeoOld, getSeoNew);
fs.writeFileSync('server.js', server);
