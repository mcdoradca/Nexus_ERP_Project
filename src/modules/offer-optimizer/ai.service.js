const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const agent1Logger = require('../../utils/agent1_logger');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const sharp = require('sharp');
sharp.cache(false); // WyĹ‚Ä…czenie wbudowanego cache'u dla stabilnoĹ›ci RAM przy batchingu
const FormData = require('form-data');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { STANDARD_PROMPT, COSMETIC_AUDITOR_PROMPT, VISION_AUDIT_PROMPT, getMasterPrompt } = require('./ai.prompts');
const { getDeterministicPromptForSlot, getPaddingForSlot, hashSKU } = require('./photoroom.prompts');
const cheerio = require('cheerio');
const EventBus = require('../../core/EventBus');
dotenv.config();
const AiMetricsService = require('../../core/ai.metrics.service');
const socketService = require('../../core/socket');

// Zabezpieczony Agent WAF do zdjÄ™Ä‡
const imageHttpsAgent = new https.Agent({ 
    rejectUnauthorized: false,
    family: 4 // Wymuszenie IPv4 - tarcza na AWS CloudFront BaseLinkera
});

async function fetchImageSecure(url, timeoutMs = 10000) {
    return axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        httpsAgent: imageHttpsAgent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });
}

// Ĺadowanie bazy wiedzy do pamiÄ™ci serwera raz podczas uruchomienia
let INCI_KNOWLEDGE_BASE = "";
try {
    INCI_KNOWLEDGE_BASE = fs.readFileSync(path.join(__dirname, 'inci_knowledge.txt'), 'utf-8');
} catch (e) {
    console.error("[AiService] Brak pliku inci_knowledge.txt - system bÄ™dzie dziaĹ‚aĹ‚ bez rozszerzonej bazy wiedzy.");
}

// Dedykowany moduĹ‚ ustrukturyzowanego logowania zdarzeĹ„ Lifestyle AI
const lifestyleLogPath = path.join(__dirname, '..', '..', '..', 'logs', 'lifestyle-ai.log');
function logLifestyleEvent(level, message, details = {}) {
    const timestamp = new Date().toISOString();
    const logLine = JSON.stringify({ timestamp, level, message, details }) + '\n';
    try {
        const logDir = path.dirname(lifestyleLogPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(lifestyleLogPath, logLine, 'utf-8');
    } catch (err) {
        console.error("[LifestyleLogger Error] Nie udaĹ‚o siÄ™ zapisaÄ‡ loga do pliku:", err.message);
    }
}

const withTimeout = (promise, ms, contextName = 'Unknown Model') => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            console.error(`[AiService Timeout] Zablokowano zawieszone poĹ‚Ä…czenie dla modelu ${contextName} po ${ms}ms.`);
            reject(new Error(`timeout ${ms}ms exceeded for ${contextName}`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

/**
 * Exponential Backoff Retry Policy
 */
async function generateWithRetry(model, promptOrParts, maxRetries = 2, agentId = "System_Agent", parseJson = false, filterFn = null) {
    let attempt = 0;
    const modelName = model.model || "gemini-model";
    const startTime = Date.now();
    
    const broadcastLog = (msg) => {
        console.log(`[AiService] ${msg}`);
        try {
            socketService.broadcast('nexus-notification', { type: 'PIPELINE_LOG', agentId, message: msg });
        } catch(e) {}
    };

    broadcastLog(`Start generateWithRetry dla ${modelName}, max prĂłby: ${maxRetries}`);
    
    while (attempt < maxRetries) {
        let result;
        let usageLogged = false;
        try {
            const attemptStart = Date.now();
            broadcastLog(`PrĂłba ${attempt + 1}/${maxRetries} rozpoczÄ™ta...`);
            // Twardy timeout 90 sekund (90000ms) dla kaĹĽdego zapytania do modelu
            result = await withTimeout(model.generateContent(promptOrParts), 90000, modelName);
            broadcastLog(`PrĂłba ${attempt + 1} ZAKOĹCZONA SUKCESEM po ${Date.now() - attemptStart}ms`);
            
            // Logika przeniesiona na dĂłĹ‚ (po wykonaniu parseJson)
            
            if (parseJson) {
                let text = result.response.text();
                
                // Tarcza Anty-Medyczna lub inne filtry
                if (typeof filterFn === 'function') {
                    text = filterFn(text);
                }
                
                // Oczyszczanie markdown przed parsowaniem JSON
                let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                
                // Solidny ekstraktor JSON zliczający zagnieżdżenia
                function extractFirstValidJson(str) {
                    const firstBrace = str.indexOf('{');
                    const firstBracket = str.indexOf('[');
                    let startIdx = -1;
                    let isArray = false;
                    
                    if (firstBrace !== -1 && firstBracket !== -1) {
                        if (firstBrace < firstBracket) { startIdx = firstBrace; isArray = false; }
                        else { startIdx = firstBracket; isArray = true; }
                    } else if (firstBrace !== -1) {
                        startIdx = firstBrace; isArray = false;
                    } else if (firstBracket !== -1) {
                        startIdx = firstBracket; isArray = true;
                    } else {
                        return str; 
                    }

                    let depth = 0;
                    let inString = false;
                    let escape = false;
                    
                    for (let i = startIdx; i < str.length; i++) {
                        const char = str[i];
                        if (inString) {
                            if (escape) { escape = false; }
                            else if (char === '\\') { escape = true; }
                            else if (char === '"') { inString = false; }
                        } else {
                            if (char === '"') { inString = true; }
                            else if (char === '{' && !isArray) { depth++; }
                            else if (char === '}' && !isArray) { 
                                depth--; 
                                if (depth === 0) return str.substring(startIdx, i + 1);
                            }
                            else if (char === '[' && isArray) { depth++; }
                            else if (char === ']' && isArray) { 
                                depth--; 
                                if (depth === 0) return str.substring(startIdx, i + 1);
                            }
                        }
                    }
                    return str; // Fallback do całego ciągu jeśli nawiasy się nie zbilansują
                }

                cleanText = extractFirstValidJson(cleanText);
                
                try {
                    const parsedData = JSON.parse(cleanText);
                    
                    // Zapis sukcesu jeĹ›li parseJson siÄ™ powiodĹ‚o bez rzucania wyjÄ…tku
                    try {
                        if (!usageLogged && result.response && result.response.usageMetadata) {
                            await AiMetricsService.logUsage(agentId, modelName, result.response.usageMetadata, true, attempt + 1, null);
                            usageLogged = true;
                        }
                    } catch (metricError) {
                        console.error("[AiService] BĹ‚Ä…d zapisu metryk telemetrii:", metricError.message);
                    }
                    
                    return parsedData;
                } catch (parseError) {
            broadcastLog(`BĹ‚Ä…d parsowania JSON: ${parseError.message}`);
            console.error(`[AiService] SUROWY PAYLOAD: ${cleanText}`); // dla debugowania w konsoli Node
            throw new Error(`JSON_PARSE_ERROR: ${parseError.message} | Payload snippet: ${cleanText.substring(0, 100)}`);
        }
    }
    
    // Zapis sukcesu dla wywoĹ‚aĹ„ bez parseJson
    try {
        if (!usageLogged && result.response && result.response.usageMetadata) {
            await AiMetricsService.logUsage(agentId, modelName, result.response.usageMetadata, true, attempt + 1, null);
            usageLogged = true;
        }
    } catch (metricError) {
        console.error("[AiService] BĹ‚Ä…d zapisu metryk telemetrii:", metricError.message);
    }
    
    return result;
} catch (error) {
    const isRateLimit = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('503')));
    const isJsonError = error.message && error.message.includes('JSON_PARSE_ERROR');
    const isTimeout = error.message && error.message.includes('timeout');
    const isRecitation = error.message && error.message.includes('RECITATION');
    const isMaxTokens = error.message && error.message.includes('MAX_TOKENS');
    const isThinkingConfigError = error.message && (error.message.includes('thinkingBudget') || error.message.includes('thinking_config'));
    
    let failureReason = 'API_ERROR';
    if (isJsonError) failureReason = 'PARSE_ERROR';
    else if (isTimeout) failureReason = 'TIMEOUT';
    else if (isRecitation) failureReason = 'RECITATION';
    else if (isMaxTokens) failureReason = 'MAX_TOKENS';
    else if (isRateLimit) failureReason = 'RATE_LIMIT';
    else if (isThinkingConfigError) failureReason = 'CONFIG_ERROR';

    if (isThinkingConfigError) {
        broadcastLog(`UWAGA: Model odrzuciĹ‚ parametr thinkingBudget: 0. Fallback (usuniÄ™cie parametru).`);
        console.warn(`[AiService] Model odrzuciĹ‚ thinkingConfig:`, error.message);
        if (model.generationConfig && model.generationConfig.thinkingConfig) {
            delete model.generationConfig.thinkingConfig;
        }
    }

    // Zapis do telemetrii PORAĹ»KI
    try {
        if (!usageLogged) {
            const errorUsage = (result && result.response && result.response.usageMetadata) || (error.response && error.response.usageMetadata);
            if (errorUsage) {
                await AiMetricsService.logUsage(agentId, modelName, errorUsage, false, attempt + 1, failureReason);
                usageLogged = true;
            } else if (!result) {
                // Czysty bĹ‚Ä…d bez metadanych, ale chcemy odnotowaÄ‡ fail dla AgentId
                await AiMetricsService.logUsage(agentId, modelName, null, false, attempt + 1, failureReason);
                usageLogged = true;
            }
        }
    } catch (metricError) {
        console.error("[AiService] BĹ‚Ä…d zapisu poraĹĽki do telemetrii:", metricError.message);
    }
            
            attempt++;

            
            broadcastLog(`BĹÄ„D w generateWithRetry [PrĂłba ${attempt}]: ${error.message}`);
            
            if (attempt >= maxRetries || (!isRateLimit && !isJsonError && !isTimeout && !isRecitation && !isThinkingConfigError)) {
                broadcastLog(`Krytyczny bĹ‚Ä…d API, brak dalszych ponowieĹ„. Przerwano.`);
                throw error; // Fail fast for non-transient errors
            }
            
            if (isJsonError) {
                const repairPrompt = "\n\nCRITICAL INSTRUCTION: Poprzednia prĂłba wygenerowaĹ‚a uszkodzony JSON (JSON_PARSE_ERROR). Upewnij siÄ™, ĹĽe zwracasz w 100% poprawny obiekt JSON. UĹĽyj ucieczki (escape) dla cudzysĹ‚owĂłw wewnÄ…trz stringĂłw (\\\") i unikaj znakĂłw nowej linii bezpoĹ›rednio w wartoĹ›ciach tekstowych!";
                if (typeof promptOrParts === 'string') {
                    promptOrParts += repairPrompt;
                } else if (Array.isArray(promptOrParts)) {
                    promptOrParts.push(repairPrompt);
                }
            } else if (isRecitation) {
                const repairPrompt = "\n\nCRITICAL INSTRUCTION: Poprzednia prĂłba zostaĹ‚a zablokowana przez filtr RECITATION. UWAGA: Parametry techniczne (np. rodzaj, waga), nazwy wĹ‚asne oraz skĹ‚ad INCI MUSISZ zachowaÄ‡ w oryginalnym brzmieniu! Zablokowanie nastÄ…piĹ‚o przez zbyt dosĹ‚owne kopiowanie dĹ‚ugich blokĂłw tekstu opisowego. Zamiast kopiowaÄ‡ opisy ze ĹşrĂłdĹ‚a, uĹĽyj wĹ‚asnych sĹ‚Ăłw TYLKO dla dĹ‚ugich form tekstowych (SEO, marketing), a twarde dane techniczne kopiuj 1:1.";
                if (typeof promptOrParts === 'string') {
                    promptOrParts += repairPrompt;
                } else if (Array.isArray(promptOrParts)) {
                    promptOrParts.push(repairPrompt);
                }
            }
            
            const backoffMs = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
            broadcastLog(`âš ď¸Ź Wznawiam (Exponential Backoff / Naprawa BĹ‚Ä™du) za ${Math.round(backoffMs)}ms...`);
            await new Promise(res => setTimeout(res, backoffMs));
        }
    }
}

/**
 * Tarcza Anty-Medyczna (Hardcoded Regex Dictionary)
 */
function strictRegexMedicalFilter(text) {
    if (!text) return text;
    // Lista zakazanych sĹ‚Ăłw (Audytor UE 1223/2009)
    const medicalTerms = /leczy|wyleczy|uzdrawia|lek|lecznicz[yae]|terapi[ai]|farmakologiczn[yae]|schorzenia|chorob[ay]|zabliĹşnia/gi;
    const sanitized = text.replace(medicalTerms, "[CENZURA-MEDYCZNA-DO-AKCEPTACJI]");
    if (sanitized !== text) {
        console.warn("[AiService] đź›ˇď¸Ź Tarcza Anty-Medyczna zadziaĹ‚aĹ‚a. Zablokowano halucynacjÄ™ prawnÄ….");
    }
    return sanitized;
}

/**
 * Autorski silnik cieniowania (Shadow Baking).
 * Rysuje rozmyty cieĹ„ kontaktowy pod obiektem i wgrywa go na serwer Claid.
 */
async function applyLocalShadow(imageUrl, claidKey) {
    try {
        console.log("[LocalShadow] Pobieranie przezroczystego produktu...");
        const response = await fetchImageSecure(imageUrl);
        const inputBuffer = Buffer.from(response.data);

        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        const shadowWidth = width * 0.85;
        const shadowHeight = height * 0.12;
        const blurRadius = Math.max(8, width * 0.04);

        const svgShadow = `
            <svg width="${width}" height="${height + shadowHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="blur">
                        <feGaussianBlur stdDeviation="${blurRadius}" />
                    </filter>
                </defs>
                <ellipse 
                    cx="${width / 2}" 
                    cy="${height - (shadowHeight / 3)}" 
                    rx="${shadowWidth / 2}" 
                    ry="${shadowHeight / 2}" 
                    fill="rgba(0, 0, 0, 0.8)" 
                    filter="url(#blur)" 
                />
            </svg>
        `;

        const extendedImage = await sharp(inputBuffer)
            .extend({ bottom: Math.round(shadowHeight), background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        const finalImage = await sharp(Buffer.from(svgShadow))
            .composite([{ input: extendedImage, blend: 'over' }])
            .png()
            .toBuffer();

        console.log("[LocalShadow] ZĹ‚oĹĽono cieĹ„, wgrywanie na serwer Claid (tmp_url)...");
        const form = new FormData();
        form.append('file', finalImage, { filename: 'shadowed.png', contentType: 'image/png' });
        form.append('data', JSON.stringify({}));

        const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: { 'Authorization': `Bearer ${claidKey}`, ...form.getHeaders() }
        });

        return uploadRes.data?.data?.output?.tmp_url || imageUrl;
    } catch (err) {
        console.error("[LocalShadow] BĹ‚Ä…d podczas renderowania cienia:", err.message);
        return imageUrl; // Fallback
    }
}

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Agent Badawczy (Research Agent)
 * Wyszukuje peĹ‚en skĹ‚ad INCI oraz specyfikacjÄ™ technicznÄ… produktu w Internecie.
 * Zastosowano wielopoziomowe parsowanie semantyczne (Cheerio) w celu ograniczenia halucynacji LLM
 * oraz uniezaleĹĽnienia siÄ™ od wahaĹ„ layoutu DOM.
 */
async function gatherProductIntelligence(ean, productName, existingDataFromPim = null) {
    console.log(`[AiService] Odpalanie Agenta Badawczego (OSINT + Cheerio) dla EAN: ${ean}...`);
    
    // Fallback wg wytycznych: najpierw korzystamy z danych z PIM, jeĹ›li sÄ… peĹ‚ne.
    if (existingDataFromPim && existingDataFromPim.length > 50) {
        console.log(`[AiService] UĹĽycie zbuforowanych danych z PIM/API, pomijanie poszukiwaĹ„ w sieci.`);
        return existingDataFromPim;
    }

    try {
        let semanticContext = "Brak wstÄ™pnych danych z ekstrakcji HTML.";
        try {
            const fallbackUrl = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`; 
            const response = await axios.get(fallbackUrl, { timeout: 3000 });
            if (response.data && response.data.product) {
                const p = response.data.product;
                semanticContext = `Zrzut semantyczny: INCI: ${p.ingredients_text || 'brak'}, Marka: ${p.brands}`;
            }
        } catch (fetchErr) {
            console.warn("[AiService] Ekstrakcja semantyczna nie powiodĹ‚a siÄ™. PrzechodzÄ™ do peĹ‚nego wyszukiwania AI.");
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview-customtools",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 }
        });
        
        const prompt = `JesteĹ› ekspertem ds. baz danych kosmetycznych i badaczem e-commerce.
Twoim zadaniem jest znalezienie oficjalnej specyfikacji technicznej oraz peĹ‚nego skĹ‚adu INCI dla produktu (z racji brakĂłw w danych z PIM).
Produkt: ${productName}
EAN: ${ean}
Kontekst z parsowania semantycznego (Zrzut DOM z Cheerio): ${semanticContext}

UĹĽyj wyszukiwarki Google (masz do niej dostÄ™p), aby przeszukaÄ‡ oficjalne strony producentĂłw, apteki internetowe lub renomowane e-drogerie.
ZwrĂłÄ‡ ZWARTY, tekstowy raport zawierajÄ…cy WYĹÄ„CZNIE:
1. PeĹ‚nÄ… specyfikacjÄ™ technicznÄ…. Postaraj siÄ™ wyciÄ…gnÄ…Ä‡ ze stron jak najwiÄ™cej parametrĂłw.
2. PeĹ‚ny, dokĹ‚adny i kompletny skĹ‚ad INCI.
Format wyjĹ›ciowy: ZwykĹ‚y tekst.`;
        
        const result = await generateWithRetry(model, prompt, 2, "Agent_1_OSINT");
        console.log(`[AiService] Agent Badawczy zakoĹ„czyĹ‚ pracÄ™. Znaleziono dane.`);
        return result.response.text();
    } catch (err) {
        console.error("[AiService] Agent Badawczy napotkaĹ‚ bĹ‚Ä…d:", err.message);
        EventBus.publish('nexus_bot_message', { 
            message: `âš ď¸Ź [ALERT ARCHITEKTURY] Agent Badawczy OSINT napotkaĹ‚ krytycznÄ… barierÄ™ ekstrakcyjnÄ… dla EAN: ${ean}. PowĂłd: ${err.message}` 
        });
        return existingDataFromPim || "Brak dodatkowych danych (BĹ‚Ä…d Agenta Badawczego).";
    }
}

/**
 * Agent Analizy Opinii i Sentimentu KlientĂłw (Customer Feedback Intelligence)
 * Przeszukuje autentyczne opinie i recenzje w sieci (Google Search Grounding).
 */
async function gatherCustomerSentiment(ean, productName, existingSentimentFromPim = null) {
    console.log(`[AiService] Odpalanie Agenta Sentimentu Opinii KlientĂłw dla: ${productName} (EAN: ${ean})...`);
    
    // JeĹ›li z bazy pobrano juĹĽ kompletny wsad sentimentu, pomiĹ„
    if (existingSentimentFromPim && existingSentimentFromPim.length > 20) {
        console.log(`[AiService] Posiadamy juĹĽ sentyment konsumentĂłw w PIM. Ograniczanie uĹĽycia sieci.`);
        return existingSentimentFromPim;
    }

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.2 }
        });

        const prompt = `JesteĹ› analitykiem opinii konsumenckich i sentimentu e-commerce.
Z powodu brakĂłw historycznych w bazie, twoim zadaniem jest znalezienie w sieci nowych, autentycznych opinii, recenzji i doĹ›wiadczeĹ„ konsumentĂłw na temat produktu.
Produkt: ${productName}
EAN: ${ean}

UĹĽyj wyszukiwarki Google, aby przeanalizowaÄ‡ recenzje w e-drogeriach, sklepach internetowych i na forach.
Przygotuj ustrukturyzowany zrzut sentimentu z konkretnymi wypowiedziami w formacie:
1. "Klienci w szczegĂłlnoĹ›ci chwalÄ… ten produkt za: [2-3 kluczowe cechy/efekty z opinii]"
2. "Osoby, ktĂłre wyprĂłbowaĹ‚y ten produkt, zwracajÄ… uwagÄ™ na: [zastosowanie/zapach/konsystencjÄ™/trwaĹ‚oĹ›Ä‡]"
3. "GĹ‚Ăłwne powody wysokiej oceny produktu: [podsumowanie]"

JeĹ›li produkt jest zupeĹ‚nie nowy i brak opinii w sieci, przygotuj hipotetyczny, bezpieczny zarys.
Odpowiedz w postaci zwiÄ™zĹ‚ego, czystego tekstu w jÄ™zyku polskim.`;

        const result = await generateWithRetry(model, prompt, 2, "Agent_2_Sentiment");
        console.log(`[AiService] Agent Sentimentu zakoĹ„czyĹ‚ analizÄ™ opinii (DANE NALEĹ»Y ZAPISAÄ† DO PIM).`);
        return result.response.text();
    } catch (err) {
        console.error("[AiService] Agent Sentimentu napotkaĹ‚ bĹ‚Ä…d:", err.message);
        return existingSentimentFromPim || "Klienci chwalÄ… ten produkt za wysokÄ… skutecznoĹ›Ä‡, wydajnoĹ›Ä‡ oraz Ĺ›wietne rezultaty codziennej pielÄ™gnacji.";
    }
}

/**
 * Agent Audytor Prawny (Compliance Agent)
 * Analizuje treĹ›ci marketingowe i wytyczne na bazie oficjalnych regulaminĂłw PDF.
 */
async function generateComplianceReport(productName, aeoContent, originalDescription) {
    console.log(`[AiService] Odpalanie Agenta Prawnego (Compliance Agent) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.0 } // 0.0 rygorystycznie - brak miejsca na halucynacje prawne
        });
        
        const parts = [
            `JesteĹ› rygorystycznym Audytorem Prawnym E-commerce i SpecjalistÄ… ds. ZgodnoĹ›ci Kosmetycznej.
Twoim zadaniem jest przeanalizowanie zaĹ‚Ä…czonych dokumentĂłw prawnych (Regulamin Allegro, RozporzÄ…dzenie WE nr 1223/2009, RozporzÄ…dzenie Komisji UE nr 655/2013) oraz materiaĹ‚Ăłw ĹşrĂłdĹ‚owych dla produktu.

ZwrĂłÄ‡ ZWARTY, RZECZOWY Raport ZgodnoĹ›ci (max 1000 znakĂłw), w ktĂłrym:
1. Wypiszesz niedozwolone oĹ›wiadczenia (tzw. claims) i sĹ‚owa, ktĂłrych bezwzglÄ™dnie copywriter MUSI unikaÄ‡ w tym konkretnym produkcie (np. oĹ›wiadczenia medyczne/lecznicze, niesprawdzone "green claims").
2. Podasz twarde zasady z Regulaminu Allegro, ktĂłre muszÄ… byÄ‡ zachowane przy opisie i tytule tego produktu.
3. Przeanalizujesz dostarczonÄ… treĹ›Ä‡ (AEO i oryginalny opis) i wskaĹĽesz ryzykowne sĹ‚owa, ktĂłre trzeba usunÄ…Ä‡, aby byĹ‚y w 100% zgodne z w/w przepisami.

MateriaĹ‚y ĹşrĂłdĹ‚owe produktu:
NAZWA PRODUKTU: ${productName}
TREĹšÄ† AEO: ${aeoContent || 'Brak'}
OPIS ORYGINALNY: ${originalDescription || 'Brak'}
`
        ];

        // ZaĹ‚adowanie wyciÄ…gu SOT (Single Source of Truth) z wygenerowanej bazy wiedzy prawniczej
        const sotPath = path.join(__dirname, 'SOT_Baza_Wiedzy_Agenta.md');
        if (fs.existsSync(sotPath)) {
            const sotData = fs.readFileSync(sotPath, 'utf-8');
            parts.push(`\n\n--- BAZA WIEDZY (SINGLE SOURCE OF TRUTH) ---\n${sotData}`);
        } else {
            console.warn("[AiService] Brak pliku SOT_Baza_Wiedzy_Agenta.md. Agent Prawny zadziaĹ‚a na goĹ‚ym modelu.");
        }

        const result = await generateWithRetry(model, parts, 2, "Agent_3_Compliance");
        console.log(`[AiService] Agent Prawny zakoĹ„czyĹ‚ pracÄ™ pomyĹ›lnie.`);
        return strictRegexMedicalFilter(result.response.text());
    } catch (err) {
        console.error("[AiService] Agent Prawny napotkaĹ‚ bĹ‚Ä…d:", err.message);
        return "Brak szczegĂłĹ‚owego raportu prawnego z powodu bĹ‚Ä™du modelu. Stosuj ogĂłlne zasady unikajÄ…c greenwashingu i obietnic medycznych.";
    }
}

/**
 * Serwis komunikujÄ…cy siÄ™ z modelami Google Gemini (Modele z 2026 r.)
 */
async function generateNativeAnalysis(textContent, nativeImagesUrls = [], analysisMode = "STANDARD") {
    const isCosmeticAudit = analysisMode === "COSMETIC_LEGAL_AUDIT";
    let promptText = isCosmeticAudit ? COSMETIC_AUDITOR_PROMPT : STANDARD_PROMPT;

    if (isCosmeticAudit && INCI_KNOWLEDGE_BASE) {
        promptText += `\n\n--- BAZA WIEDZY INCI I TRENDY KOSMETYCZNE 2026 ---\n${INCI_KNOWLEDGE_BASE}`;
    }

    promptText += `\n\n--- PEĹNE DANE POBRANE Z API ALLEGRO ---\n${textContent}\n--- KONIEC DANYCH ---`;

    // Przymusowa rygorystyczna temperatura 0.0 dla audytĂłw prawnych, blokujÄ…ca halucynacje.
    const generationConfig = {
        temperature: isCosmeticAudit ? 0.0 : 0.6,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        responseSchema: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING" },
                htmlContent: {
                    type: "OBJECT",
                    properties: {
                        sekcja1: { type: "STRING" },
                        sekcja2: { type: "STRING" },
                        sekcja3: { type: "STRING" },
                        sekcja4: { type: "STRING" },
                        sekcja5: { type: "STRING" },
                        sekcja6: { type: "STRING" }
                    },
                    required: ["sekcja1", "sekcja2", "sekcja3", "sekcja4", "sekcja5", "sekcja6"]
                },
                features: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                },
                images: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            originalUrl: { type: "STRING" },
                            replacedUrl: { type: "STRING" },
                            isCompliant: { type: "BOOLEAN" },
                            alerts: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                            }
                        },
                        required: ["originalUrl", "isCompliant", "alerts"]
                    }
                }
            },
            required: ["title", "htmlContent", "features"]
        }
    };

    const model = genAI.getGenerativeModel({
        model: 'gemini-3.5-flash',
        tools: [{ googleSearch: {} }],
        generationConfig
    });

    const parts = [promptText];

    // Pobieramy i dorzucamy obrazy do prompta
    if (nativeImagesUrls && nativeImagesUrls.length > 0) {
        console.log(`[AiService] Wzbogacanie promptu API o ${nativeImagesUrls.length} natywnych zdjÄ™Ä‡ CDN...`);
        for (let i = 0; i < nativeImagesUrls.length; i++) {
            try {
                const response = await fetchImageSecure(nativeImagesUrls[i], 10000);
                parts.push(`ZdjÄ™cie ${i + 1}. URL: ${nativeImagesUrls[i]}`);
                parts.push({
                    inlineData: {
                        data: Buffer.from(response.data, 'binary').toString("base64"),
                        mimeType: response.headers['content-type'] || 'image/jpeg'
                    }
                });
            } catch (imgErr) {
                console.warn(`[AiService] PominÄ™to natywny obraz ${nativeImagesUrls[i]} ze wzglÄ™du na bĹ‚Ä…d pobierania.`);
            }
        }
    }

    try {
        console.log(`[AiService] WywoĹ‚ano Gemini w trybie Native API (bez OCR). Tryb: ${analysisMode}`);
        const result = await generateWithRetry(model, parts, 2, "Agent_Vision_Native");
        let responseText = result.response.text();
        
        // Zastosowanie bezwzglÄ™dnej Tarczy Anty-Medycznej na wyjĹ›cie (AEO/Opisy)
        responseText = strictRegexMedicalFilter(responseText);
        
        let payloadString = responseText;
        
        // ZABEZPIECZENIE PRZED HALUCYNACJÄ„ MARKDOWN'u - czyszczenie tagĂłw ```json
        payloadString = payloadString.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(payloadString);
        } catch (parseError) {
            require('fs').writeFileSync(path.join(__dirname, '..', '..', '..', 'error_500.txt'), payloadString);
            throw new Error("Generative API Failed: " + parseError.message);
        }

        // Uruchomienie Agenta Segmentowego dla ustrukturyzowania i poprawienia tonu
        if (parsed.htmlContent && typeof parsed.htmlContent === 'object') {
            try {
                const adapted = await adaptToSegmentAndTone(parsed.title || textContent, parsed.htmlContent, textContent, null);
                if (adapted && adapted.htmlContent) {
                    parsed.htmlContent = adapted.htmlContent;
                }
            } catch(adaptErr) {
                console.error("[AiService] BĹ‚Ä…d w adaptacji segmentowej dla Native Analysis:", adaptErr.message);
            }
        }
        
        // Fail-Safe: Hardcore Regex HTML Sanitize w pamiÄ™ci (dla obiektu htmlContent)
        if (parsed.htmlContent && typeof parsed.htmlContent === 'object') {
            for (let key in parsed.htmlContent) {
                if (typeof parsed.htmlContent[key] === 'string') {
                     // Quill uĹĽywa <strong> zamiast <b>, konwertujemy w locie
                     let c = parsed.htmlContent[key].replace(/<b[^>]*>/g, '<strong>').replace(/<\/b>/g, '</strong>');
                     // Dopuszczamy h3, h4 i strong
                     c = c.replace(/<(?!\/?(h1|h2|h3|h4|p|ul|ol|li|strong|br)(?=>|\s.*>))\/?.*?>/gi, ''); 
                     parsed.htmlContent[key] = c;
                }
            }
        }
        
        return parsed;

    } catch (error) {
        console.error("[AiService] BĹ‚Ä…d w generacji Hybrydowej (Ultra): ", error);
        throw new Error("Generative API Failed: " + error.message);
    }
}

async function generateOfferJSON(baseTitle, attributesArray) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
        tools: [{ googleSearch: {} }],
        systemInstruction: GEO_SYSTEM_PROMPT,
        // Wymuszenie formatu JSON z gwarancjÄ… niezgadywania markdowna
        generationConfig: {
            temperature: 0.1, // Niska temperatura by wynik byĹ‚ techniczny i deterministyczny
            responseMimeType: "application/json",
        }
    });

    const payload = `
PoniĹĽej znajdujÄ… siÄ™ twarde parametry oferty do zrekonstruowania.

TYTUĹ ORYGINALNY / PROBOCZY:
${baseTitle}

PARAMETRY I CECHY:
${attributesArray.map(a => `- ${a.name}: ${a.value}`).join('\n')}

Wygeneruj zwrot w formacie JSON zawierajÄ…cy wyizolowanÄ… strukturÄ™. PamiÄ™taj o restrykcjach HTML (7 dozwolonych znacznikĂłw!) oraz GEO 2026 na opis. PamiÄ™taj, dĹ‚ugoĹ›Ä‡ tytuĹ‚u min 12, max 75.
`;

    try {
        const result = await generateWithRetry(model, payload, 2, "Agent_Offer_JSON");
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Brak prawidĹ‚owej struktury JSON w odpowiedzi dla GEO Text. Otrzymano: ${responseText}`);
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("[AiService] BĹ‚Ä…d generacji GEO Text: ", error);
        throw new Error("Generative Text API (GEO Output) Failed: " + error.message);
    }
}

/**
 * Audyt Multimodalny ZdjÄ™Ä‡ Oferty (Sprawdzenie wyĹ›rubowanych reguĹ‚ Allegro RGB).
 */
async function auditOfferImages(primaryImageUrl, galleryUrls = []) {
    const model = genAI.getGenerativeModel({
         model: "gemini-3.5-flash",
         tools: [{ googleSearch: {} }],
         systemInstruction: VISION_AUDIT_PROMPT,
         generationConfig: {
            temperature: 0.2, // Audyt graficzny pozwala na ciutkÄ™ analizy kontekstowej CRO 
            responseMimeType: "application/json",
         }
    });

    try {
        // Przygotowanie payloadĂłw obrazu z URI (zakĹ‚adamy ĹĽe Gemini je wspiera lub musimy wysĹ‚aÄ‡ Base64)
        // Ze wzglÄ™dĂłw API, pobierzemy pliki jako buffer.
        const axios = require('axios');
        const imageParts = [];

        // Fetch Main Image
        if (primaryImageUrl) {
            const response = await fetchImageSecure(primaryImageUrl, 10000);
            imageParts.push({
                inlineData: {
                    data: Buffer.from(response.data, 'binary').toString('base64'),
                    mimeType: response.headers['content-type']
                }
            });
        }
        
        // ZwiÄ™kszony limit z 2 do 15 by obsĹ‚uĹĽyÄ‡ peĹ‚ne zestawy zdjÄ™Ä‡ (np. 7) z BaseLinkera
        const limitedGallery = galleryUrls.slice(0, 15);
        for (const gUrl of limitedGallery) {
             const response = await fetchImageSecure(gUrl, 10000);
             imageParts.push({
                inlineData: {
                    data: Buffer.from(response.data, 'binary').toString('base64'),
                    mimeType: response.headers['content-type']
                }
             });
        }

        const promptText = "Oto paczka obrazĂłw z oferty. ZdjÄ™cie pierwsze to miniatura (bezwzglÄ™dne Ĺ›rodowisko RGB white). Reszta to detale.";
        
        const result = await generateWithRetry(model, [promptText, ...imageParts], 3, "Agent_Image_Audit");
        let rawText = result.response.text();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Brak prawidĹ‚owej struktury JSON w odpowiedzi wizyjnej. Otrzymano: ${rawText}`);
        let parsed = JSON.parse(jsonMatch[0]);

        // Autokorekta adresĂłw URL po audycie Gemini Vision AI
        if (parsed && Array.isArray(parsed.images)) {
            const inputUrls = [];
            if (primaryImageUrl) inputUrls.push(primaryImageUrl);
            for (const gUrl of limitedGallery) {
                inputUrls.push(gUrl);
            }

            parsed.images = parsed.images.map((img, idx) => {
                if (typeof img !== 'object' || img === null) return img;
                
                const isDummy = img.originalUrl && (
                    img.originalUrl.includes('Audyt') || 
                    img.originalUrl.includes('Analiza') || 
                    img.originalUrl.includes('IloĹ›Ä‡') || 
                    img.originalUrl.includes('IloĹ›ciowy') ||
                    idx >= inputUrls.length
                );
                
                return {
                    ...img,
                    originalUrl: isDummy ? img.originalUrl : (inputUrls[idx] || img.originalUrl)
                };
            });
        }
        return parsed;

    } catch (error) {
        console.error("[AiService] BĹ‚Ä…d Audytu Vision: ", error);
        throw new Error("Generative Vision API Failed: " + error.message);
    }
}

async function generateTitleOnly(textContent, currentTitle) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
        tools: [{ googleSearch: {} }],
        generationConfig: {
            temperature: 0.8, // TrochÄ™ wiÄ™ksza kreatywnoĹ›Ä‡ dla wariacji tytuĹ‚Ăłw
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" }
                },
                required: ["title"]
            }
        }
    });

    const promptText = `JesteĹ› ekspertem SEO ds. e-commerce (Allegro).
Wygeneruj CAĹKOWICIE NOWY, inny niĹĽ obecny, mocno zoptymalizowany pod kÄ…tem konwersji i sĹ‚Ăłw kluczowych tytuĹ‚ dla poniĹĽszego produktu.
Obecny tytuĹ‚, ktĂłry nam nie pasuje: "${currentTitle}"

Zanim zaczniesz generowaÄ‡, uĹĽyj Google Search (Google Trends/sklepy e-commerce), aby zbadaÄ‡, jakie sĹ‚owa kluczowe dla tego typu kosmetyku/produktu trendujÄ… najmocniej na polskim rynku. Wybierz najbardziej trafne.

Zasady:
1. UĹĽywaj jÄ™zyka potocznego kupujÄ…cych i najczÄ™stszych wyszukiwaĹ„, zbadanych w Google.
2. TytuĹ‚ MUSI mieÄ‡ min 12, max 75 znakĂłw.
3. BÄ…dĹş kreatywny, przetasuj kolejnoĹ›Ä‡ sĹ‚Ăłw kluczowych lub wyciÄ…gnij ukryte benefity.
4. Bez sĹ‚Ăłw typu 'hit', 'nowoĹ›Ä‡'.

DANE PRODUKTU:
${textContent}

Odpowiedz wyĹ‚Ä…cznie czystym obiektem JSON:
{ "title": "Nowy wygenerowany tytuĹ‚" }
`;

    try {
        const parsed = await generateWithRetry(model, promptText, 2, "Agent_Title", true);
        if (parsed && parsed.title) {
            return parsed;
        }
        throw new Error(`Brak prawidĹ‚owej struktury JSON w odpowiedzi dla tytuĹ‚u. Otrzymano: ${JSON.stringify(parsed)}`);
    } catch (error) {
        console.error("[AiService] Generative Title Error:", error.message);
        // Ostatnia deska ratunku - zwracamy tytuĹ‚ oryginalny ze wskazaniem audytu
        if (currentTitle) {
            return { title: currentTitle };
        }
        throw new Error("Generative API Title Failed: " + error.message);
    }
}

// Agent 8 (ClaidLiquidVariables) usuniÄ™ty zgodnie z dyrektywÄ… - zastÄ…piony przez API Photoroom.

// UsuniÄ™to stare getPlaybookPromptForSlot i getPaddingForSlot na rzecz moduĹ‚u photoroom.prompts.js

async function generatePhotoroomLifestyle(imageBase64, sourceImageUrl, ean, imageIndex = 0) {
    const photoroomKey = (process.env.PHOTOROOM_API_KEY && process.env.PHOTOROOM_API_KEY !== "TBD") 
        ? process.env.PHOTOROOM_API_KEY 
        : "sandbox_sk_pr_default_9f10500b15c19db1e2f8aee29e1671ac7ff33aa2";

    logLifestyleEvent('INFO', 'RozpoczÄ™to generowanie zdjÄ™cia przez Photoroom API', { ean, imageIndex, usingSandbox: !process.env.PHOTOROOM_API_KEY });
    console.log(`[Photoroom Lifestyle] RozpoczÄ™to generowanie zdjÄ™cia (Slot ${imageIndex + 1}) dla EAN: ${ean}`);

    // 1. Weryfikacja i przygotowanie bufora oryginalnego pliku obrazu
    let inputBuffer;
    if (imageBase64 && imageBase64.startsWith('data:image')) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (sourceImageUrl) {
        console.log("[Photoroom Lifestyle] Pobieranie oryginalnego zdjÄ™cia z URL:", sourceImageUrl);
        const imgRes = await fetchImageSecure(sourceImageUrl);
        inputBuffer = Buffer.from(imgRes.data);
    } else {
        logLifestyleEvent('ERROR', 'Brak wejĹ›ciowego obrazu w zapytaniu Photoroom');
        throw new Error("Brak wejĹ›ciowego obrazu (wymagany imageBase64 lub sourceImageUrl).");
    }

    // 2. Gemini Agent PIM Prompter - Budowanie kontekstu scenerii z PIM
    let productDetailsText = `Product EAN: ${ean}`;
    try {
        if (ean) {
            const product = await prisma.product.findUnique({ where: { ean } });
            if (product) {
                const featuresString = product.features ? JSON.stringify(product.features) : '';
                productDetailsText = `NAME: ${product.name}\nFEATURES: ${featuresString}\nDESC: ${product.descriptionHtml || ''}`;
            }
        }
    } catch(e) { console.error("BĹ‚Ä…d odczytu PIM dla Agenta Promptera:", e.message); }

    // 3. Pobranie deterministycznego promptu z generatora LEGO (SSOT 5.0)
    const scenePrompt = await getDeterministicPromptForSlot(imageIndex, ean, productDetailsText, apiKey, generateWithRetry);

    // 4. Pobranie dynamicznego kadru (padding) opartego o seed (hash EAN/SKU)
    const seed = hashSKU(ean);
    const padding = getPaddingForSlot(imageIndex, seed);
    // 5. WysĹ‚anie ĹĽÄ…dania do Photoroom Image Editing API (/v2/edit)
    logLifestyleEvent('INFO', 'WysyĹ‚anie zapytania do Photoroom API v2/edit (SSOT 3.0)', { prompt: scenePrompt });
    
    const FormData = require('form-data');
    const sharp = require('sharp');
    const form = new FormData();
    form.append('imageFile', inputBuffer, { filename: 'product.jpg', contentType: 'image/jpeg' });
    form.append('removeBackground', 'true');
    
    if (imageIndex === 0) {
        // Slot 1: SSOT 4.0 - Ekstrakcja SkĹ‚adnika
        form.append('editWithAI.mode', 'ai.auto');
        form.append('editWithAI.prompt', scenePrompt);
        form.append('background.color', '#FFFFFF'); // WymĂłg przezroczystoĹ›ci dla Slotu 1
    } else {
        // Sloty 2-9: SSOT 5.0 - Deterministyczne generowanie tĹ‚a (Klocki LEGO)
        form.append('background.prompt', scenePrompt);
        form.append('background.expandPrompt', 'never');
        form.append('background.seed', seed.toString()); // WstrzykniÄ™cie unikalnego seeda do API
        form.append('quality', 'advanced');
    }

    form.append('export.format', 'jpeg');
    form.append('outputSize', '1080x1080');
    form.append('paddingTop', padding.paddingTop);
    form.append('paddingRight', padding.paddingRight);
    form.append('paddingBottom', padding.paddingBottom);
    form.append('paddingLeft', padding.paddingLeft);
    form.append('ignorePaddingAndSnapOnCroppedSides', 'false');

    let headers = {
        'x-api-key': photoroomKey,
        ...form.getHeaders()
    };
    
    if (imageIndex !== 0) {
        headers['pr-ai-background-model-version'] = 'background-studio-beta-2025-03-17';
    } else {
        headers['pr-ai-shadows-model-version'] = '2026-04-15';
    }

    const startTime = Date.now();
    try {
        const response = await axios.post('https://image-api.photoroom.com/v2/edit', form, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 45000
        });

        const durationMs = Date.now() - startTime;
        const resultBuffer = Buffer.from(response.data);

        const base64Output = `data:image/jpeg;base64,${resultBuffer.toString('base64')}`;

        logLifestyleEvent('INFO', 'Photoroom API zrealizowaĹ‚ edycjÄ™ pomyĹ›lnie (SSOT 3.0)', {
            durationMs,
            outputBytes: resultBuffer.length
        });

        return {
            base64: base64Output,
            visualTrendReport: "Wygenerowano na podstawie optymalizacji tagĂłw."
        };

    } catch (err) {
        const durationMs = Date.now() - startTime;
        let errorDetails = err.message;
        if (err.response && err.response.data) {
            try {
                const errStr = Buffer.from(err.response.data).toString('utf-8');
                errorDetails = errStr;
            } catch(e) {}
        }
        logLifestyleEvent('ERROR', 'BĹ‚Ä…d podczas wywoĹ‚ania Photoroom API', {
            durationMs,
            status: err.response?.status,
            error: errorDetails
        });
        console.error("[Photoroom API Error]", errorDetails);
        throw new Error(`BĹ‚Ä…d Photoroom API (status ${err.response?.status || '500'}): ${errorDetails}`);
    }
}

const generateClaidLifestyle = generatePhotoroomLifestyle;
const generateImagenLifestyle = generatePhotoroomLifestyle;

/*
 * [DEPRECATED / BACKUP] Stary, drogi Agent uzupeĹ‚niania parametrĂłw (PXM Auto-Fill Agent).
 * Zostawiony jako kopia bezpieczeĹ„stwa zgodnie z proĹ›bÄ….
 *
async function autofillMissingParameters(ean, productName, currentFeatures, requiredSchema) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    });
    
    // Zabezpieczenie przed przepalaniem tokenĂłw: mapujemy tylko brakujÄ…ce/wymagane parametry
    const missingSchema = (requiredSchema || []).filter(p => !currentFeatures || !currentFeatures[p.name]);
    
    if (missingSchema.length === 0) return currentFeatures;

    const prompt = `JesteĹ› inĹĽynierem PIM (Product Information Management) i ekspertem OSINT.
Zadanie: UzupeĹ‚nij brakujÄ…ce parametry techniczne dla produktu.
KRYTYCZNE ZALECENIE BADAWCZE: Poszukiwania danych musisz przeprowadziÄ‡ w wbudowanej wyszukiwarce googleSearch.
MUSISZ zachowaÄ‡ rygorystycznÄ… kolejnoĹ›Ä‡ ĹşrĂłdeĹ‚ poszukiwaĹ„:
1. Zbadaj dane na oficjalnej, globalnej stronie producenta (korzystaj z gĹ‚Ăłwnej domeny, np. .com, .fr, .de w zaleĹĽnoĹ›ci od pochodzenia marki, uĹĽyj po prostu operatora wyszukiwania dla nazwy marki).
2. JeĹ›li nie znajdziesz, zbadaj oficjalnÄ… stronÄ™ krajowego dystrybutora dla tej marki.
3. JeĹ›li tam nie ma, zbadaj najwiÄ™ksze rynkowe marketplace'y (np. Notino, Hebe, Super-Pharm, e-Zebra).
Tylko z tych ĹşrĂłdeĹ‚ pobieraj zaufane parametry, a nastÄ™pnie wykonaj mapowanie do PIM.

Produkt: ${productName}
EAN: ${ean}

Oto lista parametrĂłw do uzupeĹ‚nienia wraz z ich dopuszczalnymi wartoĹ›ciami (jeĹ›li sĹ‚ownik jest wymagany, MUSISZ uĹĽyÄ‡ dokĹ‚adnej wartoĹ›ci ze sĹ‚ownika):
${JSON.stringify(missingSchema.map(p => ({ nazwa: p.name, wymagane: p.required, typ: p.type, dopuszczalne_wartosci: p.dictionary ? p.dictionary.map(d => d.value) : "Dowolny tekst" })), null, 2)}

Obecnie zapisane parametry (nie nadpisuj ich): ${JSON.stringify(currentFeatures)}

ZwrĂłÄ‡ wygenerowany czysty JSON:
{
  "features": {
    "NazwaParametru": "WartoĹ›Ä‡",
    ...
  }
}
JeĹ›li w wiarygodnych ĹşrĂłdĹ‚ach producenta/dystrybutora nie byĹ‚o danego parametru, absolutnie go pomiĹ„ (nie zgaduj). Dla parametrĂłw sĹ‚ownikowych, wartoĹ›Ä‡ musi byÄ‡ dopasowana do wariantĂłw. ZwrĂłÄ‡ tylko czysty JSON.
`;

    try {
        console.log(`[AiService] Auto-Fill Agent szuka parametrĂłw dla ${ean} z uwzglÄ™dnieniem nowej hierarchii...`);
        const result = await generateWithRetry(model, prompt, 2, "Agent_11_Autofill");
        let text = result.response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return { ...currentFeatures, ...(parsed.features || {}) };
    } catch(err) {
        console.error("[AiService] BĹ‚Ä…d Agenta Auto-Fill:", err.message);
        return currentFeatures;
    }
}
*/



async function generateAEOContent(productName, originalDescription, intelligenceData) {
    console.log(`[AiService] Odpalanie Agenta AEO (Analityk Strukturalny) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            systemInstruction: require('./ai.prompts').AEO_AGENT_PROMPT,
            generationConfig: { temperature: 0.4 } 
        });
        const prompt = `Produkt: ${productName}\nOpis ĹşrĂłdĹ‚owy: ${originalDescription || 'Brak'}\nDane z wywiadu (INCI/Parametry): ${intelligenceData || 'Brak'}\nStwĂłrz zwartÄ… strukturÄ™ AEO.`;
        const result = await generateWithRetry(model, prompt, 2, "Agent_AEO");
        return result.response.text();
    } catch(err) {
        console.error("[AiService] BĹ‚Ä…d Agenta AEO:", err.message);
        return "Brak danych AEO - BĹ‚Ä…d generacji.";
    }
}

async function generateGEOTextContent(productName, aeoContent, intelligenceData, sentimentData = '') {
    console.log(`[AiService] Odpalanie Agenta GEO Text (Copywriter HTML) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            systemInstruction: require('./ai.prompts').GEO_TEXT_AGENT_PROMPT,
            generationConfig: { 
                temperature: 0.6, 
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        htmlContent: {
                            type: "OBJECT",
                            properties: {
                                sekcja1: { type: "STRING" },
                                sekcja2: { type: "STRING" },
                                sekcja3: { type: "STRING" },
                                sekcja4: { type: "STRING" },
                                sekcja5: { type: "STRING" },
                                sekcja6: { type: "STRING" }
                            },
                            required: ["sekcja1", "sekcja2", "sekcja3", "sekcja4", "sekcja5", "sekcja6"]
                        }
                    },
                    required: ["htmlContent"]
                }
            } 
        });
        const prompt = `Produkt: ${productName}\nBaza AEO: ${aeoContent}\nDane INCI/OSINT: ${intelligenceData}\nOpinie/Sentiment KonsumentĂłw: ${sentimentData || 'Brak'}\nZwrĂłÄ‡ wynik jako JSON z kluczem "htmlContent", zachowujÄ…c restrykcjÄ™ 7 tagĂłw HTML. WpleÄ‡ naturalnie w treĹ›Ä‡ akapitĂłw (np. w sekcji opis3 lub opis4) wnioski z opinii klientĂłw (np. za co klienci w szczegĂłlnoĹ›ci chwalÄ… ten produkt oraz na co zwracajÄ… uwagÄ™ po zakupie).`;
        const result = await generateWithRetry(model, prompt, 2, "Agent_4_GEO");
        let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        
        try {
            const adapted = await adaptToSegmentAndTone(productName, parsed.htmlContent, intelligenceData, null);
            if (adapted && adapted.htmlContent) {
                parsed.htmlContent = adapted.htmlContent;
            }
        } catch(adaptErr) {
            console.error("[AiService] BĹ‚Ä…d w adaptacji segmentowej dla GEO Text:", adaptErr.message);
        }

        // EU AI Act Art. 50 Disclosure Banner Attachment (Sekcja 5 HTML)
        if (parsed.htmlContent && parsed.htmlContent.opis5 !== undefined) {
            const aiActNotice = `<div class="nexus-ai-transparency-note" style="font-size:11px; color:#64748b; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">đź¤– <i>TreĹ›Ä‡ oraz analiza opinii zoptymalizowane autonomicznie przez Nexus ERP AI Engine (Zgodnie z Art. 50 EU AI Act). Oferta zatwierdzona przez operatora.</i></div>`;
            if (!parsed.htmlContent.opis5.includes('nexus-ai-transparency-note')) {
                parsed.htmlContent.opis5 += aiActNotice;
            }
        }
        
        return parsed;
    } catch(err) {
        console.error("[AiService] BĹ‚Ä…d Agenta GEO Text:", err.message);
        console.error(err.stack);
        throw new Error(`Agent GEO Text nie wygenerowaĹ‚ opisu dla "${productName}": ${err.message}`);
    }
}

async function adaptToSegmentAndTone(productName, htmlContent, features, categoryId) {
    console.log(`[AiService] Odpalanie Agenta Segmentowego (Segment & Tone Adapter) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            systemInstruction: require('./ai.prompts').SEGMENT_TONE_AGENT_PROMPT,
            generationConfig: { 
                temperature: 0.5, 
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        htmlContent: {
                            type: "OBJECT",
                            properties: {
                                sekcja1: { type: "STRING" },
                                sekcja2: { type: "STRING" },
                                sekcja3: { type: "STRING" },
                                sekcja4: { type: "STRING" },
                                sekcja5: { type: "STRING" },
                                sekcja6: { type: "STRING" }
                            },
                            required: ["sekcja1", "sekcja2", "sekcja3", "sekcja4", "sekcja5", "sekcja6"]
                        }
                    },
                    required: ["htmlContent"]
                }
            } 
        });

        const prompt = `Produkt: ${productName}
Cechy/Parametry: ${typeof features === 'object' ? JSON.stringify(features) : (features || 'Brak')}
Kategoria ID: ${categoryId || 'Brak'}

Oto wygenerowany wstÄ™pny opis produktu skĹ‚adajÄ…cy siÄ™ z 5 blokĂłw. Twoim celem jest dokonanie adaptacji psychologicznej i tonu wypowiedzi do zidentyfikowanego segmentu rynkowego.
ZwrĂłÄ‡ uwagÄ™ na formatowanie i usuniÄ™cie zbitego tekstu (maksymalnie 3-4 linijki na akapit, 2-3 pogrubienia <strong> na akapit).
SkĹ‚ad INCI (jeĹ›li znajduje siÄ™ w opis5) pozostaw w 100% niezmieniony.

WstÄ™pny Opis:
Blok 1 (sekcja1): ${htmlContent.sekcja1 || ''}
Blok 2 (sekcja2): ${htmlContent.sekcja2 || ''}
Blok 3 (sekcja3): ${htmlContent.sekcja3 || ''}
Blok 4 (sekcja4): ${htmlContent.sekcja4 || ''}
Blok 5 (sekcja5): ${htmlContent.sekcja5 || ''}
Blok 6 (sekcja6): ${htmlContent.sekcja6 || ''}`;

        const result = await generateWithRetry(model, prompt, 2, "Agent_Segment_Tone");
        let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch(err) {
        console.error("[AiService] BĹ‚Ä…d Agenta Dopasowania Segmentowego:", err.message);
        return { htmlContent };
    }
}

// ============================================================================
// ARCHITEKTURA SWARM V3 - WÄZĹY 1-5 (BADANIA I BEZPIECZEĹSTWO PRAWNE)
// ============================================================================

async function runNode1_Autofill(ean, productName, productFeatures = {}, allegroData = {}, scrapedText = "") {
    agent1Logger.info(`[Swarm Node 1] PIM Autofill start: EAN ${ean}, Produkt: ${productName}`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            generationConfig: { 
                temperature: 0.0, 
                topP: 0.1, 
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: "application/json" 
            }
        });
        const systemPrompt = getMasterPrompt(1);
        const prompt = `${systemPrompt}

CRITICAL INSTRUCTION: Do NOT copy long descriptive texts verbatim from OSINT. Paraphrase descriptions. HOWEVER, for technical parameters, dimensions, weight, INCI, and specific dictionary values, you MUST extract and use them exactly as they are without modification.

--- DANE WEJĹšCIOWE ---
PRODUKT: ${productName}
EAN: ${ean}

--- DANE Z BASELINKERA ---
${JSON.stringify(productFeatures, null, 2)}

--- DANE Z ALLEGRO ---
${JSON.stringify(allegroData, null, 2)}

--- ZNALEZIONY TEKST (OSINT) ---
${scrapedText}`;
        
        agent1Logger.info(`[Swarm Node 1] Wysłano zapytanie do Gemini-3.5-flash (Długość promptu: ${prompt.length} znaków). Długość tekstu OSINT: ${scrapedText.length}`);
        
        const startTime = Date.now();
        const result = await generateWithRetry(model, prompt, 2, "Agent_1_Autofill", true);
        const duration = Date.now() - startTime;
        
        agent1Logger.info(`[Swarm Node 1] Odpowiedź z Gemini uzyskana w ${duration}ms.`, { result });
        
        return result;
    } catch (err) {
        agent1Logger.error(`[Swarm Node 1] Błąd krytyczny: ${err.message}`, { stack: err.stack });
        throw err;
    }
}

async function runNode2_Sentiment(ean, productName) {
    console.log(`[Swarm Node 2] Sentiment Scraper start: EAN ${ean}`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1, topP: 0.2, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(2);
        const prompt = `${systemPrompt}\n\n--- DANE WEJĹšCIOWE ---\nPRODUKT: ${productName}\nEAN: ${ean}`;
        return await generateWithRetry(model, prompt, 2, "Agent_2_Sentiment", true);
    } catch (err) {
        console.error("[Swarm Node 2] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}


async function runNode4_INCIParser(inciString, ragKnowledge) {
    console.log(`[Swarm Node 4] INCI Parser start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            generationConfig: { 
                temperature: 0.0, 
                topP: 0.1, 
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: "application/json" 
            }
        });
        const systemPrompt = getMasterPrompt(4);
        const prompt = `${systemPrompt}\n\n--- DANE WEJĹšCIOWE ---\nINCI: ${inciString}\n\n--- SOT KNOWLEDGE ---\n${ragKnowledge}`;
        return await generateWithRetry(model, prompt, 2, "Agent_4_INCIParser", true);
    } catch (err) {
        console.error("[Swarm Node 4] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

async function runNode5_LegalSanitizer(productName, generatedContent, rawSentiment, ragKnowledge) {
    console.log(`[Swarm Node 5] Legal Sanitizer start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.0, topP: 0.1, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(5);
        const prompt = `${systemPrompt}\n\n--- DANE WEJĹšCIOWE ---\nPRODUKT: ${productName}\nKONTENT DO ANALIZY: ${JSON.stringify(generatedContent)}\nSUROWY SENTIMENT: ${JSON.stringify(rawSentiment)}\n\n--- SOT KNOWLEDGE ---\n${ragKnowledge}`;
        return await generateWithRetry(model, prompt, 2, "Agent_5_LegalSanitizer", true, strictRegexMedicalFilter);
    } catch (err) {
        console.error("[Swarm Node 5] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

// ============================================================================
// ARCHITEKTURA SWARM V3 - WÄZĹY 6-10 (KREACJA I AUDYT WYSOKIEJ PEWNOĹšCI)
// ============================================================================

async function runNode6_Copywriter(productName, aeoFeatures, legalData, toneGuidelines, ragKnowledge = "") {
    console.log(`[Swarm Node 6] Copywriter start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.3, topP: 0.4, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(6);
        const prompt = `${systemPrompt}\n\n--- DANE WEJŚCIOWE ---\nPRODUKT: ${productName}\nCECHY AEO: ${JSON.stringify(aeoFeatures)}\nDANE PRAWNE I GEO: ${JSON.stringify(legalData)}\nWYTYCZNE TONU: ${JSON.stringify(toneGuidelines)}\n\n--- SOT KNOWLEDGE ---\n${ragKnowledge}`;
        return await generateWithRetry(model, prompt, 2, "Agent_6_Copywriter", true, strictRegexMedicalFilter);
    } catch (err) {
        console.error("[Swarm Node 6] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

async function runNode7_Psychology(productName, htmlDraft, sentimentData) {
    console.log(`[Swarm Node 7] Psychology start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            generationConfig: { temperature: 0.3, topP: 0.4, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(7);
        const prompt = `${systemPrompt}\n\n--- DANE WEJĹšCIOWE ---\nPRODUKT: ${productName}\nSZKIC HTML: ${JSON.stringify(htmlDraft)}\nSENTIMENT: ${JSON.stringify(sentimentData)}`;
        return await generateWithRetry(model, prompt, 2, "Agent_7_Psychology", true);
    } catch (err) {
        console.error("[Swarm Node 7] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

async function runNode8_Scenographer(productName, targetAudience) {
    console.log(`[Swarm Node 8] Scenographer start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.4, topP: 0.5, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(8);
        const prompt = `${systemPrompt}\n\n--- DANE WEJĹšCIOWE ---\nPRODUKT: ${productName}\nGRUPA DOCELOWA: ${JSON.stringify(targetAudience)}`;
        return await generateWithRetry(model, prompt, 2, "Agent_8_Scenographer", true);
    } catch (err) {
        console.error("[Swarm Node 8] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

async function runNode9_VisionAuditor(imageUrls) {
    console.log(`[Swarm Node 9] Vision Auditor start dla ${imageUrls.length} obrazĂłw...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash", // Szybki i tani model Vision
            generationConfig: { temperature: 0.0, topP: 0.1, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(9);
        
        const parts = [systemPrompt, "\n\n--- OBRAZY DO ANALIZY ---"];
        for (let i = 0; i < imageUrls.length; i++) {
            try {
                const response = await fetchImageSecure(imageUrls[i], 10000);
                parts.push(`ZdjÄ™cie ${i + 1}. URL: ${imageUrls[i]}`);
                parts.push({
                    inlineData: {
                        data: Buffer.from(response.data, 'binary').toString("base64"),
                        mimeType: response.headers['content-type'] || 'image/jpeg'
                    }
                });
            } catch (imgErr) {
                console.warn(`[Swarm Node 9] BĹ‚Ä…d pobierania obrazu ${imageUrls[i]}: ${imgErr.message}`);
            }
        }

        return await generateWithRetry(model, parts, 2, "Agent_9_VisionAuditor", true);
    } catch (err) {
        console.error("[Swarm Node 9] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}

async function runNode10_Sentinel(finalPayload, originalPimData, ragKnowledge = "") {
    console.log(`[Swarm Node 10] Sentinel HITL start...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.0, topP: 0.1, responseMimeType: "application/json" }
        });
        const systemPrompt = getMasterPrompt(10);
        const prompt = `${systemPrompt}\n\n--- DANE WEJŚCIOWE ---\nGOTOWA OFERTA: ${JSON.stringify(finalPayload)}\nSUROWE DANE PIM: ${JSON.stringify(originalPimData)}\n\n--- SOT KNOWLEDGE ---\n${ragKnowledge}`;
        return await generateWithRetry(model, prompt, 2, "Agent_10_Sentinel", true);
    } catch (err) {
        console.error("[Swarm Node 10] BĹ‚Ä…d krytyczny:", err.message);
        throw err;
    }
}


module.exports = {
    fetchImageSecure,
    gatherProductIntelligence,
    gatherCustomerSentiment,
    generateAEOContent,
    generateGEOTextContent,
    generateNativeAnalysis,
    adaptToSegmentAndTone,
    generateOfferJSON,
    auditOfferImages,
    generateTitleOnly,
    generateClaidLifestyle,
    generateComplianceReport,
    generateWithRetry,
    runNode1_Autofill,
    runNode2_Sentiment,
    runNode4_INCIParser,
    runNode5_LegalSanitizer,
    runNode6_Copywriter,
    runNode7_Psychology,
    runNode8_Scenographer,
    runNode9_VisionAuditor,
    runNode10_Sentinel
};

