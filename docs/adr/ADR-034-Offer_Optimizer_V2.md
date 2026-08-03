# ADR-034: Architektura i Potok Modułu Offer-Optimizer-V2

## Kontekst i Problem
Moduł `offer-optimizer` w pierwszej iteracji wykazywał zbytnie poleganie na "wiedzy wbudowanej" modeli językowych (LLM), co prowadziło do halucynowania parametrów technicznych (składników, pochodzenia, marki), nieprzestrzegania obostrzeń prawnych (CLP, GPSR, ustawa o kosmetykach) oraz wysokiego zużycia tokenów spowodowanego zbędnym użyciem opcji "thinking".
Zaprojektowano moduł `offer-optimizer-v2`, który wprowadza sztywną kontrolę i walidację po stronie kodu, izolując model jako aparat do tworzenia sekcji narracyjnych (Copywriting, Psychologia), a nie jako źródło wiedzy.

## Zasady Architektoniczne
1. **Model LLM nigdy nie jest źródłem faktów.** Składy (INCI), dane producenta, pojemności, właściwości chemiczne muszą pochodzić w 100% z zaufanego źródła: danych wejściowych z BaseLinkera (PIM) lub RAG (ściśle precyzyjnych słowników INCI/obostrzeń). 
2. **Read-Only BaseLinker.** Zapis do platformy zarządzającej ofertami jest bezwzględnie zablokowany sprzętowo za pomocą stałej `WRITE_BACK_ENABLED = false;` z rzucaniem twardego błędu, gwarantując integralność danych klienta do momentu cutoveru.
3. **Podejście "Zero-Tolerance" do Bezpieczeństwa (S-1 do S-8):** Moduł chemiczny (potok INCI) nie ma progów tolerancji. W przypadku niezgodności na bramkach (GATE-1/GATE-2), wykrycia obostrzeń (SOT 04/06) czy nieznalezienia `eu_responsible_person`, potok wstrzymuje się oczekując na rozwiązanie typu HITL (Human In The Loop).

## Potok Wykonawczy (Pipeline) i Orkiestracja
Orkiestracja działa w całości w kodzie (Node 0), obsługując deterministyczne Pre-Walidatory i Post-Walidatory (bez użycia LLM). Kolejność węzłów:

1. **EXTRACT:** Pobranie danych SKU. Sprawdzane są pre-walidatory (`ean_checksum`, `route_chemical`).
2. **A1 (Autofill - OSINT):** Uzupełnia brakujące dane poza asortymentowe (jak kraj pochodzenia) z zachowaniem pełnej ścisłości weryfikacyjnej. Posiada ograniczenia `thinkingBudget`. 
3. **A2 (Sentiment):** Pobiera nastroje rynkowe (flash, zero thoughts). Posiada rygorystyczny limiter i wychwytuje alarmy bezpieczeństwa (`SAFETY_SIGNAL_IN_REVIEWS`).
4. **A4 (INCI Parser):** Służy tylko asortymentom z `is_chemical = true`. Analizuje składy.
5. **A5 (LegalSanitizer):** Węzeł klasy Pro z maksymalnym budżetem myślowym (np. `1024-2048`), dba o obostrzenia prawne na poziomie całego tekstu, chroniąc potok przed zakazanymi claimami.
6. **A6 (Copywriter):** Koncentruje się WYŁĄCZNIE na sekcjach narracyjnych (Sekcje 1, 2, 4). Sekcje faktograficzne (Sekcja 3: bezpieczeństwo, Sekcja 5: skład INCI znak w znak, Sekcja 6: podmiot odpowiedzialny) **są składane deterministycznie przez kod z szablonu, a nie model.**
7. **Node 0 (Zamrażanie - Freeze):** Kod oblicza hashe `sha256` dla sekcji 3, 5 i 6 z wymogiem absolutnej nienaruszalności. 
8. **A7 (Psychology):** Optymalizuje behawioralnie z wykorzystaniem efektów takich jak Pratfall. Działa jedynie na niezamrożonych sekcjach.
9. **A10 (Sentinel):** Finalna analiza semantyczna i korekta w formie patchowania. Węzeł Pro z umiarkowanym budżetem `thinking`. Walidatory przed wyjściem pilnują by sekcje zamrożone pozostały nietknięte (`verify_frozen`), wykrywają medyczne claimy (`scan_medical_claims_lexical`) i testują spójność merytoryczną (`validate_grounded_facts`, `diff_numeric`).

## Warstwa Bazy Wiedzy (RAG v2)
- Do Retrievalu (wyszukiwania po RAG) dopuszczone są wyłącznie chunki słownikowe (np. opisy INCI).
- Chunki typu **RULE** oraz **GATE** (Bramki, Zakazy Prawne) są wstrzykiwane bezpośrednio do **statycznych prefiksów** konkretnych agentów i nie podlegają wyszukiwaniu `searchKnowledge`. To całkowicie eliminuje "loterię wektorową" dla kluczowych nakazów prawnych.
- Zaimplementowano semantyczne dzielenie chunków Markdown (po nagłówkach), unikając ucinania reguł chemicznych/prawnych w połowie i gubienia kontekstu. Dopasowania składników oparte są na `exact-match` (po kanonizacji), odrzucając zawodny similarity match na nazwach z przedrostkami.

## Skutki Architektoniczne
Zastosowanie ścisłego routingu, twardych walidatorów i rygorystycznego podziału na węzły narracyjne kontra składanie z szablonu całkowicie uszczelnia system. Skraca czas działania oraz zdejmuje ok. 50-70% kosztu tokenów myślenia, przy absolutnej zgodności z prawnymi wymogami rynku UE. Dodatkowo model A8 i A9 (wymogi Vision i AI Act) zostały przesunięte na horyzont po stabilizacji tekstowej (Cutover CZĘŚCIOWY).

## Uzupełnienie (HotFix) - Ochrona przed zjawiskiem Context Bleed
W trakcie analizy wykazano, że odcięcie agentów twórczych (A5, A6, A7, A10) od pierwotnych, twardych danych identyfikacyjnych produktu (EAN, nazwa, marka, pojemność) prowadzi do zjawiska gubienia kontekstu, w którym to model w oparciu o same parametry analityczne (np. sentyment, chemię) samodzielnie dopowiada i "zmyśla" produkt będący przedmiotem opisu.
**Decyzja Architektoniczna:** Do każdego węzła, który wchodzi w interakcję z LLM (nawet post-walidatora), bezwzględnie wstrzykiwane są zmienne źródłowe z PIM (BaseLinkera): `gtin_ean`, `product_name`, `brand`, `capacity` i `line`. Zapobiega to całkowicie zjawisku przypisywania analiz do fałszywych produktów.

## Uzupełnienie (2026-08-03) - Synchronizacja Danych z Frontend (Real-Time UI Binding)
W początkowej architekturze potoku v2 (Orchestrator) istniał problem z luką komunikacyjną pomiędzy stanem wewnętrznym backendu a interfejsem użytkownika (React). Zatwierdzone przez węzeł A1 i zwalidowane (przez bramki bezpieczeństwa) składniki INCI pozostawały w pamięci wstrzymanego orkiestratora (`this.state.extracted_data.inci`), nie pojawiając się w widoku PIM, dopóki całkowity proces się nie zakończył (co było problematyczne przy powiadomieniach typu HITL).
**Decyzja Architektoniczna:** Wdrożono stałe i bezpośrednie wstrzykiwanie wyników OSINT (obiekt `extracted_data`) do każdego emitowanego statusu WebSocket (`PIPELINE_STATUS`). Dodano po stronie frontendu (`UnifiedProductPipelineView.jsx`) nasłuchiwacz uaktualniający w czasie rzeczywistym parametry techniczne w UI (w tym pola `INCI` i `Skład`), omijając konieczność oczekiwania na asynchroniczne zakończenie działania Agenta 10 (Sentinel). Zapewnia to natychmiastową wizualną spójność danych tuż po wyjściu z bramek weryfikacyjnych (CosIng).
