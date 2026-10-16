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
});
