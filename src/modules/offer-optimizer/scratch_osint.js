const osintScraper = require('./osint.scraper.service');

async function test() {
    const res = await osintScraper.searchAndExtract('8015194502522', 'Test', ['inci']);
    console.log("WYNIK OSINT:", res ? "ZNALEZIONO DANE" : "PUSTE (AWARIA)");
}
test();
