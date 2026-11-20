const test = require('node:test');
const assert = require('node:assert');
const baselinkerExportService = require('../baselinker.export.service');
const AllegroService = require('../../offer-optimizer/allegro.service');

const MOCK_INVENTORY_PARAMETERS = [
    { parameter_key: 'bl_sys_2032', type: 'select', name_translations: { pl: 'Postać' }, options: [{ option_id: 'id_6', value_translations: { pl: 'płyn' } }, { option_id: 'id_7', value_translations: { pl: 'żel' } }] },
    { parameter_key: 'bl_sys_2033', type: 'select', name_translations: { pl: 'Stan opakowania' }, options: [{ option_id: 'id_1', value_translations: { pl: 'oryginalne' } }] },
    { parameter_key: 'bl_sys_2038', type: 'number', name_translations: { pl: 'Waga produktu z opakowaniem jednostkowym' }, options: [] },
    { parameter_key: 'bl_sys_2040', type: 'number', name_translations: { pl: 'EAN (GTIN)' }, options: [] },
    { parameter_key: 'bl_sys_2041', type: 'number', name_translations: { pl: 'Kod producenta' }, options: [] },
    { parameter_key: 'bl_sys_2044', type: 'number', name_translations: { pl: 'Pojemność' }, options: [] },
    { parameter_key: 'bl_sys_2064', type: 'multiselect', name_translations: { pl: 'Cechy dodatkowe' }, options: [{ option_id: 'id_27', value_translations: { pl: ' bez aluminium' } }, { option_id: 'id_35', value_translations: { pl: 'hipoalergiczny' } }] },
    {
        parameter_key: 'bl_sys_2855',
        type: 'multiselect',
        name_translations: { pl: 'Produkt nie zawiera' },
        options: [
            { option_id: 'id_1', value_translations: { pl: 'alkoholu' } },
            { option_id: 'id_2', value_translations: { pl: 'aluminium' } },
            { option_id: 'id_3', value_translations: { pl: 'amoniaku' } },
            { option_id: 'id_5', value_translations: { pl: 'mydła' } },
            { option_id: 'id_6', value_translations: { pl: 'olejów mineralnych' } },
            { option_id: 'id_7', value_translations: { pl: 'parabenów' } },
            { option_id: 'id_8', value_translations: { pl: 'parafiny' } },
            { option_id: 'id_9', value_translations: { pl: 'PEG' } },
            { option_id: 'id_11', value_translations: { pl: 'silikonów' } },
            { option_id: 'id_14', value_translations: { pl: 'SLS' } },
            { option_id: 'id_15', value_translations: { pl: 'substancji zapachowych' } }
        ]
    }
];

test('BaseLinker Export Service - buildPayload pomija sekcja6 GPSR z description_extra4, wycina surową stopkę Skład INCI z sekcja3 i eksportuje 6 modułów', async () => {
    const origFetchParams = baselinkerExportService.fetchInventoryParameters;
    baselinkerExportService.fetchInventoryParameters = async () => MOCK_INVENTORY_PARAMETERS;

    try {
        const draftData = {
            title: 'Produkt Testowy BaseLinker 500 ml',
            htmlContent: {
                sekcja1: '<h2>⭐ Mocne strony</h2><p>Opis 1</p>',
                sekcja2: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Jak?</li><li>✔️ <b>Odpowiedź:</b> Tak.</li></ul>',
                sekcja3: '<h2>⚙️ Mechanizm działania</h2><ul><li>⚙️ <b>Glycerin (gliceryna roślinna):</b> nawilża skórę.</li><li>⚡ <b>Synergia Podwójnego Nawilżania:</b> wiąże wilgoć w naskórku.</li></ul><p><br></p><p><b>Skład INCI:</b> AQUA, SODIUM LAURETH SULFATE, GLYCERIN</p>',
                sekcja4: '<h2>✍️ Sposób użycia</h2><p>Użyj.</p>',
                sekcja5: '<h2>⚖️ Parametry techniczne</h2><ul><li>Marka: Test</li></ul>',
                sekcja6: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li></ul>',
                sekcja7: '<p>Moduł 7 Reklama</p>'
            },
            images: [
                { originalUrl: 'https://example.com/1.jpg', isCompliant: true },
                { originalUrl: 'https://example.com/2.jpg', isCompliant: true }
            ]
        };

        const payload = await baselinkerExportService.buildPayload('307', '12345', draftData, {
            ean: '8000137015436',
            features: {}
        });

        assert.ok(payload.text_fields.description.includes('Mocne strony'));
        assert.ok(payload.text_fields.description_extra1.includes('FAQ'));
        assert.ok(payload.text_fields.description_extra2.includes('Glycerin (gliceryna roślinna)'), 'description_extra2 musi zachować opis najważniejszych składników i ich działania');
        assert.ok(payload.text_fields.description_extra2.includes('Synergia Podwójnego Nawilżania'));
        assert.strictEqual(/Skład INCI:/i.test(payload.text_fields.description_extra2), false, 'description_extra2 nie może zawierać surowej stopki Skład INCI:');
        assert.strictEqual(payload.text_fields.description_extra2.includes('SODIUM LAURETH SULFATE'), false, 'Surowa lista INCI ze stopki nie może trafić do opisu');
        assert.ok(payload.text_fields.description_extra3.includes('Sposób użycia'));
        assert.ok(payload.text_fields.description_extra4.includes('Parametry techniczne'));
        assert.strictEqual(payload.text_fields.description_extra4.includes('Bezpieczeństwo GPSR'), false, 'description_extra4 nie może zawierać sekcja6 GPSR');
        assert.strictEqual(payload.text_fields.description_extra4.includes('Chronić przed dziećmi'), false, 'description_extra4 nie może zawierać ostrzeżeń GPSR');
        assert.ok(payload.text_fields.extra_field_4245.includes('Moduł 7 Reklama'));
    } finally {
        baselinkerExportService.fetchInventoryParameters = origFetchParams;
    }
});

test('BaseLinker Export Service - korekty parametrów PIM/Allegro mają pierwszeństwo przed hardFeatures, respektują usunięcia i filtrują obrazy base64', async () => {
    const origFetchParams = baselinkerExportService.fetchInventoryParameters;
    baselinkerExportService.fetchInventoryParameters = async () => MOCK_INVENTORY_PARAMETERS;

    const mergedAuth = baselinkerExportService.mergeFeaturesForBaselinker({
        existingFeatures: {
            Opakowanie: 'butelka',
            Waga: '1200',
            Cechy: 'brak',
            'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
        },
        draftFeatures: {
            Opakowanie: 'butelka z pompką',
            Waga: '1000',
            Zapach: 'Mango',
            Linia: 'Energy',
            Pojemność: '',
            'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
        },
        hardFeatures: {
            Opakowanie: 'butelka',
            waga: '1200,00 g',
            Zapach: 'egzotyczny',
            Linia: 'Mango',
            Pojemność: '1000,00 ml',
            Cechy: 'brak',
            Marka: 'Dermomed'
        },
        featuresAuthoritative: true
    });

    assert.strictEqual(mergedAuth.Opakowanie, 'butelka z pompką');
    assert.strictEqual(mergedAuth.Waga, '1000');
    assert.strictEqual(mergedAuth.Zapach, 'Mango');
    assert.strictEqual(mergedAuth.Linia, 'Energy');
    assert.strictEqual(mergedAuth.Pojemność, '1000,00 ml', 'Pusty parametr powinien zostać uzupełniony z fallbacku');
    assert.strictEqual(mergedAuth.Marka, 'Dermomed', 'Nowy brakujący parametr z katalogu może uzupełnić lukę');
    assert.strictEqual('Cechy' in mergedAuth, false, 'Klucz usunięty w UI nie może zostać wskrzeszony przez bazę ani katalog');
    assert.strictEqual('Zdjęcie tyłu opakowania' in mergedAuth, false, 'Klucz wewnętrznego zdjęcia nie może trafiać do parametrów BaseLinkera');

    // Pełny test buildPayload z zaszczepionym starym katalogiem Allegro (hardFeatures)
    const origGetParams = AllegroService.getProductParametersByEan;
    AllegroService.getProductParametersByEan = async () => ({
        Opakowanie: 'butelka',
        Waga: '1200,00 g',
        Zapach: 'egzotyczny',
        Linia: 'Mango'
    });

    try {
        const payload = await baselinkerExportService.buildPayload('307', '61592981', {
            title: 'Dermomed Energy 1000 ml',
            htmlContent: { sekcja1: '<p>Opis</p>' },
            images: [{ originalUrl: 'https://example.com/1.jpg', isCompliant: true }],
            features: {
                Opakowanie: 'butelka z pompką',
                Waga: '1000',
                Zapach: 'Mango',
                Linia: 'Energy',
                'Zdjęcie tyłu opakowania': 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
            },
            featuresAuthoritative: true
        }, {
            ean: '8050999571205',
            allegroCategoryId: '93059',
            features: {
                Opakowanie: 'butelka',
                Waga: '1200',
                Cechy: 'brak'
            }
        });

        assert.strictEqual(payload.text_fields.features.Opakowanie, 'butelka z pompką');
        assert.strictEqual(payload.text_fields.features.Waga, '1000');
        assert.strictEqual(payload.text_fields.features.Zapach, 'Mango');
        assert.strictEqual(payload.text_fields.features.Linia, 'Energy');
        assert.strictEqual('Cechy' in payload.text_fields.features, false);
        assert.strictEqual('Zdjęcie tyłu opakowania' in payload.text_fields.features, false);
        assert.deepStrictEqual(payload.text_fields['features|pl|allegro_16402'], payload.text_fields.features);
    } finally {
        AllegroService.getProductParametersByEan = origGetParams;
        baselinkerExportService.fetchInventoryParameters = origFetchParams;
    }
});

test('BaseLinker Export Service - normalizacja parametrów liczbowych (Waga z opakowaniem, Pojemność, EAN, Kod producenta) i dopasowanie słowników', async () => {
    const { normalizedFeatures, warnings } = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
        'Waga produktu z opakowaniem jednostkowym': '1,1',
        Pojemność: '1000,00 ml',
        'EAN (GTIN)': '8054633831977',
        'Kod producenta': '04801320150',
        Postać: 'Żel',
        'Stan opakowania': 'Oryginalne',
        'Cechy dodatkowe': 'bez aluminium, hipoalergiczny',
        Waga: '1000'
    }, MOCK_INVENTORY_PARAMETERS);

    assert.strictEqual(normalizedFeatures['Waga produktu z opakowaniem jednostkowym'], '1.1');
    assert.strictEqual(normalizedFeatures.Pojemność, '1000');
    assert.strictEqual(normalizedFeatures['EAN (GTIN)'], '8054633831977');
    assert.strictEqual(normalizedFeatures['Kod producenta'], '04801320150', 'Kod z wiodącym zerem musi pozostać nietknięty');
    assert.strictEqual(normalizedFeatures.Postać, 'żel');
    assert.strictEqual(normalizedFeatures['Stan opakowania'], 'oryginalne');
    assert.strictEqual(normalizedFeatures['Cechy dodatkowe'], ' bez aluminium|hipoalergiczny', 'Multiselect w BaseLinker API musi używać separatora "|"');
    assert.strictEqual(normalizedFeatures.Waga, '1000');
    assert.deepStrictEqual(warnings, []);

    // Regresja ADR-0188: pełne i częściowe dopasowanie multiselect "Produkt nie zawiera" (EAN 8032680390937)
    const multiFull = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
        'Produkt nie zawiera': 'parabenów, aluminium, amoniaku, mydła, olejów mineralnych, parafiny, PEG, silikonów, SLS, substancji zapachowych'
    }, MOCK_INVENTORY_PARAMETERS);
    assert.strictEqual(
        multiFull.normalizedFeatures['Produkt nie zawiera'],
        'parabenów|aluminium|amoniaku|mydła|olejów mineralnych|parafiny|PEG|silikonów|SLS|substancji zapachowych'
    );
    assert.deepStrictEqual(multiFull.warnings, []);

    // Idempotentność dla wartości już rozdzielonych "|"
    const multiIdempotent = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
        'Produkt nie zawiera': multiFull.normalizedFeatures['Produkt nie zawiera']
    }, MOCK_INVENTORY_PARAMETERS);
    assert.strictEqual(multiIdempotent.normalizedFeatures['Produkt nie zawiera'], multiFull.normalizedFeatures['Produkt nie zawiera']);
    assert.deepStrictEqual(multiIdempotent.warnings, []);

    // Częściowe dopasowanie multiselect: wysyła dopasowane opcje sklejone "|" i zgłasza pominięte spoza słownika
    const multiPartial = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
        'Produkt nie zawiera': 'aluminium, fosforanów, parabenów, soli, SLS'
    }, MOCK_INVENTORY_PARAMETERS);
    assert.strictEqual(multiPartial.normalizedFeatures['Produkt nie zawiera'], 'aluminium|parabenów|SLS');
    assert.strictEqual(multiPartial.warnings.length, 1);
    assert.ok(multiPartial.warnings[0].includes('fosforanów, soli'));
    assert.ok(multiPartial.warnings[0].includes('wysłano dopasowane wartości'));

    // Edge case'y jednostek kg/g/l oraz wartości niezgodne ze schematem
    assert.strictEqual(
        baselinkerExportService.parseAndFormatNumericFeatureValue('Waga produktu z opakowaniem jednostkowym', '1,200 kg').value,
        '1.2'
    );
    assert.strictEqual(
        baselinkerExportService.parseAndFormatNumericFeatureValue('Waga produktu z opakowaniem jednostkowym', 'ok. 850 g').value,
        '0.85'
    );
    assert.strictEqual(
        baselinkerExportService.parseAndFormatNumericFeatureValue('Pojemność', '1,800 l').value,
        '1.8'
    );

    const badCase = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
        'Kod producenta': 'DM-100',
        Postać: 'żel pod prysznic'
    }, MOCK_INVENTORY_PARAMETERS);
    assert.strictEqual(badCase.normalizedFeatures['Kod producenta'], 'DM-100', 'Alfanumeryczny kod producenta nie może zostać uszkodzony');
    assert.strictEqual(badCase.normalizedFeatures.Postać, 'żel pod prysznic');
    assert.strictEqual(badCase.warnings.length, 2);
    assert.ok(badCase.warnings[0].includes('Kod producenta'));
    assert.ok(badCase.warnings[1].includes('Postać'));
});

test('BaseLinker Export Service - buildPayloadWithDiagnostics i exportToBaselinker normalizują "1,1"/"1,200 kg" i raportują warnings API', async () => {
    const origFetchParams = baselinkerExportService.fetchInventoryParameters;
    const origCallConnector = baselinkerExportService.callConnectorApi;
    baselinkerExportService.fetchInventoryParameters = async () => MOCK_INVENTORY_PARAMETERS;

    let sentPayload = null;
    baselinkerExportService.callConnectorApi = async (method, payload) => {
        if (method === 'addInventoryProduct') {
            sentPayload = payload;
            return {
                status: 'SUCCESS',
                product_id: 61592982,
                warnings: { parameters: { Postać: 'Nieznana wartość opcji' } }
            };
        }
        return { status: 'SUCCESS', parameters: MOCK_INVENTORY_PARAMETERS };
    };

    try {
        const draftData = {
            title: 'Dermomed Carezza 1000 ml',
            htmlContent: { sekcja1: '<p>Opis</p>' },
            images: [{ originalUrl: 'https://example.com/1.jpg', isCompliant: true }],
            features: {
                'Waga produktu z opakowaniem jednostkowym': '1,200 kg',
                Pojemność: '1000,00 ml',
                Postać: 'żel pod prysznic',
                'Stan opakowania': 'oryginalne'
            },
            featuresAuthoritative: true
        };
        const product = { ean: '8054633831977', features: {} };

        const diag = await baselinkerExportService.buildPayloadWithDiagnostics('385', '61592982', draftData, product);
        assert.strictEqual(diag.payload.text_fields.features['Waga produktu z opakowaniem jednostkowym'], '1.2');
        assert.strictEqual(diag.payload.text_fields.features.Pojemność, '1000');
        assert.ok(diag.warnings.some(w => w.includes('Postać')));

        const exportRes = await baselinkerExportService.exportToBaselinker('385', '61592982', draftData, product);
        assert.strictEqual(sentPayload.text_fields.features['Waga produktu z opakowaniem jednostkowym'], '1.2');
        assert.strictEqual(sentPayload.text_fields['features|pl|allegro_16402']['Waga produktu z opakowaniem jednostkowym'], '1.2');
        assert.strictEqual(exportRes.apiWarnings.length, 1);
        assert.ok(exportRes.apiWarnings[0].includes('Postać'));
    } finally {
        baselinkerExportService.fetchInventoryParameters = origFetchParams;
        baselinkerExportService.callConnectorApi = origCallConnector;
    }
});

test('BaseLinker Export Service - cache i fallback fetchInventoryParameters działają przy błędzie API', async () => {
    const origCallConnector = baselinkerExportService.callConnectorApi;
    baselinkerExportService.clearInventoryParametersCache();

    let calls = 0;
    baselinkerExportService.callConnectorApi = async () => {
        calls++;
        throw new Error('Network offline');
    };

    try {
        const fallbackParams = await baselinkerExportService.fetchInventoryParameters('385');
        assert.strictEqual(calls, 1);
        assert.ok(fallbackParams.some(p => p.name_translations?.pl === 'Waga produktu z opakowaniem jednostkowym' && p.type === 'number'));
        assert.ok(fallbackParams.some(p => p.name_translations?.pl === 'Produkt nie zawiera' && p.type === 'multiselect'));

        // W trybie awaryjnego fallbacku (bez listy options) multiselect nadal normalizuje przecinki na '|'
        const fallbackMulti = baselinkerExportService.normalizeFeaturesForBaselinkerSchema({
            'Produkt nie zawiera': 'parabenów, aluminium, SLS'
        }, fallbackParams);
        assert.strictEqual(fallbackMulti.normalizedFeatures['Produkt nie zawiera'], 'parabenów|aluminium|SLS');

        // Ponowna próba z udanym API powinna użyć cache przy drugim wywołaniu
        baselinkerExportService.callConnectorApi = async () => {
            calls++;
            return { status: 'SUCCESS', parameters: MOCK_INVENTORY_PARAMETERS };
        };
        const firstLive = await baselinkerExportService.fetchInventoryParameters('385');
        const secondLive = await baselinkerExportService.fetchInventoryParameters('385');
        assert.strictEqual(calls, 2, 'Drugie wywołanie w TTL powinno skorzystać z cache');
        assert.strictEqual(firstLive.length, MOCK_INVENTORY_PARAMETERS.length);
        assert.strictEqual(secondLive.length, MOCK_INVENTORY_PARAMETERS.length);
    } finally {
        baselinkerExportService.clearInventoryParametersCache();
        baselinkerExportService.callConnectorApi = origCallConnector;
    }
});
