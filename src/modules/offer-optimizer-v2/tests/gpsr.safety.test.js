const test = require('node:test');
const assert = require('node:assert');
const gpsrSafetyService = require('../services/gpsr.safety.service');

test('GPSR Safety Service - Wyprowadzanie ostrzeżeń ze składu INCI i SDS', async (t) => {
    
    await t.test('Wykrywa alergeny zapachowe (Linalool, Limonene)', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: 'Aqua, Glycerin, Cetearyl Alcohol, Parfum, Linalool, Limonene'
        });
        assert.ok(res.detected_risks.includes('FRAGRANCE_ALLERGENS'), 'Nie wykryto ryzyka FRAGRANCE_ALLERGENS');
        assert.ok(res.warnings.some(w => w.includes('alergenami') && w.includes('Linalool')), 'Brak ostrzeżenia o alergenach zapachowych');
    });

    await t.test('Wykrywa retinoidy (Retinol)', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: 'Aqua, Caprylic/Capric Triglyceride, Retinol, Tocopherol'
        });
        assert.ok(res.detected_risks.includes('RETINOIDS'), 'Nie wykryto ryzyka RETINOIDS');
        assert.ok(res.warnings.some(w => w.includes('witaminę A') || w.includes('retinoidy')), 'Brak ostrzeżenia o retinoidach');
    });

    await t.test('Wykrywa kwasy złuszczające (Salicylic Acid)', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: 'Aqua, Alcohol Denat., Salicylic Acid, Glycerin'
        });
        assert.ok(res.detected_risks.includes('PEELING_ACIDS'), 'Nie wykryto ryzyka PEELING_ACIDS');
        assert.ok(res.detected_risks.includes('VOLATILE_ALCOHOL'), 'Nie wykryto ryzyka VOLATILE_ALCOHOL');
        assert.ok(res.warnings.some(w => w.includes('hydroksykwasy')), 'Brak ostrzeżenia o kwasach');
    });

    await t.test('Wykrywa surfaktanty myjące (Sodium Laureth Sulfate)', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride'
        });
        assert.ok(res.detected_risks.includes('EYE_IRRITANT_SURFACTANT'), 'Nie wykryto surfaktantów');
        assert.ok(res.warnings.some(w => w.includes('kontaktu') || w.includes('oczu')), 'Brak ostrzeżenia o kontakcie z oczami');
    });

    await t.test('Wyprowadza zwroty CLP/P dla chemii gospodarczej (isChemical: true)', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: 'Aqua, Sodium Hypochlorite, Sodium Hydroxide',
            isChemical: true
        });
        assert.ok(res.detected_risks.includes('HOUSEHOLD_CHEMICAL'), 'Nie oznaczono jako HOUSEHOLD_CHEMICAL');
        assert.ok(res.warnings.some(w => w.includes('dziećmi') || w.includes('P102')), 'Brak ochrony przed dziećmi (P102)');
    });

    await t.test('Zwraca bezpieczny fallback przy pustym INCI', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            inci: ''
        });
        assert.ok(res.detected_risks.includes('GENERAL_FALLBACK'), 'Brak flagi GENERAL_FALLBACK');
        assert.ok(res.warnings.length > 0, 'Pusta lista ostrzeżeń dla pustego INCI');
        assert.ok(res.warnings.some(w => w.includes('użytku zewnętrznego')), 'Brak domyślnego ostrzeżenia o użytku zewnętrznym');
    });
});
