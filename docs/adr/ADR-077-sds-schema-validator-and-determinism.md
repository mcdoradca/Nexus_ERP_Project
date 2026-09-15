# ADR-077: Wdrożenie SDSSchemaValidator, Eliminacja Dryfu LLM i Wzmocnienie Determinizmu Kart SDS

## Kontekst
Tłumaczenie i adaptacja kart charakterystyki (SDS) zgodnie z Rozporządzeniem (UE) 2020/878, CLP oraz prawem krajowym (Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017) wymaga 100% powtarzalności.
W dotychczasowym procesie:
1. Brak schematu walidacyjnego typu runtime (Zod-equivalent) powodował, że halucynacje lub pominięcia generowane przez LLM w sekcjach opisowych (np. utrata podsekcji 11.2, gubienie jednostek stężeń, pomijanie dróg podania) nie były natychmiast blokowane, lecz przenikały do asemblacji pliku DOCX.
2. Sekcja 4 (Środki pierwszej pomocy) cierpiała na zjawisko podwójnej prawdy (Dual-Truth) – była jednocześnie wysyłana do promptu LLM w `sds.agent.js` oraz deterministycznie wyliczana na podstawie reguł klinicznych w `sds.service.js` (`processSection4`), po czym odpowiedź z LLM była po cichu nadpisywana.
3. Obowiązywała czerwona linia zakazu instalacji nowych zależności zewnętrznych (`npm install zod` zabronione), co uniemożliwiało dodanie gotowych bibliotek walidacji schematów.

## Decyzja Architektoniczna
1. **Natywny silnik walidacji kontraktu (`SDSSchemaValidator`):**
   - Utworzono bezkompromisowy, zero-dependency silnik `src/modules/sds/sds.schema.validator.js` sprawdzający integralność obiektów SDS.
   - Walidacja wejściowa LLM (`validateTranslatedSections`): weryfikuje obecność sekcji narracyjnych (`section_1_2`, `section_5`, `section_6`, `section_7`, `section_10`, `section_11`), obowiązkową obecność podsekcji `11.1` i `11.2` (substancje zaburzające funkcjonowanie układu hormonalnego), brak zniekształceń tabelarycznych `- -` w sekcji 1.2 oraz bezwzględny brak surowych terminów obcojęzycznych (`Pimephales promelas`, `not specified`, `rat`, `mouse`, `rabbit`, `oral`, `dermal`).
   - Walidacja ostateczna przed DOCX (`validateFinalSds`): sprawdza kompletność wszystkich 16 sekcji, limit $\le 6$ zwrotów P w Sekcji 2.2 (Art. 28 CLP), integralność składników z CAS/EC w Sekcji 3, obecność norm NDS lub urzędowej formuły negatywnej w Sekcji 8, obecność podsekcji 9.2.2 z LZO w Sekcji 9, podsekcję 12.6 w Sekcji 12, numer UN lub formułę wyłączenia w Sekcji 14, akty REACH/CLP w Sekcji 15 oraz pełne teksty zwrotów H w Sekcji 16.
2. **Separacja determinizmu i usunięcie sekcji 4 z promptu LLM:**
   - Sekcja 4 została wycofana z tablicy `toTranslate` w `prepareAgentPayload`.
   - W `SYSTEM_PROMPT` w `sds.agent.js` zaktualizowano zakres odpowiedzialności modelu – model zajmuje się wyłącznie czystą narracją ratowniczo-proceduralną (5, 6, 7, 10, 11 i 1.2).
3. **Architektura Fail-Fast z asercjami runtime:**
   - Każde naruszenie schematu natychmiast rzuca `SDSSchemaValidationError` z listą szczegółowych naruszeń, uniemożliwiając wyemitowanie niekompletnego dokumentu Word.

## Konsekwencje
- Wyeliminowano źródło losowych regresji i niepowtarzalności tłumaczeń.
- Zachowano pełną zgodność z zasadą ZERO-BYPASS i brakiem zewnętrznych zależności w `package.json`.
- Wszystkie 122 testy systemowe, 12 testów audytu, 6 testów walidatora schematu, 7 testów prawnych, 4 testy zero hardcodes i 6 testów RTF przechodzą w 100% (PASSED).

## Status
Zaakceptowane i wdrożone w środowisku produkcyjnym (2026-09-15).
