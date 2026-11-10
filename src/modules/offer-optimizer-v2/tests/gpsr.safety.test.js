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

    await t.test('Akcesorium higieny jamy ustnej (Nić dentystyczna): brak ostrzeżeń o oczach i mrozie, obecna ochrona dzieci przed zadławieniem', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Woskowana nić dentystyczna miętowa 50 m',
            inci: 'Nylon, Cera Microcristallina, Aroma',
            isChemical: false
        });

        assert.ok(res.detected_risks.includes('ORAL_CARE_ACCESSORY'), 'Nie oznaczono jako ORAL_CARE_ACCESSORY');
        assert.strictEqual(res.warnings.some(w => /ocz/i.test(w)), false, 'Nić dentystyczna nie może zawierać ostrzeżeń o oczach!');
        assert.strictEqual(res.warnings.some(w => /ogień|paln/i.test(w)), false, 'Nić dentystyczna nie może zawierać ostrzeżeń o ogniu!');
        assert.ok(res.warnings.some(w => w.includes('przestrzeni międzyzębowych') || w.includes('połykać')), 'Brak ostrzeżenia o przeznaczeniu do przestrzeni międzyzębowych');
        assert.ok(res.warnings.some(w => w.includes('zadławienia') || w.includes('dzieci')), 'Brak ostrzeżenia o ochronie dzieci przed zadławieniem/zaplątaniem');
        assert.ok(res.warnings.some(w => w.includes('nadzorem')), 'Brak zalecenia nadzoru dorosłych');
    });

    await t.test('Szczoteczka manualna do zębów (PN-EN ISO 20126): wytyczne wymiany co 2-3 mies., nadzór dzieci <6 lat, brak CLP i nici', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Szczoteczka do zębów manualna Medium 1 szt.',
            inci: '',
            isChemical: false
        });

        assert.ok(res.detected_risks.includes('TOOTHBRUSH_SAFETY'), 'Nie oznaczono jako TOOTHBRUSH_SAFETY');
        assert.strictEqual(res.detected_risks.includes('HOUSEHOLD_CHEMICAL'), false, 'Szczoteczka nie może być oznaczona jako chemia!');
        assert.strictEqual(res.warnings.some(w => /nić|floss|przestrzeni międzyzębowych/i.test(w)), false, 'Szczoteczka nie może zawierać ostrzeżeń o nici dentystycznej!');
        assert.strictEqual(res.warnings.some(w => /CLP|H\d{3}|P\d{3}/i.test(w)), false, 'Szczoteczka nie może zawierać zwrotów CLP ani kodów H/P!');
        assert.strictEqual(res.warnings.some(w => /(?:dostania się do oczu|kontaktu z oczami|przepłukać oczy|płukania oczu)/i.test(w)), false, 'Szczoteczka nie może zawierać procedur płukania oczu!');
        assert.ok(res.warnings.some(w => w.includes('2–3 miesiące') || w.includes('wymianę')), 'Brak wytycznej o wymianie co 2-3 miesiące wg ISO 20126');
        assert.ok(res.warnings.some(w => w.includes('6 roku życia') && w.includes('nadzorem')), 'Brak wytycznej o nadzorze dzieci poniżej 6 roku życia');
        assert.ok(res.warnings.some(w => w.includes('Nie gryźć') || w.includes('połykać')), 'Brak wytycznej o niegryzieniu elementów szczoteczki');
    });

    await t.test('Sanityzacja nowoczesnych etykiet: Wytyczne bezpieczeństwa (GPSR) oraz Ostrzeżenie (CLP)', () => {
        const { sanitizeSection6Html } = require('../orchestrator.js');
        const dirtyHtml = `
            <h2>⚠️ Bezpieczeństwo i informacje GPSR</h2>
            <p>Przechowywać w czystym miejscu.</p>
            <ul>
                <li>⚠️ <b>Wytyczne bezpieczeństwa (GPSR):</b> Zaleca się wymianę szczoteczki na nową co 2–3 miesiące.</li>
                <li>⚠️ <b>Ostrzeżenie (CLP):</b> P102: Chronić przed dziećmi.</li>
                <li>⚠️ <b>Ostrzeżenie (CLP):</b> P305+P351+P338: W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą.</li>
            </ul>
        `;
        const cleaned = sanitizeSection6Html(dirtyHtml);
        assert.strictEqual(cleaned.includes('P102:'), false, 'Pozostał dwukropek po kodzie P102:');
        assert.ok(cleaned.includes('P102 – Chronić przed dziećmi.'), 'Brak półpauzy po P102');
        assert.ok(cleaned.includes('Wytyczne bezpieczeństwa (GPSR)'), 'Usunięto poprawną etykietę GPSR');
    });

    await t.test('ADR-0165/ADR-0168: Chemia H319 generuje Hasło ostrzegawcze z myślnikiem, P264 (bez przemysłowego P280) i nierozerwalne formuły kombinowane', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Płyn do prania uniwersalny 1,5L',
            inci: 'Aqua, Sodium Laureth Sulfate, Parfum, Limonene',
            isChemical: true,
            compliance: { clp_signal_word: 'UWAGA', clp_h_phrases: ['H319 – Działa drażniąco na oczy.'] }
        });

        // 1. Hasło ostrzegawcze z myślnikiem (nie z dwukropkiem!)
        assert.ok(res.warnings.includes('Hasło ostrzegawcze – UWAGA'), 'Brak Hasło ostrzegawcze – UWAGA');
        assert.strictEqual(res.warnings.includes('Hasło ostrzegawcze: UWAGA'), false, 'Wykryto błędny dwukropek w hasle ostrzegawczym');

        // 2. Prewencja P264 (bez przemysłowego P280 o ochronie twarzy dla chemii domowej)
        assert.ok(res.warnings.includes('P264 – Dokładnie umyć ręce po użyciu.'), 'Brak obowiązkowego kodu prewencji P264');
        assert.strictEqual(res.warnings.some(w => w.startsWith('P280')), false, 'Konsumencka chemia domowa nie może zawierać przemysłowego kodu P280');

        // 3. Pełne formuły kombinowane
        assert.ok(res.warnings.some(w => w.startsWith('P301+P312 – ')), 'Brak pełnej formuły P301+P312');
        assert.ok(res.warnings.some(w => w.startsWith('P305+P351+P338 – ')), 'Brak pełnej formuły P305+P351+P338');
        assert.ok(res.warnings.some(w => w.startsWith('P337+P313 – ')), 'Brak pełnej formuły P337+P313');

        // 4. Zakaz osieroconych kodów nagłówkowych bez dopełnienia
        for (const w of res.warnings) {
            assert.strictEqual(/^P301\s*–/i.test(w), false, `Wykryto rozszczepiony kod P301: ${w}`);
            assert.strictEqual(/^P305\s*–/i.test(w), false, `Wykryto rozszczepiony kod P305: ${w}`);
            assert.strictEqual(/^P337\s*–/i.test(w), false, `Wykryto rozszczepiony kod P337: ${w}`);
        }
    });

    await t.test('ADR-0165: splitCombinedPPhrases scala rozszczepione pojedyncze kody z bazy w formuły kombinowane', () => {
        const rawFragmented = ['P301', 'P312', 'P305', 'P351', 'P338', 'P337', 'P313', 'P264', 'P280'];
        const consolidated = gpsrSafetyService.splitCombinedPPhrases(rawFragmented);

        assert.ok(consolidated.some(p => p.startsWith('P301+P312 – ')), 'Nie scalono P301 i P312');
        assert.ok(consolidated.some(p => p.startsWith('P305+P351+P338 – ')), 'Nie scalono P305, P351 i P338');
        assert.ok(consolidated.some(p => p.startsWith('P337+P313 – ')), 'Nie scalono P337 i P313');

        // Żaden z pojedynczych kodów nagłówkowych nie pozostał osierocony
        assert.strictEqual(consolidated.some(p => p === 'P301' || p.startsWith('P301 –')), false);
        assert.strictEqual(consolidated.some(p => p === 'P305' || p.startsWith('P305 –')), false);
        assert.strictEqual(consolidated.some(p => p === 'P337' || p.startsWith('P337 –')), false);
    });

    await t.test('ADR-0165: sanitizeSection6Html normalizuje Ostrzeżenie CLP na Ostrzeżenie CLP/GPSR oraz myślnik w haśle', () => {
        const { sanitizeSection6Html } = require('../orchestrator.js');
        const rawHtml = `
            <h2>⚠️ Bezpieczeństwo i informacje GPSR</h2>
            <ul>
                <li>➡️ <b>Ostrzeżenie CLP:</b> Hasło ostrzegawcze: UWAGA</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P102 – Chronić przed dziećmi.</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P301 – W PRZYPADKU POŁKNIĘCIA:</li>
                <li>➡️ <b>Ostrzeżenie CLP:</b> P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.</li>
            </ul>
        `;
        const cleaned = sanitizeSection6Html(rawHtml);

        assert.ok(cleaned.includes('<b>Ostrzeżenie CLP/GPSR:</b>'), 'Nie zamieniono Ostrzeżenie CLP na Ostrzeżenie CLP/GPSR');
        assert.strictEqual(cleaned.includes('<b>Ostrzeżenie CLP:</b>'), false, 'Pozostał niekompletny tag Ostrzeżenie CLP:');
        assert.ok(cleaned.includes('Hasło ostrzegawcze – UWAGA'), 'Nie znormalizowano hasła ostrzegawczego do myślnika');
        assert.strictEqual(cleaned.includes('P301 – W PRZYPADKU POŁKNIĘCIA:</li>'), false, 'Nie wyczyszczono osieroconego nagłówka P301');
    });

    await t.test('Cif Candeggina 650 ml (chlorowy środek czyszczący): klasyfikacja jako HOUSEHOLD_CHEMICAL, pełny blok CLP i obowiązkowy zwrot EUH206', () => {
        const res = gpsrSafetyService.generateGpsrWarnings({
            productName: 'CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML',
            inci: 'Aqua, Sodium Hypochlorite, Sodium C14-17 Alkyl Sec Sulfonate, Sodium Hydroxide, Sodium Silicate, Sodium Carbonate, Sodium Chloride, Parfum',
            isChemical: false,
            features: {
                'Przeznaczenie': 'uniwersalne czyszczenie powierzchni (multiuso)'
            }
        });

        assert.ok(res.detected_risks.includes('HOUSEHOLD_CHEMICAL'), 'Cif Candeggina musi zostać sklasyfikowany jako HOUSEHOLD_CHEMICAL');
        assert.ok(res.detected_risks.includes('CHLORINE_BLEACH_EUH206'), 'Musi wykryć ryzyko wydzielania chloru z podchlorynu sodu (EUH206)');
        assert.ok(res.warnings.includes('Hasło ostrzegawcze – UWAGA'), 'Brak hasła ostrzegawczego UWAGA');
        assert.ok(res.warnings.some(w => w.startsWith('H315 – ')), 'Brak zwrotu H315 (działanie drażniące na skórę)');
        assert.ok(res.warnings.some(w => w.startsWith('H319 – ')), 'Brak zwrotu H319 (działanie drażniące na oczy)');
        assert.ok(res.warnings.some(w => w.startsWith('P102 – ')), 'Brak zwrotu P102');
        assert.ok(res.warnings.some(w => w.startsWith('P264 – ')), 'Brak zwrotu P264');
        assert.ok(res.warnings.includes('P280 – Stosować rękawice ochronne.'), 'Środek żrący/chlorowy z NaOH i NaOCl musi bezwzględnie wymagać rękawic ochronnych (P280)');
        assert.strictEqual(res.warnings.some(w => /ochronę oczu|mask/i.test(w)), false, 'Konsumencka chemia domowa nie może zawierać przemysłowego nakazu masek ani gogli');
        assert.ok(res.warnings.some(w => w.startsWith('P302+P352 – ')), 'Brak zwrotu P302+P352');
        assert.ok(res.warnings.some(w => w.startsWith('P305+P351+P338 – ')), 'Brak zwrotu P305+P351+P338');
        assert.ok(res.warnings.some(w => w.startsWith('EUH206 – Uwaga! Nie stosować razem z innymi produktami. Może wydzielać niebezpieczne gazy (chlor).')), 'Brak obowiązkowego zwrotu EUH206 dla wybielacza chlorowego');
        assert.strictEqual(res.warnings.some(w => /uszkodzoną skórę|podrażnioną skórę/i.test(w)), false, 'Środek chemiczny z wybielaczem nie może mieć ostrzeżeń kosmetycznych o podrażnionej skórze');
    });

    await t.test('Back-of-Pack SSOT: Odtłuszczacz do piekarnika i środek żrący wymaga rękawic ochronnych, a walidator blokuje halucynację maski i gogli', () => {
        const { validate_domain_and_chemical_logic } = require('../validators/index.js');
        const deterministicEngine = require('../services/deterministic-pipeline.engine.js');

        // 1. Odczyt z tylnej etykiety w PIM (Ostrzeżenia + Sposób użycia)
        const resOven = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Chanteclair Sgrassatore Forni e Grill 500 ml - Płyn do czyszczenia piekarnika',
            inci: 'Aqua, Potassium Hydroxide, Non-ionic surfactants <5%',
            isChemical: true,
            features: {
                'Ostrzeżenia': 'UWAGA. Działa drażniąco na skórę i oczy. Chronić przed dziećmi. Stosować rękawice ochronne. Nie wdychać rozpylonej cieczy.',
                'Sposób użycia': 'Załóż rękawice ochronne. Spryskaj wystudzony piekarnik z odległości 20 cm, pozostaw na 10 minut i zmyj wilgotną gąbką.'
            }
        });

        assert.ok(resOven.detected_risks.includes('PROTECTIVE_GLOVES_REQUIRED'), 'Musi wykryć obowiązek rękawic ochronnych');
        assert.ok(resOven.warnings.includes('P280 – Stosować rękawice ochronne.'), 'Brak wymogu rękawic ochronnych P280');
        assert.strictEqual(resOven.warnings.some(w => /mask|gogl|okular/i.test(w)), false, 'Zakaz halucynowania maski lub okularów ochronnych przy czyszczeniu piekarnika');

        // 2. Walidator odrzuca halucynację maski i okularów w Sekcji 4
        const badMaskCheck = validate_domain_and_chemical_logic({
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Załóż maskę ochronną i okulary ochronne przed czyszczeniem piekarnika.</li></ol>',
            section_6_html: '<h2>⚠️ Bezpieczeństwo</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Nie połykać.</li><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować rękawice ochronne.</li></ul>'
        }, {
            productName: 'Płyn do czyszczenia piekarnika 500 ml',
            inci: 'Aqua, Potassium Hydroxide',
            isChemical: true,
            requiresProtectiveGloves: true
        });
        assert.strictEqual(badMaskCheck.valid, false, 'Walidator musi zablokować halucynację maski i okularów');
        assert.ok(badMaskCheck.errors.some(e => e.includes('[Halucynacja BHP / Nadmiarowa ochrona]')), 'Brak błędu o halucynacji maski/okularów');

        // 3. Walidator odrzuca brak rękawic ochronnych przy środku żrącym
        const missingGlovesCheck = validate_domain_and_chemical_logic({
            section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Nanieś preparat na zabrudzoną powierzchnię.</li></ol><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> Nie stosować na aluminium.</p>',
            section_6_html: '<h2>⚠️ Bezpieczeństwo</h2><ul><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Nie połykać.</li><li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li></ul>'
        }, {
            productName: 'Żel żrący z wodorotlenkiem sodu 750 ml',
            inci: 'Aqua, Sodium Hydroxide, Sodium Hypochlorite',
            isChemical: true,
            requiresProtectiveGloves: true
        });
        assert.strictEqual(missingGlovesCheck.valid, false, 'Walidator musi odrzucić brak rękawic ochronnych przy środku żrącym');
        assert.ok(missingGlovesCheck.errors.some(e => e.includes('[Brak wymogu rękawic ochronnych w Sekcji 6]')), 'Brak błędu o rękawicach w Sekcji 6');
        assert.ok(missingGlovesCheck.errors.some(e => e.includes('[Brak wymogu rękawic ochronnych w Sekcji 4]')), 'Brak błędu o rękawicach w Sekcji 4');

        // 4. Deterministyczna sanityzacja zamienia halucynowaną maskę i okulary na rękawice i wietrzenie
        const sanitizedS4 = deterministicEngine.sanitizeHtmlClaimsAndStopwords(
            '<p>Przed aplikacją załóż maskę ochronną i okulary ochronne.</p>',
            { productName: 'Płyn do piekarnika' }
        );
        assert.strictEqual(/maskę|okulary/i.test(sanitizedS4), false, 'Sanitizer nie usunął halucynowanej maski i okularów');
        assert.ok(/rękawice ochronne/i.test(sanitizedS4), 'Sanitizer nie zastąpił maski rękawicami ochronnymi');
    });

    await t.test('REGRESJA Dual Power WC Gel H314 (ADR-0173): Brudny zrzut CLP/GPSR, literówka KONTATKU, rozbity P303, wyciek INCI i kolejność Nie połykać', () => {
        const deterministicEngine = require('../services/deterministic-pipeline.engine.js');
        const { sanitizeSection6Html } = require('../orchestrator.js');
        const { validate_section6_compliance } = require('../validators/index.js');

        // 1. Symulacja dokładnie takiego brudnego wejścia z Vision/PIM, jakie rozbiło Sekcję 6 na produkcji
        const dirtyWarnings = [
            'H314 Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.',
            'H412 Działa szkodliwie na organizmy wodne, powodując długotrwałe skutki.',
            'P102 Chronić przed dziećmi.',
            'P280 Stosować rękawice ochronne / ochronę oczu / ochronę twarzy.',
            'P301+P312 W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.',
            'P301+P330+P331 W PRZYPADKU POŁKNIĘCIA: wypłukać usta.',
            'NIE wywoływać wymiotów.',
            'Nie połykać.',
            'P302+P352 W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody.',
            'P303+P361+P353 – W PRZYPADKU KONTATKU ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież.',
            'Spłukać skórę pod strumieniem wody lub prysznicem.',
            'P305+P351+P338 W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut.',
            'EUH206 – Uwaga! Nie stosować razem z innymi produktami. Może uwalniać niebezpieczne gazy (chlor).',
            'Może uwalniać niebezpieczne gazy (chlor).',
            'alkohole C12-14, etoksylowane, siarczanowane, sole sodowe.'
        ].join('\n');

        const resWc = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Dual Power żel do WC Candeggina 700 ml',
            inci: '< 5% fosfoniany, środki wybielające na bazie chloru, anionowe środki powierzchniowo czynne, amfoteryczne środki powierzchniowo czynne, kompozycja zapachowa. Zawiera: Sodium Hydroxide, Alcohols, C12-14, ethoxylated, sulfates, sodium salts',
            isChemical: true,
            pimWarnings: dirtyWarnings
        });

        const joinedWarnings = resWc.warnings.join('\n');

        // A. Literówka KONTATKU oraz niedozwolone na Allegro KONTAKTU muszą zniknąć na rzecz STYCZNOŚCI
        assert.strictEqual(/KONTATKU|KONTAKTU/i.test(joinedWarnings), false, `Literówka lub fraza KONTAKTU przetrwała: ${joinedWarnings}`);
        assert.ok(
            resWc.warnings.some(w => w.includes('P303+P361+P353') && w.includes('W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ') && w.includes('Spłukać skórę pod strumieniem wody lub prysznicem')),
            `P303+P361+P353 nie zostało scalone lub kanonizowane: ${joinedWarnings}`
        );

        // B. Zakaz urwanych sierot i zdublowanych/wyciekłych linii z SDS
        assert.strictEqual(resWc.warnings.some(w => /^Spłukać skórę pod strumieniem wody/i.test(w)), false, 'Sierota P303 (Spłukać skórę...) pojawiła się jako osobny punkt');
        assert.strictEqual(resWc.warnings.some(w => /^NIE wywoływać wymiotów/i.test(w)), false, 'Sierota P331 (NIE wywoływać wymiotów) pojawiła się poza P301+P330+P331');
        assert.strictEqual(resWc.warnings.some(w => /^Może uwalniać niebezpieczne gazy/i.test(w)), false, 'Duplikat chloru EUH206 pojawił się jako osobny punkt');
        assert.strictEqual(resWc.warnings.some(w => /alkohole C12-14|siarczanowane|etoksylowane/i.test(w)), false, 'Surowy składnik chemiczny SDS wyciekł do ostrzeżeń CLP');

        // C. Dla substancji żrącej H314 nie mogą współistnieć łagodne P301+P312 ani P302+P352
        assert.strictEqual(resWc.warnings.some(w => /^P301\+P312\b/i.test(w)), false, 'Zdublowane/łagodniejsze P301+P312 nie może występować obok H314 / P301+P330+P331');
        assert.strictEqual(resWc.warnings.some(w => /^P302\+P352\b/i.test(w)), false, 'Zdublowane/łagodniejsze P302+P352 nie może występować obok H314 / P303+P361+P353');

        // D. Ochrona oczu dla żrącego H314 w P280 musi zostać zachowana
        assert.ok(resWc.warnings.some(w => w.startsWith('P280') && /ochronę oczu|twarzy/i.test(w)), `P280 dla H314 straciło ochronę oczu: ${joinedWarnings}`);

        // E. Umiejscowienie "Nie połykać." zaraz po P102 (nie pomiędzy procedurami ratunkowymi P301 i P303)
        const idxP102 = resWc.warnings.findIndex(w => /^P102\b/.test(w));
        const idxNoSwallow = resWc.warnings.findIndex(w => /^Nie połykać\.?$/i.test(w.trim()));
        const idxP301 = resWc.warnings.findIndex(w => /^P301/.test(w));
        assert.ok(idxP102 !== -1 && idxNoSwallow !== -1 && idxP301 !== -1, 'Brak P102, Nie połykać lub P301');
        assert.ok(idxNoSwallow === idxP102 + 1 && idxNoSwallow < idxP301, `Nie połykać powinno stać zaraz po P102 (idxP102=${idxP102}, idxNoSwallow=${idxNoSwallow}, idxP301=${idxP301})`);

        // 2. Deterministyczna Sekcja 6 + sanityzator Orchestratora na brudnym HTML-u produkcyjnym (symulacja dokładnie 6 usterek z produkcji)
        const brokenProductionHtml = [
            '<h2>⚠️ Ostrzeżenia bezpieczeństwa</h2><ul>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H314 – Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P102 – Chronić przed dziećmi.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P280 – Stosować rękawice ochronne / ochronę oczu / ochronę twarzy.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301+P330+P331 – W PRZYPADKU POŁKNIĘCIA: wypłukać usta.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> NIE wywoływać wymiotów.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Nie połykać.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z lekarzem.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P302+P352 – W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P303+P361+P353 – W PRZYPADKU KONTATKU ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Spłukać skórę pod strumieniem wody lub prysznicem.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> alkohole C12-14, etoksylowane, siarczanowane, sole sodowe.</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> EUH206 – Uwaga! Nie stosować razem z innymi produktami. Może uwalniać niebezpieczne gazy (chlor).</li>',
            '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Może uwalniać niebezpieczne gazy (chlor).</li>',
            '</ul>'
        ].join('\n');

        const repairedS6 = sanitizeSection6Html(brokenProductionHtml);
        const s6Check = validate_section6_compliance(repairedS6, { productName: 'Dual Power żel do WC Candeggina 700 ml', isChemical: true });
        assert.strictEqual(s6Check.valid, true, `Naprawiona Sekcja 6 nie przeszła walidacji compliance: ${s6Check.errors.join(' | ')}`);
        assert.ok(/P280.*ochronę oczu/i.test(repairedS6), 'sanitizeSection6Html wyciął ochronę oczu dla H314');
        assert.strictEqual(/P301\+P312|P302\+P352|KONTATKU|alkohole C12-14/i.test(repairedS6), false, 'sanitizeSection6Html przepuścił nieusunięte usterki CLP');

        // 3. Test regresyjny braku kolizji na kosmetyku ("Zawiera witaminę A" nie może zostać wycięte)
        const cosmeticRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Krem odmładzający z retinolem 50 ml',
            inci: 'Aqua, Glycerin, Retinol, Tocopherol'
        });
        assert.ok(cosmeticRes.warnings.some(w => /Zawiera witaminę A/i.test(w)), 'Filtr surowych składników z SDS uszkodził legalne ostrzeżenie kosmetyczne o retinoidach');
    });
});

test('ADR-0174: Regresja Dual Power Frytkownice (brak kolizji -nic z nicią dentystyczną) + wierność 1:1 etykiecie EUH208', async (t) => {
    await t.test('A. Wyraz "frytkownic" i "chłodnic" nie aktywuje gałęzi nici dentystycznej; prawdziwa nić nadal działa', () => {
        const airFryerRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Dual Power środek do czyszczenia frytkownic 500 ml',
            inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone)',
            isChemical: true,
            features: {
                'Ostrzeżenia': 'P101 W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę. P102 Chronić przed dziećmi. P103 Uważnie przeczytaj i przestrzegaj wszystkich instrukcji. Zawiera: Mieszanina 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu. Może powodować wystąpienie reakcji alergicznej.'
            }
        });
        assert.strictEqual(airFryerRes.detected_risks.includes('DENTAL_FLOSS_SAFETY'), false, `Słowo "frytkownic" błędnie aktywowało DENTAL_FLOSS_SAFETY: ${airFryerRes.warnings.join(' | ')}`);
        assert.strictEqual(airFryerRes.warnings.some(w => /krwawien|dziąs|pomiędzy zębami/i.test(w)), false, 'Środek do frytkownic otrzymał ostrzeżenia dla nici dentystycznych!');

        const radiatorRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Płyn do czyszczenia chłodnic samochodowych 500 ml',
            inci: 'Aqua, Citric Acid, Non-ionic surfactants',
            isChemical: true
        });
        assert.strictEqual(radiatorRes.detected_risks.includes('DENTAL_FLOSS_SAFETY'), false, 'Słowo "chłodnic" błędnie aktywowało DENTAL_FLOSS_SAFETY');

        const realFlossRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Nić dentystyczna woskowana miętowa 50m',
            inci: ''
        });
        assert.strictEqual(realFlossRes.detected_risks.includes('DENTAL_FLOSS_SAFETY'), true, 'Prawdziwa nić dentystyczna musi aktywować DENTAL_FLOSS_SAFETY');
    });

    await t.test('B. EUH208 zachowuje 1:1 etykietę producenta (ABC -> ABC) bez dopisywania BIT spoza deklaracji CLP, a bez etykiety wyprowadza pełną listę z INCI', () => {
        const labelledRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Dual Power środek do czyszczenia frytkownic 500 ml',
            inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone)',
            isChemical: true,
            features: {
                'Ostrzeżenia': 'P101 W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę. P102 Chronić przed dziećmi. Contains Mixture of: 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one. May produce an allergic reaction.'
            }
        });
        const labelledEuh = labelledRes.warnings.filter(w => /EUH208/i.test(w));
        assert.strictEqual(labelledEuh.length, 1, `Powinien być dokładnie jeden wpis EUH208 z etykiety producenta, otrzymano: ${labelledEuh.join(' | ')}`);
        assert.strictEqual(/benzisothiazolinone/i.test(labelledEuh[0]), false, `Do EUH208 z etykiety bezprawnie dopisano BIT mimo progu SCL producenta: ${labelledEuh[0]}`);
        assert.ok(/isothiazol/i.test(labelledEuh[0]), `EUH208 powinno zachować deklarację producenta dot. MCI/MI: ${labelledEuh[0]}`);

        const labelledResPlColon = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Dual Power środek do czyszczenia frytkownic 500 ml',
            inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone)',
            isChemical: true,
            features: {
                'Ostrzeżenia': 'P101 W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę. P102 Chronić przed dziećmi. P103 Uważnie przeczytać wszystkie instrukcje i zastosować się do nich. EUH208 Zawiera: Mieszanina 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu. Może powodować wystąpienie reakcji alergicznej.'
            }
        });
        const labelledEuhPlColon = labelledResPlColon.warnings.filter(w => /EUH208/i.test(w));
        assert.strictEqual(labelledEuhPlColon.length, 1, `Powinien być dokładnie 1 wpis EUH208 dla polskiego zapisu z dwukropkiem, otrzymano: ${labelledEuhPlColon.join(' | ')}`);
        assert.strictEqual(/benzisothiazolinone/i.test(labelledEuhPlColon[0]), false, `Nie wolno dopisywać BIT do EUH208 z polskiej etykiety "Zawiera:": ${labelledEuhPlColon[0]}`);

        const unlabelledRes = gpsrSafetyService.generateGpsrWarnings({
            productName: 'Detergent testowy bez etykiety EUH208 500 ml',
            inci: '5-15% Anionic surfactants, Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone',
            isChemical: true
        });
        const unlabelledEuh = unlabelledRes.warnings.find(w => /EUH208/i.test(w)) || '';
        assert.ok(/Benzisothiazolinone/i.test(unlabelledEuh) && /Methylchloroisothiazolinone/i.test(unlabelledEuh), `Bez gotowego EUH208 z etykiety należy wyprowadzić oba alergeny z INCI: ${unlabelledEuh}`);
    });
});



