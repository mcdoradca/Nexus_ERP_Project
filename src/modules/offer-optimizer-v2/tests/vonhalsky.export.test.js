const test = require('node:test');
const assert = require('node:assert/strict');

// Zapewniamy stabilny klucz szyfrowania dla secretVault w izolowanym środowisku testowym
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    process.env.JWT_SECRET = 'test_vonhalsky_vault_secret_key_2026_enterprise';
}

const {
    validateEanChecksum,
    normalizePhoneNumber,
    buildVonHalskyDimensions,
    buildVonHalskyDescription,
    collectVonHalskyImages,
    convertValueToVonHalskyUnit,
    mapVonHalskyAttributes,
    buildVonHalskyGpsr,
    buildVonHalskyOfferPayload
} = require('../../../utils/vonhalsky_mapper');

const VonHalskyService = require('../../offer-optimizer/vonhalsky.service');
const { createVonHalskyController } = require('../../offer-optimizer/vonhalsky.controller');

const CAT_UUID = '151d3d67-1712-4759-96cd-d613edabd392';
const ORG_UUID = '0cd818aa-bd74-4094-bc91-14c520cfed62';
const OFFER_UUID = '4dc669aa-6de6-46ab-8d72-c3fe2a0f0710';
const CMD_UUID = '9a9a9a9a-1234-4567-89ab-cdef01234567';

function createMockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return res;
}

test('VonHalsky Mapper: validateEanChecksum i normalizePhoneNumber', () => {
    const ok13 = validateEanChecksum('5904959447006');
    assert.equal(ok13.valid, true);
    assert.equal(ok13.normalized, '5904959447006');
    assert.equal(ok13.warning, null);

    const badCheck = validateEanChecksum('5904959447005');
    assert.equal(badCheck.valid, false);
    assert.match(badCheck.warning, /cyfrę kontrolną/i);

    const badChars = validateEanChecksum('590495944700A');
    assert.equal(badChars.valid, false);

    assert.equal(normalizePhoneNumber('+48 500-600-700').value, '+48500600700');
    assert.equal(normalizePhoneNumber('0048 12 345 67 89').value, '+48123456789');
    assert.equal(normalizePhoneNumber('500600700').value, null);
    assert.ok(normalizePhoneNumber('500600700').warning);
});

test('VonHalsky Mapper: buildVonHalskyDimensions przelicza cm->mm i kg->g oraz waliduje limity', () => {
    const res = buildVonHalskyDimensions({
        weightKg: '1,25',
        widthCm: '12,5',
        heightCm: '24',
        lengthCm: '8'
    });
    assert.deepEqual(res.dimension, {
        width: 125,
        height: 240,
        length: 80,
        weight: 1250
    });
    assert.equal(res.warnings.length, 0);

    const empty = buildVonHalskyDimensions({ weightKg: 0, widthCm: -5 });
    assert.equal(empty.dimension, undefined);
});

test('VonHalsky Mapper: buildVonHalskyDescription wyklucza Sekcję 6 GPSR i wspiera tryb html oraz plain', () => {
    const htmlContent = {
        sekcja1: '<h2>Zalety produktu</h2><p>Gęsty <b>żel</b> pod prysznic.</p><script>alert(1)</script>',
        sekcja3: '<h2>Składniki</h2><p>Delikatna baza myjąca.</p><p><strong>Skład (INCI):</strong> Aqua, Sodium Laureth Sulfate.</p>',
        sekcja6: '<h2>Bezpieczeństwo GPSR</h2><p>⚠️ Chronić przed dziećmi.</p>'
    };

    const htmlRes = buildVonHalskyDescription({ htmlContent, format: 'html' });
    assert.equal(htmlRes.format, 'html');
    assert.match(htmlRes.description, /<h2>Zalety produktu<\/h2>/);
    assert.doesNotMatch(htmlRes.description, /<script>/i);
    assert.doesNotMatch(htmlRes.description, /Chronić przed dziećmi/i);
    assert.doesNotMatch(htmlRes.description, /Sodium Laureth Sulfate/i);

    const plainRes = buildVonHalskyDescription({ htmlContent, format: 'plain' });
    assert.equal(plainRes.format, 'plain');
    assert.doesNotMatch(plainRes.description, /<h2>|<p>|<b>/i);
    assert.match(plainRes.description, /Zalety produktu/);
    assert.doesNotMatch(plainRes.description, /Chronić przed dziećmi/i);
});

test('VonHalsky Mapper: collectVonHalskyImages rozdziela HTTPS URL i binarne załączniki z zachowaniem priorytetów', () => {
    const res = collectVonHalskyImages({
        draftImages: [
            { replacedUrl: 'https://cdn.example.com/photos/packshot_01.jpg' },
            { replacedUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
            { originalUrl: 'http://legacy.example.com/old.png' },
            { originalUrl: 'Wymagane nowe zdjęcie (nr 4)' },
            { originalUrl: 'https://upload.cdn.baselinker.com/blocked.jpg' }
        ]
    });

    assert.equal(res.totalCount, 3);
    assert.equal(res.httpsImages.length, 1);
    assert.deepEqual(res.httpsImages[0], {
        fileName: 'packshot_01.jpg',
        fileUrl: 'https://cdn.example.com/photos/packshot_01.jpg',
        priority: 1
    });

    assert.equal(res.binaryAttachments.length, 2);
    assert.equal(res.binaryAttachments[0].priority, 2);
    assert.equal(res.binaryAttachments[0].fileName, 'product_image_02.jpg');
    assert.equal(res.binaryAttachments[1].priority, 3);
});

test('VonHalsky Mapper: mapVonHalskyAttributes obsługuje słowniki, konwersję jednostek i atrybuty wymagane', () => {
    assert.equal(convertValueToVonHalskyUnit('1,5 kg', { code: 'GRAM', symbol: 'g' }), 1500);
    assert.equal(convertValueToVonHalskyUnit('1000 ml', { code: 'LITER', symbol: 'l' }), 1);

    const defs = [
        {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Zapach',
            type: 'DICTIONARY',
            expectedValue: 'ONE',
            dictionary: {
                id: 'd1',
                name: 'Zapachy',
                options: [
                    { id: 'o1', value: 'Talk i Irys', active: true },
                    { id: 'o2', value: 'Stary nieaktywny', active: false }
                ]
            }
        },
        {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Pojemność',
            type: 'NUMERIC',
            expectedValue: 'ONE',
            unitOfMeasureDetails: { code: 'MILLILITER', symbol: 'ml', group: 'VOLUME', translation: 'Mililitr' }
        },
        {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Kraj pochodzenia',
            type: 'TEXT_VALUE',
            expectedValue: 'ONE'
        }
    ];

    const res = mapVonHalskyAttributes({
        attributeDefinitions: defs,
        productFeatures: {
            'Zapach': 'talk i irys',
            'Pojemność': '1 l'
        }
    });

    assert.equal(res.attributes.length, 2);
    assert.deepEqual(res.attributes[0], {
        id: '11111111-1111-4111-8111-111111111111',
        values: ['Talk i Irys']
    });
    assert.deepEqual(res.attributes[1], {
        id: '22222222-2222-4222-8222-222222222222',
        values: ['1000']
    });
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /Kraj pochodzenia/);
});

test('VonHalsky Mapper: buildVonHalskyGpsr używa rejestru marek, responsiblePersonDetails i pilnuje manufacturer.email', () => {
    // Brak email producenta w kategorii wymagającej GPSR -> błąd blokujący
    const missingEmail = buildVonHalskyGpsr({
        categoryRequiresGpsr: true,
        product: { name: 'Felce Azzurra Żel pod prysznic 650 ml', brand: { name: 'Felce Azzurra' } },
        htmlContent: { sekcja6: '<h2>Bezpieczeństwo</h2><p>⚠️ Unikać kontaktu z oczami.</p>' }
    });
    assert.equal(missingEmail.resolvedPreview.registryMatched, true);
    assert.match(missingEmail.resolvedPreview.manufacturer.name, /Paglieri/i);
    assert.equal(missingEmail.resolvedPreview.manufacturer.countryCode, 'IT');
    assert.ok(missingEmail.errors.some(e => e.includes('gpsr.manufacturer.email')));
    assert.doesNotMatch(missingEmail.gpsr.safetyInformation, /⚠️/);

    // Z uzupełnionym emailem i responsiblePersonDetails -> poprawny obiekt bez deprecated responsiblePerson
    const complete = buildVonHalskyGpsr({
        categoryRequiresGpsr: true,
        product: { name: 'Felce Azzurra Żel 650 ml', brand: { name: 'Felce Azzurra' } },
        defaultConfig: { defaultManufacturerEmail: 'compliance@paglieri.it' },
        gpsrOverride: {
            manufacturer: {
                responsiblePersonDetails: {
                    name: 'NES Compliance Sp. z o.o.',
                    email: 'gpsr@n-e-s.pl',
                    countryCode: 'PL',
                    unstructuredAddress: 'ul. Testowa 1, 00-001 Warszawa, PL'
                }
            }
        }
    });
    assert.equal(complete.errors.length, 0);
    assert.equal(complete.gpsr.manufacturer.email, 'compliance@paglieri.it');
    assert.equal(complete.gpsr.manufacturer.responsiblePerson, undefined);
    assert.equal(complete.gpsr.manufacturer.responsiblePersonDetails.name, 'NES Compliance Sp. z o.o.');
});

test('VonHalsky Mapper: buildVonHalskyOfferPayload chroni pola unmodifiable w trybie PATCH i odrzuca kategorię nie-liść w POST', () => {
    const product = {
        id: 'prod-1',
        ean: '5904959447006',
        sku: 'SKU-100',
        name: 'Felce Azzurra Mydło w płynie 1000 ml',
        salePrice: 19.99,
        taxRate: 23,
        stock: 15,
        weight: 1.1,
        width: 10,
        height: 22,
        length: 7,
        brand: { name: 'Felce Azzurra' },
        imageUrl: 'https://cdn.example.com/img1.jpg'
    };

    // POST z kategorią niebędącą liściem
    const nonLeaf = buildVonHalskyOfferPayload({
        mode: 'create',
        product,
        category: { id: CAT_UUID, name: 'Chemia', leaf: false, doesNotRequireGpsrInfo: true },
        htmlContent: { sekcja1: '<p>Opis produktu</p>' }
    });
    assert.ok(nonLeaf.errors.some(e => e.includes('leaf: false')));

    // PATCH na istniejącą ofertę: externalId i product.ean są już ustawione -> NIE wolno ich wysłać ponownie!
    const existingOffer = {
        id: OFFER_UUID,
        externalId: 'SKU-100',
        product: {
            name: 'Stara nazwa',
            brand: 'Felce Azzurra',
            categoryId: CAT_UUID,
            ean: '5904959447006'
        }
    };
    const patched = buildVonHalskyOfferPayload({
        mode: 'update',
        product,
        existingOffer,
        category: { id: CAT_UUID, name: 'Mydła', leaf: true, doesNotRequireGpsrInfo: true },
        htmlContent: { sekcja1: '<p>Nowy opis</p>' },
        overrides: {
            includeTitle: true,
            includeDescription: true,
            includePrice: false,
            includeStock: false,
            includeGpsr: false,
            includeImages: false,
            includeShipping: false,
            includePostSale: false,
            includeDimensions: false,
            includeAttributes: false
        }
    });

    assert.equal(patched.httpMethod, 'PATCH');
    assert.equal(patched.contentType, 'application/merge-patch+json');
    assert.equal(patched.errors.length, 0);
    assert.equal(patched.payload.externalId, undefined);
    assert.equal(patched.payload.product.ean, undefined);
    assert.equal(patched.payload.price, undefined);
    assert.equal(patched.payload.stock, undefined);
    assert.equal(patched.payload.product.name, 'Felce Azzurra Mydło w płynie 1000 ml');
    assert.match(patched.payload.product.description, /Nowy opis/);
});

test('VonHalsky Service: szyfrowanie sekretu w SystemSetting, OAuth2 cache, 401 retry i merge-patch+json', async () => {
    VonHalskyService.clearCaches();
    const store = new Map();
    const mockPrisma = {
        systemSetting: {
            async findUnique({ where }) {
                return store.get(where.key) || null;
            },
            async upsert({ where, update, create }) {
                const rec = { key: where.key, value: update.value || create.value, updatedAt: new Date() };
                store.set(where.key, rec);
                return rec;
            }
        }
    };

    const publicCfg = await VonHalskyService.saveConfig({
        environment: 'stage',
        clientId: 'vh_client_123456',
        clientSecret: 'super_tajny_sekret_999',
        organizationId: ORG_UUID,
        defaultDaysToShip: 2,
        defaultManufacturerEmail: 'gpsr@n-e-s.pl'
    }, { id: 'u1', email: 'admin@n-e-s.pl' }, mockPrisma);

    assert.equal(publicCfg.configured, true);
    assert.equal(publicCfg.environment, 'stage');
    assert.equal(publicCfg.apiBaseUrl, 'https://stage-api.inpost-group.com/inpsa');
    assert.equal(publicCfg.clientSecret, undefined);
    assert.equal(publicCfg.hasClientSecret, true);

    const rawDbVal = store.get(VonHalskyService.VONHALSKY_VAULT_KEY).value;
    assert.doesNotMatch(rawDbVal, /super_tajny_sekret_999/);
    assert.match(rawDbVal, /enc:v1:/);

    // Test OAuth2 + automatyczny retry po 401 + weryfikacja Content-Type application/merge-patch+json
    let tokenCalls = 0;
    let requestCalls = [];
    const mockHttp = {
        async post(url, body) {
            tokenCalls++;
            assert.equal(url, 'https://stage-api.inpost-group.com/oauth2/token');
            assert.match(body, /grant_type=client_credentials/);
            return { data: { access_token: `jwt_token_${tokenCalls}`, expires_in: 3600 } };
        },
        async request(cfg) {
            requestCalls.push({ method: cfg.method, url: cfg.url, headers: { ...cfg.headers } });
            if (requestCalls.length === 1) {
                const err = new Error('Unauthorized');
                err.response = { status: 401, data: { errorCode: 'UNAUTHORIZED' } };
                throw err;
            }
            return { status: 200, data: { offer: { id: OFFER_UUID, status: 'PUBLISHED' }, metadata: {} }, headers: {} };
        }
    };

    const patchRes = await VonHalskyService.patchOffer(
        ORG_UUID,
        OFFER_UUID,
        { product: { name: 'Zaktualizowana oferta' } },
        { httpClient: mockHttp, injectedPrisma: mockPrisma }
    );

    assert.equal(patchRes.offer.id, OFFER_UUID);
    assert.equal(tokenCalls, 2);
    assert.equal(requestCalls.length, 2);
    assert.equal(requestCalls[0].headers['Authorization'], 'Bearer jwt_token_1');
    assert.equal(requestCalls[1].headers['Authorization'], 'Bearer jwt_token_2');
    assert.equal(requestCalls[1].headers['Content-Type'], 'application/merge-patch+json');
    assert.equal(requestCalls[1].headers['Accept-Language'], 'pl');

    // Test spłaszczania drzewa kategorii
    const flat = VonHalskyService.flattenCategoryTree([
        {
            id: 'root-1',
            name: 'Dom',
            leaf: false,
            doesNotRequireGpsrInfo: false,
            children: [
                { id: CAT_UUID, name: 'Mydła', leaf: true, doesNotRequireGpsrInfo: false }
            ]
        }
    ]);
    assert.equal(flat.flatLeaves.length, 1);
    assert.equal(flat.flatLeaves[0].path, 'Dom > Mydła');
});

test('VonHalsky Controller: tryb Offline Pre-flight bez kluczy, twarda blokada dwukrotnego potwierdzenia i udany eksport POST + załącznik', async () => {
    const productRecord = {
        id: 'prod-vh-1',
        ean: '5904959447006',
        sku: 'SKU-VH-1',
        name: 'Felce Azzurra Żel pod prysznic 650 ml',
        salePrice: 24.5,
        taxRate: 23,
        stock: 10,
        weight: 0.72,
        width: 8,
        height: 21,
        length: 5,
        brand: { name: 'Felce Azzurra' },
        imageUrl: 'https://cdn.example.com/front.jpg',
        images: [],
        features: { 'Zapach': 'Klasyczny' },
        offerDraft: {
            htmlContent: {
                sekcja1: '<h2>Włoska formuła</h2><p>Delikatny żel myjący.</p>',
                sekcja6: '<p>Chronić przed dziećmi.</p>'
            },
            images: [
                { replacedUrl: 'https://cdn.example.com/front.jpg' },
                { replacedUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }
            ]
        }
    };

    let updatedDraft = null;
    const mockPrisma = {
        product: {
            async findUnique({ where }) {
                if (where.id === productRecord.id || where.ean === productRecord.ean) return productRecord;
                return null;
            },
            async update({ data }) {
                updatedDraft = data.offerDraft;
                return { ...productRecord, offerDraft: updatedDraft };
            }
        }
    };

    // 1. Offline Pre-flight (brak Client ID / Client Secret)
    const offlineController = createVonHalskyController({
        prisma: mockPrisma,
        vonHalskyService: {
            async getConfig() {
                return { environment: 'production', apiBaseUrl: 'https://api.inpost-group.com/inpsa', clientId: '', clientSecret: '', defaultDaysToShip: 1, defaultDescriptionFormat: 'html' };
            }
        },
        eventBus: { publish() {} },
        exportLogger: { info() {}, warn() {}, error() {} }
    });

    const offRes = createMockRes();
    await offlineController.validateVonHalskyExport({ body: { productId: productRecord.id, ean: productRecord.ean } }, offRes);
    assert.equal(offRes.statusCode, 200);
    assert.equal(offRes.body.apiConnected, false);
    assert.equal(offRes.body.canExport, false);
    assert.equal(offRes.body.exportToken, null);
    assert.equal(offRes.body.requiresDoubleConfirmation, true);
    assert.ok(offRes.body.errors.some(e => e.includes('Client ID')));
    assert.equal(offRes.body.preview.dimension.weight, 720);

    // 2. Online Pre-flight + blokada bez confirmedTwice + udany POST + binarny upload załącznika
    let createCalled = 0;
    let attachmentUploaded = 0;
    let publishedEvents = [];

    const onlineServiceMock = {
        async getConfig() {
            return {
                environment: 'stage',
                apiBaseUrl: 'https://stage-api.inpost-group.com/inpsa',
                clientId: 'cid',
                clientSecret: 'csec',
                organizationId: ORG_UUID,
                defaultDaysToShip: 1,
                defaultDescriptionFormat: 'html',
                defaultManufacturerEmail: 'compliance@paglieri.it'
            };
        },
        async findExistingOffersForProduct() { return []; },
        async getOfferHints() { return { data: [{ product: { categoryId: CAT_UUID, name: 'Felce Azzurra' }, gpsr: [] }] }; },
        async getCategoryDetails() { return { id: CAT_UUID, name: 'Żele pod prysznic', leaf: true, doesNotRequireGpsrInfo: false }; },
        async getCategoryAttributes() { return []; },
        async createOffer(orgId, proposal) {
            createCalled++;
            assert.equal(orgId, ORG_UUID);
            assert.equal(proposal.product.categoryId, CAT_UUID);
            assert.equal(proposal.images.length, 1); // tylko HTTPS! Base64 poszło do binaryAttachments
            return { offerId: OFFER_UUID, commandId: CMD_UUID, externalId: proposal.externalId };
        },
        async pollCommandStatus() {
            return { commandId: CMD_UUID, status: 'SUCCESS', errors: [] };
        },
        async uploadImageSourceAsAttachment(orgId, oid, opts) {
            attachmentUploaded++;
            assert.equal(orgId, ORG_UUID);
            assert.equal(oid, OFFER_UUID);
            assert.equal(opts.priority, 2);
            return { commandId: 'att-cmd-1', status: 'PENDING' };
        },
        async getOfferDetails() {
            return { offer: { id: OFFER_UUID, status: 'PENDING' }, metadata: { validationErrors: [], rejectionReasons: [] } };
        }
    };

    const onlineController = createVonHalskyController({
        prisma: mockPrisma,
        vonHalskyService: onlineServiceMock,
        eventBus: { publish(ev, payload) { publishedEvents.push({ ev, payload }); } },
        exportLogger: { info() {}, warn() {}, error() {} }
    });

    const preRes = createMockRes();
    await onlineController.validateVonHalskyExport({ body: { productId: productRecord.id, ean: productRecord.ean } }, preRes);
    assert.equal(preRes.statusCode, 200);
    assert.equal(preRes.body.apiConnected, true);
    assert.equal(preRes.body.canExport, true);
    assert.ok(preRes.body.exportToken);
    assert.equal(preRes.body.preview.httpsImagesCount, 1);
    assert.equal(preRes.body.preview.binaryAttachmentsCount, 1);

    // Próba eksportu BEZ dwukrotnego potwierdzenia -> twardy 400 i 0 wywołań API!
    const blockedRes = createMockRes();
    await onlineController.exportToVonHalsky({
        body: {
            productId: productRecord.id,
            ean: productRecord.ean,
            exportToken: preRes.body.exportToken,
            confirmedTwice: false
        }
    }, blockedRes);
    assert.equal(blockedRes.statusCode, 400);
    assert.equal(blockedRes.body.code, 'DOUBLE_CONFIRMATION_REQUIRED');
    assert.equal(createCalled, 0);

    // Próba eksportu ze zmienioną ceną wobec podpisanego tokena -> 409 INVALID_EXPORT_TOKEN
    const tamperRes = createMockRes();
    await onlineController.exportToVonHalsky({
        body: {
            productId: productRecord.id,
            ean: productRecord.ean,
            overrides: { priceAmount: 99.99 },
            exportToken: preRes.body.exportToken,
            confirmedTwice: true
        }
    }, tamperRes);
    assert.equal(tamperRes.statusCode, 409);
    assert.equal(tamperRes.body.code, 'INVALID_EXPORT_TOKEN');
    assert.equal(createCalled, 0);

    // Prawidłowy eksport z dwukrotnym potwierdzeniem i nienaruszonym tokenem
    const okRes = createMockRes();
    await onlineController.exportToVonHalsky({
        body: {
            productId: productRecord.id,
            ean: productRecord.ean,
            exportToken: preRes.body.exportToken,
            confirmedTwice: true
        }
    }, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body.status, 'SUCCESS');
    assert.equal(okRes.body.offerId, OFFER_UUID);
    assert.equal(createCalled, 1);
    assert.equal(attachmentUploaded, 1);
    assert.equal(updatedDraft.vonhalskyOfferId, OFFER_UUID);
    assert.equal(updatedDraft.vonhalskyCategoryId, CAT_UUID);
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].ev, 'PRODUCT_VONHALSKY_EXPORTED');
});
