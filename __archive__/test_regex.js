const fs = require('fs');
const data = fs.readFileSync('tiktok.html', 'utf8');

const followerMatch = data.match(/"followerCount":\s*(\d+)/i);
const nameMatch = data.match(/"nickname":\s*"([^"]+)"/i);
const bioMatch = data.match(/"signature":\s*"([^"]+)"/i);

console.log("Name:", nameMatch ? nameMatch[1] : null);
console.log("Followers:", followerMatch ? followerMatch[1] : null);
console.log("Bio:", bioMatch ? bioMatch[1] : null);
