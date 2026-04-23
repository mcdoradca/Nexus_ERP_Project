const fs = require('fs');
const data = fs.readFileSync('ig.html', 'utf8');

const metaDescMatch = data.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || data.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
console.log("Meta Desc:", metaDescMatch ? metaDescMatch[1] : null);
