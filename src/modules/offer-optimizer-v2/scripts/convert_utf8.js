const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'docs', 'LISTMODELS_SNAPSHOT.md');
const content = fs.readFileSync(filePath, 'utf16le');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Converted to utf8 without BOM');
