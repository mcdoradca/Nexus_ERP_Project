const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SDSProcessorEngine, SDSDocxExporter, NDSRegistry } = require('./sds.service');
const { SDSVerifierAgent } = require('./sds.verifier.agent');
const { SDSSchemaValidator } = require('./sds.schema.validator');
const { SDSLinter } = require('./engine/sds.linter');

// Zgodnie z ADR-001 i architekturą Zero-Bypass Agent tłumaczy tylko wyselekcjonowane, czysto narracyjne sekcje.
const SYSTEM_PROMPT = `JESTEŚ ELITARNYM AUDYTOREM CHEMICZNYM I REGULACYJNYM SYSTEMU KART CHARAKTERYSTYKI (SDS) W ŚRODOWISKU ANTIGRAVITY.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA REACH (UE 2020/878).

TWÓJ ZAKRES ODPOWIEDZIALNOŚCI (TRANSLATE_LLM & EXTRACT_RAW):
1. BEZWZGLĘDNA ZASADA 100% JĘZYKA POLSKIEGO:
   - Wszystkie opisy, zdania i zalecenia muszą być w 100% w języku polskim.
   - CAŁKOWITY ZAKAZ pozostawiania jakichkolwiek obcojęzycznych (angielskich, włoskich) słów w tekście.
   - Używaj wyłącznie oficjalnej terminologii chemicznej, medycznej, pożarniczej i BHP. Zero potoczności.
   - Odpowiedzi muszą być chłodne, precyzyjne i wiernością odpowiadać deklaracjom producenta.
   - Formuły brakujące tłumacz jako "Brak dostępnych danych" lub "Nie dotyczy".

2. INSTRUKCJE DLA POSZCZEGÓLNYCH SEKCJI NARRACYJNYCH:
   - SEKCJA 1.2 (Zastosowania):
     * "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane"
     * Przetłumacz cel zastosowania (np. odświeżacz powietrza, detergent, płyn do tkanin) oraz zastosowania odradzane.
   - SEKCJA 5 (Postępowanie w przypadku pożaru):
     * 5.1. Środki gaśnicze: odpowiednie środki gaśnicze, niewłaściwe środki gaśnicze.
     * 5.2. Szczególne zagrożenia związane z substancją lub mieszaniną (produkty spalania, rozkład termiczny).
     * 5.3. Informacje dla straży pożarnej (sprzęt ochrony indywidualnej, odzież zgodna z EN 469, aparat oddechowy).
   - SEKCJA 6 (Postępowanie w przypadku niezamierzonego uwolnienia do środowiska):
     * 6.1. Indywidualne środki ostrożności, wyposażenie ochronne i procedury w sytuacjach awaryjnych: dla osób nienależących do personelu udzielającego pomocy, dla osób udzielających pomocy.
     * 6.2. Środki ostrożności w zakresie ochrony środowiska (gleba, wody powierzchniowe, kanalizacja).
     * 6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia (pochłaniacze, sorbenty, zmywanie).
     * 6.4. Odniesienia do innych sekcji (sekcja 8 i 13).
   - SEKCJA 7 (Postępowanie z substancjami i mieszaninami oraz ich magazynowanie):
     * 7.1. Środki ostrożności dotyczące bezpiecznego postępowania (wentylacja, higiena, unikanie kontaktu ze skórą i oczami).
     * 7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności.
       CAŁKOWITY ZAKAZ POWIELANIA NIEMIECKICH NORM KRAJOWYCH (np. TRGS 510, Lagerklasse, WGK). Wszelkie odwołania do TRGS 510 zastąp polskimi wymogami ochrony przeciwpożarowej dotyczącymi magazynowania cieczy łatwopalnych (Rozporządzenie MSWiA z dnia 7 czerwca 2010 r., Dz.U. 2010 nr 109 poz. 719 z późn. zm.).
     * 7.3. Szczególne zastosowania końcowe.
   - SEKCJA 10 (Stabilność i reaktywność):
     * 10.1 (Reaktywność), 10.2 (Stabilność chemiczna), 10.3 (Możliwość występowania niebezpiecznych reakcji), 10.4 (Warunki, których należy unikać), 10.5 (Materiały niezgodne), 10.6 (Niebezpieczne produkty rozkładu).
   - SEKCJA 11 (Informacje toksykologiczne):
     * Podsekcja 11.1 zawiera punkty od a) do j) (w tym h) STOT jednorazowe, i) STOT powtarzane, j) zagrożenie aspiracją).
     * Pospolite nazwy zwierząt laboratoryjnych tłumacz na polski: Rat / ratto -> szczur, Rabbit / coniglio -> królik, Mouse / topo -> mysz, Human -> człowiek.
     * Drogi narażenia tłumacz na polski: oral / orale -> droga pokarmowa (doustnie), dermal / cutanea -> na skórę, inhalation / inalatoria -> przez drogi oddechowe (inhalacyjnie), vapours -> pary.
     * Nazwy substancji chemicznych tłumacz na polskie odpowiedniki (np. Ethanol -> Etanol, Toluene -> Toluen, Anisaldehyde -> Aldehyd anyżowy, 2H-chromen-2-one -> Kumaryna, 2,6-di-tert-butyl-p-cresol -> 2,6-di-tert-butylo-4-metylofenol (BHT)).
     * ABSOLUTNY ZAKAZ modyfikowania liczb, znaków operacyjnych (>, <, =, ~) i jednostek (mg/kg, mg/l, ppm, °C, %).
     * Nagłówek '11.2. Informacje o innych zagrożeniach' umieść bezwzględnie poniżej punktu j) podsekcji 11.1.

3. ABSOLUTNY ZAKAZ GENEROWANIA ARTEFAKTÓW PAGINACJI:
   - Całkowicie usuń i zignoruj wszelkie nagłówki i stopki stron PDF, numery stron (Page, Strona, n. of), daty oraz powtórzenia nazwy producenta czy produktu w stopkach.

4. FORMAT WYJŚCIOWY:
   - Zwróć wyłącznie poprawny obiekt JSON, w którym kluczami są identyfikatory sekcji: "section_1_2", "section_5", "section_6", "section_7", "section_10", "section_11", a wartościami przetłumaczony, profesjonalnie sformatowany polski tekst.`;

async function processSdsWithAgent(pdfPath, productName, manualOverrides = {}) {
    console.log(`[Agent SDS] Uruchamianie procedury architektonicznej dla: ${productName}`);
    
    try {
        // Konfiguracja firmy z bazy / env
        const companyConfig = {
            companyName: process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.",
            address: process.env.COMPANY_ADDRESS || "ul. Wesoła 16",
            city: process.env.COMPANY_CITY || "63-600 Kępno",
            website: process.env.COMPANY_WEBSITE || "www.prostozwloch.com.pl",
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

        const prompt = `Przetłumacz na język polski podane sekcje narracyjne zachowując ich format. Zwróć obiekt JSON, którego kluczami są identyfikatory sekcji (np. "section_5", "section_6", "section_7", "section_10", "section_11", "section_1_2"), a wartościami przetłumaczone teksty.
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

        // BRAMKA JAKOŚCIOWA 1: Rygorystyczna walidacja kontraktu sekcji przetłumaczonych
        console.log(`[Agent SDS] KROK 2b: Walidacja kontraktu danych sekcji przetłumaczonych (SDSSchemaValidator)...`);
        SDSSchemaValidator.validateTranslatedSections(translatedJson, agentPayload.descriptiveSectionsToTranslate);
        
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

        // BRAMKA JAKOŚCIOWA 2: Rygorystyczna walidacja kompletnego modelu SDS przed wyrenderowaniem DOCX
        console.log(`[Agent SDS] KROK 4b: Walidacja kompletnego modelu SDS przed eksportem DOCX (SDSSchemaValidator)...`);
        SDSSchemaValidator.validateFinalSds(finalData);

        // BRAMKA JAKOŚCIOWA 3: Rygorystyczny linter prawno-chemiczny Sanepid / PIP (SDSLinter)
        console.log(`[Agent SDS] KROK 4c: Rygorystyczny linter Sanepid / PIP (SDSLinter)...`);
        const lintResult = SDSLinter.auditAndLint(finalData);
        if (!lintResult.isValid) {
            console.error('[Agent SDS] Linter Sanepid/PIP wykrył uchybienia prawne:', lintResult.errors);
            throw new Error(`[SANEPID_LINT_ERROR] Dokument nie spełnia kryteriów prawnych: ${lintResult.errors.join('; ')}`);
        }
        
        // KROK 5: GENEROWANIE DOKUMENTU WORD (.DOCX)
        console.log(`[Agent SDS] KROK 5: Generowanie pliku DOCX...`);
        const outputFilename = path.join(process.cwd(), `Karta_Charakterystyki_${Date.now()}.docx`);
        await SDSDocxExporter.export(finalData, outputFilename);
        
        console.log(`[Agent SDS] Zakończono! Zapisano plik: ${outputFilename}`);
        return {
            docxPath: outputFilename,
            resolvedProductName: finalData.metadata?.productName || finalData.productName || "PRODUKT_CHEMICZNY"
        };


    } catch (error) {
        console.error('[CRITICAL HALT] Błąd krytyczny w pipeline SDS:', error);
        throw error;
    }
}

module.exports = {
    processSdsWithAgent
};
