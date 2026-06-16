const m = require('youtube-sr');
const yt = m.default || m.YouTube || m;

console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(yt)));
