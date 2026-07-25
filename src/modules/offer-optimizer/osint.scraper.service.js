const axios = require('axios');
const cheerio = require('cheerio');
const winston = require('winston');

class OsintScraperService {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        };
        this.preferredDomains = [
            'hebe.pl',
            'notino.pl',
            'natura.pl',
            'empik.com',
            'superpharm.pl',
            'rossmann.pl',
            'douglas.pl',
            'sephora.pl'
        ];
    }

    async searchAndExtract(ean, productName) {
        try {
            console.log(`[OSINT Scraper] Rozpoczynam poszukiwania dla EAN: ${ean}, Produkt: ${productName}`);
            
            // Wyszukiwanie przez DuckDuckGo HTML (nie wymaga JS)
            const searchQuery = `"${ean}" OR "${productName}"`;
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
            
            const searchResponse = await axios.get(searchUrl, { headers: this.headers, timeout: 10000 });
            const $ = cheerio.load(searchResponse.data);
            
            let links = [];
            $('.result__url').each((i, el) => {
                const url = $(el).attr('href');
                if (url && url.startsWith('//')) {
                    // Czasami DuckDuckGo zwraca proxy linki, wyciągnijmy oryginalny url
                    const decodedUrl = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '');
                    if (decodedUrl && decodedUrl.startsWith('http')) {
                        links.push(decodedUrl);
                    }
                }
            });

            if (links.length === 0) {
                console.log(`[OSINT Scraper] Brak wyników wyszukiwania.`);
                return "";
            }

            // Sortowanie linków według priorytetów (najpierw znane drogerie i potencjalni producenci)
            links.sort((a, b) => {
                const aIsPreferred = this.preferredDomains.some(d => a.includes(d));
                const bIsPreferred = this.preferredDomains.some(d => b.includes(d));
                if (aIsPreferred && !bIsPreferred) return -1;
                if (!aIsPreferred && bIsPreferred) return 1;
                return 0;
            });

            // Pobieramy zawartość maksymalnie z 3 topowych stron
            const topLinks = links.slice(0, 3);
            let combinedText = '';

            for (const link of topLinks) {
                console.log(`[OSINT Scraper] Pobieranie zawartości z: ${link}`);
                try {
                    const pageRes = await axios.get(link, { headers: this.headers, timeout: 8000 });
                    const page$ = cheerio.load(pageRes.data);
                    
                    // Usuwamy niepotrzebne tagi (skrypty, style, nawigację, stopki)
                    page$('script, style, nav, footer, header, noscript, iframe').remove();
                    
                    // Wyciągamy czysty tekst, skracając podwójne spacje
                    let text = page$('body').text().replace(/\s+/g, ' ').trim();
                    
                    // Limitujemy tekst do max 5000 znaków na stronę by nie przepełnić tokenów
                    if (text.length > 5000) text = text.substring(0, 5000) + '...';
                    
                    combinedText += `\\n\\n--- Źródło: ${link} ---\\n${text}`;
                } catch (pageErr) {
                    console.log(`[OSINT Scraper] Błąd pobierania strony ${link}: ${pageErr.message}`);
                }
            }

            return combinedText.trim();
        } catch (error) {
            console.error(`[OSINT Scraper] Błąd ogólny scrapera:`, error.message);
            return "";
        }
    }
}

module.exports = new OsintScraperService();
