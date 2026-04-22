const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Wyciąga czysty tekst oferty oraz listę oryginalnych URLi zdjęć (CDN Allegro) z podanej aukcji.
 * Zwraca obiekt: { url, title, textContent, images: [url1, url2...] }
 */
async function scrapeAllegroOffer(url) {
    console.log(`[AllegroScraper] Rozpoczynam headless scraping aukcji: ${url}`);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Optymalizacja ładowania - blokujemy CSS/Fonty by przyspieszyć
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['stylesheet', 'font', 'media'].includes(req.resourceType())){
                req.abort();
            } else {
                req.continue();
            }
        });

        // Wchodzimy na stronę
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // 1. Ekstrakcja Tytułu
        let title = "";
        try {
            title = await page.title();
        } catch(e) {}
        
        // 2. Ekstrakcja Tekstu
        const textContent = await page.evaluate(() => document.body.innerText || "");

        // 3. Ekstrakcja Linków do zdjęć (Najlepsza możliwa jakość - /original/)
        // Szukamy w całym HTMLu żeby ominąć lazy-loading i skrypty SPA Allegro
        const html = await page.content();
        
        // Regex znajdujący wszystkie domeny a.allegroimg.com
        // Allegro używa formatu: https://a.allegroimg.com/original/11ebc2/3a4b5c6d...
        const regex = /https:\/\/a\.allegroimg\.com\/(original|s1024)\/[a-zA-Z0-9\-\/]+\.(jpg|jpeg|png|webp)/g;
        
        const foundUrls = html.match(regex) || [];
        
        // Filtracja unikalnych i zamiana ew. s1024 na original
        const uniqueUrlsSet = new Set();
        foundUrls.forEach(imgUrl => {
            const originalQuality = imgUrl.replace('/s1024/', '/original/');
            uniqueUrlsSet.add(originalQuality);
        });
        
        // Odrzucamy ikony i miniatury techniczne Allegro (tylko te co maja odpowiedni folder)
        // Zazwyczaj zdjęcia przedmiotu mają specyficzny ciąg znaków, ale my ufamy że regex złapał tylko zdjęcia aukcyjne.
        // Wybieramy max pierwsze 15 zdjęć żeby nie spalić LLMa.
        const images = Array.from(uniqueUrlsSet).slice(0, 15);

        console.log(`[AllegroScraper] Znaleziono ${images.length} unikalnych oryginalnych zdjęć z CDN.`);

        return {
            url,
            title,
            textContent,
            images
        };
    } catch (error) {
        console.error("[AllegroScraper] Błąd podczas scrapowania:", error.message);
        throw new Error("Nie udało się pobrać danych z tej aukcji Allegro. Upewnij się, że link jest prawidłowy.");
    } finally {
        await browser.close();
    }
}

module.exports = {
    scrapeAllegroOffer
};
