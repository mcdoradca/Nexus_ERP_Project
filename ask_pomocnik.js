const fs = require('fs');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Brak GEMINI_API_KEY w .env");
    process.exit(1);
}

const prompt = `Jesteś głównym Inżynierem ds. Badań i Backtestingu dla systemów e-commerce (ze szczególnym uwzględnieniem Allegro w 2026 roku). Tworzymy profesjonalny system do Backtestingu naszego algorytmu licytującego Allegro Ads (Reinforcement Learning), by nie musieć opierać się na wymyślonych atrapach (Mockach z Math.random) na środowisku Sandbox.

Twoim zadaniem jest użycie Google Search Grounding, aby znaleźć twarde fakty techniczne:

1. **Dane Historyczne z Allegro:** Jakie DOKŁADNE endpointy Allegro REST API pozwalają na pobranie potężnych paczek danych historycznych (np. archiwum kampanii Ads, raporty kosztowe, lub raporty sprzedaży/billingowe) dla prawdziwych kont produkcyjnych? Szukaj ścieżek typu 'GET /advertising/statistics/campaigns', 'GET /billing/billing-entries', eksportów CSV/XLSX przez API.
2. **Standardy i Moduły Backtestingu (Node.js / JS):** Skoro chcemy przepuścić te historyczne dane (np. dzień po dniu) przez nasz algorytm Q-Learningu, jakie gotowe architektury/biblioteki NPM (np. środowiska Reinforcement Learning typu OpenAI Gym dla JS, frameworki backtestujące) najlepiej wykorzystać w Node.js, zamiast pisać pętlę od zera? 
3. **Format Danych i Ograniczenia Zapytań:** Jeśli odpytujemy API o dane historyczne Allegro Ads, jaki jest maksymalny zakres dat (np. 30 dni, 90 dni, 1 rok wstecz)? Czy są limity (throttling)?

Format zwrotny: Merytoryczny, zwięzły raport architektoniczny w Markdown, zawierający DOKŁADNE URLe (ścieżki REST API) i sugerowaną strukturę środowiska backtestowego dla Node.js. Raport musi być oparty na najnowszej, udokumentowanej strukturze Allegro.`;

async function runResearchAgent() {
    console.log("🚀 Uruchamiam Pomocnika (Backtesting & Historical Data) z Google Search Grounding...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ googleSearch: {} }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Błąd API Gemini:", data.error);
            return;
        }

        const report = data.candidates[0].content.parts[0].text;
        fs.writeFileSync('backtesting_research_report.md', report, 'utf-8');
        console.log("✅ Raport zapisano w backtesting_research_report.md");
    } catch (err) {
        console.error("Krytyczny błąd:", err);
    }
}

runResearchAgent();
