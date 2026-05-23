# ADR 013: Agent Dopasowania Segmentowego i Tonu (Psycholog Sprzedaży) w potoku MTool

## Kontekst i Problem
Opisy ofert generowane przez model LLM (GEO Text) bywały generyczne i nie wykorzystywały specyficznych dla poszczególnych branż triggerów psychologicznych. Ponadto, brakowało dostosowania tonu wypowiedzi do konkretnej grupy docelowej w zależności od segmentu produktowego (np. kosmetyki, elektronika, odzież itp.). Kolejnym problemem była niska czytelność (scannability) opisów na urządzeniach mobilnych – akapity bywały zbyt długie, a pogrubienia nie tworzyły logicznej "ścieżki skanowania" (skimming path) zgodnie z formułą AIDA/FAB.

## Decyzja Architektoniczna
1. **Powołanie Nowego Agenta (Agent Dopasowania Segmentowego i Tonu)**: Zdefiniowano `SEGMENT_TONE_AGENT_PROMPT` w `ai.prompts.js`. Agent ten analizuje wygenerowaną strukturę 5 modułów HTML oraz cechy produktu i automatycznie przypisuje go do odpowiedniego segmentu rynkowego.
2. **Implementacja Branżowych Triggerów Psychologicznych i Tonu**: Agent aplikuje specyficzne techniki sprzedaży dla segmentów:
   - **Kosmetyki**: Troskliwy i ekspercki ton, triggery: bezpieczeństwo (WE 1223/2009), naturalność, glow, zachowanie INCI 1:1.
   - **Elektronika / AGD**: Precyzyjny i rzeczowy ton, triggery: niezawodność, gwarancja, ułatwienie życia, bezpieczeństwo (CE, RoHS).
   - **Dom i Ogród**: Przytulny i praktyczny ton, triggery: wygoda, harmonia, trwałość, rodzina.
   - **Odzież i Moda**: Energetyczny i nowoczesny ton, triggery: styl, pewność siebie, dopasowanie.
   - **Dziecko**: Opiekuńczy i empatyczny ton, triggery: atesty PZH, bezpieczeństwo materiałów, rozwój.
3. **Chirurgiczna Poprawa Czytelności**: Agent dba o skimming path poprzez ograniczanie akapitów do 3-4 linii oraz selektywne pogrubianie tylko 2-3 kluczowych korzyści/parametrów na akapit za pomocą tagów `<strong>`.
4. **Zintegrowany Potok (Pipeline Injection)**: Wstrzyknięto funkcję `adaptToSegmentAndTone` bezpośrednio do metod `generateNativeAnalysis` (tryb ręczny) oraz `generateGEOTextContent` (tryb automatyczny EAN) na backendzie.
5. **Przebudowa Wizualna Symulatora**: Dostosowano frontendowy komponent `OfferOptimizerView.jsx`, przebudowując mapowanie sekcji Allegro (`allegroSections`) do nowoczesnego, naprzemiennego układu kaskadowego zygzaka opartego o grid (Obietnica 100%, Korzyści FAB/Zdjęcie 50/50, Specyfikacja 100%, Zdjęcie/Zdjęcie 50/50, CTA/Zestaw 100%, INCI 100%).

## Konsekwencje
- **Pozytywne**: Znaczny wzrost konwersji dzięki dopasowaniu psychologicznemu ofert do grup docelowych. Pełna zgodność z rygorem czytelności (mobile friendly).
- **Negatywne**: Dodatkowy narzut czasowy wywołania modelu Gemini o ok. 2-3 sekundy w potoku (rekompensowane pełną optymalizacją pod kupujących).
