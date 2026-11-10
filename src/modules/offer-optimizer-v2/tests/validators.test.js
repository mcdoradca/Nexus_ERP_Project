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
    assert.strictEqual(v.scan_stopwords('Dziś wielka promocja!').length, 1);
    assert.strictEqual(v.scan_stopwords('Kup teraz, promocja!').length, 2, 'Kup teraz oraz promocja muszą być wykryte');
    assert.strictEqual(v.scan_stopwords('To jest super produkt.').length, 1);
    assert.strictEqual(v.scan_stopwords('gwarancja najniższej ceny tutaj').length, 1);
    assert.strictEqual(v.scan_stopwords('Nasz bestseller oraz nowość!').length, 2, 'Wykrywa bestseller i nowość');
    assert.strictEqual(v.scan_stopwords('Polecamy kupić na Allegro').length, 2, 'Wykrywa polecamy i allegro');
    assert.ok(v.scan_stopwords('Przechowywać w oryginalnym opakowaniu w suchym miejscu.').length > 0, 'Wykrywa zakazane słowo oryginalnym');
    assert.strictEqual(v.scan_stopwords('Przechowywać w szczelnie zamkniętym opakowaniu w suchym miejscu.').length, 0, 'Czysty opis bez zakazanych słów przechodzi');
    assert.strictEqual(v.scan_stopwords('Gwarantujemy 100% oryginalny produkt z Włoch.').length, 3, 'Wykrywa gwarantujemy, 100% i oryginalny');
    assert.strictEqual(v.scan_stopwords(null).length, 0);
});

test('V4 scan_medical_claims_lexical', async (t) => {
    assert.strictEqual(v.scan_medical_claims_lexical('Krem nawilża i regeneruje naskórek.').length, 0);
    assert.strictEqual(v.scan_medical_claims_lexical('Leczy trądzik i goi rany.').length, 2);
    assert.strictEqual(v.scan_medical_claims_lexical('Krem zapobiega chorobom.').length, 1);
    assert.strictEqual(v.scan_medical_claims_lexical(null).length, 0);
});

test('V5 validate_html_whitelist', async (t) => {
    assert.deepStrictEqual(v.validate_html_whitelist('<h1>Tytuł</h1><p>Tekst <strong>pogrubiony</strong>.</p>'), { valid: true, errors: [] });
    assert.deepStrictEqual(v.validate_html_whitelist('<h1>Tytuł <br></h1>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<h1><b>Błąd</b></h1>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<p>Tytuł "cytat"</p>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist('<a href="url">link</a>').valid, false);
    assert.deepStrictEqual(v.validate_html_whitelist(null).valid, true);
});

test('V5b validate_html_whitelist po normalizacji', async (t) => {
    const { normalizeTags } = require('../orchestrator.js');
    const normalized = normalizeTags('<h1>Tytuł</h1><p>Tekst <b>pogrubiony</b>.</p>');
    assert.deepStrictEqual(v.validate_html_whitelist(normalized), { valid: true, errors: [] });
});

test('V6 diff_numeric', async (t) => {
    assert.deepStrictEqual(v.diff_numeric('<p>1.5 ml</p>', { desc: '1.5 ml' }), { valid: true });
    assert.deepStrictEqual(v.diff_numeric('<p>2.0 ml</p>', { desc: '1.5 ml' }).valid, false);
    assert.deepStrictEqual(v.diff_numeric(null, null).valid, true);
});

test('V7 emoji_structure_check', async (t) => {
    assert.deepStrictEqual(v.emoji_structure_check('<h1>⭐ Nagłówek</h1><li>✅ Punkt</li>'), { valid: true, errors: [] });
    assert.deepStrictEqual(v.emoji_structure_check('<h1>⭐ Nagłówek 🔥</h1>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<h1>Brak emoji</h1>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<li>❓ <b>Pytanie:</b> test?</li><li>✔️ <b>Odpowiedź:</b> test</li>').valid, true);
    assert.deepStrictEqual(v.emoji_structure_check('<li>❌ <b>Pytanie:</b> test?</li>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<li>❌ <b>Problem:</b> test</li>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check('<li>❌ <b>Problem</b> test</li>').valid, false);
    assert.deepStrictEqual(v.emoji_structure_check(null).valid, true);
});

test('V12 normalize_aeo_faq_labels', async (t) => {
    await t.test('Problem -> Pytanie, ❌ -> ❓ (b i strong)', () => {
        assert.strictEqual(
            v.normalize_aeo_faq_labels('<li>❌ <strong>Problem:</strong> Czy płyn zostawia smugi?</li>'),
            '<li>❓ <strong>Pytanie:</strong> Czy płyn zostawia smugi?</li>'
        );
        assert.strictEqual(
            v.normalize_aeo_faq_labels('<li>🔴 <b>Problem</b>: Jak myć podłogę bez smug?</li>'),
            '<li>❓ <b>Pytanie:</b> Jak myć podłogę bez smug?</li>'
        );
    });
    await t.test('Rozwiązanie/Answer -> Odpowiedź, 💡/🟢 -> ✔️', () => {
        assert.strictEqual(
            v.normalize_aeo_faq_labels('<li>💡 <b>Rozwiązanie:</b> Tak.</li><li>🟢 <strong>Answer:</strong> Nie.</li>'),
            '<li>✔️ <b>Odpowiedź:</b> Tak.</li><li>✔️ <strong>Odpowiedź:</strong> Nie.</li>'
        );
    });
    await t.test('Komentarz Applied przed emoji oraz wariant <p>', () => {
        assert.strictEqual(
            v.normalize_aeo_faq_labels('<li><!-- Applied: x -->❌ <strong>Problem:</strong> A?</li><p>✔️ <b>Odpowiedź:</b> B</p>'),
            '<li><!-- Applied: x -->❓ <strong>Pytanie:</strong> A?</li><p>✔️ <b>Odpowiedź:</b> B</p>'
        );
    });
    await t.test('Idempotentność i bezpieczne wejście', () => {
        const canon = '<li>❓ <strong>Pytanie:</strong> A?</li><li>✔️ <strong>Odpowiedź:</strong> B</li>';
        assert.strictEqual(v.normalize_aeo_faq_labels(canon), canon);
        assert.strictEqual(v.normalize_aeo_faq_labels(v.normalize_aeo_faq_labels(canon)), canon);
        assert.strictEqual(v.normalize_aeo_faq_labels(null), null);
        assert.strictEqual(v.normalize_aeo_faq_labels(''), '');
        const rawFromA6 = '<h2>❓ Mleczko do czyszczenia – najczęstsze pytania</h2><ul>' +
            '<li>❓ <b>Czy Cif mleczko rysuje powierzchnie?</b></li>' +
            '<li>✔️ <b>Odpowiedź:</b> Nie rysuje szkliwa.</li>' +
            '<li>❓ Jak prawidłowo aplikować mleczko?</li>' +
            '<li>✔️ Nanieś na wilgotną ściereczkę.</li>' +
            '<li>✔️ <b>Pytanie:</b> Na jak długo wystarcza opakowanie?</li>' +
            '<li>✔️ <b>Odpowiedź:</b> Na wiele tygodni.</li>' +
            '<li><b>Czy środek usuwa tłuszcz?</b></li>' +
            '<li>✔️ <b>Odpowiedź:</b> Tak, skutecznie usuwa tłuszcz.</li>' +
            '</ul>';
        const normalized = v.normalize_aeo_faq_labels(rawFromA6);
        const check = v.aeo_faq_check(normalized);
        assert.strictEqual(check.valid, true, 'Po normalizacji wszystkie 4 pary Q/A muszą przejść aeo_faq_check: ' + check.errors.join(', '));
        assert.strictEqual(check.pairs, 4);
    });
});

test('V12 aeo_faq_check', async (t) => {
    const h2 = '<h2>❓ Płyn do podłóg bez smug – najczęstsze pytania</h2>';
    await t.test('Poprawne FAQ SEO/GEO', () => {
        const html = h2 + '<ul><li>❓ <strong>Pytanie:</strong> Jaki płyn do podłóg nie zostawia smug?</li>' +
            '<li>✔️ <strong>Odpowiedź:</strong> <!-- Applied: x -->Płyn X nie zostawia smug dzięki <strong>szybkiemu odparowaniu</strong>.</li>' +
            '<li>❓ <b>Pytanie:</b> Jak myć podłogę, żeby nie zostawały smugi?</li>' +
            '<li>✔️ <b>Odpowiedź:</b> Rozcieńcz 30 ml w 5 l wody.</li></ul>';
        assert.deepStrictEqual(v.aeo_faq_check(html), { valid: true, errors: [], pairs: 2 });
    });
    await t.test('Etykieta Problem jest odrzucana', () => {
        const res = v.aeo_faq_check('<li>❌ <strong>Problem:</strong> Inne płyny zostawiają smugi.</li><li>✔️ <strong>Odpowiedź:</strong> X.</li>');
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('Forbidden label')));
    });
    await t.test('Twierdzenie zamiast pytania jest odrzucane', () => {
        const res = v.aeo_faq_check('<li>❓ <strong>Pytanie:</strong> Inne mydła wysuszają skórę.</li><li>✔️ <strong>Odpowiedź:</strong> X.</li>');
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes("missing '?'")));
    });
    await t.test('Brak pary i zła kolejność', () => {
        const unpaired = v.aeo_faq_check('<li>❓ <strong>Pytanie:</strong> A?</li>');
        assert.strictEqual(unpaired.valid, false);
        assert.ok(unpaired.errors.some(e => e.includes('Unpaired')));
        const order = v.aeo_faq_check('<li>✔️ <strong>Odpowiedź:</strong> B</li><li>❓ <strong>Pytanie:</strong> A?</li>');
        assert.strictEqual(order.valid, false);
        assert.ok(order.errors.some(e => e.includes('Broken Q/A order')));
    });
    await t.test('Pusta odpowiedź i puste wejście', () => {
        const empty = v.aeo_faq_check('<li>❓ <strong>Pytanie:</strong> A?</li><li>✔️ <strong>Odpowiedź:</strong> </li>');
        assert.strictEqual(empty.valid, false);
        assert.ok(empty.errors.some(e => e.includes('Answer 1 is empty')));
        assert.strictEqual(v.aeo_faq_check(null).valid, false);
        assert.strictEqual(v.aeo_faq_check('').valid, false);
    });
});

test('V8 gate_ingredients', async (t) => {
    const banned = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)',
        'butylphenyl methylpropional', 'lilial', 'p-bmhca', '2-(4-tert-butylbenzyl)propionaldehyde'
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

test('V11 validate_eu_responsible_person', () => {
    assert.deepStrictEqual(v.validate_eu_responsible_person({
        name: 'Firma Testowa S.r.l.',
        address_eu: 'ul. Testowa 1, 00-000 Warszawa',
        contact: 'test@example.com'
    }).valid, true);

    // Cross checks and regex
    assert.deepStrictEqual(v.validate_eu_responsible_person({
        name: 'Firma Testowa, test@example.com',
        address_eu: 'ul. Testowa 1',
        contact: 'test@example.com'
    }).valid, false); // name ma '@'
    
    assert.deepStrictEqual(v.validate_eu_responsible_person({
        name: 'Firma Testowa 00-000',
        address_eu: 'ul. Testowa 1',
        contact: 'test@example.com'
    }).valid, false); // name ma kod pocztowy

    assert.deepStrictEqual(v.validate_eu_responsible_person({
        name: 'Firma Testowa',
        address_eu: 'Brak ulicy',
        contact: 'test@example.com'
    }).valid, false); // adres brak cyfry
});

test('V11 validate_eu_responsible_person - puste obiekty', () => {
    assert.deepStrictEqual(v.validate_eu_responsible_person(null).valid, false);
    assert.deepStrictEqual(v.validate_eu_responsible_person({}).valid, false);
});

test('V11 validate_eu_responsible_person - zbyt dlugie pole', () => {
    assert.deepStrictEqual(v.validate_eu_responsible_person({
        name: 'A'.repeat(250),
        address_eu: 'B'.repeat(300),
        contact: 'C'.repeat(300)
    }).valid, false);
});

test('hasBannedLilial detector for reformulations', async (t) => {
    await t.test('Wykrywa warianty Butylphenyl Methylpropional (Lilial)', () => {
        assert.strictEqual(v.hasBannedLilial('Butylphenyl Methylpropional'), true);
        assert.strictEqual(v.hasBannedLilial('BUTYLPHENYL METHYLPROPIONAL'), true);
        assert.strictEqual(v.hasBannedLilial('butylphenyl-methylpropional'), true);
        assert.strictEqual(v.hasBannedLilial('Aqua, Glycerin, Parfum, Butylphenyl Methylpropional, Limonene'), true);
        assert.strictEqual(v.hasBannedLilial('Zawiera Lilial jako alergen zapachowy'), true);
        assert.strictEqual(v.hasBannedLilial('p-bmhca'), true);
        assert.strictEqual(v.hasBannedLilial('p - bmhca'), true);
        assert.strictEqual(v.hasBannedLilial('2-(4-tert-butylbenzyl)propionaldehyde'), true);
    });

    await t.test('Przepuszcza bezpieczne i nowe receptury INCI', () => {
        assert.strictEqual(v.hasBannedLilial('Aqua, Glycerin, Parfum, Limonene, Linalool, Citronellol'), false);
        assert.strictEqual(v.hasBannedLilial('Sodium Laureth Sulfate, Cocamidopropyl Betaine'), false);
        assert.strictEqual(v.hasBannedLilial(''), false);
        assert.strictEqual(v.hasBannedLilial(null), false);
        assert.strictEqual(v.hasBannedLilial(undefined), false);
    });
});

test('V13 validate_section6_compliance - wymogi CLP, P264, zakaz rozszczepiania procedur i tag Allegro', async (t) => {
    await t.test('Wykrywa rozszczepione nagłówki okolicznościowe bez dyspozycji', () => {
        const brokenHtml = `
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze – UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301 – W PRZYPADKU POŁKNIĘCIA:</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P305 – W PRZYPADKU DOSTANIA SIĘ DO OCZU:</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(brokenHtml, { is_chemical: true, has_eye_irritation: true });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('severed incomplete P-code conditional triggers')));
    });

    await t.test('Wykrywa brak członu /GPSR w tagu (Ostrzeżenie CLP: zamiast Ostrzeżenie CLP/GPSR:)', () => {
        const missingGpsrTagHtml = `
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP:</b> Hasło ostrzegawcze – UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P264 – Dokładnie umyć ręce po użyciu.</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P280 – Stosować ochronę oczu.</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(missingGpsrTagHtml, { is_chemical: true, has_eye_irritation: true });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes("Missing '/GPSR' in label tag")));
    });

    await t.test('Wykrywa dwukropek w haśle ostrzegawczym (musi być myślnik)', () => {
        const colonSignalWordHtml = `
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze: UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P264 – Dokładnie umyć ręce po użyciu.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować ochronę oczu.</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(colonSignalWordHtml, { is_chemical: true, has_eye_irritation: true });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('Signal word label must use dash delimiter')));
    });

    await t.test('Wykrywa brak P264 oraz P280 dla H319/H318', () => {
        const missingP264Html = `
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze – UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować ochronę oczu.</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(missingP264Html, { is_chemical: true, has_eye_irritation: true });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('Missing mandatory P264')));
    });

    await t.test('Akceptuje poprawny zestaw CLP zgodny ze standardem Allegro i CLP', () => {
        const correctHtml = `
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze – UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H319 – Działa drażniąco na oczy.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P264 – Dokładnie umyć ręce po użyciu.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować ochronę oczu / ochronę twarzy.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> EUH208 – Zawiera Limonene. Może powodować wystąpienie reakcji alergicznej.</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(correctHtml, { is_chemical: true, has_eye_irritation: true, has_sensitizers: true });
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.errors.length, 0);
    });

    await t.test('Wykrywa brak /GPSR przy tagu <strong> oraz myślnik zamiast dwukropka w nagłówku okolicznościowym P305+P351+P338', () => {
        const dashInTriggerHtml = `
            <ul>
                <li>➡️ <strong>Ostrzeżenie CLP:</strong> Hasło ostrzegawcze – UWAGA</li>
                <li>➡️ <strong>Ostrzeżenie CLP/GPSR:</strong> P264 – Dokładnie umyć ręce po użyciu.</li>
                <li>➡️ <strong>Ostrzeżenie CLP/GPSR:</strong> P280 – Stosować ochronę oczu.</li>
                <li>➡️ <strong>Ostrzeżenie CLP/GPSR:</strong> P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU – Ostrożnie płukać wodą przez kilka minut.</li>
            </ul>
        `;
        const res = v.validate_section6_compliance(dashInTriggerHtml, { is_chemical: true, has_eye_irritation: true });
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes("Missing '/GPSR' in label tag")));
        assert.ok(res.errors.some(e => e.includes('CLP conditional trigger header must end with a statutory colon')));
    });

    await t.test('validate_section3_ingredients_closed_world wykrywa nieautoryzowany konserwant w tagu <strong>', () => {
        const s3Html = '<ul><li>⚙️ <strong>Phenoxyethanol:</strong> konserwant chroniący formulację.</li></ul>';
        const res = v.validate_section3_ingredients_closed_world(s3Html, ['Aqua', 'Sodium Laureth Sulfate']);
        assert.strictEqual(res.valid, false);
        assert.ok(res.errors.some(e => e.includes('UNAUTHORIZED_HALLUCINATED_INGREDIENT')));
    });
});

test('V4B scan_biocidal_claims_lexical & Deterministic Legal Sanitizer (Rozp. BPR 528/2012, 655/2013, Allegro 2026)', async (t) => {
    const deterministicEngine = require('../services/deterministic-pipeline.engine');
    const visionExtractor = require('../vision-extractor.service');

    await t.test('Wykrywa polskie i włoskie/angielskie roszczenia biobójcze, antybakteryjne, przeciwwirusowe i dezynfekujące', () => {
        const forbiddenSamples = [
            '<p>Ten płyn działa antybakteryjnie i przeciwwirusowo.</p>',
            '<p>Preparat biobójczy i bakteriobójczy do łazienki.</p>',
            '<p>Środek dezynfekujący powierzchnie, zabija 99,9% bakterii i wirusów.</p>',
            '<p>Mydło odkażające oraz grzybobójcze (Antibatterico, Disinfettante).</p>'
        ];
        for (const sample of forbiddenSamples) {
            const bioHits = v.scan_biocidal_claims_lexical(sample);
            assert.ok(bioHits.length > 0, `Powinien wykryć roszczenie biobójcze w: ${sample}`);
        }
    });

    await t.test('sanitizeOfferTitle usuwa z tytułu oferty słowa biobójcze, antybakteryjne oraz stop-words Allegro', () => {
        const rawTitle = 'ORYGINALNY HIT Chanteclair Sgrassatore Płyn Antybakteryjny Dezynfekujący Antibatterico 600 ml!';
        const cleanTitle = deterministicEngine.sanitizeOfferTitle(rawTitle);
        assert.strictEqual(v.scan_biocidal_claims_lexical(cleanTitle).length, 0, 'Tytuł po sanityzacji nie może zawierać słów biobójczych');
        assert.strictEqual(v.scan_stopwords(cleanTitle).length, 0, 'Tytuł po sanityzacji nie może zawierać stop-words Allegro');
        assert.ok(cleanTitle.includes('Chanteclair'), 'Tytuł musi zachować markę');
        assert.ok(cleanTitle.includes('600 ml'), 'Tytuł musi zachować pojemność');
    });

    await t.test('sanitizeHtmlClaimsAndStopwords przekształca roszczenia biobójcze i medyczne w bezpieczne roszczenia higieniczno-czyszczące', () => {
        const dirtyHtml = '<p>Oryginalny płyn antybakteryjny i przeciwwirusowy dezynfekuje kuchnię oraz zabija 99,9% bakterii i zarazków, gwarantując efekt leczniczy.</p>';
        const cleanHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(dirtyHtml);
        assert.strictEqual(v.scan_biocidal_claims_lexical(cleanHtml).length, 0, 'Po sanityzacji brak słów biobójczych');
        assert.strictEqual(v.scan_medical_claims_lexical(cleanHtml).length, 0, 'Po sanityzacji brak słów medycznych');
        assert.strictEqual(v.scan_stopwords(cleanHtml).length, 0, 'Po sanityzacji brak stop-words Allegro');
        assert.ok(cleanHtml.includes('higienicznie oczyszczający'), 'Powinien zamienić antybakteryjny na higienicznie oczyszczający');
    });

    await t.test('sanitizeVisionFrontText neutralizuje napisy biobójcze odczytane z włoskiego/polskiego frontu opakowania', () => {
        const rawFront = 'Igienizzante Antibatterico – usuwa 99,9% bakterii i dezynfekuje';
        const sanitizedFront = visionExtractor.sanitizeVisionFrontText(rawFront);
        assert.strictEqual(v.scan_biocidal_claims_lexical(sanitizedFront).length, 0);
        assert.ok(sanitizedFront.toLowerCase().includes('higieniczn'));
    });

    await t.test('tryBuildDeterministicSection3 buduje kompletną Sekcję 3 z priorytetem Składników Wiodących z Frontu (Agent 0) w 0ms', () => {
        const res = deterministicEngine.tryBuildDeterministicSection3({
            inci: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Argania Spinosa Kernel Oil, Citric Acid, Parfum',
            isChemical: false,
            productName: 'Żel pod prysznic z olejem arganowym 500 ml',
            visionFeatures: {
                'Składniki wiodące (Front)': 'Olej arganowy'
            }
        });
        assert.strictEqual(res.canSkipA4, true);
        assert.ok(res.section_3_html.includes('<h2>⚙️'));
        assert.ok(res.section_3_html.includes('Argania Spinosa Kernel Oil'), 'Powinien priorytetowo uwzględnić Olej arganowy z frontu opakowania');
        assert.strictEqual(v.scan_biocidal_claims_lexical(res.section_3_html).length, 0);
        assert.strictEqual(v.scan_medical_claims_lexical(res.section_3_html).length, 0);
        assert.strictEqual(v.scan_stopwords(res.section_3_html).length, 0);
        assert.strictEqual(v.emoji_structure_check(res.section_3_html).valid, true);
    });

    await t.test('Higiena danych Cif Candeggina: normalizacja pojemności 0,650 -> 650 ml, ALL-CAPS tytułu, filtracja con Candeggina z zapachu i brak włoskich wtrąceń', () => {
        // 1. Normalizacja surowego floata 0,650 z BaseLinkera
        const normCap = deterministicEngine.normalizeCapacityValue(
            '0,650',
            'CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML',
            { 'Postać': 'spray' }
        );
        assert.strictEqual(normCap, '650 ml');

        // 2. Normalizacja krzyczącego tytułu ALL-CAPS i literówki CANDEGINA -> Candeggina
        const cleanTitle = deterministicEngine.sanitizeOfferTitle('CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML');
        assert.strictEqual(cleanTitle, 'Cif środek wielofunkcyjny Candeggina 650 ml');

        // 3. Sanitizacja wtrąceń włoskich w HTML (Sekcja 1)
        const rawHtml = '<p>Aktywny wybielacz (Potere Sbiancante) i gęsta piana (Schiuma Potente) zapewniają wszechstronne zastosowanie (Multiuso) przez ergonomiczny atomizer (Spray Attivo).</p>';
        const cleanHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(rawHtml);
        assert.strictEqual(/Potere Sbiancante|Schiuma Potente|Multiuso|Spray Attivo/i.test(cleanHtml), false, 'Powinien usunąć włoskie nawiasy marketingowe z tekstu polskiego');

        // 4. Sekcja 3 dla Cif Candeggina zawiera pogrubienia <b>...</b> i przystępny język bez żargonu "reologia"
        const detS3 = deterministicEngine.tryBuildDeterministicSection3({
            inci: 'Aqua, Sodium Hypochlorite, Sodium C14-17 Alkyl Sec Sulfonate, Sodium Hydroxide, Sodium Silicate, Sodium Carbonate, Sodium Chloride, Parfum',
            productName: 'CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML',
            isChemical: false,
            visionFeatures: {
                'Przeznaczenie': 'uniwersalne czyszczenie powierzchni',
                'Składniki wiodące (Front)': 'Wybielacz'
            }
        });
        assert.strictEqual(detS3.canSkipA4, true);
        assert.strictEqual(detS3.a4_result.category_type, 'HOUSEHOLD_CHEMISTRY');
        assert.ok(detS3.section_3_html.includes('<b>'), 'Sekcja 3 musi zawierać pogrubienia <b>...</b> korzyści użytkowych');
        assert.strictEqual(/reologi/i.test(detS3.section_3_html), false, 'Sekcja 3 nie może zawierać akademickiego żargonu "reologii"');

        // 5. Sekcja 5 dla Cif Candeggina: 650 ml, brak con Candeggina w Wariancie zapachowym, oczyszczone Cechy dodatkowe
        const s5Html = deterministicEngine.buildDeterministicSection5({
            gtin: '8720182303097',
            productName: 'CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML',
            brand: 'Cif',
            manufacturer: 'Unilever Europe B.V.',
            capacity: '0,650',
            countryOfOrigin: 'Włochy',
            inci: 'Aqua, Sodium Hypochlorite, Sodium C14-17 Alkyl Sec Sulfonate, Sodium Hydroxide, Sodium Silicate, Sodium Carbonate, Sodium Chloride, Parfum',
            visionFeatures: {
                'Postać': 'spray',
                'Pojemność / Waga': '0,650',
                'Dozownik': 'atomizer / spray',
                'Zapach': 'con Candeggina (z wybielaczem)',
                'Składniki wiodące (Front)': 'Wybielacz',
                'Przeznaczenie': 'uniwersalne czyszczenie powierzchni (multiuso)',
                'Cechy dodatkowe (Front)': 'Formula Migliorata, Spray Attivo, 100% higieniczna czystość, Potere Sbiancante, Schiuma Potente'
            }
        });
        assert.ok(s5Html.includes('650 ml'), 'Sekcja 5 musi wyświetlać 650 ml zamiast surowego 0,650');
        assert.strictEqual(s5Html.includes('0,650'), false, 'Sekcja 5 nie może zawierać surowego ułamka 0,650');
        assert.strictEqual(s5Html.includes('Wariant zapachowy:'), false, 'Wybielacz (con Candeggina) nie może być wyświetlany jako Wariant zapachowy');
        assert.strictEqual(/Formula Migliorata|Potere Sbiancante|Schiuma Potente|\(multiuso\)/i.test(s5Html), false, 'Sekcja 5 nie może zawierać nieprzetłumaczonych włoskich haseł z etykiety');
        assert.ok(s5Html.includes('Cif środek wielofunkcyjny Candeggina 650 ml'), 'Nazwa produktu w Sekcji 5 musi być znormalizowana z ALL-CAPS');
    });

    await t.test('7. v4.13: Konflikt pochodzenia Włochy, wyodrębnienie wykluczeń materiałowych, tarcza antykontaktowa i eliminacja kalek pralniczych', () => {
        // A. Konflikt pochodzenia: Unilever Italia z holenderskim EAN -> Kraj pochodzenia Włochy
        const s5Italian = deterministicEngine.buildDeterministicSection5({
            gtin: '8720182307842',
            productName: 'Cif odkamieniacz spray eucalipto 650 ml',
            brand: 'Cif',
            manufacturer: 'Unilever Italia Mkt. Operations S.r.l.',
            capacity: '650 ml',
            countryOfOrigin: 'Niderlandy' // z holenderskiego prefixu 87
        });
        assert.ok(s5Italian.includes('Kraj pochodzenia:</b> Włochy'), 'Unilever Italia musi mapować kraj pochodzenia na Włochy, a nie Niderlandy');
        assert.strictEqual(s5Italian.includes('Niderlandy'), false, 'Niderlandy nie mogą pojawić się dla włoskiej linii Unilever Italia');

        // B. Wyodrębnienie wykluczenia materiałowego (Pratfall) w Sekcji 4
        const mergedS4 = '<p>Regularne stosowanie w łazience. Jedno opakowanie 650 ml wystarcza na wiele cykli mycia. Ze względu na zawartość kwasów nie stosować na marmurze, trawertynie, powierzchniach wapiennych ani niezabezpieczonym aluminium.</p>';
        const fixedS4 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(mergedS4);
        assert.ok(fixedS4.includes('<p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Ze względu na zawartość kwasów nie stosować na marmurze, trawertynie, powierzchniach wapiennych ani niezabezpieczonym aluminium.</p>'), 'Wykluczenie materiałowe musi zostać rozdzielone na wyodrębniony blok z nagłówkiem');
        assert.ok(fixedS4.includes('wiele cykli mycia.</p>'), 'Pierwszy akapit z rutyną musi zostać poprawnie domknięty');

        // C. Tarcza antykontaktowa Allegro (usunięcie e-maili, domen i linków www)
        const dirtyHtml = '<p>Producent: Unilever Italia, via Paolo di Dono 3/A, Roma. Kontakt: consumer-service.it@unilever.com, www.unilever.it, https://unilever.com.</p>';
        const cleanHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(dirtyHtml);
        assert.strictEqual(cleanHtml.includes('@'), false, 'sanitizeHtmlClaimsAndStopwords musi usuwać e-maile');
        assert.strictEqual(cleanHtml.includes('www.'), false, 'sanitizeHtmlClaimsAndStopwords musi usuwać www.');
        assert.strictEqual(cleanHtml.includes('http'), false, 'sanitizeHtmlClaimsAndStopwords musi usuwać linki http');
        assert.strictEqual(cleanHtml.includes('unilever.it'), false, 'sanitizeHtmlClaimsAndStopwords musi usuwać domeny internetowe');

        // D. validate_domain_and_chemical_logic: wykrywanie kalek pralniczych, kontaktów i braku bloku wykluczenia
        const badNonLaundry = v.validate_domain_and_chemical_logic({
            section_1_html: '<p>Cif spray do łazienki</p>',
            section_3_html: '<p>Surfaktanty rozpuszczają tłuszcz i sebum już w niskich temperaturach (od 20–30°C)</p>',
            section_4_html: '<p>Stosuj w łazience. Ze względu na kwas nie stosować na marmur.</p>',
            section_6_html: '<p>Nie połykać. Kontakt: info@unilever.com</p>'
        }, {
            productName: 'Cif odkamieniacz spray 650 ml',
            isChemical: true
        });
        assert.strictEqual(badNonLaundry.valid, false);
        assert.ok(badNonLaundry.errors.some(e => e.includes('Kalka pralnicza')));
        assert.ok(badNonLaundry.errors.some(e => e.includes('Polityka Allegro')));
        assert.ok(badNonLaundry.errors.some(e => e.includes('Zaszyte wykluczenie materiałowe')));

        // E. validate_eu_responsible_person: poprawna walidacja bez pola contact
        const euWithoutContact = v.validate_eu_responsible_person({
            name: 'Unilever Italia Mkt. Operations S.r.l.',
            address_eu: 'Via Paolo di Dono 3/A, 00142 Roma (RM), Włochy'
        });
        assert.strictEqual(euWithoutContact.valid, true, 'Podmiot odpowiedzialny w UE jest w 100% poprawny bez pola contact');

        // F. v4.14: Testy anty-kalki kuchennej, BHP pleśni, reżimu interwencji i ikony Allegro ⚠️
        // F1. Usuwanie kalek kuchennych (przypalenia) w chemii łazienkowej
        const kitchenClaimHtml = '<p>Soda oczyszczona zwiększa siłę myjącą detergentów, usuwa przypalenia i neutralizuje zapachy.</p>';
        const cleanedKitchenHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(kitchenClaimHtml);
        assert.strictEqual(cleanedKitchenHtml.includes('przypalenia'), false, 'sanitizeHtmlClaimsAndStopwords musi usuwać kalkę kuchenną o przypaleniach');

        // F2. Tarcza BHP przy pleśni (zakaz ścierania na sucho przed aplikacją chemii)
        const moldScrapeS4 = '<ol><li>✍️ <b>Krok 1 – Przygotowanie powierzchni:</b> zlokalizuj ognisko pleśni i usuń z niego powierzchowne zanieczyszczenia miękką ściereczką.</li><li>✍️ <b>Krok 2 – Aplikacja:</b> spryskaj fugi.</li></ol>';
        const fixedMoldS4 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(moldScrapeS4);
        assert.strictEqual(fixedMoldS4.includes('usuń z niego powierzchowne zanieczyszczenia'), false, 'Tarcza BHP musi usuwać zalecenie ścierania pleśni na sucho');
        assert.ok(fixedMoldS4.includes('nanieś preparat bezpośrednio na zapleśniałą powierzchnię bez wstępnego ścierania mechanicznego'), 'Krok 1 musi nakazywać bezpośrednią aplikację zapobiegając pyleniu zarodników');

        // F3. Reżim stosowania (interwencja vs codzienne porządki dla chloru i kwasów)
        const dailyBleachHtml = '<p>Preparat z aktywnym chlorem do codziennych porządków w łazience.</p>';
        const fixedBleachHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(dailyBleachHtml);
        assert.strictEqual(fixedBleachHtml.includes('codziennych porządków'), false, 'Preparat z chlorem nie może być nazwany środkiem do codziennych porządków');
        assert.ok(fixedBleachHtml.includes('doraźnych zabiegów czyszczących'), 'Musi zostać zamieniony na doraźne zabiegi czyszczące');

        // F4. Zakaz ikony ⛔ i zamiana na ⚠️
        const badEmojiHtml = '<p>⛔ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie stosować na aluminium.</p>';
        const cleanEmojiHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(badEmojiHtml);
        assert.strictEqual(cleanEmojiHtml.includes('⛔'), false, 'Ikona ⛔ musi zostać usunięta ze względu na zasady Allegro');
        assert.ok(cleanEmojiHtml.includes('⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b>'), 'Ikona ⛔ musi zostać zastąpiona dozwoloną ikoną ⚠️');

        // F5. Walidator validate_domain_and_chemical_logic: wychwytywanie błędów v4.14
        const moldValidationResult = v.validate_domain_and_chemical_logic({
            section_1_html: '<p>Cif spray do usuwania pleśni do codziennych porządków</p>',
            section_3_html: '<p>Soda usuwa przypalenia z piekarników</p>',
            section_4_html: '<p>Krok 1: usuń powierzchowne zanieczyszczenia z pleśni przecierając szmatką. ⛔ <b>WYKLUCZENIE:</b> aluminium.</p>',
            section_6_html: '<p>Nie połykać.</p>'
        }, {
            productName: 'Cif spray do usuwania pleśni 500 ml',
            isChemical: true
        });
        assert.strictEqual(moldValidationResult.valid, false);
        assert.ok(moldValidationResult.errors.some(e => e.includes('Kalka kuchenna')), 'Musi wykryć kalkę kuchenną');
        assert.ok(moldValidationResult.errors.some(e => e.includes('Zagrożenie biologiczne BHP')), 'Musi wykryć zagrożenie BHP ścierania pleśni');
        assert.ok(moldValidationResult.errors.some(e => e.includes('Błędny reżim stosowania')), 'Musi wykryć codzienne porządki dla chloru');
        assert.ok(moldValidationResult.errors.some(e => e.includes('Niedozwolony symbol Allegro')), 'Musi wykryć zabronioną ikonę ⛔');

        // F6. Puryzm parametrów w Sekcji 5 (odsiewanie sloganów marketingowych)
        const s5Slogans = deterministicEngine.buildDeterministicSection5({
            productName: 'Cif spray do usuwania pleśni 500 ml',
            brand: 'Cif',
            manufacturer: 'Unilever',
            capacity: '500 ml',
            features: {
                'Cechy dodatkowe': 'Siła wybielania, Potere Sbiancante, Usuwa plamy z pleśni, Ulepszona formuła'
            }
        });
        assert.strictEqual(s5Slogans.includes('Siła wybielania'), false, 'Siła wybielania musi zostać odfiltrowana');
        assert.strictEqual(s5Slogans.includes('Potere Sbiancante'), false, 'Potere Sbiancante musi zostać odfiltrowane');
        assert.strictEqual(s5Slogans.includes('Ulepszona formuła'), false, 'Ulepszona formuła musi zostać odfiltrowana');
        assert.ok(s5Slogans.includes('Usuwa plamy z pleśni'), 'Merytoryczna cecha "Usuwa plamy z pleśni" musi zostać zachowana');

        // F7. Sekcja 3: Cocamine Oxide i czystość Sodium Chloride
        const s3Inci = deterministicEngine.tryBuildDeterministicSection3({
            inci: 'Aqua, Sodium Hypochlorite, Cocamine Oxide, Sodium Hydroxide, Sodium Chloride'
        });
        assert.ok(s3Inci.section_3_html.includes('Cocamine Oxide') || s3Inci.section_3_html.includes('Tlenek kokaminy'), 'Cocamine Oxide musi zostać uwzględniony w mechanizmach Sekcji 3');
        assert.strictEqual(s3Inci.section_3_html.includes('gęstą, stabilną pianę') && s3Inci.section_3_html.includes('Sodium Chloride'), false, 'Piana nie może być przypisana do Sodium Chloride');
    });

    await t.test('Weryfikacja v4.15: Ontologia płynów do płukania tkanin (ammorbidente vs detergent piorący)', () => {
        // G1. Deterministyczna Sekcja 5: zmiana deklaracji 'prań' na 'cykli płukania' z poprawną odmianą PWN
        const s5Softener65 = deterministicEngine.buildDeterministicSection5({
            productName: 'Felce Azzurra płyn do płukania tkanin 2L',
            brand: 'Felce Azzurra',
            manufacturer: 'Paglieri',
            capacity: '2000 ml',
            features: {
                'Wydajność': '65 prań'
            }
        });
        assert.ok(s5Softener65.includes('<b>Wydajność deklarowana:</b> 65 cykli płukania'), '65 prań dla płynu do płukania musi być przeliczone na 65 cykli płukania');
        assert.strictEqual(s5Softener65.includes('65 prań'), false, 'Niedopuszczalne słowo "prań" w parametrach płynu do płukania');

        const s5Softener22 = deterministicEngine.buildDeterministicSection5({
            productName: 'Coccolino ammorbidente concentrato 1L',
            brand: 'Coccolino',
            manufacturer: 'Unilever',
            capacity: '1000 ml',
            features: {
                'Wydajność': '22 prania'
            }
        });
        assert.ok(s5Softener22.includes('<b>Wydajność deklarowana:</b> 22 cykle płukania'), '22 prania dla płynu do płukania musi być odmodyfikowane na 22 cykle płukania');

        const s5Softener1 = deterministicEngine.buildDeterministicSection5({
            productName: 'Saszetka płynu do płukania 50ml',
            brand: 'Lenor',
            manufacturer: 'Procter & Gamble',
            capacity: '50 ml',
            features: {
                'Wydajność': '1 pranie'
            }
        });
        assert.ok(s5Softener1.includes('<b>Wydajność deklarowana:</b> 1 cykl płukania'), '1 pranie dla płynu do płukania musi być 1 cykl płukania');

        // G2. Środek 2w1 (płyn do prania z płynem do płukania) zachowuje prań!
        const s5DualDetergent = deterministicEngine.buildDeterministicSection5({
            productName: 'Dual Power płyn do prania z płynem do płukania 2w1 2L',
            brand: 'Dual Power',
            manufacturer: 'Italsilva',
            capacity: '2000 ml',
            features: {
                'Wydajność': '40 prań'
            }
        });
        assert.ok(s5DualDetergent.includes('<b>Wydajność deklarowana:</b> 40 prań'), 'Preparat 2w1 piorący zachowuje parametr "prań"');

        // G3. Sanityzacja HTML: zamiana pojęciowa w opisach
        const rawSoftenerHtml = '<p>Ten środek piorący wystarcza na 65 prań. Zapewnia ochronę tkanin po każdym praniu oraz usuwa zabrudzenia w kolejnych cyklach prania.</p>';
        const sanitizedSoftenerHtml = deterministicEngine.sanitizeHtmlClaimsAndStopwords(rawSoftenerHtml, {
            productName: 'Tesori d\'Oriente płyn do płukania tkanin Białe Piżmo 760 ml'
        });
        assert.strictEqual(sanitizedSoftenerHtml.includes('środek piorący'), false, 'Niedopuszczalne określenie "środek piorący" dla płynu do płukania');
        assert.ok(sanitizedSoftenerHtml.includes('płyn do płukania tkanin'), 'Zastąpiono przez "płyn do płukania tkanin"');
        assert.strictEqual(sanitizedSoftenerHtml.includes('65 prań'), false, 'Niedopuszczalne "65 prań"');
        assert.ok(sanitizedSoftenerHtml.includes('65 cykli płukania'), 'Zastąpiono przez "65 cykli płukania"');
        assert.strictEqual(sanitizedSoftenerHtml.includes('po każdym praniu'), false, 'Niedopuszczalne "po każdym praniu"');
        assert.ok(sanitizedSoftenerHtml.includes('po każdym płukaniu'), 'Zastąpiono przez "po każdym płukaniu"');
        assert.strictEqual(sanitizedSoftenerHtml.includes('cyklach prania'), false, 'Niedopuszczalne "cyklach prania"');
        assert.ok(sanitizedSoftenerHtml.includes('cyklach płukania'), 'Zastąpiono przez "cyklach płukania"');

        // G4. Walidator validate_domain_and_chemical_logic: Reguła 15
        const invalidValidationResult = v.validate_domain_and_chemical_logic({
            section_1_html: '<p>Wspaniały środek piorący do tkanin.</p>',
            section_2_html: '<p>Wystarcza na 65 prań w pralce.</p>',
            section_4_html: '<p>Stosuj po każdym praniu w cyklu prania.</p>'
        }, {
            productName: 'Felce Azzurra ammorbidente puro 2L',
            isChemical: true
        });
        assert.strictEqual(invalidValidationResult.valid, false);
        assert.ok(invalidValidationResult.errors.some(e => e.includes('[Błąd pojęciowo-technologiczny]')), 'Musi zgłosić błąd pojęciowy w walidatorze');

        // G5. Prawidłowy opis płynu do płukania przechodzi bez błędu Reguły 15
        const validValidationResult = v.validate_domain_and_chemical_logic({
            section_1_html: '<p>Wspaniały płyn do płukania tkanin.</p>',
            section_2_html: '<p>Wystarcza na 65 cykli płukania w pralce.</p>',
            section_4_html: '<p>Stosuj po każdym płukaniu w cyklu płukania.</p>'
        }, {
            productName: 'Felce Azzurra ammorbidente puro 2L',
            isChemical: true
        });
        assert.strictEqual(validValidationResult.errors.some(e => e.includes('[Błąd pojęciowo-technologiczny]')), false, 'Poprawne frazy płukania nie mogą generować błędu');
    });
});


test('ADR-0173: Wrogie testy regresyjne Dual Power WC Gel Candeggina (9 bugów produkcyjnych)', async (t) => {
    const deterministicEngine = require('../services/deterministic-pipeline.engine.js');
    const googleSuggestFaq = require('../services/google-suggest-faq.service.js');

    const wcContext = {
        productName: 'Dual Power żel do WC Candeggina 700 ml',
        inci: '< 5% fosfoniany, środki wybielające na bazie chloru, anionowe środki powierzchniowo czynne, amfoteryczne środki powierzchniowo czynne, kompozycja zapachowa (Parfum). Zawiera: SODIUM HYDROXIDE, SODIUM LAURETH SULFATE (Alcohols, C12-14, ethoxylated, sulfates, sodium salts)',
        isChemical: true,
        requiresProtectiveGloves: true
    };

    await t.test('A. Walidatory bezwzględnie ODRZUCAJĄ dokładnie takie halucynacje, błędy chemiczne, gramatyczne i CLP z produkcji', () => {
        const res = v.validate_domain_and_chemical_logic({
            section_1_html: '<h2>⭐ Dual Power żel do WC Candeggina 700 ml</h2><ul><li>✔️ <b>Odpowiedzialne opakowanie:</b> butelka wykonana w częściowo z plastiku pochodzącego z recyklingu.</li></ul>',
            section_2_html: '<h2>❓ Najczęstsze pytania</h2><ul><li>❓ <b>Pytanie:</b> Co usuwa?</li><li>✔️ <b>Odpowiedź:</b> Preparat usuwa zacieki mineralne, przebarwienia oraz osady organiczne.</li></ul>',
            section_3_html: '<h2>⚙️ Skład chemiczny</h2><ul><li>⚙️ <b>Sodium Hypochlorite:</b> rozkłada przebarwienia, ciemne naloty w fugach oraz osady organiczne.</li></ul>',
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Załóż rękawice ochronne i nanieś pod obrzeże muszli toaletowej.</li></ol>',
            section_6_html: [
                '<h2>⚠️ Bezpieczeństwo</h2><ul>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H314 – Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować rękawice ochronne.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301+P312 – W PRZYPADKU POŁKNIĘCIA: skontaktować się z lekarzem.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Nie połykać.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P303+P361+P353 – W PRZYPADKU KONTATKU ZE SKÓRĄ (lub z włosami): zdjąć odzież.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Spłukać skórę pod strumieniem wody lub prysznicem.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> NIE wywoływać wymiotów.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> alkohole C12-14, etoksylowane, siarczanowane, sole sodowe.</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> EUH206 – Może uwalniać niebezpieczne gazy (chlor).</li>',
                '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Może uwalniać niebezpieczne gazy (chlor).</li>',
                '</ul>'
            ].join('')
        }, wcContext);

        assert.strictEqual(res.valid, false, 'Walidator musi odrzucić brudny opis z 9 usterkami produkcyjnymi');
        const allErrs = res.errors.join('\n');
        assert.ok(allErrs.includes('[Kalka międzykategorialna WC vs Fugi]'), `Brak wykrycia kalki "w fugach" w żelu do WC: ${allErrs}`);
        assert.ok(allErrs.includes('[Błąd logiczno-chemiczny]'), `Brak wykrycia sprzeczności "usuwa zacieki mineralne" dla NaOCl/NaOH: ${allErrs}`);
        assert.ok(allErrs.includes('[Błąd gramatyczny]'), `Brak wykrycia błędu "w częściowo": ${allErrs}`);

        const s6Res = v.validate_section6_compliance(
            '<h2>⚠️ Bezpieczeństwo</h2><ul>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H314 – Powoduje poważne oparzenia skóry.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P303+P361+P353 – W PRZYPADKU KONTATKU ZE SKÓRĄ: zdjąć odzież.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Spłukać skórę pod strumieniem wody lub prysznicem.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> alkohole C12-14, etoksylowane, siarczanowane, sole sodowe.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> NIE wywoływać wymiotów.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301+P312 – W PRZYPADKU POŁKNIĘCIA: skontaktować się z lekarzem.</li>' +
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P302+P352 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Umyć wodą.</li>' +
            '</ul>',
            wcContext
        );
        assert.strictEqual(s6Res.valid, false, 'validate_section6_compliance musi odrzucić literówkę KONTATKU, urwane zwroty, wyciek składnika i P301+P312 przy H314');
        const s6Errs = s6Res.errors.join('\n');
        assert.ok(/KONTATKU|literówka/i.test(s6Errs), `Brak błędu literówki KONTATKU: ${s6Errs}`);
        assert.ok(/rozerwany|urwany|P303|P331/i.test(s6Errs), `Brak błędu urwanych fraz P303/P331: ${s6Errs}`);
        assert.ok(/alkohole C12-14|składnik/i.test(s6Errs), `Brak błędu wycieku składnika SDS: ${s6Errs}`);
        assert.ok(/P301\+P312|P302\+P352|H314/i.test(s6Errs), `Brak błędu niespójnych kodów przy H314: ${s6Errs}`);
    });

    await t.test('B. tryBuildDeterministicSection3 obsługuje "środki wybielające na bazie chloru", nie wstawia fug/tłuszczu i nie dubluje anionowych surfaktantów', () => {
        const s3Wc = deterministicEngine.tryBuildDeterministicSection3({
            productName: wcContext.productName,
            isChemical: true,
            inci: wcContext.inci
        });
        assert.strictEqual(s3Wc.canSkipA4, true, 'Deterministyczna Sekcja 3 powinna zostać zbudowana dla żelu do WC');
        assert.ok(/Sodium Hypochlorite/i.test(s3Wc.section_3_html), 'Musi zmapować "środki wybielające na bazie chloru" na Sodium Hypochlorite');
        assert.strictEqual(/\bw fugach\b|fugi\b/i.test(s3Wc.section_3_html), false, 'Żel do WC nie może wspominać o fugach');
        assert.strictEqual(/rozpuszczając tłuszcz|tłustych osadów|odtłuszczające/i.test(s3Wc.section_3_html), false, 'Żel do WC nie może udawać odtłuszczacza kuchennego');

        const anionicBullets = (s3Wc.section_3_html.match(/<li>\s*⚙️\s*<b>Anionowe środki powierzchniowo czynne/gi) || []).length;
        assert.strictEqual(anionicBullets, 1, `Kategoria "anionowe środki..." i SLES nie mogą tworzyć zdublowanych kafelków (znaleziono ${anionicBullets})`);

        // Pozytywny test kontrolny: środek do pleśni i fug NADAL może opisywać fugi
        const s3Mold = deterministicEngine.tryBuildDeterministicSection3({
            productName: 'Cif Muffa spray do pleśni i fug 500 ml',
            category: 'Fugi i pleśń',
            isChemical: true,
            inci: 'Aqua, Sodium Hypochlorite, Cocamine Oxide'
        });
        assert.strictEqual(s3Mold.canSkipA4, true);
        assert.ok(/w fugach|fug/i.test(s3Mold.section_3_html), 'Preparat na pleśń w fugach powinien zachować kontekst fug');
    });

    await t.test('C. sanitizeHtmlClaimsAndStopwords naprawia kalki i błędy gramatyczne, ale zachowuje chelatację osadów przez fosfoniany', () => {
        const fixedS1 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
            '<p>Odpowiedzialne opakowanie: butelka wykonana w częściowo z plastiku z recyklingu.</p>',
            wcContext
        );
        assert.ok(fixedS1.includes('wykonana częściowo z plastiku'), `Nie poprawiono gramatyki "w częściowo": ${fixedS1}`);
        assert.strictEqual(fixedS1.includes('w częściowo'), false);

        const fixedS2 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
            '<p>Preparat usuwa zacieki mineralne, przebarwienia oraz osady organiczne w muszli WC.</p>',
            wcContext
        );
        assert.strictEqual(/usuwa zacieki mineralne/i.test(fixedS2), false, `Nie usunięto błędu "usuwa zacieki mineralne": ${fixedS2}`);
        assert.ok(/osady organiczne/i.test(fixedS2), 'Sanitizer uszkodził poprawną część zdania o osadach organicznych');

        const fixedS3 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
            '<ul><li><b>Sodium Hypochlorite:</b> rozkłada przebarwienia, ciemne naloty w fugach oraz osady organiczne.</li>' +
            '<li><b>Fosfoniany:</b> wychwytują jony wapnia i magnezu i zapobiegają odkładaniu się osadów mineralnych.</li></ul>',
            wcContext
        );
        assert.strictEqual(/w fugach/i.test(fixedS3), false, `Nie wycięto "w fugach" w żelu do WC: ${fixedS3}`);
        assert.ok(/zapobiegają odkładaniu się osadów mineralnych/i.test(fixedS3), 'Sanitizer bezprawnie usunął chelatujące zapobieganie osadom mineralnym przez fosfoniany');
    });

    await t.test('D. harvestSearchIntentFaq generuje pytania pod muszlę WC (bez wanny, kabiny, fug i zacieków mineralnych dla wybielacza chlorowego)', async () => {
        const faqWc = await googleSuggestFaq.harvestSearchIntentFaq({
            productName: wcContext.productName,
            brand: 'Dual Power',
            capacity: '700 ml',
            isChemical: true,
            inci: wcContext.inci
        });
        const allQ = faqWc.recommended_search_questions.join(' | ');
        assert.strictEqual(/wann|kabin|fug|zacieki mineralne|kamień/i.test(allQ), false, `FAQ WC zawiera obce powierzchnie lub kamień dla chloru: ${allQ}`);
        assert.ok(/muszl|toalet|WC/i.test(allQ), `FAQ WC nie odnosi się do muszli toaletowej: ${allQ}`);
        assert.ok(/przebarwienia|osady organiczne/i.test(allQ), `FAQ chlorowego żelu WC powinno pytać o przebarwienia/osady organiczne: ${allQ}`);
    });
});

test('ADR-0174: Uniwersalność domenowa (brak kalki łazienkowej i pseudonauki dwufazowej) + angielskie nazewnictwo INCI/648', async (t) => {
    const { normalizeInciToLegalEnglish } = require('../normalization');
    const deterministicEngine = require('../services/deterministic-pipeline.engine');

    await t.test('A. normalizeInciToLegalEnglish tłumaczy skład 648/2004 i INCI 1:1 na prawny angielski bez dodawania lub usuwania substancji', () => {
        const plComp = '5-15% anionowe środki powierzchniowo czynne, <5% niejonowe środki powierzchniowo czynne. Zawiera: kompozycje zapachowe, środki konserwujące (Benzizotiazolinon, Metylochloroizotiazolinon, Metyloizotiazolinon).';
        const enComp = normalizeInciToLegalEnglish(plComp);
        assert.ok(/Anionic surfactants/i.test(enComp), `Brak angielskiego "Anionic surfactants": ${enComp}`);
        assert.ok(/Non-ionic surfactants/i.test(enComp), `Brak angielskiego "Non-ionic surfactants": ${enComp}`);
        assert.ok(/Parfum/i.test(enComp), `Brak "Parfum": ${enComp}`);
        assert.ok(/Benzisothiazolinone/i.test(enComp), `Brak "Benzisothiazolinone": ${enComp}`);
        assert.ok(/Methylchloroisothiazolinone/i.test(enComp), `Brak "Methylchloroisothiazolinone": ${enComp}`);
        assert.ok(/Methylisothiazolinone/i.test(enComp), `Brak "Methylisothiazolinone": ${enComp}`);

        const plCosmInci = 'Woda, Gliceryna, Siarczan sodowo-lauretowy, Kwas cytrynowy';
        const enCosmInci = normalizeInciToLegalEnglish(plCosmInci);
        assert.ok(/Aqua/i.test(enCosmInci) && /Glycerin/i.test(enCosmInci) && /Sodium Laureth Sulfate/i.test(enCosmInci) && /Citric Acid/i.test(enCosmInci), `Kosmetyczne INCI powinno być po angielsku: ${enCosmInci}`);
    });

    await t.test('B. Walidator domenowy odrzuca "kamienia i mydła" oraz "dwufazowego odtłuszczania" na frytkownicy i mydle, a przepuszcza kwaśny odkamieniacz łazienkowy', () => {
        const dirtyAirFryer = v.validate_domain_and_chemical_logic({
            section_1_html: '<h1>⭐ Dual Power środek do czyszczenia frytkownic 500 ml</h1><p>Spray do czyszczenia kosza frytkownicy.</p>',
            section_3_html: '<h2>🔬 Mechanizm</h2><ul><li><b>Non-ionic surfactants</b> – ułatwiają penetrację osadów z kamienia i mydła.</li><li><b>Synergia Dwufazowego Odtłuszczania:</b> jednorodny roztwór wodny.</li></ul>'
        }, {
            productName: 'Dual Power środek do czyszczenia frytkownic 500 ml',
            isChemical: true,
            inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum'
        });
        assert.strictEqual(dirtyAirFryer.valid, false, 'Walidator musi odrzucić halucynację łazienkową i dwufazowe odtłuszczanie dla frytkownicy');
        const errJoined = dirtyAirFryer.errors.join(' | ');
        assert.ok(/kamienia i mydła/i.test(errJoined), `Brak błędu dot. osadów z kamienia i mydła: ${errJoined}`);
        assert.ok(/dwufazow/i.test(errJoined), `Brak błędu dot. Synergii Dwufazowego Odtłuszczania: ${errJoined}`);

        const dirtySoap = v.validate_domain_and_chemical_logic({
            section_1_html: '<h1>⭐ Mydło w płynie nawilżające 500 ml</h1><p>Delikatne mydło do rąk.</p>',
            section_3_html: '<h2>🔬 Mechanizm</h2><ul><li><b>Cocamidopropyl Betaine</b> – ułatwia penetrację osadów z kamienia i mydła.</li></ul>'
        }, {
            productName: 'Mydło w płynie nawilżające 500 ml',
            isChemical: false,
            inci: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin'
        });
        assert.strictEqual(dirtySoap.valid, false, 'Walidator musi odrzucić "osady z kamienia i mydła" także na mydle do rąk!');

        const validBathroomDescaler = v.validate_domain_and_chemical_logic({
            section_1_html: '<h1>⭐ Odświeżający płyn do kabin prysznicowych i armatury 750 ml</h1><p>Skutecznie usuwa osady w łazience.</p>',
            section_3_html: '<h2>🔬 Mechanizm</h2><ul><li><b>Citric Acid</b> – rozpuszcza zacieki i osady z kamienia i mydła w kabinie prysznicowej.</li></ul>'
        }, {
            productName: 'Odświeżający płyn do kabin prysznicowych i armatury 750 ml',
            isChemical: true,
            inci: 'Aqua, Citric Acid, Non-ionic surfactants'
        });
        assert.strictEqual(validBathroomDescaler.valid, true, `Kwaśny preparat do kabin prysznicowych nie może zostać fałszywie zablokowany: ${validBathroomDescaler.errors.join(' | ')}`);
    });

    await t.test('C. Baza inci_mechanisms_pl.json i sanitizer nigdy nie wstrzykują "kamienia i mydła" ani "dwufazowe" do ogólnych produktów', () => {
        const s3FallbackAirFryer = deterministicEngine.tryBuildDeterministicSection3({
            productName: 'Dual Power środek do czyszczenia frytkownic 500 ml',
            isChemical: true,
            inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone)',
            visionFeatures: { 'Postać': 'płyn w sprayu', 'Przeznaczenie (Front)': 'do frytkownic beztłuszczowych' }
        });
        assert.ok(s3FallbackAirFryer && s3FallbackAirFryer.section_3_html, 'Fallback deterministyczny S3 powinien wygenerować bezpieczny opis dla 4 składników');
        assert.strictEqual(/kamienia i mydła|dwufazow/i.test(s3FallbackAirFryer.section_3_html), false, `Wyciek starego szablonu w fallbacku S3: ${s3FallbackAirFryer.section_3_html}`);

        const sanitizedStr = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
            '<p>Synergia Dwufazowego Odtłuszczania ułatwia penetrację osadów z kamienia i mydła w koszu frytkownicy.</p>',
            { productName: 'Dual Power środek do czyszczenia frytkownic 500 ml', inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants' }
        );
        assert.strictEqual(/dwufazow|kamienia i mydła/i.test(sanitizedStr), false, `Sanitizer nie usunął zakazanych kalek na frytkownicy: ${sanitizedStr}`);
    });
});
