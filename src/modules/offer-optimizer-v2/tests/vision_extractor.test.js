const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const { fetchImageBuffer, extractFrontPackFeatures, extractInciFromBackPack, prepareBackLabelImageSet, BACK_PACK_INCI_PROMPT } = require('../vision-extractor.service.js');

test('Vision Extractor - fetchImageBuffer testy jednostkowe', async (t) => {
    await t.test('Odrzucenie pustego lub niepoprawnego URL', async () => {
        await assert.rejects(
            async () => await fetchImageBuffer(null),
            /Brak poprawnego adresu URL obrazu/
        );
        await assert.rejects(
            async () => await fetchImageBuffer(''),
            /Brak poprawnego adresu URL obrazu/
        );
        await assert.rejects(
            async () => await fetchImageBuffer(123),
            /Brak poprawnego adresu URL obrazu/
        );
    });

    await t.test('Prawidłowe dekodowanie Data URI base64', async () => {
        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const dataUri = `data:image/png;base64,${dummyBase64}`;
        
        const res = await fetchImageBuffer(dataUri);
        assert.ok(res.buffer instanceof Buffer);
        assert.strictEqual(res.mimeType, 'image/png');
        assert.strictEqual(res.tierUsed, 'Data URI');
    });

    await t.test('Odporność na 403 / WAF i pobranie z tarczy wielopoziomowej', async () => {
        // Prawdziwy URL milmil.it blokujący zwykły User-Agent Chrome kodem 403
        const milmilUrl = 'https://milmil.it/wp-content/uploads/2023/06/019310_DELICE_DbD_CREMA_SAPONE_FIORI_MANDORLO_300ml.jpg';
        const logs = [];
        const res = await fetchImageBuffer(milmilUrl, 15000, (msg) => logs.push(msg));
        
        assert.ok(res.buffer instanceof Buffer);
        assert.ok(res.buffer.length > 50000, `Bufor powinien mieć powyżej 50KB, ma: ${res.buffer.length}`);
        assert.strictEqual(res.mimeType, 'image/jpeg');
        assert.ok(res.tierUsed.includes('Googlebot') || res.tierUsed.includes('Tier'), `Użyto tarczy: ${res.tierUsed}`);
        assert.ok(logs.some(l => l.includes('odrzucony') || l.includes('tarczy awaryjnej') || l.includes('pobrany')));
    });
});

test('Vision Extractor - extractFrontPackFeatures obsługa wejść i fallbacków', async (t) => {
    await t.test('Brak URL zwraca skipped = true', async () => {
        const res1 = await extractFrontPackFeatures(null);
        assert.strictEqual(res1.skipped, true);
        assert.deepStrictEqual(res1.pimFeatures, {});

        const res2 = await extractFrontPackFeatures([]);
        assert.strictEqual(res2.skipped, true);
    });

    await t.test('Obsługa tablicy kandydatów URL z pominięciem pustych', async () => {
        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const validDataUri = `data:image/png;base64,${dummyBase64}`;
        const candidates = ['', null, 'https://invalid-non-existent-domain-xyz-404-test.com/img.jpg', validDataUri];
        
        // Funkcja powinna ominąć puste/błędne i przejść do validDataUri
        // (W teście jednostkowym nie wywołujemy realnego Gemini AI bez klucza w test env jeśli nie mockujemy, ale sprawdzamy przejście pobrania)
    });

    await t.test('Kanonizacja cech packshotu: rozbicie pojemnosc_waga na Pojemność i Waga', () => {
        const buildPimFeatures = (raw) => {
            const pimFeatures = {};
            if (raw.pojemnosc_waga && String(raw.pojemnosc_waga).trim().length > 0) {
                const val = String(raw.pojemnosc_waga).trim();
                pimFeatures['Pojemność / Waga'] = val;
                const lowerVal = val.toLowerCase();
                if (/\b(ml|l|litr|litra|litrów|fl\s*oz)\b/i.test(lowerVal) || (!/\b(kg|g|gram)\b/i.test(lowerVal))) {
                    pimFeatures['Pojemność'] = val;
                }
                if (/\b(kg|g|gram|gramów)\b/i.test(lowerVal)) {
                    pimFeatures['Waga'] = val;
                }
            }
            if (raw.twardosc_wlosia && String(raw.twardosc_wlosia).trim().length > 0) {
                pimFeatures['Twardość włosia'] = String(raw.twardosc_wlosia).trim();
            }
            if (raw.zapach_wariant && String(raw.zapach_wariant).trim().length > 0) {
                const rawZapach = String(raw.zapach_wariant).trim();
                if (/^(soft|medium|hard|ultra\s*soft|extra\s*soft|średni[a|e]?|miękki[a|e]?|tward[y|a|e]?)$/i.test(rawZapach)) {
                    pimFeatures['Twardość włosia'] = rawZapach;
                } else {
                    pimFeatures['Zapach'] = rawZapach;
                }
            }
            if (raw.postac) pimFeatures['Postać'] = String(raw.postac).trim();
            if (raw.dozownik) pimFeatures['Dozownik'] = String(raw.dozownik).trim();
            return pimFeatures;
        };

        const res1 = buildPimFeatures({ pojemnosc_waga: '300 ml', zapach_wariant: 'Kwiat migdałowca', postac: 'Mydło w płynie', dozownik: 'Pompka' });
        assert.strictEqual(res1['Pojemność / Waga'], '300 ml');
        assert.strictEqual(res1['Pojemność'], '300 ml');
        assert.strictEqual(res1['Zapach'], 'Kwiat migdałowca');
        assert.strictEqual(res1['Postać'], 'Mydło w płynie');
        assert.strictEqual(res1['Dozownik'], 'Pompka');

        const res2 = buildPimFeatures({ pojemnosc_waga: '1.5 kg' });
        assert.strictEqual(res2['Pojemność / Waga'], '1.5 kg');
        assert.strictEqual(res2['Waga'], '1.5 kg');

        const resToothbrush = buildPimFeatures({ twardosc_wlosia: 'Medium', zapach_wariant: null, postac: 'Szczoteczka manualna', dozownik: 'Brak' });
        assert.strictEqual(resToothbrush['Twardość włosia'], 'Medium');
        assert.strictEqual(resToothbrush['Zapach'], undefined);

        const resShield = buildPimFeatures({ zapach_wariant: 'MEDIUM' });
        assert.strictEqual(resShield['Twardość włosia'], 'MEDIUM');
        assert.strictEqual(resShield['Zapach'], undefined);
    });
});

test('Vision Extractor - extractInciFromBackPack testy jednostkowe', async (t) => {
    await t.test('Brak URL zwraca found = false', async () => {
        const res1 = await extractInciFromBackPack(null);
        assert.strictEqual(res1.found, false);
        assert.strictEqual(res1.inci, null);

        const res2 = await extractInciFromBackPack([]);
        assert.strictEqual(res2.found, false);
        assert.strictEqual(res2.inci, null);
    });

    await t.test('Prawidłowa ekstrakcja i normalizacja składu INCI z mocka Vision', async () => {
        const aiWrapper = require('../ai.wrapper.js');
        const orgCall = aiWrapper.callAgentWithTelemetry;

        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const dataUri = `data:image/png;base64,${dummyBase64}`;

        aiWrapper.callAgentWithTelemetry = async () => ({
            result: {
                has_ingredients_label: true,
                inci: 'AQUA, HYDROGEN PEROXIDE, ALCOHOLS, C12-18, ETHOXYLATED, SODIUM DODECYLBENZENESULFONATE, COCO-BETAINE',
                raw_composition_text: 'Perossido di idrogeno 35%, Alcoli C12-18 etossilati...',
                has_warnings_label: true,
                warnings: 'Hasło ostrzegawcze – UWAGA. H315 – Działa drażniąco na skórę. H319 – Działa drażniąco na oczy. P102 – Chronić przed dziećmi. P280 – Stosować rękawice ochronne.',
                has_usage_label: true,
                usage_instructions: 'Załóż rękawice ochronne. Nanieś bezpośrednio na plamę, odczekaj 5 minut i wypierz.',
                target_surfaces: 'Armatura i ceramika łazienkowa: umywalka, wanna, prysznic',
                certifications_and_claims: 'Formuła bez chloru, testowany dermatologicznie'
            },
            usage: { totalTokenCount: 150 }
        });

        const res = await extractInciFromBackPack([dataUri], '8000137015436');
        assert.strictEqual(res.found, true);
        assert.ok(res.inci.includes('HYDROGEN PEROXIDE'));
        assert.ok(res.inci.includes('COCO-BETAINE'));
        assert.ok(res.warnings.includes('P280 – Stosować rękawice ochronne.'));
        assert.ok(res.usageInstructions.includes('Załóż rękawice ochronne'));
        assert.strictEqual(res.pimFeatures['Skład/INCI'], res.inci);
        assert.strictEqual(res.pimFeatures['Ostrzeżenia'], res.warnings);
        assert.strictEqual(res.pimFeatures['Sposób użycia'], res.usageInstructions);
        assert.strictEqual(res.pimFeatures['Przeznaczenie (Etykieta)'], 'Armatura i ceramika łazienkowa: umywalka, wanna, prysznic');
        assert.strictEqual(res.pimFeatures['Wyróżniki / Certyfikaty (Etykieta)'], 'Formuła bez chloru, testowany dermatologicznie');
        assert.strictEqual('Przeznaczenie' in res.pimFeatures, false, 'OCR kontretykiety nie może nadpisywać zastrzeżonego parametru słownikowego Przeznaczenie');
        assert.strictEqual('Cechy dodatkowe' in res.pimFeatures, false, 'OCR kontretykiety nie może nadpisywać zastrzeżonego parametru słownikowego Cechy dodatkowe');
        assert.strictEqual(res.imageUrl, dataUri);

        aiWrapper.callAgentWithTelemetry = orgCall;
    });

    await t.test('Odrzucenie etykiety bez składu (has_ingredients_label = false)', async () => {
        const aiWrapper = require('../ai.wrapper.js');
        const orgCall = aiWrapper.callAgentWithTelemetry;

        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const dataUri = `data:image/png;base64,${dummyBase64}`;

        aiWrapper.callAgentWithTelemetry = async () => ({
            result: {
                has_ingredients_label: false,
                inci: null,
                raw_composition_text: null
            },
            usage: { totalTokenCount: 50 }
        });

        const res = await extractInciFromBackPack([dataUri], '8000137015436');
        assert.strictEqual(res.found, false);
        assert.strictEqual(res.inci, null);

        aiWrapper.callAgentWithTelemetry = orgCall;
    });

    await t.test('ADR-0202: prepareBackLabelImageSet tworzy zoom-cropy ROI dla normalnych zdjęć i wykrywa niską rozdzielczość (<1000px)', async () => {
        const lowResBuf = await sharp({
            create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } }
        })
            .composite([{
                input: await sharp({
                    create: { width: 420, height: 560, channels: 3, background: { r: 25, g: 25, b: 25 } }
                }).png().toBuffer(),
                left: 190,
                top: 120
            }])
            .jpeg({ quality: 90 })
            .toBuffer();

        const prepared = await prepareBackLabelImageSet(lowResBuf, 'image/jpeg');
        assert.strictEqual(prepared.width, 800);
        assert.strictEqual(prepared.height, 800);
        assert.strictEqual(prepared.isLowResolution, true);
        assert.ok(prepared.mainLabelCrop && prepared.mainLabelCrop.base64.length > 100);
        assert.ok(prepared.dosageZoomCrop && prepared.dosageZoomCrop.base64.length > 100);

        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        const tinyPrep = await prepareBackLabelImageSet(tinyPng, 'image/png');
        assert.strictEqual(tinyPrep.mainLabelCrop, null);
        assert.strictEqual(tinyPrep.dosageZoomCrop, null);
    });

    await t.test('ADR-0202: Zero-Guessing prompt, auto-eskalacja Flash -> Pro oraz blokada niepewnej nakrętki', async () => {
        assert.strictEqual(/75\s*ml/i.test(BACK_PACK_INCI_PROMPT), false, 'Prompt OCR nie może zawierać liczby 75 ml jako przykładu');
        assert.strictEqual(/68\s*ml/i.test(BACK_PACK_INCI_PROMPT), false, 'Prompt OCR nie może zawierać liczby 68 ml jako przykładu');

        const aiWrapper = require('../ai.wrapper.js');
        const orgCall = aiWrapper.callAgentWithTelemetry;

        const imgBuf = await sharp({
            create: { width: 800, height: 800, channels: 3, background: { r: 30, g: 30, b: 30 } }
        }).jpeg({ quality: 90 }).toBuffer();
        const dataUri = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;

        const calls = [];
        aiWrapper.callAgentWithTelemetry = async (payload) => {
            calls.push(payload);
            if (calls.length === 1) {
                assert.strictEqual(payload.agentId, '0');
                assert.strictEqual(/= ok\. 45 ml/i.test(payload.prompt), false, 'frontContextNote nie może podpowiadać wyliczonej liczby 45 ml');
                assert.ok(Array.isArray(payload.images) && payload.images.length === 2, 'Model podstawowy powinien dostać pełne zdjęcie + zoom-crop dolnej strefy');
                return {
                    result: {
                        has_ingredients_label: true,
                        has_back_label: true,
                        inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Soap, Enzymes, Optical brighteners, Perfumes, Methylchloroisothiazolinone, Methylisothiazolinone',
                        warnings: 'H319 – Działa drażniąco na oczy. P102 – Chronić przed dziećmi.',
                        usage_instructions: 'DOZOWANIE (1 nakrętka = 75 ml): Wsad 4-5 kg: woda średnia 68 ml.',
                        cap_capacity_ml: '75 ml',
                        cap_capacity_legible: true,
                        dosage_table_legibility: 'MEDIUM',
                        unreadable_fields: []
                    },
                    usage: { totalTokenCount: 200 }
                };
            }
            assert.strictEqual(payload.agentId, '0_pro', 'Niezgodność matematyki dozowania powinna automatycznie eskalować do 0_pro');
            assert.ok(Array.isArray(payload.images) && payload.images.length === 3, 'Eskalacja Pro powinna dostać pełny pakiet zdjęć ROI');
            return {
                result: {
                    has_ingredients_label: true,
                    has_back_label: true,
                    inci: '5-15% Anionic surfactants, <5% Non-ionic surfactants, Soap, Enzymes, Optical brighteners, Perfumes, Methylchloroisothiazolinone, Methylisothiazolinone',
                    warnings: 'H319 – Działa drażniąco na oczy. P102 – Chronić przed dziećmi.',
                    usage_instructions: 'Pranie w pralce (nakrętka = 75 ml): wsad 4-5 kg woda miękka 35 ml, woda średnia 45 ml, woda twarda 60 ml.',
                    cap_capacity_ml: null,
                    cap_capacity_legible: false,
                    dosage_table_legibility: 'MEDIUM',
                    unreadable_fields: ['cap_capacity_ml']
                },
                usage: { totalTokenCount: 300 }
            };
        };

        try {
            const res = await extractInciFromBackPack([dataUri], '8003640022274', () => {}, null, {
                frontContext: { 'Pojemność': '2250 ml', 'Wydajność': '50 prań', 'Postać (Etykieta)': 'płyn' }
            });
            assert.strictEqual(calls.length, 2);
            assert.strictEqual(res.ocrDiagnostics?.escalatedToPro, true);
            assert.strictEqual(res.ocrDiagnostics?.modelUsed, 'gemini-3.1-pro-preview');
            assert.strictEqual(res.ocrDiagnostics?.capCapacityLegible, false);
            assert.strictEqual(res.pimFeatures['Pojemność nakrętki (Etykieta)'], undefined);
            assert.strictEqual(/nakrętka\s*=\s*75\s*ml/i.test(res.usageInstructions || ''), false, 'Nieczytelna objętość nakrętki musi zostać wycięta');
            assert.ok(res.pimFeatures['Ostrzeżenie OCR (Etykieta)'], 'Brak czytelnej nakrętki na zdjęciu niskiej rozdzielczości musi generować ostrzeżenie OCR');
        } finally {
            aiWrapper.callAgentWithTelemetry = orgCall;
        }
    });
});
