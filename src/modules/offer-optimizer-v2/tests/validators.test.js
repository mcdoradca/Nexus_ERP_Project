const test = require('node:test');
const assert = require('node:assert');
const v = require('../validators/index.js');

test('V1 ean_checksum', async (t) => {
    // 5900116012345 (last digit is 6 if valid GS1)
    // calculations: 
    // 590011601234 -> reverse -> 4,3,2,1,0,6,1,1,0,0,9,5
    // 4*3 + 3*1 + 2*3 + 1*1 + 0*3 + 6*1 + 1*3 + 1*1 + 0*3 + 0*1 + 9*3 + 5*1 = 12+3+6+1+0+6+3+1+0+0+27+5 = 64
    // 10 - (64%10) = 6 -> check digit is 6.
    assert.deepStrictEqual(v.ean_checksum('5900116012346'), { valid: true });
    assert.deepStrictEqual(v.ean_checksum('5900116012345').valid, false);
    assert.deepStrictEqual(v.ean_checksum('59001160').valid, false); // Wrong EAN-8 checksum
    // EAN-8 example: 73513537 (random). Let's use 12345670 for check. 1234567: 7*3+6*1+5*3+4*1+3*3+2*1+1*3 = 21+6+15+4+9+2+3=60. Check = 0.
    assert.deepStrictEqual(v.ean_checksum('12345670'), { valid: true });
    assert.deepStrictEqual(v.ean_checksum(null).valid, false);
});

test('V2 route_chemical', async (t) => {
    assert.deepStrictEqual(v.route_chemical({ category: 'Kosmetyki' }), { is_chemical: false, reasons: [] });
    assert.deepStrictEqual(v.route_chemical({ category: 'Chemia domowa' }).is_chemical, true);
    assert.deepStrictEqual(v.route_chemical({ sds_required: true }).is_chemical, true);
    assert.deepStrictEqual(v.route_chemical(null).is_chemical, false);
});

test('V3 scan_stopwords', async (t) => {
    assert.strictEqual(v.scan_stopwords('To jest świetny produkt.').length, 0);
    assert.strictEqual(v.scan_stopwords('Kup teraz, promocja!').length, 1);
    assert.strictEqual(v.scan_stopwords('To jest super produkt.').length, 1);
    assert.strictEqual(v.scan_stopwords('gwarancja najniższej ceny tutaj').length, 1);
    assert.strictEqual(v.scan_stopwords(null).length, 0);
});

test('V4 scan_medical_claims_lexical', async (t) => {
    assert.strictEqual(v.scan_medical_claims_lexical('Krem nawilża i regeneruje naskórek.').length, 0);
    assert.strictEqual(v.scan_medical_claims_lexical('Leczy trądzik i goi rany.').length, 2);
    assert.strictEqual(v.scan_medical_claims_lexical('Krem zapobiega chorobom.').length, 1);
    assert.strictEqual(v.scan_medical_claims_lexical(null).length, 0);
});

test('V5 validate_html_whitelist', async (t) => {
    assert.deepStrictEqual(v.validate_html_whitelist('<h1>Tytuł</h1><p>Tekst <b>pogrubiony</b>.</p>'), { valid: true, errors: [] });
    assert.deepStrictEqual(v.validate_html_whitelist('<h1>Tytuł <br></h1>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<h1><b>Błąd</b></h1>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<p>Tytuł "cytat"</p>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<a href="url">link</a>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist(null).valid, true);
});

test('V6 diff_numeric', async (t) => {
    assert.deepStrictEqual(v.diff_numeric('<p>1.5 ml</p>', { desc: '1.5 ml' }), { valid: true });
    assert.deepStrictEqual(v.diff_numeric('<p>2.0 ml</p>', { desc: '1.5 ml' }).valid, false);
    assert.deepStrictEqual(v.diff_numeric(null, null).valid, true);
});

test('V7 emoji_structure_check', async (t) => {
    assert.deepStrictEqual(v.emoji_structure_check('<h1>🌟 Nagłówek</h1><li>✅ Punkt</li>'), { valid: true, errors: [] });
    assert.deepStrictEqual(v.emoji_structure_check('<h1>🌟 Nagłówek 🔥</h1>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<h1>Brak emoji</h1>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<li>🔴 <b>Problem:</b> test</li><li>🟢 <b>Answer:</b> test</li>').valid, true);
    assert.deepStrictEqual(v.emoji_structure_check('<li>🔴 <b>Problem</b> test</li>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check(null).valid, true);
});

test('V8 gate_ingredients', async (t) => {
    const gate1 = [ 'perboric acid', 'tpo', 'n,n-dimethyl-p-toluidine', '4-mbc', 'bp-2', 'bp-5' ];
    const gate2 = [ 'ketoconazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin' ];
    
    assert.deepStrictEqual(v.gate_ingredients(['aqua', 'glycerin']), { status: 'OK' });
    
    for (const g of gate1) {
        assert.deepStrictEqual(v.gate_ingredients(['aqua', g]).status, 'BANNED_SUBSTANCE_DETECTED');
    }
    for (const g of gate2) {
        assert.deepStrictEqual(v.gate_ingredients(['aqua', g]).status, 'INGREDIENT_NOT_COSMETIC');
    }
    assert.deepStrictEqual(v.gate_ingredients(null).status, 'OK');
});

test('V9 c2pa_check', async (t) => {
    assert.deepStrictEqual(v.c2pa_check('file'), { status: 'C2PA_CHECK_UNAVAILABLE', severity: 'WARNING' });
});

test('V10 freeze_sections', async (t) => {
    const s3 = 's3 data';
    const s5 = 's5 data';
    const s6 = 's6 data';
    const frozen = v.freeze_sections(s3, s5, s6);
    assert.ok(frozen.s3);
    
    assert.deepStrictEqual(v.verify_frozen(s3, s5, s6, frozen), { valid: true });
    assert.deepStrictEqual(v.verify_frozen(s3 + ' ', s5, s6, frozen).valid, false);
    assert.deepStrictEqual(v.verify_frozen(null, null, null, { s3: 'x', s5: 'y', s6: 'z' }).valid, false);
});
