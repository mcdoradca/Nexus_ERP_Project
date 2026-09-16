# ADR-087: SDS Compliance Audit – PhysChem Signs, DNEL SSOT Shield & Ecotox Protection

## Status
Zaakceptowany (Accepted) i wdrożony do produkcji.

## Kontekst i Problem
Szczegółowy audyt laboratoryjno-prawny oraz inspekcja compliance karty `8034055535424_SDS_SANDALO org.docx` (wydanie (6).docx) wykazały 4 krytyczne niezgodności formalno-merytoryczne dyskwalifikujące dokument z obrotu:
1. **Sekcja 9.1 (Utrata znaków ujemnych i brak uzasadnienia lepkości):**
   - Temperatura topnienia etanolu została sformatowana jako `114 °C` zamiast `-114 °C`.
   - Współczynnik podziału n-oktanol/woda (log Kow) dla etanolu został sformatowany jako `0,35` zamiast `-0,35`. Przyczyną była agresywna reguła normalizacji w `normalizePhysChemValue`: `replace(/^[\|\s\-:]+/, '')`, która myliła wiodący myślnik tabelaryczny ze znakiem wartości ujemnej.
   - Lepkość kinematyczna nie zawierała obligatoryjnego uzasadnienia prawnego braku danych zgodnie z Załącznikiem II do Rozporządzenia (UE) 2020/878 (*„Brak danych (właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu)”*).
2. **Sekcja 8.1 (Zlepianie substancji i wycięcie metanolu):**
   - Trzy odrębne substancje (salicylan benzylu, Polysantol oraz masa reakcyjna heksan-3-olu) zostały scalone pod jednym nagłówkiem `Substancja: salicylan benzylu`. Wynikało to ze standardowej granicy słowa `\b` w regexach podziału, która zawodziła przy nazwach chemicznych kończących się nawiasami (np. `(3:1)`, `(±) trans-3,3...`).
   - Całkowite wycięcie panelu DNEL i PNEC dla metanolu (CAS: 67-56-1) przez procedurę auto-remediacji w `SDSVerifierAgent.auditWithGemini`, gdzie model LLM zwracał skrócony tekst Sekcji 8, nadpisując wyodrębnione deterministycznie dane.
3. **Sekcja 12.1 (Artefakt nagłówka i fałszowanie danych ekotoksyczności):**
   - Pomiędzy wierszami badań ekotoksykologicznych etanolu wstrzyknięty został nagłówek strony `BLK0276-2 - SWEET HOME - PROFUMATORE AMBIENTE SANDALO:`, co prawnie sugerowało, że badanie `EC50 = 275 mg/l` dotyczyło gotowej mieszaniny, a nie czystej substancji (etanolu).
4. **Sekcja 12.3 (Współczynniki bioakumulacji BCF i log Kow):**
   - Występowanie prefiksów `Value:` oraz `=` przy wartościach liczbowych uniemożliwiało ekstrakcję współczynnika biokoncentracji BCF dla mieszanin izotiazolinonów (C(M)IT/MIT).

## Podjęte Decyzje Architektoniczne

1. **Ochrona wartości ujemnych w Sekcji 9.1:**
   - W metodzie `SDSProcessorEngine.normalizePhysChemValue` zastąpiono destrukcyjne usuwanie myślników regułą z negatywnym lookaheadem:
     `v = v.replace(/^[\|\s:]+/, '').replace(/^-(?!\d)/, '').replace(/[\|\s]+$/, '').replace(/\s*\|\s*/g, ', ');`
     Dzięki temu wiodące myślniki pustych komórek tabel są usuwane, a liczby ujemne (`-114 °C`, `-0,35`) pozostają w 100% nienaruszone.
   - W `processSection9` dodano scalanie rozbitych wierszy `Reason for missing data` oraz zabezpieczenie zwracania urzędowych uzasadnień braku danych dla lepkości kinematycznej.

2. **Uniwersalne granice tokenów chemicznych i Tarcza SSOT (Sekcja 8.1):**
   - W `extractSubstanceBlock` oraz `extractDnelPnec` zaktualizowano granice wykrywania tokenów nazw chemicznych z prostego `\b` na `(?:\b|[\s\|\-\)]|$)`. Umożliwia to bezbłędne rozdzielanie sąsiadujących substancji o nazwach IUPAC kończących się nawiasami lub myślnikami.
   - Wdrożono **Tarcze Deterministic SSOT Shield** w `SDSVerifierAgent.auditWithGemini`:
     Sekcje o krytycznym znaczeniu laboratoryjnym, prawnym i rejestrowym (`section_3`, `section_8`, `section_9`, `section_12`, `section_14`, `section_15`) są bezwzględnie chronione przed modyfikacją przez tekst generowany przez LLM (`remediatedSections`). Model AI zachowuje rolę audytora i doradcy (uwagi i zalecenia), ale nie ma prawa usunąć ani zniekształcić parametrów analitycznych.

3. **Ochrona parametrów toksykologicznych przed czyścicielami nagłówków (Sekcja 12.1):**
   - W `SDSDocxParser.cleanArtifacts` oraz `SDSProcessorEngine.cleanPdfArtifacts` wdrożono wzorce czyszczenia nagłówków stron z negatywnym lookaheadem dla akronimów toksykologicznych:
     `(?!(?:LC|EC|IC|LD|NOEC|NOAEL|LOAEL)\d*)(?:BLK\d+(?:-\d+)?|[A-Z]{2,6}\d{3,8}(?:-\d+)?)\s*-\s*[^\n]+`
     Zapobiega to przypadkowemu myleniu oznaczeń takich jak `LC50` czy `EC50` z identyfikatorami dokumentów i skutecznie usuwa nagłówki stron bez ingerencji w dane badawcze. Wszystkie 6 wyników badań dla etanolu (LC50 14200 mg/l, EC50 454 mg/l, EC50 275 mg/l, NOEC 250 mg/l, NOEC 96 mg/l, NOEC 11,5 mg/l) są bezpośrednio przypisane do substancji.

4. **Elastyczna normalizacja BCF i log Kow (Sekcja 12.3):**
   - Wprowadzono dwuetapowy matcher w `processSection12` uwzględniający zarówno standardowy zapis, jak i notację tabelaryczną z prefiksami `Value:` oraz `=`.

## Skutki i Weryfikacja
- Utworzono dedykowany zestaw testów weryfikujących 4 krytyczne punkty audytu: `tests/sds.audit_compliance_4_points.test.js` (5/5 podtestów zdanych pomyślnie).
- Przeprowadzono pełny regresyjny audyt testowy: 30 testów zdanych, 0 błędów, 2 pominięte pliki testowe (usunięte na życzenie użytkownika).
- Całkowity brak hardkodów na poziomie nazw plików, marek czy pojedynczych produktów.
