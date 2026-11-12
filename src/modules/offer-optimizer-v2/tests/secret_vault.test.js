const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-vault-secret-key-min-16-chars';

const {
    ENC_PREFIX,
    encryptSecret,
    decryptSecret,
    testBaseLinkerToken,
    resolveBaseLinkerToken,
    getBaseLinkerToken
} = require('../../../utils/secretVault');

test('SecretVault: AES-256-GCM encryption/decryption i izolacja tokena BASELINKER_TOKEN', async (t) => {
    await t.test('1. Szyfrowanie enc:v1 generuje losowy IV, nie zawiera jawnego tekstu i poprawnie odszyfrowuje', () => {
        const fakeToken = '200695-200695-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const enc1 = encryptSecret(fakeToken);
        const enc2 = encryptSecret(fakeToken);

        assert.ok(enc1.startsWith(ENC_PREFIX), 'Zaszyfrowany token musi mieć prefiks enc:v1:');
        assert.notStrictEqual(enc1, enc2, 'Dwa szyfrowania tego samego sekretu muszą mieć różne losowe IV');
        assert.strictEqual(enc1.includes('200695'), false, 'Szyfrogram nie może zawierać jawnych fragmentów tokena');
        assert.strictEqual(decryptSecret(enc1), fakeToken);
        assert.strictEqual(decryptSecret(enc2), fakeToken);
    });

    await t.test('2. Błędny klucz dekodowania rzuca jawny błąd VAULT_DECRYPT_FAILED zamiast zwracać śmieci', () => {
        const prevJwt = process.env.JWT_SECRET;
        const prevVault = process.env.BASELINKER_VAULT_KEY;
        try {
            process.env.BASELINKER_VAULT_KEY = 'klucz-produkcyjny-numer-1-abc';
            const encrypted = encryptSecret('1000000-1000000-VALIDTOKENEXAMPLE1234567890');
            process.env.BASELINKER_VAULT_KEY = 'zupelnie-inny-klucz-lokalny-xyz';
            assert.throws(() => decryptSecret(encrypted), /VAULT_DECRYPT_FAILED/);
        } finally {
            process.env.JWT_SECRET = prevJwt;
            if (prevVault === undefined) delete process.env.BASELINKER_VAULT_KEY;
            else process.env.BASELINKER_VAULT_KEY = prevVault;
        }
    });

    await t.test('3. Kompatybilność wsteczna dla starszych wpisów bez prefiksu enc:v1:', () => {
        assert.strictEqual(decryptSecret('legacy-plaintext-value'), 'legacy-plaintext-value');
        assert.strictEqual(decryptSecret(null), null);
    });

    await t.test('4. testBaseLinkerToken odrzuca 10-znakowe hasła/autofill i spacje zanim wyśle jakiekolwiek żądanie HTTP', async () => {
        let httpCalled = false;
        const fakePost = async () => {
            httpCalled = true;
            return { data: { status: 'SUCCESS', inventories: [] } };
        };

        const shortRes = await testBaseLinkerToken('1v822xAb3v', fakePost);
        assert.strictEqual(shortRes.ok, false);
        assert.strictEqual(shortRes.errorCode, 'INVALID_TOKEN_FORMAT');
        assert.strictEqual(httpCalled, false, 'Krótki 10-znakowy string nie powinien nawet wywoływać API Base.com');

        const spaceRes = await testBaseLinkerToken('200695-200695-ABCDEF GHIJKLMNOPQRSTUVWXYZ', fakePost);
        assert.strictEqual(spaceRes.ok, false);
        assert.strictEqual(spaceRes.errorCode, 'INVALID_TOKEN_WHITESPACE');
        assert.strictEqual(httpCalled, false);

        const validToken = '200695-200695-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const okRes = await testBaseLinkerToken(validToken, async (url, body, opts) => {
            assert.strictEqual(url, 'https://api.baselinker.com/connector.php');
            assert.strictEqual(opts.headers['X-BLToken'], validToken);
            return { data: { status: 'SUCCESS', inventories: [{ inventory_id: 42, name: 'Główny', is_default: true }] } };
        });
        assert.strictEqual(okRes.ok, true);
        assert.strictEqual(okRes.inventories.length, 1);
        assert.strictEqual(okRes.inventories[0].inventory_id, 42);
    });

    await t.test('5. resolveBaseLinkerToken preferuje ENV serwera, a w przeciwnym razie odszyfrowuje wpis z SystemSetting', async () => {
        const prevEnvToken = process.env.BASELINKER_TOKEN;
        const dbTokenPlain = '300000-300000-DBTOKENENCRYPTED1234567890ABCDEF';
        const mockPrisma = {
            systemSetting: {
                findUnique: async ({ where }) => {
                    assert.strictEqual(where.key, 'BASELINKER_TOKEN');
                    return {
                        key: 'BASELINKER_TOKEN',
                        value: encryptSecret(dbTokenPlain),
                        updatedAt: new Date('2026-11-12T06:00:00Z')
                    };
                }
            }
        };

        try {
            delete process.env.BASELINKER_TOKEN;
            const fromDb = await resolveBaseLinkerToken(mockPrisma);
            assert.strictEqual(fromDb.token, dbTokenPlain);
            assert.strictEqual(fromDb.source, 'db');
            assert.strictEqual(fromDb.encrypted, true);

            process.env.BASELINKER_TOKEN = '400000-400000-ENVTOKENPRIORITY1234567890ABCDEF';
            const fromEnv = await resolveBaseLinkerToken(mockPrisma);
            assert.strictEqual(fromEnv.token, '400000-400000-ENVTOKENPRIORITY1234567890ABCDEF');
            assert.strictEqual(fromEnv.source, 'env');
            assert.strictEqual(await getBaseLinkerToken(mockPrisma), '400000-400000-ENVTOKENPRIORITY1234567890ABCDEF');
        } finally {
            if (prevEnvToken === undefined) delete process.env.BASELINKER_TOKEN;
            else process.env.BASELINKER_TOKEN = prevEnvToken;
        }
    });
});

