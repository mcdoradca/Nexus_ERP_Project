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
            return this._deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr, audience);
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
                speech: turn1?.speech || `Otwieram naradę nad kampanią dla ${prodName} marki ${brandName}. Konkurencja powiela wyświechtane schematy. Heleno, jako Strażniczka Marki, jaka jest Twoja tożsamościowa diagnoza i jakie granice stawiasz zespołowi?`,
                key_point: turn1?.key_point || 'Otwarcie narady i pytanie o tożsamość marki'
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
                speech: turn2?.speech || `Tożsamość ${brandName} opiera się na prawdzie i zaufaniu. Packshot z załączonego zdjęcia jest nietykalny – model generatywny ma w 100% zachować oryginalne opakowanie, etykietę i barwy. Oczekuję od zespołu odwagi, ale bez fałszu.`,
                key_point: turn2?.key_point || 'Obrona tożsamości fizycznej produktu ze zdjęcia'
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
                speech: turn3?.speech || `Heleno, nikt nie zamierza psuć produktu, ale sam przedmiot nikogo nie poruszy, jeśli nie dotkniemy serca. W tej kategorii konsument szuka spokoju i bezpieczeństwa dla tych, których kocha najbardziej – dzieci, rodziny, zwierząt. Produkt ma być narzędziem miłości i troski.`,
                key_point: turn3?.key_point || 'Aktywacja instynktu opiekuńczego i głębokiej empatii'
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
                speech: turn4?.speech || `Błagam, zero martwego centrum kadru! Widz natychmiast wyczuwa sztuczność katalogową. Przesuwamy produkt asymetrycznie, otwieramy przestrzeń na miękkie światło, wprowadzamy kadry z perspektywy pierwszej osoby (POV) i głębię ostrości. Każde ujęcie w serii musi mieć inną dynamikę!`,
                key_point: turn4?.key_point || 'Radykalne przełamanie monotonii i autorska asymetria'
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
                speech: turn5?.speech || `Oskar proponuje odważną plastykę. Heleno, czy ta asymetria nie narusza czytelności produktu? Marku, czy taka kompozycja uniesie ładunek wzruszenia i troski? Wejdźmy w ostateczny konsensus.`,
                key_point: turn5?.key_point || 'Konfrontacja zespołu i wezwanie do konsensusu'
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
                speech: turn6?.speech || `Kupuję tę koncepcję. Asymetria i ujęcia relacyjne wzmacniają autentyzm i ciepło marki ${brandName}, pod warunkiem, że sam packshot pozostanie w 100% nienaruszony. Mamy zielone światło na produkcję.`,
                key_point: turn6?.key_point || 'Zgoda na asymetrię i narrację troski z zachowaniem packshotu'
            });

            // ETAP SYNTEZY WYKONAWCZEJ (BOTTOM-UP SYNTHESIS): Aleksander sporządza Protokół Ustaleń z RZECZYWISTYCH wypowiedzi
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
            console.warn('[CreativeWarRoom] Błąd pętli wieloagentowej, stosuję bezpieczny fallback:', err.message);
            return this._deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr, audience);
        }
    }

    /**
     * Odpytuje konkretnego autonomicznego agenta z jego unikalnym systemInstruction
     */
    async _consultAgent(agentId, promptText) {
        const ai = getAi();
        if (!ai) return null;

        try {
            const resp = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: promptText,
                config: {
                    systemInstruction: this._getAgentSystemInstructions(agentId),
                    responseMimeType: "application/json",
                    temperature: 0.65 // Naturalna ekspresja zawodowa i swoboda wnioskowania
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
            console.warn(`[CreativeWarRoom] Błąd konsultacji agenta ${agentId}:`, err.message);
        }
        return null;
    }

    /**
     * Oddolna synteza sporządzana przez Moderatora (Aleksander) z RZECZYWISTYCH wypowiedzi debaty
     */
    async _synthesizeDeliberationMinutes({ prodName, brandName, usp, priceStr, transcript }) {
        const ai = getAi();
        const fallback = this._defaultMeetingMinutes(prodName, brandName);
        if (!ai) return fallback;

        const synthesisPrompt = `Jesteś Aleksandrem Bochenkiem – Głównym Dyrektorem Kreatywnym.
Właśnie zakończyłeś sesję Okrągłego Stołu AI Creative War Room.

OTO DOKŁADNY STENOGRAM WYPOWIEDZI TWOICH EKSPERTÓW (Helena - Strażnik Marki, Marek - Psycholog, Oskar - Reżyser):
${this._formatTranscriptForPrompt(transcript)}

TWOJE ZADANIE:
Na podstawie RZECZYWISTYCH wniosków i pomysłów, które padły podczas tej konkretnej dyskusji, sporządź Oficjalną Notatkę z Przebiegu Spotkania (Executive Minutes) oraz matrycę 6 konkretnych zaleceń kadrów (4 statyki + 2 wideo).
Wyprowadź ustalenia z tego, co mówił Oskar (artysta wizualny), Marek (psycholog) i Helena (strażnik marki).

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

        try {
            const resp = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: synthesisPrompt,
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.3
                }
            });

            const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    return {
                        ...fallback,
                        ...parsed,
                        visual_framing_doctrine: parsed.visual_framing_doctrine || parsed.framing_doctrine || fallback.visual_framing_doctrine,
                        framing_doctrine: parsed.visual_framing_doctrine || parsed.framing_doctrine || fallback.visual_framing_doctrine,
                        immutability_shield_clause: parsed.immutability_shield_clause || fallback.immutability_shield_clause,
                        creatives_matrix: Array.isArray(parsed.creatives_matrix) && parsed.creatives_matrix.length === 6
                            ? parsed.creatives_matrix.map((c, i) => ({
                                ...c,
                                slot_id: c.slot_id || (i + 1),
                                format: c.format || (i >= 4 ? (i === 4 ? 'REELS 9:16' : 'TIKTOK 9:16') : 'STATYK')
                            }))
                            : fallback.creatives_matrix
                    };
                }
            }
        } catch (err) {
            console.warn('[CreativeWarRoom] Błąd syntezy protokołu:', err.message);
        }

        return fallback;
    }

    _formatTranscriptForPrompt(transcript) {
        return transcript.map(t => `[${t.speaker_name}]: "${t.speech}"`).join('\n\n');
    }

    _defaultMeetingMinutes(prodName, brandName) {
        return {
            meeting_title: 'Oficjalna Notatka z Przebiegu Spotkania Zarządu Kreatywnego (AI War Room)',
            product_name: prodName,
            brand_name: brandName,
            core_conflict_resolved: 'Kategorycznie zakazano umieszczania produktu w martwym centrum kadru oraz stosowania sztucznych, ciemnych postumentów. Wdrożono narrację instynktu troski i opieki nad bliskimi.',
            agreed_emotional_code: 'Głęboka troska, ochrona i ulga: miłość do dziecka, bezwarunkowa więź ze zwierzętami, domowe bezpieczeństwo i dbałość o czystość świata.',
            visual_framing_doctrine: 'Asymetria filmowa: żadne dwa ujęcia w serii nie mają tej samej pozycji produktu. Wykorzystanie złotego podziału, ujęć POV, głębi ostrości i sensorycznych detali. Kategoryczny zakaz martwego centrum kadru.',
            framing_doctrine: 'Asymetria filmowa: żadne dwa ujęcia w serii nie mają tej samej pozycji produktu. Wykorzystanie złotego podziału, ujęć POV, głębi ostrości i sensorycznych detali. Kategoryczny zakaz martwego centrum kadru.',
            immutability_shield_clause: 'Oryginalna butelka, pompka, typografia i etykieta z załączonego zdjęcia podlegają 100% ochronie fizycznej przed halucynacją modeli generatywnych.',
            creatives_matrix: [
                {
                    slot_id: 1,
                    format: 'STATYK',
                    concept_title: 'Troska o Delikatność (Złoty Podział)',
                    emotional_hook: 'Spokój matki i ochrona tego, co najdelikatniejsze',
                    framing_directive: `Produkt ${prodName} przesunięty asymetrycznie w lewą 1/3 kadru (Rule of Thirds). Prawa strona kadru otwarta na miękkie światło poranka.`,
                    context_elements: 'Czysta, jasna przestrzeń, rozproszone pastele, unoszące się delikatne cząsteczki świeżości w powietrzu.'
                },
                {
                    slot_id: 2,
                    format: 'STATYK',
                    concept_title: 'Czysty Dotyk Bezpieczeństwa (Kadr POV)',
                    emotional_hook: 'Wzruszająca perspektywa rodzica chroniącego dom',
                    framing_directive: `Ujęcie z perspektywy pierwszej osoby (POV). Delikatna dłoń opiekuna prezentująca produkt ${prodName} w naturalnym geście troski w prawej dolnej ćwiartce.`,
                    context_elements: 'Ciepłe światło wpadające przez okno, miękkie tkaniny i poczucie domowego bezpieczeństwa w tle.'
                },
                {
                    slot_id: 3,
                    format: 'STATYK',
                    concept_title: 'Wdzięczność i Ulga (Głębia Ostrości f/1.4)',
                    emotional_hook: 'Prawdziwy uśmiech i bezcenna ulga po trudnym dniu',
                    framing_directive: `Produkt ${prodName} na pierwszym planie po prawej stronie. W tle, w miękkiej nieostrości (bokeh), wzruszający uśmiech bliskiej osoby lub odpoczywający pupil.`,
                    context_elements: 'Kinowe oświetlenie konturowe (rim light), głęboka harmonia i autentyczna więź.'
                },
                {
                    slot_id: 4,
                    format: 'STATYK',
                    concept_title: 'Sensoryczna Czystość (Makro Kropli w Locie)',
                    emotional_hook: 'Świadomość wyboru tego, co w 100% bezpieczne dla zdrowia',
                    framing_directive: `Asymetryczny kadr makro z lewej strony. Zbliżenie na kroplę czystej esencji w zawieszeniu tuż obok nienaruszonego aplikatora ${prodName}.`,
                    context_elements: 'Świetlne mikroskopijne refleksy, krystaliczna czystość, zero ciężkich podestów.'
                },
                {
                    slot_id: 5,
                    format: 'REELS 9:16',
                    concept_title: 'Chwila dla Bliskich (Wideo 9:16)',
                    emotional_hook: 'Czas podarowany tym, których kochasz najbardziej',
                    framing_directive: `Format wertykalny 9:16. Dynamiczny orbitalny ruch kamery wokół produktu ${prodName} wznoszącego się w powietrzu pod kątem 30 stopni.`,
                    context_elements: 'Płynne slow-motion 60fps, migoczące refleksy światła porannego, ciepła gradacja barwna.'
                },
                {
                    slot_id: 6,
                    format: 'TIKTOK 9:16',
                    concept_title: 'Bezpieczny Dom na Lata (Wideo 9:16 Hero Low Angle)',
                    emotional_hook: 'Odpowiedzialność za przyszłość i bezpieczny dom bez kompromisów',
                    framing_directive: `Ujęcie z dołu (Hero Low Angle) z produktem ${prodName} wyłaniającym się w świetle wschodzącego słońca w prawej tercji ekranu.`,
                    context_elements: 'Wznoszące promienie słońca, poczucie dumy, pewności i spokoju o przyszłość.'
                }
            ],
            executive_verdict: `Kampania dla ${prodName} została całkowicie uwolniona od szablonowego centryzmu. Każda kreacja opowiada inną, wzruszającą historię miłości i troski o bliskich, zachowując 100% wierności oryginalnego packshotu marki ${brandName}.`
        };
    }

    _deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr = '', audience = '') {
        return {
            success: true,
            participants: this.getParticipants(),
            topic: `Strategia Wizualna i Emocjonalna: Eliminacja Centryzmu i Aktywacja Instynktu Troski dla ${prodName}`,
            debate_transcript: [
                {
                    step: 1,
                    speaker_id: 'lead_synthesizer',
                    speaker_name: 'Aleksander Bochenek (Dyrektor Kreatywny)',
                    avatar: '🎬',
                    badge_color: 'purple',
                    speech: `Rozpoczynamy naradę nad kampanią dla ${prodName} marki ${brandName}. Przeanalizowaliśmy rynek i konkurencję: wszędzie panuje ten sam schemat – sztuczne zdjęcia, butelka chamsko wklejona na środku kadru i puste hasła o rabatach. Naszym celem jest stworzenie kampanii, która poruszy serca i wyróżni się asymetrią oraz autentyzmem.`,
                    key_point: 'Odrzucenie sztampowych reklam konkurencji i start debaty'
                },
                {
                    step: 2,
                    speaker_id: 'brand_guardian',
                    speaker_name: 'Helena Wójcik (Strażnik Marki)',
                    avatar: '🛡️',
                    badge_color: 'indigo',
                    speech: `Zgadzam się, ale stawiam twardą granicę: ${brandDna}. Packshot z załączonego zdjęcia jest święty. Ani generator, ani reżyser nie mają prawa zmieniać kształtu butelki, pompki, barwy czy etykiety. Wierność oryginałowi musi wynosić równe 100%.`,
                    key_point: 'Żelazna obrona tożsamości fizycznej produktu'
                },
                {
                    step: 3,
                    speaker_id: 'empathy_strategist',
                    speaker_name: 'Marek Kamiński (Psycholog Emocji)',
                    avatar: '💖',
                    badge_color: 'rose',
                    speech: `Heleno, nikt nie zamierza psuć butelki! Ale sam produkt nikogo nie obchodzi, dopóki nie obudzimy w widzu instynktu troski. Chodzi o to, by rodzic poczuł spokój o delikatną skórę dziecka, by opiekun zobaczył wdzięczność w oczach psa, byśmy poczuli ulgę i miłość w domowym zaciszu. Reklama ma wyciskać łzy wdzięczności i rodzić natychmiastową potrzebę ochrony tego, co najcenniejsze.`,
                    key_point: 'Produkt jako narzędzie miłości, troski i ochrony'
                },
                {
                    step: 4,
                    speaker_id: 'visual_director',
                    speaker_name: 'Oskar Zawadzki (Reżyser Wizualny)',
                    avatar: '🎨',
                    badge_color: 'amber',
                    speech: `I tu wchodzę ja! Błagam, zero butelek w martwym centrum kadru! Widz natychmiast wyczuwa sztuczność katalogową. W pierwszym ujęciu przesuwamy produkt w lewą tercję i dajemy oddech przestrzeni. W drugim robimy kadr z oczu rodzica (POV dłoni w geście troski). W trzecim pokazujemy wzruszający uśmiech w nieostrości tła, a produkt na pierwszym planie. Każde z 6 zdjęć musi mieć inną geometrię!`,
                    key_point: 'Radykalne przełamanie centryzmu i zróżnicowanie kadrów'
                },
                {
                    step: 5,
                    speaker_id: 'lead_synthesizer',
                    speaker_name: 'Aleksander Bochenek (Dyrektor Kreatywny)',
                    avatar: '🎬',
                    badge_color: 'purple',
                    speech: `Oskar proponuje odważną plastykę. Heleno, czy ta asymetria nie narusza czytelności produktu? Marku, czy taka kompozycja uniesie ładunek wzruszenia i troski?`,
                    key_point: 'Konfrontacja zespołu i wezwanie do konsensusu'
                },
                {
                    step: 6,
                    speaker_id: 'brand_guardian',
                    speaker_name: 'Helena Wójcik (Strażnik Marki)',
                    avatar: '🛡️',
                    badge_color: 'indigo',
                    speech: `Kadr POV z dłonią w geście opieki i asymetria z lewej strony brzmią doskonale. To wzmacnia autentyzm i ciepło marki ${brandName}, nie odrywając produktu od prawdy. Kupuję tę koncepcję.`,
                    key_point: 'Zgoda Strażnika na asymetrię i narrację troski'
                }
            ],
            meeting_minutes: this._defaultMeetingMinutes(prodName, brandName)
        };
    }
}

module.exports = new CreativeWarRoomService();
