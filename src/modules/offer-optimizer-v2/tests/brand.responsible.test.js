const { test } = require('node:test');
const assert = require('node:assert');
const brandService = require('../brand.responsible.service');

test('BrandResponsibleService - Weryfikacja bazy podmiotów odpowiedzialnych', async (t) => {
    await t.test('1. Dopasowanie po oficjalnej marce z bazy (Felce Azzurra -> Paglieri)', () => {
        const entity = brandService.findResponsibleEntity('Felce Azzurra');
        assert.ok(entity);
        assert.strictEqual(entity.name, 'Paglieri S.p.A.');
        assert.ok(entity.address_eu.includes('Alessandria'));
        assert.ok(entity.contact.includes('info@paglieri.it'));
    });

    await t.test('2. Dopasowanie po wariancie marki (Mil Mil / Delice -> MIL MIL 76 S.p.A.)', () => {
        const entity1 = brandService.findResponsibleEntity('Mil Mil');
        assert.ok(entity1);
        assert.strictEqual(entity1.name, 'MIL MIL 76 S.p.A.');

        const entity2 = brandService.findResponsibleEntity('DELICE');
        assert.ok(entity2);
        assert.strictEqual(entity2.name, 'MIL MIL 76 S.p.A.');
    });

    await t.test('3. Dopasowanie marek włoskich (Chante Clair -> REAL CHIMICA S.R.L., Tesori d\'Oriente -> Conter S.r.l.)', () => {
        const cc = brandService.findResponsibleEntity('Chante Clair');
        assert.ok(cc);
        assert.strictEqual(cc.name, 'REAL CHIMICA S.R.L.');

        const tdo = brandService.findResponsibleEntity('Tesori d\'Oriente');
        assert.ok(tdo);
        assert.strictEqual(tdo.name, 'Conter S.r.l.');
    });

    await t.test('4. Ekstrakcja marki z nazwy produktu, gdy marka w PIM jest pusta lub generyczna', () => {
        const entity = brandService.findResponsibleEntity('bez marki', 'MIL MIL MYDŁO W PŁYNIE ANTYBAKTERYJNE 500 ML');
        assert.ok(entity);
        assert.strictEqual(entity.name, 'MIL MIL 76 S.p.A.');
    });

    await t.test('5. Tarcza Anty-Kontaktowa Allegro (formatForHtmlDescription NIE zawiera maila, tel ani www)', () => {
        const rawEntity = {
            name: "MIL MIL 76 S.p.A. tel. +39 0321 827011",
            address_eu: "Via Sciarei 8, 28064 Landiona (NO), Włochy info@milmil.it www.milmil.it",
            contact: "info@milmil.it"
        };
        const htmlString = brandService.formatForHtmlDescription(rawEntity);

        // Asercje bezpieczeństwa Allegro:
        assert.ok(!htmlString.includes('@'), 'Opis HTML NIE może zawierać adresu e-mail');
        assert.ok(!htmlString.includes('www.'), 'Opis HTML NIE może zawierać adresu www');
        assert.ok(!htmlString.includes('http'), 'Opis HTML NIE może zawierać linku http');
        assert.ok(!htmlString.includes('+39'), 'Opis HTML NIE może zawierać numeru telefonu');
        assert.ok(htmlString.includes('MIL MIL 76 S.p.A.'));
        assert.ok(htmlString.includes('Via Sciarei 8, 28064 Landiona (NO), Włochy'));
    });

    await t.test('6. stripContactInfo - czyszczenie brudnego tekstu', () => {
        const dirty = "Firma XYZ Sp. z o.o., ul. Kwiatowa 5, 00-001 Warszawa, kontakt: biuro@xyz.pl, www.xyz.pl, tel: +48 22 123 45 67";
        const clean = brandService.stripContactInfo(dirty);
        assert.ok(!clean.includes('@'));
        assert.ok(!clean.includes('www.'));
        assert.ok(!clean.includes('+48'));
        assert.ok(clean.includes('Firma XYZ Sp. z o.o.'));
        assert.ok(clean.includes('ul. Kwiatowa 5, 00-001 Warszawa'));
    });
});
