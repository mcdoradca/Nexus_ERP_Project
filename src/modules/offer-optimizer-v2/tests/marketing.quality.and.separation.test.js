const test = require('node:test');
const assert = require('node:assert/strict');

const validators = require('../validators');
const deterministicEngine = require('../services/deterministic-pipeline.engine');
const googleSuggestFaqService = require('../services/google-suggest-faq.service');
const { stripMarketingScareAndFillerBulletsFromSection3 } = require('../normalization');
const { Orchestrator, applySectionPatch, shouldEscalateToAgent10 } = require('../orchestrator');
const aiWrapper = require('../ai.wrapper');

test('ADR-0198 §K: Walidatory 29-31 odrzucają słowa-straszaki, konserwanty, wypełniacze i żargon w marketingu, ale chronią legalny EUH208 w Sekcji 6', async (t) => {
    await t.test('1. Dokładny cytat z produkcji (White Musk z listą alergenów i wymogami detergentowymi w s3) zostaje zablokowany', () => {
        const res = validators.validate_domain_and_chemical_logic({
            section_1_html: '<h2>⭐ Felce Azzurra Białe Piżmo płyn do płukania 2 L</h2><p>Skoncentrowany płyn do płukania tkanin.</p>',
            section_2_html: '<h2>❓ Najczęstsze pytania</h2><ul><li>❓ <b>Pytanie:</b> Na ile prań wystarcza płyn?</li><li>✔️ <b>Odpowiedź:</b> Opakowanie 2 L zapewnia wiele cykli płukania.</li></ul>',
            section_3_html: '<h2>⚙️ Składniki aktywne</h2><ul><li>⚙️ <b>Parfum (kompozycja zapachowa z nutami białego piżma oraz alergeny m.in. Alpha-Isomethyl Ionone, Citronellol, Coumarin, Geraniol, Limonene, Linalool):</b> nadaje płukanym materiałom zapach białego piżma, który zapewnia długotrwałe odświeżenie pranych ubrań, a obecne składniki zapachowe są ujawnione zgodnie z wymogami detergentowymi.</li></ul>',
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Odmierz zalecaną dawkę do szuflady pralki.</li></ol>'
        }, {
            productName: 'Felce Azzurra Białe Piżmo płyn do płukania 2 L',
            isChemical: true
        });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('Słowo-straszak / Prawny żargon w marketingu')), `Brak błędu 29: ${res.errors.join(' | ')}`);
        assert.ok(res.errors.some(e => e.includes('Cząsteczka alergenu zapachowego w Sekcji 3')), `Brak błędu 30: ${res.errors.join(' | ')}`);
    });

    await t.test('2. Wypełniacze (Aqua/Sól/BIT/MIT), żargon laboratoryjny, błędy gramatyczne, FAQ (o zapachu...) i kalki czyszczenia w płynie do płukania są blokowane', () => {
        const res = validators.validate_domain_and_chemical_logic({
            section_1_html: '<h2>⭐ Felce Azzurra płyn do płukania 2 L</h2><p>fabryczny płyn zmiękczający podczas sprzątaniu i podczas praniu.</p>',
            section_2_html: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Jak stosować Felce Azzurra (o zapachu białego piżma)?</li><li>✔️ <b>Odpowiedź:</b> Wlej do komory płukania.</li></ul>',
            section_3_html: '<h2>⚙️ Mechanizm działania</h2><p>Formuła wspiera rozbijania zabrudzeń z włókien.</p><ul><li>⚙️ <b>Aqua:</b> rozpuszczalnik nośnikowy bazy wodnej.</li><li>⚙️ <b>Sodium Chloride:</b> regulator lepkości mieszaniny.</li><li>⚙️ <b>Benzisothiazolinone:</b> stabilizator mikrobiologiczny chroniący płyn przed rozwojem bakterii i grzybów.</li></ul>',
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Dozuj zgodnie z tabelą.</li></ol>'
        }, {
            productName: 'Felce Azzurra Płyn do płukania tkanin 2 L',
            isChemical: true,
            features: { 'Kategoria': 'Płyny do płukania' }
        });
        assert.strictEqual(res.valid, false);
        const joined = res.errors.join(' | ');
        assert.ok(joined.includes('Wypełniacz / Konserwant w Sekcji 3'), `Oczekiwano błędu wypełniacza: ${joined}`);
        assert.ok(joined.includes('Żargon laboratoryjny'), `Oczekiwano błędu żargonu: ${joined}`);
        assert.ok(joined.includes('Błąd gramatyczny'), `Oczekiwano błędu gramatycznego: ${joined}`);
        assert.ok(joined.includes('Błąd wielkości litery'), `Oczekiwano błędu małej litery fabryczny: ${joined}`);
        assert.ok(joined.includes('Szablonowe FAQ w Sekcji 2'), `Oczekiwano błędu szablonowego FAQ: ${joined}`);
        assert.ok(joined.includes('Błąd domenowy Sekcji 3 – Płyn do płukania'), `Oczekiwano błędu domenowego zmiękczacza: ${joined}`);
    });

    await t.test('3. Legalny EUH208 z reakcją alergiczną w Sekcji 6 oraz bezpieczne zwroty "bez alergenów" w Sekcji 1 nie dają fałszywych alarmów', () => {
        const res = validators.validate_domain_and_chemical_logic({
            section_1_html: '<h2>⭐ Płyn do prania delikatnych tkanin 1 L</h2><p>Formuła bez alergenów i bez konserwantów (hipoalergiczny profil użytkowy).</p>',
            section_2_html: '<h2>❓ Najczęstsze pytania</h2><ul><li>❓ <b>Pytanie:</b> Do jakich tkanin przeznaczony jest płyn?</li><li>✔️ <b>Odpowiedź:</b> Sprawdzi się do codziennego prania bawełny i tkanin delikatnych.</li></ul>',
            section_3_html: '<h2>⚙️ Składniki aktywne i działanie formuły</h2><ul><li>⚙️ <b>Anionowe środki powierzchniowo czynne:</b> wspierają skuteczne odspajanie zabrudzeń w trakcie prania.</li></ul>',
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Odmierz porcję zakrętką.</li></ol>',
            section_6_html: '<h2>⚠️ Bezpieczeństwo stosowania i informacje CLP/GPSR</h2><ul><li>➡️ <b>Wytyczne bezpieczeństwa:</b> Chronić przed dziećmi. Nie połykać. Unikać kontaktu z oczami.</li><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> EUH208 – Zawiera Benzisothiazolinone, Alpha-Isomethyl Ionone, Hexyl Cinnamal. Może powodować wystąpienie reakcji alergicznej.</li></ul>'
        }, {
            productName: 'Płyn do prania delikatnych tkanin 1 L',
            isChemical: true
        });
        assert.strictEqual(res.valid, true, `Nieoczekiwane błędy przy legalnym EUH208 w s6 / "bez alergenów" w s1: ${res.errors.join(' | ')}`);
    });
});

test('ADR-0198 §K: Deterministyczna Sekcja 3, buildSection3FromA4Result, FAQ oraz sanitizery czyszczą składniki pod korzyści klienta', () => {
    // A. Płyn do płukania White Musk
    const softenerInci = '5-15% Cationic surfactants, <5% Non-ionic surfactants, Parfum (Alpha-Isomethyl Ionone, Citronellol, Coumarin, Geraniol, Limonene, Linalool), Benzisothiazolinone, Aqua, Sodium Chloride';
    const detSoftener = deterministicEngine.tryBuildDeterministicSection3({
        productName: 'Felce Azzurra Płyn do płukania Białe Piżmo 2 L',
        isChemical: true,
        detergentComposition: softenerInci,
        visionFeatures: { 'Rodzaj': 'płyn do płukania', 'Zapach': 'białe piżmo' }
    });
    assert.ok(detSoftener && detSoftener.section_3_html, 'Oczekiwano wygenerowania deterministycznej Sekcji 3 dla płynu do płukania');
    assert.ok(/kationow|zmiękcz|miękkość|włók/i.test(detSoftener.section_3_html), `Brak korzyści zmiękczającej w s3: ${detSoftener.section_3_html}`);
    assert.ok(/Parfum/i.test(detSoftener.section_3_html), 'Brak czystego punktu Parfum w s3');
    assert.strictEqual(/alergen|Alpha-Isomethyl|Citronellol|Coumarin|Geraniol|Limonene|Linalool|Benzisothiazolinone|\bAqua\b|Sodium Chloride|648\/2004|wymogi detergentowe|stabilizator|rozpuszczalnik nośnikowy|rozbijania zabrudzeń/i.test(detSoftener.section_3_html), false, `Wyciek niepożądanych treści w s3: ${detSoftener.section_3_html}`);
    assert.strictEqual(detSoftener.a4_result.detected_synergies.length <= 2, true);

    const validationSoftener = validators.validate_domain_and_chemical_logic({
        section_3_html: detSoftener.section_3_html
    }, {
        productName: 'Felce Azzurra Płyn do płukania Białe Piżmo 2 L',
        isChemical: true,
        visionFeatures: { 'Rodzaj': 'płyn do płukania' }
    });
    assert.strictEqual(validationSoftener.valid, true, `Deterministyczna s3 płynu do płukania powinna przejść walidację: ${validationSoftener.errors.join(' | ')}`);

    // B. buildSection3FromA4Result filtruje straszaki i stosuje kontekst płynu do płukania
    const builtFromA4 = deterministicEngine.buildSection3FromA4Result({
        category_type: 'HOUSEHOLD_CHEMISTRY',
        technical_benefits_aeo: [
            '<li>⚙️ <b>Kationowe surfaktanty:</b> wygładzają włókna i ułatwiają późniejsze prasowanie.</li>',
            '<li>⚙️ <b>Benzisothiazolinone:</b> stabilizator mikrobiologiczny chroniący płyn przed rozwojem bakterii.</li>',
            '<li>⚙️ <b>Parfum (alergeny: Citronellol, Limonene):</b> nadaje zapach ujawniony zgodnie z wymogami detergentowymi.</li>'
        ],
        detected_synergies: []
    }, true, null, {
        productName: 'Felce Azzurra Płyn do płukania Białe Piżmo 2 L',
        features: { 'Rodzaj': 'płyn do płukania' }
    });
    assert.ok(builtFromA4.includes('Kationowe surfaktanty'));
    assert.ok(/miękkość|zmiękcz|włók/i.test(builtFromA4), `Nagłówek/lead powinien dotyczyć zmiękczania tkanin: ${builtFromA4}`);
    assert.strictEqual(/Benzisothiazolinone|Citronellol|Limonene|alergen|stabilizator/i.test(builtFromA4), false, `buildSection3FromA4Result nie wyczyścił straszaków: ${builtFromA4}`);

    // C. stripMarketingScareAndFillerBulletsFromSection3 zachowuje fallback, gdy usunięcie opróżniłoby listę
    const keptFallback = stripMarketingScareAndFillerBulletsFromSection3('<h2>⚙️ Składniki</h2><ul><li>⚙️ <b>Aqua:</b> baza wodna.</li></ul>');
    assert.ok(keptFallback.includes('<li>'), 'Cleaner nie może zwracać pustego <ul></ul> gdy usunięto by wszystkie punkty');

    // D. Wielkość litery fabryczny + poprawna gramatyka "podczas"
    const fixedText = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
        '<p>Oryginalny odplamiacz do tkanin. Podczas sprzątaniu oraz podczas praniu działa natychmiastowo.</p>',
        { productName: 'Vanish Oxi 1 L', isSafetySection: false }
    );
    assert.ok(fixedText.includes('<p>Fabryczny odplamiacz'), `Brak poprawnej wielkiej litery po zamianie "Oryginalny": ${fixedText}`);
    assert.strictEqual(fixedText.includes('<p>fabryczny'), false);
    assert.ok(/Podczas sprzątania/i.test(fixedText));
    assert.ok(/podczas prania/i.test(fixedText));

    // E. Google Suggest FAQ bez robotycznego "(o zapachu ...)" dla wszystkich 4 wariantów
    for (const sample of [
        {
            productName: 'Felce Azzurra Płyn do płukania Białe Piżmo 2 L',
            brand: 'Felce Azzurra',
            capacity: '2 l',
            scent: 'białe piżmo',
            category: 'Płyny do płukania tkanin',
            isChemical: true,
            visionFeatures: { 'Rodzaj': 'płyn do płukania', 'Zapach': 'białe piżmo' }
        },
        {
            productName: 'Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu 470 ml',
            brand: 'Viakal',
            capacity: '470 ml',
            scent: 'wiosenne kwiaty',
            category: 'Odkamieniacze do łazienki',
            isChemical: true,
            visionFeatures: { 'Przeznaczenie (Front)': 'do kabin prysznicowych i armatury', 'Zapach': 'wiosenne kwiaty' }
        }
    ]) {
        const catInfo = googleSuggestFaqService.detectCanonicalSearchCategory(sample);
        const naturalName = googleSuggestFaqService.formatNaturalProductName(sample.productName, sample.brand, sample.capacity);
        for (const variantIndex of [0, 1, 2, 3]) {
            const faq = googleSuggestFaqService.buildFourPillarQuestions({
                ...sample,
                catInfo,
                naturalName,
                variantIndex
            });
            assert.ok(Array.isArray(faq.recommended_search_questions) && faq.recommended_search_questions.length > 0, 'Oczekiwano listy rekomendowanych pytań FAQ');
            assert.strictEqual(/\(\s*o\s+zapachu\s+/i.test(JSON.stringify(faq)), false, `FAQ nadal zawiera szablonowe "(o zapachu ...)": ${JSON.stringify(faq)}`);
        }
    }
});

test('ADR-0198: A4 i A6 otrzymują zdjęcia przód/tył bez base64 w state, a applySectionPatch obsługuje <b>/<strong> i eskalację A11', async () => {
    // 1. Unit tests applySectionPatch
    const tagEquiv = applySectionPatch('<p><b>Parfum:</b> alergeny w składzie.</p>', '<p><strong>Parfum:</strong> alergeny w składzie.</p>', '<p><strong>Parfum:</strong> nuty kwiatowe.</p>');
    assert.strictEqual(tagEquiv.applied, true);
    assert.strictEqual(tagEquiv.mode, 'tag_equivalent');
    assert.strictEqual(tagEquiv.html, '<p><strong>Parfum:</strong> nuty kwiatowe.</p>');

    const missPatch = applySectionPatch('<p>Czysty tekst</p>', '<p>Nieistniejący fragment</p>', '<p>Nowy</p>');
    assert.strictEqual(missPatch.applied, false);

    // 2. Unit test shouldEscalateToAgent10 z unappliedPatchesCount > 0
    const escUnapplied = shouldEscalateToAgent10({
        a11Result: { product_identity: { exact_product_type: 'Płyn do płukania', primary_regime: 'Detergenty' }, escalate_to_pro: false },
        a11Status: 'OK',
        unappliedPatchesCount: 2
    });
    assert.strictEqual(escUnapplied.escalate, true);
    assert.ok(escUnapplied.reason.startsWith('A11_UNAPPLIED_PATCHES'));

    // 3. E2E mock Orchestrator: RUN_A4 -> RUN_A5 -> RUN_A6 -> RUN_A7 -> RUN_A11 (z niedopasowanym patchem -> eskalacja A10) -> RUN_A10 -> FINISH
    const origCall = aiWrapper.callAgentWithTelemetry;
    const callsByAgent = new Map();
    const FAKE_FRONT_B64 = Buffer.from('fake-front-jpeg-bytes').toString('base64');
    const FAKE_BACK_B64 = Buffer.from('fake-back-jpeg-bytes').toString('base64');
    const validSoftenerFaq = '<h2>❓ Najczęstsze pytania</h2><ul>' +
        '<li>❓ <b>Pytanie:</b> Do jakich tkanin nadaje się płyn Felce Azzurra Białe Piżmo 2 L?</li><li>✔️ <b>Odpowiedź:</b> Odpowiedni do codziennego płukania bawełny, lnu oraz tkanin mieszanych.</li>' +
        '<li>❓ <b>Pytanie:</b> Jak dawkować koncentrat do płukania podczas prania w pralce?</li><li>✔️ <b>Odpowiedź:</b> Odmierzoną ilość wlej bezpośrednio do przegrody płukania przed startem programu.</li>' +
        '<li>❓ <b>Pytanie:</b> Czy płyn ułatwia późniejsze prasowanie odzieży?</li><li>✔️ <b>Odpowiedź:</b> Tak, kationowe składniki pielęgnujące wygładzają włókna i ograniczają gniecenie materiału.</li>' +
        '<li>❓ <b>Pytanie:</b> Jak długo utrzymuje się zapach białego piżma?</li><li>✔️ <b>Odpowiedź:</b> Kompozycja zapachowa pozostawia świeży aromat na wysuszonych ubraniach.</li>' +
        '</ul>';
    const validSoftenerS1 = '<h2>⭐ Felce Azzurra Białe Piżmo płyn do płukania 2 L</h2><p>Skoncentrowany płyn do płukania tkanin o nucie białego piżma i pojemności <b>2 L</b>.</p><ul><li>✔️ <b>Miękkość włókien:</b> wygładza strukturę tkanin podczas płukania.</li><li>✔️ <b>Wygodne dozowanie:</b> poręczna butelka o pojemności 2 L.</li><li>✔️ <b>Zapach:</b> klasyczna kompozycja białego piżma.</li></ul>';
    const validSoftenerS4 = '<h2>✍️ Sposób użycia i dawkowanie</h2><p>Przed użyciem zapoznaj się z zaleceniami producenta na opakowaniu.</p><ol><li>✍️ <b>Krok 1 – Odmierzanie:</b> Odmierz porcję nakrętką zgodnie z wielkością wsadu pralki.</li><li>✍️ <b>Krok 2 – Wlewanie:</b> Wlej płyn do przegrody pralki przeznaczonej na środek do płukania.</li></ol><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie wlewać bezpośrednio na suche tkaniny.</p>';

    aiWrapper.callAgentWithTelemetry = async (opts) => {
        callsByAgent.set(String(opts.agentId), opts);
        if (String(opts.agentId) === '4') {
            return {
                result: {
                    category_type: 'HOUSEHOLD_CHEMISTRY',
                    technical_benefits_aeo: [
                        '<li>⚙️ <b>Kationowe środki powierzchniowo czynne:</b> wygładzają włókna tkanin i ograniczają elektryzowanie po praniu.</li>',
                        '<li>⚙️ <b>Parfum (kompozycja zapachowa):</b> pozostawia na ubraniach nutę białego piżma.</li>'
                    ],
                    detected_synergies: [],
                    mandatory_clp_warnings: []
                },
                usage: { totalTokenCount: 100 }
            };
        }
        if (String(opts.agentId) === '5') {
            return {
                result: {
                    mandatory_safety_warnings: [],
                    preserved_minor_flaws_for_pratfall: ['Unikać wlewania bezpośrednio na tkaniny']
                },
                usage: { totalTokenCount: 50 }
            };
        }
        if (String(opts.agentId) === '6') {
            return {
                result: {
                    section_1_html: validSoftenerS1,
                    section_2_html: validSoftenerFaq,
                    section_4_html: validSoftenerS4
                },
                usage: { totalTokenCount: 120 }
            };
        }
        if (String(opts.agentId) === '7') {
            return {
                result: {
                    section_1_html: validSoftenerS1,
                    section_2_html: validSoftenerFaq,
                    section_4_html: validSoftenerS4
                },
                usage: { totalTokenCount: 80 }
            };
        }
        if (String(opts.agentId) === '11') {
            return {
                result: {
                    product_identity: { exact_product_type: 'Płyn do płukania tkanin', primary_regime: 'Rozp. 648/2004' },
                    domain_issues_detected: ['Test niedopasowanego find_exact'],
                    patches: [
                        {
                            target_section: 'section_1_html',
                            find_exact: 'NIEISTNIEJACY_FRAGMENT_DO_WYZWOLENIA_A10',
                            replace_with: 'OK',
                            justification: 'Wymuszenie weryfikacji A10 po niedopasowanym patchu A11'
                        }
                    ],
                    escalate_to_pro: false
                },
                usage: { totalTokenCount: 60 }
            };
        }
        if (String(opts.agentId) === '10') {
            return {
                result: { patches: [] },
                usage: { totalTokenCount: 90 }
            };
        }
        return { result: {}, usage: { totalTokenCount: 10 } };
    };

    try {
        const orch = new Orchestrator('8001280030833');
        orch._frontImageAsset = { mimeType: 'image/jpeg', base64: FAKE_FRONT_B64 };
        orch._backImageAsset = { mimeType: 'image/jpeg', base64: FAKE_BACK_B64 };
        orch.state.is_full_pipeline_run = true;
        orch.state.chemical_route = true;
        orch.state.chemical_route_reasons = ['CATEGORY_CHEMICAL'];
        orch.state.next_action = 'RUN_A4';
        orch.state.extracted_data = {
            product_name: { value: 'Felce Azzurra Białe Piżmo płyn do płukania 2 L' },
            brand: { value: 'Felce Azzurra' },
            capacity: { value: '2 l' },
            inci: { value: '5-15% Cationic surfactants, <5% Non-ionic surfactants, Parfum' },
            eu_responsible_person: {
                source: 'brand_registry',
                data: { name: 'Paglieri S.p.A.', address_eu: 'S.S. 10 per Genova km 98, 15122 Alessandria, Włochy' }
            }
        };
        orch.state.a1_result = { country_of_origin: 'Włochy' };
        orch.state.a2_result = { sentiment_available: false };

        const pimMock = {
            ean: '8001280030833',
            text_fields: {
                name: 'Felce Azzurra Białe Piżmo płyn do płukania 2 L',
                features: {
                    'Kategoria': 'Płyny do płukania',
                    'Rodzaj': 'płyn do płukania',
                    'Marka': 'Felce Azzurra',
                    'Producent': 'Paglieri S.p.A.',
                    'Kraj pochodzenia': 'Włochy',
                    'Pojemność': '2 l',
                    'Zapach': 'białe piżmo'
                }
            }
        };

        await orch.run(pimMock);

        assert.strictEqual(orch.state.next_action, 'FINISH', `Potok powinien dotrzeć do FINISH (alert: ${orch.state.hitl_alert || 'brak'})`);
        assert.ok(callsByAgent.has('4'), 'A4 powinien zostać wywołany');
        assert.strictEqual(callsByAgent.get('4').images?.length, 2, 'A4 powinien otrzymać zdjęcia przód i tył');
        assert.ok(callsByAgent.has('6'), 'A6 powinien zostać wywołany');
        assert.strictEqual(callsByAgent.get('6').images?.length, 2, 'A6 powinien otrzymać zdjęcia przód i tył');
        assert.ok(callsByAgent.has('11'), 'A11 powinien zostać wywołany');
        assert.ok(callsByAgent.has('10'), 'Niedopasowany patch A11 powinien eskalować do A10 Pro');
        assert.ok(String(orch.state.a11_escalation_reason || '').includes('A11_UNAPPLIED_PATCHES'));
        assert.ok((orch.state.normalization_warnings || []).some(w => w.includes('A11_PATCH_NOT_FOUND')));

        const serializedState = JSON.stringify(orch.state);
        assert.strictEqual(serializedState.includes(FAKE_FRONT_B64), false, 'Base64 zdjęcia frontu nie może trafiać do state');
        assert.strictEqual(serializedState.includes(FAKE_BACK_B64), false, 'Base64 zdjęcia tyłu nie może trafiać do state');
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
    }
});
