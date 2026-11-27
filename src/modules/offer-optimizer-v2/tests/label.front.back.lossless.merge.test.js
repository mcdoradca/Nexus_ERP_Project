const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    sanitizeClientCurrentFeatures,
    mergeFrontScanFeaturesSafely,
    BACK_LABEL_IMAGE_KEYS,
    isInternalLabelImageKey,
    extractBackLabelSlotsFromFeatures,
    collectBackLabelImagesFromFeatures
} = require('../services/label-truth.helpers');

const SCHEMA_SAMPLE = [
    { id: '224234', name: 'Pojemność', type: 'float', unit: 'l', required: true, restrictions: { min: 0.01, max: 50, precision: 3 } },
    { id: '225165', name: 'Liczba prań', type: 'integer', required: false, restrictions: { min: 1, max: 1000 } },
    {
        id: '224238',
        name: 'Postać',
        type: 'dictionary',
        required: true,
        dictionary: [{ id: '1', value: 'płyn' }, { id: '2', value: 'żel' }]
    },
    { id: '225169', name: 'Zapach', type: 'string', required: false },
    { id: '248811', name: 'Marka', type: 'dictionary', required: true, dictionary: [{ id: '1', value: 'Chante Clair' }, { id: '0', value: 'inna' }] }
];

test('ADR-0205: mergeFrontScanFeaturesSafely w sekwencji Tył -> Przód nie kasuje ani nie nadpisuje pól tylnej etykiety', () => {
    const afterBackScan = {
        'Skład/INCI': '<5% Anionic surfactants, Oxygen-based bleaching agents',
        'Ostrzeżenia': 'UWAGA. P102 Chronić przed dziećmi.',
        'Ostrzeżenia (Etykieta)': 'UWAGA. P102 Chronić przed dziećmi.',
        'Sposób użycia': 'Pranie w pralce: 45 ml na wsad 4-5 kg.',
        'Sposób użycia (Etykieta)': 'Pranie w pralce: 45 ml na wsad 4-5 kg.',
        'Pojemność nakrętki (Etykieta)': '60 ml',
        'Piktogramy CLP (Etykieta)': 'GHS07',
        'Postać (Etykieta)': 'płyn',
        'Postać': 'płyn',
        'Kraj pochodzenia (Etykieta)': 'Włochy',
        'Liczba prań (Etykieta)': '46',
        'Producent': 'Real Chimica S.r.l.',
        'Pojemność': '0.9',
        'Marka': 'Chante Clair'
    };

    const frontScanOutput = {
        'Nazwa produktu (Etykieta Front)': 'Chanteclair Scioglimacchia Bianchi',
        'Pojemność / Waga': '900 ml',
        'Pojemność': '900 ml',
        'Postać (Etykieta)': 'żel',
        'Postać': 'żel',
        'Marka': 'Chanteclair',
        'Kraj pochodzenia (Front)': 'Włochy',
        'Wyróżniki (Etykieta Front)': 'Do białych tkanin'
    };

    const { updatedFeatures, appliedFrontKeys } = mergeFrontScanFeaturesSafely(afterBackScan, frontScanOutput);

    assert.equal(updatedFeatures['Skład/INCI'], afterBackScan['Skład/INCI']);
    assert.equal(updatedFeatures['Sposób użycia'], afterBackScan['Sposób użycia']);
    assert.equal(updatedFeatures['Sposób użycia (Etykieta)'], afterBackScan['Sposób użycia (Etykieta)']);
    assert.equal(updatedFeatures['Pojemność nakrętki (Etykieta)'], '60 ml');
    assert.equal(updatedFeatures['Piktogramy CLP (Etykieta)'], 'GHS07');
    assert.equal(updatedFeatures['Producent'], 'Real Chimica S.r.l.');
    assert.equal(updatedFeatures['Kraj pochodzenia (Etykieta)'], 'Włochy');
    assert.equal(updatedFeatures['Liczba prań (Etykieta)'], '46');

    assert.equal(updatedFeatures['Postać (Etykieta)'], 'płyn', 'Postać (Etykieta) z tyłu pozostaje nienaruszona');
    assert.equal(updatedFeatures['Postać (Front)'], 'żel', 'Odczyt z frontu zapisuje się osobno w Postać (Front)');
    assert.equal(updatedFeatures['Postać'], 'płyn', 'Istniejąca Postać pozostaje nienaruszona');
    assert.equal(updatedFeatures['Pojemność'], '0.9', 'Znormalizowana Pojemność Allegro nie może zostać nadpisana surowym "900 ml"');
    assert.equal(updatedFeatures['Pojemność / Waga'], '900 ml');
    assert.equal(updatedFeatures['Marka'], 'Chante Clair', 'Znormalizowana Marka słownikowa pozostaje zachowana');
    assert.equal(updatedFeatures['Nazwa produktu (Etykieta Front)'], 'Chanteclair Scioglimacchia Bianchi');
    assert.equal(updatedFeatures['Wyróżniki (Etykieta Front)'], 'Do białych tkanin');
    assert.ok(appliedFrontKeys.includes('Postać (Front)'));
    assert.ok(appliedFrontKeys.includes('Pojemność / Waga'));
});

test('ADR-0205: sanitizeClientCurrentFeatures i frontend mergeLabelExtractionResponseIntoFeatures (Tył->Przód i Przód->Tył bez strat)', async () => {
    const cleaned = sanitizeClientCurrentFeatures({
        'Zdjęcie frontu opakowania': 'data:image/jpeg;base64,/9j/4AAQSk',
        'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,/9j/back',
        '_backImageUrl': 'https://example.com/back.jpg',
        'Sposób użycia': '45 ml do pralki',
        'Zapach': 'Lawenda'
    });
    assert.equal(cleaned['Zdjęcie frontu opakowania'], undefined);
    assert.equal(cleaned['Zdjęcie tyłu opakowania'], undefined);
    assert.equal(cleaned['_backImageUrl'], undefined);
    assert.equal(cleaned['Sposób użycia'], '45 ml do pralki');
    assert.equal(cleaned['Zapach'], 'Lawenda');

    const moduleUrl = pathToFileURL(
        path.resolve(__dirname, '../../../../frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js')
    ).href;
    const fmt = await import(moduleUrl);

    const light = fmt.stripHeavyImagesFromFeatures({
        'Zdjęcie frontu opakowania': 'data:image/jpeg;base64,ABC',
        'Sposób użycia': 'Dozowanie 45 ml',
        'Pojemność nakrętki (Etykieta)': '60 ml'
    });
    assert.equal(light['Zdjęcie frontu opakowania'], undefined);
    assert.equal(light['Sposób użycia'], 'Dozowanie 45 ml');

    // Scenariusz 1: Niezapisany produkt — najpierw Tył, potem Przód
    const stateAfterBack = {
        'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,BACK_IMG',
        'Skład/INCI': '<5% Anionic surfactants, Parfum',
        'Ostrzeżenia': 'UWAGA. P102',
        'Ostrzeżenia (Etykieta)': 'UWAGA. P102',
        'Sposób użycia': 'Pranie w pralce: 45 ml. Standardowa liczba prań: 46.',
        'Sposób użycia (Etykieta)': 'Pranie w pralce: 45 ml. Standardowa liczba prań: 46.',
        'Pojemność nakrętki (Etykieta)': '60 ml',
        'Piktogramy CLP (Etykieta)': 'GHS07',
        'Producent': 'Real Chimica S.r.l.',
        'Kraj pochodzenia (Etykieta)': 'Włochy',
        'Postać (Etykieta)': 'płyn',
        'Liczba prań (Etykieta)': '46',
        'Zapach': 'Pulito Profondo'
    };

    const frontOnlyResponse = {
        found: true,
        mode: 'front',
        frontFound: true,
        backFound: false,
        inci: null,
        warnings: null,
        usageInstructions: null,
        appliedFeatures: {
            'Nazwa produktu (Etykieta Front)': 'Chanteclair Lavatrice Pulito Profondo',
            'Pojemność / Waga': '900 ml',
            'Pojemność': '0.9',
            'Wydajność': '46 prań',
            'Postać (Front)': 'płyn',
            'Wyróżniki (Etykieta Front)': 'Działa w niskich temperaturach'
        },
        autoMappedParams: {
            'Liczba prań': '46',
            'Pojemność': '0.9',
            'Postać': 'płyn'
        },
        removedKeys: ['Zapach'],
        ocrDiagnostics: null,
        // Symulacja sytuacji, w której backend dostarczyłby niepełny snapshot updatedFeatures (nie może nadpisać stanu UI):
        updatedFeatures: {
            'Nazwa produktu (Etykieta Front)': 'Chanteclair Lavatrice Pulito Profondo',
            'Pojemność / Waga': '900 ml'
        }
    };

    const mergedAfterFront = fmt.mergeLabelExtractionResponseIntoFeatures(stateAfterBack, frontOnlyResponse, {
        mode: 'front',
        overrideFrontImg: 'data:image/jpeg;base64,FRONT_IMG',
        allegroSchema: SCHEMA_SAMPLE,
        productName: 'Chante Clair Odplamiacz'
    });

    assert.equal(mergedAfterFront['Skład/INCI'], stateAfterBack['Skład/INCI']);
    assert.equal(mergedAfterFront['Sposób użycia'], stateAfterBack['Sposób użycia']);
    assert.equal(mergedAfterFront['Sposób użycia (Etykieta)'], stateAfterBack['Sposób użycia (Etykieta)']);
    assert.equal(mergedAfterFront['Pojemność nakrętki (Etykieta)'], '60 ml');
    assert.equal(mergedAfterFront['Piktogramy CLP (Etykieta)'], 'GHS07');
    assert.equal(mergedAfterFront['Producent'], 'Real Chimica S.r.l.');
    assert.equal(mergedAfterFront['Zdjęcie tyłu opakowania'], 'data:image/jpeg;base64,BACK_IMG');
    assert.equal(mergedAfterFront['Zdjęcie frontu opakowania'], 'data:image/jpeg;base64,FRONT_IMG');
    assert.equal(mergedAfterFront['Nazwa produktu (Etykieta Front)'], 'Chanteclair Lavatrice Pulito Profondo');
    assert.equal(mergedAfterFront['Pojemność'], '0.9');
    assert.equal(mergedAfterFront['Liczba prań'], '46');
    assert.equal(mergedAfterFront['Zapach'], undefined, 'Jawnie zgłoszony przez removedKeys błędny zapach zostaje usunięty');

    // Scenariusz 2: Odwrotnie — najpierw Przód, potem Tył
    const stateAfterFront = {
        'Zdjęcie frontu opakowania': 'data:image/jpeg;base64,FRONT_IMG',
        'Nazwa produktu (Etykieta Front)': 'Chanteclair Odplamiacz 900 ml',
        'Wariant (Etykieta Front)': 'Scioglimacchia Bianchi',
        'Pojemność / Waga': '900 ml',
        'Pojemność': '0.9',
        'Wyróżniki (Etykieta Front)': 'Do białych tkanin'
    };
    const backOnlyResponse = {
        found: true,
        mode: 'back',
        frontFound: false,
        backFound: true,
        inci: '<5% Oxygen-based bleaching agents',
        warnings: 'UWAGA. H319.',
        usageInstructions: 'Dozować 50 ml na cykl.',
        appliedFeatures: {
            'Ostrzeżenia (Etykieta)': 'UWAGA. H319.',
            'Sposób użycia (Etykieta)': 'Dozować 50 ml na cykl.',
            'Kraj pochodzenia (Etykieta)': 'Włochy'
        },
        removedKeys: [],
        ocrDiagnostics: { dosageTableLegibility: 'HIGH', dosageMathValid: true, ocrQualityWarning: null }
    };

    const mergedAfterBack = fmt.mergeLabelExtractionResponseIntoFeatures(stateAfterFront, backOnlyResponse, {
        mode: 'back',
        overrideBackImg: 'data:image/jpeg;base64,BACK_IMG',
        allegroSchema: SCHEMA_SAMPLE,
        productName: 'Chante Clair Odplamiacz 900 ml'
    });
    assert.equal(mergedAfterBack['Nazwa produktu (Etykieta Front)'], 'Chanteclair Odplamiacz 900 ml');
    assert.equal(mergedAfterBack['Wariant (Etykieta Front)'], 'Scioglimacchia Bianchi');
    assert.equal(mergedAfterBack['Wyróżniki (Etykieta Front)'], 'Do białych tkanin');
    assert.equal(mergedAfterBack['Zdjęcie frontu opakowania'], 'data:image/jpeg;base64,FRONT_IMG');
    assert.equal(mergedAfterBack['Zdjęcie tyłu opakowania'], 'data:image/jpeg;base64,BACK_IMG');
    assert.equal(mergedAfterBack['Skład/INCI'], '<5% Oxygen-based bleaching agents');
    assert.equal(mergedAfterBack['Sposób użycia'], 'Dozować 50 ml na cykl.');
    assert.equal(mergedAfterBack['Pojemność'], '0.9');
});

test('ADR-0206: 3 sloty zdjęć tyłu/boków — helpery SSOT, zachowanie w trybie front oraz bezstratne scalanie UI', async () => {
    assert.deepEqual(BACK_LABEL_IMAGE_KEYS, [
        'Zdjęcie tyłu opakowania',
        'Zdjęcie tyłu opakowania 2',
        'Zdjęcie tyłu opakowania 3'
    ]);
    assert.equal(isInternalLabelImageKey('Zdjęcie tyłu opakowania 2'), true);
    assert.equal(isInternalLabelImageKey('Zdjęcie tyłu opakowania 3'), true);
    assert.equal(isInternalLabelImageKey('_backImageUrl2'), true);
    assert.equal(isInternalLabelImageKey('_backImageUrl3'), true);

    const featWith3Sides = {
        'Zdjęcie frontu opakowania': 'data:image/jpeg;base64,FRONT',
        'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,SIDE1',
        'Zdjęcie tyłu opakowania 2': 'data:image/jpeg;base64,SIDE2',
        'Zdjęcie tyłu opakowania 3': 'data:image/jpeg;base64,SIDE3',
        'Skład/INCI': '5-15% Oxygen-based bleaching agents',
        'Producent': 'Procter & Gamble'
    };

    assert.deepEqual(
        extractBackLabelSlotsFromFeatures(featWith3Sides),
        ['data:image/jpeg;base64,SIDE1', 'data:image/jpeg;base64,SIDE2', 'data:image/jpeg;base64,SIDE3']
    );
    assert.deepEqual(
        collectBackLabelImagesFromFeatures(featWith3Sides),
        ['data:image/jpeg;base64,SIDE1', 'data:image/jpeg;base64,SIDE2', 'data:image/jpeg;base64,SIDE3']
    );

    const cleaned = sanitizeClientCurrentFeatures(featWith3Sides);
    assert.equal(cleaned['Zdjęcie tyłu opakowania'], undefined);
    assert.equal(cleaned['Zdjęcie tyłu opakowania 2'], undefined);
    assert.equal(cleaned['Zdjęcie tyłu opakowania 3'], undefined);
    assert.equal(cleaned['Skład/INCI'], '5-15% Oxygen-based bleaching agents');

    const { updatedFeatures: afterFront } = mergeFrontScanFeaturesSafely(featWith3Sides, {
        'Nazwa produktu (Etykieta Front)': 'Dash Polvere Lavatrice',
        'Zdjęcie tyłu opakowania 2': 'SHOULD_NOT_OVERWRITE',
        'Zdjęcie tyłu opakowania 3': 'SHOULD_NOT_OVERWRITE'
    });
    assert.equal(afterFront['Zdjęcie tyłu opakowania'], 'data:image/jpeg;base64,SIDE1');
    assert.equal(afterFront['Zdjęcie tyłu opakowania 2'], 'data:image/jpeg;base64,SIDE2');
    assert.equal(afterFront['Zdjęcie tyłu opakowania 3'], 'data:image/jpeg;base64,SIDE3');

    const moduleUrl = pathToFileURL(
        path.resolve(__dirname, '../../../../frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js')
    ).href;
    const fmt = await import(moduleUrl);

    assert.deepEqual(
        fmt.getBackLabelSlotsFromFeatures({
            'Zdjęcie tyłu opakowania': 'IMG1',
            'Zdjęcie tyłu opakowania 3': 'IMG3'
        }),
        ['IMG1', '', 'IMG3']
    );

    const stripped = fmt.stripHeavyImagesFromFeatures(featWith3Sides);
    assert.equal(stripped['Zdjęcie tyłu opakowania 2'], undefined);
    assert.equal(stripped['Zdjęcie tyłu opakowania 3'], undefined);
    assert.equal(stripped['Producent'], 'Procter & Gamble');

    // Usunięcie slotu 2 i dodanie slotów 1+3 przy skanie tyłu/boków
    const afterBackScan = fmt.mergeLabelExtractionResponseIntoFeatures(
        {
            'Zdjęcie frontu opakowania': 'FRONT_IMG',
            'Zdjęcie tyłu opakowania': 'OLD1',
            'Zdjęcie tyłu opakowania 2': 'OLD2',
            'Zdjęcie tyłu opakowania 3': 'OLD3'
        },
        {
            found: true,
            mode: 'back',
            inci: '5-15% Oxygen-based bleaching agents',
            removedKeys: ['Zdjęcie tyłu opakowania 2']
        },
        {
            mode: 'back',
            overrideBackSlots: ['NEW1', '', 'NEW3'],
            allegroSchema: SCHEMA_SAMPLE,
            productName: 'Dash Proszek do prania'
        }
    );
    assert.equal(afterBackScan['Zdjęcie frontu opakowania'], 'FRONT_IMG');
    assert.equal(afterBackScan['Zdjęcie tyłu opakowania'], 'NEW1');
    assert.equal(afterBackScan['Zdjęcie tyłu opakowania 2'], undefined);
    assert.equal(afterBackScan['Zdjęcie tyłu opakowania 3'], 'NEW3');

    // Kolejny skan przodu nie kasuje żadnego ze slotów tyłu/boków
    const afterFollowUpFront = fmt.mergeLabelExtractionResponseIntoFeatures(
        afterBackScan,
        {
            found: true,
            mode: 'front',
            appliedFeatures: { 'Nazwa produktu (Etykieta Front)': 'Dash Polvere' },
            removedKeys: ['Zdjęcie tyłu opakowania 3']
        },
        {
            mode: 'front',
            overrideFrontImg: 'NEW_FRONT_IMG',
            allegroSchema: SCHEMA_SAMPLE,
            productName: 'Dash Proszek do prania'
        }
    );
    assert.equal(afterFollowUpFront['Zdjęcie frontu opakowania'], 'NEW_FRONT_IMG');
    assert.equal(afterFollowUpFront['Zdjęcie tyłu opakowania'], 'NEW1');
    assert.equal(afterFollowUpFront['Zdjęcie tyłu opakowania 3'], 'NEW3');
});
