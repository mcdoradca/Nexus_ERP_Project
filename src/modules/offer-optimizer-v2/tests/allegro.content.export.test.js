const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-allegro-multi-vault-secret-123456';

const {
    MAX_ALLEGRO_DESCRIPTION_BYTES,
    MAX_ALLEGRO_OFFER_IMAGES_BUSINESS,
    sanitizeHtmlForAllegroDescription,
    collectPipelineImagesForAllegro,
    buildAllegroDescriptionSections,
    buildAllegroContentPreflight,
    buildAllegroContentPatchBody
} = require('../../../utils/allegro_mapper');

const {
    ALLEGRO_VAULT_KEY,
    readAllegroAccountsVault,
    saveAccountFromTokenData,
    listConnectedAllegroAccounts,
    setDefaultAllegroAccount,
    removeAllegroAccount,
    uploadImageToAllegro
} = require('../../offer-optimizer/allegro.service');

function makeMockJwt(payload) {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.sig`;
}

function createInMemoryPrisma(initialRows = {}) {
    const store = new Map(Object.entries(initialRows));
    return {
        store,
        systemSetting: {
            findUnique: async ({ where }) => {
                const entry = store.get(where.key);
                return entry ? { key: where.key, ...entry } : null;
            },
            upsert: async ({ where, update, create }) => {
                const existing = store.get(where.key);
                const next = existing
                    ? { ...existing, value: update.value, updatedAt: new Date() }
                    : { value: create.value, updatedAt: new Date() };
                store.set(where.key, next);
                return { key: where.key, ...next };
            },
            create: async ({ data }) => {
                if (store.has(data.key)) throw new Error('Duplicate');
                const next = { value: data.value, updatedAt: new Date() };
                store.set(data.key, next);
                return { key: data.key, ...next };
            },
            updateMany: async ({ where, data }) => {
                const existing = store.get(where.key);
                if (!existing || (where.value !== undefined && existing.value !== where.value)) {
                    return { count: 0 };
                }
                store.set(where.key, { ...existing, value: data.value, updatedAt: new Date() });
                return { count: 1 };
            }
        }
    };
}

test('Allegro Content Export & Multi-Account Vault', async (t) => {
    await t.test('1. sanitizeHtmlForAllegroDescription konwertuje <strong> na <b>, usuwa atrybuty/<br>/<b> w nagłówkach, zachowując treść i emotikony', () => {
        const input = '<h2 class="title">⭐ <b>Nagłówek</b> testowy</h2>' +
            '<p style="color:red">Pierwsza linia<br/>Druga <strong>pogrubiona</strong> i <em>kursywa</em></p>' +
            '<p><ul><li>✔️ <strong>Cecha:</strong> wartość<br>dalsza</li></ul></p>';

        const out = sanitizeHtmlForAllegroDescription(input);
        assert.ok(out.includes('<h2>⭐ Nagłówek testowy</h2>'), 'Nagłówek musi być wolny od zagnieżdżonego <b> i atrybutów');
        assert.ok(!out.includes('<strong>') && !out.includes('<em>') && !out.includes('<br') && !out.includes('class=') && !out.includes('style='));
        assert.ok(out.includes('<p>Pierwsza linia</p><p>Druga <b>pogrubiona</b> i kursywa</p>'));
        assert.ok(out.includes('<ul><li>✔️ <b>Cecha:</b> wartość dalsza</li></ul>'));
        assert.ok(!out.includes('<p><ul>'), 'Lista nie może być owinięta w <p>');
    });

    await t.test('2. collectPipelineImagesForAllegro odfiltrowuje placeholdery, obsługuje replacedUrl, AI Act i limit 16 zdjęć', () => {
        const tickets = [
            { originalUrl: 'https://example.com/packshot.jpg', replacedUrl: null },
            { originalUrl: 'Wymagane nowe zdjęcie (nr 2)', replacedUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
            { originalUrl: 'Wymagane nowe zdjęcie (nr 3)', replacedUrl: null },
            { originalUrl: 'https://upload.cdn.baselinker.com/placeholder.jpg', replacedUrl: null },
            { originalUrl: 'https://a.allegroimg.com/original/115480/abc123', replacedUrl: null }
        ];
        const res = collectPipelineImagesForAllegro({ draftImages: tickets });
        assert.strictEqual(res.images.length, 3);
        assert.strictEqual(res.images[0].source, 'https://example.com/packshot.jpg');
        assert.strictEqual(res.images[0].isAiCoCreated, false);
        assert.strictEqual(res.images[1].source, 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
        assert.strictEqual(res.images[1].isAiCoCreated, true, 'Wygenerowany lifestyle base64 w slocie > 0 dostaje domyślnie flagę AI');
        assert.strictEqual(res.images[2].isAllegroHosted, true);

        const many = Array.from({ length: 20 }, (_, i) => `https://example.com/img_${i}.jpg`);
        const limited = collectPipelineImagesForAllegro({ draftImages: many });
        assert.strictEqual(limited.images.length, MAX_ALLEGRO_OFFER_IMAGES_BUSINESS);
        assert.strictEqual(limited.overflowCount, 4);
    });

    await t.test('3. buildAllegroDescriptionSections paruje sekcje z obrazami, pilnuje limitu 40000 B i dopisuje klauzulę AI Act', () => {
        const htmlContent = {
            sekcja1: '<h1>⭐ Produkt Testowy</h1><p><strong>Świetna</strong> jakość.</p>',
            sekcja2: '<h2>❓ FAQ</h2><ul><li><b>Pytanie:</b> Czy działa?</li></ul>',
            sekcja7: '<p>Bezpośredni importer.</p>'
        };
        const imageUrls = ['https://a.allegroimg.com/original/1/a.jpg'];

        const built = buildAllegroDescriptionSections({
            htmlContent,
            imageUrls,
            appendAiDisclosure: true
        });
        assert.strictEqual(built.sectionsCount, 3);
        assert.strictEqual(built.exceedsLimit, false);
        assert.deepStrictEqual(built.description.sections[0].items, [
            { type: 'IMAGE', url: 'https://a.allegroimg.com/original/1/a.jpg' },
            { type: 'TEXT', content: '<h1>⭐ Produkt Testowy</h1><p><b>Świetna</b> jakość.</p>' }
        ]);
        assert.deepStrictEqual(built.description.sections[1].items, [
            { type: 'TEXT', content: '<h2>❓ FAQ</h2><ul><li><b>Pytanie:</b> Czy działa?</li></ul>' }
        ]);
        assert.ok(built.description.sections[2].items[0].content.includes('Zdjęcia aranżacyjne: tła wygenerowane cyfrowo'));

        const huge = { sekcja1: `<p>${'A'.repeat(42000)}</p>` };
        const hugeBuilt = buildAllegroDescriptionSections({ htmlContent: huge, imageUrls: [] });
        assert.strictEqual(hugeBuilt.exceedsLimit, true);
        assert.ok(hugeBuilt.totalBytes > MAX_ALLEGRO_DESCRIPTION_BYTES);
    });

    await t.test('4. buildAllegroContentPreflight chroni trustedContent i buildAllegroContentPatchBody pomija productSet', () => {
        const existingOffer = {
            id: '1900000999',
            images: ['https://a.allegroimg.com/original/old.jpg'],
            description: { sections: [{ items: [{ type: 'TEXT', content: '<p>Stary</p>' }] }] },
            aiCoCreatedContent: { images: [{ url: 'https://a.allegroimg.com/original/old.jpg' }] },
            productSet: [{ quantity: { value: 1 }, product: { id: 'uuid-prod-1' } }]
        };
        const catalogProduct = {
            id: 'uuid-prod-1',
            trustedContent: { paths: ['description'], productPaths: [] }
        };

        const preflight = buildAllegroContentPreflight({
            existingOffer,
            catalogProduct,
            htmlContent: { sekcja1: '<p>Nowy opis</p>' },
            draftImages: [{ originalUrl: 'https://example.com/new.jpg' }],
            includeImages: true,
            includeDescription: true
        });

        assert.strictEqual(preflight.trusted.descriptionBlocked, true);
        assert.strictEqual(preflight.effectiveIncludeDescription, false, 'Zaufany opis katalogowy musi zostać zablokowany');
        assert.strictEqual(preflight.effectiveIncludeImages, true);
        assert.strictEqual(preflight.hasChanges, true);
        assert.strictEqual(preflight.imagesPreview.needUploadCount, 1);

        const patchBody = buildAllegroContentPatchBody({
            existingOffer,
            uploadedImages: [{ url: 'https://a.allegroimg.com/original/new-cdn.jpg', isAiCoCreated: false }],
            description: null,
            includeImages: true,
            includeDescription: false
        });
        assert.strictEqual(patchBody.productSet, undefined, 'PATCH opisu i zdjęć nie może dotykać productSet');
        assert.deepStrictEqual(patchBody.images, ['https://a.allegroimg.com/original/new-cdn.jpg']);
        assert.deepStrictEqual(patchBody.aiCoCreatedContent, { images: [] }, 'Stare usunięte zdjęcie AI musi zostać wyczyszczone z aiCoCreatedContent');

        // Duże zdjęcia DataURI Base64 w Pre-flight nie mogą fałszywie przekraczać limitu 40000 B opisu
        const bigBase64 = `data:image/jpeg;base64,${'A'.repeat(120000)}`;
        const base64Preflight = buildAllegroContentPreflight({
            existingOffer,
            catalogProduct: { id: 'uuid-prod-1', trustedContent: { paths: [], productPaths: [] } },
            htmlContent: { sekcja1: '<p>Krótki opis produktu</p>' },
            draftImages: [{ originalUrl: bigBase64 }],
            includeImages: true,
            includeDescription: true
        });
        assert.strictEqual(base64Preflight.errors.length, 0);
        assert.ok(base64Preflight.descriptionPreview.totalBytes < 1000, 'Pomiar bajtów w Pre-flight musi symulować docelowy URL a.allegroimg.com zamiast surowego Base64');
    });

    await t.test('5. Multi-Account Vault szyfruje tokeny AES-256-GCM, migruje z legacy i zarządza wieloma kontami', async () => {
        const legacyJwt = makeMockJwt({
            user_name: '50233197',
            scope: ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'],
            exp: Math.floor(Date.now() / 1000) + 3600
        });
        const mockPrisma = createInMemoryPrisma({
            ALLEGRO_ACCESS_TOKEN: { value: legacyJwt, updatedAt: new Date() },
            ALLEGRO_REFRESH_TOKEN: { value: 'legacy-refresh-token-1', updatedAt: new Date() },
            ALLEGRO_TOKEN_EXPIRY: { value: String(Date.now() + 3600000), updatedAt: new Date() }
        });

        // Odczyt z legacy bez utraty istniejącego konta 50233197
        const legacyVault = await readAllegroAccountsVault(mockPrisma);
        assert.strictEqual(legacyVault.defaultAccountId, '50233197');
        assert.ok(legacyVault.accounts['50233197']);

        // Zapis pierwszego i drugiego konta do zaszyfrowanego skarbca ALLEGRO_ACCOUNTS_VAULT
        await saveAccountFromTokenData({
            access_token: legacyJwt,
            refresh_token: 'refresh-acc-1',
            expires_in: 43200
        }, { label: 'Konto Główne PL', setAsDefault: true }, mockPrisma);

        const secondJwt = makeMockJwt({
            user_name: '99887766',
            scope: ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'],
            exp: Math.floor(Date.now() / 1000) + 3600
        });
        await saveAccountFromTokenData({
            access_token: secondJwt,
            refresh_token: 'refresh-acc-2-secret',
            expires_in: 43200
        }, { label: 'Konto Drugie B2B', setAsDefault: false }, mockPrisma);

        const rawEncrypted = mockPrisma.store.get(ALLEGRO_VAULT_KEY).value;
        assert.ok(rawEncrypted.startsWith('enc:v1:'), 'Skarbiec kont musi być zaszyfrowany AES-256-GCM');
        assert.strictEqual(rawEncrypted.includes('refresh-acc-2-secret'), false, 'Token nie może leżeć jawnym tekstem w bazie');

        const accounts = await listConnectedAllegroAccounts(mockPrisma);
        assert.strictEqual(accounts.length, 2);
        assert.strictEqual(accounts[0].accountId, '50233197');
        assert.strictEqual(accounts[0].isDefault, true);
        assert.strictEqual(accounts[1].accountId, '99887766');
        assert.strictEqual(accounts[1].label, 'Konto Drugie B2B');
        assert.strictEqual(accounts[0].accessToken, undefined, 'Metadane listy kont nie mogą zawierać tokenów');

        const afterSwitch = await setDefaultAllegroAccount('99887766', mockPrisma);
        assert.strictEqual(afterSwitch.find(a => a.accountId === '99887766').isDefault, true);

        const afterDelete = await removeAllegroAccount('50233197', mockPrisma);
        assert.strictEqual(afterDelete.length, 1);
        assert.strictEqual(afterDelete[0].accountId, '99887766');
    });

    await t.test('6. uploadImageToAllegro omija a.allegroimg.com, wgrywa DataURI binarnie oraz URL JSON bez sprzecznych flag', async () => {
        const alreadyHosted = await uploadImageToAllegro({
            source: 'https://a.allegroimg.com/original/115480/already.jpg',
            isAiCoCreated: true
        });
        assert.strictEqual(alreadyHosted.skippedUpload, true);
        assert.strictEqual(alreadyHosted.url, 'https://a.allegroimg.com/original/115480/already.jpg');

        const sellerJwt = makeMockJwt({
            user_name: '77711122',
            scope: ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'],
            exp: Math.floor(Date.now() / 1000) + 3600
        });
        const mockPrisma = createInMemoryPrisma();
        await saveAccountFromTokenData({
            access_token: sellerJwt,
            refresh_token: 'refresh-777',
            expires_in: 43200
        }, { label: 'Konto Test Upload' }, mockPrisma);

        const calls = [];
        const fakeHttp = {
            post: async (url, body, config) => {
                calls.push({ url, body, config });
                return { data: { location: `https://a.allegroimg.com/original/mock/${calls.length}.jpg`, expiresAt: new Date(Date.now() + 3600000).toISOString() } };
            }
        };

        const binRes = await uploadImageToAllegro({
            source: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==',
            isAiCoCreated: true,
            accountId: '77711122',
            httpClient: fakeHttp,
            injectedPrisma: mockPrisma
        });
        assert.strictEqual(binRes.skippedUpload, false);
        assert.strictEqual(calls[0].url, 'https://upload.allegro.pl/sale/images?isAiCoCreated=true');
        assert.ok(Buffer.isBuffer(calls[0].body), 'DataURI musi być wysłane jako binarny Buffer');
        assert.strictEqual(calls[0].config.headers['Content-Type'], 'image/jpeg');

        const urlRes = await uploadImageToAllegro({
            source: 'https://cdn.example.com/product.png',
            isAiCoCreated: false,
            accountId: '77711122',
            httpClient: fakeHttp,
            injectedPrisma: mockPrisma
        });
        assert.strictEqual(urlRes.skippedUpload, false);
        assert.strictEqual(calls[1].url, 'https://upload.allegro.pl/sale/images', 'JSON upload nie powinien dublować query param isAiCoCreated');
        assert.deepStrictEqual(calls[1].body, { url: 'https://cdn.example.com/product.png', isAiCoCreated: false });
        assert.strictEqual(calls[1].config.headers['Content-Type'], 'application/vnd.allegro.public.v1+json');
    });
});
