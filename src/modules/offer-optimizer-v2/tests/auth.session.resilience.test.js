const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const jwt = require('jsonwebtoken');

const authService = require('../../auth/auth.service');
const authController = require('../../auth/auth.controller');
const { createAuthenticateToken } = require('../../../middlewares/auth.middleware');

const TEST_SECRET = 'nexus-unit-test-jwt-secret-key-32bytes';

function createMockRes() {
    const headers = {};
    const res = {
        statusCode: 200,
        body: null,
        headersSent: false,
        headers,
        setHeader(name, value) {
            headers[String(name).toLowerCase()] = value;
        },
        getHeader(name) {
            return headers[String(name).toLowerCase()];
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            this.headersSent = true;
            return this;
        },
        sendStatus(code) {
            this.statusCode = code;
            this.headersSent = true;
            return this;
        }
    };
    return res;
}

test('ADR-0207: auth.service + auth.controller — wystawianie i odświeżanie tokena sesji JWT', async () => {
    const prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    try {
        const sampleUser = {
            id: 'user-1',
            name: 'Anna Tester',
            role: 'ADMIN',
            group: 'ZARZĄD',
            department: 'ECOMMERCE',
            color: 'bg-indigo-500'
        };

        const issued = authService.issueUserToken(sampleUser);
        const decoded = jwt.verify(issued, TEST_SECRET);
        assert.equal(decoded.id, 'user-1');
        assert.equal(decoded.role, 'ADMIN');
        assert.equal(decoded.department, 'ECOMMERCE');

        const refreshRes = createMockRes();
        await authController.refresh({ user: sampleUser }, refreshRes);
        assert.equal(refreshRes.statusCode, 200);
        assert.ok(typeof refreshRes.body?.token === 'string' && refreshRes.body.token.length > 20);
        assert.equal(refreshRes.body?.user?.id, 'user-1');
        assert.equal(jwt.verify(refreshRes.body.token, TEST_SECRET).id, 'user-1');

        const unauthRes = createMockRes();
        await authController.refresh({}, unauthRes);
        assert.equal(unauthRes.statusCode, 401);
        assert.equal(unauthRes.body?.authScope, 'NEXUS_SESSION');
        assert.equal(unauthRes.body?.code, 'AUTH_SESSION_REQUIRED');
    } finally {
        if (prevSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = prevSecret;
    }
});

test('ADR-0207: auth.middleware — kody błędów NEXUS_SESSION i sliding refresh dla tokena < 12h', async () => {
    const prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
    try {
        const sampleUser = {
            id: 'user-1',
            name: 'Anna Tester',
            role: 'ADMIN',
            group: 'ZARZĄD',
            department: 'ECOMMERCE',
            color: 'bg-indigo-500'
        };
        const mockPrisma = {
            user: {
                findUnique: async ({ where }) => (where.id === 'user-1' ? sampleUser : null)
            }
        };
        const middleware = createAuthenticateToken({
            prismaClient: mockPrisma,
            getSecret: () => TEST_SECRET,
            issueToken: (user) => authService.issueUserToken(user, { secret: TEST_SECRET, expiresIn: '24h' }),
            slidingThresholdSec: 12 * 3600
        });

        // 1. Brak tokena
        const resMissing = createMockRes();
        let nextCalled = false;
        await middleware({ headers: {}, query: {} }, resMissing, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(resMissing.statusCode, 401);
        assert.equal(resMissing.body?.authScope, 'NEXUS_SESSION');
        assert.equal(resMissing.body?.code, 'AUTH_TOKEN_MISSING');
        assert.equal(resMissing.getHeader('x-nexus-auth-error'), 'AUTH_TOKEN_MISSING');

        // 2. Token wygasły
        const expiredToken = jwt.sign({ id: 'user-1' }, TEST_SECRET, { expiresIn: -10 });
        const resExpired = createMockRes();
        await middleware({ headers: { authorization: `Bearer ${expiredToken}` }, query: {} }, resExpired, () => { nextCalled = true; });
        assert.equal(resExpired.statusCode, 401);
        assert.equal(resExpired.body?.authScope, 'NEXUS_SESSION');
        assert.equal(resExpired.body?.code, 'AUTH_TOKEN_EXPIRED');
        assert.equal(resExpired.getHeader('x-nexus-auth-error'), 'AUTH_TOKEN_EXPIRED');

        // 3. Zły podpis JWT
        const badSigToken = jwt.sign({ id: 'user-1' }, 'wrong-secret', { expiresIn: '2h' });
        const resInvalid = createMockRes();
        await middleware({ headers: { authorization: `Bearer ${badSigToken}` }, query: {} }, resInvalid, () => { nextCalled = true; });
        assert.equal(resInvalid.statusCode, 401);
        assert.equal(resInvalid.body?.code, 'AUTH_TOKEN_INVALID');
        assert.equal(resInvalid.getHeader('x-nexus-auth-error'), 'AUTH_TOKEN_INVALID');

        // 4. Użytkownik nie istnieje w DB
        const ghostToken = jwt.sign({ id: 'deleted-user' }, TEST_SECRET, { expiresIn: '2h' });
        const resGhost = createMockRes();
        await middleware({ headers: { authorization: `Bearer ${ghostToken}` }, query: {} }, resGhost, () => { nextCalled = true; });
        assert.equal(resGhost.statusCode, 401);
        assert.equal(resGhost.body?.code, 'AUTH_USER_NOT_FOUND');

        // 5. Sliding refresh: zostało 2h (< 12h) -> przechodzi i dostaje nagłówek X-Nexus-Refreshed-Token
        const agingToken = jwt.sign({ id: 'user-1' }, TEST_SECRET, { expiresIn: '2h' });
        const agingDecoded = jwt.decode(agingToken);
        const reqAging = { headers: { authorization: `Bearer ${agingToken}` }, query: {} };
        const resAging = createMockRes();
        let agingNext = false;
        await middleware(reqAging, resAging, () => { agingNext = true; });
        assert.equal(agingNext, true);
        assert.equal(reqAging.user.id, 'user-1');
        const refreshedHdr = resAging.getHeader('x-nexus-refreshed-token');
        assert.ok(typeof refreshedHdr === 'string' && refreshedHdr.length > 20);
        const refreshedDecoded = jwt.verify(refreshedHdr, TEST_SECRET);
        assert.ok(refreshedDecoded.exp > agingDecoded.exp, 'Nowy token z sliding refresh ma późniejsze wygaśnięcie');

        // 6. Świeży token (24h > 12h) -> brak niepotrzebnej rotacji
        const freshToken = jwt.sign({ id: 'user-1' }, TEST_SECRET, { expiresIn: '24h' });
        const resFresh = createMockRes();
        let freshNext = false;
        await middleware({ headers: { authorization: `Bearer ${freshToken}` }, query: {} }, resFresh, () => { freshNext = true; });
        assert.equal(freshNext, true);
        assert.equal(resFresh.getHeader('x-nexus-refreshed-token'), undefined);
    } finally {
        if (prevSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = prevSecret;
    }
});

test('ADR-0207: frontend authSession.js — izolacja zakresu 401 i proaktywne odświeżanie JWT', async () => {
    const moduleUrl = pathToFileURL(
        path.resolve(__dirname, '../../../../frontend/src/utils/authSession.js')
    ).href;
    const authSession = await import(moduleUrl);

    // 1. Prawdziwe 401 sesji ERP muszą wyzwolić wylogowanie
    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/products' },
        response: { status: 401, data: { authScope: 'NEXUS_SESSION', code: 'AUTH_TOKEN_EXPIRED', error: 'Sesja wygasła' }, headers: {} }
    }), true);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/chat/unread' },
        response: { status: 401, data: {}, headers: { 'x-nexus-auth-error': 'AUTH_TOKEN_INVALID' } }
    }), true);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/tasks' },
        response: { status: 401, data: { error: 'Nieprawidłowy token' }, headers: {} }
    }), true);

    // 2. Błędy 401 z zewnętrznych integracji (Allegro / Von Halsky) oraz login NIE wylogowują z ERP
    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/offer-optimizer/validate-allegro-params-export' },
        response: { status: 401, data: { authScope: 'EXTERNAL_INTEGRATION', code: 'ALLEGRO_USER_AUTH_REQUIRED', error: 'Brak autoryzacji konta Allegro' }, headers: {} }
    }), false);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/offer-optimizer/allegro-offers/search' },
        response: { status: 401, data: { error: 'Brak autoryzacji konta sprzedawcy Allegro' }, headers: {} }
    }), false);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/vonhalsky/offers/search' },
        response: { status: 401, data: { error: 'Token Von Halsky wygasł' }, headers: {} }
    }), false);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/auth/login' },
        response: { status: 401, data: { error: 'Nieprawidłowe dane logowania' }, headers: {} }
    }), false);

    assert.equal(authSession.isNexusSessionAuthError({
        config: { url: '/api/products' },
        response: { status: 500, data: { error: 'Server error' }, headers: {} }
    }), false);

    // 3. Sprawdzanie progu odświeżania JWT (< 4h)
    const nowSec = Math.floor(Date.now() / 1000);
    const tok2h = jwt.sign({ id: 'u1', exp: nowSec + (2 * 3600) }, TEST_SECRET);
    const tok10h = jwt.sign({ id: 'u1', exp: nowSec + (10 * 3600) }, TEST_SECRET);
    const tokExpired = jwt.sign({ id: 'u1', exp: nowSec - 30 }, TEST_SECRET);

    assert.equal(authSession.shouldProactivelyRefreshToken(tok2h, nowSec * 1000), true);
    assert.equal(authSession.shouldProactivelyRefreshToken(tok10h, nowSec * 1000), false);
    assert.equal(authSession.shouldProactivelyRefreshToken(tokExpired, nowSec * 1000), false);
    assert.equal(authSession.isTokenAlreadyExpired(tokExpired, nowSec * 1000), true);
    assert.equal(authSession.isTokenAlreadyExpired(tok2h, nowSec * 1000), false);

    // 4. Priorytet aps_token nad legacy token
    const mockStorage = {
        getItem: (k) => (k === 'aps_token' ? 'active-aps-jwt' : (k === 'token' ? 'stale-legacy-jwt' : null))
    };
    assert.equal(authSession.getActiveAuthToken(mockStorage), 'active-aps-jwt');
});
