# ADR-0149: Front-Pack Vision Data Bus, PIM View Synchronization & Anti-Monoculture Safeguards (Agents 2, 4, 5)

## Status
Zaakceptowany (Accepted)

## Kontekst
Wdrożenie Agenta 0 (Vision Extractor) do wstępnej analizy fizycznej etykiety packshotu rozwiązało problem automatycznego odczytywania cech (Pojemność, Postać, Zapach, Dozownik). Pojawiły się jednak trzy krytyczne zagadnienia integracyjne:
1. **Zanikanie danych w widoku UI (PIM):** Odczytane przez Vision cechy nie były prezentowane w panelu "Karta Techniczna i Skład (Parametry PIM)", ponieważ filtr atrybutów bazował wyłącznie na dynamicznym schemacie kategorii Allegro, ukrywając kluczowe atrybuty ogólne. Ponadto kontroler `OfferOptimizerController` odczytywał przestarzały stan `existingProduct.features` zamiast świeżo zaktualizowanych danych z bazy Prisma.
2. **Ryzyko zubożenia / monokultury w Agentach 2, 4 i 5:** Istniało bezpośrednie niebezpieczeństwo, że Agenci 2 (Social Proof/VoC), 4 (INCI/GEO) oraz 5 (GPSR & FAQ AEO) zredukują swoje wielowymiarowe analizy wyłącznie do kilku cech odczytanych z packshotu (pompka, butelka, zapach), co prowadziłoby do powtarzalnych pytań i odpowiedzi FAQ w każdej aukcji.
3. **Pojazd ze stacji A do Z nie może mijać stacji D, G, U:** Cechy fizyczne musiały być natychmiast dostępne dla całego potoku w `this.state.extracted_data` oraz `featuresObj` i wykluczać marnowanie tokenów w kwerendach wyszukiwania brakujących pól przez Agenta 1.

## Decyzje Architektoniczne

### 1. Zabezpieczenie różnorodności i rola cech Vision w Agentach 2, 4 i 5
- **Agent 2 (Social Proof & VoC):** Parametry ze zdjęcia (`physical_grounding_context`) służą wyłącznie jako filtr wariantu SKU (odrzucenie opinii o innych formatach/pojemnościach). Wprowadzono twardą dyrektywę zakazującą ograniczania klastrów VoC do butelki czy zapachu – analiza zadowolenia musi czerpać z pełnego profilu rynkowego.
- **Agent 4 (INCI & Chemical AEO):** Cechy fizyczne (forma, dozownik) stanowią wyłącznie kontekst aplikacyjny. Bezwzględny prymat biochemii: wszelkie benefity techniczne i synergie MUSZĄ wynikać w 100% z mechanizmów biochemicznych składników INCI i bazy wiedzy RAG.
- **Agent 5 (GPSR & SEO/GEO FAQ):** Cechy fizyczne stanowią jedynie uziemienie techniczne. Wprowadzono limit: maksymalnie jedno pytanie FAQ może nawiązywać do opakowania/dozownika. Obowiązek utrzymania pełnej rotacji tematów (skuteczność, typ powierzchni/skóry, technika aplikacji, przechowywanie, bezpieczeństwo składników).

### 2. Natychmiastowa magistrala danych (In-Memory State Bus & Missing Fields Filter)
- Wynik Agenta 0 jest natychmiast zapisywany w Prisma jako obiekt JSON (`features: cleanFeatures`) oraz mapowany do `this.state.vision_extracted_features` i `this.state.extracted_data`.
- Wywołanie `this.emitState()` natychmiast propaguje nowe cechy do socketów UI.
- Kalkulacja `missingFields` w Orkiestratorze automatycznie łączy cechy z packshotu, wykreślając je z listy braków – Agent 1 nie marnuje tokenów Google na szukanie pojemności czy postaci obecnych na zdjęciu.

### 3. Tarcza Deterministyczna Sekcji 6 (Karta Techniczna)
- Zanim Agent 6 wyrenderuje Sekcję 6 (HTML), orkiestrator deterministycznie sprawdza obecność punktów z packshotu (`Pojemność`, `Postać`, `Wariant zapachowy`, `Dozownik`) i wstrzykuje brakujące elementy przed znacznikiem `</ul>`.

### 4. Spójność PIM i Frontend SSOT
- W `UnifiedProductPipelineView.jsx` zdefiniowano zestaw stałych atrybutów technicznych `CORE_PIM_KEYS` (`skład/inci`, `pojemność`, `postać`, `zapach`, `dozownik`, `wydajność`, `wyróżniki`), które są bezwzględnie renderowane w zielonym panelu parametrów PIM, niezależnie od schematu parametrów kategorii Allegro.
- W kontrolerze `offer-optimizer.controller.js` zaimplementowano świeży odczyt `freshProduct = await prisma.product.findUnique(...)` oraz bezstratny merge cech Vision z cechami PIM przed ostatecznym zapisem i zwrotem do klienta.

## Konsekwencje
- **Pozytywne:**
  - Brak kolapsu różnorodności w generowanych aukcjach (FAQ i opisy zachowują zróżnicowany, merytoryczny charakter).
  - Dane z etykiety frontowej są w 100% widoczne w UI i w Karcie Technicznej HTML bez konieczności ponownego ich szukania.
  - Zero marnowania tokenów w Agencie 1 na powtórne odpytywanie Google o parametry widoczne na packshocie.
  - Pełna zgodność ze 180 testami jednostkowymi potoku.
