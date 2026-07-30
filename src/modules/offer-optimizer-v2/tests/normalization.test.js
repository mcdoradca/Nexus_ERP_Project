const test = require('node:test');
const assert = require('node:assert');
const { normalizeIngredientName, extractIngredientsFromChunk } = require('../normalization');

test('normalizeIngredientName - powinno normalizować nazwy', (t) => {
    const cases = [
        { input: 'Benzoyl Peroxide', expected: 'benzoyl peroxide' },
        { input: 'Salicylic   Acid', expected: 'salicylic acid' },
        { input: 'Nadtlenek benzoilu (Benzoyl)', expected: 'nadtlenek benzoilu benzoyl' },
        { input: '   Coco-Glucoside  ', expected: 'coco glucoside' },
        { input: 'Sodium Laureth Sulfate (SLES)', expected: 'sodium laureth sulfate sles' }
    ];

    for (const c of cases) {
        assert.strictEqual(normalizeIngredientName(c.input), c.expected);
    }
});

test('extractIngredientsFromChunk - SOT_06', (t) => {
    const chunk = "1. **Antybakteryjne:** `Benzoyl Peroxide` oraz `Salicylic Acid` i `Melaleuca Alternifolia Leaf Oil` (drzewo herbaciane).";
    const res = extractIngredientsFromChunk(chunk, 'SOT_06');
    assert.deepStrictEqual(res, ['benzoyl peroxide', 'salicylic acid', 'melaleuca alternifolia leaf oil']);
});

test('extractIngredientsFromChunk - INCI_DICT', (t) => {
    const chunk = "1. **Benzoyl Peroxide (Nadtlenek benzoilu)** – bezwzględny złoty standard\nOpis...";
    const res = extractIngredientsFromChunk(chunk, 'INCI_DICT');
    assert.deepStrictEqual(res, ['benzoyl peroxide', 'nadtlenek benzoilu']);
});

test('extractIngredientsFromChunk - SOT_10', (t) => {
    const chunk = "Sodium Laureth Sulfate (SLES) / Sodium Lauryl Sulfate (SLS)\nOpis dzialania...";
    const res = extractIngredientsFromChunk(chunk, 'SOT_10');
    assert.deepStrictEqual(res, ['sodium laureth sulfate', 'sles', 'sodium lauryl sulfate', 'sls']);
});
