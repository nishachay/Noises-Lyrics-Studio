const fs = require('fs');
let file = fs.readFileSync('server.js', 'utf8');

const oldStr = `    const tags               = \`#\${songArtist.replace(/\\s+/g,'')} #\${songTitle.replace(/\\s+/g,'')} #Lyrics #NoisesMusic\`;
    const seoBlock           = seoKeywords.length > 0 ? \`\\n\\nSearch terms:\\n\${seoKeywords.join(', ')}\` : '';
    const youtubeDescription = \`🎵 \${songArtist} - \${songTitle} (Lyrics Video)\\n\\n\${decodeURIComponent(videoUrl)}\\n\\n\${lyricLines}\\n\\n\${tags}\${seoBlock}\`;

    send({ status: 'completed', progress: 100, fileId: \`\${outputId}.mp4\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, metadataId: \`\${outputId}_metadata.txt\`, youtubeTitle, youtubeDescription });`;

const newStr = `    const tags               = \`#\${songArtist.replace(/\\s+/g,'')} #\${songTitle.replace(/\\s+/g,'')} #Lyrics #NoisesMusic\`;
    const seoBlock           = seoKeywords.length > 0 ? \`\\n\\nSearch terms:\\n\${seoKeywords.join(', ')}\` : '';
    const youtubeDescription = \`🎵 \${songArtist} - \${songTitle} (Lyrics Video)\\n\\n\${decodeURIComponent(videoUrl)}\\n\\n\${lyricLines}\\n\\n\${tags}\${seoBlock}\`;
    
    // Create a pure comma-separated tags string for the YouTube Tags box
    const fallbackTags = \`\${songArtist}, \${songTitle}, Lyrics, Pop, Music\`;
    const youtubeTags = seoKeywords.length > 0 ? seoKeywords.join(', ') + \`, \${fallbackTags}\` : fallbackTags;

    send({ status: 'completed', progress: 100, fileId: \`\${outputId}.mp4\`, thumbnailId: \`\${outputId}_thumbnail.jpg\`, youtubeTitle, youtubeDescription, youtubeTags });`;

file = file.replace(oldStr, newStr);
fs.writeFileSync('server.js', file);
console.log('patched server.js');
