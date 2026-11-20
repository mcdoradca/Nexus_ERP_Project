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
    buildAllegroParameterPatchPayload,
    hasCompositionInPatchBody,
    stripCompositionFromPatchBody
} = require('../../../utils/allegro_mapper');

const {
    inspectTokenClaims,
    evaluateParsedIngredientsResponse,
    isAllegroCompositionCategoryError,
    isAllegroCompositionValidationError,
    getCategoryCompositionSupport,
    markCategoryCompositionUnsupported,
    clearCategoryCompositionUnsupported
} = require('../../offer-optimizer/allegro.service');

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

    await t.test('3. extractCleanInciForAllegro priorytetyzuje edytowany Skład/INCI z PIM przed starym draftem, oczyszcza przedrostki i odrzuca puste/nie-INCI placeholdery', () => {
        assert.strictEqual(extractCleanInciForAllegro({ features: { 'Skład': 'Koncentrat' } }), '');
        const clean = extractCleanInciForAllegro({
            features: { 'Skład/INCI': 'Skład INCI: Aqua, Sodium Laureth Sulfate, Parfum, Linalool' },
            ingredientsInci: 'Stary Skład, Glycerin'
        });
        assert.ok(clean.startsWith('Aqua, Sodium Laureth Sulfate'), 'Musi priorytetyzować aktualne features["Skład/INCI"] nad przestarzałym ingredientsInci');
        assert.ok(!/Skład INCI:/i.test(clean));

        // Placeholder 'Koncentrat' w 'Skład' nie powinien blokować poprawnego fallbacku ingredientsInci
        const fallbackRes = extractCleanInciForAllegro({
            features: { 'Skład': 'Koncentrat' },
            ingredientsInci: 'Aqua, Glycerin'
        });
        assert.strictEqual(fallbackRes, 'Aqua, Glycerin');

        // Tekstowy parametr kategorii 'Skład INCI' jest zasilany czystym INCI z Karty Technicznej PIM
        const schemaWithInciParam = [
            { id: '999001', name: 'Skład INCI', type: 'string', options: { describesProduct: true } }
        ];
        const built = buildAllegroParameterPatchPayload({
            product: { ean: '8054633830741' },
            features: { 'Skład/INCI': 'Skład INCI: AQUA, GLYCERIN, PARFUM' },
            categoryParameters: schemaWithInciParam,
            existingOffer: {
                id: '19112062838',
                productSet: [{ quantity: { value: 1 }, product: { id: 'prod-1', parameters: [] } }]
            }
        });
        const inciParam = built.patchBody.productSet[0].product.parameters.find(p => p.id === '999001');
        assert.deepStrictEqual(inciParam, { id: '999001', values: ['AQUA, GLYCERIN, PARFUM'] });
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

    await t.test('9. Eksport productSet (parametry/INCI/GPSR) zachowuje własny opis, zdjęcia i aiCoCreatedContent oferty oraz ustawia product.images: []', () => {
        const categoryParameters = [
            { id: '206338', name: 'Pojemność', type: 'float', unit: 'ml', options: { describesProduct: true } }
        ];
        const existingOffer = {
            id: '1900000009',
            images: [
                'https://a.allegroimg.com/original/11aaaa/custom-1.jpg',
                'https://a.allegroimg.com/original/11bbbb/custom-2.jpg',
                'https://a.allegroimg.com/original/11aaaa/custom-1.jpg'
            ],
            aiCoCreatedContent: {
                images: [
                    { url: 'https://a.allegroimg.com/original/11bbbb/custom-2.jpg' },
                    { url: 'https://a.allegroimg.com/original/11cccc/stale-non-offer.jpg' }
                ]
            },
            description: {
                sections: [
                    { items: [{ type: 'TEXT', content: '<p>Mój opis z BaseLinkera</p>' }] },
                    { items: [{ type: 'IMAGE', url: 'https://a.allegroimg.com/original/11aaaa/custom-1.jpg' }] }
                ]
            },
            productSet: [
                {
                    quantity: { value: 1 },
                    product: { id: 'prod-uuid-guard', parameters: [] }
                }
            ]
        };

        const built = buildAllegroParameterPatchPayload({
            product: { ean: '8004120910364' },
            features: { Pojemność: '750 ml' },
            categoryParameters,
            existingOffer,
            catalogProduct: { id: 'prod-uuid-guard', trustedContent: { paths: [], productPaths: [] } },
            safetyInfoPayload: { apply: true, description: 'Chronić przed dziećmi.' },
            compositionPayload: { apply: true, components: [{ name: 'Płyn', ingredients: [{ name: 'Aqua' }] }] }
        });

        assert.strictEqual(built.errors.length, 0);
        assert.strictEqual(built.hasChanges, true);
        assert.deepStrictEqual(built.patchBody.productSet[0].product.images, [], 'Musi blokować zdjęcia z katalogu Allegro przez product.images = []');
        assert.deepStrictEqual(built.patchBody.images, [
            'https://a.allegroimg.com/original/11aaaa/custom-1.jpg',
            'https://a.allegroimg.com/original/11bbbb/custom-2.jpg'
        ], 'Musi zachować unikalne zdjęcia oferty w oryginalnej kolejności');
        assert.deepStrictEqual(built.patchBody.description, existingOffer.description, 'Musi zachować oryginalny opis oferty');
        assert.notStrictEqual(built.patchBody.description, existingOffer.description, 'Kopia opisu nie powinna dzielić referencji z wejściem');
        assert.deepStrictEqual(built.patchBody.aiCoCreatedContent, {
            images: [{ url: 'https://a.allegroimg.com/original/11bbbb/custom-2.jpg' }]
        }, 'Musi zachować wyłącznie istniejące deklaracje AI obrazów');
        assert.deepStrictEqual(built.preservedOfferFields, {
            active: true,
            productSetPatched: true,
            imagesPreservedCount: 2,
            suppressCatalogProductImages: true,
            imagesTrustedLocked: false,
            descriptionSectionsPreserved: 2,
            descriptionTrustedLocked: false,
            aiCoCreatedImagesPreserved: 1
        });
    });

    await t.test('10. Trusted Content dla images/description wyłącza product.images: [] i własne nadpisania, ale nadal aktualizuje bezpieczne parametry', () => {
        const categoryParameters = [
            { id: '206338', name: 'Pojemność', type: 'float', unit: 'ml', options: { describesProduct: true } }
        ];
        const existingOffer = {
            id: '1900000010',
            images: ['https://a.allegroimg.com/original/11aaaa/offer-1.jpg'],
            description: { sections: [{ items: [{ type: 'TEXT', content: '<p>Opis</p>' }] }] },
            productSet: [{ quantity: { value: 1 }, product: { id: 'prod-trusted', parameters: [] } }]
        };
        const built = buildAllegroParameterPatchPayload({
            product: { ean: '8004120910364' },
            features: { Pojemność: '500 ml' },
            categoryParameters,
            existingOffer,
            catalogProduct: { id: 'prod-trusted', trustedContent: { paths: ['images', 'description'], productPaths: [] } }
        });

        assert.strictEqual(built.errors.length, 0);
        assert.strictEqual(built.patchBody.images, undefined);
        assert.strictEqual(built.patchBody.description, undefined);
        assert.strictEqual(built.patchBody.productSet[0].product.images, undefined);
        assert.strictEqual(built.preservedOfferFields.imagesTrustedLocked, true);
        assert.strictEqual(built.preservedOfferFields.descriptionTrustedLocked, true);
        assert.ok(built.warnings.some(w => w.includes('Trusted Content')));
    });

    await t.test('11. Brak product.images: [] przy pustej galerii oraz brak nadmiarowych pól przy samych parametrach ofertowych lub braku zmian', () => {
        const offerOnlySchema = [
            { id: '229205', name: 'Stan opakowania', type: 'dictionary', options: { describesProduct: false }, dictionary: [{ id: '229205_1', value: 'oryginalne' }] }
        ];
        const offerWithRichContent = {
            id: '1900000011',
            parameters: [],
            images: ['https://a.allegroimg.com/original/11aaaa/rich.jpg'],
            description: { sections: [{ items: [{ type: 'TEXT', content: '<p>Bogaty opis</p>' }] }] },
            productSet: [{ quantity: { value: 1 }, product: { id: 'prod-rich', parameters: [] } }]
        };

        // Scenariusz A: zmiana tylko parametru ofertowego -> bez productSet, bez opisu, bez zdjęć
        const offerOnlyPatch = buildAllegroParameterPatchPayload({
            product: { ean: '8004120910364' },
            features: { 'Stan opakowania': 'oryginalne' },
            categoryParameters: offerOnlySchema,
            existingOffer: offerWithRichContent
        });
        assert.strictEqual(offerOnlyPatch.hasChanges, true);
        assert.strictEqual(offerOnlyPatch.patchBody.productSet, undefined);
        assert.strictEqual(offerOnlyPatch.patchBody.description, undefined);
        assert.strictEqual(offerOnlyPatch.patchBody.images, undefined);
        assert.strictEqual(offerOnlyPatch.preservedOfferFields.active, false);

        // Scenariusz B: brak jakichkolwiek zmian -> pusty patchBody nawet przy bogatej ofercie
        const noChangesPatch = buildAllegroParameterPatchPayload({
            product: { ean: '8004120910364' },
            features: {},
            categoryParameters: offerOnlySchema,
            existingOffer: offerWithRichContent
        });
        assert.strictEqual(noChangesPatch.hasChanges, false);
        assert.deepStrictEqual(noChangesPatch.patchBody, {});

        // Scenariusz C: oferta ma pustą galerię images: [] i aktualizujemy GPSR -> NIE wysyła product.images: []
        const emptyGalleryOffer = {
            id: '1900000012',
            images: [],
            description: { sections: [{ items: [{ type: 'TEXT', content: '<p>Opis</p>' }] }] },
            productSet: [{ quantity: { value: 1 }, product: { id: 'prod-empty-img', parameters: [] } }]
        };
        const emptyGalleryPatch = buildAllegroParameterPatchPayload({
            product: { ean: '8004120910364' },
            features: {},
            categoryParameters: [],
            existingOffer: emptyGalleryOffer,
            safetyInfoPayload: { apply: true, description: 'Ostrzeżenie.' }
        });
        assert.strictEqual(emptyGalleryPatch.patchBody.images, undefined);
        assert.strictEqual(emptyGalleryPatch.patchBody.productSet[0].product.images, undefined);
        assert.deepStrictEqual(emptyGalleryPatch.patchBody.description, emptyGalleryOffer.description);
        assert.strictEqual(emptyGalleryPatch.preservedOfferFields.suppressCatalogProductImages, false);
    });

    await t.test('12. stripCompositionFromPatchBody zdejmuje productSet[0].composition po 422, zachowując inne zmiany parametrów i GPSR', () => {
        const categoryParameters = [
            { id: '207570', name: 'Pojemność', type: 'float', unit: 'ml', options: { describesProduct: true } },
            { id: '229205', name: 'Stan opakowania', type: 'dictionary', options: { describesProduct: false }, dictionary: [{ id: '229205_1', value: 'oryginalne' }] }
        ];
        const existingOffer = {
            id: '19112067504',
            parameters: [],
            images: ['https://a.allegroimg.com/original/11aaaa/soap-1.jpg'],
            description: { sections: [{ items: [{ type: 'TEXT', content: '<p>Opis mydła</p>' }] }] },
            productSet: [{
                quantity: { value: 1 },
                composition: null,
                product: { id: 'prod-253350', parameters: [] }
            }]
        };

        // Scenariusz A: Zmiana składu + zmiana Pojemności (produkt) + zmiana Stanu opakowania (oferta) + GPSR -> zostają parametry, GPSR i ochrona zdjęć/opisu
        const mixedBuilt = buildAllegroParameterPatchPayload({
            product: { ean: '8032680390036' },
            features: { Pojemność: '1000 ml', 'Stan opakowania': 'oryginalne' },
            categoryParameters,
            existingOffer,
            safetyInfoPayload: { apply: true, description: 'Chronić przed dziećmi.' },
            compositionPayload: { apply: true, components: [{ name: 'Mydło', ingredients: [{ name: 'AQUA' }] }] }
        });
        assert.strictEqual(hasCompositionInPatchBody(mixedBuilt.patchBody), true);

        const mixedStripped = stripCompositionFromPatchBody(mixedBuilt.patchBody, existingOffer);
        assert.strictEqual(mixedStripped.hadComposition, true);
        assert.strictEqual(mixedStripped.hasRemainingChanges, true);
        assert.strictEqual(mixedStripped.droppedEmptyProductSet, false);
        assert.strictEqual(mixedStripped.patchBody.productSet[0].composition, undefined);
        assert.strictEqual(mixedStripped.patchBody.productSet[0].safetyInformation.description, 'Chronić przed dziećmi.');
        assert.ok(Array.isArray(mixedStripped.patchBody.parameters) && mixedStripped.patchBody.parameters.length === 1);
        assert.ok(Array.isArray(mixedStripped.patchBody.images));

        // Scenariusz B: Skład + zmiana tylko parametru ofertowego (productSet bez innych różnic) -> zdejmuje cały productSet oraz zbędne pola ochronne
        const offerPlusCompBuilt = buildAllegroParameterPatchPayload({
            product: { ean: '8032680390036' },
            features: { 'Stan opakowania': 'oryginalne' },
            categoryParameters,
            existingOffer,
            compositionPayload: { apply: true, components: [{ name: 'Mydło', ingredients: [{ name: 'AQUA' }] }] }
        });
        const offerStripped = stripCompositionFromPatchBody(offerPlusCompBuilt.patchBody, existingOffer);
        assert.strictEqual(offerStripped.hadComposition, true);
        assert.strictEqual(offerStripped.hasRemainingChanges, true);
        assert.strictEqual(offerStripped.droppedEmptyProductSet, true);
        assert.strictEqual(offerStripped.patchBody.productSet, undefined);
        assert.strictEqual(offerStripped.patchBody.images, undefined);
        assert.strictEqual(offerStripped.patchBody.description, undefined);
        assert.strictEqual(offerStripped.patchBody.parameters.length, 1);

        // Scenariusz C: Jedyną zmianą w całym PATCH było composition -> hasRemainingChanges === false
        const compOnlyBuilt = buildAllegroParameterPatchPayload({
            product: { ean: '8032680390036' },
            features: {},
            categoryParameters,
            existingOffer,
            compositionPayload: { apply: true, components: [{ name: 'Mydło', ingredients: [{ name: 'AQUA' }] }] }
        });
        const compOnlyStripped = stripCompositionFromPatchBody(compOnlyBuilt.patchBody, existingOffer);
        assert.strictEqual(compOnlyStripped.hadComposition, true);
        assert.strictEqual(compOnlyStripped.droppedEmptyProductSet, true);
        assert.strictEqual(compOnlyStripped.hasRemainingChanges, false);
        assert.deepStrictEqual(compOnlyStripped.patchBody, {});
    });

    await t.test('13. isAllegroCompositionCategoryError & 24h TTL cache kategorii nieobsługujących composition', async () => {
        const plErr = new Error('Allegro API PATCH error (422): Nie można podać składników dla kategorii produktu (0) [productSet]');
        plErr.statusCode = 422;
        plErr.allegroErrors = [{ userMessage: 'Nie można podać składników dla kategorii produktu (0)', path: 'productSet' }];
        assert.strictEqual(isAllegroCompositionCategoryError(plErr), true);

        const enErr = new Error('Allegro API PATCH error (422): Ingredients cannot be specified for product category (0) [productSet]');
        enErr.statusCode = 422;
        assert.strictEqual(isAllegroCompositionCategoryError(enErr), true);

        const unrelatedErr = new Error('Allegro API PATCH error (422): Niepoprawna wartość parametru Kod taryfy celnej');
        unrelatedErr.statusCode = 422;
        assert.strictEqual(isAllegroCompositionCategoryError(unrelatedErr), false);

        const store = new Map();
        const mockPrisma = {
            systemSetting: {
                async findUnique({ where }) {
                    return store.get(where.key) || null;
                },
                async upsert({ where, update, create }) {
                    const rec = store.has(where.key) ? { key: where.key, ...update } : { key: where.key, ...create };
                    store.set(where.key, rec);
                    return rec;
                }
            }
        };

        const testCatId = '253350-test-ttl';
        const baseNow = 1700000000000;
        await clearCategoryCompositionUnsupported(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow });
        assert.strictEqual((await getCategoryCompositionSupport(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow })).supported, true);

        await markCategoryCompositionUnsupported(testCatId, plErr.message, {
            injectedPrisma: mockPrisma,
            nowMs: baseNow,
            ttlMs: 60_000
        });

        // Z pamięci i po pominięciu pamięci (z mockPrisma DB) przed upływem TTL
        const activeMem = await getCategoryCompositionSupport(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow + 10_000 });
        assert.strictEqual(activeMem.supported, false);
        const activeDb = await getCategoryCompositionSupport(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow + 10_000, skipMemoryCache: true });
        assert.strictEqual(activeDb.supported, false);

        // Po wygaśnięciu TTL automatycznie wraca możliwość ponownej próby
        const expired = await getCategoryCompositionSupport(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow + 61_000 });
        assert.strictEqual(expired.supported, true);

        await clearCategoryCompositionUnsupported(testCatId, { injectedPrisma: mockPrisma, nowMs: baseNow });
    });

    await t.test('14. Regresja ADR-0189 (#19111680577): evaluateParsedIngredientsResponse agreguje items[].warnings/errors i odrzuca składy detergentowe WE 648/2004, zachowując kosmetyczne INCI', () => {
        // Scenariusz A: Dokładna odpowiedź z Allegro dla Dual Power Tabletki Wybielające (kat. 253359)
        const detergentRes = evaluateParsedIngredientsResponse({
            rawInci: '≥30% Chlorine-based bleaching agents. Contains: Troclosene sodium, dihydrate.',
            productName: 'DUAL POWER TABLETKI WYBIELAJĄCE 40 SZT',
            parsedProd: {
                items: [{
                    name: '≥30% Chlorine-based bleaching agents. Contains',
                    ingredients: [{ name: 'Troclosene sodium' }, { name: 'dihydrate' }],
                    warnings: [
                        { code: 'UNKNOWN_INGREDIENT', message: 'Nie rozpoznaliśmy składu produktu.', context: 'Troclosene sodium' },
                        { code: 'UNKNOWN_INGREDIENT', message: 'Nie rozpoznaliśmy składu produktu.', context: 'dihydrate' }
                    ]
                }]
            }
        });
        assert.strictEqual(detergentRes.supported, false);
        assert.strictEqual(detergentRes.warnings.length, 2);
        assert.strictEqual(detergentRes.recognizedIngredients, 0);
        assert.ok(detergentRes.unsupportedReason && detergentRes.unsupportedReason.includes('WE 648/2004'));

        // Scenariusz B: Błąd składni w items[].errors (INVALID_INGREDIENT_CHARACTERS)
        const errRes = evaluateParsedIngredientsResponse({
            rawInci: '≥30% związki wybielające na bazie chloru, Troclosene sodium',
            parsedProd: {
                items: [{
                    ingredients: [{ name: '≥30% związki wybielające na bazie chloru' }],
                    errors: [{ code: 'INVALID_INGREDIENT_CHARACTERS', message: 'Skład zawiera niedozwolone słowa lub znaki.' }]
                }]
            }
        });
        assert.strictEqual(errRes.supported, false);
        assert.strictEqual(errRes.errors.length, 1);

        // Scenariusz C: Prawdziwy kosmetyk INCI (14/16 rozpoznanych, 2 pojedyncze ostrzeżenia) pozostaje supported: true
        const cosmeticRes = evaluateParsedIngredientsResponse({
            rawInci: 'AQUA, GLYCERIN, PARFUM, CI 42051',
            productName: 'Dermomed Mydło',
            parsedProd: {
                items: [{
                    ingredients: [
                        { name: 'AQUA' }, { name: 'GLYCERIN' }, { name: 'PARFUM' }, { name: 'CI 42051' }
                    ],
                    warnings: [
                        { code: 'UNKNOWN_INGREDIENT', context: 'CI 42051' }
                    ]
                }]
            }
        });
        assert.strictEqual(cosmeticRes.supported, true);
        assert.strictEqual(cosmeticRes.recognizedIngredients, 3);

        // Scenariusz D: extractCleanInciForAllegro usuwa dopiski synonimowe w nawiasach kwadratowych [WATER]/[YELLOW 5] bez tłumaczenia INCI
        const cleanedCosmetic = extractCleanInciForAllegro({
            features: { 'Skład/INCI': 'AQUA [WATER], BUTYROSPERMUM PARKII (SHEA) BUTTER, CI 19140 [YELLOW 5], PARFUM' }
        });
        assert.strictEqual(cleanedCosmetic, 'AQUA, BUTYROSPERMUM PARKII (SHEA) BUTTER, CI 19140, PARFUM');
    });

    await t.test('15. isAllegroCompositionValidationError wykrywa błąd 422 języka wyłącznie dla ścieżki offer.modules.composition', () => {
        const langErr = new Error('Allegro API PATCH error (422): Użyj języka odpowiedniego dla rynku, na którym wystawiasz ofertę. [offer.modules.composition.data.products[0].items[0].ingredients]');
        langErr.statusCode = 422;
        langErr.allegroErrors = [{
            code: 'VALIDATION_ERROR',
            path: 'offer.modules.composition.data.products[0].items[0].ingredients',
            userMessage: 'Użyj języka odpowiedniego dla rynku, na którym wystawiasz ofertę.'
        }];
        assert.strictEqual(isAllegroCompositionCategoryError(langErr), false, 'Błąd językowy składu nie może oznaczać całej kategorii jako nieobsługującej composition');
        assert.strictEqual(isAllegroCompositionValidationError(langErr), true);

        // Mieszane błędy (composition + inny parametr) NIE mogą zostać zamaskowane jako błąd samego composition
        const mixedErr = new Error('Mixed 422');
        mixedErr.statusCode = 422;
        mixedErr.allegroErrors = [
            { path: 'offer.modules.composition.data.products[0].items[0].ingredients', userMessage: 'Błąd języka' },
            { path: 'parameters[0]', userMessage: 'Brak wymaganego parametru' }
        ];
        assert.strictEqual(isAllegroCompositionValidationError(mixedErr), false);
    });
});

