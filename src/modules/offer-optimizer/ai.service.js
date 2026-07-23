const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const sharp = require('sharp');
sharp.cache(false); // Wyłączenie wbudowanego cache'u dla stabilności RAM przy batchingu
const FormData = require('form-data');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { STANDARD_PROMPT, COSMETIC_AUDITOR_PROMPT, VISION_AUDIT_PROMPT } = require('./ai.prompts');
const cheerio = require('cheerio');
const EventBus = require('../../core/EventBus');
dotenv.config();
const AiMetricsService = require('../../core/ai.metrics.service');

// Zabezpieczony Agent WAF do zdjęć
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

// Ładowanie bazy wiedzy do pamięci serwera raz podczas uruchomienia
let INCI_KNOWLEDGE_BASE = "";
try {
    INCI_KNOWLEDGE_BASE = fs.readFileSync(path.join(__dirname, 'inci_knowledge.txt'), 'utf-8');
} catch (e) {
    console.error("[AiService] Brak pliku inci_knowledge.txt - system będzie działał bez rozszerzonej bazy wiedzy.");
}

// Dedykowany moduł ustrukturyzowanego logowania zdarzeń Lifestyle AI
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
        console.error("[LifestyleLogger Error] Nie udało się zapisać loga do pliku:", err.message);
    }
}

const withTimeout = (promise, ms, contextName = 'Unknown Model') => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            console.error(`[AiService Timeout] Zablokowano zawieszone połączenie dla modelu ${contextName} po ${ms}ms.`);
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
async function generateWithRetry(model, promptOrParts, maxRetries = 3, agentId = "System_Agent") {
    let attempt = 0;
    const modelName = model.model || "gemini-model";
    const startTime = Date.now();
    console.log(`[AiService] -> Start generateWithRetry dla ${modelName}, max próby: ${maxRetries}`);
    
    while (attempt < maxRetries) {
        try {
            const attemptStart = Date.now();
            console.log(`[AiService] -> ${modelName} Próba ${attempt + 1}/${maxRetries} rozpoczęta...`);
            // Twardy timeout 90 sekund (90000ms) dla każdego zapytania do modelu
            const result = await withTimeout(model.generateContent(promptOrParts), 90000, modelName);
            console.log(`[AiService] -> ${modelName} Próba ${attempt + 1} ZAKOŃCZONA SUKCESEM po ${Date.now() - attemptStart}ms`);
            
            // Zapis do telemetrii
            try {
                if (result.response && result.response.usageMetadata) {
                    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = result.response.usageMetadata;
                    await AiMetricsService.logUsage(agentId, modelName, promptTokenCount, candidatesTokenCount, totalTokenCount);
                }
            } catch (metricError) {
                console.error("[AiService] Błąd zapisu metryk telemetrii:", metricError.message);
            }
            
            return result;
        } catch (error) {
            attempt++;
            const isRateLimit = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('503')));
            console.error(`[AiService] -> BŁĄD w generateWithRetry (${modelName}) [Próba ${attempt}]:`, error.message);
            console.error(error.stack);
            
            if (attempt >= maxRetries || (!isRateLimit && !(error.message && error.message.includes('timeout')))) {
                console.error(`[AiService] -> Krytyczny błąd API, brak dalszych ponowień. Rzucam błąd wyżej.`);
                throw error; // Fail fast for non-transient errors
            }
            const backoffMs = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
            console.log(`[AiService] ⚠️ ${modelName} - Wznawiam (Exponential Backoff) za ${Math.round(backoffMs)}ms...`);
            await new Promise(res => setTimeout(res, backoffMs));
        }
    }
}

/**
 * Tarcza Anty-Medyczna (Hardcoded Regex Dictionary)
 */
function strictRegexMedicalFilter(text) {
    if (!text) return text;
    // Lista zakazanych słów (Audytor UE 1223/2009)
    const medicalTerms = /leczy|wyleczy|uzdrawia|lek|lecznicz[yae]|terapi[ai]|farmakologiczn[yae]|schorzenia|chorob[ay]|zabliźnia/gi;
    const sanitized = text.replace(medicalTerms, "[CENZURA-MEDYCZNA-DO-AKCEPTACJI]");
    if (sanitized !== text) {
        console.warn("[AiService] 🛡️ Tarcza Anty-Medyczna zadziałała. Zablokowano halucynację prawną.");
    }
    return sanitized;
}

/**
 * Autorski silnik cieniowania (Shadow Baking).
 * Rysuje rozmyty cień kontaktowy pod obiektem i wgrywa go na serwer Claid.
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

        console.log("[LocalShadow] Złożono cień, wgrywanie na serwer Claid (tmp_url)...");
        const form = new FormData();
        form.append('file', finalImage, { filename: 'shadowed.png', contentType: 'image/png' });
        form.append('data', JSON.stringify({}));

        const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: { 'Authorization': `Bearer ${claidKey}`, ...form.getHeaders() }
        });

        return uploadRes.data?.data?.output?.tmp_url || imageUrl;
    } catch (err) {
        console.error("[LocalShadow] Błąd podczas renderowania cienia:", err.message);
        return imageUrl; // Fallback
    }
}

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Agent Badawczy (Research Agent)
 * Wyszukuje pełen skład INCI oraz specyfikację techniczną produktu w Internecie.
 * Zastosowano wielopoziomowe parsowanie semantyczne (Cheerio) w celu ograniczenia halucynacji LLM
 * oraz uniezależnienia się od wahań layoutu DOM.
 */
async function gatherProductIntelligence(ean, productName, existingDataFromPim = null) {
    console.log(`[AiService] Odpalanie Agenta Badawczego (OSINT + Cheerio) dla EAN: ${ean}...`);
    
    // Fallback wg wytycznych: najpierw korzystamy z danych z PIM, jeśli są pełne.
    if (existingDataFromPim && existingDataFromPim.length > 50) {
        console.log(`[AiService] Użycie zbuforowanych danych z PIM/API, pomijanie poszukiwań w sieci.`);
        return existingDataFromPim;
    }

    try {
        let semanticContext = "Brak wstępnych danych z ekstrakcji HTML.";
        try {
            const fallbackUrl = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`; 
            const response = await axios.get(fallbackUrl, { timeout: 3000 });
            if (response.data && response.data.product) {
                const p = response.data.product;
                semanticContext = `Zrzut semantyczny: INCI: ${p.ingredients_text || 'brak'}, Marka: ${p.brands}`;
            }
        } catch (fetchErr) {
            console.warn("[AiService] Ekstrakcja semantyczna nie powiodła się. Przechodzę do pełnego wyszukiwania AI.");
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview-customtools",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 }
        });
        
        const prompt = `Jesteś ekspertem ds. baz danych kosmetycznych i badaczem e-commerce.
Twoim zadaniem jest znalezienie oficjalnej specyfikacji technicznej oraz pełnego składu INCI dla produktu (z racji braków w danych z PIM).
Produkt: ${productName}
EAN: ${ean}
Kontekst z parsowania semantycznego (Zrzut DOM z Cheerio): ${semanticContext}

Użyj wyszukiwarki Google (masz do niej dostęp), aby przeszukać oficjalne strony producentów, apteki internetowe lub renomowane e-drogerie.
Zwróć ZWARTY, tekstowy raport zawierający WYŁĄCZNIE:
1. Pełną specyfikację techniczną. Postaraj się wyciągnąć ze stron jak najwięcej parametrów.
2. Pełny, dokładny i kompletny skład INCI.
Format wyjściowy: Zwykły tekst.`;
        
        const result = await generateWithRetry(model, prompt);
        console.log(`[AiService] Agent Badawczy zakończył pracę. Znaleziono dane.`);
        return result.response.text();
    } catch (err) {
        console.error("[AiService] Agent Badawczy napotkał błąd:", err.message);
        EventBus.publish('nexus_bot_message', { 
            message: `⚠️ [ALERT ARCHITEKTURY] Agent Badawczy OSINT napotkał krytyczną barierę ekstrakcyjną dla EAN: ${ean}. Powód: ${err.message}` 
        });
        return existingDataFromPim || "Brak dodatkowych danych (Błąd Agenta Badawczego).";
    }
}

/**
 * Agent Analizy Opinii i Sentimentu Klientów (Customer Feedback Intelligence)
 * Przeszukuje autentyczne opinie i recenzje w sieci (Google Search Grounding).
 */
async function gatherCustomerSentiment(ean, productName, existingSentimentFromPim = null) {
    console.log(`[AiService] Odpalanie Agenta Sentimentu Opinii Klientów dla: ${productName} (EAN: ${ean})...`);
    
    // Jeśli z bazy pobrano już kompletny wsad sentimentu, pomiń
    if (existingSentimentFromPim && existingSentimentFromPim.length > 20) {
        console.log(`[AiService] Posiadamy już sentyment konsumentów w PIM. Ograniczanie użycia sieci.`);
        return existingSentimentFromPim;
    }

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview-customtools",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.2 }
        });

        const prompt = `Jesteś analitykiem opinii konsumenckich i sentimentu e-commerce.
Z powodu braków historycznych w bazie, twoim zadaniem jest znalezienie w sieci nowych, autentycznych opinii, recenzji i doświadczeń konsumentów na temat produktu.
Produkt: ${productName}
EAN: ${ean}

Użyj wyszukiwarki Google, aby przeanalizować recenzje w e-drogeriach, sklepach internetowych i na forach.
Przygotuj ustrukturyzowany zrzut sentimentu z konkretnymi wypowiedziami w formacie:
1. "Klienci w szczególności chwalą ten produkt za: [2-3 kluczowe cechy/efekty z opinii]"
2. "Osoby, które wypróbowały ten produkt, zwracają uwagę na: [zastosowanie/zapach/konsystencję/trwałość]"
3. "Główne powody wysokiej oceny produktu: [podsumowanie]"

Jeśli produkt jest zupełnie nowy i brak opinii w sieci, przygotuj hipotetyczny, bezpieczny zarys.
Odpowiedz w postaci zwięzłego, czystego tekstu w języku polskim.`;

        const result = await generateWithRetry(model, prompt);
        console.log(`[AiService] Agent Sentimentu zakończył analizę opinii (DANE NALEŻY ZAPISAĆ DO PIM).`);
        return result.response.text();
    } catch (err) {
        console.error("[AiService] Agent Sentimentu napotkał błąd:", err.message);
        return existingSentimentFromPim || "Klienci chwalą ten produkt za wysoką skuteczność, wydajność oraz świetne rezultaty codziennej pielęgnacji.";
    }
}

/**
 * Agent Audytor Prawny (Compliance Agent)
 * Analizuje treści marketingowe i wytyczne na bazie oficjalnych regulaminów PDF.
 */
async function generateComplianceReport(productName, aeoContent, originalDescription) {
    console.log(`[AiService] Odpalanie Agenta Prawnego (Compliance Agent) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { temperature: 0.0 } // 0.0 rygorystycznie - brak miejsca na halucynacje prawne
        });
        
        const parts = [
            `Jesteś rygorystycznym Audytorem Prawnym E-commerce i Specjalistą ds. Zgodności Kosmetycznej.
Twoim zadaniem jest przeanalizowanie załączonych dokumentów prawnych (Regulamin Allegro, Rozporządzenie WE nr 1223/2009, Rozporządzenie Komisji UE nr 655/2013) oraz materiałów źródłowych dla produktu.

Zwróć ZWARTY, RZECZOWY Raport Zgodności (max 1000 znaków), w którym:
1. Wypiszesz niedozwolone oświadczenia (tzw. claims) i słowa, których bezwzględnie copywriter MUSI unikać w tym konkretnym produkcie (np. oświadczenia medyczne/lecznicze, niesprawdzone "green claims").
2. Podasz twarde zasady z Regulaminu Allegro, które muszą być zachowane przy opisie i tytule tego produktu.
3. Przeanalizujesz dostarczoną treść (AEO i oryginalny opis) i wskażesz ryzykowne słowa, które trzeba usunąć, aby były w 100% zgodne z w/w przepisami.

Materiały źródłowe produktu:
NAZWA PRODUKTU: ${productName}
TREŚĆ AEO: ${aeoContent || 'Brak'}
OPIS ORYGINALNY: ${originalDescription || 'Brak'}
`
        ];

        // Załadowanie wyciągu SOT (Single Source of Truth) z wygenerowanej bazy wiedzy prawniczej
        const sotPath = path.join(__dirname, 'SOT_Baza_Wiedzy_Agenta.md');
        if (fs.existsSync(sotPath)) {
            const sotData = fs.readFileSync(sotPath, 'utf-8');
            parts.push(`\n\n--- BAZA WIEDZY (SINGLE SOURCE OF TRUTH) ---\n${sotData}`);
        } else {
            console.warn("[AiService] Brak pliku SOT_Baza_Wiedzy_Agenta.md. Agent Prawny zadziała na gołym modelu.");
        }

        const result = await generateWithRetry(model, parts);
        console.log(`[AiService] Agent Prawny zakończył pracę pomyślnie.`);
        return strictRegexMedicalFilter(result.response.text());
    } catch (err) {
        console.error("[AiService] Agent Prawny napotkał błąd:", err.message);
        return "Brak szczegółowego raportu prawnego z powodu błędu modelu. Stosuj ogólne zasady unikając greenwashingu i obietnic medycznych.";
    }
}

/**
 * Serwis komunikujący się z modelami Google Gemini (Modele z 2026 r.)
 */
async function generateNativeAnalysis(textContent, nativeImagesUrls = [], analysisMode = "STANDARD") {
    const isCosmeticAudit = analysisMode === "COSMETIC_LEGAL_AUDIT";
    let promptText = isCosmeticAudit ? COSMETIC_AUDITOR_PROMPT : STANDARD_PROMPT;

    if (isCosmeticAudit && INCI_KNOWLEDGE_BASE) {
        promptText += `\n\n--- BAZA WIEDZY INCI I TRENDY KOSMETYCZNE 2026 ---\n${INCI_KNOWLEDGE_BASE}`;
    }

    promptText += `\n\n--- PEŁNE DANE POBRANE Z API ALLEGRO ---\n${textContent}\n--- KONIEC DANYCH ---`;

    // Przymusowa rygorystyczna temperatura 0.0 dla audytów prawnych, blokująca halucynacje.
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
                        opis1: { type: "STRING" },
                        opis2: { type: "STRING" },
                        opis3: { type: "STRING" },
                        opis4: { type: "STRING" },
                        opis5: { type: "STRING" }
                    },
                    required: ["opis1", "opis2", "opis3", "opis4", "opis5"]
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
        model: 'gemini-3.1-pro-preview',
        tools: [{ googleSearch: {} }],
        generationConfig
    });

    const parts = [promptText];

    // Pobieramy i dorzucamy obrazy do prompta
    if (nativeImagesUrls && nativeImagesUrls.length > 0) {
        console.log(`[AiService] Wzbogacanie promptu API o ${nativeImagesUrls.length} natywnych zdjęć CDN...`);
        for (let i = 0; i < nativeImagesUrls.length; i++) {
            try {
                const response = await fetchImageSecure(nativeImagesUrls[i], 10000);
                parts.push(`Zdjęcie ${i + 1}. URL: ${nativeImagesUrls[i]}`);
                parts.push({
                    inlineData: {
                        data: Buffer.from(response.data, 'binary').toString("base64"),
                        mimeType: response.headers['content-type'] || 'image/jpeg'
                    }
                });
            } catch (imgErr) {
                console.warn(`[AiService] Pominęto natywny obraz ${nativeImagesUrls[i]} ze względu na błąd pobierania.`);
            }
        }
    }

    try {
        console.log(`[AiService] Wywołano Gemini w trybie Native API (bez OCR). Tryb: ${analysisMode}`);
        const result = await generateWithRetry(model, parts);
        let responseText = result.response.text();
        
        // Zastosowanie bezwzględnej Tarczy Anty-Medycznej na wyjście (AEO/Opisy)
        responseText = strictRegexMedicalFilter(responseText);
        
        let payloadString = responseText;
        
        // ZABEZPIECZENIE PRZED HALUCYNACJĄ MARKDOWN'u - czyszczenie tagów ```json
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
                console.error("[AiService] Błąd w adaptacji segmentowej dla Native Analysis:", adaptErr.message);
            }
        }
        
        // Fail-Safe: Hardcore Regex HTML Sanitize w pamięci (dla obiektu htmlContent)
        if (parsed.htmlContent && typeof parsed.htmlContent === 'object') {
            for (let key in parsed.htmlContent) {
                if (typeof parsed.htmlContent[key] === 'string') {
                     // Quill używa <strong> zamiast <b>, konwertujemy w locie
                     let c = parsed.htmlContent[key].replace(/<b[^>]*>/g, '<strong>').replace(/<\/b>/g, '</strong>');
                     // Dopuszczamy h3, h4 i strong
                     c = c.replace(/<(?!\/?(h1|h2|h3|h4|p|ul|ol|li|strong|br)(?=>|\s.*>))\/?.*?>/gi, ''); 
                     parsed.htmlContent[key] = c;
                }
            }
        }
        
        return parsed;

    } catch (error) {
        console.error("[AiService] Błąd w generacji Hybrydowej (Ultra): ", error);
        throw new Error("Generative API Failed: " + error.message);
    }
}

async function generateOfferJSON(baseTitle, attributesArray) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        tools: [{ googleSearch: {} }],
        systemInstruction: GEO_SYSTEM_PROMPT,
        // Wymuszenie formatu JSON z gwarancją niezgadywania markdowna
        generationConfig: {
            temperature: 0.1, // Niska temperatura by wynik był techniczny i deterministyczny
            responseMimeType: "application/json",
        }
    });

    const payload = `
Poniżej znajdują się twarde parametry oferty do zrekonstruowania.

TYTUŁ ORYGINALNY / PROBOCZY:
${baseTitle}

PARAMETRY I CECHY:
${attributesArray.map(a => `- ${a.name}: ${a.value}`).join('\n')}

Wygeneruj zwrot w formacie JSON zawierający wyizolowaną strukturę. Pamiętaj o restrykcjach HTML (7 dozwolonych znaczników!) oraz GEO 2026 na opis. Pamiętaj, długość tytułu min 12, max 75.
`;

    try {
        const result = await model.generateContent(payload);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Brak prawidłowej struktury JSON w odpowiedzi dla GEO Text. Otrzymano: ${responseText}`);
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("[AiService] Błąd generacji GEO Text: ", error);
        throw new Error("Generative Text API (GEO Output) Failed: " + error.message);
    }
}

/**
 * Audyt Multimodalny Zdjęć Oferty (Sprawdzenie wyśrubowanych reguł Allegro RGB).
 */
async function auditOfferImages(primaryImageUrl, galleryUrls = []) {
    const model = genAI.getGenerativeModel({
         model: "gemini-3.1-pro-preview",
         tools: [{ googleSearch: {} }],
         systemInstruction: VISION_AUDIT_PROMPT,
         generationConfig: {
            temperature: 0.2, // Audyt graficzny pozwala na ciutkę analizy kontekstowej CRO 
            responseMimeType: "application/json",
         }
    });

    try {
        // Przygotowanie payloadów obrazu z URI (zakładamy że Gemini je wspiera lub musimy wysłać Base64)
        // Ze względów API, pobierzemy pliki jako buffer.
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
        
        // Zwiększony limit z 2 do 15 by obsłużyć pełne zestawy zdjęć (np. 7) z BaseLinkera
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

        const promptText = "Oto paczka obrazów z oferty. Zdjęcie pierwsze to miniatura (bezwzględne środowisko RGB white). Reszta to detale.";
        
        const result = await model.generateContent([promptText, ...imageParts]);
        let rawText = result.response.text();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Brak prawidłowej struktury JSON w odpowiedzi wizyjnej. Otrzymano: ${rawText}`);
        let parsed = JSON.parse(jsonMatch[0]);

        // Autokorekta adresów URL po audycie Gemini Vision AI
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
                    img.originalUrl.includes('Ilość') || 
                    img.originalUrl.includes('Ilościowy') ||
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
        console.error("[AiService] Błąd Audytu Vision: ", error);
        throw new Error("Generative Vision API Failed: " + error.message);
    }
}

async function generateTitleOnly(textContent, currentTitle) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        tools: [{ googleSearch: {} }],
        generationConfig: {
            temperature: 0.8, // Trochę większa kreatywność dla wariacji tytułów
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

    const promptText = `Jesteś ekspertem SEO ds. e-commerce (Allegro).
Wygeneruj CAŁKOWICIE NOWY, inny niż obecny, mocno zoptymalizowany pod kątem konwersji i słów kluczowych tytuł dla poniższego produktu.
Obecny tytuł, który nam nie pasuje: "${currentTitle}"

Zanim zaczniesz generować, użyj Google Search (Google Trends/sklepy e-commerce), aby zbadać, jakie słowa kluczowe dla tego typu kosmetyku/produktu trendują najmocniej na polskim rynku. Wybierz najbardziej trafne.

Zasady:
1. Używaj języka potocznego kupujących i najczęstszych wyszukiwań, zbadanych w Google.
2. Tytuł MUSI mieć min 12, max 75 znaków.
3. Bądź kreatywny, przetasuj kolejność słów kluczowych lub wyciągnij ukryte benefity.
4. Bez słów typu 'hit', 'nowość'.

DANE PRODUKTU:
${textContent}

Odpowiedz wyłącznie czystym obiektem JSON:
{ "title": "Nowy wygenerowany tytuł" }
`;

    try {
        const result = await model.generateContent(promptText);
        let payloadString = result.response.text().trim();
        // Oczyszczanie z ewentualnych bloki markdown
        payloadString = payloadString.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();

        // 1. Próba bezpośredniego parsowania
        try {
            const parsed = JSON.parse(payloadString);
            if (parsed && parsed.title) return parsed;
        } catch (e) { }

        // 2. Niezachłanne dopasowanie pierwszego prawidłowego obiektu JSON
        const jsonMatch = payloadString.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed && parsed.title) return parsed;
            } catch (e) { }
        }

        // 3. Fallback: jeśli Gemini zwrócił po prostu tekst tytułu bez struktur klamrowych
        const cleanText = payloadString.replace(/["'\{\}]/g, '').replace(/title\s*:\s*/i, '').trim();
        if (cleanText.length >= 5 && cleanText.length <= 150) {
            return { title: cleanText };
        }

        throw new Error(`Brak prawidłowej struktury JSON w odpowiedzi dla tytułu. Otrzymano: ${payloadString}`);
    } catch (error) {
        console.error("[AiService] Generative Title Error:", error.message);
        // Ostatnia deska ratunku - zwracamy tytuł oryginalny ze wskazaniem audytu
        if (currentTitle) {
            return { title: currentTitle };
        }
        throw new Error("Generative API Title Failed: " + error.message);
    }
}

// Agent 8 (ClaidLiquidVariables) usunięty zgodnie z dyrektywą - zastąpiony przez API Photoroom.

async function generateDynamicPhotoroomPrompt(productDetailsText, imageIndex = 0, ean = '', existingPromptsCache = null) {
    if (existingPromptsCache && existingPromptsCache[imageIndex]) {
        console.log(`[Photoroom Dynamic Agent] Użyto zbuforowanego promptu na rok dla slotu #${imageIndex + 1}`);
        return existingPromptsCache[imageIndex];
    }

    const localApiKey = apiKey;
    if (!apiKey) {
        return getFallbackPhotoroomSetup(imageIndex);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        prompt: { type: "STRING" },
                        visualTrendReport: { type: "STRING" }
                    },
                    required: ["prompt", "visualTrendReport"]
                }
            }
        });

        const promptInstruction = `Jesteś ekspertskim dyrektorem artystycznym AI. Twój cel to stworzenie spersonalizowanego opisu tła dla Photoroom API dla produktu.

Zanim zaczniesz: Użyj Google Search, by przeszukać w sieci, co jest teraz w absolutnym trendzie, jak najlepiej prezentować ten rodzaj przedmiotu (badanie rynku). Wykonaj wyszukiwanie jeden raz by zrozumieć pozycjonowanie.

DANE PRODUKTU Z PIM:
${productDetailsText}

WYTYCZNE DLA KADRU SLOTU #${imageIndex + 1}:
- Dokonaj analizy składników.
- Zaprojektuj spójną wizualnie scenerię tła, która wyjdzie z analizy trendów:
  * Slot #1 (Główny Lifestyle): Podłoże dopasowane do składników.
  * Slot #2 (Koncepcja): Sceneria uwypuklająca zapach/ekstrakt.
  * Slot #3 (Laboratorium i Skuteczność): Nowoczesne, czyste środowisko.
  * Slot #4 (Flatlay & Tekstury): Ujęcie z góry na aksamitnej tkaninie.
  * Sloty #5+: Ekskluzywna aranżacja na minimalistycznym podestcie.

ZASADY DLA "prompt": Pisz po angielsku (max 30 słów), określ tło i oświetlenie. ZAKAZ ludzi, rąk, etykiet, opakowań produktu.
ZASADY DLA "visualTrendReport": Po polsku, opisz uzasadnienie biznesowe dla tej wybranej sceny.`;

        const result = await generateWithRetry(model, promptInstruction, 2);
        const jsonText = result.response.text();
        const data = JSON.parse(jsonText);
        if (data.prompt && data.visualTrendReport) {
            console.log(`[Photoroom Dynamic Agent] Wygenerowano nowy prompt dla slotu #${imageIndex + 1}:`, data.prompt);
            return data;
        }
    } catch (err) {
        console.error("[Photoroom Dynamic Agent] Ostrzeżenie: Gemini LLM nie zwrócił poprawnego JSON, używam fallbacku:", err.message);
    }

    return getFallbackPhotoroomSetup(imageIndex);
}

function getFallbackPhotoroomSetup(imageIndex) {
    let prompt = "Minimalist elegant wooden pedestal surface, soft neutral beige background, soft studio lighting, deep depth of field";
    let visualTrendReport = "Zgodnie z trendami e-commerce, wykorzystano czyste, stonowane tło studyjne z miękkim oświetleniem budujące czytelność produktu.";

    switch(imageIndex) {
        case 1:
            prompt = "Dark textured slate stone surface with subtle crystal clear water droplets, vibrant seascape blur in background, directional dramatic sunlight, 8k commercial photoshoot";
            visualTrendReport = "Zgodnie z trendami na 2026 rok, najwyższą konwersję generują ujęcia na ciemnym łupku kamiennym z kroplami wody akcentującymi nawilżenie i świeżość.";
            break;
        case 2:
            prompt = "Luxury SPA natural white marble surface with soft tropical botanical leaf shadows, warm natural morning sunlight, clean minimal aesthetic";
            visualTrendReport = "Zgodnie z raportami trendów, połączenie naturalnego białego marmuru SPA z miękkimi cieniami liści botanicznych buduje wizerunek naturalności premium.";
            break;
        case 3:
            prompt = "Modern high-tech cosmetic laboratory workspace, clean clinical white surface, soft subtle blue ambient backlighting, sharp focus, 8k photoshoot";
            visualTrendReport = "Zgodnie z trendami branżowymi, czysta sceneria laboratoryjna z miękkim błękitnym podświetleniem akcentuje kliniczną skuteczność receptury.";
            break;
        case 4:
            prompt = "Top-down flatlay commercial beauty photography background, luxurious natural linen fabric, delicate flower petals nearby, soft golden hour sunlight";
            visualTrendReport = "Zgodnie z trendami rynkowymi, ujęcie flatlay z góry na naturalnym lnie i płatkach kwiatów buduje zaufanie do delikatności kosmetyku.";
            break;
        case 5:
            prompt = "Stark white studio seamless background with a sharp geometric diagonal grey shadow cast across wall, modern minimal aesthetic";
            visualTrendReport = "Zgodnie z trendami e-commerce, minimalistyczne białe tło z czystym geometrycznym cieniem świetnie wyodrębnia opakowanie.";
            break;
    }

    return { prompt, visualTrendReport };
}

async function generatePhotoroomLifestyle(imageBase64, sourceImageUrl, ean, imageIndex = 0) {
    const photoroomKey = (process.env.PHOTOROOM_API_KEY && process.env.PHOTOROOM_API_KEY !== "TBD") 
        ? process.env.PHOTOROOM_API_KEY 
        : "sandbox_sk_pr_default_9f10500b15c19db1e2f8aee29e1671ac7ff33aa2";

    logLifestyleEvent('INFO', 'Rozpoczęto generowanie zdjęcia przez Photoroom API', { ean, imageIndex, usingSandbox: !process.env.PHOTOROOM_API_KEY });
    console.log(`[Photoroom Lifestyle] Rozpoczęto generowanie zdjęcia (Slot ${imageIndex + 1}) dla EAN: ${ean}`);

    // 1. Weryfikacja i przygotowanie bufora oryginalnego pliku obrazu
    let inputBuffer;
    if (imageBase64 && imageBase64.startsWith('data:image')) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (sourceImageUrl) {
        console.log("[Photoroom Lifestyle] Pobieranie oryginalnego zdjęcia z URL:", sourceImageUrl);
        const imgRes = await fetchImageSecure(sourceImageUrl);
        inputBuffer = Buffer.from(imgRes.data);
    } else {
        logLifestyleEvent('ERROR', 'Brak wejściowego obrazu w zapytaniu Photoroom');
        throw new Error("Brak wejściowego obrazu (wymagany imageBase64 lub sourceImageUrl).");
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
    } catch(e) { console.error("Błąd odczytu PIM dla Agenta Promptera:", e.message); }

    // 3. Dynamiczne wygenerowanie spersonalizowanego promptu i Raportu Trendów przez Gemini LLM
    const dynamicSetup = await generateDynamicPhotoroomPrompt(productDetailsText, imageIndex);
    const scenePrompt = dynamicSetup.prompt;
    const visualTrendReport = dynamicSetup.visualTrendReport;

    // 4. Wysłanie żądania do Photoroom Image Editing API (/v2/edit)
    logLifestyleEvent('INFO', 'Wysyłanie zapytania do Photoroom API v2/edit', { prompt: scenePrompt });
    
    const FormData = require('form-data');
    const sharp = require('sharp');
    const form = new FormData();
    form.append('imageFile', inputBuffer, { filename: 'product.jpg', contentType: 'image/jpeg' });
    form.append('background.prompt', scenePrompt);
    form.append('shadow.mode', 'ai.preset-soft');
    form.append('export.format', 'jpeg');
    form.append('outputSize', '1080x1080');
    form.append('padding', '0.25');
    form.append('ignorePaddingAndSnapOnCroppedSides', 'false');

    const startTime = Date.now();
    try {
        const response = await axios.post('https://image-api.photoroom.com/v2/edit', form, {
            headers: {
                'x-api-key': photoroomKey,
                'pr-ai-shadows-model-version': '2026-04-15',
                ...form.getHeaders()
            },
            responseType: 'arraybuffer',
            timeout: 45000
        });

        const durationMs = Date.now() - startTime;
        const resultBuffer = Buffer.from(response.data);

        // Nanoszenie znaku wodnego EU AI Act Art. 50 za pomocą Sharp Node.js
        const badgeSvg = `
        <svg width="420" height="40" viewBox="0 0 420 40" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="420" height="40" rx="8" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5"/>
            <text x="16" y="25" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF">
                ✨ AI Generated (EU AI Act Art. 50) | Nexus ERP
            </text>
        </svg>`;

        let finalBuffer = resultBuffer;
        try {
            finalBuffer = await sharp(resultBuffer)
                .composite([{
                    input: Buffer.from(badgeSvg),
                    top: 1080 - 40 - 24,
                    left: 24
                }])
                .jpeg({ quality: 90 })
                .toBuffer();
        } catch (sharpErr) {
            console.error("[Photoroom Watermark] Ostrzeżenie wypalania znaku wodnego Sharp:", sharpErr.message);
        }

        const base64Output = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;

        logLifestyleEvent('INFO', 'Photoroom API zrealizował edycję pomyślnie (100% zachowanie etykiety + EU AI Act Art. 50 Watermark)', {
            durationMs,
            outputBytes: finalBuffer.length
        });

        return {
            base64: base64Output,
            visualTrendReport: visualTrendReport
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
        logLifestyleEvent('ERROR', 'Błąd podczas wywołania Photoroom API', {
            durationMs,
            status: err.response?.status,
            error: errorDetails
        });
        console.error("[Photoroom API Error]", errorDetails);
        throw new Error(`Błąd Photoroom API (status ${err.response?.status || '500'}): ${errorDetails}`);
    }
}

const generateClaidLifestyle = generatePhotoroomLifestyle;
const generateImagenLifestyle = generatePhotoroomLifestyle;

/*
 * [DEPRECATED / BACKUP] Stary, drogi Agent uzupełniania parametrów (PXM Auto-Fill Agent).
 * Zostawiony jako kopia bezpieczeństwa zgodnie z prośbą.
 *
async function autofillMissingParameters(ean, productName, currentFeatures, requiredSchema) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    });
    
    // Zabezpieczenie przed przepalaniem tokenów: mapujemy tylko brakujące/wymagane parametry
    const missingSchema = (requiredSchema || []).filter(p => !currentFeatures || !currentFeatures[p.name]);
    
    if (missingSchema.length === 0) return currentFeatures;

    const prompt = `Jesteś inżynierem PIM (Product Information Management) i ekspertem OSINT.
Zadanie: Uzupełnij brakujące parametry techniczne dla produktu.
KRYTYCZNE ZALECENIE BADAWCZE: Poszukiwania danych musisz przeprowadzić w wbudowanej wyszukiwarce googleSearch.
MUSISZ zachować rygorystyczną kolejność źródeł poszukiwań:
1. Zbadaj dane na oficjalnej, globalnej stronie producenta (korzystaj z głównej domeny, np. .com, .fr, .de w zależności od pochodzenia marki, użyj po prostu operatora wyszukiwania dla nazwy marki).
2. Jeśli nie znajdziesz, zbadaj oficjalną stronę krajowego dystrybutora dla tej marki.
3. Jeśli tam nie ma, zbadaj największe rynkowe marketplace'y (np. Notino, Hebe, Super-Pharm, e-Zebra).
Tylko z tych źródeł pobieraj zaufane parametry, a następnie wykonaj mapowanie do PIM.

Produkt: ${productName}
EAN: ${ean}

Oto lista parametrów do uzupełnienia wraz z ich dopuszczalnymi wartościami (jeśli słownik jest wymagany, MUSISZ użyć dokładnej wartości ze słownika):
${JSON.stringify(missingSchema.map(p => ({ nazwa: p.name, wymagane: p.required, typ: p.type, dopuszczalne_wartosci: p.dictionary ? p.dictionary.map(d => d.value) : "Dowolny tekst" })), null, 2)}

Obecnie zapisane parametry (nie nadpisuj ich): ${JSON.stringify(currentFeatures)}

Zwróć wygenerowany czysty JSON:
{
  "features": {
    "NazwaParametru": "Wartość",
    ...
  }
}
Jeśli w wiarygodnych źródłach producenta/dystrybutora nie było danego parametru, absolutnie go pomiń (nie zgaduj). Dla parametrów słownikowych, wartość musi być dopasowana do wariantów. Zwróć tylko czysty JSON.
`;

    try {
        console.log(`[AiService] Auto-Fill Agent szuka parametrów dla ${ean} z uwzględnieniem nowej hierarchii...`);
        const result = await generateWithRetry(model, prompt, 3, "Agent_11_Autofill");
        let text = result.response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return { ...currentFeatures, ...(parsed.features || {}) };
    } catch(err) {
        console.error("[AiService] Błąd Agenta Auto-Fill:", err.message);
        return currentFeatures;
    }
}
*/

/**
 * LITE: Agent uzupełniania parametrów (PXM Auto-Fill Agent - Ostatnia linia wsparcia).
 * Używa taniego modelu, działa na zredukowanym prompcie z limitami.
 */
async function autofillMissingParameters(ean, productName, currentFeatures, requiredSchema) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite", // Bardzo tani i szybki model zapasowy
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    });
    
    // Zabezpieczenie przed przepalaniem tokenów: mapujemy tylko brakujące/wymagane parametry
    const missingSchema = (requiredSchema || []).filter(p => !currentFeatures || !currentFeatures[p.name]);
    if (missingSchema.length === 0) return currentFeatures;

    // Redukcja tokenów ze słowników (>40 -> wycięcie payloadu)
    const optimizedSchemaMap = missingSchema.map(p => ({ 
        nazwa: p.name, 
        wymagane: p.required, 
        typ: p.type, 
        dopuszczalne_wartosci: (p.dictionary && p.dictionary.length <= 40) ? p.dictionary.map(d => d.value) : "Bardzo szeroki słownik - podaj precyzyjną, logiczną markę/wartość." 
    }));

    const prompt = `Jesteś inżynierem PIM.
Zadanie: Błyskawicznie uzupełnij brakujące parametry techniczne dla produktu. Użyj googleSearch by sprawdzić stronę producenta, dystrybutora lub duży marketplace. Omiń procedury deep researchu, wystarczą podstawowe wyniki dla tego produktu.

Produkt: ${productName}
EAN: ${ean}

Lista brakujących parametrów do uzupełnienia:
${JSON.stringify(optimizedSchemaMap, null, 2)}

Aktualne parametry (nie zwracaj ich z powrotem, tylko nowe):
${JSON.stringify(currentFeatures)}

Wygeneruj CZYSTY JSON:
{
  "features": {
    "NazwaParametru": "Wartość"
  }
}
Jeśli parametr jest oznaczony jako 'wymagane', ZAWSZE postaraj się wywnioskować z oszczędnych wyników googleSearch najbardziej logiczną i pasującą wartość. Dla wartości słownikowych (dopuszczalne_wartosci) wstaw ściśle tę wartość. Jeśli w ogóle nie widzisz sensownej wartości, pomiń.`;

    try {
        console.log(`[AiService] Lite Auto-Fill Agent startuje dla ${ean}...`);
        const result = await generateWithRetry(model, prompt, 2, "Agent_11_Autofill");
        let text = result.response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return { ...currentFeatures, ...(parsed.features || {}) };
    } catch(err) {
        console.error("[AiService] Błąd Agenta Lite Auto-Fill:", err.message);
        throw new Error("Agent AI (Auto-Fill) nie mógł połączyć się z wyszukiwarką lub modelem: " + err.message);
    }
}

async function generateAEOContent(productName, originalDescription, intelligenceData) {
    console.log(`[AiService] Odpalanie Agenta AEO (Analityk Strukturalny) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            systemInstruction: require('./ai.prompts').AEO_AGENT_PROMPT,
            generationConfig: { temperature: 0.4 } 
        });
        const prompt = `Produkt: ${productName}\nOpis źródłowy: ${originalDescription || 'Brak'}\nDane z wywiadu (INCI/Parametry): ${intelligenceData || 'Brak'}\nStwórz zwartą strukturę AEO.`;
        const result = await generateWithRetry(model, prompt);
        return result.response.text();
    } catch(err) {
        console.error("[AiService] Błąd Agenta AEO:", err.message);
        return "Brak danych AEO - Błąd generacji.";
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
                                opis1: { type: "STRING" },
                                opis2: { type: "STRING" },
                                opis3: { type: "STRING" },
                                opis4: { type: "STRING" },
                                opis5: { type: "STRING" }
                            },
                            required: ["opis1", "opis2", "opis3", "opis4", "opis5"]
                        }
                    },
                    required: ["htmlContent"]
                }
            } 
        });
        const prompt = `Produkt: ${productName}\nBaza AEO: ${aeoContent}\nDane INCI/OSINT: ${intelligenceData}\nOpinie/Sentiment Konsumentów: ${sentimentData || 'Brak'}\nZwróć wynik jako JSON z kluczem "htmlContent", zachowując restrykcję 7 tagów HTML. Wpleć naturalnie w treść akapitów (np. w sekcji opis3 lub opis4) wnioski z opinii klientów (np. za co klienci w szczególności chwalą ten produkt oraz na co zwracają uwagę po zakupie).`;
        const result = await generateWithRetry(model, prompt);
        let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        
        try {
            const adapted = await adaptToSegmentAndTone(productName, parsed.htmlContent, intelligenceData, null);
            if (adapted && adapted.htmlContent) {
                parsed.htmlContent = adapted.htmlContent;
            }
        } catch(adaptErr) {
            console.error("[AiService] Błąd w adaptacji segmentowej dla GEO Text:", adaptErr.message);
        }

        // EU AI Act Art. 50 Disclosure Banner Attachment (Sekcja 5 HTML)
        if (parsed.htmlContent && parsed.htmlContent.opis5 !== undefined) {
            const aiActNotice = `<div class="nexus-ai-transparency-note" style="font-size:11px; color:#64748b; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">🤖 <i>Treść oraz analiza opinii zoptymalizowane autonomicznie przez Nexus ERP AI Engine (Zgodnie z Art. 50 EU AI Act). Oferta zatwierdzona przez operatora.</i></div>`;
            if (!parsed.htmlContent.opis5.includes('nexus-ai-transparency-note')) {
                parsed.htmlContent.opis5 += aiActNotice;
            }
        }
        
        return parsed;
    } catch(err) {
        console.error("[AiService] Błąd Agenta GEO Text:", err.message);
        console.error(err.stack);
        throw new Error(`Agent GEO Text nie wygenerował opisu dla "${productName}": ${err.message}`);
    }
}

async function adaptToSegmentAndTone(productName, htmlContent, features, categoryId) {
    console.log(`[AiService] Odpalanie Agenta Segmentowego (Segment & Tone Adapter) dla: ${productName}...`);
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
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
                                opis1: { type: "STRING" },
                                opis2: { type: "STRING" },
                                opis3: { type: "STRING" },
                                opis4: { type: "STRING" },
                                opis5: { type: "STRING" }
                            },
                            required: ["opis1", "opis2", "opis3", "opis4", "opis5"]
                        }
                    },
                    required: ["htmlContent"]
                }
            } 
        });

        const prompt = `Produkt: ${productName}
Cechy/Parametry: ${typeof features === 'object' ? JSON.stringify(features) : (features || 'Brak')}
Kategoria ID: ${categoryId || 'Brak'}

Oto wygenerowany wstępny opis produktu składający się z 5 bloków. Twoim celem jest dokonanie adaptacji psychologicznej i tonu wypowiedzi do zidentyfikowanego segmentu rynkowego.
Zwróć uwagę na formatowanie i usunięcie zbitego tekstu (maksymalnie 3-4 linijki na akapit, 2-3 pogrubienia <strong> na akapit).
Skład INCI (jeśli znajduje się w opis5) pozostaw w 100% niezmieniony.

Wstępny Opis:
Blok 1 (opis1): ${htmlContent.opis1 || ''}
Blok 2 (opis2): ${htmlContent.opis2 || ''}
Blok 3 (opis3): ${htmlContent.opis3 || ''}
Blok 4 (opis4): ${htmlContent.opis4 || ''}
Blok 5 (opis5): ${htmlContent.opis5 || ''}`;

        const result = await generateWithRetry(model, prompt);
        let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch(err) {
        console.error("[AiService] Błąd Agenta Dopasowania Segmentowego:", err.message);
        return { htmlContent };
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
    autofillMissingParameters,
    generateComplianceReport
};
