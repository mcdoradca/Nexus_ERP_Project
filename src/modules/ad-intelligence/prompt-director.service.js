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
     * Główna metoda generująca zestaw promptów produkcyjnych w architekturze dwuagentowej
     */
    async generateProductionPrompts({ brief, brandProfile = {}, productData = {}, angle = null, marketInsights = {} }) {
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

        const ai = getAi();
        if (!ai) {
            return this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData);
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
${angle ? `- Kąt perswazji psychologicznej: ${angle}` : ''}
${visualAction ? `- Sugestia z briefu: ${visualAction}` : ''}
${marketInsights.saturated_claims ? `- Nasycone schematy konkurencji, których należy unikać: ${JSON.stringify(marketInsights.saturated_claims)}` : ''}

ZASADY KREATYWNE I PSYCHOLOGICZNE:
1. ZROZUMIENIE PRODUKTU I ODBIORCY:
   - Zastanów się, z jakim produktem masz do czynienia (czy to kosmetyk, chemia domowa, produkt dla psa, czy artykuł spożywczy) oraz kto go używa (np. kobieta 20+ szukająca promiennego blasku "glow", czy rodzina szukająca czystości, czy pasjonat).
   - Dopasuj emocje: nie pisz generycznych haseł. Odwołaj się do zmysłów, ulgi, zachwytu, pewności siebie, lekkości i witalności.
2. PRZEŁAMANIE BANEROWEJ ŚLEPOTY (ZAKAZ MARTWYCH POSTUMENTÓW):
   - Internet jest zasypany produktami stojącymi na ciemnych, marmurowych, łupkowych czy drewnianych postumentach. Powoduje to natychmiastowe zignorowanie reklamy (ad fatigue).
   - Zbuduj dynamiczną, żywą przestrzeń: produkt lewitujący w czystej, jasnej przestrzeni, zawieszony w harmonijnej równowadze, otoczony dynamicznymi cząsteczkami w locie (np. soczyste owoce, krople witaminowej esencji, mikroskopijne refleksy światła słonecznego, delikatny powiew).
3. SZACUNEK DLA ORYGINALNEGO PRODUKTU:
   - Pamiętaj: produkt ze zdjęcia referencyjnego jest ŚWIĘTY. Nie wymyślasz nowego opakowania! Tworzysz świat WOKÓŁ oryginalnego produktu.

Zwróć odpowiedź w formacie JSON:
\`\`\`json
{
  "target_audience_insight": "Kim dokładnie jest odbiorca i czego pragnie na poziomie podświadomym",
  "emotional_core": "Kluczowy kod emocjonalny sceny (np. promienny blask, radosna ulga, zmysłowa świeżość)",
  "world_environment": "Opis żywego świata i scenerii (czysta przestrzeń, lewitacja, cząsteczki w locie, zero postumentów)",
  "lighting_and_atmosphere": "Precyzyjna fizyka światła dopasowana do klimatu marki (np. poranne rozproszone słońce, miękkie cienie dyfuzyjne, rim light)",
  "sensory_elements": "Elementy sensoryczne i dynamiczne (np. krople rosy w zawieszeniu, składniki botaniczne w locie, świetlna mgiełka)"
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
` : `Koncepcja: Nowoczesny, świetlisty świat marki ${brandName} w oparciu o ${brandDna}. Lewitacja produktu w czystej przestrzeni, rozproszone miękkie światło dzienne i dynamiczne cząsteczki w locie.`;

        const architectPrompt = `Jesteś elitarnym Architektem Promptów AI (Prompt Systems Architect) wyspecjalizowanym w silnikach generatywnych: Nano Banana, Liblib AI / OmniGen, Kling AI, Runway Gen-3, Google Flow, Flux.1 oraz Midjourney v6.

TWOJE ZADANIE:
Przełóż poniższą wizję Dyrektora Kreatywnego na 5 gotowych, technicznych promptów produkcyjnych w 100% w języku POLSKIM.
Użytkownik skopiuje Twój prompt 1-kliknięciem i wklei bezpośrednio do Nano Banana, OmniGen, Klinga, Google Flow lub Runwaya, aby natychmiast otrzymać zachwycający, komercyjny materiał.

KRYTYCZNA ZASADA FIZYKI MODELI GENERATYWNYCH (PRODUCT IMMUTABILITY SHIELD):
Gdy generatory AI otrzymują packshot produktu, a w prompcie zaczyna się opisywać wygląd butelki/etykiety, model natychmiast ZMIENIA produkt (np. różowe serum zamienia w czarną buteleczkę z pipetą).
Dlatego w KAŻDYM prompcie MUSISZ zastosować żelazną klauzulę tożsamości referencyjnej:
"OBIEKT CENTRALNY: Nienaruszalny produkt referencyjny z załączonego zdjęcia. Bezwzględny zakaz modyfikowania, przeprojektowywania lub opisywania na nowo kształtu butelki, pompki, etykiety, typografii i kolorystyki – produkt w 100% zachowuje oryginalną tożsamość fizyczną."
Cała treść prompta ma instruować model w zakresie:
- Scenografii, czystej przestrzeni i lewitacji (ŻADNYCH marmurowych, drewnianych, kamiennych ani łupkowych postumentów!),
- Oświetlenia studyjnego i kinowego (kąty softboxa, światło konturowe rim-light, odbicia fresnelowskie, miękkie cienie),
- Fizyki cząsteczek w powietrzu (soczyste składniki w locie, mikroskopijne krople, refleksy światła),
- Optyki (obiektyw 85mm f/1.4, makro 100mm f/2.8, płytka głębia ostrości, bokeh),
- Ruchu kamery (najazd push-in, orbitalny obrót 360, slow-motion 60fps),
- Prawdziwych emocji człowieka (autentyczna, promienna skóra, zmysłowa aplikacja kropli bez sztucznych póz).

DANE PRODUKTU I MARKI:
- Produkt: ${prodName}
- Marka: ${brandName}
- DNA i Klimat Marki: ${brandDna}
- Nagłówek reklamowy: "${headline}"
${scenesContext ? `- Scenopis wideo: ${scenesContext}` : ''}
${visionContext}

Zwróć obiekt JSON z dokładnie 5 promptami:
1. "nano_banana_packshot": Komercyjna fotografia produktowa w lewitacji w czystej, świetlistej przestrzeni studyjnej (Nano Banana / Midjourney / Flux.1).
2. "omni_rich_content": Karta Rich Content A+ / infografika e-commerce pokazująca produkt w dynamicznym otoczeniu składników i właściwości (OmniGen / Liblib).
3. "reels_video_flow": Scenariusz wideo 9:16 klatka po klatce dla Google Flow / Kling AI / Google Vids z ruchem kamery, dynamiką i oświetleniem.
4. "story_tiktok_viral": Żywy, natywny format social UGC / TikTok 9:16 z emocjonalnym haczykiem wizualnym w pierwszych 2 sekundach (TikTok / Runway Gen-3).
5. "macro_details": Sensoryczne zbliżenie makro na konsystencję, krople w locie i mikroskopijne detale jakości (Flux / DALL-E).

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

        return this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData);
    }

    /**
     * Wzbogaca całą tablicę briefów o dedykowane prompty produkcyjne w 100% po polsku
     */
    async enrichBriefsWithPrompts(briefs = [], brandProfile = {}, productData = {}, angles = [], marketInsights = {}) {
        if (!Array.isArray(briefs) || briefs.length === 0) return briefs;

        const angleMap = new Map();
        if (Array.isArray(angles)) {
            angles.forEach(a => {
                if (a.id) angleMap.set(a.id, a.name || a.psychological_trigger);
            });
        }

        const enriched = await Promise.all(briefs.map(async (brief, idx) => {
            const angleName = brief.angle_id ? angleMap.get(brief.angle_id) : (angles[idx % (angles.length || 1)]?.name || null);
            try {
                const prompts = await this.generateProductionPrompts({
                    brief,
                    brandProfile,
                    productData,
                    angle: angleName,
                    marketInsights
                });
                return {
                    ...brief,
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
                    production_prompts: this._deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna, productData)
                };
            }
        }));

        return enriched;
    }

    /**
     * Deterministyczny fallback promptów spełniający w 100% reguły nienaruszalności produktu i braku postumentów
     */
    _deterministicFallbackPrompts(prodName, brandName, usp, headline, brandDna = '', productData = {}) {
        const dnaSnippet = brandDna ? `Zgodnie z DNA marki: ${brandDna.substring(0, 140)}. ` : '';

        return {
            nano_banana_packshot: `Komercyjna fotografia studyjna e-commerce dla produktu marki ${brandName}. OBIEKT CENTRALNY: Nienaruszalny produkt referencyjny z załączonego zdjęcia (${prodName}). ZAKAZ modyfikowania, przeprojektowywania lub opisywania na nowo kształtu butelki, pompki, etykiety, typografii i kolorystyki – produkt w 100% zachowuje oryginalną tożsamość fizyczną ze zdjęcia. SCENOGRAFIA: Produkt lewituje w harmonijnej równowadze w czystej, nowoczesnej przestrzeni o jasnej, pastelowej tonacji. Żadnych kamiennych, marmurowych ani drewnianych postumentów. OŚWIETLENIE: Miękkie, rozproszone światło kluczowe softbox 45 stopni, subtelny tylny rim light podkreślający krawędzie opakowania, delikatne cienie dyfuzyjne w przestrzeni poniżej. Wokół produktu zawieszone w powietrzu mikroskopijne, lśniące cząsteczki świeżości i świetlne refleksy. Obiektyw portretowy 85mm f/1.4, krystaliczna ostrość na oryginalnej etykiecie, płytka głębia ostrości. Atmosfera lekkości, czystości i promiennej energii.`,
            
            omni_rich_content: `Karta wizualna Rich Content A+ dla e-commerce dla produktu marki ${brandName}. OBIEKT CENTRALNY: Dokładny produkt referencyjny ze zdjęcia referencyjnego (${prodName}) w 100% wierności wizualnej i kolorystycznej. KOMPOZYCJA: Dynamiczny kadr pod kątem 30 stopni. Produkt zawieszony w czystej przestrzeni, otoczony unoszącymi się w powietrzu świeżymi cząsteczkami i kroplami esencji odzwierciedlającymi właściwości: ${usp}. W tle miękkie, poranne światło słoneczne, przejścia tonalne dopasowane do estetyki marki. ${dnaSnippet}Bez ciężkich cokołów czy ciemnych podestów. Studyjna jakość katalogowa, proporcje 1:1, nowoczesny e-commerce premium budzący natychmiastowe zaufanie i zachwyt.`,
            
            reels_video_flow: `Dynamiczny spot wideo w pionowym formacie 9:16 dla platformy Instagram Reels i Google Flow. Płynny najazd kamery typu slow push-in w kierunku produktu ${prodName} (dokładny obiekt z załączonego zdjęcia referencyjnego, zachowujący oryginalne barwy, etykietę i detale bez żadnych zniekształceń). Produkt lewituje w czystej, jasnej przestrzeni. Wokół niego w zwolnionym tempie 60fps wirują subtelne cząsteczki światła i mikrokrople esencji. Kamera wykonuje delikatny obrót o 15 stopni, uwypuklając blask i dynamiczny nagłówek: "${headline}". Kinowy grading barwny w jasnej, promiennej palecie barw. Emocje: natychmiastowa ulga, witalność i zachwyt efektami.`,
            
            story_tiktok_viral: `Natywny, wciągający kadr wideo w formacie 9:16 w nowoczesnej estetyce UGC na TikToka. W kadrze widoczna zmysłowa, autentyczna interakcja: delikatna dłoń prezentująca oryginalny produkt ${prodName} w jasnym, nasłonecznionym wnętrzu o minimalistycznym charakterze. Miękkie światło dzienne z bocznego okna, naturalny uśmiech i promienny blask skóry w tle. Żadnych sztywnych, studyjnych postumentów. W pierwszych 2 sekundach dynamiczny mikro-ruch przyciągający wzrok, lekkość i autentyczna radość z pielęgnacji. Odbiorca natychmiast utożsamia się z poczuciem świeżości i zaufania.`,
            
            macro_details: `Ekstremalne zbliżenie sensoryczne makro (extreme close-up macro 100mm f/2.8) ukazujące nienaruszony produkt ${prodName} marki ${brandName}. Ostrość igłowa na oryginalnym detalu aplikatora i załamaniu światła na gładkiej powierzchni opakowania. Wokół unosi się pojedyncza, krystaliczna kropla esencji witaminowej zawieszona w locie, w której odbija się miękkie światło studyjne. Mikroskopijna głębia ostrości, sensualna czystość i zachwyt nad teksturą. Zero ciężkich powierzchni – czysta gra światła, transparentności i świeżości.`
        };
    }
}

module.exports = new PromptDirectorService();
