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
 * 4 wyspecjalizowane persony AI prowadzące autentyczną debatę kreatywną nad kampanią:
 * 1. 🛡️ Strażnik Marki (Brand Heritage Guardian): broni DNA marki, prawdy o produkcie i nienaruszalności packshotu.
 * 2. 💖 Psycholog Emocji (Empathy & Emotion Strategist): forsuje głębokie emocje wyciskające łzy i wzbudzające troskę o bliskich, dzieci, zwierzęta i planetę.
 * 3. 🎨 Reżyser Wizualny (Visual Art Director): bezwzględnie tępi centryzm i nudę kompozycyjną, projektując asymetrię, kadry POV i głębię ostrości.
 * 4. 🎬 Dyrektor Syntezy (Lead Creative Director): moderuje spór, formułuje Oficjalną Notatkę z Przebiegu Spotkania oraz matrycę 6 unikalnych kadrów.
 */
class CreativeWarRoomService {

    getParticipants() {
        return [
            {
                id: 'brand_guardian',
                name: 'Helena Wójcik',
                title: 'Strażnik Tożsamości Marki & Prawdy Produktu',
                avatar: '🛡️',
                badgeColor: 'indigo',
                description: 'Pilnuje estetyki strony, DNA marki i żelaznej zasady nienaruszalności oryginalnego packshotu.'
            },
            {
                id: 'empathy_strategist',
                name: 'Marek Kamiński',
                title: 'Szef Strategii Emocjonalnej & Empatii',
                avatar: '💖',
                badgeColor: 'rose',
                description: 'Sprzedaje emocje chwytające za serce: instynkt troski o dzieci, rodzinę, bezbronne zwierzęta i planetę.'
            },
            {
                id: 'visual_director',
                name: 'Oskar Zawadzki',
                title: 'Reżyser Wizualny & Mistrz Kompozycji',
                avatar: '🎨',
                badgeColor: 'amber',
                description: 'Niszczy centryzm i nudę – forsuje asymetrię, ujęcia POV, portrety z głębią ostrości i sensoryczne zbliżenia.'
            },
            {
                id: 'lead_synthesizer',
                name: 'Aleksander Bochenek',
                title: 'Główny Dyrektor Kreatywny (Moderator)',
                avatar: '🎬',
                badgeColor: 'purple',
                description: 'Kieruje debatą, rozstrzyga spory, tworzy Notatkę z Przebiegu Spotkania i przypisuje kadry do 6 kreacji.'
            }
        ];
    }

    /**
     * Przeprowadza kompletną naradę wieloagentową nad produktem i rynkiem
     */
    async runDeliberation({ brandProfile = {}, productData = {}, marketInsights = {}, angles = [] }) {
        const prodName = productData.name || brandProfile.name || 'Produkt';
        const brandName = brandProfile.name || productData.brand?.name || 'Marka';
        const usp = brandProfile.usp || productData.features || 'Wysoka skuteczność';
        const brandDna = brandProfile.brandDna || `Nowoczesny minimalizm marki ${brandName}. Jasne światło, lekkość i autentyczność.`;
        const priceStr = productData.salePrice ? `${Number(productData.salePrice).toFixed(2)} zł` : 'Segment rynkowy';
        const audience = brandProfile.targetAudience || 'Konsumenci w Polsce poszukujący bezpieczeństwa i jakości';

        const ai = getAi();
        if (!ai) {
            return this._deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr, audience);
        }

        const warRoomPrompt = `Jesteś symulatorem Najwyższego Zarządu Kreatywnego (AI Creative War Room).
Przed Tobą siedzi 4 elitarnych ekspertów, którzy spotkali się w pokoju narad, aby zaplanować bezkompromisową, poruszającą kampanię komercyjną dla produktu: "${prodName}" marki "${brandName}".

DANE WEJŚCIOWE DO DYSKUSJI:
- Produkt: ${prodName}
- Marka: ${brandName}
- Cena i półka: ${priceStr}
- DNA i estetyka marki: "${brandDna}"
- Główna obietnica / USP: ${usp}
- Grupa docelowa: ${audience}
${marketInsights.saturated_claims ? `- Nasycone schematy konkurencji, którymi rzyga rynek: ${JSON.stringify(marketInsights.saturated_claims)}` : ''}
${marketInsights.dominant_hooks ? `- Haczyki konkurencji: ${JSON.stringify(marketInsights.dominant_hooks)}` : ''}

PERSONY BIORĄCE UDZIAŁ W DEBACIE:
1. Helena Wójcik (🛡️ Strażnik Marki): Broni DNA marki i autentyczności. Kategorycznie ostrzega przed halucynowaniem produktu i przypomina, że załączony packshot jest nienaruszalny (żadnego zmieniania butelki/pompki/etykiety!).
2. Marek Kamiński (💖 Psycholog Emocji): Wkurza się na powierzchowne reklamy. Żąda emocji, które wyciskają łzy i poruszają sumienie – instynkt opiekuńczy, troska o dzieci, zdrowie najbliższych, miłość do bezbronnych zwierząt, odpowiedzialność za czysty świat dla przyszłych pokoleń. Produkt ma być narzędziem miłości i ochrony!
3. Oskar Zawadzki (🎨 Reżyser Wizualny): Nienawidzi nudy. Bezlitośnie atakuje centryzm: „Jeśli znowu postawicie butelkę na środku kadru, to widz przewinie to w sekundę!”. Forsuje asymetrię (Rule of Thirds), ujęcia z perspektywy pierwszej osoby (POV dłoni matki/opiekuna), kadry relacyjne z głębią ostrości (uśmiech dziecka lub spojrzenie psa w tle) i sensoryczne zbliżenia.
4. Aleksander Bochenek (🎬 Dyrektor Kreatywny / Moderator): Prowadzi spotkanie, podsumowuje spór, gasi niepotrzebne dyskusje i sporządza Oficjalny Protokół z Narady (Executive Minutes) oraz matrycę kadrów dla 6 kreacji.

ZADANIE:
Wygeneruj autentyczną, żywą stenogramową debatę (6-8 dynamicznych replik ze sporem i ripostami) oraz oficjalną notatkę ze spotkania.

Zwróć odpowiedź WYŁĄCZNIE jako poprawny obiekt JSON o strukturze:
\`\`\`json
{
  "topic": "Strategia Wizualna i Emocjonalna: Eliminacja Centryzmu i Aktywacja Instynktu Troski dla ${prodName}",
  "debate_transcript": [
    {
      "step": 1,
      "speaker_id": "lead_synthesizer",
      "speaker_name": "Aleksander Bochenek (Dyrektor Kreatywny)",
      "avatar": "🎬",
      "badge_color": "purple",
      "speech": "Otwarcie narady: z czym wchodzimy, co zbadaliśmy u konkurencji i jaki jest problem z obecnymi reklamami na rynku...",
      "key_point": "Krótkie podsumowanie tezy (1 zdanie)"
    },
    {
      "step": 2,
      "speaker_id": "brand_guardian",
      "speaker_name": "Helena Wójcik (Strażnik Marki)",
      "avatar": "🛡️",
      "badge_color": "indigo",
      "speech": "Przypomnienie granic: DNA marki, tożsamość produktu, twarda zasada nienaruszalności packshotu ze zdjęcia...",
      "key_point": "Nienaruszalność produktu i wierność DNA"
    },
    {
      "step": 3,
      "speaker_id": "empathy_strategist",
      "speaker_name": "Marek Kamiński (Psycholog Emocji)",
      "avatar": "💖",
      "badge_color": "rose",
      "speech": "Emocjonalny wybuch: dlaczego musimy wyciskać łzy i wzbudzać troskę o dziecko/bliskich/zwierzęta/planetę zamiast pokazywać suchy produkt...",
      "key_point": "Instynkt opiekuńczy i potrzeba ochrony"
    },
    {
      "step": 4,
      "speaker_id": "visual_director",
      "speaker_name": "Oskar Zawadzki (Reżyser Wizualny)",
      "avatar": "🎨",
      "badge_color": "amber",
      "speech": "Rewolucja kadrowania: kategoryczny zakaz umieszczania butelki na środku, propozycja asymetrii, POV, gry głębią ostrości...",
      "key_point": "Eliminacja centryzmu i dynamiczna kompozycja"
    },
    {
      "step": 5,
      "speaker_id": "brand_guardian",
      "speaker_name": "Helena Wójcik (Strażnik Marki)",
      "avatar": "🛡️",
      "badge_color": "indigo",
      "speech": "Weryfikacja pomysłów Oskara i Marka: zgoda pod warunkiem, że packshot w kadrze pozostanie w 100% autentyczny...",
      "key_point": "Warunkowa akceptacja z tarczą tożsamości"
    },
    {
      "step": 6,
      "speaker_id": "lead_synthesizer",
      "speaker_name": "Aleksander Bochenek (Dyrektor Kreatywny)",
      "avatar": "🎬",
      "badge_color": "purple",
      "speech": "Podsumowanie debaty: mamy konsensus! Ustalamy matrycę 6 różnych kadrów i ładunek emocjonalny...",
      "key_point": "Ostateczny konsensus i przejście do produkcji"
    }
  ],
  "meeting_minutes": {
    "meeting_title": "Oficjalna Notatka z Przebiegu Spotkania Zarządu Kreatywnego (AI War Room)",
    "product_name": "${prodName}",
    "brand_name": "${brandName}",
    "core_conflict_resolved": "Opis przełamanego impasu (odrzucenie centryzmu i zimnych podestów, przyjęcie narracji troski)",
    "agreed_emotional_code": "Dokładny kod emocjonalny przyjęty przez zespół (np. miłość matki, bezpieczny dom, wdzięczność zwierząt)",
    "visual_framing_doctrine": "Zasada geometryczna: asymetria, brak powtórzeń pozycji, żywy kontekst, kategoryczny zakaz martwego centrum",
    "framing_doctrine": "Zasada geometryczna: asymetria, brak powtórzeń pozycji, żywy kontekst",
    "immutability_shield_clause": "Klauzula 100% ochrony fizycznej tożsamości butelki/pompki/etykiety ze zdjęcia referencyjnego",
    "creatives_matrix": [
      {
        "slot": 1,
        "type": "STATIC_1",
        "concept_title": "Tytuł ujęcia 1",
        "emotional_hook": "Wzruszający haczyk emocjonalny",
        "framing_directive": "Precyzyjny kadr: np. Lewa tercja kadru (Rule of Thirds), otwarta przestrzeń z prawej strony...",
        "context_elements": "Elementy tła i relacji (np. dłoń, miękkie światło poranka)"
      },
      {
        "slot": 2,
        "type": "STATIC_2",
        "concept_title": "Tytuł ujęcia 2",
        "emotional_hook": "...",
        "framing_directive": "Precyzyjny kadr: np. Perspektywa pierwszej osoby (POV) z dłońmi w geście opieki...",
        "context_elements": "..."
      },
      {
        "slot": 3,
        "type": "STATIC_3",
        "concept_title": "Tytuł ujęcia 3",
        "emotional_hook": "...",
        "framing_directive": "Precyzyjny kadr: np. Płytka głębia ostrości (f/1.4) – w tle wzruszający uśmiech bliskiej osoby...",
        "context_elements": "..."
      },
      {
        "slot": 4,
        "type": "STATIC_4",
        "concept_title": "Tytuł ujęcia 4",
        "emotional_hook": "...",
        "framing_directive": "Precyzyjny kadr: np. Ekstremalne zbliżenie sensoryczne na dotyk i pojedynczą kroplę w locie...",
        "context_elements": "..."
      },
      {
        "slot": 5,
        "type": "REEL_1",
        "concept_title": "Tytuł rolki 1 (Wideo 9:16)",
        "emotional_hook": "...",
        "framing_directive": "Precyzyjny kadr wideo: dynamiczny najazd orbitalny pod kątem 45 stopni...",
        "context_elements": "..."
      },
      {
        "slot": 6,
        "type": "REEL_2",
        "concept_title": "Tytuł rolki 2 (Wideo 9:16)",
        "emotional_hook": "...",
        "framing_directive": "Precyzyjny kadr wideo: Kadr wznoszący z poziomu dłoni (Hero Low Angle) z ciepłym słońcem...",
        "context_elements": "..."
      }
    ],
    "executive_verdict": "Końcowy werdykt Dyrektora Kreatywnego (2-3 mocne zdania podsumowania)."
  }
}
\`\`\``;

        try {
            const resp = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: warRoomPrompt,
                config: {
                    temperature: 0.35
                }
            });

            const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    if (parsed.meeting_minutes) {
                        parsed.meeting_minutes.visual_framing_doctrine = parsed.meeting_minutes.visual_framing_doctrine 
                            || parsed.meeting_minutes.framing_doctrine 
                            || 'Asymetria kompozycyjna i kategoryczny zakaz umieszczania produktu w martwym centrum kadru.';
                        parsed.meeting_minutes.framing_doctrine = parsed.meeting_minutes.visual_framing_doctrine;
                        parsed.meeting_minutes.immutability_shield_clause = parsed.meeting_minutes.immutability_shield_clause 
                            || 'Oryginalna butelka, pompka, typografia i etykieta z załączonego zdjęcia podlegają 100% ochronie fizycznej przed modyfikacją.';
                        if (Array.isArray(parsed.meeting_minutes.creatives_matrix)) {
                            parsed.meeting_minutes.creatives_matrix = parsed.meeting_minutes.creatives_matrix.map((c, i) => ({
                                ...c,
                                slot_id: c.slot_id || c.slot || (i + 1),
                                format: c.format || (c.type?.includes('REEL') ? 'REELS 9:16' : 'STATYK')
                            }));
                        }
                    }
                    return {
                        success: true,
                        participants: this.getParticipants(),
                        ...parsed
                    };
                }
            }
        } catch (err) {
            console.warn('[CreativeWarRoomService] Błąd generowania obrad przez Gemini:', err.message);
        }

        return this._deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr, audience);
    }

    _deterministicFallbackDeliberation(prodName, brandName, usp, brandDna, priceStr, audience) {
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
                    speaker_id: 'brand_guardian',
                    speaker_name: 'Helena Wójcik (Strażnik Marki)',
                    avatar: '🛡️',
                    badge_color: 'indigo',
                    speech: `Kadr POV z dłonią w geście opieki i asymetria z lewej strony brzmią doskonale. To wzmacnia autentyzm i ciepło marki ${brandName}, nie odrywając produktu od prawdy. Kupuję tę koncepcję.`,
                    key_point: 'Zgoda Strażnika na asymetrię i narrację troski'
                },
                {
                    step: 6,
                    speaker_id: 'lead_synthesizer',
                    speaker_name: 'Aleksander Bochenek (Dyrektor Kreatywny)',
                    avatar: '🎬',
                    badge_color: 'purple',
                    speech: `Mamy to! Protokół jest jednoznaczny: 6 unikalnych kadrów, zero centryzmu, głęboki ładunek troski i bezwarunkowej ochrony oraz 100% wierności packshotu. Przechodzimy natychmiast do kompilacji promptów produkcyjnych.`,
                    key_point: 'Ostateczny konsensus i sporządzenie protokołu'
                }
            ],
            meeting_minutes: {
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
                        slot: 1,
                        slot_id: 1,
                        type: 'STATIC_1',
                        format: 'STATYK',
                        concept_title: 'Troska o Delikatność (Złoty Podział)',
                        emotional_hook: 'Spokój matki i ochrona tego, co najdelikatniejsze',
                        framing_directive: `Produkt ${prodName} przesunięty asymetrycznie w lewą 1/3 kadru (Rule of Thirds). Prawa strona kadru otwarta na miękkie światło poranka.`,
                        context_elements: 'Czysta, jasna przestrzeń, rozproszone pastele, unoszące się delikatne cząsteczki świeżości w powietrzu.'
                    },
                    {
                        slot: 2,
                        slot_id: 2,
                        type: 'STATIC_2',
                        format: 'STATYK',
                        concept_title: 'Czysty Dotyk Bezpieczeństwa (Kadr POV)',
                        emotional_hook: 'Wzruszająca perspektywa rodzica chroniącego dom',
                        framing_directive: `Ujęcie z perspektywy pierwszej osoby (POV). Delikatna dłoń opiekuna prezentująca produkt ${prodName} w naturalnym geście troski w prawej dolnej ćwiartce.`,
                        context_elements: 'Ciepłe światło wpadające przez okno, miękkie tkaniny i poczucie domowego bezpieczeństwa w tle.'
                    },
                    {
                        slot: 3,
                        slot_id: 3,
                        type: 'STATIC_3',
                        format: 'STATYK',
                        concept_title: 'Wdzięczność i Ulga (Głębia Ostrości f/1.4)',
                        emotional_hook: 'Prawdziwy uśmiech i bezcenna ulga po trudnym dniu',
                        framing_directive: `Produkt ${prodName} na pierwszym planie po prawej stronie. W tle, w miękkiej nieostrości (bokeh), wzruszający uśmiech bliskiej osoby lub odpoczywający pupil.`,
                        context_elements: 'Kinowe oświetlenie konturowe (rim light), głęboka harmonia i autentyczna więź.'
                    },
                    {
                        slot: 4,
                        slot_id: 4,
                        type: 'STATIC_4',
                        format: 'STATYK',
                        concept_title: 'Sensoryczna Czystość (Makro Kropli w Locie)',
                        emotional_hook: 'Świadomość wyboru tego, co w 100% bezpieczne dla zdrowia',
                        framing_directive: `Asymetryczny kadr makro z lewej strony. Zbliżenie na kroplę czystej esencji w zawieszeniu tuż obok nienaruszonego aplikatora ${prodName}.`,
                        context_elements: 'Świetlne mikroskopijne refleksy, krystaliczna czystość, zero ciężkich podestów.'
                    },
                    {
                        slot: 5,
                        slot_id: 5,
                        type: 'REEL_1',
                        format: 'REELS 9:16',
                        concept_title: 'Chwila dla Bliskich (Wideo 9:16)',
                        emotional_hook: 'Czas podarowany tym, których kochasz najbardziej',
                        framing_directive: `Format wertykalny 9:16. Dynamiczny orbitalny ruch kamery wokół produktu ${prodName} wznoszącego się w powietrzu pod kątem 30 stopni.`,
                        context_elements: 'Płynne slow-motion 60fps, migoczące refleksy światła porannego, ciepła gradacja barwna.'
                    },
                    {
                        slot: 6,
                        slot_id: 6,
                        type: 'REEL_2',
                        format: 'TIKTOK 9:16',
                        concept_title: 'Bezpieczny Dom na Lata (Wideo 9:16 Hero Low Angle)',
                        emotional_hook: 'Odpowiedzialność za przyszłość i bezpieczny dom bez kompromisów',
                        framing_directive: `Ujęcie z dołu (Hero Low Angle) z produktem ${prodName} wyłaniającym się w świetle wschodzącego słońca w prawej tercji ekranu.`,
                        context_elements: 'Wznoszące promienie słońca, poczucie dumy, pewności i spokoju o przyszłość.'
                    }
                ],
                executive_verdict: `Kampania dla ${prodName} została całkowicie uwolniona od szablonowego centryzmu. Każda kreacja opowiada inną, wzruszającą historię miłości i troski o bliskich, zachowując 100% wierności oryginalnego packshotu marki ${brandName}.`
            }
        };
    }
}

module.exports = new CreativeWarRoomService();
