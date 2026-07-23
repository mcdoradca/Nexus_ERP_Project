const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const os = require('os');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const { generateWithRetry } = require('../offer-optimizer/ai.service');

/**
 * Serwis Generujący Zero-Cost Value (E-Booki i Poradniki)
 * Wykorzystuje model Gemini 3.1 Pro do pisania zaawansowanej treści poradnikowej
 * na temat produktu/problemu klienta, a następnie renderuje ją do premium PDF
 * za pomocą Headless Chrome (Puppeteer).
 */
class EbookGeneratorService {
    
    /**
     * Główna funkcja orkiestrująca
     */
    async generateZeroCostValueEbook(productName, targetAudience) {
        console.log(`[EbookGenerator] Startuję proces tworzenia E-Booka dla produktu: ${productName} (Grupa: ${targetAudience})`);
        
        try {
            // 1. Wygenerowanie treści przez LLM
            const htmlContent = await this._generateContentFromAI(productName, targetAudience);
            
            // 2. Renderowanie PDF przez Puppeteer
            const pdfPath = await this._renderPdf(htmlContent, productName);
            
            console.log(`[EbookGenerator] ✅ Sukces! Wygenerowano plik PDF: ${pdfPath}`);
            return pdfPath;
            
        } catch (error) {
            console.error('[EbookGenerator] Błąd podczas tworzenia e-booka:', error.message);
            throw error;
        }
    }

    async _generateContentFromAI(productName, targetAudience) {
        console.log(`[EbookGenerator] Odpytuję Gemini PRO o merytoryczną treść HTML...`);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
        
        const prompt = `
Jesteś wybitnym ekspertem branżowym i copywriterem (Masterclass).
Twoim zadaniem jest napisanie krótkiego, profesjonalnego poradnika (E-Booka), który zostanie dołączony jako darmowy dodatek ("Zero-Cost Value") do produktu: "${productName}".
Grupa docelowa (problem): ${targetAudience}.

Zwróć TYLKO czysty kod HTML (bez znaczników \`\`\`html), zawierający:
1. Elegancką stronę tytułową z głównym nagłówkiem <h1> i podtytułem.
2. Krótki wstęp (dlaczego ten problem występuje).
3. 3-4 kluczowe, merytoryczne porady dla czytelnika (sekcje z <h2>).
4. Subtelne wplecenie, jak używanie prawidłowych produktów (np. takich jak "${productName}") wspiera rozwiązanie problemu.
5. Zakończenie z podziękowaniem.

Użyj stylów CSS w sekcji <style> wewnątrz <head>.
Styling ma być BARDZO ELEGANCJI, premium, z ciemnym eleganckim fontem (np. font-family: 'Helvetica Neue', Arial, sans-serif), subtelnymi cieniami na blokach tekstu, ładnymi marginesami. Strona ma przypominać drogą ulotkę lub e-book z kliniki / agencji premium. 
Tło strony tytułowej powinno mieć delikatny gradient.
Nie używaj zewnętrznych zdjęć (żeby nie zepsuć renderowania bez dostępu do sieci).
Wymuś podział na strony używając "page-break-after: always;" w CSS po stronie tytułowej.
`;

        const response = await generateWithRetry(model, prompt, 3, "Agent_Ebook_Generator");
        let rawHtml = response.response.text();
        
        // Czyszczenie ze znaczników markdown
        rawHtml = rawHtml.replace(/```html/g, '').replace(/```/g, '').trim();
        return rawHtml;
    }

    async _renderPdf(htmlContent, productName) {
        console.log(`[EbookGenerator] Renderowanie HTML do PDF poprzez Puppeteer...`);
        
        // Konfiguracja do środowisk bez UI (CI/CD / Linux)
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Ładowanie wygenerowanego HTML
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        // Tworzenie ścieżki pliku
        const safeName = productName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const fileName = `zero_cost_value_${safeName}_${Date.now()}.pdf`;
        
        // Preferowany folder "uploads" w frontendzie, serwowany statycznie przez express
        const uploadsDir = path.join(__dirname, '../../..', 'frontend', 'public', 'uploads', 'ebooks');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const filePath = path.join(uploadsDir, fileName);
        
        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            }
        });
        
        await browser.close();
        
        return filePath;
    }
}

module.exports = new EbookGeneratorService();
