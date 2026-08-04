require('dotenv').config();
const baselinkerExportAgent = require('./src/modules/offer-optimizer-v2/baselinker.export.agent');

async function runTest() {
    console.log("Rozpoczynam test Agenta Eksportu...");

    const agentInput = {
        title: "Testowy bardzo długi tytuł produktu kosmetycznego, który ma przekroczyć maksymalny limit 75 znaków i wymusić naprawę przez agenta",
        htmlContent: {
            sekcja1: "<p>Nasze innowacyjne serum z kwasem hialuronowym. Zatrzymuje wodę w naskórku. Najlepszy wybór gwarantowany.</p>",
            sekcja2: "<p>Bogactwo witaminy C na przebarwienia. Znika po pierwszym użyciu.</p>",
            sekcja3: "<p>Kupuj u nas! Rabat 20% tylko dziś. Kontakt: 123-456-789. Darmowa dostawa!</p>", // Zabronione dane
            sekcja4: "<p>Test Test</p>",
            sekcja5: "<p>Sposób użycia: Nanieść kilka kropel...</p>",
            sekcja6: "<p>Skład INCI: Aqua, Glycerin, ...</p>"
        },
        features: {
            "Pojemność": "50 ml",
            "Opakowanie": "Szklany słoiczek"
        },
        hardFeatures: {
            "Marka": "Garnier",
            "Stan": "Nowy"
        }
    };

    console.log("\n[WEJŚCIE DLA AGENTA]:");
    console.log(JSON.stringify(agentInput, null, 2));

    try {
        const result = await baselinkerExportAgent.validateAndFormatExport(agentInput);
        console.log("\n[WYNIK OD AGENTA]:");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Błąd podczas działania Agenta:", e);
    }
}

runTest();
