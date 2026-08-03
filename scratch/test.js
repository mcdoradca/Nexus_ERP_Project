const axios = require('axios');
const cheerio = require('cheerio');
axios.post('https://lite.duckduckgo.com/lite/', 'q=test', {headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0'}})
.then(r => {
    const $ = cheerio.load(r.data);
    let links = [];
    $('.result-url').each((i, el) => links.push($(el).attr('href')));
    if(links.length === 0) {
        $('a.result-snippet').each((i, el) => links.push($(el).attr('href')));
    }
    if(links.length === 0) {
        $('a').each((i, el) => {
            if($(el).attr('href')?.startsWith('http')) links.push($(el).attr('href'));
        });
    }
    console.log(links.slice(0, 5));
});
