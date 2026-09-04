const fs = require('fs');

async function runRepro() {
    console.log("=== START REPRO ===");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Brak GEMINI_API_KEY");
        return;
    }

    const offerData = JSON.parse(fs.readFileSync('./src/modules/offer-optimizer-v2/out/offer_8004120905674.json', 'utf8'));
    const productDetailsText = JSON.stringify(offerData, null, 2);

    const instruction = "Wykreuj scenę, gdzie produkt jest ustawiony w całkowicie losowym miejscu w tle, ale bezwzględnie poza centrum kadru. Produkt musi pozostać widoczny.";
    
    const systemPrompt = `
Jesteś wybitnym kreatorem scen (Prompt Masterem) dla generatora obrazów Photoroom AI.
Otrzymasz dane produktu z bazy PIM (Product Information Management).
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku POLSKIM opisujący scenę dla zdjęcia. Upewnij się, że w prompcie znajduje się absolutny zakaz umieszczania produktu na samym środku kadru. Na końcu promptu zawsze dodaj słowa kluczowe podnoszące jakość (np. fotorealistyczne, profesjonalna fotografia, kinowe oświetlenie, ostra ostrość).

ZAKAZ MODYFIKACJI PRODUKTU: Masz absolutny zakaz opisywania w prompcie cech samego produktu (np. zmiany koloru patyczków zapachowych, materiału, kształtu). Produkt referencyjny jest święty.

BEZWZGLĘDNA OBECNOŚĆ PRODUKTU: Produkt referencyjny MUSI ZAWSZE znajdować się na zdjęciu. Może stać daleko w tle, być za mgłą, parą lub mocno zblurowany (zależnie od polecenia), ale w Twoim prompcie musi fizycznie istnieć w kreowanej scenie jako jej część.

ZAKAZANE MOTYWY: Masz absolutny zakaz używania w scenerii motywów lepienia garnków, koła garncarskiego oraz mrocznego klimatu stolarni/warsztatu.

TWOJE ZADANIE: ${instruction}

WYMÓG KREATYWNOŚCI: 
Przeanalizuj do czego służy produkt i wylosuj JEDNO, konkretne, ale nieszablonowe otoczenie dla niego. 
Zaskocz mnie różnorodnością!

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST PROMPTU, BEZ ŻADNYCH ZNACZNIKÓW, BEZ WSTĘPÓW I BEZ FORMATOWANIA JSON.

Dane produktu PIM:
${productDetailsText}
`.trim();

    const variants = [
        {
            name: "A) as-is: responseMimeType '', thinkingConfig {}",
            config: {
                responseMimeType: "",
                thinkingConfig: {}
            }
        },
        {
            name: "B) thinkingLevel 'LOW'",
            config: {
                thinkingConfig: { thinkingLevel: "LOW" }
            }
        },
        {
            name: "C) responseMimeType 'text/plain'",
            config: {
                responseMimeType: "text/plain",
            }
        },
        {
            name: "D) B + C (thinking + text/plain)",
            config: {
                responseMimeType: "text/plain",
                thinkingConfig: { thinkingLevel: "LOW" }
            }
        }
    ];

    for (const variant of variants) {
        console.log(`\n---> Testuję wariant: ${variant.name}`);
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: {
                temperature: 0.8,
                ...variant.config
            }
        };

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.7-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const status = response.status;
            const data = await response.json();

            if (!response.ok) {
                console.log(`HTTP ${status}: ${JSON.stringify(data.error || data).substring(0, 200)}`);
            } else {
                const candidate = data.candidates && data.candidates[0];
                const finishReason = candidate ? candidate.finishReason : 'N/A';
                const usage = data.usageMetadata || {};
                console.log(`HTTP ${status} | finishReason: ${finishReason} | candidatesTokenCount: ${usage.candidatesTokenCount} | thoughtsTokenCount: ${usage.thoughtsTokenCount || 0}`);
            }
        } catch (err) {
            console.error(`Fetch error: ${err.message}`);
        }
    }
}

runRepro();
