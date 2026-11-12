# ADR-0175: BaseLinker Token AES-256-GCM Vault, Pre-Flight Live Verification, Write-Only Settings API & UI Autofill Protection

**Status:** Accepted  
**Date:** 2026-11-12  
**Scope:** Security / Integrations (`src/utils/secretVault.js`, `src/server.js`, `frontend/src/views/AdminPanelView.jsx`, `baselinker.service.js`, `baselinker.export.service.js`, `rma.service.js`, `nexus-bot.service.js`)  
**Triggering Incident:** Existing `SystemSetting.BASELINKER_TOKEN` (`200695...K73C`) was unexpectedly overwritten on `2026-11-10T16:52:00.078Z` with a 10-character string (`1v822x...3vSM`, matching typical browser password autofill), causing `ERROR_BAD_TOKEN`, while raw tokens were previously returned over HTTP to the browser and logged in prefix form in `rma.service.js`.

---

## Decision

1. **Centralized AES-256-GCM Secret Vault & Unified Resolver (`src/utils/secretVault.js`):**
   - Added `encryptSecret` / `decryptSecret` using `aes-256-gcm` (`enc:v1:<iv_b64>:<tag_b64>:<cipher_b64>`) keyed via `SHA-256(BASELINKER_VAULT_KEY || JWT_SECRET)`, preserving backward-compatible reading of legacy unencrypted values while rejecting key mismatches (`VAULT_DECRYPT_FAILED`) without altering DB state.
   - Unified all BaseLinker consumers (`baselinker.service.js`, `baselinker.export.service.js`, `rma.service.js`, `nexus-bot.service.js`, and CRON sync in `src/server.js`) onto `resolveBaseLinkerToken` / `getBaseLinkerToken` (`process.env.BASELINKER_TOKEN` priority -> encrypted `SystemSetting.BASELINKER_TOKEN`).
   - Removed partial token logging (`blToken.substring(0, 8)`) from `rma.service.js`.

2. **Write-Only Settings API & Pre-Flight Verification (`src/server.js`):**
   - `GET /api/settings/:key` never returns plaintext `value` for secret keys (`BASELINKER_TOKEN`, `ALLEGRO_ACCESS_TOKEN`, `ALLEGRO_REFRESH_TOKEN`, `ELEVENLABS_API_KEY`); for `BASELINKER_TOKEN` it returns `{ configured, encrypted, tokenSource, updatedAt, decryptError, audit }` only.
   - Added `POST /api/settings/BASELINKER_TOKEN/verify` (`ADMIN` only) to test the currently active token against `api.baselinker.com` (`getInventories`) without revealing token contents.
   - Hardened `POST /api/settings` for `BASELINKER_TOKEN`:
     1. Rejects short/malformed/autofill inputs (`< 25` chars or whitespace) and runs live `testBaseLinkerToken` (`getInventories`) **before** touching PostgreSQL (`400` on failure, DB preserved intact).
     2. Prevents accidental overwrite of an active, working DB token (`409 Conflict` unless `confirmOverwrite === true`).
     3. Encrypts via `encryptSecret` before upsert and records non-secret metadata in `SystemSetting.BASELINKER_TOKEN_AUDIT` and `logger.info`.

3. **Autofill-Hardened Admin UI (`frontend/src/views/AdminPanelView.jsx`):**
   - Input field `bl_personal_api_token_once` always stays empty (`autoComplete="new-password"`, `data-lpignore="true"`, `data-1p-ignore="true"`, `data-form-type="other"`), displays Vault status + `Testuj połączenie`, and exposes explicit `confirmOverwrite` consent only when replacing a configured DB token.

---

## Verification

- **Unit Tests (`src/modules/offer-optimizer-v2/tests/*.test.js`):** `270/270 PASS` (`0` failed, `0` skipped) including `6/6` in `secret_vault.test.js`.
- **Syntax & Frontend Build:** `node -c` passed on all modified backend files; `npm --prefix frontend run build` (`vite build`) passed cleanly.
- **Live Non-Mutating DB Dry-Run:** Verified `testBaseLinkerToken` rejects 10-character autofill input (`INVALID_TOKEN_FORMAT`, zero HTTP requests) and invalid long token (`ERROR_BAD_TOKEN`), leaving existing DB row `SystemSetting.BASELINKER_TOKEN` (`updatedAt: 2026-11-10T16:52:00.078Z`) untouched (`DB_UNTOUCHED: true`).

