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

    await t.test('Higiena językowa: zwroty P/H stosują półpauzę, brak zbitych dwukropków oraz brak archaizmu OCZÓW', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Płyn do mycia naczyń Lemon 1L',
            inci: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Parfum, Limonene',
            isChemical: true
        });
        // Asercja: Żadne ostrzeżenie nie może zaczynać się od dwukropka po kodzie P/H ani zawierać słowa OCZÓW
        for (const w of res.warnings) {
            assert.strictEqual(/\bDO OCZÓW\b/i.test(w), false, `Ostrzeżenie zawiera niedopuszczalną formę "OCZÓW": ${w}`);
            assert.strictEqual(/^(P\d{3}|H\d{3}):/.test(w), false, `Kod zwrotu zawiera dwukropek zamiast półpauzy: ${w}`);
            if (w.startsWith('P102') || w.startsWith('P305')) {
                assert.ok(w.includes(' – '), `Brak półpauzy po kodzie zwrotu: ${w}`);
            }
        }
        // Deduplikacja: chemia gospodarcza z surfaktantami nie może dublować instrukcji o oczach
        const eyeWarnings = res.warnings.filter(w => /ocz/i.test(w));
        assert.ok(eyeWarnings.length <= 1, `Zduplikowane ostrzeżenia o oczach: ${JSON.stringify(eyeWarnings)}`);
    });

    await t.test('Tarcza Sanitizująca sanitizeSection6Html usuwa zbite dwukropki, formę OCZÓW i redundancje', () => {
        const { sanitizeSection6Html } = require('../orchestrator.js');
        const dirtyHtml = `
            <h2>⚠️ Bezpieczeństwo i informacje GPSR</h2>
            <p>Przechowywać w szczelnie zamkniętym fabrycznym opakowaniu z dala od źródeł ciepła i promieni słonecznych. Chronić przed mrozem. Przechowywać poza zasięgiem dzieci.</p>
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Produkt zawiera kompozycję zapachową z potencjalnymi alergenami (Linalool).</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> W przypadku dostania się produktu do oczu natychmiast przepłukać je obficie czystą, letnią wodą.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102: Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P305+P351+P338: W PRZYPADKU DOSTANIA SIĘ DO OCZÓW: Ostrożnie płukać wodą przez kilka minut.</li>
            </ul>
        `;

        const cleaned = sanitizeSection6Html(dirtyHtml);

        // 1. Brak archaizmu "OCZÓW"
        assert.strictEqual(cleaned.includes('OCZÓW'), false, 'Nie zamieniono formy OCZÓW na OCZU');
        assert.ok(cleaned.includes('DO OCZU'), 'Brak poprawnej formy DO OCZU');

        // 2. Brak podwójnego dwukropka po P102 i P305
        assert.strictEqual(cleaned.includes('P102:'), false, 'Pozostał dwukropek po P102:');
        assert.ok(cleaned.includes('P102 – Chronić przed dziećmi.'), 'Brak półpauzy po P102');
        assert.ok(cleaned.includes('P305+P351+P338 – W PRZYPADKU'), 'Brak półpauzy po P305');

        // 3. Deduplikacja ostrzeżenia o oczach (usunięto ogólne zdanie, gdy obecne jest P305)
        assert.strictEqual(cleaned.includes('W przypadku dostania się produktu do oczu natychmiast przepłukać'), false, 'Nie zdeduplikowano ogólnego ostrzeżenia o oczach');

        // 4. Deduplikacja powtórzenia o dzieciach we wstępie <p>
        assert.strictEqual(cleaned.includes('Przechowywać poza zasięgiem dzieci.'), false, 'Nie usunięto zduplikowanego zdania o dzieciach z akapitu <p>');
    });
});

