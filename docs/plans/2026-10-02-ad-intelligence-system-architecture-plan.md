# Plan Architektury i Wdrożenia: System Ad Intelligence & Creative Studio (Bez Atrap i Zabetonowanych Danych)

**Data utworzenia:** 2026-10-02  
**Status:** Przygotowany do akceptacji  
**Cel biznesowy:** Zbudowanie w 100% autentycznego, autonomicznego systemu monitorowania reklam konkurencji i produkcji kreacji (Statyki + Reels 9:16 + 28 Hooków) w oparciu o modele Gemini, zintegrowanego z bazą PIM i Harmonogramem SMI w MTool, wzorowanego na stosie: *Apify + Jev + Opus + HyperFrames*.

---

## 1. Uczciwy Audyt Stanu Faktycznego

### Co realnie działa w kodzie:
1. **Silnik Renderowania Wideo (FFmpeg):** Montaż wideo 9:16 z natywnym generatorem bufora PCM WAV działa stabilnie i nie zgłasza błędu `-f lavfi`.
2. **Silnik Kompozycji Graficznej (Sharp):** Nakładanie warstw graficznych, Shadow Baking (wektorowy cień z rozmyciem Gaussa) i typografia działają poprawnie.
3. **Chmura i Media:** Upload do Supabase Storage (`nexus-files`) z fallbackiem Base64 i dyskiem lokalnym zapobiega błędom 404 na produkcji.
4. **Most do Bazy SMI:** Eksport wygenerowanych kreacji do tabeli `SmiPost` w statusie `Do Akceptacji` tworzy autentyczne rekordy w bazie Nexus ERP bez modyfikacji schematu Prisma.
5. **Kompilacja i Testy Systemowe:** Aplikacja buduje się czysto w Vite (5.80s), a testy regresji przechodzą (138/138).

### Co było atrapą (zabetonowanym mockiem) i musi zostać bezwzględnie usunięte:
1. **`_generateCuratedBenchmarkAds` w `ad-intelligence.service.js`:** Zwracało sztywną, zhardkodowaną tablicę 5 reklam kosmetycznych ("Dlaczego zwykły krem nawilżający...", "Zero alkoholu..."). Niezależnie od tego, czy użytkownik szukał wiertarek, płynu do prania Felce Azzurra, czy odświeżacza Sweet Home, system serwował te same 5 fałszywych reklam!
2. **Brak faktycznego połączenia z Apify / biblioteką reklam:** System posiadał jedynie puste pole tekstowe na JSON, a w przypadku braku tokena Meta Graph API natychmiast uciekał w zabetonowane kremy zamiast realnie przeszukać sieć.
3. **Hardcode'y w promptach i stanie UI:**
   - Domyślne wartości w `AdIntelligenceTool.jsx`: "Skin Care Korea", "Włoska technologia liposomowa...".
   - Sztywne fallbacki `marketInsights` i `_deterministicFallbackMatrix`.
4. **Odcięcie od realiów bazy PIM:** Choć dodano selektor produktów, generator w wielu miejscach nadal opierał się na zabetonowanych szablonach zamiast na danych wybranego rekordu (`MIL MIL`, `Felce Azzurra`, `Cif` itd.).

---

## 2. Docelowa Architektura Swarm (Zero Fake Data)

System odwzorowuje 5-węzłowy proces z referencyjnego studium przypadku:

```
[WEJŚCIE: Wybór Produktu z PIM / Niszowe Zapytanie]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ WĘZEŁ 1: Autentyczny Ingestor Reklam                   │
│ - Apify Actor API (Live scraping Meta/TikTok)          │
│ - Gemini Live Search Grounding (googleSearch: {})      │
│ - Meta Ad Library Direct Public Connector              │
│ (Zero zabetonowanych tablic! Jeśli brak - Zero Results)│
└───────────────────────┬────────────────────────────────┘
                        │ (Prawdziwe reklamy konkurencji)
                        ▼
┌────────────────────────────────────────────────────────┐
│ WĘZEŁ 2: Analityk "Jev" (Scorer & Filtr Time-Decay)    │
│ - Obliczanie Longevity Index (dni ciągłej emisji)      │
│ - Klasyfikacja haków (Pain Point, Curiosity, Social)   │
│ - Odrzucenie spamu, wyselekcjonowanie Top Winners      │
└───────────────────────┬────────────────────────────────┘
                        │ (Zweryfikowani rynkowo zwycięzcy)
                        ▼
┌────────────────────────────────────────────────────────┐
│ WĘZEŁ 3: Główny Strateg "Opus / Gemini 3.1 Pro"        │
│ - Analiza Luk Rynkowych (Błękitny Ocean)               │
│ - Dopasowanie do rekordu produktu z PIM (cena, INCI)   │
│ - Synteza 4 kątów marketingowych i matrycy 28 hooków   │
│ - Generowanie briefów statycznych i scenopisów Reels   │
└───────────────────────┬────────────────────────────────┘
                        │ (Precyzyjne scenariusze)
                        ▼
┌────────────────────────────────────────────────────────┐
│ WĘZEŁ 4: Studio Multimedialne (Creative Studio)        │
│ - Sharp: Kompozycja z fizycznym packshotem + cień      │
│ - FFmpeg: Montaż 4 dynamicznych scen wideo 9:16        │
│ - Supabase Storage: Dystrybucja CDN                    │
└───────────────────────┬────────────────────────────────┘
                        │ (Wyrenderowane pliki PNG / MP4)
                        ▼
┌────────────────────────────────────────────────────────┐
│ WĘZEŁ 5: Studio HITL (Human-In-The-Loop) & Eksport SMI │
│ - Podgląd, edycja copy, podmienianie zdjęć z PIM       │
│ - Re-render pojedynczych kreacji w locie               │
│ - 1-klik eksport do Harmonogramu SMI                   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Plan Wdrożenia Rozbity na Etapy

### ETAP 1: Całkowita Dekontaminacja Kodu ze Sztywnych Mocków
1. Usunięcie metody `_generateCuratedBenchmarkAds` oraz wszystkich zhardkodowanych tablic z `ad-intelligence.service.js`.
2. Usunięcie sztucznych tekstów ("Skin Care Korea", "formuła liposomowa") z `ad-intelligence.service.js`, `ad-intelligence.controller.js` i `AdIntelligenceTool.jsx`.
3. Przebudowa inicjalizacji UI: komponent startuje w stanie czystym lub automatycznie ładuje rzeczywisty produkt z bazy PIM (`prisma.product` - np. pierwszy aktywny towar z magazynu Nexus ERP).
4. Wdrożenie autentycznej obsługi stanu "Brak wyników" (Zero Results Handling) – jeśli sieć nie zwraca reklam dla niszowej frazy, system uczciwie o tym informuje i sugeruje rozszerzenie zapytania, zamiast podstawiać fejkowe kremy.

### ETAP 2: Autentyczny Silnik Ingestii Reklam (Live Scraper + Apify + Grounding)
1. **Integracja z Apify API:**
   - Dodanie bezpośredniej obsługi klucza API Apify (`process.env.APIFY_API_TOKEN` lub wpisanie w formularzu).
   - Wywołanie sprawdzonego aktora Apify do przeszukiwania Meta Ad Library (np. `curious_coder/facebook-ads-library-scraper` lub dedykowany endpoint) dla wskazanego kraju (PL) i słów kluczowych.
   - Obsługa pobierania po bezpośrednim Apify Dataset ID / Run URL.
2. **Integracja z Gemini Live Web Search Grounding (`googleSearch: {}`):**
   - Wykorzystanie natywnego narzędzia Google Search w `@google/genai` (v2.14.0).
   - W przypadku braku bezpośredniego tokenu Apify/Meta, Gemini przeszukuje na żywo sieć (live web) w poszukiwaniu aktywnych kampanii, nagłówków konkurencji, haseł reklamowych i ofert dla danej niszy lub marki konkurenta.
   - Ekstrakcja autentycznych danych: rzeczywiste nazwy marek konkurencyjnych, prawdziwe teksty reklam, rzeczywiste platformy.

### ETAP 3: Autentyczny Scoring Time-Decay i Synteza 28 Hooków pod Realny Produkt
1. **Analityk Time-Decay (Gemini 3.8 Flash):**
   - Obliczanie wskaźników żywotności na autentycznie pobranych reklamach.
   - Identyfikacja realnych luk rynkowych (analiza tego, co konkurenci pomijają w swoich przekazach).
2. **Strateg Reklamowy (Gemini 3.1 Pro z Thinking):**
   - Synteza strategii dla konkretnego wybranego produktu z bazy PIM (jego faktyczna nazwa, cena w PLN, realny skład INCI, certyfikaty).
   - Generowanie dokładnie 4 kątów psychologicznych i 28 niepowtarzalnych haczyków (po 7 na kąt) bez literówek i z pełnymi polskimi znakami.
   - Opracowanie 4 briefów reklam statycznych oraz 2 kompletnych scenariuszy Reels (14s, 4 sceny).

### ETAP 4: Studio Multimedialne, Korekta HITL i Weryfikacja End-to-End
1. **Creative Studio (Sharp + FFmpeg + Supabase Storage):**
   - Kompozycja graficzna wykorzystująca wyłącznie realne packshoty z rekordu produktu (`product.imageUrl` / `product.images`).
   - Wypalanie wektorowego cienia kontaktowego (Shadow Baking) i zachowanie marginesów typografii.
   - Montaż pionowego wideo Reels (9:16 - 1080x1920) z planszami produktowymi i zsynchronizowanym dźwiękiem.
   - Upload do bucketu `nexus-files` w Supabase Storage z natychmiastowym adresem CDN.
2. **Studio Korekty HITL w MTool:**
   - Testy edycji copy, podmieniania packshotu z galerii i re-renderu pojedynczego assetu (`POST /api/ad-intelligence/re-render-asset`).
   - Test masowego eksportu do Harmonogramu SMI (`POST /api/ad-intelligence/export-smi`) i weryfikacja w kalendarzu postów.
3. **Bramki Jakości i Testy Regresji:**
   - Aktualizacja testów jednostkowych `src/modules/ad-intelligence/tests/ad-intelligence.test.js`.
   - Uruchomienie pełnej suity testów backendu (`npm test`) i weryfikacja kompilacji frontendu (`npm run build`).

---

## 4. Zasady Jakościowe Wdrożenia
- **Zero Mocków:** Absolutny zakaz wprowadzania jakichkolwiek sztucznych tablic z przykładowymi danymi w kodzie produkcyjnym.
- **Odporność na Błędy (Defensive AI):** Jeśli zewnętrzne API zgłasza błąd uprawnień lub brak sieci, system natychmiast zgłasza błąd do interfejsu zamiast cicho serwować fałszywki.
- **Krok po Kroku:** Prace będą realizowane etapami z weryfikacją każdego kroku w terminalu.
