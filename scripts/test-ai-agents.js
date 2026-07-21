require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiService = require('../src/modules/offer-optimizer/ai.service');
const sentinelService = require('../src/modules/allegro-ads/allegro.sentinel.service');
const { executeAnalysis } = require('../src/modules/portfolio-manager/basket.analyzer');

async function testAgents() {
    console.log("=== ROZPOCZYNAM TESTY AGENTÓW AI ===");

    // 1. Offer Optimizer
    try {
        console.log("\n[1] Test Agenta Optymalizacji Ofert (gatherProductIntelligence)");
        const result = await aiService.gatherProductIntelligence("Nacomi kwas hialuronowy", "5901878682054");
        console.log("✅ Agent odpowiedział strukturą SOT.");
        if (result && Object.keys(result).length > 0) {
            console.log("Wyciągnięte cechy:", Object.keys(result).slice(0, 3).join(", ") + "...");
        }
    } catch (err) {
        console.error("❌ Błąd Offer Optimizer:", err.message);
    }

    // 2. Sentinel Agent
    try {
        console.log("\n[2] Test Agenta Sentinel (Audyt Regulaminu)");
        const result = await sentinelService.runSentinelAudit();
        console.log("✅ Sentinel Agent wykonał audyt pomyślnie.");
    } catch (err) {
        console.error("❌ Błąd Sentinel Agent:", err.message);
    }

    console.log("\n=== ZAKOŃCZONO TESTY AGENTÓW ===");
    await prisma.$disconnect();
    process.exit(0);
}

testAgents();
