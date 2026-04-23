const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Wstrzyknięcie maskowania - usuwa detektory WebDrivera używane przez Cloudflare/Datadome
puppeteer.use(StealthPlugin());

(async () => {
    const targetUrl = 'https://allegro.pl/produkt/naprawczy-szampon-restrukturyzujacy-300-ml-equilibra-tricologica-6fb18e59-d084-4b42-9609-b59d2ba93ff3?offerId=12619447742';
    
    console.log(`[INGESTOR] Uruchamianie czołgu przeglądarkowego (Stealth Mode)...`);
    const browser = await puppeteer.launch({
        headless: true, // Można zmienić na false do łatwego debugowania "na oczy"
        defaultViewport: { width: 1920, height: 1080 },
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Emulowanie prawdziwego User-Agenta z Windowsa 10, by wyglądać jak klient w korpo
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`[INGESTOR] Przechodzenie na Allegro pod wskazany URL...`);
        // Omijanie wczesnych timeoutów na ciężkich, wieloreklamowych stronach (oczekujemy na dom)
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log(`[INGESTOR] Inicjowanie Lazy-Loading'u (Skokowe Auto-Scrollowanie)...`);
        // Wstrzyknięcie skryptu przewijającego by "zmęczyć" loadery zdjęć Allegro i zapisać wyrenderowane źródła IMG
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400; // Skok w pixelach
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    // Jeżeli zescrollowaliśmy na dół (lub przekroczyliśmy mocny bufor 15k pixeli dla nieskonczonych ston)
                    if(totalHeight >= scrollHeight || totalHeight > 15000){
                        clearInterval(timer);
                        resolve();
                    }
                }, 350); // co 350ms płynnie skacze
            });
            // Oczekanie jeszcze chwili na rozpakowanie zdjęć u Dołu
            await new Promise(r => setTimeout(r, 1000));
        });

        console.log(`[INGESTOR] Operacja CLEANUP: Ukrywanie Cookies & Floating Headers...`);
        await page.evaluate(() => {
            // Ukrywanie upierdliwego ciasteczkowego PopUpu ("Zgadzam się" od RODO/Allegro)
            const cookieBanners = document.querySelectorAll('[data-role="accept-consent"], [data-box-name="rodo"], button[data-role="accept-consent"]');
            cookieBanners.forEach(b => {
                 let parent = b.closest('div[style*="z-index"]');
                 if(parent) parent.style.setProperty('display', 'none', 'important');
                 b.style.setProperty('display', 'none', 'important');
            });
            // Ubicie nagłówków pływających na górze (przysłaniających ekran)
            const headers = document.querySelectorAll('header, [data-role="header"], [data-box-name="StickyHeader"]');
            headers.forEach(h => h.style.setProperty('display', 'none', 'important'));
        });

        // Wyrównanie scrolla z powrotem na górę strony, by FullPage zrzut zadziałał gładko w dół
        await page.evaluate(() => window.scrollTo(0, 0));

        console.log(`[INGESTOR] Generowanie Artefaktu #1: Zrzut Ekranu CRO [BEZSTRATNY PNG]...`);
        await page.screenshot({ 
            path: 'test_screenshot.png', 
            fullPage: true 
        });

        console.log(`[INGESTOR] Generowanie Artefaktu #2: Surowy Tekst (Anti-OCR Fail)...`);
        const documentRawText = await page.evaluate(() => document.body.innerText);
        fs.writeFileSync('test_text.txt', documentRawText);

        console.log(`[SUKCES] Potok Przetrwał! Skrypty wyciszono, Pliki zrzucono do folderu korzenia.`);
    } catch (err) {
        console.error(`[AWARIA INGESTORA]: `, err);
    } finally {
        await browser.close();
    }
})();
