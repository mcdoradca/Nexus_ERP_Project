const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PubChemPugRestClient } = require('../src/modules/sds/engine/extractors/pubchem.pug.rest.client');
const { ApifyEchaConnector } = require('../src/modules/sds/engine/extractors/apify.echa.connector');

describe('PubChem PUG REST Fallback Engine (ADR-0138)', () => {
    const client = new PubChemPugRestClient();

    it('1. PubChemPugRestClient poprawnie pobiera właściwości chemiczne (Etanol CAS 64-17-5)', async () => {
        const props = await client.fetchCompoundProperties('64-17-5');
        assert.ok(props, 'Odpowiedź PubChem nie może być pusta');
        assert.strictEqual(props.cid, 702, 'CID dla etanolu musi wynosić 702');
        assert.strictEqual(props.molecularFormula, 'C2H6O', 'Wzór sumaryczny musi być C2H6O');
        assert.ok(/ethanol/i.test(props.iupacName || props.title), 'Nazwa musi zawierać ethanol');
    });

    it('2. PubChemPugRestClient ekstrahuje zharmonizowaną klasyfikację GHS (CID 702)', async () => {
        const ghs = await client.fetchGHSClassification(702);
        assert.ok(Array.isArray(ghs.hPhrases), 'hPhrases musi być tablicą');
        assert.ok(ghs.hPhrases.includes('H225'), 'Etanol musi zawierać zwrot H225');
        assert.ok(ghs.hPhrases.includes('H319'), 'Etanol musi zawierać zwrot H319');
        assert.ok(ghs.pictograms.includes('GHS02'), 'Etanol musi zawierać piktogram GHS02');
        assert.strictEqual(ghs.signalWord, 'Niebezpieczeństwo', 'Hasło ostrzegawcze musi być przetłumaczone na język polski');
    });

    it('3. PubChemPugRestClient tworzy pełny profil substancji (fetchFullChemicalProfile)', async () => {
        const profile = await client.fetchFullChemicalProfile('7664-93-9'); // Kwas siarkowy
        assert.ok(profile, 'Profil kwasu siarkowego musi istnieć');
        assert.strictEqual(profile.casNumber, '7664-93-9');
        assert.strictEqual(profile.source, 'PUBCHEM-PUG-REST-ECHA-FALLBACK');
        assert.ok(profile.hPhrases.includes('H314'), 'Kwas siarkowy musi zawierać zwrot H314');
        assert.ok(profile.pictograms.includes('GHS05'), 'Kwas siarkowy musi zawierać piktogram żrący GHS05');
    });

    it('4. Bezpieczna obsługa nieistniejącej substancji (brak wyjątków, zwraca null)', async () => {
        const result = await client.fetchFullChemicalProfile('99999-99-9-non-existent');
        assert.strictEqual(result, null, 'Nieistniejący CAS powinien zwrócić null bez rzucania błędu');
    });

    it('5. ApifyEchaConnector: Automatyczny fallback do PubChem przy braku APIFY_API_TOKEN', async () => {
        const connector = new ApifyEchaConnector();
        connector.apiToken = null; // Symulacja braku tokenu

        const data = await connector.fetchChemicalData('497-19-8'); // Węglan sodu
        assert.ok(data, 'Konektor musi zwrócić dane dzięki fallbackowi PubChem');
        assert.strictEqual(data.source, 'PUBCHEM-PUG-REST-ECHA-FALLBACK');
        assert.ok(data.hPhrases.includes('H319'), 'Węglan sodu musi zawierać H319');
        assert.strictEqual(data.signalWord, 'Uwaga', 'Hasło Warning musi być przetłumaczone na Uwaga');
    });

    it('6. ApifyEchaConnector: Odporność na symulowany błąd sieciowy Apify (try-catch fallback)', async () => {
        const connector = new ApifyEchaConnector();
        connector.apiToken = 'mock_invalid_token_for_error_test';
        connector.baseUrl = 'https://invalid-non-existent-domain-test-12345.com'; // Symulacja awarii serwera Apify

        const data = await connector.fetchChemicalData('64-17-5');
        assert.ok(data, 'W razie awarii sieciowej Apify konektor musi bezawaryjnie zwrócić dane z PubChem');
        assert.strictEqual(data.source, 'PUBCHEM-PUG-REST-ECHA-FALLBACK');
        assert.ok(data.hPhrases.includes('H225'));
    });
});
