const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'docs', 'LISTMODELS_SNAPSHOT.md');
let data = fs.readFileSync(file);
if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) {
    data = data.slice(3);
}
fs.writeFileSync(file, data);
console.log('BOM removed');
