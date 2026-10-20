const test = require('node:test');
const assert = require('node:assert');
const { sanitizeSection5Html } = require('../orchestrator.js');
const { validate_section5_compliance } = require('../validators/index.js');

test('Tarcza Sekcji 5 (Parametry ⚖️): Eliminacja nielegalnego znaku CE dla kosmetyków i chemii', async (t) => {
    await t.test('Usuwa pojedynczy wpis Certyfikaty: CE dla kosmetyku', () => {
        const inputHtml = '<h2>⚖️ Parametry</h2><ul><li>Marka: <b>Trimay</b></li><li>Certyfikaty: <b>CE</b></li><li>EAN: <b>8809822541010</b></li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Krem nawilżający', category: 'Uroda / Kosmetyki' });
        assert.strictEqual(cleaned.includes('CE'), false);
        assert.strictEqual(cleaned.includes('Marka: <b>Trimay</b>'), true);
        assert.strictEqual(cleaned.includes('EAN: <b>8809822541010</b>'), true);
    });

    await t.test('Wycina CE z listy łączonej certyfikatów, zachowując ECOCERT i COSMOS', () => {
        const inputHtml = '<ul><li>Certyfikaty: ECOCERT, CE</li><li>Pojemność: 50 ml</li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Serum z witaminą C' });
        assert.strictEqual(cleaned.includes('ECOCERT'), true);
        assert.strictEqual(/\bCE\b/.test(cleaned), false);
        assert.strictEqual(cleaned, '<ul><li>Certyfikaty: ECOCERT</li><li>Pojemność: 50 ml</li></ul>');
        assert.strictEqual(cleaned.includes('Pojemność: 50 ml'), true);
    });

    await t.test('Pozostawia znak CE dla autentycznego wyrobu medycznego (MDR)', () => {
        const inputHtml = '<ul><li>Certyfikaty: <b>CE</b></li><li>Kategoria: Wyrób medyczny</li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { is_medical_device: true, name: 'Płyn do soczewek kontaktowych' });
        assert.strictEqual(cleaned.includes('CE'), true);
    });

    await t.test('Walidator validate_section5_compliance zgłasza błąd dla nielegalnego CE w kosmetyku', () => {
        const dirtyHtml = '<ul><li>Certyfikaty: CE</li></ul>';
        const res = validate_section5_compliance(dirtyHtml, { is_medical_device: false });
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.errors.some(e => e.includes('Contains illegal CE marking')), true);
    });
});

test('Tarcza Sekcji 5 (Parametry ⚖️): Rygor fizykochemiczny braku pH dla pudrów i form bezwodnych', async (t) => {
    await t.test('Usuwa całkowicie parametr pH dla suchego pudru mineralnego / talku', () => {
        const inputHtml = '<h2>⚖️ Parametry</h2><ul><li>Marka: <b>MineralCo</b></li><li>pH: <b>Zbilansowane</b></li><li>Waga: <b>15 g</b></li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Suchy puder mineralny z talkiem', features: { postac: 'puder' } });
        assert.strictEqual(cleaned.includes('pH'), false);
        assert.strictEqual(cleaned.includes('Zbilansowane'), false);
        assert.strictEqual(cleaned.includes('Waga: <b>15 g</b>'), true);
    });

    await t.test('Usuwa parametr pH nawet gdy podano wartość liczbową dla czystego talku (brak środowiska wodnego)', () => {
        const inputHtml = '<ul><li>Nazwa: Czysty talk w proszku</li><li>pH: 7.0</li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Talk w proszku dla niemowląt' });
        assert.strictEqual(cleaned.includes('pH: 7.0'), false);
        assert.strictEqual(cleaned.includes('pH'), false);
    });

    await t.test('Usuwa marketingowe halucynacje pH (Zbilansowane / Neutralne / Odpowiednie) dla produktów ciekłych', () => {
        const inputHtml = '<ul><li>pH: <b>Zbilansowane</b></li><li>Pojemność: 250 ml</li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Żel pod prysznic' });
        assert.strictEqual(cleaned.includes('Zbilansowane'), false);
        assert.strictEqual(cleaned.includes('pH'), false);
        assert.strictEqual(cleaned.includes('Pojemność: 250 ml'), true);
    });

    await t.test('Pozostawia twardą wartość liczbową pH dla roztworu wodnego (krem, tonik)', () => {
        const inputHtml = '<ul><li>pH: <b>5.5</b></li><li>Pojemność: 50 ml</li></ul>';
        const cleaned = sanitizeSection5Html(inputHtml, { name: 'Krem do twarzy nawilżający z fazą wodną' });
        assert.strictEqual(cleaned.includes('pH: <b>5.5</b>'), true);
    });

    await t.test('Walidator validate_section5_compliance wychwytuje pH: Zbilansowane oraz pH w pudrze', () => {
        const dirtyHtml1 = '<ul><li>pH: Zbilansowane</li></ul>';
        const res1 = validate_section5_compliance(dirtyHtml1, { name: 'Szampon' });
        assert.strictEqual(res1.valid, false);
        assert.strictEqual(res1.errors.some(e => e.includes('non-numeric marketing pH claim')), true);

        const dirtyHtml2 = '<ul><li>Nazwa: Puder mineralny</li><li>pH: 5.5</li></ul>';
        const res2 = validate_section5_compliance(dirtyHtml2, { name: 'Puder sypki' });
        assert.strictEqual(res2.valid, false);
        assert.strictEqual(res2.errors.some(e => e.includes('anhydrous product')), true);
    });
});
