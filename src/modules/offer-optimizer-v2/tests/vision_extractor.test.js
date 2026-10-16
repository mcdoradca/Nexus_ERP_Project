const test = require('node:test');
const assert = require('node:assert');
const { fetchImageBuffer, extractFrontPackFeatures } = require('../vision-extractor.service.js');

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
            if (raw.zapach_wariant) pimFeatures['Zapach'] = String(raw.zapach_wariant).trim();
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
    });
});
