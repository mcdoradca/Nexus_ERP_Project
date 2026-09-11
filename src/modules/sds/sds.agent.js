const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SDSProcessorEngine, SDSDocxExporter, NDSRegistry } = require('./sds.service');

// Zgodnie z ADR-001 i architekturą Zero-Bypass Agent tłumaczy tylko wyselekcjonowane, bezpieczne sekcje.
const SYSTEM_PROMPT = `JESTEŚ AUDYTOREM CHEMICZNYM I REGULACYJNYM SYSTEMU KART CHARAKTERYSTYKI (SDS) W ŚRODOWISKU ANTIGRAVITY.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA REACH (UE 2020/878) ORAZ ROZPORZĄDZENIA CLP (WE 1272/2008).

TWÓJ ZAKRES ODPOWIEDZIALNOŚCI:
1. CAŁKOWITY ZAKAZ MODYFIKACJI SEKCJI DETERMINISTYCZNYCH:
   - Sekcje 1, 2, 3, 8, 13, 15 są przetworzone deterministycznie przez silnik Node.js i odpytania API. Pod żadnym pozorem nie wolno Ci modyfikować numerów CAS, kodów H/P, limitów NDS ani szablonów prawnych RP.
2. TRANSLACJA PRECYZYJNA SEKCJI OPISOWYCH (SEKCJE 4, 5, 6, 7, 9, 10, 11, 12, 14, 16):
   - JĘZYK: Oficjalna polska terminologia chemiczno-medyczna i instruktażowa. Zero potoczności.
   - SEKCJA 4 (Pierwsza pomoc): Instrukcje muszą być jednoznaczne, kategoryczne, bezinterpretacyjne (np. "Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem").
   - SEKCJA 11.2 i 12.6: Bezwzględny wymóg prawny formatu (UE) 2020/878. Musisz jednoznacznie podać informację o właściwościach zaburzających funkcjonowanie układu hormonalnego (brak danych, negatywna ocena lub obecność na liście kandydackiej ECHA).
   - SEKCJA 14 (Transport): Obowiązuje wyłącznie oficjalna terminologia Umowy ADR (np. "MATERIAŁ ŻRĄCY CIEKŁY KWAŚNY NIEORGANICZNY, I.N.O."). Zakaz własnych translacji nazw UN.
3. KRYTERIUM BRAKU DANYCH:
   - Żadna podsekcja nie może pozostać pusta ani zawierać znaków zastępczych (typu "[...]", "TBD", "placeholder").
   - W przypadku braku danych źródłowych jedyne dopuszczalne prawnie formuły to: "Brak dostępnych danych" lub "Nie dotyczy".
4. WALIDACJA STRUKTURY WYJŚCIOWEJ:
   - Wynik musisz zwrócić jako poprawny obiekt JSON o strukturze "sekcja": "tekst".
   - Jakikolwiek błąd parsowania JSON natychmiast wstrzymuje kompilację.`;

async function processSdsWithAgent(pdfPath, productName) {
    console.log(`[Agent SDS] Uruchamianie procedury architektonicznej dla: ${productName}`);
    
    try {
        // Konfiguracja firmy z mocka lub bazy
        const companyConfig = {
            companyName: "Firma Przykładowa Sp. z o.o.",
            emergencyPhone: "+48 111 222 333"
        };

        // KROK 1: EKSTRAKCJA I DETERMINIZM (NODE.JS + API)
        console.log(`[Agent SDS] KROK 1: Uruchomienie twardego parsera i zapytań API (PubChem)...`);
        
        // Ładowanie bazy NDS
        const ndsPath = path.join(__dirname, 'rag_knowledge', 'nds_database_2018.json');
        NDSRegistry.loadRegistry(ndsPath);

        const engine = new SDSProcessorEngine(companyConfig);
        const agentPayload = await engine.prepareAgentPayload(pdfPath, productName);
        
        // Zapis dla celów audytowych / debugu
        fs.writeFileSync(path.join(process.cwd(), 'agent_payload.json'), JSON.stringify(agentPayload, null, 2));

        // KROK 2: TRANSLACJA AGENTA (LLM W HERMETYCZNYM PUDEŁKU)
        console.log(`[Agent SDS] KROK 2: Uruchomienie LLM dla sekcji opisowych...`);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Przetłumacz na język polski podane sekcje zachowując ich format. Zwróć obiekt JSON, którego kluczami są identyfikatory sekcji (np. "section_4"), a wartościami przetłumaczone teksty.
Dane wejściowe do tłumaczenia:
${JSON.stringify(agentPayload.descriptiveSectionsToTranslate, null, 2)}`;

        const result = await model.generateContent(prompt);
        const translatedJson = JSON.parse(result.response.text());
        
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
