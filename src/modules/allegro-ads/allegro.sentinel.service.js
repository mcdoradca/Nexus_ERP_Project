const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../../core/prisma');
const cron = require('node-cron');
const EventBus = require('../../core/EventBus');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function runSentinelAudit() {
    try {
        console.log("[SENTINEL] Rozpoczynam głęboki audyt zmian na Allegro (Deep Research)...");
        
        // Zgodnie z architekturą, Sentinel używa Google Search Grounding by zdobyć najświeższe fakty.
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            tools: [{ googleSearch: {} }] // Włączenie dostępu do świeżych wyników wyszukiwania Google
        });

        const prompt = `Jesteś analitykiem rynku E-commerce (Kryptonim: Sentinel) pracującym autonomicznie dla systemu Nexus ERP.
Twoim zadaniem jest wykonanie głębokiego researchu w internecie na temat najnowszych komunikatów i zmian dla sprzedawców na platformie Allegro.pl wprowadzonych od końca roku 2024 przez rok 2025 (i dalej).
Zwróć szczególną uwagę na:
1. Zmiany stawek minimalnych CPC/CPM w Allegro Ads.
2. Zmiany w programie Allegro Smart! (opłaty, zasady wymiany monet, waga kosztów dostawy w trafności).
3. Ewentualne nowości o blokadach, prowizjach lub karach za niezgodność z regulaminem.

Przeprowadź research. Jeżeli znajdziesz TWARDE FAKTY i liczby (np. podwyżka CPM do 16 zł, zmiany monet), przygotuj KRÓTKI alert dla zarządu w języku polskim.
Wypisz to w punktach, określając co się zmieniło i jakie ma to konsekwencje dla rentowności (ROI) oraz zarządzania budżetem Ads.
Podaj daty zmian, jeśli są dostępne.
Jeżeli w sieci nie ma absolutnie żadnych nowych informacji o opłatach lub regulaminach (od końca 2024), odpowiedz dokładnie słowami: "BRAK KRYTYCZNYCH ZMIAN".`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        if (responseText && !responseText.includes("BRAK KRYTYCZNYCH ZMIAN")) {
            console.log("[SENTINEL] Wykryto krytyczne zmiany! Publikuję w UniversalChat...");
            
            // Szukamy konta, z którego wyślemy wiadomość - najlepiej kogoś funkcyjnego lub admina
            const systemUser = await prisma.user.findFirst({
                where: { email: 'admin@aps.local' }
            });

            if (systemUser) {
                await prisma.globalMessage.create({
                    data: {
                        content: `🚨 **[ALERT SYSTEMU SENTINEL - DEEP RESEARCH]** 🚨\n\nWykryto zmiany rynkowe na Allegro:\n\n${responseText}\n\n*Wymagana weryfikacja i dostosowanie progów Target Margin Bidding w kampaniach!*`,
                        authorId: systemUser.id,
                        actionType: 'alert'
                    }
                });
                
                // Emisja eventu poinformuje websocket o nowej wiadomości globalnej
                EventBus.emit('new_global_message', { alert: true });
            }
        } else {
             console.log("[SENTINEL] Analiza zakończona. Brak nowych krytycznych zmian w regulaminach.");
        }
        
        return responseText;
    } catch (err) {
        console.error("[SENTINEL ERROR]", err);
        throw err;
    }
}

function initSentinel() {
    // CRON: Odpalaj codziennie o 04:00 rano
    cron.schedule('0 4 * * *', () => {
        runSentinelAudit();
    });
    console.log("[SENTINEL] Moduł Autoadaptacji i Ciągłego Nasłuchu zintegrowany (CRON: 0 4 * * *).");
}

module.exports = {
    initSentinel,
    runSentinelAudit
};
