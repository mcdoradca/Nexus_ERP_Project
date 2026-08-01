const axios = require('axios');
const cheerio = require('cheerio');
const agent1Logger = require('../../utils/agent1_logger');

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

    async searchAndExtract(ean, productName, missingFields = []) {
        try {
            agent1Logger.info(`[OSINT] Rozpoczęto poszukiwania. EAN: ${ean}, Produkt: ${productName}, Braki: ${missingFields.join(',')}`);
            
            // Dynamiczne zapytanie
            const terms = [];
            if (missingFields.includes('inci')) terms.push('INCI OR skład OR składniki OR ingredients');
            if (missingFields.includes('country_of_origin')) terms.push('kraj pochodzenia OR wyprodukowano w');
            if (missingFields.includes('brand')) terms.push('marka OR producent');
            if (missingFields.includes('line')) terms.push('linia OR seria');
            
            let queryTerms = '';
            if (terms.length > 0) {
                queryTerms = ` (${terms.join(' OR ')})`;
            }
            
            const searchQuery = `"${ean}" OR "${productName}"${queryTerms}`;
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
            agent1Logger.info(`[OSINT] Wywołano wyszukiwarkę DuckDuckGo: ${searchUrl}`);
            
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
                agent1Logger.warn(`[OSINT] Brak wyników wyszukiwania dla EAN: ${ean}`);
                return "";
            }
            agent1Logger.info(`[OSINT] Znaleziono linki (${links.length}):`, { links });

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
                agent1Logger.info(`[OSINT] Scrapowanie URL: ${link}`);
                try {
                    const pageRes = await axios.get(link, { headers: this.headers, timeout: 8000 });
                    agent1Logger.info(`[OSINT] Odpowiedź HTTP: ${pageRes.status} z URL: ${link}`);
                    const page$ = cheerio.load(pageRes.data);
                    
                    // Usuwamy niepotrzebne tagi (skrypty, style, nawigację, stopki)
                    page$('script, style, nav, footer, header, noscript, iframe').remove();
                    
                    // Wyciągamy czysty tekst, skracając podwójne spacje
                    let text = page$('body').text().replace(/\s+/g, ' ').trim();
                    
                    // Limitujemy tekst do max 5000 znaków na stronę by nie przepełnić tokenów
                    if (text.length > 5000) text = text.substring(0, 5000) + '...';
                    
                    agent1Logger.info(`[OSINT] Pomyślnie wyekstrahowano tekst: ${text.length} znaków z ${link}`);
                    combinedText += `\n\n--- Źródło: ${link} ---\n${text}`;
                } catch (pageErr) {
                    agent1Logger.error(`[OSINT] Błąd scrapowania strony ${link}: ${pageErr.message}`);
                }
            }

            return combinedText.trim();
        } catch (error) {
            agent1Logger.error(`[OSINT] Błąd ogólny scrapera: ${error.message}`, { stack: error.stack });
            return "";
        }
    }
}

module.exports = new OsintScraperService();
