const test = require('node:test');
const assert = require('node:assert');
const baselinkerExportService = require('../baselinker.export.service');
const AllegroService = require('../../offer-optimizer/allegro.service');

test('BaseLinker Export Service - buildPayload pomija sekcja6 GPSR z description_extra4, wycina surową stopkę Skład INCI z sekcja3 i eksportuje 6 modułów', async () => {
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
});

test('BaseLinker Export Service - korekty parametrów PIM/Allegro mają pierwszeństwo przed hardFeatures, respektują usunięcia i filtrują obrazy base64', async () => {
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
    }
});
