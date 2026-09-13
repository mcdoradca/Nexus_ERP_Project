const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SDSProcessorEngine, SDSDocxExporter, NDSRegistry } = require('./sds.service');
const { SDSVerifierAgent } = require('./sds.verifier.agent');

// Zgodnie z ADR-001 i architekturą Zero-Bypass Agent tłumaczy tylko wyselekcjonowane, bezpieczne sekcje.
const SYSTEM_PROMPT = `JESTEŚ AUDYTOREM CHEMICZNYM I REGULACYJNYM SYSTEMU KART CHARAKTERYSTYKI (SDS) W ŚRODOWISKU ANTIGRAVITY.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA REACH (UE 2020/878).

TWÓJ ZAKRES ODPOWIEDZIALNOŚCI (TRANSLATE_LLM & EXTRACT_RAW):
1. TŁUMACZENIE OPISÓW (TRANSLATE_LLM):
   - Używaj wyłącznie oficjalnej terminologii chemicznej i żargonu BHP. Zero potoczności.
   - Odpowiedzi muszą być chłodne, zwięzłe i ściśle odpowiadać oryginałowi.
   - Jeśli widzisz "Not applicable" lub brak danych, użyj "Nie dotyczy" lub "Brak danych".
2. ABSOLUTNY ZAKAZ MODYFIKACJI DANYCH FIZYKOCHEMICZNYCH I TOKSYKOLOGICZNYCH (EXTRACT_RAW):
   - W sekcjach 10 i 11 masz CAŁKOWITY ZAKAZ modyfikowania jakichkolwiek wartości liczbowych, znaków operacyjnych (>, <, =, ~), jednostek (mg/kg, mg/l, °C, mm2/s, hPa), oraz akronimów (LC50, EC50, LD50, NOAEL).
   - Masz CAŁKOWITY ZAKAZ modyfikowania łacińskich nazw gatunków biologicznych (np. Daphnia magna, Oncorhynchus mykiss, Rattus).
   - Tłumaczysz TYLKO nagłówki podsekcji oraz słowa opisowe (np. "Brak danych", "Rozkład termiczny"). Zostawiasz "surowe" cyfry i jednostki tam, gdzie były.
3. ABSOLUTNY ZAKAZ GENEROWANIA ARTEFAKTÓW PAGINACJI:
   - Całkowicie ignorujesz i usuwasz wszelkie nagłówki i stopki stron PDF, numery stron (np. "Page", "Strona", "n. of"), daty generowania karty oraz powtórzenia nazwy produktu w stopkach. Żadne z tych wtrąceń nie może pojawić się w tekście odpowiedzi.
4. KRYTERIUM BRAKU DANYCH:
   - Żadna podsekcja nie może pozostać pusta ani zawierać znaków zastępczych.
5. WALIDACJA STRUKTURY WYJŚCIOWEJ:
   - Wynik musisz zwrócić jako poprawny obiekt JSON o strukturze "sekcja": "tekst".
   - Sekcje zostaną do Ciebie przesłane z kluczami takimi jak "section_10", "section_11" itp.
   - Jakikolwiek błąd parsowania JSON natychmiast wstrzymuje kompilację.
6. OBLIGATORYJNA HIERARCHIA PODSEKCJI W SEKCJI 11 (UE 2020/878):
   - Podsekcja 11.1 zawiera obligatoryjnie wszystkie klasy od a) do j) (w tym h) STOT jednorazowe, i) STOT powtarzane, j) zagrożenie aspiracją).
   - Nagłówek "11.2. Informacje o innych zagrożeniach" bezwzględnie NIE MOŻE pojawić się przed punktami h), i), j) (nawet jeśli tak niefortunnie wydrukował go producent przez podział strony w PDF).
   - Nagłówek 11.2 musi znajdować się wyłącznie poniżej punktu j) podsekcji 11.1.`;

async function processSdsWithAgent(pdfPath, productName, manualOverrides = {}) {
    console.log(`[Agent SDS] Uruchamianie procedury architektonicznej dla: ${productName}`);
    
    try {
        // Konfiguracja firmy z bazy / env
        const companyConfig = {
            companyName: process.env.COMPANY_NAME || "MITRANS Weronika Grzesiak",
            address: process.env.COMPANY_ADDRESS || "ul. Wesoła 16",
            city: process.env.COMPANY_CITY || "63-600 Kępno, woj. wielkopolskie",
            email: process.env.COMPANY_EMAIL || "kontakt@prostozwloch.com.pl",
            phone: process.env.COMPANY_PHONE || "+48 663116607",
            emergencyPhone: process.env.COMPANY_EMERGENCY_PHONE || process.env.COMPANY_PHONE || "+48 663116607"
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
        console.log(`[Agent SDS] KROK 3: Asemblacja 16 sekcji...`);
        const finalData = engine.mergeCompletedSds(agentPayload, translatedJson);

        // KROK 4: AUDYT PRAWNO-CHEMICZNY (COMPLIANCE QUALITY GATEKEEPER)
        console.log(`[Agent SDS] KROK 4: Rygorystyczny audyt prawno-chemiczny (REACH/CLP Gatekeeper)...`);
        const auditResult = await SDSVerifierAgent.verifyAndAudit(finalData.sections, {
            productName: finalData.productName,
            ufi: finalData.ufi,
            components: agentPayload.deterministicSections.section_3.components,
            ghsPictograms: finalData.ghsPictograms,
            signalWord: finalData.signalWord
        });

        finalData.sections = auditResult.validatedSections;
        finalData.complianceAudit = auditResult.auditLog;
        fs.writeFileSync(path.join(process.cwd(), 'sds_compliance_audit.json'), JSON.stringify(auditResult.auditLog, null, 2));
        
        // KROK 5: GENEROWANIE DOKUMENTU WORD (.DOCX)
        console.log(`[Agent SDS] KROK 5: Generowanie pliku DOCX...`);
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
