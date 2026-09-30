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

    await t.test('Kapsułki do prania z Polyvinyl Alcohol (PVA): brak ostrzeżeń pożarowych, obecne ostrzeżenia A.I.S.E. i P102', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Ariel Allin1 Pods Kapsułki do prania tkanin Color 50 szt.',
            inci: 'MEA-Laureth Sulfate, Polyvinyl Alcohol, Propylene Glycol, Aqua, Parfum, Linalool',
            isChemical: true
        });
        assert.ok(res.detected_risks.includes('LAUNDRY_CAPSULES_SAFETY'), 'Nie wykryto LAUNDRY_CAPSULES_SAFETY');
        assert.strictEqual(res.detected_risks.includes('VOLATILE_ALCOHOL'), false, 'Błędnie oznaczono kapsułki do prania jako łatwopalne (VOLATILE_ALCOHOL)!');
        assert.ok(!res.warnings.some(w => w.includes('ognia') || w.includes('łatwopalne')), 'Kapsułki do prania nie mogą mieć ostrzeżenia o otwartym ogniu!');
        assert.ok(res.warnings.some(w => w.includes('dziećmi') && w.includes('P102')), 'Brak P102 dla kapsułek');
        assert.ok(res.warnings.some(w => w.includes('suchymi dłońmi') || w.includes('rozcinać')), 'Brak ostrzeżenia o stosowaniu suchymi dłońmi');
        assert.ok(res.warnings.some(w => w.includes('P305+P351+P338') || w.includes('oczu')), 'Brak procedury płukania oczu');
    });

    await t.test('Kosmetyk z Cetearyl Alcohol nie wywołuje ostrzeżenia o łatwopalności', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Krem nawilżający do twarzy 50ml',
            inci: 'Aqua, Glycerin, Cetearyl Alcohol, Stearyl Alcohol, Benzyl Alcohol, Parfum'
        });
        assert.strictEqual(res.detected_risks.includes('VOLATILE_ALCOHOL'), false, 'Błędnie oznaczono Cetearyl/Stearyl alcohol jako VOLATILE_ALCOHOL');
        assert.ok(!res.warnings.some(w => w.includes('ognia') || w.includes('łatwopalne')), 'Krem nawilżający nie może mieć ostrzeżenia o otwartym ogniu');
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

