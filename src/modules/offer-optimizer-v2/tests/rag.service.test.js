const test = require('node:test');
const assert = require('node:assert');
const ragService = require('../knowledge.rag.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

test('Idempotencja ingestu (dokument nadpisuje samego siebie)', async (t) => {
    const title = 'TEST_DOC_IDEMPOTENCY';
    const text = 'Linia 1\nLinia 2';
    
    // Ingest 1
    const res1 = await ragService.ingestDocument(text, title, { sotModule: 'SOT_01' });
    const count1 = await prisma.knowledgeDocument.count({ where: { title: { startsWith: title + '@' } } });
    
    // Ingest 2
    const res2 = await ragService.ingestDocument(text, title, { sotModule: 'SOT_01' });
    const count2 = await prisma.knowledgeDocument.count({ where: { title: { startsWith: title + '@' } } });
    
    // Tytuł nie powinien się duplikować w wielu wersjach, powinna byc wciaz ta sama liczba chunkow (1 szt)
    assert.strictEqual(count1, 1, 'Po pierwszym ingeście 1 rekord');
    assert.strictEqual(count2, 1, 'Po drugim ingeście wciąż 1 rekord (stare usunięte)');
    
    // Cleanup
    await prisma.knowledgeDocument.deleteMany({ where: { title: { startsWith: title + '@' } } });
});

test('GATE-3 Deterministic Match - getKnowledgeForIngredients', async (t) => {
    // Wymaga wcześniej wgranego ingestu (np. SOT_06 z Benzoyl Peroxide)
    const result = await ragService.getKnowledgeForIngredients(
        ['Benzoyl Peroxide', 'ZmyslonyKwas3000', 'Salicylic Acid', 'Dodecylbenzene Sulfonic Acid'],
        {
            agentId: 'Test',
            sotModules: ['SOT_06', 'SOT_10', 'INCI_DICT']
        }
    );
    
    assert.strictEqual(result.unknownIngredients.includes('ZmyslonyKwas3000'), true, 'Zmyślony składnik trafił do unknown');
    assert.strictEqual(result.unknownIngredients.includes('Benzoyl Peroxide'), false, 'Benzoyl Peroxide nie jest w unknown');
    
    const hasBenzoyl = result.ragBlock.some(b => b.ingredient === 'Benzoyl Peroxide');
    assert.strictEqual(hasBenzoyl, true, 'Benzoyl Peroxide trafia do bloku RAG');
});

test('GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu)', async (t) => {
    // Cybernetic Hyaluronic Acid - podobny napis do kwasu hialuronowego.
    // Z indeksu precyzyjnego powinien byc odrzucony jako UNKNOWN.
    const result = await ragService.getKnowledgeForIngredients(
        ['Cybernetic Hyaluronic Acid'],
        {
            agentId: 'Test',
            sotModules: ['SOT_06', 'SOT_10', 'INCI_DICT']
        }
    );
    
    assert.strictEqual(result.unknownIngredients.includes('Cybernetic Hyaluronic Acid'), true, 'Powinien odrzucić podobnie brzmiący fejk (exact lookup)');
    assert.strictEqual(result.ragBlock.length, 0, 'Brak wyniku RAG dla fejka');
});

test('GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _', async (t) => {
    // Zapytanie o 'Benzoyl%' nie powinno zadziałać jako wildcard
    const result = await ragService.getKnowledgeForIngredients(
        ['Benzoyl%Peroxide', 'Salicylic_Acid'],
        {
            agentId: 'Test',
            sotModules: ['SOT_06', 'SOT_10', 'INCI_DICT']
        }
    );
    
    assert.strictEqual(result.unknownIngredients.includes('Benzoyl%Peroxide'), true, 'Benzoyl%Peroxide powinno trafić do unknown');
    assert.strictEqual(result.unknownIngredients.includes('Salicylic_Acid'), true, 'Salicylic_Acid powinno trafić do unknown');
});

test('Asercje Metadanych - GATE/RULE/entryName', async (t) => {
    // a) każdy z modułów ... ma >=1 chunk typu GATE lub RULE
    const requiredModules = ['SOT_01', 'SOT_02', 'SOT_03', 'SOT_04', 'SOT_06', 'SOT_08', 'SOT_09'];
    for (const mod of requiredModules) {
        const count = await prisma.knowledgeDocument.count({
            where: {
                sotModule: mod,
                chunkType: { in: ['GATE', 'RULE'] }
            }
        });
        assert.ok(count >= 1, `Moduł ${mod} ma >= 1 chunk typu GATE/RULE (znaleziono: ${count})`);
    }

    // b) każdy chunk o chunkType GATE lub RULE ma entryName IS NULL
    const countInvalid = await prisma.knowledgeDocument.count({
        where: {
            chunkType: { in: ['GATE', 'RULE'] },
            entryName: { not: null }
        }
    });
    assert.strictEqual(countInvalid, 0, 'Żaden chunk GATE/RULE nie może mieć entryName');

    // c) żadna substancja z list GATE-1/GATE-2 nie występuje w entryName
    const { extractIngredientsFromChunk } = require('../normalization.js');
    // BannedGates are handled in normalization.js, so if we extract from them it returns empty array.
    // Let's directly check DB.
    const allNames = await prisma.$queryRaw`
      SELECT "entryName" FROM "KnowledgeDocument" WHERE "entryName" IS NOT NULL
    `;
    const joinedNames = allNames.map(r => r.entryName).join('');
    
    const v = require('../validators/index');
    const gate1 = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
    ];
    const gate2 = [
        'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
    ];
    for (const sub of [...gate1, ...gate2]) {
        assert.ok(!joinedNames.includes(`|${sub.toLowerCase()}|`), `W entryName nie może być substancji zabronionej: ${sub}`);
    }
});

test('Teardown', async (t) => {
    await prisma.$disconnect();
});
