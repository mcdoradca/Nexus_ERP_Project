const { GoogleGenAI } = require('@google/genai');

let _aiInstance = null;
function getAi() {
    if (_aiInstance) return _aiInstance;
    const key = process.env.GEMINI_API_KEY;
    if (key) {
        _aiInstance = new GoogleGenAI({
            apiKey: key,
            httpOptions: { timeout: 90000 }
        });
    }
    return _aiInstance;
}

/**
 * PromptDirectorService
 * Dwuagentowy system generowania promptów dla modeli obrazu i wideo:
 * 
 * WĘZEŁ 1: Dyrektor Kreatywny & Strateg Emocji (Creative & Emotional Director AI)
 * - Analizuje zebrane DNA marki (klimat strony, kolorystykę, światło), pozycjonowanie cenowe,
 *   grupę docelową (człowiek vs zwierzę, wiek, styl życia) oraz Kąty perswazji (A1-A4).
 * - Kontrastuje z audytem konkurencji (unika nasyconych klisz i ślepoty banerowej).
 * - Kreuje organiczny świat produktu (World-Building) oparty na silnych emocjach (energia, blask, ulga, świeżość).
 * 
 * WĘZEŁ 2: Architekt Promptów Technicznych (Prompt Systems Architect AI)
 * - Zna fizykę współczesnych silników (Nano Banana, Liblib/OmniGen, Kling AI, Runway Gen-3, Google Flow, Flux).
 * - Twardo stosuje Zasadę Nienaruszalności Produktu (Product Immutability / Identity Anchor):
 *   ZAKAZ opisywania wyglądu butelki/opakowania od nowa (co chroni przed zmianą różowego serum w czarną butelkę z pipetą).
 * - Generuje prompty w 100% naturalnym, plastycznym języku POLSKIM z fizyką lewitacji, czystej przestrzeni i światła.
 */
class PromptDirectorService {

    /**
     * Główna metoda generująca zestaw promptów produkcyjnych w architekturze dwuagentowej z uwzględnieniem obrad War Room
     */
    async generateProductionPrompts({ brief, brandProfile = {}, productData = {}, angle = null, marketInsights = {}, slotDirective = null }) {
        const prodName = productData.name || brandProfile.name || brief.productName || 'Produkt';
        const brandName = brandProfile.name || productData.brand?.name || 'Marka';
        const usp = brandProfile.usp || productData.features || brief.subheadline || 'Wysoka jakość i skuteczność';
        const headline = brief.headline || 'Przełomowe rozwiązanie';
        const brandDna = brandProfile.brandDna || `Klimat: Nowoczesna, autentyczna estetyka marki ${brandName}. Jasne, rozproszone światło i lekkość. Odbiorca: Świadomi konsumenci poszukujący sprawdzonych rezultatów.`;
        const priceStr = productData.salePrice ? `${Number(productData.salePrice).toFixed(2)} zł` : (brandProfile.priceInfo || 'Segment komercyjny');
        const visualAction = brief.visual_prompt || brief.visual_action || '';
        const scenesContext = Array.isArray(brief.scenes) 
            ? brief.scenes.map(s => `${s.timestamp}: ${s.onscreen_text} (${s.visual_action})`).join(' | ')
            : '';

        const warRoomContext = slotDirective ? `
USTALENIA Z POKOJU NARAD (AI WAR ROOM - PROTOKÓŁ):
- Kadr i geometria ujęcia: ${slotDirective.framing_directive} (BEZWZGLĘDNY ZAKAZ UMIESZCZANIA PRODUKTU NA ŚRODKU KADRU!)
- Haczyk emocjonalny (Instynkt Troski i Ochrony): ${slotDirective.emotional_hook}
- Kontekst relacyjny i sytuacyjny: ${slotDirective.context_elements}
` : '';

        const ai = getAi();
        if (!ai) {
            return this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData, slotDirective);
        }

        // =========================================================================
        // WĘZEŁ 1: DYREKTOR KREATYWNY & STRATEG EMOCJI (Creative Director AI)
        // =========================================================================
        let creativeVision = null;
        try {
            const creativePrompt = `Jesteś światowej sławy Dyrektorem Kreatywnym w agencji high-end commercial (odpowiednik dyrektorów kreatywnych z Cannes Lions i Vogue Commercials).
Twoim zadaniem jest stworzyć UNIKALNY ŚWIAT WIZUALNY (World-Building) oraz NARRACJĘ EMOCJONALNĄ dla kampanii produktu: "${prodName}" marki "${brandName}".

DANE WEJŚCIOWE:
- Produkt: ${prodName}
- Marka: ${brandName}
- Cena i półka: ${priceStr}
- DNA i klimat marki zebrany przez Agenta DNA: "${brandDna}"
- Główna obietnica / USP: ${usp}
- Nagłówek reklamowy: "${headline}"
${warRoomContext}
${angle ? `- Kąt perswazji psychologicznej: ${angle}` : ''}
${visualAction ? `- Sugestia z briefu: ${visualAction}` : ''}
${marketInsights.saturated_claims ? `- Nasycone schematy konkurencji, których należy unikać: ${JSON.stringify(marketInsights.saturated_claims)}` : ''}

ZASADY KREATYWNE I PSYCHOLOGICZNE:
1. ZROZUMIENIE PRODUKTU I ODBIORCY (INSTYNKT TROSKI I MIŁOŚCI):
   - Nie sprzedawaj suchych parametrów. Sprzedawaj emocje, które wyciskają łzy, wzruszają i wzbudzają potrzebę natychmiastowej ochrony najbliższych:
     * Troska o dziecko (delikatność, bezpieczeństwo, matczyny spokój),
     * Troska o rodzinę i bliskich (ciepło domowe, ulga od zmęczenia, zdrowie),
     * Troska o bezbronne zwierzęta (bezwarunkowa miłość, wdzięczność pupila),
     * Dbałość o planetę i przyszłe pokolenia (szacunek dla natury).
2. PRZEŁAMANIE CENTRYZMU I NUDY KOMPOZYCYJNEJ:
   - Zastosuj wytyczne kadrowania z Pokoju Narad. ZAKAZ umieszczania butelki na środku kadru!
   - Stosuj asymetrię (Rule of Thirds), ujęcia z perspektywy pierwszej osoby (POV dłoni w geście troski), portrety z głębią ostrości (f/1.4) lub sensoryczne zbliżenia na dotyk i krople.
3. SZACUNEK DLA ORYGINALNEGO PRODUKTU:
   - Pamiętaj: produkt ze zdjęcia referencyjnego jest ŚWIĘTY. Nie wymyślasz nowego opakowania! Tworzysz świat WOKÓŁ oryginalnego produktu.

Zwróć odpowiedź w formacie JSON:
\`\`\`json
{
  "target_audience_insight": "Kim dokładnie jest odbiorca i czego pragnie na poziomie podświadomym",
  "emotional_core": "Kluczowy kod emocjonalny sceny (np. wzruszająca troska matki, bezwarunkowa więź, domowa ulga)",
  "world_environment": "Opis żywego świata i scenerii (asymetria, czysta przestrzeń, kadr POV lub głębia ostrości, zero postumentów)",
  "lighting_and_atmosphere": "Precyzyjna fizyka światła dopasowana do klimatu marki (np. poranne rozproszone słońce, miękkie cienie dyfuzyjne, rim light)",
  "sensory_elements": "Elementy sensoryczne i dynamiczne (np. dotyk dłoni, krople rosy w zawieszeniu, ciepło domowe)"
}
\`\`\``;

            const creativeResp = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: creativePrompt,
                config: {
                    temperature: 0.3
                }
            });

            const creativeText = creativeResp.text || creativeResp.candidates?.[0]?.content?.parts?.[0]?.text;
            if (creativeText) {
                const cleaned = creativeText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) creativeVision = JSON.parse(match[0]);
            }
        } catch (cErr) {
            console.warn('[PromptDirectorService] Błąd Węzła 1 (Creative Director):', cErr.message);
        }

        // =========================================================================
        // WĘZEŁ 2: ARCHITEKT PROMPTÓW TECHNICZNYCH (Prompt Systems Architect)
        // =========================================================================
        const visionContext = creativeVision ? `
KONCEPCJA DYREKTORA KREATYWNEGO (WĘZEŁ 1):
- Wgląd w odbiorcę: ${creativeVision.target_audience_insight}
- Rdzeń emocjonalny: ${creativeVision.emotional_core}
- Świat i scenografia (World-Building): ${creativeVision.world_environment}
- Fizyka światła i atmosfera: ${creativeVision.lighting_and_atmosphere}
- Detale sensoryczne i dynamika: ${creativeVision.sensory_elements}
` : `Koncepcja: Nowoczesny świat marki ${brandName} w oparciu o ${brandDna}. Asymetryczny kadr, głębia ostrości i autentyczne emocje troski.`;

        const architectPrompt = `Jesteś elitarnym Architektem Promptów AI (Prompt Systems Architect) wyspecjalizowanym w silnikach generatywnych: Nano Banana, Liblib AI / OmniGen, Kling AI, Runway Gen-3, Google Flow, Flux.1 oraz Midjourney v6.

TWOJE ZADANIE:
Przełóż poniższą wizję Dyrektora Kreatywnego oraz ustalenia z Pokoju Narad na 5 gotowych, technicznych promptów produkcyjnych w 100% w języku POLSKIM.
Użytkownik skopiuje Twój prompt 1-kliknięciem i wklei bezpośrednio do generatora.

KRYTYCZNE ZASADY FIZYKI MODELI I KOMPOZYCJI:
1. PRODUCT IMMUTABILITY SHIELD (TARCZA NIENARUSZALNOŚCI PRODUKTU):
   W KAŻDYM prompcie MUSISZ zastosować klauzulę tożsamości:
   "OBIEKT CENTRALNY: Nienaruszalny produkt referencyjny z załączonego zdjęcia. Bezwzględny zakaz modyfikowania, przeprojektowywania lub opisywania na nowo kształtu butelki, pompki, etykiety, typografii i kolorystyki – produkt w 100% zachowuje oryginalną tożsamość fizyczną."
2. BEZWZGLĘDNY ZAKAZ CENTRYZMU (ELIMINACJA ŚLEPOTY BANEROWEJ):
   Produkt NIE MOŻE stać na środku kadru!
   Zastosuj precyzyjną asymetrię z Pokoju Narad: ${slotDirective ? slotDirective.framing_directive : 'boczna tercja kadru (Rule of Thirds), ujęcie z perspektywy pierwszej osoby (POV) lub głębia ostrości'}.
3. ŁADUNEK EMOCJI TROSKI:
   ${slotDirective ? `Scena musi wywoływać: ${slotDirective.emotional_hook}. Kontekst: ${slotDirective.context_elements}.` : 'Scena musi budzić głęboką potrzebę ochrony bliskich, dzieci, zwierząt lub natury.'}

DANE PRODUKTU I MARKI:
- Produkt: ${prodName}
- Marka: ${brandName}
- DNA i Klimat Marki: ${brandDna}
- Nagłówek reklamowy: "${headline}"
${scenesContext ? `- Scenopis wideo: ${scenesContext}` : ''}
${visionContext}

Zwróć obiekt JSON z dokładnie 5 promptami w języku polskim:
1. "nano_banana_packshot": Komercyjna fotografia produktowa w asymetrycznym kadrze z otwartą przestrzenią na emocje (Nano Banana / Midjourney / Flux.1).
2. "omni_rich_content": Karta Rich Content A+ / infografika e-commerce pokazująca produkt w dynamicznym, żywym kontekście opieki i korzyści (OmniGen / Liblib).
3. "reels_video_flow": Scenariusz wideo 9:16 klatka po klatce dla Google Flow / Kling AI / Google Vids z ruchem kamery, emocjonalnym gestem i oświetleniem.
4. "story_tiktok_viral": Żywy, natywny format social UGC / TikTok 9:16 z emocjonalnym haczykiem troski w pierwszych 2 sekundach (TikTok / Runway Gen-3).
5. "macro_details": Sensoryczne zbliżenie makro na dotyk, kroplę w zawieszeniu i autentyczny kontakt ze skórą (Flux / DALL-E).

Zwróć WYŁĄCZNIE poprawny JSON:
\`\`\`json
{
  "nano_banana_packshot": "...",
  "omni_rich_content": "...",
  "reels_video_flow": "...",
  "story_tiktok_viral": "...",
  "macro_details": "..."
}
\`\`\``;

        try {
            const resp = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: architectPrompt,
                config: {
                    temperature: 0.2
                }
            });

            const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) {
                    return JSON.parse(match[0]);
                }
            }
        } catch (err) {
            console.warn('[PromptDirectorService] Błąd Węzła 2 (Prompt Architect):', err.message);
        }

        return this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData, slotDirective);
    }

    /**
     * Wzbogaca całą tablicę briefów o dedykowane prompty produkcyjne w 100% po polsku
     */
    async enrichBriefsWithPrompts(briefs = [], brandProfile = {}, productData = {}, angles = [], marketInsights = {}, warRoom = null) {
        if (!Array.isArray(briefs) || briefs.length === 0) return briefs;

        const angleMap = new Map();
        if (Array.isArray(angles)) {
            angles.forEach(a => {
                if (a.id) angleMap.set(a.id, a.name || a.psychological_trigger);
            });
        }

        const creativesMatrix = warRoom?.meeting_minutes?.creatives_matrix || [];

        const enriched = await Promise.all(briefs.map(async (brief, idx) => {
            const angleName = brief.angle_id ? angleMap.get(brief.angle_id) : (angles[idx % (angles.length || 1)]?.name || null);
            const slotDirective = creativesMatrix[idx] || creativesMatrix[idx % (creativesMatrix.length || 1)] || null;

            try {
                const prompts = await this.generateProductionPrompts({
                    brief,
                    brandProfile,
                    productData,
                    angle: angleName,
                    marketInsights,
                    slotDirective
                });
                return {
                    ...brief,
                    framing_directive: slotDirective?.framing_directive || null,
                    emotional_hook: slotDirective?.emotional_hook || null,
                    production_prompts: prompts
                };
            } catch (err) {
                console.warn(`[PromptDirectorService] Błąd dla briefu ${brief.id}:`, err.message);
                const prodName = productData.name || brandProfile.name || brief.productName || 'Produkt';
                const brandName = brandProfile.name || productData.brand?.name || 'Marka';
                const usp = brandProfile.usp || productData.features || brief.subheadline || 'Wysoka jakość';
                const headline = brief.headline || 'Przełomowe rozwiązanie';
                const brandDna = brandProfile.brandDna || '';
                return {
                    ...brief,
                    framing_directive: slotDirective?.framing_directive || null,
                    emotional_hook: slotDirective?.emotional_hook || null,
                    production_prompts: this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData, slotDirective)
                };
            }
        }));

        return enriched;
    }

    /**
     * Deterministyczny fallback promptów spełniający w 100% reguły nienaruszalności produktu i braku postumentów
     */
    _deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna = '', productData = {}, slotDirective = null) {
        const dnaSnippet = brandDna ? `Zgodnie z DNA marki: ${brandDna.substring(0, 140)}. ` : '';
        const framingRule = slotDirective?.framing_directive 
            ? `KADROWANIE: ${slotDirective.framing_directive}. ZAKAZ umieszczania produktu na środku kadru. `
            : `KADROWANIE: Asymetria kompozycyjna (Rule of Thirds) – produkt umieszczony w bocznej 1/3 kadru z otwartą przestrzenią. `;
        const emotionRule = slotDirective?.emotional_hook
            ? `ŁADUNEK EMOCJONALNY: ${slotDirective.emotional_hook}. ${slotDirective.context_elements || ''}. `
            : `ŁADUNEK EMOCJONALNY: Instynkt troski, bezpieczeństwa i opieki nad bliskimi. `;

        return {
            nano_banana_packshot: `Komercyjna fotografia studyjna e-commerce dla produktu marki ${brandName}. OBIEKT CENTRALNY: Nienaruszalny produkt referencyjny z załączonego zdjęcia (${prodName}). ZAKAZ modyfikowania, przeprojektowywania lub opisywania na nowo kształtu butelki, pompki, etykiety, typografii i kolorystyki – produkt w 100% zachowuje oryginalną tożsamość fizyczną ze zdjęcia. ${framingRule}${emotionRule}SCENOGRAFIA: Żadnych kamiennych, marmurowych ani drewnianych postumentów. OŚWIETLENIE: Miękkie, poranne światło wpadające pod kątem, subtelny tylny rim light podkreślający krawędzie opakowania, delikatne cienie dyfuzyjne w przestrzeni poniżej. Wokół produktu zawieszone w powietrzu mikroskopijne, lśniące cząsteczki świeżości. Obiektyw portretowy 85mm f/1.4, krystaliczna ostrość na oryginalnej etykiecie, płytka głębia ostrości. Atmosfera lekkości, czystości i promiennej energii troski.`,
            
            omni_rich_content: `Karta wizualna Rich Content A+ dla e-commerce dla produktu marki ${brandName}. OBIEKT CENTRALNY: Dokładny produkt referencyjny ze zdjęcia (${prodName}) w 100% wierności wizualnej i kolorystycznej. KOMPOZYCJA: ${framingRule}${emotionRule}Produkt w otoczeniu naturalnych elementów odzwierciedlających właściwości: ${usp}. W tle miękkie światło dzienne i przejścia tonalne dopasowane do estetyki marki. ${dnaSnippet}Bez ciężkich cokołów czy ciemnych podestów. Studyjna jakość katalogowa, proporcje 1:1, nowoczesny e-commerce budzący natychmiastowe zaufanie i zachwyt.`,
            
            reels_video_flow: `Dynamiczny spot wideo w pionowym formacie 9:16 dla platformy Instagram Reels i Google Flow. ${framingRule}${emotionRule}Kamera wykonuje płynny najazd boczny pod kątem, odsłaniając produkt ${prodName} (dokładny obiekt z załączonego zdjęcia referencyjnego, zachowujący oryginalne barwy, etykietę i detale bez żadnych zniekształceń). W tle w zwolnionym tempie 60fps wirują subtelne cząsteczki światła i mikrokrople esencji. Kinowy grading barwny w ciepłej, promiennej palecie barw z nagłówkiem: "${headline}". Emocje: natychmiastowa ulga, witalność i spokój o bliskich.`,
            
            story_tiktok_viral: `Natywny, wciągający kadr wideo w formacie 9:16 w nowoczesnej estetyce UGC na TikToka. ${framingRule}${emotionRule}W kadrze widoczna zmysłowa, autentyczna interakcja: delikatna dłoń prezentująca oryginalny produkt ${prodName} w jasnym, nasłonecznionym wnętrzu o minimalistycznym charakterze. Miękkie światło dzienne z bocznego okna, naturalny uśmiech i promienny blask skóry w tle. Żadnych sztywnych, studyjnych postumentów. W pierwszych 2 sekundach dynamiczny mikro-ruch przyciągający wzrok, lekkość i autentyczna radość z opieki nad sobą i bliskimi.`,
            
            macro_details: `Ekstremalne zbliżenie sensoryczne makro (extreme close-up macro 100mm f/2.8) ukazujące nienaruszony produkt ${prodName} marki ${brandName}. ${framingRule}${emotionRule}Ostrość igłowa na oryginalnym detalu aplikatora i załamaniu światła na gładkiej powierzchni opakowania. Wokół unosi się pojedyncza, krystaliczna kropla czystej esencji zawieszona w locie, w której odbija się miękkie światło studyjne. Mikroskopijna głębia ostrości, sensualna czystość i zachwyt nad teksturą. Zero ciężkich powierzchni – czysta gra światła, transparentności i świeżości.`
        };
    }
}

module.exports = new PromptDirectorService();
