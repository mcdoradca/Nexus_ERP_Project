const test = require('node:test');
const assert = require('node:assert');
const knowledgeService = require('../knowledge.rag.service');
const { scan_medical_claims_lexical, gate_ingredients } = require('../validators/index');

test('Test wycieku GATE-1 i GATE-2 do indeksu i walidacji', async (t) => {
    const gate1 = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
    ];
    const gate2 = [
        'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
    ];
    
    const allGates = [...gate1, ...gate2];
    
    for (const substance of allGates) {
        // Sprawdzenie czy RAG zablokował wyciek:
        const ragResult = await knowledgeService.getKnowledgeForIngredients([substance], { sotModules: ['INCI_DICT', 'SOT_06', 'SOT_10'] });
        assert.ok(ragResult.unknownIngredients.includes(substance), `RAG zwrócił wiedzę dla zakazanej substancji: ${substance}`);
        
        // Sprawdzenie czy validator V8 blokuje
        const v8Result = gate_ingredients([substance]);
        assert.notStrictEqual(v8Result.status, 'OK', `V8 przepuścił zakazaną substancję: ${substance}`);
    }
});

test('Test uszczelnienia bramek na luki interpunkcyjne', (t) => {
    const testCases = [
        { name: '(a) kropka na końcu', input: ['Glycerin', 'Hydroquinone.'], expectedNotOk: true },
        { name: '(b) w nawiasie', input: ['Glycerin', 'Titanium Dioxide (nano)'], expectedNotOk: true },
        { name: '(c) rozbita spacja', input: ['Glycerin', 'Hydro quinone'], expectedNotOk: true },
        { name: '(d) ukośnik w sąsiedztwie', input: ['Coco-Caprylate/Caprate', 'Hydroquinone'], expectedNotOk: true },
        { name: 'Trimay 1', input: ['PEG-60 Hy drogenated Castor Oil'], expectedNotOk: false },
        { name: 'Trimay 2', input: ['Frag rance'], expectedNotOk: false },
        { name: 'Trimay 3', input: ['Calcium Lacta te'], expectedNotOk: false },
        // Podmiana z Kroku 3 - Trimay podmienione na rdzenie zakazane
        { name: 'Trimay 1 ZAKAZANY (Tretinoin)', input: ['PEG-60 Tre tinoin Castor Oil'], expectedNotOk: true },
        { name: 'Trimay 2 ZAKAZANY (Erythromycin)', input: ['Erythro mycin'], expectedNotOk: true },
        { name: 'Trimay 3 ZAKAZANY (Clindamycin)', input: ['Calcium Clindamy cin'], expectedNotOk: true }
    ];
    
    for (const tc of testCases) {
        const res = gate_ingredients(tc.input);
        if (tc.expectedNotOk) {
            assert.notStrictEqual(res.status, 'OK', `Bramka przepuściła zakazany: ${tc.name} -> status to ${res.status}`);
        } else {
            assert.strictEqual(res.status, 'OK', `Bramka zablokowała czysty skład: ${tc.name} -> status to ${res.status}`);
        }
    }
});
