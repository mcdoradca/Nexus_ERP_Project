const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EventBus = require('../../core/EventBus');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function extractTextFromPDF(buffer) {
    try {
        const data = await pdf(buffer);
        return data.text;
    } catch (err) {
        console.error("Błąd pdf-parse:", err);
        throw new Error("Nie udało się odczytać tekstu z PDF.");
    }
}

async function parseInvoiceWithAI(invoiceText) {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
    
    const prompt = `
Jesteś zaawansowanym systemem IDP (Intelligent Document Processing). 
Oto treść surowego tekstu z zeskanowanej faktury lub dokumentu dostawy:
---
${invoiceText}
---

Twoim zadaniem jest znalezienie wszystkich produktów (pozycji na fakturze) i wyodrębnienie ich kosztów.
Interesuje mnie:
1. "ean" - kod kreskowy (jeśli go nie ma, użyj SKU lub nazwy, spróbuj wydedukować lub po prostu omiń, jeśli brak identyfikatora). Priorytet to EAN.
2. "basePrice" - jednostkowa cena netto (cena zakupu produktu).
3. "inboundTransportCost" - przydzielony jednostkowy koszt transportu. Jeśli na fakturze jest ogólny koszt transportu (np. 100 zł), musisz zignorować go lub w idealnym wypadku podzielić proporcjonalnie. Jeśli brak infomacji, zwróć 0.

Odpowiedz TYLKO I WYŁĄCZNIE czystym kodem JSON (bez bloków \`\`\`json).
Format:
[
  {
    "ean": "590123456789",
    "basePrice": 15.50,
    "inboundTransportCost": 0.0
  }
]
`;

    try {
        const response = await model.generateContent(prompt);
        let responseText = response.response.text().trim();
        // Usunięcie ewentualnych bloków kodu markdown
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/```/g, '').trim();
        }
        
        return JSON.parse(responseText);
    } catch (err) {
        console.error("AI Invoice parsing error:", err);
        throw new Error("Sztuczna Inteligencja nie mogła zdekodować zawartości faktury.");
    }
}

async function processInvoiceAndApplyCosts(fileBuffer) {
    const text = await extractTextFromPDF(fileBuffer);
    const items = await parseInvoiceWithAI(text);
    
    if (!Array.isArray(items)) {
        throw new Error("Model AI zwrócił błędny format.");
    }
    
    const updatedProducts = [];
    
    for (const item of items) {
        if (!item.ean) continue;
        
        // Szukamy w naszej bazie po EAN
        const product = await prisma.product.findUnique({ where: { ean: item.ean } });
        if (product) {
            // Aktualizujemy koszty w bazie
            const updated = await prisma.product.update({
                where: { ean: item.ean },
                data: {
                    basePrice: item.basePrice || product.basePrice,
                    inboundTransportCost: item.inboundTransportCost || product.inboundTransportCost
                }
            });
            
            // Faza 3 (MDM): Automatyczna Synergia - Publikujemy zdarzenie na szynę
            // Moduł IDP już "nie wie" o istnieniu kalkulatora cen. On tylko ogłasza, że zmienił koszty.
            EventBus.publish('PRODUCT_COST_UPDATED', { product: updated, source: 'IDP_INVOICE' });
            
            updatedProducts.push(updated);
        }
    }
    
    return {
        processedItems: items.length,
        updatedProductsCount: updatedProducts.length,
        items: updatedProducts.map(p => ({ ean: p.ean, name: p.name, newBasePrice: p.basePrice }))
    };
}

module.exports = {
    extractTextFromPDF,
    parseInvoiceWithAI,
    processInvoiceAndApplyCosts
};
