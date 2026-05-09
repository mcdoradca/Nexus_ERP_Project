const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EventBus = require('../../core/EventBus');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function parseInvoiceWithAI(fileBuffer, mimeType = "application/pdf") {
    // gemini-3.1-pro-preview obsługuje multimodalność (w tym PDF natywnie)
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
    
    const prompt = `
Jesteś elitarnym Agentem IDP (Ekstraktor Wizyjny).
Przeanalizuj załączony dokument faktury (skan/tabela Comarch, Subiekt) i wyciągnij linie produktów.
Szukaj polskich nagłówków: "Lp.", "J.M.", "Ilość", "Cena Netto po Rabacie", "EAN", "Kod Producenta".

Interesuje mnie:
1. "ean" - kod kreskowy towaru (priorytet).
2. "basePrice" - jednostkowa cena netto po rabacie dla tego wiersza.
3. "quantity" - ilość sztuk zakupionych.
4. "confidenceScore" - Twoja pewność co do poprawności odczytu dla tego wiersza w skali 0.0 do 1.0 (1.0 = całkowita pewność).

Odpowiedz TYLKO I WYŁĄCZNIE czystym kodem JSON (bez bloków markdown i bez znaczników \`\`\`json).
Format docelowy:
[
  {
    "ean": "590123456789",
    "basePrice": 15.50,
    "quantity": 100,
    "confidenceScore": 0.99
  }
]
`;

    try {
        const imagePart = {
            inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: mimeType
            }
        };

        const response = await model.generateContent([prompt, imagePart]);
        let responseText = response.response.text().trim();
        
        // Czysty JSON parser
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/```/g, '').trim();
        }
        
        return JSON.parse(responseText);
    } catch (err) {
        console.error("Vision AI Invoice parsing error:", err);
        throw new Error("Sztuczna Inteligencja Vision nie mogła zdekodować zawartości faktury.");
    }
}

async function processInvoiceAndApplyCosts(fileBuffer, requestedUploaderId, fileName) {
    const items = await parseInvoiceWithAI(fileBuffer);
    
    if (!Array.isArray(items)) {
        throw new Error("Model AI zwrócił błędny format.");
    }
    
    const processedResults = [];
    let requiresHumanValidation = false;
    
    // Fallback dla creatorId dla Kanbana
    let creatorId = requestedUploaderId;
    if (!creatorId) {
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        creatorId = admin ? admin.id : null;
    }
    
    for (const item of items) {
        if (!item.ean) continue;
        
        // Szukamy w naszej bazie po EAN
        const product = await prisma.product.findUnique({ where: { ean: item.ean } });
        if (!product) {
            processedResults.push({ ean: item.ean, status: 'NOT_FOUND_IN_PIM' });
            continue;
        }

        // Tarcza Błędów (Human-in-the-loop) 
        // Wymagany confidence > 0.98. W innym wypadku alert
        if (item.confidenceScore < 0.98) {
            requiresHumanValidation = true;
            
            if (creatorId) {
                await prisma.task.create({
                    data: {
                        title: `Faktura ${fileName}: Weryfikacja kosztów dla EAN ${item.ean}`,
                        description: `Agent IDP Wizyjny zidentyfikował ten towar z pewnością zaledwie ${(item.confidenceScore * 100).toFixed(1)}%. \n\nAlgorytm zablokował zapis w PIM. \nWymagana weryfikacja człowiek-w-pętli.\nProponowana cena z faktury: ${item.basePrice} PLN.`,
                        status: "TODO",
                        priority: "HIGH",
                        creatorId: creatorId,
                    }
                });
            }
            
            processedResults.push({ ean: item.ean, status: 'BLOCKED_LOW_CONFIDENCE', confidence: item.confidenceScore });
            continue; // Pomijamy nadpisanie bazy PIM!
        }
        
        // Zaktualizuj bazę (Tylko gdy model jest PEWNY)
        const updated = await prisma.product.update({
            where: { ean: item.ean },
            data: {
                basePrice: item.basePrice || product.basePrice,
            }
        });
        
        // Publikacja zdarzenia o bezpiecznej zmianie
        EventBus.publish('PRODUCT_COST_UPDATED', { product: updated, source: 'VISION_IDP_SAFE' });
        
        processedResults.push({ ean: item.ean, name: updated.name, newBasePrice: updated.basePrice, status: 'UPDATED' });
    }
    
    return {
        processedItems: items.length,
        requiresHumanValidation,
        details: processedResults
    };
}

module.exports = {
    parseInvoiceWithAI,
    processInvoiceAndApplyCosts
};
