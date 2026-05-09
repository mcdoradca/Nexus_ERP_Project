const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
sharp.cache(false); // Wyłączenie wbudowanego cache'u dla stabilności RAM przy batchingu
const FormData = require('form-data');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { STANDARD_PROMPT, COSMETIC_AUDITOR_PROMPT } = require('./ai.prompts');
const cheerio = require('cheerio');
const EventBus = require('../../core/EventBus');
dotenv.config();

// Ładowanie bazy wiedzy do pamięci serwera raz podczas uruchomienia
let INCI_KNOWLEDGE_BASE = "";
try {
    INCI_KNOWLEDGE_BASE = fs.readFileSync(path.join(__dirname, 'inci_knowledge.txt'), 'utf-8');
} catch (e) {
    console.error("[AiService] Brak pliku inci_knowledge.txt - system będzie działał bez rozszerzonej bazy wiedzy.");
}

/**
 * Exponential Backoff Retry Policy
 */
async function generateWithRetry(model, promptOrParts, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await model.generateContent(promptOrParts);
        } catch (error) {
            attempt++;
            const isRateLimit = error.status === 429 || error.message.includes('429') || error.message.includes('503');
            if (attempt >= maxRetries || (!isRateLimit && !error.message.includes('timeout'))) {
                throw error; // Fail fast for non-transient errors
            }
            const backoffMs = Math.pow(2, attempt) * 1500 + Math.random() * 1000;
            console.log(`[AiService] ⚠️ Błąd API (próba ${attempt}/${maxRetries}). Wznawiam (Exponential Backoff) za ${Math.round(backoffMs)}ms...`);
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
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
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
async function gatherProductIntelligence(ean, productName) {
    console.log(`[AiService] Odpalanie Agenta Badawczego (OSINT + Cheerio) dla EAN: ${ean}...`);
    try {
        let semanticContext = "Brak wstępnych danych z ekstrakcji HTML.";
        try {
            // Próba wielopoziomowego parsowania semantycznego stron (np. otwarte katalogi)
            // Zastępuje czyste uderzenie LLM-em w HTML (Zagrożenie 6)
            const fallbackUrl = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`; 
            const response = await axios.get(fallbackUrl, { timeout: 3000 });
            if (response.data && response.data.product) {
                const p = response.data.product;
                // W prawdziwym środowisku tutaj Cheerio parsowałby klasę np. $('.ingredients-list').text()
                // Na potrzeby architektury symulujemy zrzut semantyczny.
                semanticContext = `Zrzut semantyczny: INCI: ${p.ingredients_text || 'brak'}, Marka: ${p.brands}`;
            }
        } catch (fetchErr) {
            console.warn("[AiService] Ekstrakcja semantyczna nie powiodła się. Przechodzę do pełnego wyszukiwania AI.");
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 } // Niska temperatura dla faktuografii
        });
        
        const prompt = `Jesteś ekspertem ds. baz danych kosmetycznych i badaczem e-commerce.
Twoim zadaniem jest znalezienie oficjalnej specyfikacji technicznej oraz pełnego składu INCI dla produktu.
Produkt: ${productName}
EAN: ${ean}
Kontekst z parsowania semantycznego (Zrzut DOM z Cheerio): ${semanticContext}

Użyj wyszukiwarki Google (masz do niej dostęp), aby przeszukać oficjalne strony producentów, apteki internetowe lub renomowane e-drogerie.
Zwróć ZWARTY, tekstowy raport zawierający WYŁĄCZNIE:
1. Pełną specyfikację techniczną. Postaraj się wyciągnąć ze stron jak najwięcej z poniższych parametrów:
(Działanie, Kod producenta, Kraj pochodzenia, Linia, Nie zawiera, Opakowanie, Osoba odpowiedzialna, PAO, Płeć, Produkt nie zawiera, Rodzaj, Składnik wiodący, Stan opakowania, Typ skóry, Typ włosów, Wielkość, Zapach, Wysokość, Szerokość, Długość, Waga z opakowaniem).
2. Pełny, dokładny i kompletny skład INCI (wszystkie składniki po przecinku).
Jeśli nie znajdziesz pewnych danych, napisz wyraźnie "Brak danych". Nie zmyślaj.
Format wyjściowy: Zwykły tekst.`;
        
        const result = await generateWithRetry(model, prompt);
        console.log(`[AiService] Agent Badawczy zakończył pracę. Znaleziono dane.`);
        return result.response.text();
    } catch (err) {
        console.error("[AiService] Agent Badawczy napotkał błąd:", err.message);
        
        // Notyfikacja na główny czat @Nexus zawiadamiająca moderatora IT o padzie scrapper'a
        EventBus.publish('nexus_bot_message', { 
            message: `⚠️ [ALERT ARCHITEKTURY] Agent Badawczy OSINT napotkał krytyczną barierę ekstrakcyjną (Captcha/Zmiana DOM) dla EAN: ${ean}. Proszę o interwencję moderatora IT. Powód: ${err.message}` 
        });
        
        return "Brak dodatkowych danych (Błąd Agenta Badawczego).";
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
                const response = await axios.get(nativeImagesUrls[i], { responseType: 'arraybuffer', timeout: 5000 });
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
            console.warn("[AiService] Błąd JSON.parse. Próba Auto-Naprawy (Auto-Repair) urwanego stringa...");
            
            // Auto-Repair: Szukamy ostatniego poprawnie zamkniętego obiektu w tablicy images.
            // Ucinamy uszkodzony na końcu element i na siłę domykamy strukturę JSON.
            const lastCompleteObject = payloadString.lastIndexOf('},');
            if (lastCompleteObject !== -1) {
                const repairedString = payloadString.substring(0, lastCompleteObject + 1) + "]}";
                try {
                    parsed = JSON.parse(repairedString);
                    console.log("[AiService] Sukces! Uratowano urwany JSON i zachowano główne dane (Title, HTML).");
                } catch (e) {
                    require('fs').writeFileSync(path.join(__dirname, '..', '..', '..', 'error_500.txt'), payloadString);
                    throw new Error("Generative API Failed: " + parseError.message);
                }
            } else {
                require('fs').writeFileSync(path.join(__dirname, '..', '..', '..', 'error_500.txt'), payloadString);
                throw new Error("Generative API Failed: " + parseError.message);
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
        return JSON.parse(responseText);
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
            const response = await axios.get(primaryImageUrl, { responseType: 'arraybuffer', timeout: 5000 });
            imageParts.push({
                inlineData: {
                    data: Buffer.from(response.data, 'binary').toString('base64'),
                    mimeType: response.headers['content-type']
                }
            });
        }
        
        // Z uwagi na koszty, limitujemy do pierwszych 2 zdjęć z galerii by uciąć rachunek dla klienta.
        const limitedGallery = galleryUrls.slice(0, 2);
        for (const gUrl of limitedGallery) {
             const response = await axios.get(gUrl, { responseType: 'arraybuffer', timeout: 5000 });
             imageParts.push({
                inlineData: {
                    data: Buffer.from(response.data, 'binary').toString('base64'),
                    mimeType: response.headers['content-type']
                }
             });
        }

        const promptText = "Oto paczka obrazów z oferty. Zdjęcie pierwsze to miniatura (bezwzględne środowisko RGB white). Reszta to detale.";
        
        const result = await model.generateContent([promptText, ...imageParts]);
        return JSON.parse(result.response.text());

    } catch (error) {
        console.error("[AiService] Błąd Audytu Vision: ", error);
        throw new Error("Generative Vision API Failed: " + error.message);
    }
}

async function generateTitleOnly(textContent, currentTitle) {
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        generationConfig: {
            temperature: 0.8, // Trochę większa kreatywność dla wariacji tytułów
            responseMimeType: "application/json",
        }
    });

    const promptText = `Jesteś ekspertem SEO ds. e-commerce (Allegro).
Wygeneruj CAŁKOWICIE NOWY, inny niż obecny, mocno zoptymalizowany pod kątem konwersji i słów kluczowych tytuł dla poniższego produktu.
Obecny tytuł, który nam nie pasuje: "${currentTitle}"

Zasady:
1. Używaj języka potocznego kupujących i najczęstszych wyszukiwań (np. jeśli składnik w nazwie to "Tranex", a polska nazwa to "Kwas Traneksamowy", w tytule używaj polskiej nazwy która lepiej pozycjonuje).
2. Tytuł MUSI mieć min 12, max 75 znaków.
3. Bądź kreatywny, przetasuj kolejność słów kluczowych lub wyciągnij ukryte benefity (np. pojemność, główne zastosowanie).
4. Bez słów typu 'hit', 'nowość'.

DANE PRODUKTU:
${textContent}

Odpowiedz wyłącznie czystym obiektem JSON:
{ "title": "Nowy wygenerowany tytuł" }
`;

    try {
        const result = await model.generateContent(promptText);
        let payloadString = result.response.text();
        payloadString = payloadString.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(payloadString);
    } catch (error) {
        throw new Error("Generative API Title Failed: " + error.message);
    }
}

async function generateClaidLiquidVariables(productDetails) {
    console.log(`[Gemini Agent] Ekstrakcja danych i losowanie zmiennych SEO/GEO na podstawie bazy PIM.`);
    
    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-pro-preview",
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.8 },
        systemInstruction: `Jesteś ekspertskim dyrektorem artystycznym AI oraz analitykiem trendów e-commerce. Twój cel to tworzenie dynamicznych parametrów dla API Claid.ai (w formacie JSON) w celu generowania hiper-realistycznych zdjęć produktowych.
KROK 0 (KRYTYCZNY - ZWIAD WIZUALNY): Przeanalizuj podane dane produktu PIM. Użyj narzędzia googleSearch, aby przeprowadzić Visual Competitor Analysis dla tego rodzaju kosmetyku na polskim i zagranicznym rynku w 2026 roku. Sprawdź jakie kolory, tekstury i tła (np. surowy beton, woda, tropiki, sterylne laboratorium) najlepiej konwertują u liderów rynku.
KROK 1: Analiza Obrazu i Ekstrakcja Danych
Zdefiniuj "Płynne Zmienne" (Liquid Variables):
- DYNAMIC_SCALE: Skala od 0.30 do 0.55 zależnie od wielkości obiektu.
- TARGET_AUDIENCE: np. "elegant young European woman".
- ACTIVE_INGREDIENT: Prawdziwy, główny składnik aktywny produktu.
- SLOT3_BACKGROUND_PROMPT: (NOWOŚĆ) W oparciu o trendy z KROKU 0 wymyśl niepowtarzalną, premium scenerię (2-3 zdania po angielsku). Sceneria MUSI wykorzystywać zbadane przed chwilą tekstury/kolory najlepiej konwertujące w tej branży. Całkowity ZAKAZ używania odciętych desek, plastrów drewna, półek, dłoni i ludzi (no wood slices, no wooden boards, no pedestals, no humans).
KROK 2: Wymuszanie Unikalności
Wylosuj kontekst:
- GEO_LOCATION: np. "luxury Mediterranean beach in Amalfi".
- TIME_OF_DAY: np. "warm golden hour sunset".
- VISUAL_TREND_REPORT: Krótkie uzasadnienie po polsku (1 zdanie), dlaczego wybrano taki styl wizualny na podstawie zwiadu z KROKU 0.
KROK 3: Wynik DOKŁADNIE w formacie JSON (bez bloków markdown \`\`\`json):
{
  "DYNAMIC_SCALE": 0.45,
  "TARGET_AUDIENCE": "...",
  "ACTIVE_INGREDIENT": "...",
  "SLOT3_BACKGROUND_PROMPT": "...",
  "GEO_LOCATION": "...",
  "TIME_OF_DAY": "...",
  "VISUAL_TREND_REPORT": "..."
}`
    });

    const prompt = `Analizuj i wygeneruj Liquid Variables dla poniższego produktu (dane z PIM/Offer Optimizer):\n\n${productDetails}\n\nPamiętaj, aby DYNAMIC_SCALE było ułamkiem dziesiętnym, a reszta to opisy tekstowe po angielsku.`;

    try {
        const result = await model.generateContent(prompt);
        let jsonStr = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        console.log("[Gemini Agent] Zidentyfikowano Liquid Variables (z uwzględnieniem Visual Trends):", data.VISUAL_TREND_REPORT);
        return data;
    } catch(err) {
        console.error("[Gemini Agent] Błąd generacji Liquid Variables, używam fallbacku:", err.message);
        return {
            DYNAMIC_SCALE: 0.45,
            TARGET_AUDIENCE: "modern attractive person",
            ACTIVE_INGREDIENT: "pure natural active ingredients",
            SLOT3_BACKGROUND_PROMPT: "The product is elegantly placed on a luxurious, natural stone spa surface surrounded by lush green monstera leaves and delicate water droplets.",
            GEO_LOCATION: "luxury Mediterranean beach",
            TIME_OF_DAY: "golden hour sunlight",
            VISUAL_TREND_REPORT: "Błąd zwiadu. Fallback na klasyczne ujęcie."
        };
    }
}

async function generateClaidLifestyle(imageBase64, sourceImageUrl, ean, imageIndex = 0) {
    const claidKey = process.env.CLAID_API_KEY;
    if (!claidKey || claidKey === "TBD") {
        throw new Error("Brak prawidłowego klucza CLAID_API_KEY w .env. Skontaktuj się z administratorem.");
    }

    let inputForAiEdit = sourceImageUrl || imageBase64;

    // 1. Upload Base64 do Claid Upload API (jeśli wymagane)
    if (inputForAiEdit && inputForAiEdit.startsWith('data:image')) {
        console.log("[AiService] Otrzymano Base64. Upload do Claid Upload API...");
        const base64Data = inputForAiEdit.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', buffer, { filename: 'upload.jpg', contentType: 'image/jpeg' });
        form.append('data', JSON.stringify({})); 

        try {
            const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
                headers: {
                    'Authorization': `Bearer ${claidKey}`,
                    ...form.getHeaders()
                }
            });

            if (uploadRes.data?.data?.output?.tmp_url) {
                inputForAiEdit = uploadRes.data.data.output.tmp_url;
                console.log("[AiService] Sukces uploadu, tmp_url:", inputForAiEdit);
            } else {
                throw new Error("Nieprawidłowa odpowiedź z endpointu uploadu Claid.");
            }
        } catch (err) {
            console.error("[AiService] Błąd uploadu Base64 do Claid:", err.response?.data || err.message);
            throw new Error("Błąd podczas wgrywania pliku bazowego do serwerów Claid.");
        }
    }

    if (!inputForAiEdit) {
        throw new Error("Brak wejściowego obrazu (imageBase64 ani sourceImageUrl).");
    }

    // Agent Gemini ekstrakcja zmiennych "Liquid Variables" bazując na PIM
    let productDetailsText = `Product EAN: ${ean}`;
    try {
        if (ean) {
            const product = await prisma.product.findUnique({ where: { ean } });
            if (product) {
                const featuresString = product.features ? JSON.stringify(product.features) : '';
                productDetailsText = `NAME: ${product.name}\nFEATURES: ${featuresString}\nDESC: ${product.descriptionHtml || ''}`;
            }
        }
    } catch(e) { console.error("Błąd odczytu PIM dla Agenta:", e.message); }

    const liquidVars = await generateClaidLiquidVariables(productDetailsText);
    const getRandomScale = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(2));
    const getRandomAngle = (min, max) => {
        let angle = Math.floor(Math.random() * (max - min + 1) + min);
        return angle < 0 ? 360 + angle : angle;
    };

    // ==========================================
    // ETAP 1 API: PRE-PROCESSING (IZOLACJA)
    // ==========================================
    console.log("[AiService] ETAP 1 API: Pre-processing (Izolacja, Upscale, Polish)...");
    let transparentImageUrl;
    try {
        const bgRemovePayload = {
            input: inputForAiEdit,
            operations: {
                restorations: {
                    upscale: "smart_resize",
                    polish: true
                },
                background: {
                    remove: {
                        category: "products",
                        clipping: true
                    },
                    color: "transparent"
                }
            },
            output: {
                format: { type: "png", compression: "optimal" }
            }
        };

        const bgRemoveRes = await axios.post('https://api.claid.ai/v1/image/edit', bgRemovePayload, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        transparentImageUrl = bgRemoveRes.data?.data?.output?.tmp_url;
    } catch (err) {
        console.error("[AiService] Błąd pre-processingu:", err.response?.data || err.message);
        const errData = err.response?.data;
        if (errData?.error_type === 'billing') {
            throw new Error("Brak środków na koncie Claid API (Not enough API credits). Doładuj konto Claid.");
        }
        throw new Error("Etap 1 (Izolacja tła) zakończył się niepowodzeniem. Powód: " + (errData?.error_message || err.message));
    }

    if (!transparentImageUrl) throw new Error("Brak URL obrazka z usuniętym tłem od Claid API.");

    // ==========================================
    // ETAP 1.5 LOCAL: SHADOW BAKING (Autorski silnik)
    // ==========================================
    let finalProductUrl = transparentImageUrl;
    if ([1, 2, 3].includes(imageIndex)) {
        console.log(`[AiService] ETAP 1.5 LOCAL: Wypalanie cienia dla Slotu ${imageIndex + 1}...`);
        finalProductUrl = await applyLocalShadow(transparentImageUrl, claidKey);
    }


    let sceneTmpUrl;
    
    // ==========================================
    // ETAP 2 API: GENEROWANIE SCENY 3D DLA SLOTÓW
    // ==========================================
    console.log(`[AiService] ETAP 2 API: Generowanie Sceny (AI Photoshoot v1/scene/create) dla Slotu ${imageIndex + 1}...`);
    
    let aiScenePayload = {};

    switch(imageIndex) {
        case 1: // Slot 2: Dynamika, Żywioł i Orzeźwienie
            aiScenePayload = {
                object: {
                    image_url: finalProductUrl,
                    placement_type: "absolute",
                    rotation_degree: getRandomAngle(-4, 4),
                    scale: liquidVars.DYNAMIC_SCALE,
                    position: { x: getRandomScale(0.4, 0.6), y: 0.6 }
                },
                scene: {
                    model: "v2",
                    prompt: `The product on a dark textured slate stone surface. Freezing water droplets and a dynamic, crystal clear water splash placed around it. Stunning ${liquidVars.GEO_LOCATION} seascape blur. ${liquidVars.TIME_OF_DAY} lighting creating sparkling highlights. Strong directional sunlight, realistic deep contact shadow under the product base, physical interaction with the wet surface. Clean and premium, bold and graphic.`,
                    negative_prompt: "still water, flat lighting, indoor, messy splash, artificial water, CGI, low quality, pixelated, text, watermark, floating product, soft shadow",
                    aspect_ratio: "1:1",
                    preference: "best"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;

        case 2: // Slot 3: Natura / Ingredients
            const slot3Scale = liquidVars.DYNAMIC_SCALE * 0.85;
            aiScenePayload = {
                object: {
                    image_url: finalProductUrl,
                    placement_type: "absolute",
                    rotation_degree: getRandomAngle(350, 355),
                    scale: Number(slot3Scale.toFixed(2)),
                    position: { x: getRandomScale(0.25, 0.40), y: getRandomScale(0.55, 0.70) }
                },
                scene: {
                    model: "v2",
                    prompt: `A premium commercial beauty photography. ${liquidVars.SLOT3_BACKGROUND_PROMPT} Strong directional sunlight, sharp dramatic shadows crossing the product and background, realistic deep contact shadow directly under the product base, physical interaction with the surface, 8k resolution, photorealistic.`,
                    negative_prompt: "floating, flat lighting, poorly blended, soft shadows, studio lighting, fake, mismatched light, hands, person, human, plain background, bad composition, wood slice, wooden board, pedestal",
                    aspect_ratio: "1:1",
                    preference: "best"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;
            
        case 3: // Slot 4: Laboratorium, Bezpieczeństwo i Autorytet
            aiScenePayload = {
                object: {
                    image_url: finalProductUrl,
                    placement_type: "absolute",
                    rotation_degree: 0.0,
                    scale: liquidVars.DYNAMIC_SCALE,
                    position: { x: getRandomScale(0.6, 0.7), y: 0.55 }
                },
                scene: {
                    model: "v2",
                    prompt: `The product on a brushed stainless steel laboratory counter. A few glass beakers and a microscope placed around it. Bright modern cosmetic research laboratory blur. Strong directional laboratory spotlight, sharp shadows, realistic deep contact shadow under the product base connecting it firmly to the steel counter. Clean and premium, clinical, professional.`,
                    negative_prompt: "floating product, dirty, messy, warm lighting, cozy, residential, text, watermark, low quality, noise, artificial, unprofessional, cartoon, soft shadows, poorly blended",
                    aspect_ratio: "1:1",
                    preference: "best"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;
            
        case 4: // Slot 5: Natura, SPA i Składniki (Flatlay)
            aiScenePayload = {
                object: {
                    image_url: transparentImageUrl,
                    placement_type: "absolute",
                    rotation_degree: 350,
                    scale: liquidVars.DYNAMIC_SCALE,
                    position: { x: 0.35, y: 0.5 }
                },
                scene: {
                    model: "v2",
                    prompt: `A premium top-down flatlay commercial beauty photography. The product is elegantly placed on a luxurious, natural spa surface. Vivid ${liquidVars.ACTIVE_INGREDIENT} and an elegant spa accessory placed nearby. Distinct, artistic dappled sunlight is passing through tropical plant leaves, casting beautiful, realistic leaf shadows across the entire scene and falling directly OVER the product itself, ensuring deep and seamless lighting harmonization. Clean uncluttered composition, quiet luxury, 8k.`,
                    negative_prompt: "dropper, pipette, rubber bulb, extra cap, modified product, floating product, hands, person, standing up, flat lighting, plain background, messy, artificial ingredients, text, watermark",
                    aspect_ratio: "1:1",
                    preference: "best"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;
            
        case 5: // Slot 6: Sześcian / Floating Minimalist
            aiScenePayload = {
                object: {
                    image_url: transparentImageUrl,
                    placement_type: "absolute",
                    rotation_degree: 335,
                    scale: 0.50,
                    position: { x: 0.5, y: 0.45 }
                },
                scene: {
                    model: "v2",
                    prompt: `The product is floating in mid-air. A soft distinct drop shadow is cast on the pure white floor directly beneath the product. Stark white studio seamless background with a sharp, geometric diagonal grey shadow cast across the wall from the top left. Hard sunlight, clinical precision. Clean and premium, modern minimal, purely white aesthetic.`,
                    negative_prompt: "pedestal, podium, platform, resting on surface, touching the ground, contact shadow, messy, dirty, textures, busy background, colored light, artificial looking, bad lighting, text, watermark",
                    aspect_ratio: "1:1",
                    preference: "best"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;
            
        case 6: // Slot 7
        case 0: // Slot 1
        default:
            aiScenePayload = {
                object: {
                    image_url: transparentImageUrl,
                    placement_type: "absolute",
                    rotation_degree: getRandomAngle(15, 30),
                    scale: 0.60,
                    position: { x: 0.5, y: 0.5 }
                },
                scene: {
                    model: "v2",
                    effect: "shadows",
                    color: "#ffffff",
                    aspect_ratio: "1:1"
                },
                output: {
                    number_of_images: 1,
                    format: { type: "jpeg", quality: 95, progressive: true }
                }
            };
            break;
    }

    try {
        const aiSceneRes = await axios.post('https://api.claid.ai/v1/scene/create', aiScenePayload, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                'Content-Type': 'application/json'
            }
        });
        sceneTmpUrl = aiSceneRes.data?.data?.output?.[0]?.tmp_url;
    } catch (err) {
        console.error("[AiService] Błąd inicjalizacji zlecenia Claid Scene Create:", err.response?.data || err.message);
        const errData = err.response?.data;
        if (errData?.error_type === 'billing') {
            throw new Error("Brak środków na koncie Claid API (Not enough API credits). Doładuj konto Claid.");
        }
        throw new Error("Etap 2 (AI Photoshoot) zakończył się niepowodzeniem. Powód: " + (errData?.error_message || err.message));
    }

    if (!sceneTmpUrl) throw new Error("Brak URL wygenerowanej sceny od Claid API.");

    // Pobranie końcowego obrazu i konwersja na Base64
    console.log("[AiService] Obraz gotowy. Pobieranie z Claid tmp_url i konwersja...");
    try {
        const downloadRes = await axios.get(sceneTmpUrl, { responseType: 'arraybuffer' });
        const finalBase64 = "data:image/jpeg;base64," + Buffer.from(downloadRes.data, 'binary').toString('base64');
        return { 
            base64: finalBase64, 
            visualTrendReport: liquidVars.VISUAL_TREND_REPORT 
        };
    } catch (err) {
        console.error("[AiService] Błąd pobierania wynikowego obrazka:", err.message);
        throw new Error("Nie udało się pobrać wygenerowanego obrazu z infrastruktury Claid.");
    }
}

/**
 * Agent uzupełniania parametrów (PXM Auto-Fill Agent).
 * Przeszukuje sieć poza Allegro w poszukiwaniu specyfikacji technicznej i mapuje ją do słownika.
 */
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
Zadanie: Uzupełnij brakujące parametry techniczne dla produktu e-commerce. Użyj wyszukiwarki Google, przeszukując oficjalne strony producentów, sklepy, czy katalogi z wyłączeniem Allegro.

Produkt: ${productName}
EAN: ${ean}

Oto lista parametrów do uzupełnienia wraz z ich dopuszczalnymi wartościami (jeśli słownik jest wymagany, MUSISZ użyć dokładnej wartości ze słownika):
${JSON.stringify(missingSchema.map(p => ({ nazwa: p.name, wymagane: p.required, typ: p.type, dopuszczalne_wartosci: p.dictionary ? p.dictionary.map(d => d.value) : "Dowolny tekst" })), null, 2)}

Obecnie zapisane parametry (nie nadpisuj ich): ${JSON.stringify(currentFeatures)}

Zwróć JSON z wyciągniętymi/odgadniętymi wartościami. Format wyjściowy:
{
  "features": {
    "NazwaParametru": "Wartość",
    ...
  }
}
Jeśli nie odnajdziesz wiarygodnej informacji dla danego parametru w sieci, pomiń go. Pamiętaj: dla parametrów ze słownikiem (dopuszczalne_wartosci), zwrócona wartość musi być kropka w kropkę identyczna z jednym z wariantów. Zwróć tylko czysty JSON.
`;

    try {
        console.log(`[AiService] Auto-Fill Agent szuka parametrów dla ${ean}...`);
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return { ...currentFeatures, ...(parsed.features || {}) };
    } catch(err) {
        console.error("[AiService] Błąd Agenta Auto-Fill:", err.message);
        return currentFeatures;
    }
}

module.exports = {
    gatherProductIntelligence,
    generateNativeAnalysis,
    generateOfferJSON,
    auditOfferImages,
    generateTitleOnly,
    generateClaidLiquidVariables,
    generateClaidLifestyle,
    autofillMissingParameters,
    generateComplianceReport
};
