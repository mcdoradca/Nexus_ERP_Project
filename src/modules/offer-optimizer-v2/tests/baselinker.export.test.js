const test = require('node:test');
const assert = require('node:assert');
const baselinkerExportService = require('../baselinker.export.service');

test('BaseLinker Export Service - buildPayload pomija sekcja6 GPSR z description_extra4 i eksportuje 6 modułów opisu', async () => {
    const draftData = {
        title: 'Produkt Testowy BaseLinker 500 ml',
        htmlContent: {
            sekcja1: '<h2>⭐ Mocne strony</h2><p>Opis 1</p>',
            sekcja2: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Jak?</li><li>✔️ <b>Odpowiedź:</b> Tak.</li></ul>',
            sekcja3: '<h2>⚙️ Skład</h2><p>Skład INCI: Aqua</p>',
            sekcja4: '<h2>✍️ Sposób użycia</h2><p>Użyj.</p>',
            sekcja5: '<h2>⚖️ Parametry techniczne</h2><ul><li>Marka: Test</li></ul>',
            sekcja6: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li></ul>',
            sekcja7: '<p>Moduł 7 Reklama</p>'
        },
        images: [
            { originalUrl: 'https://example.com/1.jpg', isCompliant: true },
            { originalUrl: 'https://example.com/2.jpg', isCompliant: true }
        ]
    };

    const payload = await baselinkerExportService.buildPayload('307', '12345', draftData, {
        ean: '8000137015436',
        features: {}
    });

    assert.ok(payload.text_fields.description.includes('Mocne strony'));
    assert.ok(payload.text_fields.description_extra1.includes('FAQ'));
    assert.ok(payload.text_fields.description_extra2.includes('Skład INCI'));
    assert.ok(payload.text_fields.description_extra3.includes('Sposób użycia'));
    assert.ok(payload.text_fields.description_extra4.includes('Parametry techniczne'));
    assert.strictEqual(payload.text_fields.description_extra4.includes('Bezpieczeństwo GPSR'), false, 'description_extra4 nie może zawierać sekcja6 GPSR');
    assert.strictEqual(payload.text_fields.description_extra4.includes('Chronić przed dziećmi'), false, 'description_extra4 nie może zawierać ostrzeżeń GPSR');
    assert.ok(payload.text_fields.extra_field_4245.includes('Moduł 7 Reklama'));
});
