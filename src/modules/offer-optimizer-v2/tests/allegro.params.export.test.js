const test = require('node:test');
const assert = require('node:assert');

const {
    MAX_SAFETY_TEXT_LEN,
    mapAllegroParameters,
    stripHtmlAndEmoticons,
    extractSafetyInformationText,
    extractCleanInciForAllegro,
    convertValueToParameterUnit,
    encodeParameterValue,
    buildAllegroParameterPatchPayload
} = require('../../../utils/allegro_mapper');

const { inspectTokenClaims } = require('../../offer-optimizer/allegro.service');

test('Allegro Params Export: czyszczenie ostrzeżeń, konwersja jednostek, INCI, RFC 7396 i bezpieczeństwo tokenu', async (t) => {
    await t.test('1. stripHtmlAndEmoticons & extractSafetyInformationText usuwają HTML, emotikony i podmiot UE bez utraty treści CLP/GPSR', () => {
        const htmlContent = {
            sekcja4: '<p>✍️ <b>Krok 1:</b> Nanieś piankę.</p><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie stosować na marmur i aluminium.</p>',
            sekcja6: '<h2>⚠️ Bezpieczeństwo i informacje GPSR</h2>' +
                '<p>Przechowywać w <b>chłodnym i suchym miejscu</b>, poza zasięgiem dzieci.</p>' +
                '<ul>' +
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H319 – Działa drażniąco na oczy.</li>' +
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 &amp; P305 – Chronić przed dziećmi.</li>' +
                '<li>⚠️ <b>Podmiot odpowiedzialny w UE:</b> Italchimica S.r.l., kontakt info@example.com</li>' +
                '</ul>'
        };

        const extracted = extractSafetyInformationText({ htmlContent });
        assert.strictEqual(extracted.source, 'offerDraft.sekcja6');
        assert.ok(!/<[^>]+>/.test(extracted.text), 'Nie może zawierać tagów HTML');
        assert.ok(!/[⚠️➡️✍️]/.test(extracted.text), 'Nie może zawierać emotikonów');
        assert.ok(!/Podmiot odpowiedzialny w UE/i.test(extracted.text), 'Powielona linia podmiotu UE powinna zostać odfiltrowana');
        assert.ok(!/info@example\.com/.test(extracted.text), 'Adres e-mail musi zostać usunięty');
        assert.ok(extracted.text.includes('H319 – Działa drażniąco na oczy.'));
        assert.ok(extracted.text.includes('P102 & P305 – Chronić przed dziećmi.'));
        assert.ok(extracted.text.includes('WYKLUCZENIE ZASTOSOWANIA: Nie stosować na marmur i aluminium.'));

        // Długi tekst przycina się bezpiecznie do 5000 znaków
        const hugeHtml = { sekcja6: `<p>${'Ostrzeżenie testowe nr 1.\n'.repeat(400)}</p>` };
        const truncRes = extractSafetyInformationText({ htmlContent: hugeHtml });
        assert.strictEqual(truncRes.truncated, true);
        assert.ok(truncRes.text.length <= MAX_SAFETY_TEXT_LEN);
    });

    await t.test('2. extractSafetyInformationText ma fallback do features["Ostrzeżenia"]', () => {
        const res = extractSafetyInformationText({
            htmlContent: { sekcja1: '<p>Opis</p>' },
            features: { 'Ostrzeżenia': '⚠️ Chronić przed dziećmi. Stosować rękawice ochronne.' }
        });
        assert.strictEqual(res.source, 'features.Ostrzeżenia');
        assert.strictEqual(res.text, 'Chronić przed dziećmi. Stosować rękawice ochronne.');
    });

    await t.test('3. extractCleanInciForAllegro oczyszcza przedrostki i odrzuca puste/nie-INCI placeholdery', () => {
        assert.strictEqual(extractCleanInciForAllegro({ features: { 'Skład': 'Koncentrat' } }), '');
        const clean = extractCleanInciForAllegro({
            features: { 'Skład/INCI': 'Skład INCI: Aqua, Sodium Laureth Sulfate, Parfum, Linalool' }
        });
        assert.ok(clean.startsWith('Aqua, Sodium Laureth Sulfate'));
        assert.ok(!/Skład INCI:/i.test(clean));
    });

    await t.test('4. Konwersja jednostek fizycznych pod schemat kategorii Allegro (ml <-> l, kg <-> g)', () => {
        const paramLitres = { id: '221905', name: 'Pojemność', type: 'float', unit: 'l', restrictions: { min: 0, max: 1000, precision: 3 } };
        const paramMl = { id: '206338', name: 'Pojemność', type: 'float', unit: 'ml', restrictions: { min: 0, max: 100000, precision: 2 } };
        const paramKg = { id: '17448', name: 'Waga produktu z opakowaniem jednostkowym', type: 'float', unit: 'kg', restrictions: { min: 0, max: 1000, precision: 3 } };

        assert.strictEqual(convertValueToParameterUnit('750 ml', paramLitres).value, '0.75');
        assert.strictEqual(convertValueToParameterUnit('1000 ml', paramLitres).value, '1');
        assert.strictEqual(convertValueToParameterUnit('0,9 l', paramMl).value, '900');
        assert.strictEqual(convertValueToParameterUnit('850 g', paramKg).value, '0.85');
        assert.ok(convertValueToParameterUnit('-5 ml', paramLitres).error, 'Wartość ujemna powinna zwrócić błąd walidacji');
    });

    await t.test('5. Kodowanie słowników (valuesIds), multi-select oraz ambiguousValueId ("Inna")', () => {
        const dictParam = {
            id: '248811',
            name: 'Marka',
            type: 'dictionary',
            options: { describesProduct: true, ambiguousValueId: '248811_999' },
            restrictions: { multipleChoices: false },
            dictionary: [
                { id: '248811_1', value: 'Dual Power' },
                { id: '248811_2', value: 'Cif' }
            ]
        };

        const exact = encodeParameterValue('dual power', dictParam);
        assert.deepStrictEqual(exact.encoded, { id: '248811', valuesIds: ['248811_1'] });

        const customBrand = encodeParameterValue('Moja Nowa Marka', dictParam);
        assert.deepStrictEqual(customBrand.encoded, {
            id: '248811',
            valuesIds: ['248811_999'],
            values: ['Moja Nowa Marka']
        });

        const multiParam = {
            id: '225822',
            name: 'Cechy dodatkowe',
            type: 'dictionary',
            options: { describesProduct: true },
            restrictions: { multipleChoices: true },
            dictionary: [
                { id: '225822_1', value: 'biodegradowalny' },
                { id: '225822_2', value: 'testowany dermatologicznie' }
            ]
        };
        const multiRes = encodeParameterValue('biodegradowalny, testowany dermatologicznie', multiParam);
        assert.deepStrictEqual(multiRes.encoded, { id: '225822', valuesIds: ['225822_1', '225822_2'] });
    });

    await t.test('6. RFC 7396 buildAllegroParameterPatchPayload zachowuje istniejące parametry, GPSR, chroni trustedContent i obsługuje safety/composition', () => {
        const categoryParameters = [
            { id: '11323', name: 'Stan', type: 'dictionary', required: true, options: { describesProduct: false }, dictionary: [{ id: '11323_1', value: 'Nowy' }] },
            { id: '229205', name: 'Stan opakowania', type: 'dictionary', required: false, options: { describesProduct: false }, dictionary: [{ id: '229205_1', value: 'oryginalne' }] },
            { id: '248811', name: 'Marka', type: 'dictionary', required: true, options: { describesProduct: true, isTrusted: true }, dictionary: [{ id: '248811_1', value: 'Mil Mil' }, { id: '248811_2', value: 'Inna Marka' }] },
            { id: '206338', name: 'Pojemność', type: 'float', unit: 'ml', required: false, options: { describesProduct: true }, restrictions: { min: 1, max: 100000, precision: 2 } },
            { id: '225693', name: 'EAN (GTIN)', type: 'string', required: true, options: { describesProduct: true } }
        ];

        const existingOffer = {
            id: '1900000001',
            parameters: [
                { id: '11323', valuesIds: ['11323_1'], values: ['Nowy'] },
                { id: '229205', valuesIds: ['229205_1'], values: ['oryginalne'] }
            ],
            productSet: [
                {
                    quantity: { value: 1 },
                    responsibleProducer: { id: 'resp-prod-1' },
                    marketedBeforeGPSRObligation: false,
                    safetyInformation: { type: 'TEXT', description: 'bezpieczny' },
                    composition: { mode: 'MANUAL', components: [{ name: 'Stary', ingredients: [{ name: 'Aqua' }] }] },
                    product: {
                        id: 'prod-uuid-1',
                        parameters: [
                            { id: '248811', valuesIds: ['248811_1'], values: ['Mil Mil'] },
                            { id: '225693', values: ['8004120909566'] }
                        ]
                    }
                }
            ]
        };

        const catalogProduct = {
            id: 'prod-uuid-1',
            trustedContent: { paths: ['parameters.248811'], productPaths: [] }
        };

        const built = buildAllegroParameterPatchPayload({
            product: { ean: '8004120909566', sku: 'SKU-NIE-MPN', name: 'Mil Mil Szampon' },
            features: {
                Marka: 'Inna Marka', // Próba nadpisania pola z trustedContent -> powinna zostać zablokowana
                Pojemność: '0,5 l'   // Konwersja na 500 ml
            },
            categoryParameters,
            existingOffer,
            catalogProduct,
            safetyInfoPayload: { apply: true, description: 'Chronić przed dziećmi.\nUnikać kontaktu z oczami.' },
            compositionPayload: { apply: true, components: [{ name: 'Szampon', ingredients: [{ name: 'Aqua' }, { name: 'Glycerin' }] }] }
        });

        assert.strictEqual(built.errors.length, 0);
        assert.strictEqual(built.hasChanges, true);
        // Parametry ofertowe bez zmian -> nie wysyłamy korzenia parameters
        assert.strictEqual(built.patchBody.parameters, undefined);
        // ProductSet musi zachować istniejący responsibleProducer, EAN, Markę z oferty i dodać Pojemność 500
        const ps0 = built.patchBody.productSet[0];
        assert.deepStrictEqual(ps0.responsibleProducer, { id: 'resp-prod-1' });
        assert.strictEqual(ps0.marketedBeforeGPSRObligation, false);
        assert.strictEqual(ps0.product.id, 'prod-uuid-1');

        const brandAfter = ps0.product.parameters.find(p => p.id === '248811');
        assert.deepStrictEqual(brandAfter.valuesIds, ['248811_1'], 'Zaufana Marka z oferty nie może zostać nadpisana');
        const capAfter = ps0.product.parameters.find(p => p.id === '206338');
        assert.deepStrictEqual(capAfter.values, ['500']);
        assert.deepStrictEqual(ps0.safetyInformation, {
            type: 'TEXT',
            description: 'Chronić przed dziećmi.\nUnikać kontaktu z oczami.'
        });
        assert.deepStrictEqual(ps0.composition, {
            components: [{ name: 'Szampon', ingredients: [{ name: 'Aqua' }, { name: 'Glycerin' }] }]
        });
        assert.strictEqual(built.changesSummary.blockedTrustedCount, 1);
    });

    await t.test('7. Zmiana wyłącznie parametru ofertowego (describesProduct: false) pomija productSet w PATCH', () => {
        const categoryParameters = [
            { id: '229205', name: 'Stan opakowania', type: 'dictionary', options: { describesProduct: false }, dictionary: [{ id: '229205_1', value: 'oryginalne' }, { id: '229205_2', value: 'zastępcze' }] }
        ];
        const existingOffer = {
            id: '1900000002',
            parameters: [{ id: '11323', valuesIds: ['11323_1'] }],
            productSet: [{ quantity: { value: 1 }, product: { id: 'uuid-x', parameters: [] } }]
        };
        const built = buildAllegroParameterPatchPayload({
            product: { ean: '1234567890123' },
            features: { 'Stan opakowania': 'oryginalne' },
            categoryParameters,
            existingOffer
        });
        assert.strictEqual(built.patchBody.productSet, undefined, 'Nie wolno wysyłać productSet przy zmianie tylko parametrów ofertowych');
        assert.strictEqual(built.patchBody.parameters.length, 2, 'Istniejący parametr 11323 musi zostać zachowany');
    });

    await t.test('8. Kompatybilność wsteczna mapAllegroParameters i inspekcja roszczeń JWT tokena', () => {
        const legacyRes = mapAllegroParameters({ Marka: 'cif' }, [{ name: 'Marka', type: 'dictionary', dictionary: [{ id: '1', value: 'Cif' }] }]);
        assert.strictEqual(legacyRes.Marka, 'Cif');

        const makeJwt = (payload) => {
            const h = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
            const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
            return `${h}.${p}.sig`;
        };
        const userClaims = inspectTokenClaims(makeJwt({
            user_name: '12345',
            scope: ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'],
            exp: Math.floor(Date.now() / 1000) + 3600
        }));
        assert.strictEqual(userClaims.isUserToken, true);
        assert.ok(userClaims.scopes.includes('allegro:api:sale:offers:write'));

        const appOnlyClaims = inspectTokenClaims(makeJwt({ scope: ['allegro:api:sale:offers:read'] }));
        assert.strictEqual(appOnlyClaims.isUserToken, false);
    });
});

