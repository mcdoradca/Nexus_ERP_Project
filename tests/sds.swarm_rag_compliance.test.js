const { describe, it } = require('node:test');
const assert = require('node:assert');
const { LocalKnowledgeConnector } = require('../src/modules/sds/engine/extractors/local.knowledge.connector');
const { SDSSwarmOrchestrator } = require('../src/modules/sds/engine/sds.swarm.orchestrator');
const { SDSVisionAgent } = require('../src/modules/sds/sds.vision.agent');

describe('RAG & Swarm Compliance Engine Tests (ADR-0117)', () => {
    const rag = new LocalKnowledgeConnector();

    it('1. LocalKnowledgeConnector poprawnie odpytuje bazę NDS z Dz.U. 2018 / 2024', async () => {
        // Test dla Etanolu (CAS 64-17-5)
        const ethanolNds = await rag.lookupPolishNDS('64-17-5');
        assert.strictEqual(ethanolNds.found, true);
        assert.ok(ethanolNds.NDS.includes('1900 mg/m³'), `Oczekiwano NDS 1900 mg/m³, otrzymano: ${ethanolNds.NDS}`);

        // Test dla Acetonu (CAS 67-64-1)
        const acetoneNds = await rag.lookupPolishNDS('67-64-1');
        assert.strictEqual(acetoneNds.found, true);
        assert.ok(acetoneNds.NDS.includes('600 mg/m³'), `Oczekiwano NDS 600 mg/m³, otrzymano: ${acetoneNds.NDS}`);

        // Test dla substancji niewystępującej w wykazie NDS
        const unknownNds = await rag.lookupPolishNDS('999999-99-9');
        assert.strictEqual(unknownNds.found, false);
    });

    it('2. LocalKnowledgeConnector poprawnie dobiera 6-cyfrowe kody odpadów (Dz.U. 2020 poz. 10)', async () => {
        const wasteNonHaz = await rag.lookupWasteCode('perfumy do tkanin detergent', false);
        assert.ok(wasteNonHaz.consumer_code.includes('20 01 30'), 'Dla niebezpiecznego konsumenckiego detergentu kodem powinno być 20 01 30');
        assert.ok(wasteNonHaz.packaging_code.includes('15 01 02'), 'Opakowania tworzyw sztucznych: 15 01 02');

        const wasteHaz = await rag.lookupWasteCode('rozpuszczalnik farba', true);
        assert.ok(wasteHaz.consumer_code.includes('*'), 'Odpad niebezpieczny musi mieć gwiazdkę *');
        assert.ok(wasteHaz.packaging_code.includes('15 01 10*'), 'Opakowania skażone: 15 01 10*');
    });

    it('3. LocalKnowledgeConnector zwraca ATE i SCL ze zharmonizowanego Załącznika VI do CLP', async () => {
        // CMI/MIT CAS 55965-84-9
        const cmiMit = await rag.lookupHarmonizedCLP('55965-84-9');
        assert.strictEqual(cmiMit.found, true);
        assert.ok(cmiMit.ate, 'CMI/MIT musi posiadać wartości ATE');
        assert.strictEqual(cmiMit.ate.oral, '64 mg/kg mc.');
        assert.strictEqual(cmiMit.ate.dermal, '87,12 mg/kg mc.');
        assert.strictEqual(cmiMit.ate.inhalation_mists, '0,33 mg/l');
    });

    it('4. LocalKnowledgeConnector.lookupLegalActs kategorycznie wycina WGK, TRGS i Ograniczenie 75', () => {
        const legalText = rag.lookupLegalActs({ isFlammable: true, isTattooProduct: false });
        assert.ok(!legalText.includes('WGK'), 'Tekst prawny nie może zawierać WGK!');
        assert.ok(!legalText.includes('TRGS'), 'Tekst prawny nie może zawierać TRGS 510!');
        assert.ok(!legalText.includes('Ograniczenie 75'), 'Dla produktów nietatuatorskich zakazane jest Ograniczenie 75!');
        assert.ok(legalText.includes('(UE) 2020/878'), 'Wymagane Rozporządzenie (UE) 2020/878');
        assert.ok(legalText.includes('Dz.U. 2024 poz. 1017'), 'Wymagane Dz.U. 2024 poz. 1017');
    });

    it('5. SDSVisionAgent.enrichWithPolishRegulations nie zawiera niemieckich norm ani pozycji 75', () => {
        const visionAgent = new SDSVisionAgent();
        const testData = {
            classification: { hazardClasses: ['Flam. Liq. 2'], hPhrases: ['H225'] },
            components: [{ namePl: 'Etanol', cas: '64-17-5', clp: 'Flam. Liq. 2 H225' }],
            sections: {}
        };
        const enriched = visionAgent.enrichWithPolishRegulations(testData);
        const s15 = enriched.sections['15']['15.1'];
        assert.ok(!s15.includes('WGK'), 'enrichWithPolishRegulations nie może zawierać WGK!');
        assert.ok(!s15.includes('TRGS 510'), 'enrichWithPolishRegulations nie może zawierać TRGS 510!');
        assert.ok(!s15.includes('Ograniczenie 75'), 'enrichWithPolishRegulations nie może zawierać Ograniczenia 75!');
        assert.ok(enriched.sections['8']['8.1'].includes('1900 mg/m³'), 'Sekcja 8.1 musi zawierać NDS dla etanolu');
    });

    it('6. SDSSwarmOrchestrator.auditSdsData egzekwuje Art. 18 ust. 3 CLP oraz zwrot EUH208', async () => {
        const orchestrator = new SDSSwarmOrchestrator();
        const testData = {
            classification: { hazardClasses: [], hPhrases: [] }, // Mieszanina niesklasyfikowana
            components: [
                { namePl: 'CMI/MIT', cas: '55965-84-9', clp: 'Acute Tox. 3 H301; Skin Sens. 1A H317' }
            ],
            sections: {
                '2': {
                    '2.2': 'Nazwy niebezpiecznych substancji wymienione na etykiecie: CMI/MIT\nEUH208 Zawiera CMI/MIT.'
                },
                '7': {
                    '7.2': 'Warunki magazynowania. Storage class TRGS 510: 10.'
                },
                '8': {},
                '13': {},
                '15': {}
            }
        };

        const audited = await orchestrator.auditSdsData(testData);

        // Asercja Art. 18 ust. 3 CLP
        assert.ok(
            audited.sections['2']['2.2'].includes('Nazwy niebezpiecznych substancji wymienione na etykiecie: Nie dotyczy.'),
            'Dla mieszaniny bez zwrotów H pole musi mieć wartość Nie dotyczy.'
        );

        // Asercja pełnego zdania EUH208
        assert.ok(
            audited.sections['2']['2.2'].includes('Może powodować wystąpienie reakcji alergicznej.'),
            'EUH208 musi mieć pełne zdanie ze skutkiem zdrowotnym.'
        );

        // Asercja wyczyszczenia TRGS 510 z Sekcji 7
        assert.ok(
            !audited.sections['7']['7.2'].includes('TRGS 510'),
            'Sekcja 7 nie może zawierać normy TRGS 510!'
        );

        // Asercja wstrzyknięcia ATE dla CMI/MIT
        assert.ok(
            audited.components[0].clp.includes('ATE (droga pokarmowa) = 64 mg/kg mc.'),
            'Komponent CMI/MIT musi mieć wstrzyknięte ATE'
        );
    });

    it('7. Egzekwowanie kanonicznej stopki Sekcji 16 (ECHA, PubChem, szkolenia, rewizja 1.0 PL, ITALLUX)', async () => {
        const orchestrator = new SDSSwarmOrchestrator();
        const testData = {
            metadata: {
                compilationDate: '24.03.2023',
                version: '1.0 PL'
            },
            classification: { hazardClasses: [], hPhrases: [] },
            components: [],
            sections: {
                '16': {
                    '16.1': `Pełne brzmienie zwrotów H i EUH:
H225 Wysoce łatwopalna ciecz i pary.
Objaśnienie skrótów i akronimów:
NDS: Najwyższe Dopuszczalne Stężenie
Główne źródła literatury i danych: 
Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady (REACH) wraz z późniejszymi zmianami.
Rozporządzenie (WE) nr 1272/2008 Parlamentu Europejskiego i Rady (CLP) wraz z późniejszymi zmianami.
Baza danych ECHA.
Wskazówki szkoleniowe: 
Pracownicy powinni zostać przeszkoleni w zakresie prawidłowego obchodzenia się z produktami chemicznymi oraz zasad higieny i bezpieczeństwa pracy.`
                }
            }
        };

        const audited = await orchestrator.auditSdsData(testData);
        const s16 = audited.sections['16']['16.1'];

        // 1. Sprawdzenie źródeł danych i literatury
        assert.ok(s16.includes('https://echa.europa.eu/'), 'Sekcja 16 musi zawierać link do bazy ECHA');
        assert.ok(s16.includes('https://pubchem.ncbi.nlm.nih.gov/'), 'Sekcja 16 musi zawierać link do PubChem');
        assert.ok(s16.includes('Dz.U. 2018 poz. 1286'), 'Sekcja 16 musi wymieniać Dz.U. 2018 poz. 1286');
        assert.ok(s16.includes('Dz.U. 2023 poz. 1587'), 'Sekcja 16 musi wymieniać Dz.U. 2023 poz. 1587');

        // 2. Sprawdzenie zaleceń szkoleniowych
        assert.ok(s16.includes('Zalecenia i wskazówki szkoleniowe dla pracowników:'), 'Wymagany pełny nagłówek zaleceń szkoleniowych');
        assert.ok(s16.includes('Przed przystąpieniem do pracy z produktem należy zapoznać się z treścią niniejszej karty'), 'Wymagany urzędowy tekst szkoleniowy');

        // 3. Sprawdzenie informacji o zmianach i dynamicznej daty
        assert.ok(s16.includes('Niniejsza karta charakterystyki (wersja 1.0 PL) stanowi wydanie pierwsze w języku polskim, opracowane na podstawie karty charakterystyki SDS producenta z dnia 24.03.2023 r.'), 'Data sporządzenia karty producenta musi być dynamicznie wstrzyknięta');
        assert.ok(s16.includes('Sekcja 1.3: Aktualizacja danych dostawcy karty w Rzeczypospolitej Polskiej na ITALLUX Sp. z o.o.'), 'Punkt 1 zmian: ITALLUX');
        assert.ok(s16.includes('Sekcja 8.1: Weryfikacja i implementacja krajowych norm higienicznych'), 'Punkt 2 zmian: NDS');
        assert.ok(s16.includes('Sekcja 11.2 i 12.6: Wdrożenie obligatoryjnych podsekcji dotyczących właściwości zaburzających funkcjonowanie układu hormonalnego'), 'Punkt 3 zmian: ED');
        assert.ok(s16.includes('Sekcja 13: Aktualizacja klasyfikacji i 6-cyfrowych kodów odpadów'), 'Punkt 4 zmian: Kody odpadów');
        assert.ok(s16.includes('Sekcja 14: Weryfikacja i zharmonizowanie warunków przewozu zgodnie z Umową ADR'), 'Punkt 5 zmian: ADR');

        // 4. Sprawdzenie klauzuli prawnej ITALLUX
        assert.ok(s16.includes('Klauzula prawna i ochrona praw autorskich:'), 'Wymagany nagłówek klauzuli prawnej');
        assert.ok(s16.includes('stanowi własność intelektualną firmy ITALLUX Sp. z o.o..'), 'Klauzula musi zastrzegać własność intelektualną firmy ITALLUX Sp. z o.o.');

        // 5. Upewnienie się że stare, ucięte linijki z promptu LLM zostały bezwzględnie usunięte
        assert.ok(!s16.includes('Wskazówki szkoleniowe: \nPracownicy powinni zostać przeszkoleni w zakresie prawidłowego obchodzenia się z produktami chemicznymi oraz zasad higieny i bezpieczeństwa pracy.'), 'Stary, ucięty tekst szkoleń musi zostać usunięty');
    });
});
