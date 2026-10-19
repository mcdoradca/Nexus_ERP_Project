const { test } = require('node:test');
const assert = require('node:assert');
const { Orchestrator } = require('../orchestrator');
const aiWrapper = require('../ai.wrapper');

test('Brand Registry & Pre-Flight Resolution w Orchestratorze', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;

    t.beforeEach(() => {
        aiWrapper.callAgentWithTelemetry = async () => ({
            usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
            result: {
                pipeline_id: "test",
                gtin_ean: "8000137015436",
                country_of_origin: "Włochy"
            }
        });
    });

    t.afterEach(() => {
        aiWrapper.callAgentWithTelemetry = originalCall;
    });

    await t.test('1. Marka ze słownika (Equilibra) rozwiązuje eu_responsible_person i eliminuje brak z missingFields', async () => {
        const orch = new Orchestrator('8000137015436');
        orch.emitState = () => {};

        // Uruchamiamy Krok 1 potoku na fixture
        await orch.runPhase1({ name: "Equilibra produkt" });

        const eu = orch.state.extracted_data.eu_responsible_person;
        assert.ok(eu, 'eu_responsible_person musi być zdefiniowane');
        assert.ok(eu.data.name.includes('Equilibra') || eu.data.name.includes('Paglieri'), 'Powinien rozpoznać markę ze słownika');
        assert.ok(eu.data.address_eu, 'Musi posiadać fizyczny adres pocztowy');
        assert.ok(eu.data.contact, 'Musi posiadać kontakt do formularzy GPSR');
    });

    await t.test('2. Gdy INCI, cechy packshotu i marka są w PIM, missingFields jest puste i Agent 1 jest natychmiast SKIPPED', async () => {
        const orch = new Orchestrator('8000137015436');
        orch.emitState = () => {};

        // Mockujemy runPhase2, by zatrzymać test po fazie 1 i nie marnować tokenów
        orch.runPhase2 = async () => {};

        // Przekazujemy kompletne dane PIM (jak w normalnej pracy z uzupełnioną kartą)
        const pimWithFullData = {
            id: 'prod-full-test',
            sku: '8000137015436',
            ean: '8000137015436',
            brand: { name: 'Equilibra' },
            text_fields: {
                name: 'Equilibra Aloesowy krem do rąk 75ml',
                description: '<p>Krem aloesowy.</p>',
                features: {
                    'Skład/INCI': 'Aqua, Aloe Barbadensis Leaf Juice, Glycerin',
                    'Marka': 'Equilibra',
                    'Linia': 'Aloesowa',
                    'Kraj pochodzenia': 'Włochy',
                    'Pojemność': '75 ml'
                }
            }
        };

        await orch.runPhase1(pimWithFullData);

        // A1 musi być natychmiast SKIPPED bez marnowania tokenów i bez zapytań OSINT
        assert.strictEqual(orch.state.node_status['A1'], 'SKIPPED');
        assert.ok(orch.state.token_usage_per_node['A1']?.tokens_saved);
    });

    await t.test('3. Tarcza Anty-Kontaktowa Allegro w Sekcji 6: wstrzyknięty podmiot NIE zawiera e-maila, telefonu ani www', () => {
        const { sanitizeSection6Html } = require('../orchestrator');
        const dirtySection6 = `<h2>⚠️ Bezpieczeństwo i GPSR</h2><ul><li>➡️ <b>Podmiot odpowiedzialny w UE:</b> MIL MIL 76 S.p.A., Via Sciarei 8, 28064 Landiona (NO), Włochy, kontakt: info@milmil.it, www.milmil.it, tel. +39 0321 827011</li></ul>`;
        
        const cleaned = sanitizeSection6Html(dirtySection6);
        assert.ok(!cleaned.includes('info@milmil.it'), 'Zakaz e-mail w HTML opisu');
        assert.ok(!cleaned.includes('www.milmil.it'), 'Zakaz www w HTML opisu');
        assert.ok(!cleaned.includes('+39'), 'Zakaz telefonu w HTML opisu');
        assert.ok(cleaned.includes('MIL MIL 76 S.p.A.'));
        assert.ok(cleaned.includes('Via Sciarei 8, 28064 Landiona (NO), Włochy'));
    });
});
