const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const chatService = require('./chat.service');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const BOT_EMAIL = 'nexus.ai@system.local';
let botUserId = null;

async function getBotUserId() {
    if (botUserId) return botUserId;
    const bot = await prisma.user.findUnique({ where: { email: BOT_EMAIL } });
    if (bot) botUserId = bot.id;
    return botUserId;
}

// In-Memory Cache do optymalizacji zapytań
const inMemoryCache = {
    baselinkerToken: null,
    baselinkerInventoryId: null,
    lastUpdate: 0
};

async function getCachedBaselinkerData() {
    const now = Date.now();
    // Odśwież cache co godzinę (3600000 ms)
    if (inMemoryCache.baselinkerToken && inMemoryCache.baselinkerInventoryId && (now - inMemoryCache.lastUpdate < 3600000)) {
        return { token: inMemoryCache.baselinkerToken, inventoryId: inMemoryCache.baselinkerInventoryId };
    }
    
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    if (!tokenRecord || !tokenRecord.value) throw new Error('Brak tokenu BaseLinker w systemie.');
    const token = tokenRecord.value;
    
    const paramsInv = new URLSearchParams();
    paramsInv.append('method', 'getInventories');
    paramsInv.append('parameters', JSON.stringify({}));
    const resInv = await axios.post('https://api.baselinker.com/connector.php', paramsInv.toString(), {
        headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    let inventoryId = 1;
    if (resInv.data && resInv.data.inventories && resInv.data.inventories.length > 0) {
        inventoryId = resInv.data.inventories[0].inventory_id;
    }
    
    inMemoryCache.baselinkerToken = token;
    inMemoryCache.baselinkerInventoryId = inventoryId;
    inMemoryCache.lastUpdate = now;
    
    return { token, inventoryId };
}

// Definicje narzędzi (Function Calling)
const tools = [
    { googleSearch: {} },
    {
        functionDeclarations: [
            {
                name: 'get_product_inventory',
                description: 'Pobiera aktualny stan magazynowy, cenę i szczegóły produktu. Użyj tego, gdy użytkownik pyta o konkretny produkt.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        searchQuery: {
                            type: 'STRING',
                            description: 'EAN, SKU lub fragment nazwy produktu do wyszukania.'
                        }
                    },
                    required: ['searchQuery']
                }
            },
            {
                name: 'get_system_stats',
                description: 'Pobiera ogólne statystyki systemu Nexus ERP (liczba aktywnych projektów, zadań, użytkowników).',
                parameters: {
                    type: 'OBJECT',
                    properties: {}
                }
            },
            {
                name: 'query_baselinker_inventory',
                description: 'Przeszukuje inwentarz w systemie BaseLinker pod kątem EAN, SKU lub nazwy, zwracając listę dopasowanych produktów wraz ze stanem magazynowym z zewnętrznego systemu.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        searchQuery: {
                            type: 'STRING',
                            description: 'EAN, SKU lub fragment nazwy produktu do wyszukania w BaseLinkerze.'
                        }
                    },
                    required: ['searchQuery']
                }
            },
            {
                name: 'search_influencers',
                description: 'Przeszukuje bazę influencerów w ERP. Używaj, gdy użytkownik szuka konkretnego influencera lub influencerów w danej niszy, na danej platformie.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        niche: { type: 'STRING', description: 'Nisza tematyczna (np. gaming, beauty, tech).' },
                        platform: { type: 'STRING', description: 'Platforma społecznościowa (np. INSTAGRAM, YOUTUBE, TIKTOK).' },
                        maxRate: { type: 'INTEGER', description: 'Maksymalna stawka za współpracę w PLN.' }
                    }
                }
            },
            {
                name: 'search_crm_companies',
                description: 'Przeszukuje bazę firm (kontrahentów) w systemie CRM. Użyj, gdy użytkownik pyta o firmę, NIP, numer telefonu lub dane kontaktowe do osób w firmie.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        searchQuery: { type: 'STRING', description: 'Nazwa firmy, NIP, lub branża.' }
                    },
                    required: ['searchQuery']
                }
            },
            {
                name: 'execute_dynamic_prisma_query',
                description: 'POTĘŻNE NARZĘDZIE ANALITYCZNE: Elastyczne przeszukiwanie bazy danych Prisma. Przekaż nazwę modelu (np. "user", "task", "invoiceDocument") oraz poprawny obiekt JSON "query" dla funkcji findMany() (np. { "where": { "status": "PENDING" }, "take": 5 }). Narzędzie wykonuje zapytanie read-only na bazie i zwraca dane, z których możesz ułożyć odpowiedź.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        modelName: { type: 'STRING', description: 'Nazwa modelu z małej litery (np. user, task, campaign, product)' },
                        query: { type: 'STRING', description: 'Poprawny JSON query np. {"where":{"status":"TODO"}, "take": 5}' }
                    },
                    required: ['modelName', 'query']
                }
            }
        ]
    }
];

const prismaSchemaContent = fs.readFileSync(path.join(__dirname, '../../..', 'prisma', 'schema.prisma'), 'utf8');

const systemInstruction = `Jesteś NeS (Nexus Sentinel) - superinteligentnym, autonomicznym Agentem Klasy Enterprise (2026 r.) zintegrowanym z systemem ERP.
Twoim zadaniem jest zapewnienie najwyższej jakości wsparcia analitycznego, operacyjnego i decyzyjnego dla Zarządu oraz pracowników.
- Masz pełny dostęp do wewnętrznej bazy danych (poprzez narzędzie execute_dynamic_prisma_query).
- Masz dostęp do Deep Research poprzez wyszukiwarkę Google.
- Kiedy pojawia się problem lub pytanie o rynek, użyj 'googleSearch' by zdobyć FAKTY. Użyj 'execute_dynamic_prisma_query' TYLKO jeśli pytanie jednoznacznie odnosi się do naszych wewnętrznych danych w ERP.
- Bądź EXTREMALNIE zwięzły i do bólu precyzyjny. Odpowiadaj TYLKO i WYŁĄCZNIE na to o co pyta użytkownik. ZAKAZ pisania jakichkolwiek raportów, audytów produktów, skanowania PIM czy generowania propozycji zadań dla innych działów, chyba że użytkownik o to wyraźnie poprosi (np. "zrób audyt PIM"). Jeśli pyta o rynek, podaj rynek. Koniec odpowiedzi.
- Używaj krótkich akapitów. Unikaj wstępów typu "Zebrałem dane z przełomu...". Po prostu podaj dane.

--- SCHEMAT BAZY DANYCH ---
${prismaSchemaContent}
---------------------------

- Zawsze zwracaj odpowiedź w ładnie sformatowanym formacie Markdown (pogrubienia, wypunktowania).
- ZAKAZ UŻYWANIA TABEL MARKDOWN: Tabele są niszczycielskie dla modułu Text-To-Speech. Jeśli musisz wylistować dane, zrób to w formie zwykłej listy (np. "- Nazwa: X, Obserwatorzy: Y").
- OPTYMALIZACJA WYMOWY (DLA ELEVENLABS): Bezwzględnie zapisuj wszystkie liczby SŁOWNIE, poprawnie odmieniając je przez przypadki. Zamiast "8 influencerów" napisz "ośmiu influencerów". Zamiast "2.6 miliona" napisz "dwa przecinek sześć miliona" lub "dwa i pół miliona". Unikaj cyfr arabskich – syntezator mowy ma problem z ich gramatyczną interpretacją w języku polskim!
- Jesteś zintegrowany z silnikiem Gemini 3.1 Pro (Antigravity). Jesteś sercem systemu.`;

async function executeToolCall(name, args, socket) {
    if (name === 'get_product_inventory') {
        if (socket) socket.nsp.emit('bot_typing', { message: 'Przeszukuję lokalną bazę danych...' });
        const { searchQuery } = args;
        const products = await prisma.product.findMany({
            where: {
                OR: [
                    { ean: { contains: searchQuery, mode: 'insensitive' } },
                    { sku: { contains: searchQuery, mode: 'insensitive' } },
                    { name: { contains: searchQuery, mode: 'insensitive' } }
                ]
            },
            take: 5
        });
        
        if (products.length === 0) {
            return { message: `Nie znaleziono produktów dla zapytania: ${searchQuery}` };
        }
        
        return products.map(p => ({
            nazwa: p.name,
            sku: p.sku,
            ean: p.ean,
            stan_magazynowy: p.stock,
            cena_sprzedazy: p.salePrice
        }));
    } else if (name === 'get_system_stats') {
        if (socket) socket.nsp.emit('bot_typing', { message: 'Pobieram statystyki ze wszystkich modułów ERP...' });
        const [tasks, projects, users, influencers, companies, campaigns, deals] = await Promise.all([
            prisma.task.count({ where: { status: { not: 'DONE' } } }),
            prisma.project.count({ where: { status: 'AKTYWNY' } }),
            prisma.user.count({ where: { isActive: true } }),
            prisma.influencerProfile.count(),
            prisma.company.count(),
            prisma.campaign.count(),
            prisma.dealIRM.count()
        ]);
        return {
            aktywne_zadania: tasks,
            aktywne_projekty: projects,
            aktywni_uzytkownicy: users,
            influencerzy: influencers,
            firmy_crm: companies,
            kampanie: campaigns,
            szanse_sprzedazy: deals
        };
    } else if (name === 'query_baselinker_inventory') {
        try {
            if (socket) socket.nsp.emit('bot_typing', { message: 'Łączenie z serwerem BaseLinker...' });
            const { searchQuery } = args;
            
            const { token, inventoryId } = await getCachedBaselinkerData();
            
            if (socket) socket.nsp.emit('bot_typing', { message: 'Pobieranie produktów z magazynu...' });
            
            const params = new URLSearchParams();
            params.append('method', 'getInventoryProductsList');
            params.append('parameters', JSON.stringify({
                inventory_id: inventoryId,
                search_text: searchQuery
            }));
            
            const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
                headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            
            if (response.data.status === 'ERROR') {
                return { error: response.data.error_message };
            }
            
            const productsInfo = response.data.products;
            if (!productsInfo || Object.keys(productsInfo).length === 0) {
                return { message: `Nie znaleziono produktów w BaseLinker dla zapytania: ${searchQuery}` };
            }
            
            return Object.values(productsInfo).map(p => {
                let totalStock = 0;
                if (p.stock) {
                    totalStock = Object.values(p.stock).reduce((a, b) => a + (Number(b) || 0), 0);
                } else if (p.quantity) {
                    totalStock = Number(p.quantity);
                }
                
                return {
                    id_baselinker: p.product_id,
                    nazwa: p.name,
                    ean: p.ean,
                    sku: p.sku,
                    stan_magazynowy: totalStock
                };
            });
        } catch (error) {
            console.error("BaseLinker Tool Error:", error.message);
            return { error: "Błąd podczas łączenia z API BaseLinker." };
        }
    } else if (name === 'search_influencers') {
        if (socket) socket.nsp.emit('bot_typing', { message: 'Przeszukuję repozytorium influencerów...' });
        const { niche, platform, maxRate } = args;
        const where = {};
        if (platform) where.platform = { contains: platform, mode: 'insensitive' };
        if (maxRate) where.maxRate = { lte: maxRate, gt: 0 };
        
        let influencers = await prisma.influencerProfile.findMany({ where, take: 30 });
        
        if (niche) {
            influencers = influencers.filter(i => {
                // Konwersja bezpieczna dla JSON/String
                const n = i.demographicData && typeof i.demographicData === 'object' && i.demographicData.niche 
                    ? String(i.demographicData.niche) 
                    : '';
                return n && n.toLowerCase().includes(niche.toLowerCase());
            });
        }
        
        return influencers.map(i => ({
            nazwa: i.name,
            handle: i.handle,
            platforma: i.platform,
            obserwatorzy: i.followers,
            typ_wspolpracy: i.preferredCollab,
            budzet_min: i.minRate,
            budzet_max: i.maxRate
        }));
    } else if (name === 'search_crm_companies') {
        if (socket) socket.nsp.emit('bot_typing', { message: 'Przeszukuję bazę CRM kontrahentów...' });
        const { searchQuery } = args;
        const companies = await prisma.company.findMany({
            where: {
                OR: [
                    { name: { contains: searchQuery, mode: 'insensitive' } },
                    { taxId: { contains: searchQuery } },
                    { industry: { contains: searchQuery, mode: 'insensitive' } }
                ]
            },
            include: { contacts: true },
            take: 10
        });
        
        return companies.map(c => ({
            nazwa: c.name,
            nip: c.taxId,
            branza: c.industry,
            telefon: c.mainPhone,
            email: c.mainEmail,
            kontakty: c.contacts.map(contact => `${contact.firstName} ${contact.lastName} (${contact.role || 'Pracownik'}) - Email: ${contact.email || '-'} Tel: ${contact.phone || '-'}`)
        }));
    } else if (name === 'execute_dynamic_prisma_query') {
        if (socket) socket.nsp.emit('bot_typing', { message: `Przeszukuję bazę danych (${args.modelName})...` });
        try {
            const queryObj = JSON.parse(args.query);
            
            // TARCZA BEZPIECZEŃSTWA (Read-Only Guard)
            if (!prisma[args.modelName]) {
                return { error: `Model ${args.modelName} nie istnieje w instancji Prisma.` };
            }
            
            // Hard limit do 30 rekordów by uniknąć przeciążenia pamięci i limitów tokenów w LLM
            if (!queryObj.take || queryObj.take > 30) {
                queryObj.take = 30;
            }
            
            const results = await prisma[args.modelName].findMany(queryObj);
            return results;
        } catch (err) {
            console.error("Prisma Dynamic Query Error:", err);
            return { error: `Błąd wykonania zapytania Prisma: ${err.message}` };
        }
    }
    
    return { error: 'Unknown function' };
}

async function processBotMention(messageContent, authorName, mode, targetId, socket) {
    const botId = await getBotUserId();
    if (!botId) {
        console.error("Nexus AI User not found in DB.");
        return;
    }

    try {
        if (socket) socket.nsp.emit('bot_typing', { message: 'NeS (Nexus Sentinel) analizuje zapytanie...' });
        
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.1-pro-preview',
            tools: tools,
            toolConfig: { functionCallingConfig: { mode: "AUTO" }, includeServerSideToolInvocations: true },
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
                temperature: 0.1,
                topP: 0.8
            }
        });

        // W ramach uproszczenia (braku pełnej historii czatu), podajemy modelowi tylko obecną wiadomość z kontekstem.
        const chat = model.startChat();
        
        const userPrompt = `Wiadomość od użytkownika ${authorName}: ${messageContent}`;
        let result = await chat.sendMessage(userPrompt);
        let responseText = "";

        // Obsługa wywołań narzędzi (pętla while dla łańcuchowych wywołań)
        while (result.response && typeof result.response.functionCalls === 'function' && result.response.functionCalls() && result.response.functionCalls().length > 0) {
            const calls = result.response.functionCalls();
            const functionResponses = [];
            
            for (const call of calls) {
                console.log(`[NeS] Wywołanie funkcji: ${call.name}`, call.args);
                const toolResult = await executeToolCall(call.name, call.args, socket);
                
                functionResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: { result: toolResult }
                    }
                });
            }
            
            // Zwracamy wyniki wszystkich narzędzi z tej iteracji do modelu
            result = await chat.sendMessage(functionResponses);
        }
        
        responseText = result.response.text();

        // Usuń wskaźnik pisania
        if (socket) socket.nsp.emit('bot_typing_stop', {});

        // Zapisz odpowiedź w odpowiednim miejscu
        if (mode === 'global') {
            await chatService.saveGlobalMessage(botId, responseText);
        } else if (mode === 'direct') {
            await chatService.saveDirectMessage(botId, 'NeS', targetId, responseText);
        } else {
            await chatService.saveEntityComment(mode, targetId, botId, responseText);
        }

    } catch (err) {
        console.error("Błąd podczas przetwarzania bota NeS:", err);
        if (socket) socket.nsp.emit('bot_typing_stop', {});
        
        // Fallback w przypadku, gdy gemini-3.1-pro-preview nie jest dostępne
        if (err.message && err.message.includes("404")) {
            console.log("[NeS] Fallback do gemini-2.5-pro...");
            const fallbackModel = genAI.getGenerativeModel({
                model: 'gemini-2.5-pro',
                tools: tools,
                systemInstruction: { parts: [{ text: systemInstruction }] }
            });
            const fallbackChat = fallbackModel.startChat();
            const fallbackResult = await fallbackChat.sendMessage(`Wiadomość od użytkownika ${authorName}: ${messageContent}`);
            
            // Proste przesłanie bez obsługi tools w fallbacku dla oszczędności kodu
            await chatService.saveGlobalMessage(botId, fallbackResult.response.text());
        } else {
            await chatService.saveGlobalMessage(botId, `❌ Wystąpił błąd podczas przetwarzania zapytania: ${err.message}`);
        }
    }
}

module.exports = {
    processBotMention
};
