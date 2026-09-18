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
});
