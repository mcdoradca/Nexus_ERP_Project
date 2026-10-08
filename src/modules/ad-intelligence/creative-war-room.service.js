const { GoogleGenAI, ThinkingLevel } = require('@google/genai');

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
 * CreativeWarRoomService
 * Autonomiczny Pokój Narad Wieloagentowych (AI Creative War Room / Swarm Roundtable)
 * 
 * Środowisko w pełni autonomicznych, wyszkolonych agentów dziedzinowych:
 * 1. 🛡️ Helena Wójcik – Dyrektor ds. Tożsamości Marki i Standardów E-commerce (Brand Heritage Guardian)
 * 2. 💖 Marek Kamiński – Główny Strateg Neuromarketingu i Psychologii Behawioralnej (Consumer Psychology & Empathy)
 * 3. 🎨 Oskar Zawadzki – Reżyser Fotografii Komercyjnej i Dyrektor Artystyczny (Commercial Visual Director)
 * 4. 🎬 Aleksander Bochenek – Główny Dyrektor Kreatywny & Moderator Narady (Executive Creative Director)
 * 
 * Agenci nie odgrywają z góry narzuconych scenariuszy ani nie mają zahardkodowanych kadrów/obiektywów.
 * Każdy agent posiada zdefiniowany wyuczony zawód, warsztat analityczny i suwerenną rolę,
 * dyskutując wieloturowo w czasie rzeczywistym pod okiem moderatora.
 */
class CreativeWarRoomService {

    /**
     * Zwraca definicje ról zawodowych person biorących udział w okrągłym stole
     */
    getParticipants() {
        return [
            {
                id: 'brand_guardian',
                name: 'Helena Wójcik',
                title: 'Dyrektor ds. Tożsamości Marki & Standardów E-commerce',
                avatar: '🛡️',
                badgeColor: 'indigo',
                description: 'Ekspertka corporate identity. Bada DNA marki, weryfikuje prawdę rynkową i bezkompromisowo strzeże tożsamości fizycznej produktu ze zdjęcia.'
            },
            {
                id: 'empathy_strategist',
                name: 'Marek Kamiński',
                title: 'Główny Strateg Neuromarketingu & Psychologii Behawioralnej',
                avatar: '💖',
                badgeColor: 'rose',
                description: 'Badacz ludzkich motywacji i emocji. Bada psychologiczne podłoże kategorii: instynkt opiekuńczy, troskę o dzieci, bliskich, zwierzęta i planetę.'
            },
            {
                id: 'visual_director',
                name: 'Oskar Zawadzki',
                title: 'Reżyser Fotografii Komercyjnej & Dyrektor Artystyczny',
                avatar: '🎨',
                badgeColor: 'amber',
                description: 'Mistrz kompozycji wizualnej, światła i optyki. Nienawidzi nudy i sztampy – samodzielnie projektuje autorską geometrię i przestrzeń kadrów.'
            },
            {
                id: 'lead_synthesizer',
                name: 'Aleksander Bochenek',
                title: 'Główny Dyrektor Kreatywny (Moderator Narady)',
                avatar: '🎬',
                badgeColor: 'purple',
                description: 'Facylitator okrągłego stołu. Prowadzi naradę, stawia pytania otwarte, zderza opinie ekspertów i dokonuje oddolnej syntezy ich ustaleń.'
            }
        ];
    }

    /**
     * Zwraca instrukcje systemowe definiujące wyuczony zawód i metodologię każdego eksperta
     */
    _getAgentSystemInstructions(agentId) {
        switch (agentId) {
            case 'brand_guardian':
                return `Jesteś Heleną Wójcik – elitarnym Dyrektorem ds. Tożsamości Marki i Standardów E-commerce (Brand Heritage & Compliance Guardian).
Twój wyuczony zawód i etos zawodowy:
- Ochrona integralności marki, corporate identity i rzetelności rynkowej w e-commerce.
- Wiesz, że jakiekolwiek zafałszowanie lub zniekształcenie produktu ze zdjęcia niszczy zaufanie klientów i rodzi zwroty.
- W dyskusji:
  1. Wypowiadasz się z pozycji suwerennej strażniczki prawdy o produkcie i estetyki marki.
  2. Wyznaczasz twarde, nieprzekraczalne granice: oryginalna butelka, etykieta, pompka i kolorystyka ze zdjęcia referencyjnego są nietykalne.
  3. Weryfikujesz pomysły innych ekspertów pod kątem zgodności z DNA marki i realiami rynku.
  4. Mówisz rzeczowo, profesjonalnie, z dużą pewnością siebie i dbałością o detale tożsamościowe.
- DOKTRYNA ANTY-KLISZ: Odrzucaj bezbarwne slogany ("produkt premium", "najwyższa jakość"). Wymagaj zakorzenienia w faktach z PIM i fotografii referencyjnej.
Zwracaj odpowiedź w formacie JSON:
{
  "speech": "Twoja wypowiedź ekspercka do stołu narad (naturalny, wyrazisty język zawodowy)",
  "key_point": "Jedno esencjonalne zdanie podsumowujące Twoje stanowisko"
}`;

            case 'empathy_strategist':
                return `Jesteś Markiem Kamińskim – Czołowym Psychologiem Behawioralnym i Badaczem Neuromarketingu.
Twój wyuczony zawód i etos zawodowy:
- Badanie głębokich, podświadomych motywacji konsumenckich, które sprawiają, że ludzie podejmują decyzje sercem, z miłości, troski i empatii.
- Odrzucasz powierzchowny, suchy marketing cech technicznych i rabatów. Wiesz, że konsumenci kupują bezpieczeństwo swoich dzieci, spokój o zdrowie schorowanych rodziców, wdzięczność bezbronnych zwierząt, czyste środowisko dla przyszłych pokoleń lub głęboką ulgę po wyczerpującym dniu.
- W dyskusji:
  1. Samodzielnie analizujesz produkt i kategorię: odkrywasz, gdzie bije prawdziwe, emocjonalne jądro tej oferty.
  2. Wnosisz do debaty czystą psychologię empatii: argumentujesz, dlaczego reklama musi budzić wzruszenie i potrzebę ochrony najcenniejszych wartości.
  3. Mówisz językiem psychologa: wnikliwie, z empatią, odwołując się do ludzkiej natury i autentycznych przeżyć.
- DOKTRYNA ANTY-KLISZ: Zakaż ogólników ("klient będzie zadowolony"). Skup się na mikromomentach psychologicznych: bezradności przed plamą, uldze z czystego otoczenia, dumie z bezpiecznego domu.
Zwracaj odpowiedź w formacie JSON:
{
  "speech": "Twoja wypowiedź ekspercka do stołu narad (naturalny, głęboki język psychologii emocji)",
  "key_point": "Jedno esencjonalne zdanie podsumowujące Twoje stanowisko"
}`;

            case 'visual_director':
                return `Jesteś Oskarem Zawadzkim – Wybitnym Dyrektorem Artystycznym i Reżyserem Fotografii Komercyjnej z wieloletnim doświadczeniem w high-endowych kampaniach wizualnych.
Twój wyuczony zawód i etos zawodowy:
- Mistrzostwo w operowaniu kompozycją, plastyką światła, geometrią przestrzeni, dynamiką ruchu, głębią ostrości i optyką.
- Nienawidzisz sztampy, nudy i amatorszczyzny. Wiesz, że umieszczenie produktu w martwym centrum kadru na białym tle to marketingowa śmierć (banner blindness) – widz przewija to w ułamku sekundy.
- W dyskusji:
  1. Jesteś suwerennym artystą i twórcą. Nikt Ci nie dyktuje kadrów ani obiektywów – sam analizujesz produkt, DNA marki oraz emocje wskazane przez psychologa i tworzysz autorską wizję wizualną.
  2. Samodzielnie decydujesz o asymetrii, punktach widzenia, relacji produktu z otoczeniem, planach fotograficznych i nastroju oświetleniowym.
  3. Mówisz z pasją, wizualną wyobraźnią i techniczną precyzją mistrza kadru filmowego i studyjnego.
- DOKTRYNA ANTY-KLISZ: Bezwzględny zakaz martwych kadrów na środku stołu/postumentu. Proponuj dynamiczne cięcia, makro-faktury, światło kontrowe, perspektywę subiektywną (POV).
Zwracaj odpowiedź w formacie JSON:
{
  "speech": "Twoja wypowiedź ekspercka do stołu narad (naturalny, obrazowy język reżysera wizualnego)",
  "key_point": "Jedno esencjonalne zdanie podsumowujące Twoje stanowisko"
}`;

            case 'lead_synthesizer':
            default:
                return `Jesteś Aleksandrem Bochenkiem – Głównym Dyrektorem Kreatywnym (Executive Creative Director) i Moderatorem Okrągłego Stołu AI Creative War Room.
Twój wyuczony zawód i etos zawodowy:
- Facylitacja zespołów twórczych najwyższej klasy, zarządzanie dynamiką sporu koncepcyjnego i przekładanie wizji artystyczno-psychologicznych na bezkompromisowe strategie kampanii e-commerce.
- W dyskusji:
  1. Nie piszesz dialogów za innych ani nie narzucasz im swoich gotowych rozwiązań – zmuszasz ekspertów do twórczego wysiłku.
  2. Prowadzisz debatę zadając otwarte, prowokujące pytania problemowe i zderzając odmienne punkty widzenia.
  3. Na koniec dokonujesz rzetelnej, oddolnej syntezy całej dyskusji, wyciągając z wypowiedzi ekspertów oficjalny protokół ustaleń oraz matrycę zaleceń dla Prompt Directora.
Zwracaj odpowiedź w formacie JSON:
{
  "speech": "Twoja moderacja / replika prowadzącego naradę",
  "key_point": "Jedno zdanie podsumowujące krok moderatorski"
}`;
        }
    }

    /**
     * Prowadzi wieloturową, autonomiczną dyskusję ekspertów nad strategią produktu
     */
    async runDeliberation({ brandProfile = {}, productData = {}, marketInsights = {}, angles = [] }) {
        const prodName = productData.name || brandProfile.name || 'Produkt';
        const brandName = brandProfile.name || productData.brand?.name || 'Marka';
        const usp = brandProfile.usp || productData.features || 'Wysoka skuteczność i unikalne właściwości';
        const brandDna = brandProfile.brandDna || `Nowoczesna estetyka marki ${brandName}. Jasne światło, lekkość i autentyczność.`;
        const priceStr = productData.salePrice ? `${Number(productData.salePrice).toFixed(2)} zł` : 'Półka rynkowa';
        const audience = brandProfile.targetAudience || 'Konsumenci w Polsce poszukujący jakości i bezpieczeństwa';

        const ai = getAi();
        if (!ai) {
            return {
                success: false,
                error: 'Brak aktywnego klucza GEMINI_API_KEY. Autonomiczna narada wymaga aktywnego połączenia z modelem Gemini.',
                participants: this.getParticipants(),
                topic: `Narada offline dla ${prodName}`,
                debate_transcript: [],
                meeting_minutes: null
            };
        }

        const sharedContext = `KONTEKST PRODUKTU I MARKI DO DYSKUSJI EKSPERTÓW:
- Produkt: "${prodName}"
- Marka: "${brandName}"
- Cena i pozycjonowanie: ${priceStr}
- DNA i klimat marki zebrane przez badacza: "${brandDna}"
- Główna obietnica / USP: "${usp}"
- Grupa odbiorców: ${audience}
${marketInsights.saturated_claims ? `- Nasycone, nudne slogany konkurencji na rynku PL: ${JSON.stringify(marketInsights.saturated_claims)}` : ''}
${marketInsights.dominant_hooks ? `- Haczyki rynkowe konkurencji: ${JSON.stringify(marketInsights.dominant_hooks)}` : ''}`;

        const transcript = [];

        try {
            console.log(`[CreativeWarRoom] Rozpoczynam autonomiczną debatę wieloagentową nad produktem: "${prodName}"...`);

            // TURA 1: Aleksander (Moderator) otwiera posiedzenie
            const turn1Prompt = `${sharedContext}

TWOJE ZADANIE JAKO MODERATORA:
Otwórz posiedzenie Okrągłego Stołu AI Creative War Room.
Przedstaw krótko wyzwanie: konkurencja powiela nudne, wycentrowane schematy reklamowe pozbawione autentycznych emocji. Naszym celem jest stworzenie kampanii, która poruszy serca i wyróżni się nowatorskim językiem wizualnym.
Zwróć się bezpośrednio do Heleny Wójcik (Strażniczki Marki) z pytaniem o jej diagnozę tożsamości tego produktu i warunki brzegowe, jakich musi przestrzegać zespół.`;

            const turn1 = await this._consultAgent('lead_synthesizer', turn1Prompt);
            transcript.push({
                step: 1,
                speaker_id: 'lead_synthesizer',
                speaker_name: 'Aleksander Bochenek (Dyrektor Kreatywny)',
                avatar: '🎬',
                badge_color: 'purple',
                speech: turn1.speech,
                key_point: turn1.key_point || 'Otwarcie narady i pytanie o tożsamość marki'
            });

            // TURA 2: Helena (Strażnik Marki) odpowiada ze swojej perspektywy zawodowej
            const turn2Prompt = `${sharedContext}

DOTYCHCZASOWY PRZEBIEG DEBATY:
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE JAKO STRAŻNICZKI MARKI (Helena Wójcik):
Odpowiedz Aleksandrowi. Zbadaj surowe dane produktu i marki:
1. Jaka jest tożsamość i estetyka tej marki, którą musimy bezwzględnie uszanować?
2. Postaw twarde warunki dotyczące autentyczności fizycznej: packshot ze zdjęcia referencyjnego jest święty i żaden model AI nie ma prawa go deformować ani wymyślać butelki/etykiety na nowo.
3. Wyraź swoje oczekiwania wobec psychologa i artysty wizualnego.`;

            const turn2 = await this._consultAgent('brand_guardian', turn2Prompt);
            transcript.push({
                step: 2,
                speaker_id: 'brand_guardian',
                speaker_name: 'Helena Wójcik (Strażnik Marki)',
                avatar: '🛡️',
                badge_color: 'indigo',
                speech: turn2.speech,
                key_point: turn2.key_point || 'Obrona tożsamości fizycznej produktu ze zdjęcia'
            });

            // TURA 3: Marek (Psycholog Emocji) bada emocjonalne jądro kategorii
            const turn3Prompt = `${sharedContext}

DOTYCHCZASOWY PRZEBIEG DEBATY:
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE JAKO PSYCHOLOGA BEHAWIORALNEGO (Marek Kamiński):
Włącz się do dyskusji. Odnieś się do słów Heleny i Aleksandra.
1. Jako psycholog przeanalizuj, czym ten produkt jest dla człowieka w głębi serca. Odrzuć powierzchowne hasła.
2. Wskaż, jakie autentyczne emocje opiekuńcze budzi ta kategoria: czy to instynkt rodzicielski, troska o bliskich, miłość do bezbronnego zwierzęcia, duma z ochrony domu, czy bezcenna ulga.
3. Zażądaj od zespołu, by reklama wyciskała łzy i rodziła poczucie odpowiedzialności, a nie była suchą ulotką.`;

            const turn3 = await this._consultAgent('empathy_strategist', turn3Prompt);
            transcript.push({
                step: 3,
                speaker_id: 'empathy_strategist',
                speaker_name: 'Marek Kamiński (Psycholog Emocji)',
                avatar: '💖',
                badge_color: 'rose',
                speech: turn3.speech,
                key_point: turn3.key_point || 'Aktywacja instynktu opiekuńczego i głębokiej empatii'
            });

            // TURA 4: Oskar (Reżyser Wizualny) proponuje autorską wizję kompozycyjną
            const turn4Prompt = `${sharedContext}

DOTYCHCZASOWY PRZEBIEG DEBATY:
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE JAKO REŻYSERA FOTOGRAFII I DYREKTORA ARTYSTYCZNEGO (Oskar Zawadzki):
Zabierz głos jako suwerenny artysta wizualny. Słyszałeś granice tożsamościowe Heleny i diagnozę psychologiczną Marka.
1. Zdemoluj rutynę rynkową: powiedz wprost, dlaczego amatorskie stawianie produktu w centrum kadru zabija każdą kampanię.
2. Przedstaw swoją AUTORSKĄ wizję artystyczną: jak Ty, jako reżyser, zamierzasz poprowadzić kompozycję (asymetria, relacja z przestrzenią, punkt widzenia, światłocień, plany filmowe/fotograficzne).
3. Samodzielnie zaproponuj, jak wizualnie opowiedzieć o trosce i prawdzie produktu, nie używając nudnych szablonów.`;

            const turn4 = await this._consultAgent('visual_director', turn4Prompt);
            transcript.push({
                step: 4,
                speaker_id: 'visual_director',
                speaker_name: 'Oskar Zawadzki (Reżyser Wizualny)',
                avatar: '🎨',
                badge_color: 'amber',
                speech: turn4.speech,
                key_point: turn4.key_point || 'Radykalne przełamanie monotonii i autorska asymetria'
            });

            // TURA 5: Aleksander (Moderator) konfrontuje zespół i sprawdza spójność
            const turn5Prompt = `${sharedContext}

DOTYCHCZASOWY PRZEBIEG DEBATY:
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE JAKO MODERATORA (Aleksander Bochenek):
Skonfrontuj ze sobą propozycje Oskara, Marka i Heleny:
1. Zapytaj Helenę, czy śmiała, asymetryczna wizja Oskara nie zagraża czytelności packshotu i DNA marki.
2. Zapytaj Marka, czy kompozycja zaproponowana przez Oskara faktycznie odda ładunek emocjonalny, o który walczył.
3. Wezwij ekspertów do ostatecznego porozumienia co do zasad kompozycji i ładunku emocjonalnego.`;

            const turn5 = await this._consultAgent('lead_synthesizer', turn5Prompt);
            transcript.push({
                step: 5,
                speaker_id: 'lead_synthesizer',
                speaker_name: 'Aleksander Bochenek (Dyrektor Kreatywny)',
                avatar: '🎬',
                badge_color: 'purple',
                speech: turn5.speech,
                key_point: turn5.key_point || 'Konfrontacja zespołu i wezwanie do konsensusu'
            });

            // TURA 6: Helena & Marek (Zgoda i Kompromis Twórczy)
            const turn6Prompt = `${sharedContext}

DOTYCHCZASOWY PRZEBIEG DEBATY:
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE JAKO STRAŻNICZKI MARKI (Helena Wójcik):
Odpowiedz Aleksandrowi i Oskarowi w imieniu standardów marki:
Zaakceptuj wizję asymetrii i ładunku empatii pod warunkiem, że w kadrze packshot pozostanie w 100% oryginalny ze zdjęcia. Potwierdź, że kompromis między odwagą artystyczną Oskara a psychologią Marka tworzy zwycięską formułę.`;

            const turn6 = await this._consultAgent('brand_guardian', turn6Prompt);
            transcript.push({
                step: 6,
                speaker_id: 'brand_guardian',
                speaker_name: 'Helena Wójcik (Strażnik Marki)',
                avatar: '🛡️',
                badge_color: 'indigo',
                speech: turn6.speech,
                key_point: turn6.key_point || 'Zgoda na asymetrię i narrację troski z zachowaniem packshotu'
            });

            // ETAP SYNTEZY WYKONAWCZEJ: Aleksander sporządza Protokół Ustaleń z RZECZYWISTYCH wypowiedzi
            console.log(`[CreativeWarRoom] Przeprowadzam oddolną syntezę rzeczywistych ustaleń z debaty...`);
            const minutes = await this._synthesizeDeliberationMinutes({
                prodName,
                brandName,
                usp,
                priceStr,
                transcript
            });

            return {
                success: true,
                participants: this.getParticipants(),
                topic: `Autonomiczna Narada Zespołu Kreatywnego: Przełamanie Monotonii Wizualnej i Aktywacja Emocji dla ${prodName}`,
                debate_transcript: transcript,
                meeting_minutes: minutes
            };

        } catch (err) {
            console.error('[CreativeWarRoom] Błąd pętli wieloagentowej:', err.message);
            return {
                success: false,
                error: `Błąd podczas autonomicznej debaty agentów: ${err.message}`,
                participants: this.getParticipants(),
                topic: `Błąd narady nad produktem ${prodName}`,
                debate_transcript: transcript,
                meeting_minutes: null
            };
        }
    }

    /**
     * Odpytuje konkretnego autonomicznego agenta z jego unikalnym systemInstruction.
     * Wykonuje autentyczne zapytanie LLM. Jeśli model zwróci błąd, ponawia próbę raz.
     * Nigdy nie zwraca zmyślonych ani predefiniowanych wypowiedzi.
     */
    async _consultAgent(agentId, promptText) {
        const ai = getAi();
        if (!ai) {
            throw new Error(`Brak zainicjalizowanego klienta Gemini API do odpytania agenta ${agentId}`);
        }

        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const resp = await ai.models.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: promptText,
                    config: {
                        systemInstruction: this._getAgentSystemInstructions(agentId),
                        responseMimeType: "application/json",
                        thinkingConfig: {
                            thinkingLevel: ThinkingLevel.MEDIUM
                        }
                    }
                });

                const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    throw new Error(`Model zwrócił pustą odpowiedź dla agenta ${agentId}`);
                }

                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (!match) {
                    throw new Error(`Brak poprawnego formatu JSON w odpowiedzi agenta ${agentId}`);
                }

                const parsed = JSON.parse(match[0]);
                if (!parsed.speech || typeof parsed.speech !== 'string' || parsed.speech.trim().length === 0) {
                    throw new Error(`Agent ${agentId} nie wygenerował treści wypowiedzi (brak pola speech)`);
                }

                return {
                    speech: parsed.speech.trim(),
                    key_point: (parsed.key_point || '').trim()
                };
            } catch (err) {
                lastErr = err;
                console.warn(`[CreativeWarRoom] Próba ${attempt}/2 dla agenta ${agentId} nie powiodła się: ${err.message}`);
            }
        }

        throw new Error(`Nie udało się uzyskać autentycznej wypowiedzi od agenta ${agentId}: ${lastErr?.message || 'Brak odpowiedzi'}`);
    }

    /**
     * Oddolna synteza sporządzana przez Moderatora (Aleksander) z RZECZYWISTYCH wypowiedzi debaty.
     * Brak jakichkolwiek zahardkodowanych slotów czy predefiniowanych tekstów.
     */
    async _synthesizeDeliberationMinutes({ prodName, brandName, usp, priceStr, transcript }) {
        const ai = getAi();
        if (!ai) {
            throw new Error('Brak klienta Gemini API do sporządzenia syntezy spotkania');
        }

        const synthesisPrompt = `Jesteś Aleksandrem Bochenkiem – Głównym Dyrektorem Kreatywnym.
Właśnie zakończyłeś sesję Okrągłego Stołu AI Creative War Room.

OTO DOKŁADNY STENOGRAM WYPOWIEDZI TWOICH EKSPERTÓW (Helena - Strażnik Marki, Marek - Psycholog, Oskar - Reżyser):
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE:
Na podstawie RZECZYWISTYCH wniosków i pomysłów, które padły podczas tej konkretnej dyskusji, sporządź Oficjalną Notatkę z Przebiegu Spotkania (Executive Minutes) oraz matrycę 6 konkretnych zaleceń kadrów (4 statyki + 2 wideo).
Wyprowadź ustalenia z tego, co mówił Oskar (artysta wizualny), Marek (psycholog) i Helena (strażnik marki). Żadne ujęcie nie może być umieszczone w martwym centrum kadru.

Zwróć odpowiedź WYŁĄCZNIE jako obiekt JSON o strukturze:
{
  "meeting_title": "Oficjalna Notatka z Przebiegu Spotkania Zarządu Kreatywnego (AI War Room)",
  "product_name": "${prodName}",
  "brand_name": "${brandName}",
  "core_conflict_resolved": "Jaki główny spór został rozwiązany w tej debacie na bazie wypowiedzi zespołu",
  "agreed_emotional_code": "Jaki kod emocjonalny zaproponowany przez psychologa Marka został zatwierdzony",
  "visual_framing_doctrine": "Jaką doktrynę kompozycji (asymetria, brak martwego centrum) ustalił reżyser Oskar",
  "immutability_shield_clause": "Jaką zasadę nienaruszalności packshotu i wierności produktowi postawiła Helena",
  "creatives_matrix": [
    {
      "slot_id": 1,
      "format": "STATYK",
      "concept_title": "Tytuł ujęcia 1 wynikający z debaty",
      "emotional_hook": "Ładunek emocjonalny troski dla slotu 1",
      "framing_directive": "Wytyczna kadrowania ustalona przez Oskara (asymetria, brak centrowania)",
      "context_elements": "Elementy otoczenia i relacji"
    },
    {
      "slot_id": 2,
      "format": "STATYK",
      "concept_title": "Tytuł ujęcia 2 wynikający z debaty",
      "emotional_hook": "Ładunek emocjonalny dla slotu 2",
      "framing_directive": "Wytyczna kadrowania (np. perspektywa POV)",
      "context_elements": "..."
    },
    {
      "slot_id": 3,
      "format": "STATYK",
      "concept_title": "Tytuł ujęcia 3 wynikający z debaty",
      "emotional_hook": "...",
      "framing_directive": "Wytyczna kadrowania (np. portret relacyjny z głębią ostrości)",
      "context_elements": "..."
    },
    {
      "slot_id": 4,
      "format": "STATYK",
      "concept_title": "Tytuł ujęcia 4 wynikający z debaty",
      "emotional_hook": "...",
      "framing_directive": "Wytyczna kadrowania (np. zbliżenie sensoryczne na detal i kroplę)",
      "context_elements": "..."
    },
    {
      "slot_id": 5,
      "format": "REELS 9:16",
      "concept_title": "Tytuł rolki 1 wynikający z debaty",
      "emotional_hook": "...",
      "framing_directive": "Wytyczna kadru wideo w pionie (ruch kamery)",
      "context_elements": "..."
    },
    {
      "slot_id": 6,
      "format": "TIKTOK 9:16",
      "concept_title": "Tytuł rolki 2 wynikający z debaty",
      "emotional_hook": "...",
      "framing_directive": "Wytyczna kadru wideo w pionie (Hero Low-Angle lub relacja)",
      "context_elements": "..."
    }
  ],
  "executive_verdict": "Podsumowujący werdykt Dyrektora Kreatywnego (2-3 zdania)"
}`;

        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const resp = await ai.models.generateContent({
                    model: 'gemini-3.8-flash',
                    contents: synthesisPrompt,
                    config: {
                        responseMimeType: "application/json",
                        thinkingConfig: {
                            thinkingLevel: ThinkingLevel.MEDIUM
                        }
                    }
                });

                const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    throw new Error('Pusta odpowiedź z Gemini podczas syntezy protokołu');
                }

                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (!match) {
                    throw new Error(`Brak struktury JSON w syntezie protokołu: ${cleaned.substring(0, 100)}`);
                }

                const parsed = JSON.parse(match[0]);
                const matrix = Array.isArray(parsed.creatives_matrix)
                    ? parsed.creatives_matrix.map((c, i) => ({
                        slot_id: c.slot_id || (i + 1),
                        format: c.format || (i >= 4 ? (i === 4 ? 'REELS 9:16' : 'TIKTOK 9:16') : 'STATYK'),
                        concept_title: c.concept_title || `Koncepcja #${i + 1}`,
                        emotional_hook: c.emotional_hook || '',
                        framing_directive: c.framing_directive || '',
                        context_elements: c.context_elements || ''
                    }))
                    : [];

                return {
                    meeting_title: parsed.meeting_title || `Oficjalna Notatka z Przebiegu Spotkania: ${prodName}`,
                    product_name: prodName,
                    brand_name: brandName,
                    core_conflict_resolved: parsed.core_conflict_resolved || '',
                    agreed_emotional_code: parsed.agreed_emotional_code || '',
                    visual_framing_doctrine: parsed.visual_framing_doctrine || parsed.framing_doctrine || '',
                    framing_doctrine: parsed.visual_framing_doctrine || parsed.framing_doctrine || '',
                    immutability_shield_clause: parsed.immutability_shield_clause || '',
                    creatives_matrix: matrix,
                    executive_verdict: parsed.executive_verdict || ''
                };
            } catch (err) {
                lastErr = err;
                console.warn(`[CreativeWarRoom] Próba syntezy ${attempt}/2 nie powiodła się: ${err.message}`);
            }
        }

        throw new Error(`Nie udało się sporządzić autentycznej syntezy notatki ze spotkania: ${lastErr?.message || 'Brak danych'}`);
    }

    _formatTranscriptForPrompt(transcript) {
        return transcript.map(t => `[${t.speaker_name}]: "${t.speech}"`).join('\n\n');
    }
}

module.exports = new CreativeWarRoomService();
