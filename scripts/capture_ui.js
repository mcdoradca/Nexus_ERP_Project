const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../cv_assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

(async () => {
  let browser;
  try {
    console.log('Uruchamiam przeglądarkę (Puppeteer)...');
    browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    const page = await browser.newPage();
    console.log('Łączę się z lokalną instancją Nexus ERP (http://localhost:5173)...');
    
    // Attempt to navigate to the local frontend
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 15000 });
    
    console.log('Logowanie...');
    // Log in if we are on the login page
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await page.type('input[type="email"]', 'admin@n-e-s.it');
      await page.type('input[type="password"]', '1v822x3vSM');
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    }

    console.log('Wykonuję nagranie/zrzut dla Modułu 1 (EAN Input)...');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'ean_ui.png'), fullPage: false });

    console.log('Nawigacja do modułu analityki Sentinel...');
    // Assuming there's a link or button for Sentinel, we try to click it or just take another shot if we can't find it.
    // Since we don't know the exact DOM, we will try to find a button with text "Sentinel" or similar.
    // For now, let's just take a second screenshot slightly later or after some interaction.
    try {
      const sentinelLinks = await page.$x('//button[contains(text(), "Sentinel")] | //a[contains(text(), "Sentinel")] | //div[contains(text(), "Analityka")]');
      if (sentinelLinks.length > 0) {
        await sentinelLinks[0].click();
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.log('Nie znaleziono wprost przycisku Sentinel, wykonuję zrzut z aktualnego widoku.');
    }
    
    await page.screenshot({ path: path.join(ASSETS_DIR, 'sentinel_ui.png'), fullPage: false });

    console.log('Pomyślnie zapisano materiały UI do ./cv_assets/');
    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error('\n[BŁĄD KRYTYCZNY] Procedura nagrywania GUI nie powiodła się.');
    console.error('Szczegóły błędu:', error.message);
    console.error('\n=> Uruchom PROCEDURĘ RATUNKOWĄ.\n');
    if (browser) await browser.close();
    process.exit(1);
  }
})();
