const test = require('node:test');
const assert = require('node:assert');
const v = require('../validators/index.js');

test('Test korupcji kodowania list bezpieczeństwa', async (t) => {
    
    await t.test('Wykrywa frazy medyczne z polskimi znakami', () => {
        const text = 'Nasz wspaniały produkt leczy łuszczycę na zawsze.';
        const hits = v.scan_medical_claims_lexical(text);
        assert.ok(hits.some(h => h.word.toLowerCase() === 'leczy' || h.word.toLowerCase() === 'łuszczycę' || h.word.toLowerCase() === 'leczy łuszczycę' || text.includes(h.word)), 'Nie wykryto frazy: produkt leczy łuszczycę');
        
        // Z uwagi na sposób działania regexa w walidatorze 'likwiduje (łuszczycę|...)' lub 'lecz[yć]*' 
        const hits2 = v.scan_medical_claims_lexical('Najlepsza terapia przeciwzmarszczkowa');
        assert.ok(hits2.some(h => h.word.includes('terapia')), 'Nie wykryto frazy: terapia przeciwzmarszczkowa');
    });

    await t.test('Wykrywa stop-words z polskimi znakami', () => {
        const text = 'To jest nasza gwarancja skuteczności działania!';
        const hits = v.scan_stopwords(text);
        assert.ok(hits.length > 0, 'Nie wykryto frazy: gwarancja skuteczności');
    });

});

test('V1 ean_checksum', async (t) => {
    assert.deepStrictEqual(v.ean_checksum('5900116012346'), { valid: true });
    assert.deepStrictEqual(v.ean_checksum('5900116012345').valid, false);
    assert.deepStrictEqual(v.ean_checksum('59001160').valid, false);
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
    const banned = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
    ];
    let bCount = 0;
    for (const sub of banned) {
        bCount++;
        await t.test(`GATE-1 check ${bCount}: ${sub}`, () => {
            const res = v.gate_ingredients(['aqua', sub, 'glycerin']);
            assert.deepStrictEqual(res.status, 'BANNED_SUBSTANCE_DETECTED');
            assert.deepStrictEqual(res.substance.toLowerCase(), sub.toLowerCase());
        });
    }

    const nonCosmetic = [
        'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
    ];
    let nCount = 0;
    for (const sub of nonCosmetic) {
        nCount++;
        await t.test(`GATE-2 check ${nCount}: ${sub}`, () => {
            const res = v.gate_ingredients(['aqua', sub, 'glycerin']);
            assert.deepStrictEqual(res.status, 'INGREDIENT_NOT_COSMETIC');
            assert.deepStrictEqual(res.substance.toLowerCase(), sub.toLowerCase());
        });
    }

    await t.test('GATE-1 forma etykietowa', async (t) => {
        const inputs = ['Titanium Dioxide [nano]', 'Silver [nano]', 'Hydrated Silica [nano]', 'Silica Silylate [nano]'];
        for (const inp of inputs) {
            const res = v.gate_ingredients(['aqua', inp]);
            assert.deepStrictEqual(res.status, 'BANNED_SUBSTANCE_DETECTED');
        }
    });

    await t.test('GATE-1 brak falszywych trafien', async (t) => {
        const inputs = ['Titanium Dioxide', 'Hydrated Silica', 'Silica'];
        for (const inp of inputs) {
            const res = v.gate_ingredients(['aqua', inp]);
            assert.deepStrictEqual(res.status, 'OK');
        }
    });

    await t.test('Safe ingredients', (t) => {
        assert.deepStrictEqual(v.gate_ingredients(['aqua', 'glycerin']), { status: 'OK' });
        assert.deepStrictEqual(v.gate_ingredients(null).status, 'OK');
        assert.deepStrictEqual(v.gate_ingredients([]).status, 'OK');
    });
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
