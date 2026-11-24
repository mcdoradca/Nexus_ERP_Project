const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const titleOptimizer = require('../services/title-optimizer.service');
const legacyTitleValidator = require('../../offer-optimizer/title-validate');
const googleSuggestFaqService = require('../services/google-suggest-faq.service');
const baselinkerExportService = require('../baselinker.export.service');
const { Orchestrator } = require('../orchestrator');
const aiWrapper = require('../ai.wrapper');
const allegroService = require('../../offer-optimizer/allegro.service');

test('ADR-0199: Kompresor i optymalizator tytułów Allegro SEO/Ads (≤75 zn., wzbogacanie krótkich tytułów, parytet UI)', async (t) => {
    await t.test('1. Przypadek produkcyjny Viakal (80 zn.) zostaje skompresowany bez utraty wariantu z etykiety i mieści się w ≤75 zn.', () => {
        const oversizedViakal = 'Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml';
        assert.strictEqual([...oversizedViakal].length, 80);

        const initialCheck = titleOptimizer.validateAllegroOfferTitle(oversizedViakal, { brand: 'Viakal' });
        assert.strictEqual(initialCheck.valid, false);
        assert.ok(initialCheck.issues.some(i => i.code === 'TOO_LONG'));

        const compressed = titleOptimizer.compressTitleToAllegroLimit(oversizedViakal, {
            maxLen: 75,
            brand: 'Viakal',
            capacity: '470 ml'
        });
        assert.ok([...compressed].length <= 75, `Tytuł po kompresji przekracza 75 zn.: "${compressed}" (${[...compressed].length})`);
        assert.ok(compressed.includes('Viakal Bagno Express Fiori di Primavera'), `Kompresja naruszyła nazwę własną z etykiety: "${compressed}"`);
        assert.ok(compressed.includes('470 ml'), `Kompresja zgubiła pojemność: "${compressed}"`);

        const afterCheck = titleOptimizer.validateAllegroOfferTitle(compressed, { brand: 'Viakal' });
        assert.strictEqual(afterCheck.valid, true, `Tytuł po kompresji powinien przejść walidację: ${afterCheck.errors.join(' | ')}`);
    });

    await t.test('2. Krótkie tytuły (Dermomed 30 zn., Viakal 34 zn.) są oznaczane jako suboptymalne pod Ads i wzbogacane z faktów produktu', () => {
        const shortDermomed = 'Dermomed Mydło w płynie 750 ml';
        const shortCheck = titleOptimizer.validateAllegroOfferTitle(shortDermomed, { brand: 'Dermomed' });
        assert.strictEqual(shortCheck.valid, true);
        assert.strictEqual(shortCheck.seoOptimal, false);
        assert.ok(shortCheck.issues.some(i => i.code === 'SUBOPTIMAL_LENGTH'));

        const enriched = titleOptimizer.buildDeterministicAllegroTitle({
            canonicalName: shortDermomed,
            brand: 'Dermomed',
            capacity: '750 ml',
            scent: 'Talk i Irys',
            visionFeatures: {
                'Dozownik': 'pompka',
                'Przeznaczenie (Front)': 'do rąk i ciała'
            },
            keywordHints: ['mydło w płynie do rąk', 'mydło pielęgnujące z pompką']
        });
        assert.ok([...enriched].length >= 55 && [...enriched].length <= 75, `Oczekiwano długości SEO 55-75 zn., otrzymano ${[...enriched].length}: "${enriched}"`);
        assert.ok(enriched.toLowerCase().includes('pompk'), 'Oczekiwano dodania faktycznego dozownika (z pompką)');
        assert.ok(enriched.toLowerCase().includes('talk i irys'), 'Oczekiwano dodania faktycznego zapachu (Talk i Irys)');
        assert.ok(enriched.endsWith('750 ml'), 'Pojemność powinna znaleźć się na końcu tytułu');

        const finalCheck = titleOptimizer.validateAllegroOfferTitle(enriched, { brand: 'Dermomed' });
        assert.strictEqual(finalCheck.valid, true, finalCheck.errors.join(' | '));
    });

    await t.test('3. Ekstremalnie długi tytuł (>100 zn.) zostaje przycięty na granicy pełnych wyrazów bez wiszących przyimków i słów §A/§E', () => {
        const dirtyLong = 'HIT! Oryginalny Chanteclair Sgrassatore Universale Spray Odtłuszczacz Antybakteryjny do kuchni i piekarnika w sprayu 600 ml';
        const compressed = titleOptimizer.compressTitleToAllegroLimit(dirtyLong, {
            maxLen: 75,
            brand: 'Chanteclair',
            capacity: '600 ml'
        });
        assert.ok([...compressed].length <= 75, `Przekroczono 75 zn.: "${compressed}" (${[...compressed].length})`);
        assert.strictEqual(/hit|oryginalny|antybakteryjny|!/i.test(compressed), false, `Pozostały słowa zakazane: "${compressed}"`);
        assert.strictEqual(/\s(?:do|w|i|z|na|dla)$/i.test(compressed), false, `Tytuł kończy się wiszącym przyimkiem: "${compressed}"`);
        assert.ok(compressed.includes('600 ml') || compressed.includes('600ml'));

        const val = titleOptimizer.validateAllegroOfferTitle(compressed, { brand: 'Chanteclair' });
        assert.strictEqual(val.valid, true, val.errors.join(' | '));
    });

    await t.test('4. Parytet walidatorów: title-optimizer.service.js, legacy title-validate.js oraz frontendowy ESM allegroTitleValidator.js', async () => {
        const dupRepeatTitle = 'Płyn do płukania tkanin w płynie Lenor płynny koncentrat 2 l';
        const resV2 = titleOptimizer.validateAllegroOfferTitle(dupRepeatTitle);
        const resLegacy = legacyTitleValidator.validateAllegroTitle(dupRepeatTitle);
        assert.strictEqual(resV2.valid, resLegacy.valid);
        assert.ok(resV2.issues.some(i => i.code === 'KEYWORD_REPEAT'));

        const bannedTitle = 'Okazja płyn antybakteryjny Chanteclair wysyłka 24h 600 ml';
        const bannedRes = titleOptimizer.validateAllegroOfferTitle(bannedTitle);
        assert.strictEqual(bannedRes.valid, false);
        assert.ok(bannedRes.issues.some(i => i.code === 'BANNED_WORD'));
        assert.ok(bannedRes.issues.some(i => i.code === 'LOGISTICS_INFO'));

        const frontendModUrl = pathToFileURL(
            path.resolve(__dirname, '../../../../frontend/src/views/OfferOptimizer/utils/allegroTitleValidator.js')
        ).href;
        const frontendMod = await import(frontendModUrl);
        const clientLong = frontendMod.validateAllegroTitleClient(
            'Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml'
        );
        assert.strictEqual(clientLong.valid, false);
        const trimmedClient = frontendMod.smartTrimTitleTo75(
            'Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml'
        );
        assert.ok([...trimmedClient].length <= 75, `smartTrimTitleTo75 zwróciło >75 zn.: "${trimmedClient}"`);
        assert.strictEqual(frontendMod.validateAllegroTitleClient(trimmedClient).valid, true);

        const scored = titleOptimizer.scoreTitleForAllegroAds(
            'Viakal Bagno Express odkamieniacz w sprayu do kabin i armatury 470 ml',
            {
                targetCategoryId: '253353',
                matchingCategories: [{ id: '253353', name: 'Odkamieniacze' }],
                keywordHints: ['odkamieniacz do kabin i armatury', 'odkamieniacz do łazienki'],
                brand: 'Viakal'
            }
        );
        assert.strictEqual(scored.valid, true);
        assert.strictEqual(scored.categoryMatched, true);
        assert.ok(scored.matchedKeywords.length >= 1);
        assert.ok(scored.score >= 85);
    });

    await t.test('5. harvestTitleKeywordSignals (tryb offlineOnly) generuje czyste polskie frazy pod tytuły bez sieci i bez mutacji cache', async () => {
        const signals = await googleSuggestFaqService.harvestTitleKeywordSignals({
            productName: 'Viakal Bagno Express odkamieniacz 470 ml',
            brand: 'Viakal',
            category: 'Odkamieniacze',
            scent: 'wiosenne kwiaty',
            isChemical: true,
            offlineOnly: true
        });
        assert.strictEqual(signals.category_key, 'descaler');
        assert.ok(Array.isArray(signals.suggested_phrases) && signals.suggested_phrases.length >= 2);
        assert.ok(signals.suggested_phrases.some(p => p.includes('odkamieniacz')));
        assert.strictEqual(/rossmann|biedronka|dezynfek/i.test(signals.suggested_phrases.join(' ')), false);
    });
});

test('ADR-0199: Orkiestrator V2 (domyślne konto DEFAULT_CLASSIC) przekazuje title_seo_context do A6, zachowuje suggested_offer_title w FINISH i pilnuje ≤75 zn. w eksporcie', async () => {
    const origCall = aiWrapper.callAgentWithTelemetry;
    const origGetCatalog = allegroService.getCatalogProductInfoByEan;
    const origHarvestTitle = googleSuggestFaqService.harvestTitleKeywordSignals;

    let capturedA6Prompt = '';
    let capturedA6Schema = null;

    allegroService.getCatalogProductInfoByEan = async () => ({
        found: true,
        productId: 'allegro-cat-viakal-470',
        name: 'Viakal Bagno Express Odkamieniacz spray 470 ml',
        categoryId: '253353',
        parameters: {}
    });
    googleSuggestFaqService.harvestTitleKeywordSignals = async () => ({
        category_key: 'descaler',
        category_pl: 'odkamieniacz do łazienki i armatury',
        group: 'SURFACE_CLEANER',
        suggested_phrases: ['odkamieniacz do łazienki', 'odkamieniacz do kabin i armatury'],
        source: 'mock_offline'
    });

    const validS1 = '<h2>⭐ Viakal Bagno Express odkamieniacz 470 ml</h2><p>Skoncentrowany odkamieniacz <b>470 ml</b> bez spłukiwania do kabin i armatury łazienkowej.</p><ul><li>✔️ <b>Szybka aplikacja:</b> wygodny atomizer do łazienki.</li><li>✔️ <b>Bez spłukiwania:</b> wystarczy przetrzeć czystą ściereczką.</li><li>✔️ <b>Pojemność:</b> poręczna butelka <b>470 ml</b>.</li></ul>';
    const validS2 = '<h2>❓ Odkamieniacz do łazienki – pytania</h2><ul>' +
        '<li>❓ <b>Pytanie:</b> Jak stosować Viakal Bagno Express Fiori di Primavera odkamieniacz 470 ml?</li><li>✔️ <b>Odpowiedź:</b> Formuła bez spłukiwania pozwala rozpylić preparat i przetrzeć powierzchnię ściereczką.</li>' +
        '<li>❓ <b>Pytanie:</b> Do jakich powierzchni nadaje się spray?</li><li>✔️ <b>Odpowiedź:</b> Przeznaczony do ceramiki, umywalek, kabin prysznicowych oraz armatury chromowanej.</li>' +
        '<li>❓ <b>Pytanie:</b> Czego unikać podczas użycia?</li><li>✔️ <b>Odpowiedź:</b> Nie stosować na marmurze, kamieniu wapiennym ani gorących powierzchniach.</li>' +
        '<li>❓ <b>Pytanie:</b> Co usuwa formuła kwasowa?</li><li>✔️ <b>Odpowiedź:</b> Rozpuszcza osady z kamienia wodnego i mydła bez szorowania.</li>' +
        '</ul>';
    const validS4 = '<h2>✍️ Sposób użycia i zalecenia aplikacji</h2><p>Przed użyciem zapoznaj się z informacjami na opakowaniu.</p><ol><li>✍️ <b>Krok 1 – Aplikacja:</b> Rozpyl bezpośrednio na powierzchnię z kamieniem.</li><li>✍️ <b>Krok 2 – Wykończenie:</b> Przetrzyj czystą ściereczką bez spłukiwania wodą i umyj ręce.</li></ol><p>Butelka 470 ml wystarcza na wiele zabiegów w łazience.</p><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie używać na marmurze i kamieniu naturalnym.</p>';

    const setupMockOrch = () => {
        const orch = new Orchestrator('8700216405348');
        orch.state.is_full_pipeline_run = true;
        orch.state.chemical_route = true;
        orch.state.chemical_route_reasons = ['CATEGORY_CHEMICAL'];
        orch.state.allegro_catalog_name = 'Viakal Bagno Express Odkamieniacz spray 470 ml';
        orch.state.next_action = 'RUN_A6';
        orch.state.a4_result = {
            category_type: 'HOUSEHOLD_CHEMISTRY',
            technical_benefits_aeo: [
                '<li>⚙️ <b>Kwas amidosulfonowy:</b> skutecznie rozpuszcza osady wapienne z armatury i kabin.</li>',
                '<li>⚙️ <b>Kompozycja zapachowa (Parfum):</b> nadaje świeży, kwiatowy aromat podczas sprzątania.</li>'
            ],
            detected_synergies: []
        };
        orch.state.a5_result = {
            mandatory_safety_warnings: [],
            preserved_minor_flaws_for_pratfall: ['Nie stosować na marmurze']
        };
        orch.state.vision_extracted_features = {
            'Nazwa produktu (Etykieta Front)': 'Viakal Bagno Express Fiori di Primavera',
            'Pojemność': '470 ml',
            'Dozownik': 'spray',
            'Wyróżniki (Etykieta Front)': 'SENZA RISCIACQUO'
        };
        orch.state.extracted_data = {
            product_name: { value: 'Viakal odkamieniacz bagno expres fi 470 ml', source: 'baselinker' },
            brand: { value: 'Viakal' },
            capacity: { value: '470 ml' },
            inci: { value: '<5% Non-ionic surfactants, Parfum' },
            eu_responsible_person: {
                source: 'brand_registry',
                data: { name: 'Procter & Gamble', address_eu: 'ul. Zabraniecka 20, 03-872 Warszawa' }
            }
        };
        return orch;
    };

    const pimMock = {
        ean: '8700216405348',
        text_fields: {
            name: 'Viakal odkamieniacz bagno expres fi 470 ml',
            features: {
                'Kategoria': 'Odkamieniacze',
                'Marka': 'Viakal',
                'Producent': 'Procter & Gamble',
                'Pojemność': '470 ml',
                'Dozownik': 'spray'
            }
        }
    };

    const expectedA6Title = 'Viakal Bagno Express Fiori di Primavera odkamieniacz spray 470 ml';
    assert.ok([...expectedA6Title].length <= 75);

    try {
        // Scenariusz A: A6 zwraca zoptymalizowany suggested_offer_title -> FINISH musi go zachować (nie nadpisywać!)
        aiWrapper.callAgentWithTelemetry = async (opts) => {
            if (String(opts.agentId) === '6') {
                capturedA6Prompt = opts.prompt || '';
                capturedA6Schema = opts.schema || null;
                return {
                    result: {
                        section_1_html: validS1,
                        section_2_html: validS2,
                        section_4_html: validS4,
                        suggested_offer_title: expectedA6Title
                    },
                    usage: { totalTokenCount: 100 }
                };
            }
            if (String(opts.agentId) === '11') {
                return {
                    result: {
                        product_identity: { exact_product_type: 'Odkamieniacz w sprayu', primary_regime: 'Detergenty' },
                        patches: [],
                        escalate_to_pro: false
                    },
                    usage: { totalTokenCount: 50 }
                };
            }
            return { result: {}, usage: {} };
        };

        const orchA = setupMockOrch();
        await orchA.run(pimMock);
        assert.strictEqual(orchA.state.next_action, 'FINISH', `Alert: ${orchA.state.hitl_alert || 'brak'}`);
        assert.ok(capturedA6Schema?.properties?.suggested_offer_title, 'Domyślny profil musi mieć suggested_offer_title w properties');
        assert.strictEqual(capturedA6Schema?.required?.includes('suggested_offer_title'), false, 'Kontrakt required[] nie może wymuszać pola suggested_offer_title na starszych mockach');
        assert.ok(capturedA6Prompt.includes('Viakal Bagno Express Odkamieniacz spray 470 ml'), 'Prompt A6 powinien otrzymać oficjalną nazwę z Katalogu Allegro');
        assert.strictEqual(orchA.state.final_offer.title, expectedA6Title);
        assert.strictEqual(orchA.state.final_offer.source_map.title.source, 'a6_seo_title');
        assert.ok(orchA.state.final_offer.canonical_product_name.includes('Viakal Bagno Express Fiori di Primavera'));

        // Scenariusz B: A6 NIE zwraca suggested_offer_title -> FINISH kompresuje 80-znakową nazwę kanoniczną do ≤75 zn.
        aiWrapper.callAgentWithTelemetry = async (opts) => {
            if (String(opts.agentId) === '6') {
                return {
                    result: {
                        section_1_html: validS1,
                        section_2_html: validS2,
                        section_4_html: validS4
                    },
                    usage: { totalTokenCount: 100 }
                };
            }
            if (String(opts.agentId) === '11') {
                return {
                    result: {
                        product_identity: { exact_product_type: 'Odkamieniacz w sprayu', primary_regime: 'Detergenty' },
                        patches: [],
                        escalate_to_pro: false
                    },
                    usage: { totalTokenCount: 50 }
                };
            }
            return { result: {}, usage: {} };
        };

        const orchB = setupMockOrch();
        await orchB.run(pimMock);
        assert.strictEqual(orchB.state.next_action, 'FINISH');
        assert.ok([...orchB.state.final_offer.title].length <= 75, `Fallback tytułu przekroczył 75 zn.: "${orchB.state.final_offer.title}" (${[...orchB.state.final_offer.title].length})`);
        assert.ok(orchB.state.final_offer.title.includes('Viakal Bagno Express Fiori di Primavera'));
        assert.strictEqual(orchB.state.final_offer.source_map.title.source, 'deterministic_seo_title');

        // Scenariusz C: Twarda ochrona ≤75 zn. w baselinker.export.service.js
        const origFetchInv = baselinkerExportService.fetchInventoryParameters;
        baselinkerExportService.fetchInventoryParameters = async () => [];
        try {
            const { payload } = await baselinkerExportService.buildPayloadWithDiagnostics(
                '307',
                '999',
                {
                    title: 'Viakal Bagno Express Fiori di Primavera odkamieniacz w sprayu do łazienki 470 ml',
                    htmlContent: {
                        sekcja1: validS1,
                        sekcja2: validS2,
                        sekcja3: '<h2>⚙️ Skład</h2><ul><li>⚙️ <b>Kwas:</b> czyści.</li></ul>',
                        sekcja4: validS4,
                        sekcja5: '<h2>⚖️ Parametry</h2><ul><li>➡️ <b>Marka:</b> Viakal</li></ul>'
                    }
                },
                { ean: '8700216405348', features: { Marka: 'Viakal' } },
                {}
            );
            const exportedTitle = payload.text_fields['name|pl|allegro_0'];
            assert.ok([...exportedTitle].length <= 75, `Eksport BaseLinker nie skompresował tytułu >75 zn.: "${exportedTitle}" (${[...exportedTitle].length})`);
        } finally {
            baselinkerExportService.fetchInventoryParameters = origFetchInv;
        }
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
        allegroService.getCatalogProductInfoByEan = origGetCatalog;
        googleSuggestFaqService.harvestTitleKeywordSignals = origHarvestTitle;
    }
});
