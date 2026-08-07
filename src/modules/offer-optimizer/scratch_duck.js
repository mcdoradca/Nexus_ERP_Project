const axios = require('axios');
const fs = require('fs');

async function test() {
    const searchUrl = `https://lite.duckduckgo.com/lite/`;
    const searchHeaders = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded' 
    };
    try {
        const res = await axios.post(searchUrl, `q=8015194502522`, { headers: searchHeaders });
        fs.writeFileSync('duck.html', res.data);
        console.log("OK HTML");
    } catch(e) { console.error("BLAD:", e); }
}
test();
