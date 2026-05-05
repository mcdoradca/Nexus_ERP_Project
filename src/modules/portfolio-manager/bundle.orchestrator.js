const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Używamy AiService dla dostępu do Gemini 3.1 Pro Preview
const AiService = require('../offer-optimizer/ai.service');

// Moduł do obróbki graficznej
const sharp = require('sharp');

/**
 * 🤖 BUNDLE ORCHESTRATOR - Sieć Agentów AI
 * Klasa koordynująca pracę 4 niezależnych, wyspecjalizowanych agentów:
 * 1. Graphic Agent (Sharp) - skleja miniatury
 * 2. Trend Agent (Gemini 3.1) - wyszukuje najpopularniejsze frazy i zapytania
 * 3. Copywriter Agent (Gemini 3.1) - pisze opisy uwzględniając raport trendów
 * 4. Compliance Agent (Gemini 3.1) - audytuje pod kątem Allegro 2026
 */
class BundleOrchestrator {
    
    /**
     * Główny dyspozytor orkiestracji (Wypuszczenie psów ze smyczy)
     * @param {string} bundleProductId - ID szkicu zestawu w PIM
     * @param {object} p1 - Pierwszy produkt składowy
     * @param {object} p2 - Drugi produkt składowy
     */
    static async generateGodTierAssets(bundleProductId, p1, p2) {
        console.log(`\n🚀 [Bundle Orchestrator] Inicjacja Sieci Agentów dla Zestawu: ${bundleProductId}`);

        try {
            // [ZADANIE 1] AGENT GRAFICZNY: Połączenie miniatur
            console.log(`   🎨 [Agent Graficzny] Kompilowanie głównej miniatury zestawu...`);
            const mergedImageUrl = await this._graphicAgentMergeImages(p1, p2);
            
            // [ZADANIE 2] AGENT TRENDÓW: Analiza aktualnych wyszukiwań i intencji zakupowych
            console.log(`   🕵️ [Agent Trendów] Skanowanie bieżących zapytań (SEO/Liquid Variables)...`);
            const seoTrends = await this._trendAgentGetSeoKeywords(p1, p2);

            // [ZADANIE 3] AGENT COPYWRITER: Generowanie połączonego opisu 
            console.log(`   ✍️ [Agent Copywriter] Tworzenie marketingowego opisu na bazie Trendów...`);
            const draftDescription = await this._copywriterAgentGenerateDescription(p1, p2, seoTrends);

            // [ZADANIE 4] AGENT COMPLIANCE: Audyt zgodności
            console.log(`   👮 [Agent Compliance] Audytowanie opisu zgodnie z regulaminem Allegro 2026...`);
            const finalDescription = await this._complianceAgentAudit(draftDescription);

            // ZAPIS DO BAZY PIM
            const finalProduct = await prisma.product.update({
                where: { id: bundleProductId },
                data: {
                    imageUrl: mergedImageUrl,
                    descriptionHtml: finalDescription,
                    status: "Szkic Gotowy (AI)"
                }
            });

            console.log(`✅ [Bundle Orchestrator] Zakończono sukcesem. Wirtualna półka zbudowana w 100% przez AI.`);
            
            // Wymuszenie odświeżenia UI na froncie
            const EventBus = require('../../core/EventBus');
            EventBus.publish('PRODUCT_DATA_UPDATED', { product: finalProduct, source: 'AI_ORCHESTRATOR' });
            
            return true;

        } catch (error) {
            console.error(`❌ [Bundle Orchestrator] Błąd krytyczny sieci agentów:`, error);
            // Zapiszmy błąd w PIM, by człowiek widział, co zawiodło
            const errorProduct = await prisma.product.update({
                where: { id: bundleProductId },
                data: {
                    status: "Błąd Agenta AI",
                    descriptionHtml: `<div style="color:red; padding:20px; border:1px solid red; background:#fff5f5;"><b>Błąd generacji AI:</b><br>${error.message}</div>`
                }
            });
            
            const EventBus = require('../../core/EventBus');
            EventBus.publish('PRODUCT_DATA_UPDATED', { product: errorProduct, source: 'AI_ORCHESTRATOR_ERROR' });
            
            return false;
        }
    }

    /**
     * 🎨 AGENT GRAFICZNY: 
     * Używa paczki Sharp, by bezkosztowo (bez API) nałożyć dwa packshoty Allegro (mają już białe tła) 
     * w trybie "multiply" na jedną czystą planszę 1080x1080.
     */
    static async _graphicAgentMergeImages(p1, p2) {
        // Ponieważ nie znamy fizycznych ścieżek URL (BaseLinker je trzyma),
        // założymy, że PIM ma linki do głównych zdjęć. Jeśli brak zdjęć, zwracamy null.
        const p1Img = p1.imageUrl || (p1.images && p1.images[0]);
        const p2Img = p2.imageUrl || (p2.images && p2.images[0]);

        if (!p1Img && !p2Img) {
            console.log('   ⚠️ [Agent Graficzny] Brak zdjęć źródłowych.');
            return null;
        }

        try {
            // Pobieranie do bufora
            const fetchImage = async (url) => {
                if(!url) return null;
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                return Buffer.from(response.data, 'binary');
            };

            const [img1Buffer, img2Buffer] = await Promise.all([
                fetchImage(p1Img || p2Img), 
                fetchImage(p2Img || p1Img)
            ]);

            // Zmniejszamy zdjęcia, aby zmieściły się obok siebie (szerokość 450px każde)
            const resized1 = await sharp(img1Buffer).resize({ width: 450, height: 800, fit: 'inside' }).toBuffer();
            const resized2 = await sharp(img2Buffer).resize({ width: 450, height: 800, fit: 'inside' }).toBuffer();

            // Tworzymy planszę 1080x1080, białe tło (Wymóg Allegro)
            const compositeBuffer = await sharp({
                create: { width: 1080, height: 1080, channels: 3, background: { r: 255, g: 255, b: 255 } }
            })
            .composite([
                // Z uwagi na to, że zdjęcia Allegro mają już białe tło, blend: 'multiply' sprawi, 
                // że tła się "połączą" w jedną idealną biel, nie nadpisując się kwadratami!
                { input: resized1, left: 50, top: 140, blend: 'multiply' },
                { input: resized2, left: 550, top: 140, blend: 'multiply' }
            ])
            .jpeg({ quality: 90 })
            .toBuffer();

            // Zapis do fizycznego pliku na serwerze (aby FrontEnd mógł go wyświetlić)
            const fileName = `bundle_${crypto.randomBytes(6).toString('hex')}.jpg`;
            const publicPath = path.join(__dirname, '../../../public/uploads', fileName);
            
            // Upewnijmy się, że folder istnieje
            if (!fs.existsSync(path.dirname(publicPath))) {
                fs.mkdirSync(path.dirname(publicPath), { recursive: true });
            }

            fs.writeFileSync(publicPath, compositeBuffer);
            console.log(`   🎨 [Agent Graficzny] Utworzono miniaturę zestawu: /uploads/${fileName}`);
            
            return `/uploads/${fileName}`;

        } catch (e) {
            console.error('   ⚠️ [Agent Graficzny] Nie udało się skleić zdjęć:', e.message);
            return null; // Zestaw pozostanie bez zdjęcia, do uzupełnienia ręcznie
        }
    }

    /**
     * 🕵️ AGENT TRENDÓW (SEO Zwiadowca):
     * Analizuje produkty i generuje najgorętsze zapytania klientów (intencje), 
     * aby ułatwić pozycjonowanie na pierwszej karcie Allegro.
     */
    static async _trendAgentGetSeoKeywords(p1, p2) {
        const prompt = `
Jesteś Ekspertem SEO E-commerce (Data Scientist) na Polskę w 2026 r.
Analizujesz zestaw dwóch produktów:
1. ${p1.name}
2. ${p2.name}

Wypisz 5 najczęściej wpisywanych w wyszukiwarkę Allegro długich fraz kluczowych (long-tail keywords) lub pytań, które wpisują klienci szukający rozwiązania oferowanego przez te 2 produkty łącznie (tzw. Liquid Variables).
Zwróć wynik jako połączone przecinkami frazy, bez zbędnych słów. TYLKO FRAZY.
`;
        try {
            const aiResponse = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
                { contents: [{ parts: [{ text: prompt }] }] },
                { params: { key: process.env.GEMINI_API_KEY }, headers: { 'Content-Type': 'application/json' } }
            );
            let seoKeywords = aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log(`      [Zwiadowca donosi]: ${seoKeywords.trim()}`);
            return seoKeywords.trim();
        } catch (error) {
            console.error('   ⚠️ [Agent Trendów] Błąd sondowania:', error.message);
            return 'zestaw promocyjny, okazja, polecane produkty';
        }
    }

    /**
     * ✍️ AGENT COPYWRITER: 
     * Czyta dwa opisy, raport od Agenta Trendów i pisze zgrabny tekst łączący.
     */
    static async _copywriterAgentGenerateDescription(p1, p2, seoTrends) {
        const prompt = `
Jesteś wybitnym e-commerce copywriterem. Tworzysz opisy na platformę Allegro.
Otrzymałeś dwa osobne produkty, które sprzedajemy RAZEM w ZESTAWIE. 

Produkt A:
Nazwa: ${p1.name}
Opis: ${p1.descriptionHtml || 'Brak'}

Produkt B:
Nazwa: ${p2.name}
Opis: ${p2.descriptionHtml || 'Brak'}

Oto wytyczne od Agenta SEO na temat intencji zakupowych klientów dla tego zestawu:
TRENDY WYSZUKIWANIA: [${seoTrends}]

Twoje zadanie to wygenerować CZYSTY KOD HTML DLA JEDNEJ SEKCJI OPISU ALLEGRO.
1. Napisz chwytliwy akapit (HOOK) uzasadniający, dlaczego te dwa produkty idealnie ze sobą współgrają. Wpleć w Hook co najmniej 2 frazy z podanych TRENDÓW WYSZUKIWANIA w sposób naturalny i perswazyjny.
2. Poniżej wymień listę najważniejszych cech (w punktach <ul>) dla Produktu A i Produktu B.
3. Zachowaj minimalizm i skup się na korzyściach wynikających z ZESTAWU.
Zwróć TYLKO kod HTML, bez tagów <html> czy <body>, bez formatowania \`\`\`html.
`;
        
        try {
            // Wykorzystujemy potężnego Gemini 3.1 Pro Preview
            const aiResponse = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
                { contents: [{ parts: [{ text: prompt }] }] },
                { params: { key: process.env.GEMINI_API_KEY }, headers: { 'Content-Type': 'application/json' } }
            );

            let html = aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            html = html.replace(/\`\`\`html/g, '').replace(/\`\`\`/g, '').trim();
            return html;

        } catch (error) {
            console.error('   ⚠️ [Agent Copywriter] Błąd generacji:', error.message);
            return `<p>Zestaw: ${p1.name} + ${p2.name}</p>`;
        }
    }

    /**
     * 👮 AGENT COMPLIANCE: 
     * Audytuje HTML pod kątem restrykcyjnego regulaminu Allegro 2026.
     */
    static async _complianceAgentAudit(draftHtml) {
        const prompt = `
Jesteś rygorystycznym audytorem Allegro 2026. Otrzymujesz kod HTML opisu.
W Allegro 2026 dozwolone tagi w opisie to TYLKO: h1, h2, p, ul, ol, li, b.
Żadnych kolorów, żadnych stylów (style="..."), żadnych linków (<a>).
Zabronione słowa to: "najlepszy", "najtaniej", "gwarancja na zawsze".

Przeanalizuj poniższy kod HTML, usuń zakazane tagi i style, oczyść tekst ze spamowych słów.
Poprawiony kod zwróć bez żadnego komentarza z Twojej strony, sam CZYSTY KOD HTML.

Oto kod:
${draftHtml}
`;

        try {
            const aiResponse = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
                { contents: [{ parts: [{ text: prompt }] }] },
                { params: { key: process.env.GEMINI_API_KEY }, headers: { 'Content-Type': 'application/json' } }
            );

            let cleanHtml = aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || draftHtml;
            cleanHtml = cleanHtml.replace(/\`\`\`html/g, '').replace(/\`\`\`/g, '').trim();
            return cleanHtml;

        } catch (error) {
            console.error('   ⚠️ [Agent Compliance] Błąd autoryzacji tekstu:', error.message);
            return draftHtml; // Fallback
        }
    }
}

module.exports = BundleOrchestrator;
