const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isGenericCategoryWordNotLine,
    resolveLabelPhysicalForm,
    normalizeFabricSoftenerTerminology,
    validateDosageYieldMath
} = require('../services/label-truth.helpers');
const {
    sanitizeLabelHighlights,
    getHighlightSemanticCluster
} = require('../services/allegro-compliance.policy');
const {
    resolveCanonicalProductName,
    buildDeterministicSection5
} = require('../services/deterministic-pipeline.engine');
const {
    sanitizeSection5Html
} = require('../orchestrator');
const {
    mapPackagingFeaturesToAllegroSchema
} = require('../services/allegro-param-automapper.service');
const {
    validate_section5_compliance,
    validate_domain_and_chemical_logic
} = require('../validators');
const {
    extractVerifiedPackagingFacts
} = require('../../../services/workspaceContentProfile.service');

test('ADR-0201: Soft Detersivo Total Black (8003640022274) — kanoniczna nazwa i czysta Sekcja 5 bez płyn żel i duplikatów', () => {
    const product = {
        name: 'Soft Detersivo Total Black Płyn Żel do Prania Czarnego Ciemnego 2 25 l 50',
        brand: 'Soft',
        capacity: '2250 ml',
        features: {
            Marka: 'Soft',
            Typ: 'Płyn Żel',
            Postać: 'żel',
            Pojemność: '2.25 l',
            Wydajność: '50 prań',
            'Liczba sztuk (Etykieta)': '57 prań',
            'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black',
            'Linia produktowa (Front)': 'Detersivo',
            'Wariant (Etykieta Front)': 'Total Black',
            'Wyróżniki (Etykieta Front)': 'Działa w niskich temperaturach, Skuteczne usuwanie plam, butelka wykonana z plastiku z recyklingu, formuła aktywna w niskich temperaturach (na zimno), skuteczny w niskiej temperaturze',
            'Przeznaczenie (Front)': 'do prania tkanin czarnych i ciemnych'
        },
        visionFeatures: {
            Marka: 'Soft',
            'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black',
            'Linia produktowa (Front)': 'Detersivo',
            'Wariant (Etykieta Front)': 'Total Black',
            'Postać (Etykieta)': 'płyn',
            Wydajność: '50 prań',
            'Pojemność / Waga': '2250 ml',
            'Wyróżniki (Etykieta Front)': 'Działa w niskich temperaturach, Skuteczne usuwanie plam, butelka wykonana z plastiku z recyklingu, formuła aktywna w niskich temperaturach (na zimno), skuteczny w niskiej temperaturze'
        }
    };

    assert.equal(resolveLabelPhysicalForm({ rawProductName: 'Viakal odkamieniacz classic 800 ml' }).canonicalForm, '');

    const formResolution = resolveLabelPhysicalForm({
        visionFeatures: product.visionFeatures,
        features: product.features,
        officialLabelName: product.features['Nazwa produktu (Etykieta Front)'],
        rawProductName: product.name
    });
    assert.equal(formResolution.isVerifiedFromLabel, true);
    assert.equal(formResolution.canonicalForm, 'płyn');

    assert.equal(isGenericCategoryWordNotLine('Detersivo'), true);
    assert.equal(isGenericCategoryWordNotLine('Ammorbidente'), true);
    assert.equal(isGenericCategoryWordNotLine('Total Black'), false);

    const canonical = resolveCanonicalProductName({
        productName: product.name,
        brand: product.brand,
        capacity: product.capacity,
        visionFeatures: product.visionFeatures,
        features: product.features
    });
    assert.equal(/żel/i.test(canonical), false, `Kanoniczna nazwa nie może zawierać "żel": ${canonical}`);
    assert.equal(/\bpłyn\b/i.test(canonical), true, `Kanoniczna nazwa powinna wskazywać "płyn": ${canonical}`);
    assert.equal(/\b2\s+25\s*l\b/i.test(canonical), false, `Nie może zostawać urwana pojemność "2 25 l": ${canonical}`);

    const s5Html = buildDeterministicSection5({
        gtin: '8003640022274',
        productName: product.name,
        brand: 'Soft',
        manufacturer: 'Soft S.p.A.',
        capacity: '2250 ml',
        features: product.features,
        visionFeatures: product.visionFeatures
    });

    assert.match(s5Html, /<b>Postać fizyczna:<\/b>\s*płyn<\/li>/i);
    assert.equal(/płyn\s*żel/i.test(s5Html), false);
    assert.equal(/Linia produktowa:<\/b>\s*Detersivo/i.test(s5Html), false);
    assert.equal(/Skuteczne usuwanie plam/i.test(s5Html), false);

    // Tylko jeden wyróżnik z klastra niskich temperatur powinien przetrwać deduplikację
    const highlightsMatch = s5Html.match(/Właściwości i wyróżniki:<\/b>\s*([^<]+)/i);
    assert.ok(highlightsMatch && highlightsMatch[1], 'Sekcja 5 powinna zawierać wyróżniki');
    const highlightItems = highlightsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const lowTempCount = highlightItems.filter(item => getHighlightSemanticCluster(item) === 'LOW_TEMP').length;
    assert.equal(lowTempCount, 1, `Powinna zostać dokładnie 1 cecha niskotemperaturowa zamiast ${lowTempCount}: ${highlightsMatch[1]}`);

    const valClean = validate_section5_compliance(s5Html, {
        product_name: canonical,
        brand: 'Soft',
        manufacturer: 'Soft S.p.A.',
        require_manufacturer: true,
        features: product.features,
        vision_features: product.visionFeatures
    });
    assert.equal(valClean.valid, true, `Oczyszczona S5 powinna przejść walidację: ${valClean.errors.join('; ')}`);
});

test('ADR-0201: sanitizeSection5Html i validate_section5_compliance naprawiają i blokują błędy S5', () => {
    const dirtyS5 = `<h2>⚖️ Specyfikacja techniczna i parametry produktu</h2><ul>
<li>➡️ <b>Nazwa produktu:</b> Soft Detersivo Total Black płyn żel do prania 2250 ml</li>
<li>➡️ <b>Marka:</b> Soft</li>
<li>➡️ <b>Linia produktowa:</b> Detersivo</li>
<li>➡️ <b>Postać fizyczna:</b> żel</li>
<li>➡️ <b>Właściwości i wyróżniki:</b> Działa w niskich temperaturach, formuła aktywna w niskich temperaturach (na zimno), Skuteczne usuwanie plam</li>
<li>➡️ <b>Producent:</b> Soft S.p.A.</li>
</ul>`;

    const ctx = {
        product_name: 'Soft Detersivo Total Black płyn do prania czarnego i ciemnego 2250 ml',
        brand: 'Soft',
        features: {
            'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black',
            'Linia produktowa (Front)': 'Detersivo',
            'Postać (Etykieta)': 'płyn'
        },
        vision_features: {
            'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black',
            'Linia produktowa (Front)': 'Detersivo',
            'Postać (Etykieta)': 'płyn'
        }
    };

    const failRes = validate_section5_compliance(dirtyS5, ctx);
    assert.equal(failRes.valid, false);
    assert.ok(failRes.errors.some(e => /płyn żel|Niezgodna postać/i.test(e)));
    assert.ok(failRes.errors.some(e => /Detersivo/i.test(e)));
    assert.ok(failRes.errors.some(e => /Semantyczny duplikat/i.test(e)));

    const sanitizedS5 = sanitizeSection5Html(dirtyS5, ctx);
    assert.match(sanitizedS5, /<b>Postać fizyczna:<\/b>\s*płyn<\/li>/i);
    assert.equal(/płyn\s+żel/i.test(sanitizedS5), false);
    assert.equal(/Linia produktowa:<\/b>\s*Detersivo/i.test(sanitizedS5), false);

    const passRes = validate_section5_compliance(sanitizedS5, ctx);
    assert.equal(passRes.valid, true, `Po sanitizeSection5Html błędy powinny zniknąć: ${passRes.errors.join('; ')}`);
});

test('ADR-0201: Matematyka dozowania (validateDosageYieldMath) oraz Check 33 i filtr ekstrakcji PIM', () => {
    const capacity = '2250 ml';
    const yieldText = '50 prań';

    const hallucinatedUsage = 'Dozowanie do pralki (pojemność nakrętki wynosi 75 ml). Na wsad 4–5 kg tkanin wlej: dla wody miękkiej 50 ml, średniej 68 ml, a twardej 90 ml. Na wsad 6–8 kg: dla wody miękkiej 68 ml, średniej 90 ml, a twardej 115 ml.';
    const badRes = validateDosageYieldMath({ capacityText: capacity, yieldText, usageText: hallucinatedUsage });
    assert.equal(badRes.valid, false);
    assert.equal(badRes.expectedDoseMl, 45);
    assert.equal(badRes.actualMediumDoseMl, 68);

    const trueLabelUsage = 'Pojemność nakrętki: 50 ml. Wsad 4–5 kg: zabrudzenia średnie — woda miękka 35 ml, woda średnia 45 ml, woda twarda 60 ml; zabrudzenia mocne — woda miękka 55 ml, woda średnia 65 ml, woda twarda 80 ml. Pranie ręczne: 45 ml w 10 l wody.';
    const okRes = validateDosageYieldMath({ capacityText: capacity, yieldText, usageText: trueLabelUsage });
    assert.equal(okRes.valid, true);

    const badS4Html = `<h2>✍️ Sposób użycia i zalecenia aplikacji</h2><ol><li>✍️ <b>Krok 1:</b> Przygotuj pranie.</li><li>✍️ <b>Krok 2:</b> Wlej środek (pojemność nakrętki wynosi 75 ml). Na wsad 4-5 kg: woda miękka 50 ml, woda średnia 68 ml, twarda 90 ml.</li></ol>`;
    const domainBad = validate_domain_and_chemical_logic(
        { section_4_html: badS4Html, section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Postać fizyczna:</b> płyn</li></ul>' },
        { productName: 'Soft Detersivo Total Black 2250 ml', capacity: '2250 ml', yield: '50 prań', visionFeatures: { 'Postać (Etykieta)': 'płyn', 'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black' } }
    );
    assert.equal(domainBad.valid, false);
    assert.ok(domainBad.errors.some(e => /matematyki dozowania/i.test(e)));

    const goodS4Html = `<h2>✍️ Sposób użycia i zalecenia aplikacji</h2><ol><li>✍️ <b>Krok 1:</b> Przygotuj pranie.</li><li>✍️ <b>Krok 2:</b> Odmierz nakrętką (50 ml). Na wsad 4–5 kg przy średnich zabrudzeniach wlej dla wody miękkiej 35 ml, woda średnia: 45 ml, woda twarda: 60 ml.</li></ol>`;
    const domainGood = validate_domain_and_chemical_logic(
        { section_4_html: goodS4Html, section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Postać fizyczna:</b> płyn</li></ul>' },
        { productName: 'Soft Detersivo Total Black 2250 ml', capacity: '2250 ml', yield: '50 prań', visionFeatures: { 'Postać (Etykieta)': 'płyn', 'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black' } }
    );
    assert.equal(domainGood.errors.some(e => /matematyki dozowania/i.test(e)), false);

    // Współdzielenie faktów między workspace'ami nie może propagować zatrutego Sposób użycia
    const poisonedSiblingFacts = extractVerifiedPackagingFacts({
        features: {
            'Pojemność': '2250 ml',
            'Wydajność': '50 prań',
            'Postać (Etykieta)': 'płyn',
            'Pojemność nakrętki (Etykieta)': '50 ml',
            'Sposób użycia': hallucinatedUsage
        }
    });
    assert.equal(poisonedSiblingFacts.features['Postać (Etykieta)'], 'płyn');
    assert.equal(poisonedSiblingFacts.features['Pojemność nakrętki (Etykieta)'], '50 ml');
    assert.equal(poisonedSiblingFacts.features['Sposób użycia'], undefined);
});

test('ADR-0201: Automapper nadpisuje błędną postać ze starych cech PIM prawdą z etykiety (z zachowaniem tarczy Dermomed)', () => {
    const allegroSchema = [
        { id: '225693', name: 'EAN (GTIN)', type: 'string', required: true },
        {
            id: '1001',
            name: 'Postać',
            type: 'dictionary',
            required: true,
            dictionary: [
                { id: '1', value: 'płyn' },
                { id: '2', value: 'żel' },
                { id: '3', value: 'proszek' }
            ]
        },
        { id: '1002', name: 'Typ', type: 'string', required: false },
        { id: '1003', name: 'Liczba sztuk w opakowaniu', type: 'integer', unit: 'szt.', required: false },
        { id: '1004', name: 'Liczba prań', type: 'integer', required: false }
    ];

    const res = mapPackagingFeaturesToAllegroSchema({
        allegroSchema,
        currentFeatures: {
            'Postać': 'żel',
            'Typ': 'Płyn Żel',
            'Liczba sztuk (Etykieta)': '57 prań',
            'Pojemność': '2.25 l',
            'Wydajność': '50 prań'
        },
        visionFront: {
            'Nazwa produktu (Etykieta Front)': 'Soft Detersivo Total Black',
            'Postać (Etykieta)': 'płyn',
            'Wydajność': '50 prań',
            'Pojemność / Waga': '2250 ml'
        },
        product: {
            ean: '8003640022274',
            name: 'Soft Detersivo Total Black Płyn Żel do Prania 2 25 l 50'
        }
    });

    assert.equal(res.updatedFeatures['Postać'], 'płyn');
    assert.equal(res.updatedFeatures['Typ'], 'płyn');
    assert.equal(res.updatedFeatures['Liczba sztuk w opakowaniu'], '1');
    assert.equal(res.updatedFeatures['Liczba prań'], '50');

    // Tarcza Dermomed Case B: bez twardego dowodu etykiety nie nadpisuje operatorskiego 'w płynie'
    const dermomedRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: [
            {
                id: '2001',
                name: 'Postać',
                type: 'dictionary',
                required: true,
                dictionary: [
                    { id: '10', value: 'w płynie' },
                    { id: '11', value: 'w kremie' }
                ]
            }
        ],
        currentFeatures: { 'Postać': 'w płynie' },
        visionFront: { 'Postać': 'w kremie' },
        product: { ean: '8005432100012', name: 'Dermomed Crema Doccia Sapone' }
    });
    assert.equal(dermomedRes.updatedFeatures['Postać'], 'w płynie');
});

test('ADR-0201: Płyn do płukania (Ammorbidente) — blokada "prać w pralce" / "płakanie", bezpieczna dla FAQ "podczas prania"', () => {
    assert.equal(
        normalizeFabricSoftenerTerminology('Prać w pralce oraz pranie ręczne (płakanie tkanin).'),
        'Płukać w pralce oraz płukanie ręczne (płukanie tkanin).'
    );

    const softenerS5Dirty = `<h2>⚖️ Specyfikacja techniczna i parametry produktu</h2><ul>
<li>➡️ <b>Nazwa produktu:</b> Coccolino Ammorbidente Concentrato płyn do prania 1450 ml</li>
<li>➡️ <b>Linia produktowa:</b> Ammorbidente</li>
<li>➡️ <b>Przeznaczenie:</b> Prać w pralce oraz pranie ręczne</li>
</ul>`;
    const sanitized = sanitizeSection5Html(softenerS5Dirty, {
        product_name: 'Coccolino skoncentrowany płyn do płukania tkanin 1450 ml',
        features: { 'Postać (Etykieta)': 'płyn', 'Linia produktowa (Front)': 'Ammorbidente' },
        vision_features: { 'Postać (Etykieta)': 'płyn', 'Linia produktowa (Front)': 'Ammorbidente' }
    });
    assert.match(sanitized, /Płukać w pralce/i);
    assert.equal(/prać w pralce|pranie ręczne|Linia produktowa:<\/b>\s*Ammorbidente/i.test(sanitized), false);

    // Check 15 ma odrzucić "prać w pralce" w S5/S4, ale przepuścić legalne FAQ "podczas prania w pralce"
    const invalidSoftener = validate_domain_and_chemical_logic({
        section_4_html: '<h2>✍️ Sposób użycia</h2><p>Wlej płyn i prać w pralce zgodnie z programem.</p>',
        section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Postać fizyczna:</b> płyn</li></ul>'
    }, {
        productName: 'Chanteclair Ammorbidente Muschio Bianco płyn do płukania tkanin',
        visionFeatures: { 'Postać (Etykieta)': 'płyn' }
    });
    assert.equal(invalidSoftener.valid, false);
    assert.ok(invalidSoftener.errors.some(e => /Ammorbidente|płukania/i.test(e)));

    const validSoftenerFaq = validate_domain_and_chemical_logic({
        section_2_html: '<h2>❓ Najczęstsze pytania</h2><ul><li>❓ <b>Pytanie:</b> Czy podczas prania w pralce należy wlać płyn do ostatniego płukania?</li><li>✔️ <b>Odpowiedź:</b> Tak, płyn wlewa się do przegrody na płyn do płukania na końcowy cykl płukania.</li></ul>',
        section_4_html: '<h2>✍️ Sposób użycia</h2><ol><li>✍️ <b>Krok 1:</b> Wlej do komory płukania przed płukaniem w pralce lub użyj w płukaniu ręcznym.</li></ol>',
        section_5_html: '<h2>⚖️ Specyfikacja</h2><ul><li>➡️ <b>Postać fizyczna:</b> płyn</li></ul>'
    }, {
        productName: 'Chanteclair Ammorbidente Muschio Bianco płyn do płukania tkanin',
        visionFeatures: { 'Postać (Etykieta)': 'płyn' }
    });
    assert.equal(validSoftenerFaq.errors.some(e => /Ammorbidente|nie jest detergentem piorącym/i.test(e)), false, `Legalne FAQ nie powinno wywołać błędu: ${validSoftenerFaq.errors.join('; ')}`);
});
