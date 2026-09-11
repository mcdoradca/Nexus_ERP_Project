require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const SYSTEM_PROMPT = `Jesteś Agentem Śledczym ds. Bezpieczeństwa Chemicznego (Ekspert REACH).
Twoim zadaniem jest znalezienie prawidłowej, międzynarodowej nazwy IUPAC w języku polskim oraz wzoru sumarycznego dla substancji, których nie udało się zidentyfikować systemowi głównemu (anomalie CAS).

Otrzymasz listę anomalii. Twoim wynikiem MUSI być wyłącznie czysty JSON (bez bloków markdown), reprezentujący obiekt, gdzie kluczem jest numer CAS, a wartością obiekt z naprawionymi polami.
Struktura odpowiedzi:
{
  "155-00-6": {
    "iupac": "kwas np. p-toluenosulfonowy...",
    "formula": "C7H8O3S",
    "name_pl": "kwas p-toluenosulfonowy",
    "justification": "Zidentyfikowano poprawnie przez bazę ECHA."
  }
}
Jeśli nie jesteś w 100% pewien, wymuś pustą nazwę, by zostawić to człowiekowi.`;

async function callApifyScraper(casNumber, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const token = process.env.APIFY_API_TOKEN;
            if (!token) {
                console.warn("[HITL Agent] Brak APIFY_API_TOKEN. Pomijam dedykowany scraper.");
                return null;
            }

            // Uruchamiamy aktora ECHA Scraper synchronicznie (czeka na wynik)
            const response = await axios.post(`https://api.apify.com/v2/acts/studio-amba~echa-scraper/run-sync-get-dataset-items?token=${token}`, {
                "search_term": casNumber
            }, { timeout: 120000 }); // Wydłużony timeout do 120s (2 minuty)

            if (response.data && response.data.length > 0) {
                return response.data[0];
            }
            return null;
        } catch (err) {
            console.error(`[HITL Agent] Błąd odpytywania Apify ECHA Scraper (próba ${attempt + 1}):`, err.message);
            if (attempt === retries) return null;
            await new Promise(r => setTimeout(r, 2000)); // Krótkie opóźnienie przed ponowieniem
        }
    }
    return null;
}

async function investigateAnomaliesAgent(anomalies) {
    console.log(`[HITL Agent] Rozpoczynam dochodzenie dla ${anomalies.length} anomalii...`);
    
    // 1. Zbieranie kontekstu zewnętrznego dla agenta LLM w trybie Bulk (równoległym)
    let contextForLlm = {};
    const anomaliesToQuery = anomalies.filter(a => a.type === 'CAS_NOT_FOUND' || a.type === 'API_ERROR');
    
    const fetchPromises = anomaliesToQuery.map(async (anomaly) => {
        const externalData = await callApifyScraper(anomaly.cas);
        return { cas: anomaly.cas, data: externalData };
    });

    const results = await Promise.allSettled(fetchPromises);
    
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { cas, data } = result.value;
            contextForLlm[cas] = data || `Brak danych z Apify. Użyj swojej wiedzy chemicznej, by zidentyfikować tę substancję (CAS ${cas}).`;
        }
    }

    // 2. Przekazanie do Gemini w celu ustrukturyzowania
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-3.8-medium", 
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.0 // ZERO halucynacji
        }
    });

    const prompt = `Lista zgłoszonych anomalii:
${JSON.stringify(anomalies, null, 2)}

Dodatkowy kontekst zebrany z zewnętrznych systemów ECHA (Apify):
${JSON.stringify(contextForLlm, null, 2)}

Wygeneruj rozwiązanie JSON wg instrukcji.`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    
    try {
        const resolution = JSON.parse(responseText);
        return {
            status: "RESOLVED",
            agentNote: "Przeprowadzono dochodzenie. Zastosuj zaproponowane poprawki.",
            proposedOverrides: resolution
        };
    } catch (e) {
        console.error("[HITL Agent] Błąd parsowania odpowiedzi:", e);
        throw new Error("Agent Śledczy nie był w stanie wygenerować poprawnego strukturalnie raportu.");
    }
}

module.exports = {
    investigateAnomaliesAgent
};
