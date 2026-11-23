const test = require('node:test');
const assert = require('node:assert/strict');

const {
    COMPLIANCE_RISK_CATEGORIES,
    scanStrictStopwords,
    scanAllegroComplianceRisks,
    normalizeHighlightItem,
    sanitizeLabelHighlights,
    sanitizeAllegroMarketingText,
    auditOfferDraftCompliance
} = require('../services/allegro-compliance.policy');
const deterministicEngine = require('../services/deterministic-pipeline.engine');
const visionExtractor = require('../vision-extractor.service');
const aiWrapper = require('../ai.wrapper');
const validators = require('../validators');
const { Orchestrator, sanitizeSection5Html } = require('../orchestrator');
const allegroMapper = require('../../../utils/allegro_mapper');
const baselinkerExportService = require('../baselinker.export.service');
const { buildVonHalskyOfferPayload } = require('../../../utils/vonhalsky_mapper');

const DUMMY_PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('ADR-0194: Systemowa tarcza zgodności Allegro — przypadek produkcyjny Viakal 8700216906159', async (t) => {
    await t.test('1. buildDeterministicSection5 i cleanFeaturesForPrompt neutralizują slogany z frontu/tyłu Viakal (8700216906159)', () => {
        const legacyDirtyFeatures = {
            'Marka': 'Viakal',
            'Producent': 'Procter & Gamble',
            'Postać': 'w sprayu',
            'Pojemność / Waga': '800 ml',
            'Wyróżniki (Etykieta Front)': 'Nr 1 do Twojej łazienki, Rekomendowany przez Ideal Standard, Format XXL, Technologia zapobiegająca powstawaniu kropel, Nr 1 przeciw kamieniowi, Pomaga zwalczać nieprzyjemne zapachy',
            'Wyróżniki / Certyfikaty (Etykieta)': 'Najlepiej sprzedający się produkt tego typu we Włoszech (*il più venduto in Italia)'
        };

        // 1A. cleanFeaturesForPrompt oczyszcza stare brudne pola zanim zobaczy je LLM (A6/A11/A10)
        const cleanedForPrompt = deterministicEngine.cleanFeaturesForPrompt(legacyDirtyFeatures);
        const promptHighlights = cleanedForPrompt['Wyróżniki (Etykieta Front)'] || '';
        assert.ok(!/Ideal Standard|Format XXL|Nr 1|Twojej łazienki|Technologia|zwalczać|Najlepiej sprzedający|Wysoka skuteczność/i.test(promptHighlights),
            `Brudne slogany wyciekły do promptu: ${promptHighlights}`);
        assert.equal(cleanedForPrompt['Wyróżniki / Certyfikaty (Etykieta)'], undefined,
            'Klucz zawierający wyłącznie ranking sprzedaży we Włoszech musi zostać całkowicie pominięty');
        assert.ok(promptHighlights.includes('Ogranicza powstawanie kropel i zacieków'));
        assert.ok(promptHighlights.includes('Neutralizuje nieprzyjemne zapachy'));

        // 1B. Deterministyczna Sekcja 5 nie może przepuścić "Wysoka skuteczność...", "Ideal Standard", "Format XXL", "Chętnie wybierany..."
        const s5 = deterministicEngine.buildDeterministicSection5({
            gtin: '8700216906159',
            productName: 'Viakal odkamieniacz classic 800 ml',
            brand: 'Viakal',
            manufacturer: 'Procter & Gamble',
            capacity: '800 ml',
            countryOfOrigin: 'Unia Europejska',
            features: legacyDirtyFeatures,
            visionFeatures: {
                'Wyróżniki (Etykieta Front)': legacyDirtyFeatures['Wyróżniki (Etykieta Front)']
            }
        });

        assert.ok(!/Ideal Standard|Format XXL|Wysoka skuteczność|Chętnie wybierany|Najlepiej sprzedający|do Twojej łazienki|Technologia|zwalczać|Nr 1|il più venduto/i.test(s5),
            `Moduł 5 nadal zawiera zakazane zwroty reklamowe: ${s5}`);
        assert.ok(s5.includes('Ogranicza powstawanie kropel i zacieków'));
        assert.ok(s5.includes('Neutralizuje nieprzyjemne zapachy'));
        assert.deepStrictEqual(validators.scan_allegro_implicit_risks(s5, { sectionType: 'section5', brand: 'Viakal' }), []);

        // 1C. Gdy wyróżniki zawierają wyłącznie czyste reklamy, wiersz "Właściwości i wyróżniki" nie powstaje
        const s5AdsOnly = deterministicEngine.buildDeterministicSection5({
            gtin: '8700216906159',
            productName: 'Viakal odkamieniacz classic 800 ml',
            brand: 'Viakal',
            manufacturer: 'Procter & Gamble',
            features: {
                'Wyróżniki (Etykieta Front)': 'Nr 1 w łazience, Rekomendowany przez Ideal Standard, Format XXL, Najlepiej sprzedający się produkt we Włoszech'
            }
        });
        assert.equal(s5AdsOnly.includes('Właściwości i wyróżniki'), false);
    });

    await t.test('2. sanitizeHtmlClaimsAndStopwords nie zamienia już "Nr 1" na "wysoka skuteczność" ani nie zostawia "w formacie XXL"', () => {
        const legacyS2 = '<p>Pojemność <b>800 ml w formacie XXL</b> z precyzyjnym atomizerem. Nr 1 do Twojej łazienki, rekomendowany przez Ideal Standard, pomaga zwalczać nieprzyjemne zapachy.</p>';
        const cleaned = deterministicEngine.sanitizeHtmlClaimsAndStopwords(legacyS2, {
            productName: 'Viakal odkamieniacz classic 800 ml',
            brand: 'Viakal'
        });

        assert.ok(!/w formacie XXL|XXL|Ideal Standard|Nr 1|wysoka skuteczność|wysoka wydajność|do Twojej łazienki|zwalczać/i.test(cleaned),
            `Po sanityzacji pozostały ślady marketingu lub dawnego zamiennika: ${cleaned}`);
        assert.ok(cleaned.includes('800 ml'));
        assert.ok(/neutralizuje nieprzyjemne zapachy/i.test(cleaned));
    });

    await t.test('3. sanitizeSection5Html czyści nawet ręcznie wygenerowaną lub starszą Sekcję 5 z obcych marek i hypeu', () => {
        const dirtyS5 = '<h2>⚖️ Specyfikacja</h2><ul>' +
            '<li>➡️ <b>Marka:</b> Viakal</li>' +
            '<li>➡️ <b>Właściwości i wyróżniki:</b> Wysoka skuteczność do Twojej łazienki, Rekomendowany przez Ideal Standard, Format XXL, Chętnie wybierany produkt na rynku włoskim, Technologia zapobiegająca powstawaniu kropel</li>' +
            '</ul>';
        const cleaned = sanitizeSection5Html(dirtyS5, { product_name: 'Viakal odkamieniacz 800 ml', brand: 'Viakal' });
        assert.ok(!/Ideal Standard|Format XXL|Chętnie wybierany|Wysoka skuteczność|Twojej łazienki|Technologia/i.test(cleaned), cleaned);
        assert.ok(cleaned.includes('Ogranicza powstawanie kropel i zacieków'), cleaned);
    });
});

test('ADR-0194: Rzeczywiste etykiety katalogowe — utrzymanie faktów vs odrzucenie haseł reklamowych i BPR/CE', () => {
    const mixedCatalogList = [
        'Nowa mocniejsza formuła',
        'Skuteczny również na zimno',
        'Usuwa pozostałości po pieczeniu',
        'Szybkie i gwarantowane działanie',
        'Formula potente',
        '100% Higieniczna czystość',
        'Potere sbiancante',
        'Super odtłuszczacz',
        'Plastik w co najmniej 30% z recyklingu',
        'Butelka w pełni nadająca się do recyklingu',
        'DERMATOLOGICAMENTE TESTATO',
        'VEGANOK',
        'NICHEL CHROMO COBALT TESTED',
        '97% INGREDIENTI DI ORIGINE NATURALE',
        'antybakteryjny',
        'SWEET HOME Luxury',
        'Diffusore Ambiente',
        'CE',
        'Bez smug',
        'Nie rysuje powierzchni'
    ].join(', ');

    const res = sanitizeLabelHighlights(mixedCatalogList, { isMedicalDevice: false });
    const joined = res.text;

    // Muszą zniknąć:
    for (const forbidden of [
        'Nowa mocniejsza formuła', 'gwarantowane', 'Formula potente', '100%',
        'Potere sbiancante', 'Super odtłuszczacz', 'antybakteryjny', 'SWEET HOME Luxury',
        'Diffusore Ambiente', 'w pełni'
    ]) {
        assert.ok(!joined.toLowerCase().includes(forbidden.toLowerCase()), `Zakazana fraza "${forbidden}" nie mogła przejść: ${joined}`);
    }
    assert.ok(!/\bCE\b/.test(joined), `Nielegalne CE dla produktu niemedycznego nie mogło przejść: ${joined}`);

    // Muszą zostać zachowane lub znormalizowane na rzetelne fakty polskie:
    for (const expectedFact of [
        'Skuteczny również na zimno',
        'Usuwa pozostałości po pieczeniu',
        'Higieniczna czystość',
        'Plastik w co najmniej 30% z recyklingu',
        'Butelka nadająca się do recyklingu',
        'Testowany dermatologicznie',
        'Certyfikat VEGANOK',
        'Testowany na obecność niklu, chromu i kobaltu',
        '97% składników pochodzenia naturalnego',
        'Bez smug',
        'Nie rysuje powierzchni'
    ]) {
        assert.ok(joined.includes(expectedFact), `Oczekiwany fakt "${expectedFact}" zaginął w: ${joined}`);
    }

    assert.equal(normalizeHighlightItem('   ', {}), null);
    assert.equal(normalizeHighlightItem('CE', { isMedicalDevice: true }), 'CE');
});

test('ADR-0194: Agent 0 Vision OCR blokuje slogany reklamowe z przodu i tyłu opakowania już przy odczycie', async () => {
    const origCall = aiWrapper.callAgentWithTelemetry;
    try {
        aiWrapper.callAgentWithTelemetry = async ({ agentId, prompt }) => {
            assert.equal(agentId, '0');
            if (prompt.includes('przedniej etykiety')) {
                return {
                    result: {
                        pojemnosc_waga: '800 ml',
                        postac: 'spray',
                        dozownik: 'atomizer / spray',
                        przeznaczenie_front: 'usuwanie kamienia do Twojej łazienki',
                        glowne_hasla_front: [
                            'N°1 in Italia',
                            'Rekomendowany przez Ideal Standard',
                            'Format XXL',
                            'Technologia zapobiegająca powstawaniu kropel',
                            'Bez smug'
                        ],
                        kluczowe_skladniki_front: []
                    },
                    usage: { totalTokenCount: 100 }
                };
            }
            return {
                result: {
                    has_ingredients_label: true,
                    inci: 'AQUA, CITRIC ACID, NON-IONIC SURFACTANTS, PARFUM',
                    warnings: 'UWAGA. H315. P102 – Chronić przed dziećmi.',
                    certifications_and_claims: 'Najlepiej sprzedający się produkt we Włoszech (*il più venduto in Italia), testowany dermatologicznie'
                },
                usage: { totalTokenCount: 120 }
            };
        };

        const frontRes = await visionExtractor.extractFrontPackFeatures([DUMMY_PNG_URI], '8700216906159');
        assert.equal(frontRes.pimFeatures['Wyróżniki (Etykieta Front)'], 'Ogranicza powstawanie kropel i zacieków, Bez smug');
        assert.ok(!/Twojej łazienki/i.test(frontRes.pimFeatures['Przeznaczenie (Front)']));

        const backRes = await visionExtractor.extractInciFromBackPack([DUMMY_PNG_URI], '8700216906159');
        assert.equal(backRes.pimFeatures['Wyróżniki / Certyfikaty (Etykieta)'], 'testowany dermatologicznie');

        // Gdy etykieta frontowa zwróci wyłącznie czyste hasła reklamowe -> klucz Wyróżniki (Etykieta Front) NIE powstaje
        aiWrapper.callAgentWithTelemetry = async () => ({
            result: {
                postac: 'płyn',
                dozownik: 'pompka',
                glowne_hasla_front: ['Nr 1', 'Format XXL', 'Rekomendowany przez Ideal Standard']
            },
            usage: {}
        });
        const adsOnlyFront = await visionExtractor.extractFrontPackFeatures([DUMMY_PNG_URI], '8700216906159');
        assert.equal(adsOnlyFront.pimFeatures['Wyróżniki (Etykieta Front)'], undefined);
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
    }
});

test('ADR-0194: Ochrona legalnych nazw marek (Dual Power), Twardości włosia (Ultra Soft) i nietykalność Sekcji 6 CLP/GPSR', () => {
    // 1. Marka "Dual Power" i poprawny opis bez szorowania nie dają fałszywych alarmów
    const cleanBrandOffer = auditOfferDraftCompliance({
        title: 'Dual Power odtłuszczacz w sprayu 750 ml',
        brand: 'Dual Power',
        htmlContent: {
            sekcja1: '<h2>⭐ Dual Power odtłuszczacz 750 ml</h2><p>Skoncentrowany płyn do kuchni usuwający tłuszcz bez szorowania. Świetny do blatów i okapów.</p>',
            sekcja5: '<h2>⚖️ Parametry</h2><ul><li>➡️ <b>Marka:</b> Dual Power</li><li>➡️ <b>Twardość włosia:</b> Ultra Soft</li></ul>',
            sekcja6: '<h2>⚠️ Bezpieczeństwo GPSR/CLP</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P303+P361+P353 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Natychmiast zdjąć całą zanieczyszczoną odzież.</li><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P310 – Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ.</li></ul>'
        }
    });
    assert.equal(cleanBrandOffer.clean, true, `Nie powinno być fałszywych alarmów: ${JSON.stringify(cleanBrandOffer.issues)}`);

    // 2. Sekcja 6 (CLP) jest całkowicie nietykalna nawet dla słowa "Natychmiast" czy "zwalczać" w ustawowym zwrocie
    const clpS6 = '<p>⚠️ <b>Ostrzeżenie CLP/GPSR:</b> P303+P361+P353 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Natychmiast zdjąć całą zanieczyszczoną odzież.</p>';
    const sanitizedS6 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(clpS6, { isSafetySection: true });
    assert.equal(sanitizedS6, clpS6, 'Sekcja 6 CLP nie może ulec żadnym modyfikacjom marketingowym');

    // 3. Nawet w Sekcji 6 zakazane jest słowo "oryginalny"
    const s6Orig = auditOfferDraftCompliance({
        htmlContent: { sekcja6: '<p>Przechowywać w oryginalnym opakowaniu.</p>' }
    });
    assert.equal(s6Orig.clean, false);
    assert.ok(s6Orig.issues.some(i => i.section === 'sekcja6' && /oryginalnym/i.test(i.word)));

    // 4. Kategorie policy mają zdefiniowane wszystkie 8 klas ryzyka
    assert.equal(Object.keys(COMPLIANCE_RISK_CATEGORIES).length, 8);
});

test('ADR-0194: Walidatory i Orkiestrator wykrywają ukryte ryzyka Allegro i nie pozwalają na SKIPPED_CLEAN', async () => {
    // 1. validate_section5_compliance odrzuca brudny Moduł 5 ze zrzutu ekranu
    const dirtyS5 = '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Właściwości i wyróżniki:</b> Wysoka skuteczność do Twojej łazienki, Rekomendowany przez Ideal Standard, Format XXL, Technologia zapobiegająca powstawaniu kropel, Chętnie wybierany produkt na rynku włoskim</li></ul>';
    const v5 = validators.validate_section5_compliance(dirtyS5, { product_name: 'Viakal 800 ml' });
    assert.equal(v5.valid, false);
    assert.ok(v5.errors.some(e => e.includes('[Sekcja 5 Marketing/Allegro]')));

    // 2. Skaner wykrywa zarówno jawne, jak i ukryte triggery (ekologiczny bez certyfikatu, technologia, zwalczać, natychmiastowy)
    const sneakyHtml = '<p>Ekologiczny płyn z technologią zapobiegającą kamieniowi, błyskawicznie usuwa osad bez wysiłku i pomaga zwalczać zapachy. Rekomendowany przez Ideal Standard.</p>';
    const risks = scanAllegroComplianceRisks(sneakyHtml, { sectionType: 'description' });
    assert.ok(risks.some(r => r.category === 'UNVERIFIED_GREENWASHING'));
    assert.ok(risks.some(r => r.category === 'UNSUBSTANTIATED_SLOGANS_TECH'));
    assert.ok(risks.some(r => r.category === 'OVERCLAIM_QUASI_BIOCIDAL'));
    assert.ok(risks.some(r => r.category === 'THIRD_PARTY_ENDORSEMENT'));
    assert.ok(scanStrictStopwords(sneakyHtml).length >= 2);

    // 3. Gdy A11 przepuści opis z ukrytym ryzykiem, Orkiestrator eskaluje do A10 Pro (NIE SKIPPED_CLEAN)
    const orch = new Orchestrator('8700216906159');
    orch.state.is_full_pipeline_run = false; // wyłącza deterministyczną samonaprawę S5 by sprawdzić czy audyt po A11 eskaluje do A10
    orch.state.next_action = 'RUN_A11';
    orch.state.extracted_data = {
        product_name: { value: 'Viakal odkamieniacz classic 800 ml' },
        brand: { value: 'Viakal' },
        capacity: { value: '800 ml' },
        inci: { value: 'Aqua, Citric Acid, Parfum' },
        eu_responsible_person: { source: 'brand_registry', data: { name: 'Procter & Gamble', address_eu: 'Roma, Włochy' } }
    };
    orch.state.a7_result = {
        section_1_html: '<h2>⭐ Viakal 800 ml</h2><p>Skuteczny odkamieniacz <b>800 ml</b> do łazienki.</p><ul><li>✔️ <b>Kamień:</b> usuwa osady.</li></ul>',
        section_2_html: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Jak stosować?</li><li>✔️ <b>Odpowiedź:</b> Rozpylić na powierzchnię.</li></ul>',
        section_3_html: '<h2>⚙️ Składniki</h2><ul><li>⚙️ <b>Citric Acid:</b> usuwa kamień.</li></ul>',
        section_4_html: '<h2>✍️ Użycie</h2><ol><li>✍️ <b>Krok 1:</b> Nanieś.</li></ol><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie używać na marmurze.</p>',
        section_5_html: dirtyS5,
        section_6_html: '<h2>⚠️ Bezpieczeństwo</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li></ul>'
    };

    const origCall = aiWrapper.callAgentWithTelemetry;
    const calledAgents = [];
    try {
        aiWrapper.callAgentWithTelemetry = async ({ agentId, prompt }) => {
            calledAgents.push(agentId);
            if (agentId === '11') {
                return {
                    result: {
                        product_identity: { exact_product_type: 'Odkamieniacz w sprayu', primary_regime: 'okresowy' },
                        domain_issues_detected: [],
                        patches: [],
                        escalate_to_pro: false
                    },
                    usage: {}
                };
            }
            if (agentId === '10') {
                assert.ok(prompt.includes('Ideal Standard'), 'A10 musi otrzymać diagnozę ryzyka z Ideal Standard');
                return {
                    result: {
                        patches: [
                            {
                                target_section: 'section_5_html',
                                find_exact: 'Wysoka skuteczność do Twojej łazienki, Rekomendowany przez Ideal Standard, Format XXL, Technologia zapobiegająca powstawaniu kropel, Chętnie wybierany produkt na rynku włoskim',
                                replace_with: 'Ogranicza powstawanie kropel i zacieków',
                                justification: 'Usunięcie haseł reklamowych, obcej marki i hype XXL'
                            }
                        ]
                    },
                    usage: {}
                };
            }
            return { result: {}, usage: {} };
        };

        await orch.run({
            text_fields: {
                name: 'Viakal odkamieniacz classic 800 ml',
                features: { Producent: 'Procter & Gamble' }
            }
        });
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
    }

    assert.deepStrictEqual(calledAgents, ['11', '10']);
    assert.equal(orch.state.node_status['A10'], 'OK');
    assert.ok(!orch.state.a10_result.section_5_html.includes('Ideal Standard'));
});

test('ADR-0194: Bramka zgodności w Pre-flight eksportów (Allegro, BaseLinker, Von Halsky)', async () => {
    const dirtyHtmlContent = {
        sekcja1: '<h2>⭐ Viakal 800 ml</h2><p>Skuteczny spray.</p>',
        sekcja2: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Na ile wystarcza?</li><li>✔️ <b>Odpowiedź:</b> Pojemność 800 ml w formacie XXL.</li></ul>',
        sekcja5: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Właściwości i wyróżniki:</b> Rekomendowany przez Ideal Standard, Chętnie wybierany produkt</li></ul>',
        sekcja6: '<h2>⚠️ Bezpieczeństwo</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Natychmiast zdjąć zanieczyszczoną odzież.</li></ul>',
        sekcja7: '<p>Natychmiastowa wysyłka tego samego dnia.</p>'
    };

    // 1. Allegro Content Pre-flight
    const allegroPre = allegroMapper.buildAllegroContentPreflight({
        existingOffer: { name: 'Viakal 800 ml Numer 1', images: ['https://a.allegroimg.com/original/1.jpg'], description: { sections: [] } },
        htmlContent: dirtyHtmlContent,
        draftImages: [{ originalUrl: 'https://a.allegroimg.com/original/1.jpg' }]
    });
    assert.equal(allegroPre.complianceAudit.clean, false);
    assert.ok(allegroPre.warnings.some(w => w.includes('Ideal Standard')));
    assert.ok(allegroPre.warnings.some(w => w.includes('w formacie XXL')));
    assert.ok(allegroPre.warnings.some(w => w.includes('Natychmiastowa wysyłka')));

    // 2. BaseLinker Pre-flight
    const origFetchParams = baselinkerExportService.fetchInventoryParameters;
    baselinkerExportService.fetchInventoryParameters = async () => [];
    try {
        const blPre = await baselinkerExportService.buildPayloadWithDiagnostics('385', null, {
            title: 'Viakal Format XXL',
            htmlContent: dirtyHtmlContent,
            images: []
        }, { ean: '8700216906159', name: 'Viakal', features: {} });
        assert.equal(blPre.complianceAudit.clean, false);
        assert.ok(blPre.warnings.some(w => w.includes('Ideal Standard')));
    } finally {
        baselinkerExportService.fetchInventoryParameters = origFetchParams;
    }

    // 3. Von Halsky Pre-flight
    const vhPre = buildVonHalskyOfferPayload({
        mode: 'create',
        product: {
            ean: '8700216906159',
            name: 'Viakal odkamieniacz 800 ml',
            salePrice: 19.99,
            stock: 5,
            brand: { name: 'Viakal' },
            imageUrl: 'https://cdn.example.com/1.jpg'
        },
        category: { id: '151d3d67-1712-4759-96cd-d613edabd392', name: 'Odkamieniacze', leaf: true, doesNotRequireGpsrInfo: true },
        htmlContent: dirtyHtmlContent
    });
    assert.ok(vhPre.warnings.some(w => w.includes('Zgodność Allegro') && w.includes('Ideal Standard')));
});
