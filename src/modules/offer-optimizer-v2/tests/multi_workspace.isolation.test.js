require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const workspaceService = require('../../../services/workspace.service');
const secretVault = require('../../../utils/secretVault');
const exportTokenGuard = require('../../../utils/exportTokenGuard');
const productLookup = require('../../../utils/productLookup');
const baselinkerExport = require('../baselinker.export.service');
const allegroService = require('../../offer-optimizer/allegro.service');
const vonHalskyService = require('../../offer-optimizer/vonhalsky.service');

const prisma = new PrismaClient();
const TEST_TAG = `mw_iso_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const createdWorkspaceIds = [];

function createFakeJwt({ userName = '998877', scope = ['allegro:api:sale:offers:write', 'allegro:api:sale:offers:read'] } = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        user_name: userName,
        scope,
        exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${payload}.fake_signature`;
}

test('Multi-Workspace Isolation Suite (PostgreSQL, AES-256-GCM AAD, Channels, ExportGuard, Cache)', async (t) => {
    let wsA;
    let wsB;
    let prodA;
    let prodB;
    const sharedEan = `999${String(Date.now()).slice(-10)}`;
    const sharedSku = `SKU-${TEST_TAG}`;

    t.after(async () => {
        try {
            if (createdWorkspaceIds.length > 0) {
                await prisma.securityAuditLog.deleteMany({
                    where: { workspaceId: { in: createdWorkspaceIds } }
                });
                await prisma.integrationAccount.deleteMany({
                    where: { workspaceId: { in: createdWorkspaceIds } }
                });
                await prisma.returnRecord.deleteMany({
                    where: { workspaceId: { in: createdWorkspaceIds } }
                });
                await prisma.customerRiskProfile.deleteMany({
                    where: { workspaceId: { in: createdWorkspaceIds } }
                });
                await prisma.product.deleteMany({
                    where: { workspaceId: { in: createdWorkspaceIds } }
                });
                await prisma.workspace.deleteMany({
                    where: { id: { in: createdWorkspaceIds } }
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    });

    await t.test('1. Real PostgreSQL composite unique keys and strict workspace data isolation (Product & RMA)', async () => {
        wsA = await workspaceService.createWorkspace(prisma, {
            name: `Test Client A (${TEST_TAG})`,
            slug: `test-client-a-${TEST_TAG}`,
            badgeColor: '#0ea5e9',
            isDefault: false
        });
        createdWorkspaceIds.push(wsA.id);

        wsB = await workspaceService.createWorkspace(prisma, {
            name: `Test Client B (${TEST_TAG})`,
            slug: `test-client-b-${TEST_TAG}`,
            badgeColor: '#ef4444',
            isDefault: false
        });
        createdWorkspaceIds.push(wsB.id);

        prodA = await prisma.product.create({
            data: {
                workspaceId: wsA.id,
                ean: sharedEan,
                sku: sharedSku,
                name: 'Produkt Klienta A',
                salePrice: 49.99,
                baselinkerId: `bl_prod_${TEST_TAG}`,
                subiektId: `sub_${TEST_TAG}`
            }
        });

        prodB = await prisma.product.create({
            data: {
                workspaceId: wsB.id,
                ean: sharedEan,
                sku: sharedSku,
                name: 'Produkt Klienta B',
                salePrice: 89.99,
                baselinkerId: `bl_prod_${TEST_TAG}`,
                subiektId: `sub_${TEST_TAG}`
            }
        });

        assert.notEqual(prodA.id, prodB.id);
        assert.equal(prodA.workspaceId, wsA.id);
        assert.equal(prodB.workspaceId, wsB.id);

        // IDOR check: productId z wsA nie może być zwrócony pod kontekstem wsB
        const crossLookup = await productLookup.resolveProductByIdOrEan(prisma, {
            productId: prodA.id,
            workspaceId: wsB.id
        });
        assert.equal(crossLookup, null);

        const crossIdLookup = await productLookup.resolveProductByIdOrEan(prisma, {
            id: prodA.id,
            workspaceId: wsB.id
        });
        assert.equal(crossIdLookup, null);

        // Ten sam EAN rozwiązuje dokładnie właściwy rekord dla każdego klienta
        const resolvedA = await productLookup.resolveProductByIdOrEan(prisma, {
            ean: sharedEan,
            workspaceId: wsA.id
        });
        const resolvedB = await productLookup.resolveProductByIdOrEan(prisma, {
            ean: sharedEan,
            workspaceId: wsB.id
        });
        assert.equal(resolvedA?.id, prodA.id);
        assert.equal(resolvedB?.id, prodB.id);

        // RMA composite unique [workspaceId, allegroLogin] & [workspaceId, baselinkerId]
        const sharedLogin = `buyer_${TEST_TAG}`;
        const sharedReturnBlId = `ret_${TEST_TAG}`;

        const riskA = await prisma.customerRiskProfile.create({
            data: {
                workspaceId: wsA.id,
                allegroLogin: sharedLogin,
                isBlacklisted: true,
                totalReturns: 3
            }
        });
        const riskB = await prisma.customerRiskProfile.create({
            data: {
                workspaceId: wsB.id,
                allegroLogin: sharedLogin,
                isBlacklisted: false,
                totalReturns: 1
            }
        });
        assert.notEqual(riskA.id, riskB.id);

        const retA = await prisma.returnRecord.create({
            data: {
                workspaceId: wsA.id,
                baselinkerId: sharedReturnBlId,
                orderId: `ord_a_${TEST_TAG}`,
                customerLogin: sharedLogin,
                productEan: sharedEan,
                refundAmount: 49.99
            }
        });
        const retB = await prisma.returnRecord.create({
            data: {
                workspaceId: wsB.id,
                baselinkerId: sharedReturnBlId,
                orderId: `ord_b_${TEST_TAG}`,
                customerLogin: sharedLogin,
                productEan: sharedEan,
                refundAmount: 89.99
            }
        });
        assert.notEqual(retA.id, retB.id);

        const wsAReturns = await prisma.returnRecord.findMany({ where: { workspaceId: wsA.id } });
        assert.equal(wsAReturns.length, 1);
        assert.equal(wsAReturns[0].orderId, `ord_a_${TEST_TAG}`);
    });

    await t.test('2. AES-256-GCM + AAD cryptographic tamper rejection across workspaces, accounts and providers', () => {
        const accountId = 'acc_crypto_test_01';
        const plaintext = 'secret_credential_value_for_workspace_a_only';
        const aadA = secretVault.buildIntegrationAad(wsA.id, 'BASELINKER', accountId);
        const aadWrongWs = secretVault.buildIntegrationAad(wsB.id, 'BASELINKER', accountId);
        const aadWrongAcc = secretVault.buildIntegrationAad(wsA.id, 'BASELINKER', 'acc_crypto_test_02');
        const aadWrongProvider = secretVault.buildIntegrationAad(wsA.id, 'ALLEGRO', accountId);

        const ciphertext = secretVault.encryptSecretWithAad(plaintext, aadA);
        assert.ok(ciphertext.startsWith(secretVault.ENC_V2_PREFIX));

        assert.equal(secretVault.decryptSecretWithAad(ciphertext, aadA), plaintext);
        assert.throws(() => secretVault.decryptSecretWithAad(ciphertext, aadWrongWs), /VAULT_AAD_DECRYPT_FAILED/);
        assert.throws(() => secretVault.decryptSecretWithAad(ciphertext, aadWrongAcc), /VAULT_AAD_DECRYPT_FAILED/);
        assert.throws(() => secretVault.decryptSecretWithAad(ciphertext, aadWrongProvider), /VAULT_AAD_DECRYPT_FAILED/);
        assert.throws(() => secretVault.decryptSecret(ciphertext), /VAULT_AAD_REQUIRED/);
    });

    await t.test('3. Fail-Closed Channel Isolation (BaseLinker, Allegro, Von Halsky)', async () => {
        // --- BaseLinker ---
        const blSecretA = `bl_token_alpha_${TEST_TAG}_123456789012`;
        await workspaceService.upsertIntegrationAccount(prisma, {
            workspaceId: wsA.id,
            provider: 'BASELINKER',
            label: 'BaseLinker A',
            credentialsObj: { token: blSecretA },
            isDefault: true
        });

        const prevEnvBl = process.env.BASELINKER_TOKEN;
        process.env.BASELINKER_TOKEN = 'env_fallback_must_never_leak_to_client_b_123456789';
        try {
            const resA = await secretVault.resolveBaseLinkerToken(prisma, { workspaceId: wsA.id });
            assert.equal(resA.token, blSecretA);
            assert.equal(resA.source, 'workspace_vault');

            const resB = await secretVault.resolveBaseLinkerToken(prisma, { workspaceId: wsB.id });
            assert.equal(resB.token, null);
            assert.equal(resB.source, 'none');

            await assert.rejects(
                () => secretVault.getBaseLinkerToken(prisma, { workspaceId: wsB.id }),
                /Brak skonfigurowanego aktywnego tokena BaseLinker/
            );
        } finally {
            if (prevEnvBl === undefined) delete process.env.BASELINKER_TOKEN;
            else process.env.BASELINKER_TOKEN = prevEnvBl;
        }

        // --- Allegro ---
        const fakeJwtA = createFakeJwt({ userName: '777888999' });
        await workspaceService.upsertIntegrationAccount(prisma, {
            workspaceId: wsA.id,
            provider: 'ALLEGRO',
            label: 'Allegro Seller A',
            externalAccountId: '777888999',
            credentialsObj: {
                accessToken: fakeJwtA,
                refreshToken: `refresh_a_${TEST_TAG}`,
                tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
                login: `seller_a_${TEST_TAG}`,
                scopes: ['allegro:api:sale:offers:write', 'allegro:api:sale:offers:read']
            },
            isDefault: true
        });

        const allegroAccountsA = await allegroService.listConnectedAllegroAccounts(prisma, wsA.id);
        const allegroAccountsB = await allegroService.listConnectedAllegroAccounts(prisma, wsB.id);
        assert.equal(allegroAccountsA.length, 1);
        assert.equal(allegroAccountsB.length, 0);

        await assert.rejects(
            () => allegroService.ensureSellerWriteToken(null, prisma, wsB.id),
            /Brak podłączonego konta sprzedawcy Allegro/
        );

        await assert.rejects(
            () => allegroService.getOfferAndCatalogForParams('999000111', {
                workspaceId: wsB.id,
                allowCrossAccountFallback: true,
                injectedPrisma: prisma
            }),
            /Brak podłączonego konta sprzedawcy Allegro/
        );

        // --- InPost Von Halsky ---
        await vonHalskyService.saveConfig({
            label: 'VH A',
            environment: 'stage',
            clientId: `vh_client_a_${TEST_TAG}`,
            clientSecret: `vh_secret_a_${TEST_TAG}`,
            organizationId: '11111111-2222-4333-8444-555555555555',
            isDefault: true
        }, null, prisma, { workspaceId: wsA.id });

        const vhCfgA = await vonHalskyService.getConfig(prisma, { workspaceId: wsA.id });
        const vhCfgB = await vonHalskyService.getConfig(prisma, { workspaceId: wsB.id });
        const vhPubA = await vonHalskyService.getPublicConfig(prisma, { workspaceId: wsA.id });
        const vhPubB = await vonHalskyService.getPublicConfig(prisma, { workspaceId: wsB.id });
        assert.equal(vhCfgA.clientId, `vh_client_a_${TEST_TAG}`);
        assert.equal(vhCfgA.clientSecret, `vh_secret_a_${TEST_TAG}`);
        assert.equal(vhCfgA.environment, 'stage');
        assert.equal(vhCfgB.clientId, '');
        assert.equal(vhCfgB.clientSecret, '');
        assert.equal(vhPubA.configured, true);
        assert.equal(vhPubB.configured, false);
        assert.equal(vhPubB.hasClientSecret, false);

        await assert.rejects(
            () => vonHalskyService.getAccessToken({ injectedPrisma: prisma, workspaceId: wsB.id }),
            /Brak skonfigurowanych danych dostępowych InPost Von Halsky/
        );
    });

    await t.test('4. Scoped single-use ExportTokenGuard rejects mismatches and replays', () => {
        const payload = { title: 'Test Offer', price: 49.99 };
        const token = exportTokenGuard.signScopedExportToken({
            workspaceId: wsA.id,
            userId: 'admin-user-1',
            provider: 'BASELINKER',
            integrationAccountId: 'bl-acc-a',
            targetId: prodA.id,
            ean: sharedEan,
            payloadObj: payload
        });

        assert.throws(
            () => exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
                workspaceId: wsB.id,
                userId: 'admin-user-1',
                provider: 'BASELINKER',
                integrationAccountId: 'bl-acc-a',
                targetId: prodA.id,
                ean: sharedEan,
                payloadObj: payload
            }),
            err => err.code === 'EXPORT_TOKEN_WORKSPACE_MISMATCH'
        );

        assert.throws(
            () => exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
                workspaceId: wsA.id,
                userId: 'admin-user-1',
                provider: 'ALLEGRO',
                integrationAccountId: 'bl-acc-a',
                targetId: prodA.id,
                ean: sharedEan,
                payloadObj: payload
            }),
            err => err.code === 'EXPORT_TOKEN_PROVIDER_MISMATCH'
        );

        assert.throws(
            () => exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
                workspaceId: wsA.id,
                userId: 'admin-user-1',
                provider: 'BASELINKER',
                integrationAccountId: 'bl-acc-other',
                targetId: prodA.id,
                ean: sharedEan,
                payloadObj: payload
            }),
            err => err.code === 'EXPORT_TOKEN_ACCOUNT_MISMATCH'
        );

        assert.throws(
            () => exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
                workspaceId: wsA.id,
                userId: 'admin-user-1',
                provider: 'BASELINKER',
                integrationAccountId: 'bl-acc-a',
                targetId: prodA.id,
                ean: sharedEan,
                payloadObj: { title: 'Tampered', price: 49.99 }
            }),
            err => err.code === 'EXPORT_TOKEN_PAYLOAD_MODIFIED'
        );

        const decoded = exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
            workspaceId: wsA.id,
            userId: 'admin-user-1',
            provider: 'BASELINKER',
            integrationAccountId: 'bl-acc-a',
            targetId: prodA.id,
            ean: sharedEan,
            payloadObj: payload
        });
        assert.equal(decoded.ws, wsA.id);
        assert.equal(decoded.acc, 'bl-acc-a');

        assert.throws(
            () => exportTokenGuard.verifyAndConsumeScopedExportToken(token, {
                workspaceId: wsA.id,
                userId: 'admin-user-1',
                provider: 'BASELINKER',
                integrationAccountId: 'bl-acc-a',
                targetId: prodA.id,
                ean: sharedEan,
                payloadObj: payload
            }),
            err => err.code === 'EXPORT_TOKEN_REPLAY'
        );
    });

    await t.test('5. BaseLinker ExportService parameter schema cache is strictly partitioned by workspaceId + accountId', async () => {
        const origCallConnectorApi = baselinkerExport.callConnectorApi.bind(baselinkerExport);
        const sharedInventoryId = 999888;
        let callCount = 0;

        baselinkerExport.callConnectorApi = async (method, params, timeoutMs, context = {}) => {
            callCount += 1;
            assert.equal(method, 'getInventoryParameters');
            if (context.workspaceId === wsA.id) {
                return {
                    parameters: [{ parameter_id: 1, name: `Param_WS_A_${TEST_TAG}`, editor_type: 'text' }]
                };
            }
            if (context.workspaceId === wsB.id) {
                return {
                    parameters: [{ parameter_id: 2, name: `Param_WS_B_${TEST_TAG}`, editor_type: 'text' }]
                };
            }
            return { parameters: [] };
        };

        try {
            baselinkerExport.clearInventoryParametersCache(wsA.id);
            baselinkerExport.clearInventoryParametersCache(wsB.id);

            const paramsA = await baselinkerExport.fetchInventoryParameters(sharedInventoryId, {
                workspaceId: wsA.id,
                accountId: 'accA'
            });
            const paramsB = await baselinkerExport.fetchInventoryParameters(sharedInventoryId, {
                workspaceId: wsB.id,
                accountId: 'accB'
            });

            assert.equal(callCount, 2);
            assert.ok(paramsA.some(p => p.name === `Param_WS_A_${TEST_TAG}`));
            assert.ok(!paramsA.some(p => p.name === `Param_WS_B_${TEST_TAG}`));
            assert.ok(paramsB.some(p => p.name === `Param_WS_B_${TEST_TAG}`));
            assert.ok(!paramsB.some(p => p.name === `Param_WS_A_${TEST_TAG}`));

            // Ponowne wywołanie dla wsA korzysta wyłącznie z cache wsA (callCount pozostaje 2)
            await baselinkerExport.fetchInventoryParameters(sharedInventoryId, {
                workspaceId: wsA.id,
                accountId: 'accA'
            });
            assert.equal(callCount, 2);

            // Wyczyszczenie cache wsA nie usuwa wpisu wsB
            baselinkerExport.clearInventoryParametersCache(wsA.id);
            const paramsBAfterClearA = await baselinkerExport.fetchInventoryParameters(sharedInventoryId, {
                workspaceId: wsB.id,
                accountId: 'accB'
            });
            assert.equal(callCount, 2);
            assert.ok(paramsBAfterClearA.some(p => p.name === `Param_WS_B_${TEST_TAG}`));
        } finally {
            baselinkerExport.clearInventoryParametersCache(wsA.id);
            baselinkerExport.clearInventoryParametersCache(wsB.id);
            baselinkerExport.callConnectorApi = origCallConnectorApi;
        }
    });
});
