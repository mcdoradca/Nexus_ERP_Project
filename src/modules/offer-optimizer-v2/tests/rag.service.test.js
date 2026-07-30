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

test('Teardown', async (t) => {
    await prisma.$disconnect();
});
