const fs = require('fs');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Brak GEMINI_API_KEY w .env");
    process.exit(1);
}

const prompt = `Jesteś ekspertem Masterclass ds. E-commerce, Performance Marketingu oraz zautomatyzowanych systemów ERP. 
Twoim zadaniem jest przeszukanie internetu (przy użyciu Google Search Grounding), ze szczególnym uwzględnieniem polskiego rynku e-commerce, w celu zgromadzenia najnowszych, najbardziej szczegółowych informacji na temat ekosystemu reklamowego Allegro (Allegro Ads).

Zbierz dane niezbędne do zaprojektowania w pełni autonomicznego modułu AI (Masterclass AI Agent) w systemie Nexus ERP, który będzie zarządzał kampaniami na Allegro.

W swoim raporcie zawrzyj:
1. **Analizę wszystkich form promocji na Allegro (2024-2026):**
   - Oferty sponsorowane (Allegro Ads), Reklama graficzna, Ads Express.
   - Monety Allegro, Kupony rabatowe, Strefa Okazji, oznaczenia typu "Hit", "Nowość".
   - Jak dokładnie działają, jakie są modele rozliczeń (CPC, CPM, CPA) i algorytmy przydzielania widoczności.
2. **Architektura Danych:** 
   - Jakie konkretnie metryki i dane z Allegro musimy pozyskiwać (np. CTR, ROI, ROAS, CPC, udział w wyświetleniach, dane konkurencji), aby AI mogło skutecznie analizować kampanie.
3. **Logika i Strategie AI (Masterclass Level):**
   - Jakie algorytmy lub strategie (np. Reinforcement Learning, predykcja popytu) powinien wykorzystywać nasz Agent AI do decydowania, KTÓRY produkt promować JAKĄ metodą.
   - Zasady zarządzania budżetem i bidowania (ustalania stawek) w czasie rzeczywistym.
4. **Monitoring i Rozliczanie:**
   - Sposoby na obliczanie rzeczywistej rentowności (uwzględniając ukryte koszty, prowizje Allegro, koszt kliknięć vs. koszt produkcji).

Format: Profesjonalny dokument Markdown. Raport ma stanowić fundament analityczno-techniczny pod budowę naszego własnego modułu "Nexus Allegro Ads AI Masterclass".`;

async function runResearchAgent() {
    console.log("🚀 Agent badawczy (Runda 2) rusza do analizy ekosystemu Allegro Ads...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                tools: [{ googleSearch: {} }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 8192
                }
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("Błąd API Gemini:", data.error);
            // Fallback to gemini-2.5-pro if 3.1 is not available to this API key
            if(data.error.code === 404) {
                 console.log("Model 3.1 niedostępny dla tego klucza, używam 2.5-pro...");
                 return fallbackTo25();
            }
            return;
        }

        const report = data.candidates[0].content.parts[0].text;
        
        let groundingData = "";
        if (data.candidates[0].groundingMetadata && data.candidates[0].groundingMetadata.searchEntryPoint) {
            groundingData = "\n\n---\n*Raport wygenerowany przy wsparciu Google Search Grounding.*";
        }

        fs.writeFileSync('allegro_ads_research_report.md', report + groundingData, 'utf-8');
        console.log("✅ Raport Allegro zapisany w 'allegro_ads_research_report.md'");
    } catch (err) {
        console.error("Krytyczny błąd Agenta:", err);
    }
}

async function fallbackTo25() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ googleSearch: {} }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
            })
        });
        const data = await response.json();
        const report = data.candidates[0].content.parts[0].text;
        fs.writeFileSync('allegro_ads_research_report.md', report, 'utf-8');
        console.log("✅ Raport Allegro zapisany (Fallback 2.5) w 'allegro_ads_research_report.md'");
    } catch(e) { console.error(e); }
}

runResearchAgent();
