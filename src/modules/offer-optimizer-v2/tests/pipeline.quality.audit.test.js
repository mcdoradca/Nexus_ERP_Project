const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const { classifyProductPhysicalForm } = require('../services/product-form.classifier');
const { mapPackagingFeaturesToAllegroSchema, matchDictionaryOption } = require('../services/allegro-param-automapper.service');
const deterministicEngine = require('../services/deterministic-pipeline.engine');
const googleSuggestFaqService = require('../services/google-suggest-faq.service');
const {
    validate_section1_above_the_fold,
    validate_section5_compliance,
    scan_stopwords
} = require('../validators');
const { Orchestrator, sanitizeSection5Html } = require('../orchestrator');
const aiWrapper = require('../ai.wrapper');
const allegroMapper = require('../../../utils/allegro_mapper');
const baselinkerExportService = require('../baselinker.export.service');
const aiService = require('../../offer-optimizer/ai.service');

const prisma = new PrismaClient();
const V2_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(V2_DIR, '../../..');

function convertAllegroSchemaToBaselinkerParams(allegroParams = []) {
    return (allegroParams || []).map((p) => {
        const isDict = p.type === 'dictionary' && Array.isArray(p.dictionary) && p.dictionary.length > 0;
        const isMulti = Boolean(p.restrictions?.multipleChoices);
        return {
            parameter_id: Number(p.id) || p.id,
            name_translations: { pl: p.name },
            input_type: isDict ? (isMulti ? 'multiselect' : 'select') : (p.type === 'float' || p.type === 'integer' ? 'number' : 'text'),
            options: isDict ? Object.fromEntries(p.dictionary.map((d) => [String(d.id), d.value])) : undefined,
            is_required: Boolean(p.required)
        };
    });
}

function buildClean6Sections({
    s1 = '<h2>⭐ Dermomed Talco e Iris mydło w płynie 750 ml z pompką</h2><p>Kremowe mydło w płynie <b>750 ml</b> z dozownikiem pompką do codziennego mycia dłoni i ciała o nucie <b>talku i irysa</b>.</p><ul><li>✔️ <b>Delikatne oczyszczanie:</b> łagodna baza myjąca z <b>gliceryną</b>.</li><li>✔️ <b>Dozownik:</b> wygodna butelka z <b>pompką 750 ml</b>.</li><li>✔️ <b>Kompozycja zapachowa:</b> pudrowy aromat <b>talku i irysa</b>.</li></ul>',
    s2 = '<h2>❓ Dermomed Talco e Iris mydło w płynie – najczęstsze pytania</h2><ul><li>❓ <b>Pytanie:</b> Czy Dermomed Talco e Iris mydło w płynie 750 ml nadaje się do codziennego mycia dłoni?</li><li>✔️ <b>Odpowiedź:</b> Tak, kremowa formuła została opracowana do <b>częstego mycia skóry</b> i zawiera <b>glicerynę</b> wspierającą komfort naskórka.</li><li>❓ <b>Pytanie:</b> Jaką pojemność i dozownik ma ten kosmetyk?</li><li>✔️ <b>Odpowiedź:</b> Produkt ma pojemność <b>750 ml</b> w butelce wyposażonej w <b>wygodną pompkę</b> ułatwiającą higieniczne dozowanie.</li><li>❓ <b>Pytanie:</b> Jaki zapach ma ta emulsja do mycia?</li><li>✔️ <b>Odpowiedź:</b> Wyróżnia ją klasyczna nuta <b>talku oraz kwiatu irysa</b> pozostawiająca subtelny aromat na skórze.</li><li>❓ <b>Pytanie:</b> Które składniki odpowiadają za działanie myjące?</li><li>✔️ <b>Odpowiedź:</b> Podstawę myjącą tworzy <b>Sodium Laureth Sulfate</b> w połączeniu z <b>Glycerin</b>.</li></ul>',
    s3 = '<h2>⚙️ Składniki aktywne i mechanizm działania</h2><ul><li>⚙️ <b>Sodium Laureth Sulfate:</b> anionowy surfaktant odpowiadający za <b>usuwanie zanieczyszczeń i emulgowanie sebum</b>.</li><li>⚙️ <b>Glycerin:</b> humektant wiążący wodę, który <b>zmiękcza naskórek podczas mycia</b>.</li></ul>',
    s4 = '<h2>✍️ Sposób użycia i zalecenia aplikacji</h2><p>Przed użyciem zapoznaj się z informacjami bezpieczeństwa zawartymi na opakowaniu i stosuj się do zaleceń producenta.</p><ol><li>✍️ <b>Krok 1 – Dozowanie:</b> Nanieś niewielką ilość mydła w płynie na zwilżone dłonie za pomocą pompki.</li><li>✍️ <b>Krok 2 – Mycie i spłukanie:</b> Rozprowadź pianę na skórze, a następnie dokładnie spłucz czystą wodą.</li></ol><p>Butelka o pojemności <b>750 ml</b> wystarcza na długi okres codziennej higieny domowej.</p><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Produkt do użytku zewnętrznego; unikaj bezpośredniego kontaktu z oczami.</p>',
    s5 = '<h2>⚖️ Parametry techniczne i specyfikacja produktu</h2><ul><li>➡️ <b>Kod EAN (GTIN):</b> 8032680390036</li><li>➡️ <b>Marka:</b> Dermomed</li><li>➡️ <b>Producent:</b> Italchimica S.r.l.</li><li>➡️ <b>Kraj pochodzenia:</b> Włochy</li><li>➡️ <b>Pojemność:</b> 750 ml</li><li>➡️ <b>Postać:</b> w płynie</li><li>➡️ <b>pH:</b> 5.5</li></ul>',
    s6 = '<h2>⚠️ Bezpieczeństwo stosowania i informacje GPSR</h2><p>Przechowywać w szczelnie zamkniętym fabrycznym opakowaniu w chłodnym miejscu.</p><ul><li>➡️ <b>Wytyczne bezpieczeństwa (GPSR):</b> Unikać kontaktu z oczami. Tylko do użytku zewnętrznego.</li><li>➡️ <b>Podmiot odpowiedzialny w UE:</b> Italchimica S.r.l., Riviera Maestri del Lavoro 10, 35127 Padova (PD), Włochy</li></ul>'
} = {}) {
    return {
        section_1_html: s1,
        section_2_html: s2,
        section_3_html: s3,
        section_4_html: s4,
        section_5_html: s5,
        section_6_html: s6
    };
}

test.after(async () => {
    await prisma.$disconnect();
});

test('1. Real DB Schemas E2E (253353 Odkamieniacze, 253359 Środki czyszczące, 253350 Mydła): auto-mapper -> allegro_mapper -> baselinker.export', async () => {
    const cats = await prisma.marketplaceCategory.findMany({
        where: { id: { in: ['253353', '253359', '253350'] } },
        select: { id: true, name: true, parameters: true }
    });
    assert.equal(cats.length, 3, 'PostgreSQL MarketplaceCategory musi zawierać schematy 253353, 253359 i 253350');
    const byId = Object.fromEntries(cats.map((c) => [c.id, c.parameters]));

    // Case A: Viakal 470 ml (EAN 8006530224482) w kategorii 253353 Odkamieniacze
    const viakalRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: byId['253353'],
        currentFeatures: { 'Marka': 'Viakal' },
        visionFront: {
            'Pojemność / Waga': '470 ml',
            'Postać': 'w płynie',
            'Dozownik': 'atomizer / spray',
            'Zapach': 'Mydło i kwiaty bawełny',
            'Przeznaczenie (Front)': 'do łazienki, armatury i usuwania kamienia',
            'Kraj produkcji (Etykieta)': 'Włochy',
            'Liczba sztuk (Etykieta)': '1'
        },
        visionBack: {
            'Opakowanie (Etykieta)': 'plastikowa butelka z atomizerem',
            'Kraj pochodzenia (Etykieta)': 'Włochy',
            'Skład/INCI': '<5% Anionic surfactants, Non-ionic surfactants, Parfum'
        },
        product: {
            ean: '8006530224482',
            name: 'Viakal Odkamieniacz spray 470 ml z mydłem',
            weight: 0.54
        }
    });

    assert.equal(viakalRes.updatedFeatures['Stan'], 'Nowy');
    assert.equal(viakalRes.updatedFeatures['Marka'], 'Viakal', 'Istniejąca Marka operatora musi być zachowana');
    assert.equal(viakalRes.updatedFeatures['EAN (GTIN)'], '8006530224482');
    assert.equal(viakalRes.updatedFeatures['Pojemność'], '0.47', '470 ml musi zostać przeliczone na 0.47 l zgodnie z jednostką schematu 253353');
    assert.equal(viakalRes.updatedFeatures['Stan opakowania'], 'oryginalne');

    const viakalAllegro = allegroMapper.buildAllegroParameterPatchPayload({
        product: { ean: '8006530224482', weight: 0.54 },
        features: viakalRes.updatedFeatures,
        categoryParameters: byId['253353'],
        existingOffer: { productSet: [{ product: { id: 'test-prod-viakal', parameters: [] } }] }
    });
    assert.deepStrictEqual(viakalAllegro.errors, [], `Viakal auto-zmapowane parametry nie mogą dawać błędów kodowania Allegro: ${viakalAllegro.errors.join('; ')}`);

    const blParams253353 = convertAllegroSchemaToBaselinkerParams(byId['253353']);
    const viakalBl = baselinkerExportService.normalizeFeaturesForBaselinkerSchema(viakalRes.updatedFeatures, blParams253353);
    assert.deepStrictEqual(viakalBl.warnings, [], `Viakal w BaseLinker nie może mieć ostrzeżeń słownikowych: ${viakalBl.warnings.join('; ')}`);

    // Case B: Dermomed Talco e Iris 750 ml (8032680390036) w kategorii 253350 Mydła
    // Zawiera "antibatterico" w OCR jako pułapka BPR + SLS w INCI jako pułapka "Produkt nie zawiera"
    const dermomedRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: byId['253350'],
        currentFeatures: {
            'Marka': 'Dermomed',
            'Postać': 'w płynie', // pole operatora — nie wolno nadpisać
            'Skład/INCI': 'Aqua, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Parfum'
        },
        visionFront: {
            'Pojemność / Waga': '750 ml',
            'Postać': 'w kremie', // próba nadpisania — musi zostać zachowana wartość operatora
            'Dozownik': 'pompka',
            'Wyróżniki': 'antibatterico, antybakteryjny, bez parabenów, bez silikonów, bez SLS'
        },
        visionBack: {
            'Kraj pochodzenia (Etykieta)': 'Włochy',
            'Opakowanie (Etykieta)': 'butelka z pompką'
        },
        product: {
            ean: '8032680390036',
            name: 'Dermomed Talco e Iris Mydło w płynie zapas 750 ml',
            weight: 0.78
        }
    });

    assert.equal(dermomedRes.updatedFeatures['Postać'], 'w płynie', 'Nie wolno nadpisywać istniejącej wartości operatora');
    assert.equal(dermomedRes.updatedFeatures['Pojemność'], '0.75', '750 ml -> 0.75 l w kategorii 253350');
    assert.equal(dermomedRes.updatedFeatures['Waga'], '780', '0.78 kg -> 780 g (integer unit=g w kategorii 253350)');
    assert.equal(dermomedRes.updatedFeatures['Rodzaj'], 'w płynie');
    assert.equal(dermomedRes.updatedFeatures['Typ'] || null, null, 'BPR 528/2012 musi blokować dopasowanie "mydło antybakteryjne" mimo tekstu antibatterico na froncie');
    if (dermomedRes.updatedFeatures['Produkt nie zawiera']) {
        const pncLower = dermomedRes.updatedFeatures['Produkt nie zawiera'].toLowerCase();
        assert.ok(!pncLower.includes('antybakteryj'), 'Zakaz wartości biobójczych w Produkt nie zawiera');
        assert.ok(!pncLower.includes('sls') && !pncLower.includes('sles'), 'Cross-check INCI musi odrzucić bez SLS/SLES gdy INCI zawiera Sodium Lauryl/Laureth Sulfate');
    }

    const dermomedAllegro = allegroMapper.buildAllegroParameterPatchPayload({
        product: { ean: '8032680390036', weight: 0.78 },
        features: dermomedRes.updatedFeatures,
        categoryParameters: byId['253350'],
        existingOffer: { productSet: [{ product: { id: 'test-prod-dermomed', parameters: [] } }] }
    });
    assert.deepStrictEqual(dermomedAllegro.errors, [], `Dermomed auto-zmapowane parametry bez błędów Allegro: ${dermomedAllegro.errors.join('; ')}`);

    // Case C: Dual Power (8032680399107) w kategorii 253359 Środki czyszczące
    const dualPowerRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: byId['253359'],
        currentFeatures: { 'Marka': 'Dual Power' },
        visionFront: {
            'Pojemność / Waga': '1000 ml',
            'Postać': 'żel',
            'Zapach': 'Świeży chlor',
            'Przeznaczenie (Front)': 'do WC / toalety'
        },
        visionBack: {
            'Kraj pochodzenia (Etykieta)': 'Włochy',
            'Opakowanie (Etykieta)': 'butelka plastikowa'
        },
        product: {
            ean: '8032680399107',
            name: 'Dual Power Żel do WC z wybielaczem 1000 ml',
            weight: 1.08
        }
    });
    assert.equal(dualPowerRes.updatedFeatures['Pojemność'], '1', '1000 ml -> 1 l w kategorii 253359');
    const dualPowerAllegro = allegroMapper.buildAllegroParameterPatchPayload({
        product: { ean: '8032680399107', weight: 1.08 },
        features: dualPowerRes.updatedFeatures,
        categoryParameters: byId['253359'],
        existingOffer: { productSet: [{ product: { id: 'test-prod-dualpower', parameters: [] } }] }
    });
    assert.deepStrictEqual(dualPowerAllegro.errors, [], `Dual Power auto-zmapowane parametry bez błędów Allegro: ${dualPowerAllegro.errors.join('; ')}`);

    // Sprawdzenie dopasowania słownika multi-select bez przekłamania kolejności/wartości
    const pncParam253350 = byId['253350'].find((p) => p.name === 'Produkt nie zawiera');
    assert.ok(pncParam253350?.dictionary?.length > 0);
    const multiMatch = matchDictionaryOption(['parabenów', 'silikonów', 'nieistniejaca_opcja'], pncParam253350.dictionary, { multipleChoices: true });
    assert.deepStrictEqual(multiMatch, ['parabenów', 'silikonów']);
});

test('2. Klasyfikator postaci fizycznej i regresje absurdów (Dermomed Talk, żel ze słodkim migdałem, tabletki chlorowe, talk mineralny, FAQ łazienka, inci_mechanisms_pl)', async () => {
    // 2A. Mydło w płynie o zapachu talku (Dermomed Talco e Iris) ≠ suchy talk mineralny!
    const liquidTalcSoap = classifyProductPhysicalForm({
        productName: 'Dermomed Talco e Iris Mydło w płynie 750 ml',
        postac: 'w płynie',
        inci: 'Aqua, Sodium Laureth Sulfate, Glycerin, Parfum'
    });
    assert.equal(liquidTalcSoap.form, 'liquid');
    assert.equal(liquidTalcSoap.isDryPowder, false);
    assert.equal(liquidTalcSoap.isAnhydrousOrArticle, false);
    assert.equal(liquidTalcSoap.hasAqueousSignal, true);
    assert.equal(
        googleSuggestFaqService.detectCanonicalSearchCategory({ productName: 'Dermomed Talco e Iris Mydło w płynie 750 ml' }).key,
        'soap'
    );

    const sanitizedSoapS5 = sanitizeSection5Html(
        '<h2>⚖️ Parametry</h2><ul><li>➡️ <b>pH:</b> 5.5</li><li>➡️ <b>pH:</b> neutralne</li></ul>',
        { product_name: 'Dermomed Talco e Iris Mydło w płynie', features: { Postać: 'w płynie' } }
    );
    assert.ok(sanitizedSoapS5.includes('5.5'), 'Dla mydła w płynie o zapachu talku liczbowe pH 5.5 musi zostać zachowane');
    assert.ok(!/neutralne/i.test(sanitizedSoapS5), 'Marketingowe "pH: neutralne" bez liczby musi zostać usunięte');

    // 2B. Żel pod prysznic z olejem migdałowym (Aqua + Almond Oil) ≠ czysty olej bezwodny!
    const showerGelWithOil = classifyProductPhysicalForm({
        productName: 'Żel pod prysznic ze słodkimi migdałami 500 ml',
        postac: 'żel',
        inci: 'Aqua, Sodium Laureth Sulfate, Prunus Amygdalus Dulcis Oil, Glycerin'
    });
    assert.equal(showerGelWithOil.hasAqueousSignal, true);
    assert.equal(showerGelWithOil.isAnhydrousOrArticle, false);

    // 2C. Tabletki chlorowe ≠ płynny podchloryn w pozycji pionowej!
    const chlorineTabs = classifyProductPhysicalForm({
        productName: 'Tabletki chlorowe wybielające do WC 30 szt',
        postac: 'tabletki',
        detergentComposition: '<5% chlorine-based bleaching agents, Sodium Troclosene'
    });
    assert.equal(chlorineTabs.isSolidChlorine, true);
    assert.equal(chlorineTabs.isLiquidHypochlorite, false);

    const s6Tabs = deterministicEngine.buildDeterministicSection6({
        productName: 'Tabletki chlorowe wybielające do WC',
        isChemical: true,
        features: { Postać: 'tabletki' },
        euResponsiblePerson: { name: 'Test S.r.l.', address_eu: 'Via Roma 1, 20100 Milano, Włochy' },
        mandatorySafetyWarnings: ['UWAGA', 'H319 – Działa drażniąco na oczy.', 'P102 – Chronić przed dziećmi.'],
        compliance: { clp_signal_word: 'UWAGA' },
        inci: 'Sodium Dichloroisocyanurate'
    });
    assert.ok(!/pozycji pionowej/i.test(s6Tabs), 'Tabletki chlorowe NIE mogą dostać nakazu przechowywania w pozycji pionowej');
    assert.ok(!/podchloryn/i.test(s6Tabs), 'Dla tabletek chlorowych S6 nie może halucynować płynnego podchlorynu');

    // 2D. Prawdziwy suchy talk / puder + artykuł (szczoteczka) -> pH usuwane
    assert.equal(classifyProductPhysicalForm({ productName: 'Borotalco Puder talk w proszku 200 g' }).isAnhydrousOrArticle, true);
    assert.equal(classifyProductPhysicalForm({ productName: 'Szczoteczka do zębów miękka' }).isAnhydrousOrArticle, true);
    const s5Talc = sanitizeSection5Html(
        '<h2>⚖️ Parametry</h2><ul><li>➡️ <b>Postać:</b> puder sypki</li><li>➡️ <b>pH:</b> 5.5</li></ul>',
        { product_name: 'Puder mineralny talk sypki 20 g', features: { Postać: 'puder' } }
    );
    assert.ok(!/\bpH\b/i.test(s5Talc), 'Dla suchego pudru/talku linia z pH musi zostać usunięta');

    // 2E. FAQ łazienka spray -> odmiana formy (zero zabetonowanego "żel")
    const bathroomFaq = await googleSuggestFaqService.harvestSearchIntentFaq({
        productName: 'Viakal Odkamieniacz spray do łazienki 470 ml',
        brand: 'Viakal',
        capacity: '470 ml',
        category: 'Odkamieniacze do łazienki',
        isChemical: true,
        features: { Postać: 'w płynie', Dozownik: 'atomizer / spray' }
    });
    const faqJoined = JSON.stringify(bathroomFaq);
    assert.ok(!/\b(?:ten|w|do|na)\s+żel\b/i.test(faqJoined), 'FAQ dla sprayu łazienkowego nie może zawierać zabetonowanego słowa "żel"');
    assert.ok(/spray|płyn/i.test(faqJoined));

    // 2F. Audyt pełnego inci_mechanisms_pl.json (brak literówek i wycieków międzykategorialnych)
    const mechanismsRaw = fs.readFileSync(path.join(V2_DIR, 'data/reference/inci_mechanisms_pl.json'), 'utf8');
    const mechanismsJson = JSON.parse(mechanismsRaw);
    assert.ok(!mechanismsRaw.includes('soothing_ astringent'), 'Brak literówki "soothing_ astringent" w inci_mechanisms_pl.json');
    const checkLeaks = (entry, forbiddenRegex, label) => {
        const s = JSON.stringify(entry || {});
        assert.equal(forbiddenRegex.test(s), false, `Wyciek międzykategorialny w ${label}: dopasowano ${forbiddenRegex}`);
    };
    checkLeaks(mechanismsJson.ingredients?.['amphoteric surfactants'], /naczy[ńn]|tłuszcz kuchenn/i, 'amphoteric surfactants');
    checkLeaks(mechanismsJson.ingredients?.['calcium carbonate'], /piekarnik|naczy[ńn]/i, 'calcium carbonate');
    checkLeaks(mechanismsJson.ingredients?.['bentonite'], /olej[oó]w przemys[łl]|tłust.*naczy/i, 'bentonite');
    checkLeaks(mechanismsJson.ingredients?.['c9-11 pareth-8'], /kuchenn|okap/i, 'c9-11 pareth-8');
    checkLeaks(mechanismsJson.synergies?.find((x) => x.id === 'anionic_amphoteric_mildness'), /mycia r[ąa]k|kuchenn/i, 'anionic_amphoteric_mildness');

    // 2G. Deterministyczny S3 z A4 bez stopworda "gwarantuje"
    const s3Built = deterministicEngine.buildSection3FromA4Result({
        technical_benefits_aeo: [
            '<li>⚙️ <b>Argania Spinosa Kernel Oil:</b> odżywia pasma bez obciążenia.</li>',
            'Glycerin: nawilża skórę podczas mycia.'
        ]
    }, false);
    assert.ok(s3Built.includes('Argania Spinosa Kernel Oil'));
    assert.ok(s3Built.includes('<li>⚙️ '), 'Zwykłe wpisy bez <li> muszą zostać sformatowane z <li>⚙️');
    assert.deepStrictEqual(scan_stopwords(s3Built), [], 'Deterministyczna Sekcja 3 nie może zawierać stopwordów (np. gwarantuje)');
});

test('3. Allegro 2026 Above-the-Fold (Sekcja 1) i Załącznik nr 2 (DEFAULT_SEKCJA_7 bez obietnic wysyłkowych)', () => {
    const longLead = '<h2>⭐ Super preparat</h2><p>' + 'Bardzo długi wstęp marketingowy bez sensu. '.repeat(9) + '</p><ul><li>✔️ Jeden punkt</li></ul>';
    const failS1 = validate_section1_above_the_fold(longLead);
    assert.equal(failS1.valid, false);
    assert.ok(failS1.leadLength > 260);
    assert.ok(failS1.warnings.length >= 2, 'Muszą zostać wykryte za długi lead i za mało punktów listy');

    const shippingS1 = '<h2>⭐ Płyn 500 ml</h2><p>Skuteczny płyn <b>500 ml</b>. Szybka wysyłka w 24h z naszego magazynu w Polsce!</p><ul><li>✔️ <b>A:</b> test.</li><li>✔️ <b>B:</b> test.</li><li>✔️ <b>C:</b> test.</li></ul>';
    assert.equal(validate_section1_above_the_fold(shippingS1).valid, false, 'S1 nie może przejść z obietnicami wysyłki');

    const goodS1 = '<h2>⭐ Cif Płyn do łazienki 500 ml</h2><p>Skuteczny płyn <b>500 ml</b> z rozpylaczem usuwający <b>osady mydlane i zacieki</b> z armatury oraz płytek.</p><ul><li>✔️ <b>Szybkie działanie:</b> usuwa <b>osad z wody</b> bez szorowania.</li><li>✔️ <b>Armatura i ceramika:</b> bezpieczny dla chromu i stali.</li><li>✔️ <b>Wygodny atomizer:</b> precyzyjna aplikacja na powierzchnię.</li></ul>';
    const passS1 = validate_section1_above_the_fold(goodS1);
    assert.equal(passS1.valid, true, `Poprawna Sekcja 1 powinna przejść Above-the-Fold: ${passS1.warnings.join('; ')}`);

    // Weryfikacja rzeczywistego kodu frontendu: DEFAULT_SEKCJA_7 w UnifiedProductPipelineView.jsx
    const jsxContent = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx'), 'utf8');
    const sec7Match = jsxContent.match(/const\s+DEFAULT_SEKCJA_7\s*=\s*'([^']+)'/);
    assert.ok(sec7Match, 'DEFAULT_SEKCJA_7 musi istnieć jako stała w UnifiedProductPipelineView.jsx');
    const sec7Text = sec7Match[1];
    assert.equal(/wysyłk|magazyn|24h|kurier|natychmiast|dzisiaj|direct import|jesteśmy bezpośrednim importerem|oryginaln/i.test(sec7Text), false, `DEFAULT_SEKCJA_7 łamie Załącznik nr 2 Allegro: ${sec7Text}`);
    assert.deepStrictEqual(scan_stopwords(sec7Text), [], 'DEFAULT_SEKCJA_7 nie może zawierać stopwordów §A');
});

test('4. Kompilacja promptów, Prefix Caching w ai.wrapper.js, hybrydowy autofill oraz warunkowe pominięcie / eskalacja A10', async () => {
    // 4A. Sprawdzenie wszystkich skompilowanych promptów Agent_1..Agent_11
    const promptsDir = path.join(V2_DIR, 'prompts');
    for (const id of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11]) {
        const compiled = fs.readFileSync(path.join(promptsDir, `Agent_${id}_compiled.md`), 'utf8');
        const matches = compiled.match(/\{\{SKU_DATA\}\}/g) || [];
        assert.equal(matches.length, 1, `Agent_${id}_compiled.md musi mieć dokładnie 1 placeholder {{SKU_DATA}}`);
        assert.ok(compiled.trimEnd().endsWith('{{SKU_DATA}}'), `Agent_${id}_compiled.md musi mieć {{SKU_DATA}} na końcu dla Prefix Caching`);
        assert.equal(/gemini|thinking/i.test(compiled), false, `Agent_${id}_compiled.md nie może zawierać nazw modeli ani parametrów thinking`);
    }

    // 4B. Prefix Caching splitPromptForCaching na realnym Agent_6_compiled.md
    const template6 = fs.readFileSync(path.join(promptsDir, 'Agent_6_compiled.md'), 'utf8');
    const splitA = aiWrapper.splitPromptForCaching(template6.replace('{{SKU_DATA}}', JSON.stringify({ gtin_ean: '111', product_name: 'Produkt A' })));
    const splitB = aiWrapper.splitPromptForCaching(template6.replace('{{SKU_DATA}}', JSON.stringify({ gtin_ean: '222', product_name: 'Produkt B' })));
    assert.ok(splitA.systemInstruction && splitA.systemInstruction.length >= 1024, 'Statyczny prefiks A6 musi trafić do systemInstruction (>=1024 zn.)');
    assert.equal(splitA.systemInstruction, splitB.systemInstruction, 'Prefiks systemInstruction musi być identyczny bajt-do-bajtu między różnymi SKU');
    assert.ok(splitA.userContent.startsWith('--- DANE SKU ---') && splitA.userContent.includes('Produkt A'));
    assert.ok(!splitA.systemInstruction.includes('Produkt A'));

    // 4C. Hybrydowy aiService.autofillMissingParameters — deterministyczne wypełnienie bez wywołania Gemini
    const cats = await prisma.marketplaceCategory.findMany({ where: { id: '253350' }, select: { parameters: true } });
    const schema253350 = cats[0].parameters;
    const origCall = aiWrapper.callAgentWithTelemetry;
    let aiCalledInAutofill = false;
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key-must-not-be-called';
    aiWrapper.callAgentWithTelemetry = async () => {
        aiCalledInAutofill = true;
        return { result: { features: {} }, usage: {} };
    };
    try {
        const autoRes = await aiService.autofillMissingParameters(
            '8032680390036',
            'Dermomed Mydło w płynie 750 ml',
            {},
            schema253350,
            { product: { ean: '8032680390036', brand: { name: 'Dermomed' }, weight: 0.78, features: { 'Postać': 'w płynie', 'Pojemność': '750 ml' } } }
        );
        assert.equal(autoRes['Stan'], 'Nowy');
        assert.equal(autoRes['Rodzaj'], 'w płynie');
        assert.equal(autoRes['Pojemność'], '0.75');
        assert.equal(autoRes['Waga'], '780');
        assert.equal(autoRes['EAN (GTIN)'], '8032680390036');
        // Marka Dermomed w 253350: jeśli istnieje w słowniku i zmapowana deterministycznie -> AI nie powinno być wołane;
        // jeśli jakiegoś pola opcjonalnego brak, ważne żeby żadne wymagane bez danych nie powodowało nadpisań
        if (autoRes['Marka']) {
            assert.equal(aiCalledInAutofill, false, 'Gdy wszystkie wymagane pola zostały zmapowane deterministycznie, AI fallback nie może zużywać tokenów');
        }
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
        if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevKey;
    }

    // 4D. Orchestrator: Slim A6 schema (3 klucze) + Pominięcie A10 dla czystego kosmetyku + Eskalacja dla ryzyka
    const orchClean = new Orchestrator('8032680390036');
    orchClean.state.is_full_pipeline_run = true;
    orchClean.state.next_action = 'RUN_A6';
    orchClean.state.a4_result = {
        category_type: 'COSMETICS_BEAUTY',
        technical_benefits_aeo: [
            '<li>⚙️ <b>Sodium Laureth Sulfate:</b> anionowy surfaktant usuwający zanieczyszczenia.</li>',
            '<li>⚙️ <b>Glycerin:</b> humektant wspierający nawilżenie naskórka.</li>'
        ]
    };
    orchClean.state.a5_result = {
        preserved_minor_flaws_for_pratfall: ['Unikać kontaktu z oczami'],
        mandatory_safety_warnings: []
    };
    orchClean.state.extracted_data = {
        product_name: { value: 'Dermomed Talco e Iris Mydło w płynie 750 ml' },
        brand: { value: 'Dermomed' },
        capacity: { value: '750 ml' },
        inci: { value: 'Aqua, Sodium Laureth Sulfate, Glycerin, Parfum' },
        eu_responsible_person: {
            source: 'brand_registry',
            data: { name: 'Italchimica S.r.l.', address_eu: 'Riviera Maestri del Lavoro 10, 35127 Padova (PD), Włochy' }
        }
    };

    const calledClean = [];
    let capturedA6Schema = null;
    const cleanSections = buildClean6Sections();

    aiWrapper.callAgentWithTelemetry = async ({ agentId, schema }) => {
        calledClean.push(agentId);
        if (agentId === '6') {
            capturedA6Schema = schema;
            return {
                result: {
                    section_1_html: cleanSections.section_1_html,
                    section_2_html: cleanSections.section_2_html,
                    section_4_html: cleanSections.section_4_html
                },
                usage: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
            };
        }
        if (agentId === '7') {
            return {
                result: {
                    section_1_html: cleanSections.section_1_html,
                    section_2_html: cleanSections.section_2_html,
                    section_4_html: cleanSections.section_4_html
                },
                usage: { promptTokenCount: 80, candidatesTokenCount: 40, totalTokenCount: 120 }
            };
        }
        if (agentId === '11') {
            return {
                result: {
                    product_identity: {
                        exact_product_type: 'Płynne mydło kosmetyczne z pompką',
                        primary_regime: 'codzienny'
                    },
                    domain_issues_detected: [],
                    patches: [],
                    escalate_to_pro: false
                },
                usage: { promptTokenCount: 90, candidatesTokenCount: 30, totalTokenCount: 120 }
            };
        }
        return { result: {}, usage: {} };
    };

    try {
        await orchClean.run({
            text_fields: {
                name: 'Dermomed Talco e Iris Mydło w płynie 750 ml',
                features: {
                    Marka: 'Dermomed',
                    Producent: 'Italchimica S.r.l.',
                    Postać: 'w płynie',
                    Zapach: 'Talk i Irys',
                    Pojemność: '750 ml',
                    'Kraj pochodzenia': 'Włochy',
                    'Skład/INCI': 'Aqua, Sodium Laureth Sulfate, Glycerin, Parfum'
                }
            },
            brand: { name: 'Dermomed' },
            weight: 0.78
        });
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
    }

    assert.deepStrictEqual(capturedA6Schema?.required, ['section_1_html', 'section_2_html', 'section_4_html'], 'W pełnym przebiegu z A4 i PIM/GPSR A6 musi dostać odchudzony schemat 3 sekcji');
    assert.deepStrictEqual(calledClean, ['6', '11'], 'W pełnym przebiegu A7 jest zunifikowany z A6 (0 tokenów), a dla czystego produktu A10 Pro jest warunkowo pomijany');
    assert.equal(orchClean.state.node_status['A10'], 'SKIPPED_CLEAN');
    assert.equal(orchClean.state.token_usage_per_node['A10']?.tokens_saved, true);
    assert.equal(orchClean.state.next_action, 'FINISH');
    assert.ok(orchClean.state.a10_result?.section_3_html?.includes('Sodium Laureth Sulfate'), 'S3 zbudowana deterministycznie mimo pominięcia w schemacie A6');
    assert.ok(orchClean.state.a10_result?.section_5_html?.includes('Italchimica S.r.l.'), 'S5 zbudowana deterministycznie mimo pominięcia w schemacie A6');
    assert.ok(orchClean.state.a10_result?.section_6_html?.includes('Podmiot odpowiedzialny w UE'), 'S6 zbudowana deterministycznie mimo pominięcia w schemacie A6');

    // 4E. Warunkowa eskalacja do A10 przy escalate_to_pro = true
    const orchEsc = new Orchestrator('8032680390036');
    orchEsc.state.is_full_pipeline_run = true;
    orchEsc.state.next_action = 'RUN_A11';
    orchEsc.state.extracted_data = orchClean.state.extracted_data;
    orchEsc.state.a4_result = orchClean.state.a4_result;
    orchEsc.state.a7_result = buildClean6Sections();

    const calledEsc = [];
    let capturedA10EscalationReason = '';
    aiWrapper.callAgentWithTelemetry = async ({ agentId, prompt }) => {
        calledEsc.push(agentId);
        if (agentId === '11') {
            return {
                result: {
                    product_identity: { exact_product_type: 'Płynne mydło', primary_regime: 'codzienny' },
                    domain_issues_detected: ['Wątpliwość prawna'],
                    patches: [],
                    escalate_to_pro: true,
                    escalation_reason: 'WYMAGA_WERYFIKACJI_655_2013'
                },
                usage: {}
            };
        }
        if (agentId === '10') {
            capturedA10EscalationReason = prompt;
            return { result: { patches: [] }, usage: {} };
        }
        return { result: {}, usage: {} };
    };

    try {
        await orchEsc.run({
            text_fields: {
                name: 'Dermomed Mydło w płynie 750 ml',
                features: { Producent: 'Italchimica S.r.l.', Postać: 'w płynie' }
            }
        });
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
    }

    assert.deepStrictEqual(calledEsc, ['11', '10'], 'Gdy A11 zgłosi escalate_to_pro=true, A10 Pro MUSI zostać wywołany');
    assert.ok(capturedA10EscalationReason.includes('WYMAGA_WERYFIKACJI_655_2013'));
    assert.equal(orchEsc.state.node_status['A10'], 'OK');
});
