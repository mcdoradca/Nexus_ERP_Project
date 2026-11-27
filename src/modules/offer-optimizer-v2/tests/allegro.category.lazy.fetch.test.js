const test = require('node:test');
const assert = require('node:assert/strict');
const { getCategoryParametersFull } = require('../../offer-optimizer/allegro.service');

test('ADR-0204: getCategoryParametersFull — lazy-fetch brakującej kategorii (260130), cache hit, fallback i błąd 404', async () => {
    const dbStore = new Map();
    const apiCalls = [];

    const mockPrisma = {
        marketplaceCategory: {
            findUnique: async ({ where }) => dbStore.get(where.id) || null,
            upsert: async ({ where, update, create }) => {
                const existing = dbStore.get(where.id);
                const next = existing
                    ? { ...existing, ...update }
                    : { ...create };
                dbStore.set(where.id, next);
                return next;
            }
        }
    };

    const mockApiClient = {
        get: async (url) => {
            apiCalls.push(url);
            if (url.endsWith('/sale/categories/260130/parameters')) {
                return {
                    data: {
                        parameters: [
                            { id: '11323', name: 'Stan', type: 'dictionary', required: true },
                            { id: '224234', name: 'Pojemność', type: 'float', unit: 'l', required: true }
                        ]
                    }
                };
            }
            if (url.endsWith('/sale/categories/260130')) {
                return { data: { id: '260130', name: 'Odplamiacze' } };
            }
            if (url.includes('/999999999')) {
                const err = new Error('Category not found');
                err.response = { status: 404, data: { errors: [{ code: 'NotFoundException' }] } };
                throw err;
            }
            throw new Error(`Unexpected URL: ${url}`);
        }
    };

    const mockGetToken = async () => 'mock-allegro-token';

    // 1. Cache miss dla 260130 -> lazy-fetch z Allegro API i zapis do cache
    const firstRes = await getCategoryParametersFull('260130', {
        workspaceId: 'default',
        injectedPrisma: mockPrisma,
        injectedApiClient: mockApiClient,
        injectedGetToken: mockGetToken
    });
    assert.equal(firstRes.id, '260130');
    assert.equal(firstRes.name, 'Odplamiacze');
    assert.equal(firstRes.parameters.length, 2);
    assert.equal(firstRes.refreshed, true);
    assert.equal(apiCalls.length, 2);
    assert.equal(dbStore.get('260130')?.name, 'Odplamiacze');

    // 2. Kolejne wywołanie (forceRefresh: false) -> trafienie w cache bez wywołania HTTP
    apiCalls.length = 0;
    const cachedRes = await getCategoryParametersFull('260130', {
        workspaceId: 'default',
        injectedPrisma: mockPrisma,
        injectedApiClient: mockApiClient,
        injectedGetToken: mockGetToken
    });
    assert.equal(cachedRes.id, '260130');
    assert.equal(cachedRes.refreshed, false);
    assert.equal(cachedRes.parameters.length, 2);
    assert.equal(apiCalls.length, 0);

    // 3. forceRefresh: true przy chwilowej awarii Allegro API -> bezpieczny fallback do cache
    const failingApiClient = {
        get: async () => {
            const err = new Error('Allegro upstream timeout');
            err.response = { status: 503 };
            throw err;
        }
    };
    const staleFallbackRes = await getCategoryParametersFull('260130', {
        forceRefresh: true,
        workspaceId: 'default',
        injectedPrisma: mockPrisma,
        injectedApiClient: failingApiClient,
        injectedGetToken: mockGetToken
    });
    assert.equal(staleFallbackRes.id, '260130');
    assert.equal(staleFallbackRes.name, 'Odplamiacze');
    assert.equal(staleFallbackRes.staleFallback, true);
    assert.equal(staleFallbackRes.refreshed, false);
    assert.equal(staleFallbackRes.parameters.length, 2);

    // 4. Nieistniejąca kategoria przy braku cache -> zachowanie statusu 404
    await assert.rejects(
        () => getCategoryParametersFull('999999999', {
            workspaceId: 'default',
            injectedPrisma: mockPrisma,
            injectedApiClient: mockApiClient,
            injectedGetToken: mockGetToken
        }),
        (err) => err?.response?.status === 404
    );
});
