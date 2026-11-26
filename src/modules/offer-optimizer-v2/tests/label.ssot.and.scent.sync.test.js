const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    sanitizeScentValue,
    filterHeroIngredients,
    extractVerifiedLabelYield,
    extractLabelEvidenceSubsets,
    mergeFeaturesWithLabelPrecedence
} = require('../services/label-truth.helpers');
const { sanitizeVisionOfficialName } = require('../vision-extractor.service');
const { mapPackagingFeaturesToAllegroSchema } = require('../services/allegro-param-automapper.service');

const SCHEMA_260128_LAUNDRY_LIQUID = [
    {
        id: '11323',
        name: 'Stan',
        type: 'dictionary',
        required: true,
        dictionary: [{ id: '1', value: 'Nowy' }, { id: '2', value: 'Używany' }]
    },
    { id: '225693', name: 'EAN (GTIN)', type: 'string', required: false },
    { id: '248811', name: 'Marka', type: 'dictionary', required: true, options: { ambiguousValueId: '0' }, dictionary: [{ id: '10', value: 'Chanteclair' }, { id: '0', value: 'inna' }] },
    { id: '216629', name: 'Nazwa handlowa', type: 'dictionary', required: true, options: { ambiguousValueId: '0' }, dictionary: [{ id: '20', value: 'Chante Clair Pulito Profondo' }, { id: '0', value: 'inna' }] },
    {
        id: '249730',
        name: 'Rodzaj prania',
        type: 'dictionary',
        required: true,
        dictionary: [
            { id: 'r1', value: 'automatyczne' },
            { id: 'r2', value: 'brak informacji' },
            { id: 'r3', value: 'namaczanie' },
            { id: 'r4', value: 'ręczne' },
            { id: 'r5', value: 'uniwersalne' }
        ]
    },
    {
        id: '225173',
        name: 'Zastosowanie do',
        type: 'dictionary',
        required: false,
        dictionary: [
            { id: 'z1', value: 'białego' },
            { id: 'z2', value: 'czarnego' },
            { id: 'z3', value: 'kolorów' },
            { id: 'z4', value: 'uniwersalne' },
            { id: 'z5', value: 'brak informacji' }
        ]
    },
    { id: '225165', name: 'Liczba prań', type: 'integer', required: false, restrictions: { min: 1, max: 1000 } },
    { id: '224234', name: 'Pojemność', type: 'float', unit: 'l', required: true, restrictions: { min: 0.01, max: 50, precision: 3 } },
    {
        id: '224238',
        name: 'Postać',
        type: 'dictionary',
        required: true,
        dictionary: [
            { id: 'f1', value: 'płyn' },
            { id: 'f2', value: 'żel' },
            { id: 'f3', value: 'kapsułki' }
        ]
    },
    {
        id: '225169',
        name: 'Zapach',
        type: 'string',
        required: false
    },
    {
        id: '225177',
        name: 'Cechy dodatkowe',
        type: 'dictionary',
        required: false,
        restrictions: { multipleChoices: true },
        dictionary: [
            { id: 'c1', value: 'ekologiczne' },
            { id: 'c2', value: 'hipoalergiczny' },
            { id: 'c3', value: 'koncentrat' },
            { id: 'c4', value: 'skuteczny w niskiej temperaturze' },
            { id: 'c5', value: 'z odplamiaczem' },
            { id: 'c6', value: 'z wybielaczem' },
            { id: 'c7', value: 'do tkanin syntetycznych' }
        ]
    },
    {
        id: '20309',
        name: 'Opakowanie',
        type: 'dictionary',
        required: false,
        dictionary: [
            { id: 'o1', value: 'plastikowa butelka' },
            { id: 'o2', value: 'zgrzewany worek' }
        ]
    },
    {
        id: '238050',
        name: 'Kraj pochodzenia',
        type: 'dictionary',
        required: false,
        dictionary: [
            { id: 'k1', value: 'Włochy' },
            { id: 'k2', value: 'Niemcy' },
            { id: 'k3', value: 'Polska' }
        ]
    },
    { id: '17448', name: 'Waga produktu z opakowaniem jednostkowym', type: 'float', unit: 'kg', required: false, restrictions: { min: 0.01, max: 100, precision: 3 } }
];

test('ADR-0203: sanitizeScentValue odrzuca funkcje/warianty produktu i tłumaczy autentyczne włoskie nuty zapachowe na PL', () => {
    const invalidInputs = [
        'Pulito Profondo',
        'pulito profondo',
        'Głębokie czyszczenie',
        'Dokładne czyszczenie',
        'Extra Smacchiante',
        'delikatny',
        'Delicato',
        'Total Black',
        'Classico',
        'Universale',
        'Sgrassatore',
        'Profumo di pulito',
        'Medium',
        'Candeggina',
        'Świeży',
        'Ochrona kolorów'
    ];
    for (const bad of invalidInputs) {
        const res = sanitizeScentValue(bad);
        assert.equal(res.valid, false, `Oczekiwano odrzucenia nie-zapachu "${bad}"`);
        assert.equal(res.value, null);
    }

    assert.deepEqual(
        { v: sanitizeScentValue('Lavanda').valid, out: sanitizeScentValue('Lavanda').value, tr: sanitizeScentValue('Lavanda').translated },
        { v: true, out: 'Lawenda', tr: true }
    );
    assert.equal(sanitizeScentValue('Muschio Bianco').value, 'Białe piżmo');
    assert.equal(sanitizeScentValue('Sapone di Marsiglia').value, 'Mydło marsylskie');
    assert.equal(sanitizeScentValue('Talco e Iris').value, 'Talk i irys');
    assert.equal(sanitizeScentValue('Lavanda e Marsiglia').value, 'Lawenda i mydło marsylskie');

    assert.equal(sanitizeScentValue('Mydło i kwiaty bawełny').valid, true);
    assert.equal(sanitizeScentValue('Mydło i kwiaty bawełny').value, 'Mydło i kwiaty bawełny');
    assert.equal(sanitizeScentValue('Świeży chlor').valid, true);
    assert.equal(sanitizeScentValue('Mango').valid, true);
});

test('ADR-0203: sanitizeVisionOfficialName zachowuje włoskie nazwy własne (Pulito Profondo) i filterHeroIngredients przenosi Odtłuszczacz do wyróżników', () => {
    const cleanName = sanitizeVisionOfficialName('Chanteclair Lavatrice Pulito Profondo extra smacchiante Nr 1 100%');
    assert.ok(cleanName.includes('Pulito Profondo'), `Nie wolno tłumaczyć/okaleczać oficjalnej nazwy własnej: "${cleanName}"`);
    assert.ok(!cleanName.includes('Głębokie czyszczenie'), 'Zakaz podmiany "Pulito Profondo" na "Głębokie czyszczenie" w oficjalnej nazwie');
    assert.ok(!/Nr\s*1|100\s*%/i.test(cleanName), 'Musi usuwać zakazany hype typu Nr 1 / 100%');

    const hero = filterHeroIngredients(['Odtłuszczacz', 'Mydło marsylskie', 'Odplamiacz', 'Detersivo']);
    assert.deepEqual(hero.ingredients, ['Mydło marsylskie']);
    assert.deepEqual(hero.movedToHighlights, ['Formuła odtłuszczająca', 'Działanie odplamiające']);
});

test('ADR-0203: E2E 8015194533328 — etykieta nadpisuje stare BaseLinker 41->46 i 2->2.07, czyści Zapach Pulito Profondo i mapuje 260128', () => {
    const res = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: SCHEMA_260128_LAUNDRY_LIQUID,
        currentFeatures: {
            'Marka': 'Chanteclair',
            'Liczba prań': '41',
            'Zapach': 'Pulito Profondo',
            'Pojemność': '2',
            'Postać': 'żel',
            'Cechy dodatkowe': 'skuteczny w niskiej temperaturze',
            'Stan': 'Nowy',
            'Stan opakowania': 'oryginalne',
            'Kod taryfy celnej': '34029090'
        },
        visionFront: {
            'Nazwa produktu (Etykieta Front)': 'Chanteclair Lavatrice Pulito Profondo extra smacchiante',
            'Wariant (Etykieta Front)': 'Pulito Profondo extra smacchiante',
            'Pojemność / Waga': '2070 ml',
            'Wydajność': '46 prań',
            'Postać (Etykieta)': 'płyn',
            'Kraj pochodzenia (Front)': 'Włochy',
            'Opakowanie (Front)': 'plastikowa butelka',
            'Wyróżniki (Etykieta Front)': 'Działa w niskich temperaturach, Formuła odtłuszczająca'
        },
        visionBack: {
            'Sposób użycia (Etykieta)': 'Pranie w pralce (wsad 4-5 kg): 45 ml. Pranie ręczne: 35 ml na 10 l wody. Standardowa liczba prań: 46.',
            'Liczba prań (Etykieta)': '46',
            'Kraj pochodzenia (Etykieta)': 'Włochy'
        },
        product: {
            ean: '8015194533328',
            name: 'Chante Clair Płyn do prania Pulito 2070 ml',
            weight: 2.2
        }
    });

    assert.equal(res.updatedFeatures['Liczba prań'], '46', 'Liczba prań z etykiety (46) musi nadpisać stare BaseLinkerowe 41');
    assert.equal(res.overriddenParams['Liczba prań']?.from, '41');
    assert.equal(res.overriddenParams['Liczba prań']?.to, '46');
    assert.equal(res.updatedFeatures['Pojemność'], '2.07', 'Pojemność z etykiety (2070 ml -> 2.07 l) musi nadpisać stare 2');
    assert.equal(res.updatedFeatures['Postać'], 'płyn', 'Postać z etykiety musi nadpisać błędny żel');
    assert.equal(res.updatedFeatures['Zapach'], undefined, 'Błędny Zapach ("Pulito Profondo") musi zostać usunięty');
    assert.ok(res.cleanedInvalidParams.includes('Zapach'));
    assert.equal(res.updatedFeatures['Rodzaj prania'], 'uniwersalne');
    assert.equal(res.updatedFeatures['Zastosowanie do'], 'uniwersalne');
    assert.ok(res.updatedFeatures['Cechy dodatkowe'].includes('skuteczny w niskiej temperaturze'));
    assert.ok(res.updatedFeatures['Cechy dodatkowe'].includes('z odplamiaczem'));

    // Powtórne wywołanie z "delikatny" też musi wyczyścić Zapach, a z "Lavanda" przetłumaczyć na "Lawenda"
    const resDelikatny = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: SCHEMA_260128_LAUNDRY_LIQUID,
        currentFeatures: { 'Zapach': 'delikatny' },
        product: { ean: '8015194533328', name: 'Chanteclair Lavatrice 2070 ml' }
    });
    assert.equal(resDelikatny.updatedFeatures['Zapach'], undefined);

    const resLavanda = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: SCHEMA_260128_LAUNDRY_LIQUID,
        currentFeatures: { 'Zapach': 'Lavanda' },
        product: { ean: '8015194533328', name: 'Chanteclair Lavatrice Lavanda 2070 ml' }
    });
    assert.equal(resLavanda.updatedFeatures['Zapach'], 'Lawenda');
});

test('ADR-0203: extractVerifiedLabelYield i mergeFeaturesWithLabelPrecedence chronią prawdę etykietową przed BaseLinkerem oraz chronią przypadek Dermomed', () => {
    const yieldOnlyUsage = extractVerifiedLabelYield({
        visionBack: { 'Sposób użycia (Etykieta)': 'Pranie w pralce: 45 ml. Standardowa liczba prań: 46.' },
        features: { 'Liczba prań': '41' } // surowe BL 41 nie może wygrać!
    });
    assert.equal(yieldOnlyUsage.count, 46);

    const noEvidenceYield = extractVerifiedLabelYield({
        features: { 'Liczba prań': '41' }
    });
    assert.equal(noEvidenceYield.count, null);

    const subsets = extractLabelEvidenceSubsets({
        'Liczba prań': '41',
        'Zapach': 'Pulito Profondo',
        'Wydajność': '46 prań',
        'Postać (Etykieta)': 'płyn',
        'Sposób użycia (Etykieta)': '45 ml',
        '_labelsPreScannedAt': '2026-11-26T10:00:00.000Z'
    });
    assert.equal(subsets.visionFront['Wydajność'], '46 prań');
    assert.equal(subsets.visionFront['Zapach'], undefined);
    assert.equal(subsets.visionFront['Liczba prań'], undefined);
    assert.equal(subsets.visionBack['Postać (Etykieta)'], 'płyn');

    const merged = mergeFeaturesWithLabelPrecedence(
        {
            '_labelsPreScannedAt': '2026-11-26T10:00:00.000Z',
            'Liczba prań': '46',
            'Wydajność': '46 prań',
            'Postać': 'płyn',
            'Postać (Etykieta)': 'płyn',
            'Pojemność': '2.07',
            'Pojemność / Waga': '2070 ml',
            'Sposób użycia (Etykieta)': 'Dozowanie 45 ml',
            'Sposób użycia': 'Dozowanie 45 ml'
        },
        {
            'Liczba prań': '41',
            'Zapach': 'Pulito Profondo',
            'Postać': 'żel',
            'Pojemność': '2',
            'Sposób użycia': 'Przestarzały tekst z BaseLinkera',
            'Kod taryfy celnej': '34029090'
        }
    );
    assert.equal(merged['Liczba prań'], '46');
    assert.equal(merged['Postać'], 'płyn');
    assert.equal(merged['Pojemność'], '2.07');
    assert.equal(merged['Sposób użycia'], 'Dozowanie 45 ml');
    assert.equal(merged['Zapach'], undefined);
    assert.equal(merged['Kod taryfy celnej'], '34029090');

    // Tarcza Dermomed Case B: bez zweryfikowanego dowodu etykietowego operatorskie 'w płynie' jest nietykalne
    const dermomedRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: [
            { id: '224238', name: 'Postać', type: 'dictionary', required: true, dictionary: [{ id: '1', value: 'w płynie' }, { id: '2', value: 'w kremie' }] }
        ],
        currentFeatures: { 'Postać': 'w płynie' },
        visionFront: { 'Postać': 'w kremie' },
        product: { ean: '8032680390036', name: 'Dermomed Talco e Iris Mydło 750 ml' }
    });
    assert.equal(dermomedRes.updatedFeatures['Postać'], 'w płynie');
});

test('ADR-0203: Frontend allegroParamFormatter — wykrywanie rozbieżności SSOT (41 vs 46, Zapach Pulito Profondo) i dwukierunkowa synchronizacja', async () => {
    const moduleUrl = pathToFileURL(
        path.resolve(__dirname, '../../../../frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js')
    ).href;
    const fmt = await import(moduleUrl);

    const dirtyFeats = {
        'Liczba prań': '41',
        'Wydajność': '46 prań',
        'Pojemność': '2',
        'Pojemność / Waga': '2070 ml',
        'Postać': 'żel',
        'Postać (Etykieta)': 'płyn',
        'Nazwa produktu (Etykieta Front)': 'Chanteclair Lavatrice Pulito Profondo',
        'Zapach': 'Pulito Profondo',
        'Kraj pochodzenia': 'Niemcy',
        'Kraj pochodzenia (Etykieta)': 'Włochy'
    };

    const conflicts = fmt.detectLabelAllegroConflicts(dirtyFeats, SCHEMA_260128_LAUNDRY_LIQUID);
    const conflictNames = conflicts.map(c => c.paramName);
    assert.ok(conflictNames.includes('Liczba prań'));
    assert.ok(conflictNames.includes('Pojemność'));
    assert.ok(conflictNames.includes('Postać'));
    assert.ok(conflictNames.includes('Zapach'));
    assert.ok(conflictNames.includes('Kraj pochodzenia'));

    const synced = fmt.syncFeaturesFromLabelTruth(dirtyFeats, SCHEMA_260128_LAUNDRY_LIQUID);
    assert.equal(synced.features['Liczba prań'], '46');
    assert.equal(synced.features['Pojemność'], '2.07');
    assert.equal(synced.features['Postać'], 'płyn');
    assert.equal(synced.features['Kraj pochodzenia'], 'Włochy');
    assert.equal(synced.features['Zapach'], undefined);

    const editedFromAllegro = fmt.syncLinkedFeatureOnEdit(synced.features, 'Liczba prań', '50', SCHEMA_260128_LAUNDRY_LIQUID);
    assert.equal(editedFromAllegro['Liczba prań'], '50');
    assert.equal(editedFromAllegro['Wydajność'], '50 prań');

    const editedFromPim = fmt.syncLinkedFeatureOnEdit(editedFromAllegro, 'Wydajność', '48 prań', SCHEMA_260128_LAUNDRY_LIQUID);
    assert.equal(editedFromPim['Wydajność'], '48 prań');
    assert.equal(editedFromPim['Liczba prań'], '48');
});
