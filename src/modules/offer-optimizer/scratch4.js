const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('duck.html', 'utf8');
const $ = cheerio.load(html);
$('script, style, nav, footer, header').remove();
console.log($('body').text().replace(/\s+/g, ' ').trim().substring(0, 1000));
