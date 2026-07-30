const AiMetricsService = require('../../core/ai.metrics.service');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithRetry } = require('./ai.service');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("Brak klucza API!");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function extractSOT(filePath, docType) {
    const fileName = path.basename(filePath);
    console.log(`[SOT Builder] Analiza pliku: ${fileName}...`);
    
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.1 }
        });
        
        const pdfData = fs.readFileSync(filePath);
        
        const prompt = `Jesteś ekspertem prawnym i audytorem e-commerce. Przeanalizuj poniższy dokument PDF dotyczący: ${docType}.
Twoim zadaniem jest stworzenie "Single Source of Truth" (SOT) – absolutnie skondensowanej pigułki wiedzy.
Wyeliminuj cały marketingowy bełkot, wstępy i opisy. Zostaw TYLKO i WYŁĄCZNIE:
1. Twarde zakazy (czego absolutnie nie wolno pisać/pokazywać).
2. Twarde zasady i wymogi (co musi być).
3. Wytyczne dla copywriterów i grafików (np. dozwolone słowa, zasady dotyczące miniatur).

Format zwrotny: Zwięzła lista wypunktowana (Markdown). Max 4000 znaków.
`;

        const parts = [
            prompt,
            {
                inlineData: {
                    data: pdfData.toString('base64'),
                    mimeType: 'application/pdf'
                }
            }
        ];

        const result = await generateWithRetry(model, parts, 3, "Agent_SOT_Compiler");
        if (result && result.response && result.response.usageMetadata) { await AiMetricsService.logUsage("Legacy_SOT_Compiler", "gemini-3.1-pro-preview", result.response.usageMetadata, true, 1); }
        return result.response.text();
    } catch (err) {
        console.error(`Błąd przy pliku ${fileName}:`, err.message);
        return null;
    }
}

async function main() {
    const dir = __dirname;
    
    const tasks = [
        { 
            file: 'Regulamin Allegro.pdf', 
            type: 'Zasady tworzenia ofert, tytułów i miniatur na Allegro',
            output: 'SOT_Allegro.md'
        },
        { 
            file: 'Rozporządzenie WE nr 1223 2009.pdf', 
            type: 'Unijne prawo kosmetyczne, deklaracje na etykietach i zakazane obietnice medyczne',
            output: 'SOT_Kosmetyki_UE.md'
        },
        {
            file: 'Rozporządzenie Komisji UE nr 655 2013.pdf',
            type: 'Oświadczenia marketingowe dla kosmetyków (tzw. claims) i Greenwashing',
            output: 'SOT_Claims_UE.md'
        }
    ];

    let combinedSOT = "# Single Source of Truth (SOT) - Baza Wiedzy Agenta Prawnego\n\n";

    for (const task of tasks) {
        const fullPath = path.join(dir, task.file);
        if (fs.existsSync(fullPath)) {
            const sot = await extractSOT(fullPath, task.type);
            if (sot) {
                fs.writeFileSync(path.join(dir, task.output), sot);
                combinedSOT += `## ${task.output}\n${sot}\n\n`;
                console.log(`[SOT Builder] Zapisano: ${task.output}`);
            }
        } else {
            console.warn(`[SOT Builder] Pominięto, brak pliku: ${task.file}`);
        }
    }

    // Zapisz połączoną bazę wiedzy dla Agenta
    fs.writeFileSync(path.join(dir, 'SOT_Baza_Wiedzy_Agenta.md'), combinedSOT);
    console.log("[SOT Builder] Całkowicie połączona baza SOT została zapisana jako SOT_Baza_Wiedzy_Agenta.md");
}

main();
