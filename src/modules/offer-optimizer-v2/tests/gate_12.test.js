const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
process.env.TEST_OUT_DIR = path.join(__dirname, 'tmp');
const v = require('../validators/index.js');

const banned = [
    'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
];
let bCount = 0;
for (const sub of banned) {
    bCount++;
    test(`GATE-1 check ${bCount}: ${sub}`, () => {
        const res = v.gate_ingredients(['aqua', sub, 'glycerin']);
        assert.deepStrictEqual(res.status, 'BANNED_SUBSTANCE_DETECTED');
        assert.deepStrictEqual(res.substance.toLowerCase(), sub.toLowerCase());
    });
}

const cosmetics = [
    'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
];
let cCount = 0;
for (const sub of cosmetics) {
    cCount++;
    test(`GATE-2 check ${cCount}: ${sub}`, () => {
        const res = v.gate_ingredients(['aqua', sub, 'glycerin']);
        assert.deepStrictEqual(res.status, 'INGREDIENT_NOT_COSMETIC');
        assert.deepStrictEqual(res.substance.toLowerCase(), sub.toLowerCase());
    });
}

test('GATE-1 forma etykietowa', () => {
    const res2 = v.gate_ingredients(['trimethylbenzoyl diphenylphosphine oxide']);
    assert.deepStrictEqual(res2.status, 'BANNED_SUBSTANCE_DETECTED');
});

test('GATE-1 brak falszywych trafien', () => {
    const res3 = v.gate_ingredients(['aqua', 'glycerin', 'sodium chloride']);
    assert.deepStrictEqual(res3.status, 'OK');
});

test('Safe ingredients', () => {
    const result = v.gate_ingredients(['aqua', 'glycerin', 'parfum']);
    assert.deepStrictEqual(result.status, 'OK');
});
