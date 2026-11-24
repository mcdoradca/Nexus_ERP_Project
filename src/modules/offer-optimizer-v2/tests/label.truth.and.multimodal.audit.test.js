const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');

const aiWrapper = require('../ai.wrapper');
const gpsrSafetyService = require('../services/gpsr.safety.service');
const deterministicEngine = require('../services/deterministic-pipeline.engine');
const googleSuggestFaqService = require('../services/google-suggest-faq.service');
const { validate_domain_and_chemical_logic } = require('../validators');
const { Orchestrator } = require('../orchestrator');

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const VIAKAL_VISION_FEATURES = {
    'Marka': 'Viakal',
    'Linia produktowa (Front)': 'Bagno Express',
    'Wariant (Etykieta Front)': 'Fiori di Primavera',
    'Nazwa produktu (Etykieta Front)': 'Viakal Bagno Express Fiori di Primavera',
    'Pojemność / Waga': '470 ml',
    'Postać': 'płyn',
    'Dozownik': 'Spray',
    'Zapach': 'Fiori di Primavera (kwiaty wiosny)',
    'Przeznaczenie (Front)': 'powierzchnie łazienkowe, armatura i ceramika',
    'Bez spłukiwania (Etykieta Front)': 'Tak',
    'Wyróżniki (Etykieta Front)': 'Bez spłukiwania',
    'Piktogramy CLP (Etykieta)': 'GHS07'
};

test('AI Wrapper — obsługa tablicy obrazów multimodalnych, redakcja logów oraz retry RECITATION', async () => {
    const origGenerate = aiWrapper.ai.models.generateContent;
    const capturedCalls = [];
    const loggedMessages = [];

    aiWrapper.ai.models.generateContent = async (req) => {
        capturedCalls.push(req);
        if (capturedCalls.length === 1) {
            return {
                candidates: [{
                    finishReason: 'RECITATION',
                    content: { parts: [{ text: '' }] }
                }],
                text: '',
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 5, totalTokenCount: 105 }
            };
        }
        return {
            candidates: [{
                finishReason: 'STOP',
                content: { parts: [{ text: '{"ok":true}' }] }
            }],
            text: '{"ok":true}',
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 10, totalTokenCount: 130 }
        };
    };

    try {
        const res = await aiWrapper.callAgentWithTelemetry({
            agentId: '11',
            prompt: 'Sprawdź przód i tył etykiety.',
            schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
            images: [
                { label: 'ZDJĘCIE FRONTU', mimeType: 'image/jpeg', base64: 'QUJDREVGR0hJSktMTU5PUA==' },
                { label: 'ZDJĘCIE TYŁU', mimeType: 'image/png', base64: TINY_PNG_BASE64 }
            ],
            onLog: (msg) => loggedMessages.push(msg)
        });

        assert.equal(res.result.ok, true);
        assert.equal(capturedCalls.length, 2, 'Oczekiwano powtórzenia po RECITATION');

        const firstContents = capturedCalls[0].contents;
        assert.ok(Array.isArray(firstContents), 'Multi-image contents powinno być tablicą części');
        const inlineParts1 = firstContents.filter(p => p && p.inlineData);
        assert.equal(inlineParts1.length, 2, 'Pierwsze wywołanie musi zawierać oba obrazy inlineData');
        assert.ok(firstContents.some(p => p.text === 'ZDJĘCIE FRONTU'));
        assert.ok(firstContents.some(p => p.text === 'ZDJĘCIE TYŁU'));

        const retryContents = capturedCalls[1].contents;
        assert.ok(Array.isArray(retryContents), 'Retry po RECITATION musi zachować tablicę multimodalną');
        assert.equal(retryContents.filter(p => p && p.inlineData).length, 2, 'Retry musi zachować oba obrazy etykiety');

        const fullLog = loggedMessages.join('\n');
        assert.ok(!fullLog.includes(TINY_PNG_BASE64), 'Log audytowy nie może zrzucać surowego base64');
        assert.ok(fullLog.includes('[BASE64_OMITTED:'), 'Log audytowy musi maskować base64 markerem rozmiaru');
    } finally {
        aiWrapper.ai.models.generateContent = origGenerate;
    }
});

test('AI Wrapper — wsteczna kompatybilność pojedynczego obrazu image', async () => {
    const origGenerate = aiWrapper.ai.models.generateContent;
    let capturedReq = null;

    aiWrapper.ai.models.generateContent = async (req) => {
        capturedReq = req;
        return {
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
            text: '{"ok":true}',
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5, totalTokenCount: 55 }
        };
    };

    try {
        const res = await aiWrapper.callAgentWithTelemetry({
            agentId: '0',
            prompt: 'Odczytaj front.',
            schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
            image: { mimeType: 'image/png', base64: TINY_PNG_BASE64 }
        });
        assert.equal(res.result.ok, true);
        assert.ok(Array.isArray(capturedReq.contents));
        assert.equal(capturedReq.contents.filter(p => p && p.inlineData).length, 1);
    } finally {
        aiWrapper.ai.models.generateContent = origGenerate;
    }
});

test('Regresja Viakal (8700216405348) — nazwa kanoniczna, S5 Bez spłukiwania, FAQ Q3 i uczciwy Parfum', async () => {
    const rawCatalogName = 'Viakal odkamieniacz bagno expres fi 470 ml';
    const canonicalName = deterministicEngine.resolveCanonicalProductName({
        productName: rawCatalogName,
        brand: 'Viakal',
        capacity: '470 ml',
        visionFeatures: VIAKAL_VISION_FEATURES,
        features: {}
    });

    assert.ok(canonicalName.includes('Viakal Bagno Express Fiori di Primavera'), `Oczekiwano oficjalnej nazwy etykiety, otrzymano: ${canonicalName}`);
    assert.ok(canonicalName.includes('470 ml'));
    assert.equal(/\bexpres\b/i.test(canonicalName), false, 'Nazwa kanoniczna nie może zawierać literówki expres');
    assert.equal(/\bfi\b/i.test(canonicalName), false, 'Nazwa kanoniczna nie może zawierać uciętego skrótu fi');

    const s5Html = deterministicEngine.buildDeterministicSection5({
        gtin: '8700216405348',
        productName: rawCatalogName,
        brand: 'Viakal',
        manufacturer: 'Procter & Gamble S.r.l.',
        capacity: '470 ml',
        visionFeatures: VIAKAL_VISION_FEATURES,
        features: {}
    });
    assert.ok(s5Html.includes('Viakal Bagno Express Fiori di Primavera'), 'Sekcja 5 musi zawierać pełną oficjalną nazwę');
    assert.ok(s5Html.includes('Bagno Express'), 'Sekcja 5 musi zawierać linię Bagno Express');
    assert.ok(s5Html.includes('Bez spłukiwania'), 'Sekcja 5 musi zachować wyróżnik Bez spłukiwania');
    assert.equal(/\bexpres\b/i.test(s5Html), false, 'Sekcja 5 nie może zawierać literówki expres');

    // Mock https.get aby harvester FAQ działał w 100% deterministycznie offline
    const origHttpsGet = https.get;
    https.get = (_url, _opts, cb) => {
        const req = new EventEmitter();
        req.destroy = () => {};
        req.end = () => {};
        process.nextTick(() => {
            if (typeof cb === 'function') {
                const res = new EventEmitter();
                res.statusCode = 200;
                cb(res);
                res.emit('data', JSON.stringify(['viakal', []]));
                res.emit('end');
            }
        });
        return req;
    };

    try {
        const faqBlueprint = await googleSuggestFaqService.harvestSearchIntentFaq({
            productName: canonicalName,
            brand: 'Viakal',
            capacity: '470 ml',
            scent: 'Fiori di Primavera (kwiaty wiosny)',
            isChemical: true,
            visionFeatures: VIAKAL_VISION_FEATURES,
            features: {},
            detergentComposition: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal'
        });

        assert.ok(Array.isArray(faqBlueprint.recommended_search_questions) && faqBlueprint.recommended_search_questions.length === 4);
        const q1 = String(faqBlueprint.recommended_search_questions[0] || '');
        const q3 = String(faqBlueprint.recommended_search_questions[2] || '');
        assert.ok(!/\bexpres\b/i.test(q1) && !/\bfi\b/i.test(q1), `Q1 nie może powielać błędów ERP: ${q1}`);
        assert.ok(/bez\s+spłukiwania|wymaga\s+spłukiwania/i.test(q3), `Q3 dla formuły Senza Risciacquo musi dotyczyć użycia bez spłukiwania, otrzymano: ${q3}`);
    } finally {
        https.get = origHttpsGet;
    }

    // Sekcja 3 deterministyczna: brak fałszywej neutralizacji woni przez Parfum i Hexyl Cinnamal
    const detS3 = deterministicEngine.tryBuildDeterministicSection3({
        productName: canonicalName,
        isChemical: true,
        inci: 'Aqua, Formic Acid, < 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        detergentComposition: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        visionFeatures: VIAKAL_VISION_FEATURES,
        features: {}
    });
    assert.ok(detS3 && detS3.section_3_html, 'Oczekiwano wygenerowania deterministycznej Sekcji 3');
    assert.ok(detS3.section_3_html.includes('Parfum'));
    assert.equal(/Hexyl\s+Cinnamal|alergen/i.test(detS3.section_3_html), false, 'Sekcja 3 marketingowa nie może zawierać cząsteczek alergenów zapachowych ani słowa alergen (§K)');
    assert.equal(/neutralizuj[a-ząćęłńóśźż]*\s+(?:[a-ząćęłńóśźż]+\s+){0,2}(?:wo[ńn]|zapach)/i.test(detS3.section_3_html), false, 'Sekcja 3 nie może twierdzić, że Parfum lub Hexyl Cinnamal neutralizują woń');

    assert.equal(deterministicEngine.hasDeclaredOdorNeutralizer({
        productName: canonicalName,
        detergentComposition: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        visionFeatures: VIAKAL_VISION_FEATURES
    }), false);
    assert.equal(deterministicEngine.hasDeclaredOdorNeutralizer({
        productName: canonicalName,
        detergentComposition: '< 5% Non-Ionic Surfactants, Cyclodextrin, Parfum'
    }), true);
});

test('GPSR & CLP Sekcja 6 — piktogram GHS07, pełne ostrzeżenia po P305 i brak halucynacji P280', () => {
    const backWarningsRaw = 'UWAGA. H319 – Działa drażniąco na oczy. P102 – Chronić przed dziećmi. P305+P351 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Nie wdychać rozpylonej cieczy. Nie mieszać z wybielaczami ani z innymi produktami czyszczącymi.';
    const features = {
        'Piktogramy CLP (Etykieta)': 'GHS07',
        'Ostrzeżenia': backWarningsRaw
    };
    const gpsr = gpsrSafetyService.generateGpsrWarnings({
        inci: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        productName: 'Viakal Bagno Express Fiori di Primavera 470 ml',
        isChemical: true,
        compliance: {
            clp_signal_word: 'UWAGA',
            clp_h_phrases: ['H319'],
            clp_p_phrases: ['P102', 'P305+P351'],
            clp_pictograms: ['GHS07']
        },
        hPhrases: ['H319'],
        pPhrases: ['P102', 'P305+P351'],
        features
    });

    assert.ok(gpsr.warnings.some(w => w.includes('GHS07')), 'Brak piktogramu GHS07 w wygenerowanych ostrzeżeniach');
    assert.ok(gpsr.warnings.some(w => /Nie wdychać rozpylonej cieczy/i.test(w)), 'Ucięto ostrzeżenie: Nie wdychać rozpylonej cieczy');
    assert.ok(gpsr.warnings.some(w => /Nie mieszać z wybielaczami/i.test(w)), 'Ucięto ostrzeżenie: Nie mieszać z wybielaczami');
    assert.equal(gpsr.warnings.some(w => /\bP280\b|rękawice ochronne/i.test(w)), false, 'Nie wolno halucynować P280 przy łagodnym H319 bez deklaracji P280 na etykiecie');

    const s6Html = deterministicEngine.buildDeterministicSection6({
        productName: 'Viakal Bagno Express Fiori di Primavera 470 ml',
        isChemical: true,
        euResponsiblePerson: { name: 'Procter & Gamble S.r.l.', address_eu: 'Viale Giorgio Ribotta 11, 00144 Roma, Włochy' },
        mandatorySafetyWarnings: gpsr.warnings,
        compliance: { clp_signal_word: 'UWAGA', clp_pictograms: ['GHS07'] },
        features,
        visionFeatures: VIAKAL_VISION_FEATURES
    });

    assert.ok(s6Html.includes('GHS07'), 'Sekcja 6 musi zawierać piktogram GHS07');
    assert.ok(s6Html.includes('Nie wdychać rozpylonej cieczy'), 'Sekcja 6 musi zawierać pełne ostrzeżenie o wdychaniu');
    assert.ok(s6Html.includes('Nie mieszać z wybielaczami'), 'Sekcja 6 musi zawierać ostrzeżenie o niemieszaniu');
    assert.equal(/\bP280\b|rękawice ochronne/i.test(s6Html), false, 'Sekcja 6 nie może halucynować P280');
});

test('Walidatory V10 checks 24–28 — wykrywanie zepsutego opisu Viakal i akceptacja poprawionego', () => {
    const context = {
        productName: 'Viakal Bagno Express Fiori di Primavera 470 ml',
        canonicalProductName: 'Viakal Bagno Express Fiori di Primavera 470 ml',
        rawProductName: 'Viakal odkamieniacz bagno expres fi 470 ml',
        inci: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        detergentComposition: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
        isChemical: true,
        isNoRinse: true,
        visionFeatures: VIAKAL_VISION_FEATURES,
        features: { 'Piktogramy CLP (Etykieta)': 'GHS07' },
        clpPictograms: ['GHS07']
    };

    const brokenSections = {
        section_1_html: '<h2>⭐ Viakal odkamieniacz 470 ml</h2><p>Skuteczny spray.</p><ul><li>✔️ <b>Kwiatowy zapach:</b> kompozycja zapachowa neutralizuje woń wilgoci i odświeża łazienkę.</li></ul>',
        section_2_html: '<h2>❓ Viakal odkamieniacz bagno expres fi 470 ml</h2><ul><li>❓ <b>Pytanie 1:</b> Do czego służy Viakal odkamieniacz bagno expres fi 470 ml?</li><li>✔️ <b>Odpowiedź 1:</b> Spray do łazienki.</li><li>❓ <b>Pytanie 3:</b> Czy trzeba spłukiwać?</li><li>✔️ <b>Odpowiedź 3:</b> Produkt bez spłukiwania — wystarczy przetrzeć ściereczką lub spłukać.</li></ul>',
        section_3_html: '<h2>⚙️ Składniki</h2><ul><li>⚙️ <b>Kompozycja zapachowa (Parfum, Hexyl Cinnamal):</b> skutecznie neutralizuje nieprzyjemne wonie wilgoci w łazience.</li></ul>',
        section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 4 – Wykończenie:</b> Dokładnie spłucz powierzchnię wodą i wytrzyj do sucha, a po zakończeniu starannie umyj ręce.</li></ol>',
        section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Nazwa produktu:</b> Viakal odkamieniacz bagno expres fi 470 ml</li><li>➡️ <b>Właściwości i wyróżniki:</b> Skuteczne odkamienianie</li></ul>',
        section_6_html: '<h2>⚠️ Bezpieczeństwo (CLP / GPSR)</h2><ul><li>➡️ <b>Hasło ostrzegawcze – UWAGA:</b> H319 – Działa drażniąco na oczy.</li></ul>'
    };

    const brokenCheck = validate_domain_and_chemical_logic(brokenSections, context);
    assert.equal(brokenCheck.valid, false, 'Zepsuty opis Viakal musi zostać odrzucony');
    const joinedErrs = brokenCheck.errors.join('\n');
    assert.ok(joinedErrs.includes('[Sprzeczność z etykietą – Bez spłukiwania]'), `Brak błędu Check 24 (spłukiwanie):\n${joinedErrs}`);
    assert.ok(joinedErrs.includes('[Brak wyróżnika Bez spłukiwania w Sekcji 5]'), `Brak błędu Check 24 (S5):\n${joinedErrs}`);
    assert.ok(joinedErrs.includes('[Sprzeczność wewnętrzna FAQ vs Sposób użycia]'), `Brak błędu Check 25:\n${joinedErrs}`);
    assert.ok(joinedErrs.includes('[Fałsz chemiczny – Parfum/Alergen]'), `Brak błędu Check 26:\n${joinedErrs}`);
    assert.ok(joinedErrs.includes('[Wyciek surowej nazwy ERP / literówka z katalogu]'), `Brak błędu Check 27:\n${joinedErrs}`);
    assert.ok(joinedErrs.includes('[Brak piktogramu CLP GHS07 w Sekcji 6]'), `Brak błędu Check 28:\n${joinedErrs}`);

    const cleanSections = {
        section_1_html: '<h2>⭐ Viakal Bagno Express Fiori di Primavera 470 ml</h2><p><b>Odkamieniacz w sprayu</b> o pojemności <b>470 ml</b> do bieżącego czyszczenia łazienki.</p><ul><li>✔️ <b>Kwiatowy zapach:</b> wariant Fiori di Primavera odświeża łazienkę zapachem wiosennych kwiatów.</li></ul>',
        section_2_html: '<h2>❓ Viakal Bagno Express Fiori di Primavera 470 ml – FAQ</h2><ul><li>❓ <b>Pytanie 1:</b> Do czego służy Viakal Bagno Express Fiori di Primavera 470 ml?</li><li>✔️ <b>Odpowiedź 1:</b> Do usuwania kamienia z ceramiki i armatury.</li><li>❓ <b>Pytanie 3:</b> Czy preparat wymaga spłukiwania?</li><li>✔️ <b>Odpowiedź 3:</b> Ma formułę bez spłukiwania — po rozpyleniu wystarczy przetrzeć powierzchnię ściereczką.</li></ul>',
        section_3_html: '<h2>⚙️ Składniki</h2><ul><li>⚙️ <b>Kompozycja zapachowa (Parfum):</b> nadaje preparatowi świeży zapach wiosennych kwiatów.</li></ul>',
        section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 4 – Wykończenie:</b> Przetrzyj powierzchnię czystą ściereczką bez konieczności spłukiwania wodą, a po zakończeniu starannie umyj ręce.</li></ol>',
        section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Nazwa produktu:</b> Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml</li><li>➡️ <b>Właściwości i wyróżniki:</b> Bez spłukiwania</li></ul>',
        section_6_html: '<h2>⚠️ Bezpieczeństwo (CLP / GPSR)</h2><ul><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> Piktogram zagrożenia – GHS07 (wykrzyknik – substancja drażniąca / uczulająca).</li><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze – UWAGA.</li><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi. Nie połykać.</li></ul>'
    };

    const cleanCheck = validate_domain_and_chemical_logic(cleanSections, context);
    assert.equal(cleanCheck.valid, true, `Poprawny opis nie powinien zgłaszać błędów, zgłoszono: ${cleanCheck.errors.join(' | ')}`);
});

test('Orchestrator — przekazuje oba zdjęcia (przód+tył) do A11/A10, nie serializuje base64 w state i zachowuje Wariant 2 (brak Sekcji 6 w description_extra4)', async () => {
    const origCall = aiWrapper.callAgentWithTelemetry;
    const origLoadData = global.loadProductDataAsync;
    const capturedAgentCalls = [];

    const dataUriFront = `data:image/jpeg;base64,${TINY_PNG_BASE64}`;
    const dataUriBack = `data:image/png;base64,${TINY_PNG_BASE64}`;

    const productMock = {
        text_fields: {
            name: 'Viakal odkamieniacz bagno expres fi 470 ml',
            features: {
                ...VIAKAL_VISION_FEATURES,
                'Skład': '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal',
                'Ostrzeżenia': 'UWAGA. H319 – Działa drażniąco na oczy. P102 – Chronić przed dziećmi.',
                'Sposób użycia': 'Spryskać powierzchnię, odczekać chwilę i przetrzeć ściereczką.',
                'Zdjęcie tyłu opakowania': 'https://example.invalid/viakal_back.jpg'
            }
        },
        imageUrl: dataUriFront,
        backImageUrl: dataUriBack,
        brand: { name: 'Viakal' }
    };

    const cleanS1 = '<h2>⭐ Viakal Bagno Express Fiori di Primavera 470 ml</h2><p><b>Odkamieniacz w sprayu</b> <b>470 ml</b> do codziennego czyszczenia łazienki w formule bez spłukiwania.</p><ul><li>✔️ <b>Bez spłukiwania:</b> wystarczy przetrzeć ściereczką.</li><li>✔️ <b>Kwiatowy zapach:</b> Fiori di Primavera odświeża łazienkę.</li><li>✔️ <b>Bezpieczne użycie:</b> usuwa osad z kamienia.</li></ul>';
    const cleanS2 = '<h2>❓ Viakal Bagno Express Fiori di Primavera 470 ml – pytania i odpowiedzi</h2><ul><li>❓ <b>Pytanie 1:</b> Do czego służy Viakal Bagno Express Fiori di Primavera 470 ml?</li><li>✔️ <b>Odpowiedź 1:</b> Spray do codziennego usuwania kamienia i osadów z armatury oraz ceramiki.</li><li>❓ <b>Pytanie 2:</b> Na jakich powierzchniach stosować ten preparat?</li><li>✔️ <b>Odpowiedź 2:</b> Na ceramice, umywalkach, wannach i chromowanej armaturze.</li><li>❓ <b>Pytanie 3:</b> Czy wymaga spłukiwania wodą?</li><li>✔️ <b>Odpowiedź 3:</b> Nie, ma formułę bez spłukiwania — po rozpyleniu wystarczy przetrzeć ściereczką.</li><li>❓ <b>Pytanie 4:</b> Jak działa skład preparatu?</li><li>✔️ <b>Odpowiedź 4:</b> Kwas rozpuszcza osady wapienne, a surfaktanty niejonowe ułatwiają usunięcie zabrudzeń z mydła.</li></ul>';
    const cleanS3 = '<h2>⚙️ Składniki aktywne</h2><p>Formuła sprayu do łazienki łączy substancje czyszczące z nutą zapachową.</p><ul><li>⚙️ <b>Niejonowe środki powierzchniowo czynne (Non-Ionic Surfactants):</b> obniżają napięcie powierzchniowe i usuwają osady z mydła.</li><li>⚙️ <b>Kompozycja zapachowa (Parfum):</b> nadaje preparatowi świeży zapach wiosennych kwiatów.</li></ul>';
    const cleanS4 = '<h2>✍️ Sposób użycia i zalecenia aplikacji</h2><p>Przed użyciem zapoznaj się z etykietą.</p><ol><li>✍️ <b>Krok 1 – Przygotowanie:</b> Przekręć dyszę spryskiwacza.</li><li>✍️ <b>Krok 2 – Aplikacja:</b> Rozpyl bezpośrednio na zabrudzoną ceramikę lub armaturę.</li><li>✍️ <b>Krok 3 – Wykończenie:</b> Przetrzyj czystą ściereczką bez konieczności spłukiwania wodą, a po pracy umyj ręce.</li></ol><p>Butelka 470 ml wystarcza na kilkadziesiąt aplikacji.</p><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie stosować na marmurze, kamieniu naturalnym ani aluminium.</p>';
    const cleanS5 = '<h2>⚖️ Specyfikacja produktu</h2><ul><li>➡️ <b>Nazwa produktu:</b> Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml</li><li>➡️ <b>Marka:</b> Viakal</li><li>➡️ <b>Pojemność:</b> 470 ml</li><li>➡️ <b>Właściwości i wyróżniki:</b> Bez spłukiwania</li></ul>';
    const cleanS6 = '<h2>⚠️ Klasyfikacja i ostrzeżenia bezpieczeństwa (CLP / GPSR)</h2><ul><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> Piktogram zagrożenia – GHS07 (wykrzyknik – substancja drażniąca / uczulająca).</li><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze – UWAGA.</li><li>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li></ul>';

    aiWrapper.callAgentWithTelemetry = async (callParams) => {
        capturedAgentCalls.push(callParams);
        if (callParams.agentId === '11') {
            return {
                result: {
                    product_identity: { exact_product_type: 'Odkamieniacz w sprayu bez spłukiwania', primary_regime: 'codzienne czyszczenie łazienki' },
                    domain_issues_detected: ['Wymagana weryfikacja zdjęcia tyłu pod kątem CLP GHS07'],
                    patches: [],
                    escalate_to_pro: true,
                    escalation_reason: 'TEST_MULTIMODAL_ESCALATION_TO_A10'
                },
                usage: { totalTokenCount: 100 }
            };
        }
        return {
            result: { patches: [] },
            usage: { totalTokenCount: 120 }
        };
    };

    try {
        const orch = new Orchestrator('8700216405348');
        orch.emitState = () => {};
        orch.writeBackToBaseLinker = () => {};
        orch.state.node_status['A0'] = 'OK';
        orch.state.back_pack_vision_done = true;
        orch.state.next_action = 'RUN_A11';
        orch.state.product_name = productMock.text_fields.name;
        orch.state.raw_erp_product_name = productMock.text_fields.name;
        orch.state.vision_extracted_features = { ...VIAKAL_VISION_FEATURES };
        orch.state.extracted_data = {
            product_name: { value: 'Viakal Bagno Express Fiori di Primavera 470 ml', source: 'baselinker' },
            brand: { value: 'Viakal' },
            inci: { value: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal' },
            detergent_composition: { value: '< 5% Non-Ionic Surfactants, Parfum, Hexyl Cinnamal' },
            warnings: { value: productMock.text_fields.features['Ostrzeżenia'] },
            usage: { value: productMock.text_fields.features['Sposób użycia'] },
            compliance: { data: { clp_signal_word: 'UWAGA', clp_pictograms: ['GHS07'] } },
            eu_responsible_person: { source: 'brand_registry', data: { name: 'Procter & Gamble S.r.l.', address_eu: 'Roma, Włochy' } }
        };
        orch.state.a7_result = {
            section_1_html: cleanS1,
            section_2_html: cleanS2,
            section_3_html: cleanS3,
            section_4_html: cleanS4,
            section_5_html: cleanS5,
            section_6_html: cleanS6
        };

        await orch.run(productMock);
        assert.equal(orch.state.node_status['A11'], 'OK');
        assert.equal(orch.state.node_status['A10'], 'OK');
        assert.equal(orch.state.next_action, 'FINISH');

        const a11Call = capturedAgentCalls.find(c => c.agentId === '11');
        const a10Call = capturedAgentCalls.find(c => c.agentId === '10');
        assert.ok(a11Call && Array.isArray(a11Call.images) && a11Call.images.length === 2, 'Agent 11 musi otrzymać zdjęcia przodu i tyłu');
        assert.ok(a10Call && Array.isArray(a10Call.images) && a10Call.images.length === 2, 'Agent 10 musi otrzymać zdjęcia przodu i tyłu');
        assert.ok(a11Call.images[0].label.includes('FRONT') && a11Call.images[1].label.includes('TYŁ'), 'Obrazy muszą posiadać etykiety ról FRONT/TYŁ');
        assert.ok(a11Call.prompt.includes('Viakal Bagno Express Fiori di Primavera'), 'Prompt A11 musi zawierać kanoniczną nazwę');
        assert.ok(a10Call.prompt.includes('"clp_pictograms"'), 'Prompt A10 musi zawierać piktogramy CLP');

        const serializedState = JSON.stringify(orch.state);
        assert.equal(serializedState.includes(TINY_PNG_BASE64), false, 'Surowe base64 nie mogą trafiać do state');

        assert.ok(orch.state.final_offer, 'final_offer musi zostać złożony');
        assert.ok(orch.state.final_offer.title.includes('Viakal Bagno Express Fiori di Primavera'), `Niepoprawny tytuł final_offer: ${orch.state.final_offer.title}`);
        assert.equal(/\bexpres\b/i.test(orch.state.final_offer.title), false);

        // Wariant 2: Sekcja 6 pozostaje poza opisem publicznym w description_extra4
        assert.ok(orch.state.final_offer.description_extra4.includes('Bez spłukiwania'));
        assert.equal(orch.state.final_offer.description_extra4.includes('Klasyfikacja i ostrzeżenia bezpieczeństwa'), false, 'Wariant 2: Sekcja 6 nie może wyciekać do publicznego description_extra4');
        assert.equal(orch.state.final_offer.description_extra4.includes('GHS07'), false, 'Wariant 2: Sekcja 6 nie może wyciekać do publicznego description_extra4');
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
        if (origLoadData !== undefined) global.loadProductDataAsync = origLoadData;
    }
});
