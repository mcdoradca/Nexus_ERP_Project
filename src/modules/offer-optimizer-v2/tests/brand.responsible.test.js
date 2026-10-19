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

    await t.test('7. Spuma di Sciampagna mapuje się na oficjalnego producenta REAL CHIMICA S.R.L. z adresem we Włoszech', () => {
        const sds = brandService.findResponsibleEntity('Spuma di Sciampagna');
        assert.ok(sds, 'Spuma di Sciampagna musi być odnaleziona w rejestrze');
        assert.strictEqual(sds.name, 'REAL CHIMICA S.R.L.');
        assert.ok(sds.address_eu.includes('Via Monte Santo 37'));
        assert.ok(sds.address_eu.includes('20831 Seregno'));
        assert.ok(sds.address_eu.includes('Włochy'));

        const formatted = brandService.formatForHtmlDescription(sds);
        assert.strictEqual(formatted, 'REAL CHIMICA S.R.L., Via Monte Santo 37, 20831 Seregno (MB), Włochy');
        assert.ok(!formatted.includes('@'), 'formatForHtmlDescription NIE może zawierać adresu e-mail');
    });

    await t.test('8. Włoskie towary marek globalnych mapują się na spółki we Włoszech, a nie w Polsce', () => {
        const fabuloso = brandService.findResponsibleEntity('Fabuloso');
        assert.ok(fabuloso);
        assert.strictEqual(fabuloso.name, 'Colgate-Palmolive Commerciale S.r.l.');
        assert.ok(fabuloso.address_eu.includes('Roma'));

        const sole = brandService.findResponsibleEntity('Sole');
        assert.ok(sole);
        assert.strictEqual(sole.name, 'Reckitt Benckiser Commercial (Italia) S.r.l.');
        assert.ok(sole.address_eu.includes('Milano'));

        const viakal = brandService.findResponsibleEntity('Viakal');
        assert.ok(viakal);
        assert.strictEqual(viakal.name, 'Procter & Gamble S.r.l.');
        assert.ok(viakal.address_eu.includes('Roma'));

        const bref = brandService.findResponsibleEntity('Bref');
        assert.ok(bref);
        assert.strictEqual(bref.name, 'Henkel Italia S.r.l.');
        assert.ok(bref.address_eu.includes('Milano'));
    });

    await t.test('9. Tarcza stripContactInfo NIE uszkadza kodów EAN-13 ani kodów pocztowych', () => {
        const s5 = '<li>⚖️ <b>Kod EAN:</b> 8004120040436</li><li>⚖️ <b>Pojemność:</b> 500 ml</li>';
        const cleaned = brandService.stripContactInfo(s5);
        assert.ok(cleaned.includes('8004120040436'), 'Kod EAN nie może zostać wycięty przez filtr telefoniczny');
        assert.ok(cleaned.includes('500 ml'));
    });

    await t.test('10. Tarcza stripContactInfo bezwzględnie zachowuje polską leksykę CLP ("kontaktowe", "KONTAKTU") oraz "Kompleks"', () => {
        const clp1 = 'Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.';
        assert.strictEqual(brandService.stripContactInfo(clp1), clp1, 'Nie wolno wycinać "kontakt" ze słowa "kontaktowe"');

        const clp2 = 'W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody z mydłem.';
        assert.strictEqual(brandService.stripContactInfo(clp2), clp2, 'Nie wolno wycinać "KONTAKT" ze słowa "KONTAKTU"');

        const syn = '⚡ <b>Kompleks neutralizujący:</b> Unikalne połączenie kwasów organicznych.';
        assert.strictEqual(brandService.stripContactInfo(syn), syn, 'Nie wolno wycinać "kom" ze słowa "Kompleks"');
    });
});
