require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { callAgentWithTelemetry } = require('../ai.wrapper.js');
const osintScraper = require('../../offer-optimizer/osint.scraper.service');
const { Orchestrator } = require('../orchestrator.js');

async function testGeminiModels() {
    const isFullCheck = process.argv.includes('--all');
    console.log("==================================================");
    console.log("DIAGNOSTYKA MODELI GEMINI I POTOKU EAN V2");
    console.log("==================================================");
    console.log("GEMINI_API_KEY obecny:", !!process.env.GEMINI_API_KEY, "Długość:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);

    if (isFullCheck) {
        // Test 1: gemini-3.8-flash (Agent 2)
        console.log("\n[Test 1.1] Test węzła gemini-3.8-flash (Agent 2 config)...");
        const t0 = Date.now();
        try {
            const resFlash = await callAgentWithTelemetry({
                agentId: "2",
                prompt: "Podaj w formacie JSON jedno słowo: status = 'OK'.",
                schema: {
                    type: "object",
                    properties: { status: { type: "string" } },
                    required: ["status"]
                }
            });
            console.log(`[Test 1.1 SUCCESS] Flash odpowiedział w ${Date.now() - t0}ms:`, JSON.stringify(resFlash.result));
        } catch (err) {
            console.error(`[Test 1.1 FAILED] Błąd gemini-3.8-flash:`, err.message);
        }

        // Test 2: gemini-3.1-pro-preview bez grounding (Agent 10)
        console.log("\n[Test 1.2] Test węzła gemini-3.1-pro-preview (Agent 10 config)...");
        const t1 = Date.now();
        try {
            const resPro = await callAgentWithTelemetry({
                agentId: "10",
                prompt: "Zwróć JSON z polem verdict = 'OK'.",
                schema: {
                    type: "object",
                    properties: { verdict: { type: "string" } },
                    required: ["verdict"]
                }
            });
            console.log(`[Test 1.2 SUCCESS] Pro Preview odpowiedział w ${Date.now() - t1}ms:`, JSON.stringify(resPro.result));
        } catch (err) {
            console.error(`[Test 1.2 FAILED] Błąd gemini-3.1-pro-preview:`, err.message);
        }

        // Test OSINT scrapera
        console.log("\n[Test 1.3] Test pre-scrapera OSINT (Bing/Axios)...");
        const t3 = Date.now();
        try {
            const osintRes = await osintScraper.searchAndExtract("8000137015436", "Felce Azzurra", ["country_of_origin", "inci"]);
            console.log(`[Test 1.3 SUCCESS] OSINT zakończony w ${Date.now() - t3}ms. Długość tekstu:`, osintRes ? osintRes.length : 0);
        } catch (err) {
            console.error(`[Test 1.3 FAILED] OSINT Scraper błąd w ${Date.now() - t3}ms:`, err.message);
        }
    } else {
        console.log("Tryb domyślny: diagnostyka integracyjna Fazy 1 (użyj --all, aby uruchomić również testy jednostkowe węzłów).");
    }

    console.log("\n==================================================");
    console.log("TEST STARTU POTOKU ORCHESTRATORA DLA EAN (FAZA 1)");
    console.log("==================================================");
    try {
        const testEan = "8000137015436";
        console.log(`Inicjalizacja Orchestratora dla EAN: ${testEan}`);
        const orch = new Orchestrator(testEan);
        console.log("Stan początkowy next_action:", orch.state.next_action);

        const localPimData = {
            text_fields: {
                name: "Felce Azzurra płyn do kąpieli",
                description: "",
                features: {}
            },
            allegro_schema: [
                { name: "Marka", required: true },
                { name: "Pojemność", required: true },
                { name: "Kraj pochodzenia", required: true }
            ]
        };
        console.log("Uruchamiam orch.runPhase1(localPimData)...");
        const t4 = Date.now();
        await orch.runPhase1(localPimData);
        console.log(`[Faza 1 Zakończona] Czas trwania: ${Date.now() - t4}ms`);
        console.log("Status węzłów:", JSON.stringify(orch.state.node_status, null, 2));
        console.log("Następna akcja:", orch.state.next_action);
        console.log("Wykryte alerty HITL:", orch.state.hitl_alert);
    } catch (err) {
        console.error(`[BŁĄD POTOKU] Błąd fazy 1 orkiestratora:`, err.message);
        if (err.stack) console.error(err.stack);
    }
}

testGeminiModels().then(() => {
    console.log("\n=== DIAGNOSTYKA UKOŃCZONA ===");
    process.exit(0);
}).catch(err => {
    console.error("Krytyczny błąd skryptu diagnostycznego:", err);
    process.exit(1);
});
