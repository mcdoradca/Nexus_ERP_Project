# ADR 033: Węzeł 8 jako Ingredient Mapper i Architektura SSOT 6.0 (Photoroom)

## Status
Zatwierdzony i wdrożony.

## Kontekst
Wcześniejszy model generowania scenografii (Agent 8) opierał się na pracy LLM dla **każdego wygenerowanego zdjęcia**. Było to kosztowne, niestabilne i prowadziło do problemów m.in. z AI Act oraz UCPD (halucynowanie składników niewymienionych w PIM, zakrywanie produktu). Ponadto SSOT 5.0 (ADR 027) rozwiązywał problem "monokultury wizualnej", ale nie uwzględniał głębokiego mapowania składników z systemu ERP, generując sterylne tła bez charakteru.

## Decyzja
Wprowadzono całkowitą restrukturyzację Węzła 8 (Agenta 8) oraz silnika Photoroom (SSOT 6.0):
1. **Agent 8 jako Ingredient Mapper (One-Shot per SKU):** Agent nie układa już promptów per obraz. Otrzymuje pełen PIM, wykonuje audyt (temperature: 0.2) i zwraca czysty JSON ze zmapowanymi składnikami oraz filtrami estetycznymi. Uruchamiany jest tylko raz w cyklu, przez supervisor.service.js (Węzeł 0).
2. **Samouczący się Słownik:** Wprowadzono plik `learned_props.json`. Gdy Agent 8 natrafi na nowy, nieznany systemowi składnik, wygenerowana "łatka" ląduje w bazie. Silnik Photoroom ładuje zaktualizowany słownik ( doucza się ).
3. **SSOT 6.0:** Pełne przekazanie kontroli matematyce `photoroom.prompts.js`. Kod losuje (`mulberry32` + FNV-1a Hash) ułożenia, światło i tła w sposób deterministyczny. Dołączono wymuszanie integracji AI Relight (`lighting.mode=ai.auto`) oraz wdrożono `sharp` dla Slotu 3 (cięcie oryginalnego zdjęcia pod tryb Makro detalu).
4. **Zgodność AI Act:** Wymuszono zgodność z art. 50 AI Act w kontrolerze (doklejanie noty prawnej do opisu HTML jeśli korzystano z wygenerowanej scenografii).

## Konsekwencje
- **Wydajność:** Usunięcie LLM z pętli generującej Photoroom całkowicie znosi opóźnienia modelowe przy samym zapytaniu.
- **Koszt:** Optymalizacja architektury pozwoli zaoszczędzić ogromne zasoby tokenów (1x wywołanie per produkt, a nie per zdjęcie).
- **Zarządzanie stanem:** Silnik opiera się teraz w 100% o deterministyczną matematykę (hashing). Zyskaliśmy w pełni przewidywalny a zarazem różnorodny system estetyki.
