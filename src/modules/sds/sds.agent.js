const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SDSProcessorEngine, SDSDocxExporter, NDSRegistry } = require('./sds.service');

// Zgodnie z ADR-001 i architekturą Zero-Bypass Agent tłumaczy tylko wyselekcjonowane, bezpieczne sekcje.
const SYSTEM_PROMPT = `JESTEŚ AUDYTOREM CHEMICZNYM I REGULACYJNYM SYSTEMU KART CHARAKTERYSTYKI (SDS) W ŚRODOWISKU ANTIGRAVITY.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA REACH (UE 2020/878).

TWÓJ ZAKRES ODPOWIEDZIALNOŚCI (TRANSLATE_LLM & EXTRACT_RAW):
1. TŁUMACZENIE OPISÓW (TRANSLATE_LLM):
   - Używaj wyłącznie oficjalnej terminologii chemicznej i żargonu BHP. Zero potoczności.
   - Odpowiedzi muszą być chłodne, zwięzłe i ściśle odpowiadać oryginałowi.
   - Jeśli widzisz "Not applicable" lub brak danych, użyj "Nie dotyczy" lub "Brak danych".
2. ABSOLUTNY ZAKAZ MODYFIKACJI DANYCH FIZYKOCHEMICZNYCH (EXTRACT_RAW):
   - W sekcjach 8.2, 9, 10, 11, 12, 14 i 16, masz CAŁKOWITY ZAKAZ tłumaczenia i modyfikowania jakichkolwiek wartości liczbowych, znaków operacyjnych (>, <, =, ~), jednostek (mg/kg, mg/l, °C, mm2/s, hPa), oraz akronimów (LC50, EC50, LD50, NOAEL, DNEL, PNEC, BCF, log Kow, ABEK, EN 374, EN 166).
   - Masz CAŁKOWITY ZAKAZ tłumaczenia kodów transportowych (UN, ADR, RID, IMDG, IATA, klasy pakowania). Mają pozostać 1:1.
   - Masz CAŁKOWITY ZAKAZ tłumaczenia łacińskich nazw gatunków biologicznych (np. Daphnia magna, Oncorhynchus mykiss, Rattus).
   - Tłumaczysz TYLKO nagłówki podsekcji oraz słowa opisowe (np. "Rozpuszczalny w wodzie", "Brak danych", "Substancja żrąca"). Zostawiasz "surowe" cyfry i jednostki tam, gdzie były.
3. KRYTERIUM BRAKU DANYCH:
   - Żadna podsekcja nie może pozostać pusta ani zawierać znaków zastępczych.
4. WALIDACJA STRUKTURY WYJŚCIOWEJ:
   - Wynik musisz zwrócić jako poprawny obiekt JSON o strukturze "sekcja": "tekst".
   - Sekcje zostaną do Ciebie przesłane z kluczami takimi jak "section_6", "section_8_2" itp.
   - Jakikolwiek błąd parsowania JSON natychmiast wstrzymuje kompilację.`;

async function processSdsWithAgent(pdfPath, productName, manualOverrides = {}) {
    console.log(`[Agent SDS] Uruchamianie procedury architektonicznej dla: ${productName}`);
    
    try {
        // Konfiguracja firmy z bazy / env
        const companyConfig = {
            companyName: process.env.COMPANY_NAME || "Nexus ERP Producent Sp. z o.o.",
            emergencyPhone: process.env.COMPANY_PHONE || "+48 111 222 333"
        };

        // KROK 1: EKSTRAKCJA I DETERMINIZM (NODE.JS + API)
        console.log(`[Agent SDS] KROK 1: Uruchomienie twardego parsera i zapytań API (PubChem)...`);
        
        // Ładowanie bazy NDS
        const ndsPath = path.join(__dirname, 'rag_knowledge', 'nds_database_2018.json');
        NDSRegistry.loadRegistry(ndsPath);

        const engine = new SDSProcessorEngine(companyConfig);
        const agentPayload = await engine.prepareAgentPayload(pdfPath, productName, manualOverrides);
        
        // Zapis dla celów audytowych / debugu
        fs.writeFileSync(path.join(process.cwd(), 'agent_payload.json'), JSON.stringify(agentPayload, null, 2));

        // KROK 2: TRANSLACJA AGENTA (LLM W HERMETYCZNYM PUDEŁKU)
        console.log(`[Agent SDS] KROK 2: Uruchomienie LLM dla sekcji opisowych...`);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: { 
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });

        const prompt = `Przetłumacz na język polski podane sekcje zachowując ich format. Zwróć obiekt JSON, którego kluczami są identyfikatory sekcji (np. "section_4"), a wartościami przetłumaczone teksty.
Dane wejściowe do tłumaczenia:
${JSON.stringify(agentPayload.descriptiveSectionsToTranslate, null, 2)}`;

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        responseText = responseText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        let translatedJson;
        try {
            translatedJson = JSON.parse(responseText);
        } catch(parseErr) {
            console.error('[Agent SDS] Błąd parsowania JSON od LLM:', parseErr);
            console.error('Otrzymany tekst:', responseText);
            throw new Error('LLM zwrócił nieprawidłowy format JSON.');
        }
        
        fs.writeFileSync(path.join(process.cwd(), 'agent_translated_sections.json'), JSON.stringify(translatedJson, null, 2));

        // KROK 3: ASEMBLACJA
        console.log(`[Agent SDS] KROK 3: Asemblacja i generowanie DOCX...`);
        const finalData = engine.mergeCompletedSds(agentPayload, translatedJson);
        
        const outputFilename = path.join(process.cwd(), `Karta_Charakterystyki_${Date.now()}.docx`);
        await SDSDocxExporter.export(finalData, outputFilename);
        
        console.log(`[Agent SDS] Zakończono! Zapisano plik: ${outputFilename}`);
        return outputFilename;

    } catch (error) {
        console.error('[CRITICAL HALT] Błąd krytyczny w pipeline SDS:', error);
        throw error;
    }
}

module.exports = {
    processSdsWithAgent
};
