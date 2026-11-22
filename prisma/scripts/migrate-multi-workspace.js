const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const { PrismaClient } = require('@prisma/client');
const {
    encryptSecretWithAad,
    decryptSecret,
    buildIntegrationAad
} = require('../../src/utils/secretVault');

const prisma = new PrismaClient();

async function runMigration() {
    console.log('[MultiWorkspace Migration] Rozpoczynam bezstratną migrację schematu i sekretów...');

    await prisma.$transaction(async (tx) => {
        // 1. Tworzenie nowych tabel Workspace, IntegrationAccount, SecurityAuditLog (idempotentnie)
        await tx.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Workspace" (
                "id" TEXT NOT NULL,
                "slug" TEXT NOT NULL,
                "name" TEXT NOT NULL,
                "badgeColor" TEXT NOT NULL DEFAULT '#4f46e5',
                "isDefault" BOOLEAN NOT NULL DEFAULT false,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "settings" JSONB DEFAULT '{}',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
            );
        `);
        await tx.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_slug_key" ON "Workspace"("slug");
        `);

        await tx.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "IntegrationAccount" (
                "id" TEXT NOT NULL,
                "workspaceId" TEXT NOT NULL,
                "provider" TEXT NOT NULL,
                "label" TEXT NOT NULL,
                "externalAccountId" TEXT,
                "environment" TEXT NOT NULL DEFAULT 'production',
                "isDefault" BOOLEAN NOT NULL DEFAULT false,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "credentialsEnc" TEXT NOT NULL,
                "metadata" JSONB DEFAULT '{}',
                "lastVerifiedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
            );
        `);
        await tx.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "IntegrationAccount_workspaceId_provider_idx" ON "IntegrationAccount"("workspaceId", "provider");
        `);
        await tx.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "IntegrationAccount_workspaceId_provider_isDefault_idx" ON "IntegrationAccount"("workspaceId", "provider", "isDefault");
        `);
        await tx.$executeRawUnsafe(`
            DO $$ BEGIN
                ALTER TABLE "IntegrationAccount"
                ADD CONSTRAINT "IntegrationAccount_workspaceId_fkey"
                FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);

        await tx.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "SecurityAuditLog" (
                "id" TEXT NOT NULL,
                "workspaceId" TEXT,
                "userId" TEXT,
                "action" TEXT NOT NULL,
                "provider" TEXT,
                "integrationAccountId" TEXT,
                "entityId" TEXT,
                "status" TEXT NOT NULL DEFAULT 'SUCCESS',
                "details" JSONB,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
            );
        `);
        await tx.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "SecurityAuditLog_workspaceId_createdAt_idx" ON "SecurityAuditLog"("workspaceId", "createdAt");
        `);
        await tx.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "SecurityAuditLog_action_createdAt_idx" ON "SecurityAuditLog"("action", "createdAt");
        `);
        await tx.$executeRawUnsafe(`
            DO $$ BEGIN
                ALTER TABLE "SecurityAuditLog"
                ADD CONSTRAINT "SecurityAuditLog_workspaceId_fkey"
                FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);

        // 2. Zapewnienie domyślnego klienta (Workspace)
        const existingWorkspaces = await tx.$queryRawUnsafe(`SELECT "id", "slug" FROM "Workspace" WHERE "isDefault" = true OR "slug" = 'default' LIMIT 1`);
        let defaultWsId = existingWorkspaces[0]?.id;
        if (!defaultWsId) {
            defaultWsId = crypto.randomUUID();
            await tx.$executeRawUnsafe(
                `INSERT INTO "Workspace" ("id", "slug", "name", "badgeColor", "isDefault", "isActive", "updatedAt")
                 VALUES ($1, 'default', 'Domyślny Klient', '#4f46e5', true, true, CURRENT_TIMESTAMP)`,
                defaultWsId
            );
        }
        console.log(`[MultiWorkspace Migration] Domyślny Workspace ID: ${defaultWsId}`);

        // 3. Dodanie kolumn workspaceId (najpierw nullable) + backfill istniejących rekordów
        for (const table of ['Product', 'CustomerRiskProfile', 'ReturnRecord', 'AgentMetric', 'AgentQueue']) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;`);
            await tx.$executeRawUnsafe(`UPDATE "${table}" SET "workspaceId" = $1 WHERE "workspaceId" IS NULL;`, defaultWsId);
        }

        // 4. Wymuszenie NOT NULL na głównych tabelach domenowych
        for (const table of ['Product', 'CustomerRiskProfile', 'ReturnRecord']) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "workspaceId" SET NOT NULL;`);
        }

        // 5. Przebudowa starych unikalnych indeksów globalnych na złożone per-workspace
        await tx.$executeRawUnsafe(`ALTER TABLE "ReturnRecord" DROP CONSTRAINT IF EXISTS "ReturnRecord_customerLogin_fkey";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "Product_ean_key";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "Product_sku_key";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "Product_subiektId_key";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "Product_baselinkerId_key";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "CustomerRiskProfile_allegroLogin_key";`);
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS "ReturnRecord_baselinkerId_key";`);

        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_ean_key" ON "Product"("workspaceId", "ean");`);
        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_sku_key" ON "Product"("workspaceId", "sku");`);
        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_subiektId_key" ON "Product"("workspaceId", "subiektId");`);
        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_baselinkerId_key" ON "Product"("workspaceId", "baselinkerId");`);
        await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_workspaceId_idx" ON "Product"("workspaceId");`);

        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRiskProfile_workspaceId_allegroLogin_key" ON "CustomerRiskProfile"("workspaceId", "allegroLogin");`);
        await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerRiskProfile_workspaceId_idx" ON "CustomerRiskProfile"("workspaceId");`);

        await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ReturnRecord_workspaceId_baselinkerId_key" ON "ReturnRecord"("workspaceId", "baselinkerId");`);
        await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ReturnRecord_workspaceId_idx" ON "ReturnRecord"("workspaceId");`);

        await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentMetric_workspaceId_createdAt_idx" ON "AgentMetric"("workspaceId", "createdAt");`);
        await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentQueue_workspaceId_status_idx" ON "AgentQueue"("workspaceId", "status");`);

        // 6. Klucze obce do Workspace oraz złożony FK ReturnRecord -> CustomerRiskProfile
        const fkStatements = [
            `ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
            `ALTER TABLE "CustomerRiskProfile" ADD CONSTRAINT "CustomerRiskProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
            `ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;`,
            `ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_workspaceId_customerLogin_fkey" FOREIGN KEY ("workspaceId", "customerLogin") REFERENCES "CustomerRiskProfile"("workspaceId", "allegroLogin") ON DELETE RESTRICT ON UPDATE CASCADE;`,
            `ALTER TABLE "AgentMetric" ADD CONSTRAINT "AgentMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
            `ALTER TABLE "AgentQueue" ADD CONSTRAINT "AgentQueue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
        ];
        for (const stmt of fkStatements) {
            await tx.$executeRawUnsafe(`DO $$ BEGIN ${stmt} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        }

        // 7. Bezstratna migracja istniejących sekretów z SystemSetting do IntegrationAccount (bez kasowania SystemSetting)
        const settingRows = await tx.$queryRawUnsafe(`SELECT "key", "value", "updatedAt" FROM "SystemSetting" WHERE "key" IN ('BASELINKER_TOKEN', 'ALLEGRO_ACCOUNTS_VAULT', 'VONHALSKY_CONFIG_VAULT')`);
        const settingsMap = Object.fromEntries(settingRows.map(r => [r.key, r]));

        // 7A. BaseLinker
        const existingBl = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "IntegrationAccount" WHERE "workspaceId" = $1 AND "provider" = 'BASELINKER'`, defaultWsId);
        if ((existingBl[0]?.cnt || 0) === 0 && settingsMap['BASELINKER_TOKEN']?.value) {
            try {
                const plainBl = decryptSecret(settingsMap['BASELINKER_TOKEN'].value);
                if (plainBl && plainBl.trim().length >= 5) {
                    const accId = crypto.randomUUID();
                    const enc = encryptSecretWithAad(JSON.stringify({ token: plainBl.trim() }), buildIntegrationAad(defaultWsId, 'BASELINKER', accId));
                    await tx.$executeRawUnsafe(
                        `INSERT INTO "IntegrationAccount" ("id", "workspaceId", "provider", "label", "environment", "isDefault", "isActive", "credentialsEnc", "metadata", "updatedAt")
                         VALUES ($1, $2, 'BASELINKER', 'BaseLinker Domyślny', 'production', true, true, $3, $4::jsonb, CURRENT_TIMESTAMP)`,
                        accId, defaultWsId, enc, JSON.stringify({ migratedFrom: 'SystemSetting.BASELINKER_TOKEN' })
                    );
                    console.log('[MultiWorkspace Migration] Zmigrowano token BASELINKER_TOKEN do IntegrationAccount.');
                }
            } catch (e) {
                console.warn(`[MultiWorkspace Migration] Ostrzeżenie migracji BASELINKER_TOKEN: ${e.message}`);
            }
        }

        // 7B. Allegro Accounts Vault
        const existingAllegro = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "IntegrationAccount" WHERE "workspaceId" = $1 AND "provider" = 'ALLEGRO'`, defaultWsId);
        if ((existingAllegro[0]?.cnt || 0) === 0 && settingsMap['ALLEGRO_ACCOUNTS_VAULT']?.value) {
            try {
                const plainVault = decryptSecret(settingsMap['ALLEGRO_ACCOUNTS_VAULT'].value);
                const parsedVault = JSON.parse(plainVault || '{}');
                const accountsObj = parsedVault?.accounts || {};
                const defExternalId = parsedVault?.defaultAccountId || null;

                for (const [extId, acc] of Object.entries(accountsObj)) {
                    if (!acc || typeof acc !== 'object') continue;
                    const accUuid = crypto.randomUUID();
                    const credPayload = {
                        accessToken: acc.accessToken || null,
                        refreshToken: acc.refreshToken || null,
                        expiresAt: acc.expiresAt || 0,
                        scopes: Array.isArray(acc.scopes) ? acc.scopes : [],
                        customClientId: acc.customClientId || null,
                        customClientSecret: acc.customClientSecret || null
                    };
                    const metaPayload = {
                        login: acc.login || null,
                        email: acc.email || null,
                        companyName: acc.companyName || null,
                        migratedFrom: 'SystemSetting.ALLEGRO_ACCOUNTS_VAULT'
                    };
                    const isDef = defExternalId ? String(extId) === String(defExternalId) : Object.keys(accountsObj)[0] === extId;
                    const enc = encryptSecretWithAad(JSON.stringify(credPayload), buildIntegrationAad(defaultWsId, 'ALLEGRO', accUuid));
                    await tx.$executeRawUnsafe(
                        `INSERT INTO "IntegrationAccount" ("id", "workspaceId", "provider", "label", "externalAccountId", "environment", "isDefault", "isActive", "credentialsEnc", "metadata", "updatedAt")
                         VALUES ($1, $2, 'ALLEGRO', $3, $4, 'production', $5, true, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
                        accUuid,
                        defaultWsId,
                        acc.label || `Konto #${extId}`,
                        String(acc.accountId || extId),
                        Boolean(isDef),
                        enc,
                        JSON.stringify(metaPayload)
                    );
                }
                console.log(`[MultiWorkspace Migration] Zmigrowano ${Object.keys(accountsObj).length} kont(a) Allegro do IntegrationAccount.`);
            } catch (e) {
                console.warn(`[MultiWorkspace Migration] Ostrzeżenie migracji ALLEGRO_ACCOUNTS_VAULT: ${e.message}`);
            }
        }

        // 7C. Von Halsky Config Vault
        const existingVh = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "IntegrationAccount" WHERE "workspaceId" = $1 AND "provider" = 'VONHALSKY'`, defaultWsId);
        if ((existingVh[0]?.cnt || 0) === 0 && settingsMap['VONHALSKY_CONFIG_VAULT']?.value) {
            try {
                const parsedVh = JSON.parse(settingsMap['VONHALSKY_CONFIG_VAULT'].value || '{}');
                const plainSecret = parsedVh.clientSecretEnc ? decryptSecret(parsedVh.clientSecretEnc) : '';
                if (parsedVh.clientId || plainSecret || parsedVh.defaultReturnPolicy || parsedVh.defaultManufacturerEmail) {
                    const vhUuid = crypto.randomUUID();
                    const credPayload = {
                        clientId: parsedVh.clientId || '',
                        clientSecret: plainSecret || ''
                    };
                    const metaPayload = {
                        apiBaseUrl: parsedVh.apiBaseUrl || null,
                        tokenUrl: parsedVh.tokenUrl || null,
                        organizationId: parsedVh.organizationId || '',
                        organizationName: parsedVh.organizationName || '',
                        scope: parsedVh.scope || null,
                        defaultDaysToShip: parsedVh.defaultDaysToShip ?? 1,
                        defaultDescriptionFormat: parsedVh.defaultDescriptionFormat || 'html',
                        defaultManufacturerEmail: parsedVh.defaultManufacturerEmail || '',
                        defaultManufacturerPhone: parsedVh.defaultManufacturerPhone || '',
                        defaultReturnPolicy: parsedVh.defaultReturnPolicy || '',
                        defaultComplaintPolicy: parsedVh.defaultComplaintPolicy || '',
                        migratedFrom: 'SystemSetting.VONHALSKY_CONFIG_VAULT'
                    };
                    const enc = encryptSecretWithAad(JSON.stringify(credPayload), buildIntegrationAad(defaultWsId, 'VONHALSKY', vhUuid));
                    await tx.$executeRawUnsafe(
                        `INSERT INTO "IntegrationAccount" ("id", "workspaceId", "provider", "label", "externalAccountId", "environment", "isDefault", "isActive", "credentialsEnc", "metadata", "updatedAt")
                         VALUES ($1, $2, 'VONHALSKY', 'InPost Von Halsky Domyślny', $3, $4, true, true, $5, $6::jsonb, CURRENT_TIMESTAMP)`,
                        vhUuid,
                        defaultWsId,
                        parsedVh.organizationId || null,
                        parsedVh.environment || 'production',
                        enc,
                        JSON.stringify(metaPayload)
                    );
                    console.log('[MultiWorkspace Migration] Zmigrowano konfigurację VONHALSKY_CONFIG_VAULT do IntegrationAccount.');
                }
            } catch (e) {
                console.warn(`[MultiWorkspace Migration] Ostrzeżenie migracji VONHALSKY_CONFIG_VAULT: ${e.message}`);
            }
        }
    }, { maxWait: 10000, timeout: 60000 });

    const summary = {
        workspaces: await prisma.$queryRawUnsafe(`SELECT "id", "slug", "name", "isDefault" FROM "Workspace"`),
        integrations: await prisma.$queryRawUnsafe(`SELECT "id", "workspaceId", "provider", "label", "externalAccountId", "isDefault" FROM "IntegrationAccount"`),
        counts: {
            products: await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "Product" WHERE "workspaceId" IS NOT NULL`),
            metrics: await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "AgentMetric" WHERE "workspaceId" IS NOT NULL`),
            queue: await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS cnt FROM "AgentQueue" WHERE "workspaceId" IS NOT NULL`)
        }
    };
    console.log('[MultiWorkspace Migration] Zakończono pomyślnie:', JSON.stringify(summary, null, 2));
}

runMigration()
    .catch((err) => {
        console.error('[MultiWorkspace Migration] BŁĄD KRYTYCZNY:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
