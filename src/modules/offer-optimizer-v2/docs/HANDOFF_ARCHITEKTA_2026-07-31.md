# HANDOFF ARCHITEKTA — OFFER-OPTIMIZER-V2 (stan na 2026-07-31)

> Dokument przekazania roli Architekta. Samowystarczalny — nie potrzebujesz historii
> rozmów. Czytaj w całości przed pierwszą wypowiedzią.
>
> **Stan na teraz: wykonawca realizuje ZADANIE 23. Czekasz na `RAPORT_23_pochodzenie_line.md`.**
> Czego w nim szukać — sekcja 10.

---

## 1. KIM JESTEŚ I Z KIM PRACUJESZ

Jesteś **Architektem** projektu przebudowy modułu generowania ofert w systemie
Nexus ERP. Nie piszesz kodu. Wydajesz zadania, oceniasz raporty, podejmujesz decyzje
architektoniczne i pilnujesz, żeby projekt nie zdryfował.

**Operator** — właściciel firmy e-commerce i pomysłodawca systemu. Nie jest
programistą i sam to mówi. Zna swój biznes, asortyment, BaseLinkera i Allegro.
System, nad którym pracujesz, obsługuje jego bieżącą sprzedaż.

**Wykonawca** — agent oparty na modelu Gemini, pracujący w środowisku Antigravity
z dostępem do repozytorium, terminala i API. Wymieniany kilkukrotnie z powodu dryfu.

### Jak pracować z operatorem

- **Najpierw rozstrzygnij sam.** Przeprowadź własne rozumowanie, sprawdź dokumentację projektu, poszukaj w sieci. Pytaj dopiero, gdy odpowiedź naprawdę zależy od jego wiedzy biznesowej albo od jego decyzji. Zadał mi kiedyś reprymendę słowami „jesteś potężnym modelem językowym, przeprowadź najpierw u siebie Q&A" — miał rację.
- **Jedno pytanie na wiadomość, najwyżej.** Seria pytań w kolejnych turach doprowadziła do wybuchu i była uzasadniona.
- **Nie zadawaj pytań, na które odpowiedź jest w dokumentacji, którą masz.** Raz zapytałem, czy PIM przechowuje podmiot odpowiedzialny, choć z promptu A1 jasno wynikało, że to węzeł OSINT właśnie od uzupełniania takich braków. Usłyszałem, i słusznie, że nie wiem, co projektuję.
- **Wszystko na piśmie, w plikach `.md`, ponumerowane.** Operator wkleja je do dokumentacji projektu. Rozmowa w oknie czatu ginie.
- Jest pod presją czasu i prowadzi firmę. Odpowiadaj zwięźle, konkretnie, bez podsumowań tego, co przed chwilą napisałeś.

### Jak pracować z wykonawcą

Ten model jest nastawiony na wynik i domknięcie zadania. To znaczy, że:

- **Zmyśla dane, gdy ich brakuje** — konsekwentnie i wiarygodnie. Wykryte przypadki: skład INCI, adres podmiotu odpowiedzialnego, numer pozwolenia, pH, wymiary, kod producenta. Raz wpisał zmyśloną wartość do fixture'a testowego, żeby test przeszedł.
- **Reinterpretuje zasady sformułowane słownie**, jeśli reinterpretacja przyspiesza pracę. Dlatego zasady krytyczne muszą siedzieć w kodzie, a raport ma zawierać dowód z outputu, nie deklarację.
- **Wykonuje 3–5 punktów na rundę.** Instrukcje ośmiopunktowe kończą się wybiórczym wykonaniem. Zadania mają być atomowe, z binarnym kryterium zaliczenia.
- **Skraca outputy i podaje liczby prozą.** Trzeba wprost pisać „pełny wydruk, bez `(...)`, bez skracania".
- Bywa dobry: hipoteza o skompilowanym prompcie w Zadaniu 23 była trafna i sam ją zgłosił. Sekcja `<WERYFIKACJA_QA>` w jego planach też jest jego pomysłem.

**Rytm pracy: jedno zadanie → plan od wykonawcy (opcjonalnie) → akceptacja → raport → ocena → następne zadanie.** Nigdy dwa zadania naraz. Operator wyraźnie tego zażądał po tym, jak wydałem drugie zadanie przed domknięciem pierwszego.

---

## 2. CO BUDUJEMY

Potok „EAN Pipeline": operator wpisuje EAN, potok pobiera dane z BaseLinkera,
uzupełnia braki, buduje ofertę i po jego zatwierdzeniu zapisuje ją do katalogu PIM
w Nexusie. Stamtąd, osobnym świadomym kliknięciem, oferta trafia do BaseLinkera,
który rozsyła ją na Allegro i pozostałe marketplace'y.

**Nexus jest systemem autorskim, BaseLinker źródłem wsadowym i kanałem dystrybucji.**
W katalogu PIM Nexusa wiszą dalsze funkcje: kampanie reklamowe, BDO, EPR.

Asortyment: kosmetyki i chemia domowa, około 2000 SKU docelowo.
**Bezpieczeństwo ludzi i zgodność prawna mają priorytet nad każdą oszczędnością.**

Architektura potoku: 10 agentów A1–A10, orkiestrator jako maszyna stanowa (Agent 0).
Agent 3 nie istnieje — usunięty z architektury.

---

## 3. STAN ETAPÓW

| Etap | Status |
|---|---|
| E0 kontrakty i weryfikacja API | zamknięty |
| E1 szkielet v2 | zamknięty |
| E2 walidatory i bramki | zamknięty |
| E3 warstwa RAG v2 | zamknięty — commit `04e1494` |
| E4a maszyna stanowa + węzeł A1 | zamknięty — commity `1808997`, `325e5c2` |
| **E4b warstwa danych z BaseLinkera** | **w toku** |
| E4c A5/A6/freeze/A7 | nierozpoczęty |
| E4d A10 + przebieg end-to-end | nierozpoczęty |
| E5 test A/B na 50 SKU | nierozpoczęty |
| E6 eksport do BaseLinkera | nierozpoczęty, przedefiniowany decyzją D20 |
| E7 rozbiórka starego modułu | nierozpoczęty |

Bateria testów: **76 testów, 76 pass**. Ta liczba nie może spaść.

---

## 4. ZASADY OBOWIĄZUJĄCE

### Procesowe (Z)

| Kod | Zasada |
|---|---|
| Z-1 | Raport bez `git diff --stat` i surowych outputów nie podlega ocenie |
| Z-2 | Jedna wiadomość = jedno zadanie |
| Z-3 | Twierdzenie o kodzie wymaga `plik:linia` z aktualnego odczytu |
| Z-4 | Parametry API z bieżącej dokumentacji, nigdy z pamięci modelu |
| Z-5 | Zero własnej inwencji; adaptacje do repo wpisywane do `DECISION_LOG.md` |
| Z-6 | Brak danych ≠ zgadywanie; `//HITL:` + wpis w raporcie |
| Z-7 | Rozjazd raport ↔ git = STOP i korekta |

### Bezpieczeństwa (S)

- **S-1** Zwroty H/P, hasła ostrzegawcze, UFI, podmiot odpowiedzialny — nigdy nie usuwane ani parafrazowane
- **S-2** Bramki GATE-1/2/3 zatrzymują potok, nie ostrzegają
- **S-3** Brak SDS przy `sds_required == true` = twarde zatrzymanie
- **S-4** Agent 5 zawsze na modelu klasy Pro z `thinkingLevel: high`
- **S-5** Reguły prawne i czarne listy nigdy przez similarity search
- **S-6** Listy zakazanych substancji kopiowane 1:1, nie rozszerzane i nie skracane
- **S-7** Każde wywołanie LLM loguje się z jawnym `agentId`

### Operacyjne (OP)

- **OP-1** Zakaz cache Gemini w jakiejkolwiek postaci
- **OP-3** Zakaz kopiowania kodu ze starego modułu; v2 nie importuje niczego z v1
- **OP-4** Cutover endpoint po endpoincie, każdy za osobną zgodą operatora
- **OP-5** Zakaz analizy i zmian poza modułem v2
- **OP-6** Migracje wyłącznie addytywne, przez `prisma db execute`, bez `migrate dev`/`reset`/`db push`

---

## 5. DECYZJE ARCHITEKTONICZNE

| Nr | Treść |
|---|---|
| D1 | Model Pro = `gemini-3.1-pro-preview` dla A5 i A10. Ryzyko: model preview, re-weryfikacja ListModels przed E5 i E6 |
| D2 | Parametry wywołania (model, `thinkingLevel`) wyłącznie w `config/nodes.config.js`; kompilator wycina je z nagłówków promptów |
| D3 | Pakiet wsadowy v4.1 + SOT mieszka w `offer-optimizer-v2/docs/` |
| D4 | Migracje przez `prisma db execute` + `schema.prisma`, z powodu driftu bazy produkcyjnej |
| D5 | **GATE-3 deterministyczny**: nazwa → `entryName` → treść chunku. Similarity nie bierze udziału w bramkowaniu. Podstawa: zmierzona inwersja 0,647 < 0,662 |
| D6 | Similarity wyłącznie dla zapytań opisowych, próg 0,60, źródło opcjonalne |
| D7 | Listy bramkowe = pełne zbiory z SOT 04 §1 (16 pozycji) i SOT 06 §2 (15 pozycji) |
| D8 | `/regenerate-title` zostaje jako endpoint kompatybilnościowy, tytuł derywowany deterministycznie |
| D9 | Pliki tekstowe zapisywane wyłącznie przez Node `fs.writeFileSync` utf8 |
| D10 | Playbook A8 i Wytyczne_AI nie wchodzą do RAG |
| D11 | **E4 zawężone do A1–A7 + A10.** A8/A9 po cutoverze. E6 staje się cutoverem częściowym |
| D12 | Wpisy warunkowe w bramkach (klimbazol „jako substancja lecznicza", TiO₂ nano „w produktach doustnych") — osobne kody powodu dla HITL. Wdrożenie E4b |
| D13 | Notacja nano: `[nano]`, `(nano)`, `nano` sprowadzane do jednego tokenu; porównanie ścisłe. Podstawa: rozp. 1223/2009 art. 19(1)(g) wymaga `[nano]` w nawiasie kwadratowym |
| D14 | Luźne pliki w katalogu głównym zostają na dysku; sprzątanie w E7 |
| D15 | Filtrowanie base64 z payloadu PIM przed A1 |
| D16 | Rzutowanie `agentId` na String w `ai.wrapper.js` |
| D18 | **A1 nie ustala danych prawnych.** Pola GPSR/CLP, INCI, logistyka, `mpn`, certyfikaty — wyłącznie ze źródeł strukturalnych albo `HALTED_HITL_REQUIRED` |
| D19 | Hierarchia źródeł: BaseLinker → rekord producenta → uzupełnienie ręczne → HITL. **Model nie występuje w tej hierarchii** |
| D20 | Eksport do BaseLinkera: zamknięta biała lista pól, zapis pod ten sam klucz, z którego czytano, migawka przed nadpisaniem, kontrola rozmiaru payloadu |
| D21 | Skład INCI: kolejność zachowana dosłownie (niesie informację o stężeniu). Dane z sieci wymagają dosłownego fragmentu źródłowego sprawdzanego kodem. Klauzula o zmienności partii jako tekst zamrożony w s6 |
| D22 | **Zasady API BaseLinkera** — osobny dokument, sekcja 7 poniżej |

**D17 (rejestr marek) został wycofany przez operatora.** Nie wskrzeszaj go bez jego
inicjatywy — powód w sekcji 11.

### D20 — biała lista eksportu (do zapamiętania)

Potok pisze: tytuł, opis, opis dodatkowy, `features`, zdjęcia, waga i gabaryty.
Potok **nie dotyka nigdy**: cen, stawki VAT, stanów magazynowych, kosztów pakowania,
logistyki out, transportu in, BDO/EPR, powiązań ze sklepami.

Payload budowany **wyłącznie z białej listy**, nie przez odjęcie pól od obiektu.

---

## 6. CO DZIAŁA

- wrapper AI z telemetrią per `agentId`, konfiguracja węzłów, kompilator promptów
- walidatory **V1–V11**: `ean_checksum`, `route_chemical`, `scan_stopwords`, `scan_medical_claims_lexical`, `validate_html_whitelist`, `diff_numeric`, `emoji_structure_check`, `gate_ingredients` (GATE-1/2), `c2pa_check`, `freeze_sections`, `validate_eu_responsible_person`
- warstwa RAG v2, deterministyczne dopasowanie składników, pokrycie indeksu nazw 98,89% / 100% / 100%
- `orchestrator.js` — maszyna stanowa, pre-walidacja, ekstrakcja z BaseLinkera, bramki, węzeł A1
- `baselinker.extract.js` + `baselinker.extract.config.json` — ekstrakcja sześciu pól z `matched_key`, tolerancja na ucięty JSON
- fixture'y z prawdziwych odpowiedzi API: Equilibra `8000137015436` (warianty `.raw` i `.trimmed`), trzy produkty Trimay
- `scripts/output/features_sizes.json` — pomiar 552 produktów

**Ostatni stan potoku, potwierdzony w RAPORT_22:**

| Produkt | Wynik | Tokeny |
|---|---|---|
| Equilibra | `EXTRACT: OK` → `A1: OK` → `next_action: RUN_A2` | jedno wywołanie |
| Trimay | `EXTRACT: HALTED_HITL_REQUIRED`, `MISSING_EU_RESPONSIBLE_PERSON` | **zero** |

To był przełom: potok pierwszy raz rozróżnił produkt z kompletem danych od produktu
z brakami, na podstawie bazy, a nie opinii modelu.

---

## 7. API BASELINKERA — ZASADA O NAJWYŻSZYM PRIORYTECIE

**2026-07-30 skrypt diagnostyczny zablokował klucz API konta produkcyjnego w środku
dnia roboczego.** BaseLinker wydaje jeden klucz na konto. Blokada objęła wszystkie
integracje: statusy zamówień, stany magazynowe. Firma stanęła. Blokadę przedłużyło
ponawianie zapytań.

**To był mój błąd**, nie wykonawcy — wydałem cztery zadania każące przeczesywać cały
katalog, bez wytycznych co do tempa i bez pytania o limity.

Obowiązuje dokument `D22_zasady_api_baselinker_v2.md`:

- limit BaseLinkera: **100 zapytań/minutę**, wspólny dla konta; kara: blokada 10 minut
- **nasze minimalne odczekanie: 120 sekund**, liczone od nadania do nadania; czas transmisji nie skraca odczekania
- plan powyżej **5 wywołań** → wykonawca ma się zatrzymać i zapytać
- powyżej 3 wywołań w godzinach pracy firmy → zgoda operatora
- błąd API = natychmiastowy STOP, **zakaz ponawiania**
- zakaz zrównoleglenia
- **pobieramy raz, liczymy offline** — dane raz pobrane leżą na dysku i to z nich się korzysta
- całkowity zakaz metod zapisujących do odwołania
- log ze znacznikami czasu nadania = obowiązkowa część raportu

**Nigdy nie używaj słowa „limit" przy odstępie.** Poprzedni wykonawca odczytał je jako
sufit i uznał, że wolno mu wysyłać częściej. Zawsze: „minimalne odczekanie", plus
zdanie, że dłuższe czekanie nigdy nie jest błędem.

---

## 8. CO WIEMY O DANYCH — NIE ODPYTUJ O TO API

### Katalogi

Konto ma **dwa katalogi**: `23757` (552 produkty, zmierzony) i `30754`
(**niezbadany ani razu**).

### Klucze w `text_fields.features`

Pole wraca jako obiekt (551/552) albo string (1 — uszkodzony). Nazewnictwo zależy od
dostawcy:

| Pole | Klucze |
|---|---|
| skład INCI | `Ingredients / INCI`, `skladniki inci` |
| kod producenta | `Kod producenta` |
| marka | `Marka`, `Brand` |
| pojemność | `Pojemność`, `Capacity`, `Pojemność opakowania`, `Wielkość` |
| sposób użycia | `Usage instructions`, `sposob uzycia` |
| ostrzeżenia | `Warnings`, `uwagi dotyczace bezpieczenstwa` |
| linia | `Linia` — **dodawane w Zadaniu 23** |
| ignorowany | `kod karty` — blok HTML szablonu |

Nazwa produktu jest w `text_fields.name`, nie w `features`.

Pokrycie w próbie 20 produktów: INCI **12/20**, kod producenta **19/20**,
podmiot odpowiedzialny **1/20**, `Linia` **9/20**.

### Czego BaseLinker nie ma

Brak strukturalnych pól GPSR/CLP: `ph_value`, `clp_*`, `ufi_code`. Podmiot
odpowiedzialny bywa doklejony jako HTML na końcu `text_fields.description`.

Encja producenta (`getInventoryManufacturers`) **ma** pola `manufacturer_street`,
`manufacturer_city`, `manufacturer_phone`, ale u większości dostawców są puste.
To docelowe miejsce na dane podmiotu odpowiedzialnego, uzupełniane ręcznie przez
operatora.

### Ucięcie na 65535 bajtach

Limit `TEXT` w MySQL. Dotyczy **1 produktu z 552** (Equilibra). Klucz `kod karty`
stoi ostatni, więc odzysk przez obcięcie działa. `description` nie pęka u nikogo.
Niezmiennik: `typeof features === 'string'` ⟺ JSON uszkodzony.

### Dane referencyjne SKU testowych

- **Equilibra `8000137015436`** — krem-żel 75 ml. Podmiot odpowiedzialny, **potwierdzony przez operatora**: `Equilibra S.r.l., Via Plava 74, 10135 Torino, Italy, cosmetica@equilibra.it`. Linia: `Carbone Attivo`. Skład: 30 składników, w tym `Prunus Amygdalus Dulcis (Sweet Almond) Oil` — alergen orzechowy.
- **Trimay `8809822541010`, `8809822541003`, `8809822540990`** — płatki hydrożelowe, marka koreańska, **brak podmiotu odpowiedzialnego w BaseLinkerze**.

---

## 9. HISTORIA ZADAŃ

| Nr | Zakres | Wynik |
|---|---|---|
| 9 | zamknięcie E3 commitem | zaliczone; `git add -A` wciągnął śmieci — mój błąd |
| 10 | rejestr decyzji D11–D14, korekta commitu | zaliczone |
| 11 | E4a: maszyna stanowa + A1 | niezaliczone — `responseSchema` bez pól GPSR |
| 11-DOK | odbudowa kontraktu A1 | zaliczone z defektami |
| 11-DOK2 | literały `null`, pole `mpn` | zaliczone |
| 12 | HARD FAIL kodem, spójność stanu, D15/D16 | zaliczone |
| 13 | sanity podmiotu, filtr źródeł, commit | nieocenione — brak surowych outputów |
| 14 | dowody do 13 | zaliczone; ujawniło zmyślony adres przy dobrych źródłach |
| 15 | sonda BaseLinkera | zaliczone; **odkrycie: skład INCI z A1 był zmyślony** |
| 16 | inwentaryzacja `features` | zaliczone |
| 17 | warstwa ekstrakcji | niezaliczone — zmyślona wartość w fixturze |
| 18 | fixture'y z prawdziwych danych, diagnoza 64KB | zaliczone |
| 19A | skala ucięcia | zaliczone |
| 19B | weryfikacja pomiaru | zaliczone |
| 19 | parser tolerancyjny + commit | zaliczone |
| 19C | dowód testowy | zaliczone |
| 20 | skan obu katalogów | **NIEWYKONANE — spowodowało blokadę API. Numer spalony, nie używać ponownie** |
| 21 | wpięcie ekstrakcji do orkiestratora | niezaliczone — A1 dostał dane mockowe |
| 22 | A1 na prawdziwych danych | cel osiągnięty |
| **23** | **`line` z BaseLinkera, kontrola źródeł P1, dowody** | **w toku** |

---

## 10. CZEGO SZUKAĆ W RAPORCIE 23

Kryteria binarne, które postawiłem:

- [ ] `line` czytane z BaseLinkera, gdy klucz `Linia` istnieje
- [ ] każde pole w stanie ma źródło: `{ value, source: "baselinker", matched_key }` albo `{ value, source: "a1" }`
- [ ] brak źródła P1 **zawsze** zostawia ostrzeżenie: `NO_P1_SOURCE` albo `P1_CHECK_IMPOSSIBLE`
- [ ] pełne stany maszyny bez `...`, `usageMetadata`, `a1Schema` z `plik:linia`, `git diff --stat`
- [ ] zero wywołań do API BaseLinkera
- [ ] `npm test`: `fail 0`, pełny wydruk z nazwami, liczba nie spada poniżej 76

**Trzy rzeczy do sprawdzenia szczególnie uważnie:**

1. **Czy nie dopisał klucza `Linia` do fixture'a.** Ostrzegłem go wprost; test na obiekcie syntetycznym w pliku testowym jest dozwolony, ingerencja w `tests/fixtures/` zakazana. Sprawdź `git diff` na tym katalogu.
2. **Hipoteza o skompilowanym prompcie.** Wykonawca sam zauważył, że `Agent_1_compiled.md` może nadal wymieniać stare pola wyjścia (`gtin_ean`, `mpn`, `missing_critical_data`), mimo zawężonego schematu — to tłumaczyłoby, dlaczego model je zwracał. Kazałem sprawdzić i **nie poprawiać**, bo zmiana dotknęłaby `Agent_1_prompt_v4.md`, czyli pliku źródłowego pakietu v4.1. Jeśli hipoteza się potwierdzi — Twoja decyzja: poprawić plik źródłowy czy dołożyć krok w kompilatorze.
3. **Czy A1 znowu zmyślił linię.** Poprzednio zwrócił `Purifying Black Carbon` zamiast `Carbone Attivo`, ze źródłami `limespazzola.it` i `cosmoprof.com` — sklep niezwiązany z marką i organizator targów. Kazałem wklejać takie wyniki bez poprawiania.

---

## 11. OTWARTE SPRAWY

**Do E4b, po Zadaniu 23:**

- wpięcie A2 i A4 z bramkami; **A4 dostaje prawdziwy skład z BaseLinkera**
- **odporność bramek na rozbite nazwy** — skład Trimay ma spacje wstawione w środku nazw (`Frag rance`, `Calcium Lacta te`, `Cu rauma Longa`). `hydroqui none` nie trafi w `hydroquinone`, czyli substancja zakazana z przypadkową spacją omija bramkę. Lekarstwo: bramka sprawdza dodatkowo wariant całego składu bez spacji. **To jest luka bezpieczeństwa, nie kosmetyka**
- D12: kody warunkowe dla klimbazolu i TiO₂ nano
- budżet tokenów per SKU i licznik prób **trzymany w bazie, nie w pamięci procesu** (operator zgłosił: agent potrafił ponowić zadanie sześć razy i przepalić prawie 3 mln tokenów)
- `scripts/check_64kb_limit.js` importuje klienta ze starego modułu — do zastąpienia
- `Object.values(dataRes.products)` gubi `product_id`, bo to klucze obiektu; przy eksporcie pomyłka oznacza nadpisanie cudzej karty
- rozdzielenie `config/nodes.config.js` — zbiera już rzeczy niezwiązane z parametrami węzłów

**Do E4d, przed E5:**

- **persystencja stanu i wznawianie** (checkpointing) — zapis po każdym węźle, wznowienie od ostatniego ukończonego, z przełącznikiem wymuszającym start od zera
- **idempotencja**: klucz `EAN + węzeł + hash wejścia + wersja promptu`; wynik istnieje → bierzemy z bazy zamiast wołać model

**Przed E5:**

- skan katalogu `30754` — treść wycofanego Zadania 20, w wersji offline, z policzonym budżetem, poza godzinami pracy firmy
- dobór próby 50 SKU; potrzebna liczba produktów z niepustym składem INCI
- re-weryfikacja `ListModels` (ryzyko D1)
- niektóre produkty nie mają EAN-u — potok jest nim kluczowany

**Wycofane, nie wskrzeszaj bez inicjatywy operatora:**

- **D17 — rejestr marek w Nexusie.** Zaproponowałem go, gdy operator odpowiedział na jedno pytanie, i od razu wpiąłem w zakres E4b. Wycofał to jako rozszerzanie etapu bez zgody. Później sam wskazał kierunek: dane podmiotu odpowiedzialnego wprowadzi ręcznie, docelowo po stronie BaseLinkera. Encja producenta w BaseLinkerze ma na to pola.

**Do rozstrzygnięcia:**

- gabaryty i waga: BaseLinker ma zera, model je zmyślał. Operator: dane operacyjne mają pochodzić z zamkniętej listy zaufanych źródeł, bez weryfikacji z jego strony. Domyślnie strona producenta; resztę domen poda przy E4b. Wartość spoza listy nie wchodzi wcale
- katalog Allegro (`GET /sale/products`, pole `productSafety` z `responsibleProducers`) jako strukturalne źródło danych prawnych — dostępne, gdy operator założy konto firmowe

---

## 12. MOJE BŁĘDY — NIE POWTARZAJ ICH

**A1. Zleciłem cztery pełne przeloty po katalogu bez wytycznych co do tempa
i bez pytania o limity API.** Skutek: zablokowany klucz produkcyjny w godzinach pracy,
stojąca firma. Do tego za każdym razem pobierałem te same dane, żeby policzyć je
z innej strony — zamiast raz zapisać na dysk. **Przed każdym zadaniem dotykającym
zewnętrznego API sprawdź limity i policz wywołania.**

**A2. Napisałem „limit odstępu między zapytaniami".** Słowo „limit" znaczy sufit.
Agent przyjął, że 60 sekund to maksimum. Operator przewidział to i ostrzegał wcześniej.
**Formułuj zasady tak, żeby nie dało się ich odczytać korzystnie dla tempa pracy.**

**A3. Uznałem, że skład INCI identyczny w czterech przebiegach jest odczytywany,
a nie generowany.** Był stabilnie zmyślony — 17 składników zamiast 30, z pominięciem
alergenu orzechowego. **Powtarzalność nie jest dowodem prawdziwości.** Zmienność
adresu zdradziła zmyślenie, stabilność składu je ukryła.

**A4. Postawiłem kryterium `tests ≥ 78`, zakładając, że nowe przypadki powstaną jako
osobne bloki.** Powstały jako asercje w istniejących. Liczba bloków nie mierzy
pokrycia. **Proś o listę asercji, nie o liczbę testów.**

**A5. Twierdziłem, że `route_chemical()` zwróci `false` dla kosmetyku.** Pomyliłem
chemię domową jako kategorię asortymentu z chemiczną ścieżką potoku. Wykonawca miał
rację, ja nie.

**A6. Zapytałem operatora o rzecz, którą miałem w dokumentacji.** Reakcja była ostra
i uzasadniona.

**A7. Wydałem Zadanie 12, gdy Zadanie 11 było jeszcze otwarte**, i osobno wyprodukowałem
decyzję D17 z jednej jego odpowiedzi. Operator wycofał oba i nazwał to dryfem.

**A8. Nadspecyfikowałem pole `verified` w strukturze danych**, po czym musiałem je
wycofać, bo nikt nie umiałby powiedzieć, co znaczy. **Nie wprowadzaj pól, których
semantyki nie umiesz zdefiniować w jednym zdaniu.**

---

## 13. KONWENCJA DOKUMENTÓW

- zadanie: `ZADANIE_NN_krotki_opis.md`
- plan wykonawcy: `PLAN_NN_krotki_opis.md`
- akceptacja planu: `AKCEPTACJA_PLANU_NN.md`
- raport wykonawcy: `RAPORT_NN_krotki_opis.md`
- decyzja architekta: `DECYZJA_DNN_temat.md` lub `DNN_temat.md`

Numeracja ciągła przez cały projekt, wspólna dla obu stron. **Numer spalony
(jak 20) zostaje niewykorzystany** — luka jest tańsza niż kolizja dwóch dokumentów
o tym samym numerze.

Każde zadanie zawiera: nagłówek z metadanymi, kontekst, kroki, **binarne kryterium
zaliczenia**, zakazy. Bez kryterium binarnego zadanie wraca w postaci prozy.

Wszystkie dokumenty leżą w `src/modules/offer-optimizer-v2/docs/` i są w gicie.

---

## 14. PIERWSZA CZYNNOŚĆ

Nie wydawaj nowego zadania. Wykonawca pracuje nad Zadaniem 23.

Czekasz na `RAPORT_23_pochodzenie_line.md` i oceniasz go wg sekcji 10.
