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
 * Elitarny Agent AI wyszkolony w inżynierii promptów dla generatorów grafiki i wideo:
 * Nano Banana, Liblib/OmniGen, Midjourney, Flux.1 Pro, Kling AI, Runway Gen-3, Google Vids, Google Flow.
 * 
 * Bezwzględna zasada: Generuje prompty w 100% naturalnym, plastycznym, bogatym języku POLSKIM
 * z profesjonalną terminologią oświetlenia, optyki, kompozycji i dynamiki filmowej.
 */
class PromptDirectorService {

    /**
     * Generuje zestaw specjalistycznych promptów produkcyjnych dla danej kreacji / produktu
     */
    async generateProductionPrompts({ brief, brandProfile = {}, productData = {}, angle = null }) {
        const prodName = productData.name || brandProfile.name || brief.productName || 'Produkt';
        const brandName = brandProfile.name || productData.brand?.name || 'Marka';
        const usp = brandProfile.usp || productData.features || brief.subheadline || 'Wysoka jakość i skuteczność';
        const headline = brief.headline || 'Przełomowe rozwiązanie';
        const visualAction = brief.visual_prompt || brief.visual_action || '';
        const scenesContext = Array.isArray(brief.scenes) 
            ? brief.scenes.map(s => `${s.timestamp}: ${s.onscreen_text} (${s.visual_action})`).join(' | ')
            : '';

        const systemPrompt = `Jesteś światowej klasy Dyrektorem Kreatywnym AI (Prompt Director & Cinematographer) wyspecjalizowanym w pisaniu promptów dla wiodących generatorów obrazu i wideo: Nano Banana, Liblib AI / OmniGen, Flux.1, Midjourney v6, Kling AI, Runway Gen-3, Google Vids oraz Google Flow.

TWOJE ZADANIE:
Na podstawie poniższych danych briefu marketingowego stwórz 5 hiper-szczegółowych, profesjonalnych promptów produkcyjnych.
Użytkownik skopiuje Twój prompt i wklei go bezpośrednio do Nano Banana, OmniGen, Klinga, Google Vids lub Google Flow, aby od razu wygenerować bezbłędny, fotorealistyczny materiał komercyjny.

KRYTYCZNE WYMAGANIE JĘZYKOWE:
Każdy prompt MUSI być napisany w 100% w bogatym, plastycznym, profesjonalnym języku POLSKIM!
Nie używaj ogólników typu "piękny produkt, 8k". Stosuj precyzyjny żargon fotografii komercyjnej i kinematografii w języku polskim:
- Oświetlenie: oświetlenie kluczowe softbox 45 stopni, subtelne tylne światło konturowe (rim light), odbicia fresnelowskie, miękkie cienie dyfuzyjne.
- Optyka: obiektyw portretowy 85mm f/1.4 lub makro 100mm, płytka głębia ostrości (bokeh), krystaliczna ostrość na detalach produktu i etykiety.
- Kompozycja: złoty podział, perspektywa z poziomu oczu lub delikatny żabi kąt, luksusowe podłoże (marmur, matowe szkło, naturalny kamień, krople rosy).
- Ruch kamery (dla wideo): powolny najazd typu push-in / dolly-forward, płynny orbitalny obrót kamery 360 stopni wokół produktu, dynamiczne slow-motion 60fps, profesjonalny grading barwny w palecie teal & orange lub pastel luxury.

DANE WEJŚCIOWE:
- Produkt: ${prodName}
- Marka: ${brandName}
- Główna obietnica / USP: ${usp}
- Nagłówek reklamowy: "${headline}"
${visualAction ? `- Sugestia wizualna z briefu: ${visualAction}` : ''}
${scenesContext ? `- Scenopis Reels: ${scenesContext}` : ''}
${angle ? `- Kąt perswazji: ${angle}` : ''}

Zwróć odpowiedź w formacie JSON z dokładnie 5 wyspecjalizowanymi promptami:
1. "nano_banana_packshot": Komercyjna fotografia studyjna packshotu produktu (Nano Banana / Flux.1 / Midjourney).
2. "omni_rich_content": Karta produktu / Rich Content A+ dla e-commerce pokazująca produkt w kontekście użycia lub składników (OmniGen / Liblib).
3. "reels_video_flow": Dynamiczny prompt wideo dla Google Flow / Kling AI / Runway (pionowy kadr 9:16, ruch kamery, światło, animacja efektu produktu).
4. "story_tiktok_viral": Żywy, natywny kadr social-media TikTok/Story (autentyczny styl UGC lub dynamiczny commercial look 9:16).
5. "macro_details": Ultra-zbliżenie makro na fakturę, formułę, krople, etykietę lub technologiczny detal produktu.

Zwróć WYŁĄCZNIE obiekt JSON w formacie:
\`\`\`json
{
  "nano_banana_packshot": "...",
  "omni_rich_content": "...",
  "reels_video_flow": "...",
  "story_tiktok_viral": "...",
  "macro_details": "..."
}
\`\`\``;

        const ai = getAi();
        if (ai) {
            try {
                const resp = await ai.models.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: systemPrompt,
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
                console.warn('[PromptDirectorService] Błąd generowania promptów przez Gemini Flash:', err.message);
            }
        }

        // Fallback deterministyczny w bogatym języku polskim
        return this._deterministicFallbackPrompts(prodName, brandName, usp, headline);
    }

    /**
     * Wzbogaca całą tablicę briefów o dedykowane prompty produkcyjne w 100% po polsku
     */
    async enrichBriefsWithPrompts(briefs = [], brandProfile = {}, productData = {}, angles = []) {
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
                    angle: angleName
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
                return {
                    ...brief,
                    production_prompts: this._deterministicFallbackPrompts(prodName, brandName, usp, headline)
                };
            }
        }));

        return enriched;
    }

    _deterministicFallbackPrompts(prodName, brandName, usp, headline) {
        return {
            nano_banana_packshot: `Profesjonalna fotografia produktowa e-commerce dla ${prodName} marki ${brandName}. Produkt stoi centralnie na matowym, grafitowym postumencie z naturalnego kamienia. Oświetlenie studyjne trzypunktowe: miękkie światło kluczowe z lewej strony, delikatne oświetlenie konturowe typu rim light w chłodnym odcieniu błękitu, subtelne cienie kontaktowe na podłożu. Krystalicznie czysta ostrość na etykiecie i bryle opakowania, obiektyw 90mm makro, f/2.8, płytka głębia ostrości z eleganckim rozmyciem tła w odcieniach głębokiego granatu i antracytu. Atmosfera luksusu, czystości i komercyjnego prestiżu.`,
            
            omni_rich_content: `Karta wizualna Rich Content A+ dla ${prodName}. Kompozycja pod kątem 45 stopni ukazująca opakowanie produktu w otoczeniu naturalnych, świeżych elementów odzwierciedlających właściwości: ${usp}. W tle subtelne cząsteczki świetlne i delikatne krople wody na matowej tafli szkła. Ciepłe, poranne światło słoneczne wpadające pod kątem, miękkie przejścia tonalne, realistyczne tekstury materiałów, studyjna jakość katalogowa, bez zniekształceń, proporcje 1:1, styl nowoczesnego e-commerce premium.`,
            
            reels_video_flow: `Dynamiczny spot wideo w formacie pionowym 9:16 dla platformy TikTok i Instagram Reels. Płynny najazd kamery typu dolly-in w kierunku ${prodName}. Kamera wykonuje subtelny obrót o 20 stopni, odsłaniając lśniące detale etykiety i obietnicę: "${headline}". Oświetlenie kinowe z dynamicznymi refleksami światła neonowego przesuwającymi się po krawędziach butelki. W tle płynne, powolne cząsteczki mgiełki w zwolnionym tempie 60fps. Głęboki kontrast, profesjonalna gradacja barwna w stylu nowoczesnej reklamy high-tech.`,
            
            story_tiktok_viral: `Natywny, angażujący kadr wideo 9:16 w estetyce nowoczesnego UGC na TikToka. Produkt ${prodName} prezentowany na jasnym, minimalistycznym blacie z naturalnego jasnego dębu w nowoczesnym, nasłonecznionym wnętrzu. Autentyczne, miękkie światło dzienne z bocznego okna, naturalne refleksy, dynamiczna kompozycja przyciągająca wzrok w pierwszych 2 sekundach. W kadrze widoczna świeżość, lekkość i bezpretensjonalny luksus codziennego użytkowania.`,
            
            macro_details: `Zbliżenie makro ekstremalne (extreme close-up) na fakturę opakowania i aplikator produktu ${prodName}. Ostrość igłowa na mikroskopijnych detalach tłoczenia logo ${brandName}, pojedynczych lśniących kroplach rosy osadzonych na chłodnej powierzchni tworzywa. Obiektyw 100mm f/1.8 macro, głębia ostrości zaledwie kilku milimetrów, zmysłowa gra światła i cienia, perfekcyjna czystość laboratoryjna.`
        };
    }
}

module.exports = new PromptDirectorService();
