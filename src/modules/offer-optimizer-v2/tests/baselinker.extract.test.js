const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const extract = require('../baselinker.extract.js');

const loadRaw = (name) => JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + name + '.raw.json', 'utf8'));
const loadTrimmed = (name) => JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + name + '.trimmed.json', 'utf8'));

test('Zadanie 18 - baselinker.extract.js na rzeczywistych danych', async (t) => {
    
    await t.test('1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu', () => {
        const p = loadTrimmed('equilibra_8000137015436');
        const res = extract.extractFromFeatures(p);
        assert.ok(res.inci.value.endsWith('Sodium Dehydroacetate.'), 'Brak kropki na końcu INCI. Zepsuta dosłowność');
        assert.strictEqual(res.inci.matched_key, 'skladniki inci');
    });

    await t.test('2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma', () => {
        const p = loadTrimmed('equilibra_8000137015436');
        const res = extract.extractFromFeatures(p);
        assert.strictEqual(res.mpn.value, null, 'MPN ma być null dla Equilibra zgodnie ze źródłem');
        assert.strictEqual(res.mpn.matched_key, null);
    });

    await t.test('3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania', () => {
        const p = loadTrimmed('trimay_8809822541010');
        const res = extract.extractFromFeatures(p);
        assert.strictEqual(res.mpn.value, '8809822541010');
        assert.strictEqual(res.mpn.matched_key, 'Kod producenta');
    });

    await t.test('4. Equilibra (raw): test odzysku (64KB bug w BaseLinker)', () => {
        const p = loadRaw('equilibra_8000137015436');
        const res = extract.extractFromFeatures(p);
        
        assert.strictEqual(res.truncated, true);
        assert.ok(res.inci.value.endsWith('Sodium Dehydroacetate.'));
        assert.ok(res.inci.value.includes('Prunus Amygdalus Dulcis (Sweet Almond) Oil'));
        assert.strictEqual(res.capacity.matched_key, 'pojemnosc');
        assert.strictEqual(res.usage.matched_key, 'sposob uzycia');
        assert.strictEqual(res.warnings.matched_key, 'uwagi dotyczace bezpieczenstwa');
        assert.strictEqual(res.mpn.value, null);
        assert.strictEqual(res.brand.value, null);
        assert.ok(!res.recovered_keys.includes('kod karty'));
    });

    await t.test('5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera)', () => {
        const p = loadRaw('trimay_8809822541010');
        const res = extract.extractFromFeatures(p);
        assert.strictEqual(res.truncated, false);
        assert.ok(res.inci.value);
        assert.strictEqual(res.inci.matched_key, 'Ingredients / INCI');
    });

    await t.test('6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description', () => {
        const p = loadTrimmed('equilibra_8000137015436');
        const res = extract.extractResponsiblePersonFromDescription(p.text_fields.description);
        assert.ok(res.name);
        assert.ok(res.address_eu.includes('Via Plava'));
    });

    await t.test('7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null', () => {
        const p = loadTrimmed('trimay_8809822541010');
        const res = extract.extractResponsiblePersonFromDescription(p.text_fields.description);
        assert.strictEqual(res.name, null);
    });

});
