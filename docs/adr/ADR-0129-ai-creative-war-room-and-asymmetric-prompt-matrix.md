# ADR-0129: AI Creative War Room (Okrągły Stół Person Kreatywnych), Eliminacja Martwego Centrum i Asymetryczna Matryca Emocjonalna

## Data: 2026-10-04
## Status: ZAAKCEPTOWANE I WDROŻONE PRODUKCYJNIE (16/16 testów modułu PASSED, Vite build: 6.95s)

---

## 1. Kontekst i Problem Biznesowy
Użytkownicy weryfikujący generowane kreacje graficzne e-commerce zidentyfikowali krytyczną wadę kompozycyjną:
1. **Syndrom "Martwego Centrum" (Bullseye Composition):** Wszystkie generowane kadry studyjne i packshoty wyglądały niemal identycznie, ponieważ obiekt z bazy PIM był umieszczany dokładnie na środku kadru. Zmianie ulegały jedynie tła, co natychmiast wywoływało u odbiorcy poczucie sztuczności, nudy i katalogowej powtarzalności.
2. **Deficyt Głębokich Emocji i Instynktu Troski:** Dotychczasowe teksty i prompty skupiały się na generycznych cechach technicznych lub powierzchownych obietnicach marketingowych. Brakowało autentycznego ładunku empatii wyciskającego łzy – instynktu opiekuńczego, troski o dzieci, miłości do bezbronnych zwierząt, bezpieczeństwa bliskich oraz ochrony planety.
3. **Potrzeba Dynamicznej Debaty Zamiast Sztywnych Reguł:** Użytkownik wyraźnie odrzucił sztywne, zahardkodowane zakazy (np. `if (!prompt.contains('podest'))`), żądając stworzenia autonomicznego środowiska narad wieloagentowych (AI Swarm War Room), gdzie wyspecjalizowane persony AI spierają się, ścierają argumenty i wspólnie ustalają doktrynę wizualno-emocjonalną kampanii.
4. **Wizualizacja Debaty w Czasie Rzeczywistym:** Użytkownik zażądał, aby dyskusja agentów była prezentowana na żywo w interfejsie graficznym (animowany playback z aktywnymi mówcami), po czym przedstawiana w postaci oficjalnej, zwięzłej **Notatki z Przebiegu Spotkania (Executive Minutes)**.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Prawdziwa Wieloagentowość vs Eliminacja Skryptologii Jednopromptowej (`CreativeWarRoomService`)
W module `src/modules/ad-intelligence/creative-war-room.service.js` zrezygnowano z wyreżyserowanego dialogu w jednym zapytaniu LLM na rzecz **autentycznej, wieloturowej debaty agentowej**:
1. **Zero Narzucania Rozwiązań (Eliminacja Mikrozarządzania):** Żaden agent nie ma w instrukcjach podanych z góry obiektywów, gotowych ujęć czy tekstów. Każdy posiada wyłącznie definicję swojej profesji, wyuczonego warsztatu, kryteriów oceny i etosu zawodowego:
   - 🛡️ **Dyrektor ds. Tożsamości Marki (Helena Wójcik):** Ekspertka corporate identity i compliance e-commerce. Weryfikuje rzetelność rynkową i twardo strzeże 100% nienaruszalności fizycznej packshotu ze zdjęcia referencyjnego.
   - 💖 **Główny Strateg Neuromarketingu & Psychologii Behawioralnej (Marek Kamiński):** Badacz ludzkich motywacji. Samodzielnie analizuje, jakimi emocjami żyje odbiorca i gdzie w kategorii produktu tkwi prawdziwa potrzeba opieki (dzieci, rodzina, zwierzęta, planeta).
   - 🎨 **Reżyser Fotografii Komercyjnej & Dyrektor Artystyczny (Oskar Zawadzki):** Suwerenny twórca wizualny. Zwalcza amatorskie martwe centrum kadru; na bazie własnego zmysłu plastycznego i wiedzy optycznej dobiera asymetrię, punkty widzenia i światło.
   - 🎬 **Główny Dyrektor Kreatywny & Moderator (Aleksander Bochenek):** Prowadzi stół narad przez pytania problemowe otwarte, zderza opinie ekspertów i sporządza oddolną syntezę ustaleń.
2. **Sekwencyjna Pętla Debaty Wieloturowej (Multi-Turn Swarm):**
   - Każda tura to niezależne wywołanie `gemini-3.8-flash` z odrębnym `systemInstruction` danej persony.
   - Agent czyta dotychczasowy stenogram wypowiedzi i odpowiada z pozycji swojej specjalizacji.
3. **Oddolna Synteza Ustaleń (Bottom-Up Emergent Synthesis):**
   - Oficjalna Notatka ze Spotkania (`meeting_minutes`) oraz 6-slotowa matryca kadrów (`creatives_matrix`) powstają w drodze ekstrakcji z RZECZYWISTYCH wypowiedzi wypracowanych przez zespół podczas debaty.

### 2.2. Mapowanie Wytycznych z Narady do Prompt Directora (`PromptDirectorService`)
- Metody `generateProductionPrompts` oraz `enrichBriefsWithPrompts` przyjmują `slotDirective` z matrycy Pokoju Narad.
- Każdy slot otrzymuje unikalne wytyczne kadrowania (asymetria) oraz dedykowany ładunek emocjonalny, z zachowaniem nadrzędnej tarczy nienaruszalności produktu (`[DOKŁADNY_OBIEKT_ZE_ZDJĘCIA]`).
- Briefy statyczne 1–4 otrzymują sloty [0..3], a briefy wideo Reels 1–2 otrzymują sloty [4..5] (ruch orbitalny 9:16 i Hero Low-Angle).

### 2.3. Wizualizacja Live w Interfejsie (`CreativeWarRoomLiveViewer`)
W komponencie `frontend/src/components/AdIntelligenceTool.jsx` wdrożono komponent `CreativeWarRoomLiveViewer`:
- **Wirtualny Stół Konferencyjny:** 4 karty person z dynamicznym wskaźnikiem mówcy ("MÓWI TERAZ..." z pulsującym equalizerem i glowing borderem).
- **Odtwarzacz Debaty:** Automatyczne animowane przechodzenie wypowiedzi z kontrolkami Play/Pause, prędkością (1x/2x), restartem oraz przyciskiem "⚡ Pomiń i pokaż notatkę".
- **Stenogram Debaty na Żywo:** Przewijalna lista replik z awatarami, znacznikami kroków i pigułkami kluczowych tez.
- **Oficjalna Notatka ze Spotkania (Executive Minutes):**
  - Rozstrzygnięty Spór Strategiczny (`core_conflict_resolved`)
  - Zatwierdzony Kod Emocjonalny (`agreed_emotional_code`)
  - Doktryna Kompozycji i Asymetrii (`visual_framing_doctrine`)
  - Tarcza Nienaruszalności Packshotu (`immutability_shield_clause`)
  - Matryca 6 Zróżnicowanych Kadrów z pigułkami formatów i wytycznymi otoczenia.

---

## 3. Konsekwencje i Korzyści
1. **Eliminacja Syndromu Klonów:** Wszystkie 6 kreacji (4 statyki + 2 wideo) posiadają całkowicie inną geometrię kadru, odległość od obiektywu i kontekst relacyjny.
2. **Wysoki Współczynnik Konwersji (Perswazja Emocjonalna):** Kreacje uderzają w głębokie, autentyczne motywacje zakupowe (ochrona bliskich, bezpieczeństwo dziecka, ulga w domowym zaciszu).
3. **Transparentność Procesu AI (XAI):** Użytkownik widzi, jak agenci AI dochodzą do konsensusu, co buduje zaufanie do wygenerowanych materiałów i dostarcza gotowej argumentacji biznesowej.
4. **Zero Regresji i Zero Nowych Zależności:** Pełna zgodność z bazą danych (brak migracji) i istniejącą biblioteką `@google/genai`.
