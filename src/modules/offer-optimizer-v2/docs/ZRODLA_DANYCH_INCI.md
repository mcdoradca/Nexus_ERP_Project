# ŹRÓDŁA DANYCH INCI — skąd zbudować bazę wiedzy dla A4

> **ODBIORCA: DOKUMENTACJA + decyzja operatora.** Nie jest to zadanie dla wykonawcy.

- **Data:** 2026-07-31
- **Powód:** baza wiedzy pokrywa 8 z 30 składników jednego produktu; A4 nie ma
  o czym pisać

---

## 1. DWIE DATY, KTÓRE WYPRZEDZAJĄ WSZYSTKO INNE

**30 lipca 2026 — wczoraj.** Skończył się okres przejściowy dla nowego słownika
nazw INCI. Obowiązuje wyłącznie glosariusz z **Implementing Decision (EU)
2025/1175** (30 418 nazw), który uchylił 2022/677. Nazwy składników na etykietach
i w listach INCI muszą od wczoraj odpowiadać nowemu słownikowi. Część nazw
poprawiono, więc etykieta zgodna w zeszłym tygodniu może być dziś niezgodna
przy **niezmienionej recepturze**.

**31 lipca 2026 — dziś.** Wchodzi obowiązek rozszerzonego znakowania alergenów
zapachowych z **Rozporządzenia (UE) 2023/1545** (zmiana Załącznika III do
1223/2009) dla produktów wprowadzanych do obrotu po raz pierwszy.

Znaczenie dla nas: potok kopiuje skład INCI z BaseLinkera **dosłownie**, zgodnie
z D21. Jeżeli dostawcy podają składy w starym brzmieniu, przepisujemy do oferty
nazwy, które od wczoraj nie są zgodne z glosariuszem. To jest ryzyko, którego
dziś nie mierzymy w ogóle. **Rekomenduję zweryfikować obie daty u swojego
doradcy ds. zgodności przed publikacją czegokolwiek** — poniżej podaję źródła,
ale to jest decyzja prawna, nie techniczna.

---

## 2. WARSTWA NAZW — kanoniczna lista składników

**Źródło:** Załącznik do Implementing Decision (EU) 2025/1175, EUR-Lex,
CELEX 32025D1175. Publikowany w Dzienniku Urzędowym **we wszystkich językach UE,
w tym po polsku**. Formaty: HTML, PDF, XML.

**Co daje:** 30 418 oficjalnych nazw, którymi wolno oznaczać składniki w UE.

**Do czego użyć w potoku:**

- GATE-3 przestaje być zgadywanką: składnik jest znany albo go nie ma na
  oficjalnej liście, i to jest odpowiedź twarda, nie „nie ma go w naszym pliku"
- korekta literówek dostawcy: `Glyceryl Stereate` nie istnieje w glosariuszu,
  `Glyceryl Stearate` istnieje — mamy podstawę, żeby to wyłapać jako
  **niezgodność do HITL**, zamiast po cichu przepisywać błąd do oferty
- kanonizacja z Zadania 31B dostaje wreszcie listę odniesienia

**Czego nie daje:** glosariusz to lista nazw. Nie ma w nim funkcji składnika
ani numerów CAS.

---

## 3. WARSTWA FUNKCJI — to, czego naprawdę potrzebuje A4

**Źródło:** CosIng, baza Komisji Europejskiej,
`https://ec.europa.eu/growth/tools-databases/cosing/`. Bezpłatna, z możliwością
pobrania list.

**Co daje:** dla każdego składnika nazwę INCI, numery CAS/EC oraz **deklarowaną
funkcję kosmetyczną** — humektant, emolient, konserwant, filtr UV, substancja
kondycjonująca skórę, surfaktant i tak dalej.

**Dlaczego to jest właściwy budulec, a nie proza opisowa:** funkcja z CosIng jest
urzędowa, neutralna i z definicji niemedyczna. „Humektant" wolno napisać zawsze.
„Moduluje akwaporyny" — czego A4 użył w Zadaniu 29 — to już twierdzenie
o działaniu fizjologicznym, wymagające dowodu naukowego wg Rozporządzenia
655/2013. Budując wpisy z pola „funkcja" dostajemy opisy, które **z natury
przechodzą przez walidator roszczeń**, zamiast się o niego rozbijać.

**Ważne zastrzeżenie prawne:** Komisja sama pisze, że CosIng ma charakter
informacyjny i **nie ma mocy prawnej**. Nadaje się na słownik funkcji.
Nie nadaje się na źródło zakazów.

---

## 4. WARSTWA ZAKAZÓW — jedyne wiążące źródło

**Źródło:** Załączniki II–VI do Rozporządzenia (WE) nr 1223/2009, wersja
skonsolidowana na EUR-Lex (CELEX 02009R1223).

- Zał. II — substancje zakazane
- Zał. III — substancje dozwolone warunkowo (**tu siedzą alergeny zapachowe
  po zmianie 2023/1545**)
- Zał. IV — barwniki, V — konserwanty, VI — filtry UV

To jest źródło dla GATE-1 i GATE-2. Nasze listy SOT 04 §1 i SOT 06 §2 powinny
być z niego wyprowadzone i opatrzone numerem pozycji załącznika, żeby dało się
je zweryfikować wpis po wpisie.

Dla chemii domowej równolegle: CLP (Rozporządzenie 1272/2008) i detergenty
(648/2004), a dla klasyfikacji substancji — wykaz C&L w ECHA.

---

## 5. UZUPEŁNIAJĄCO

- **Opinie SCCS** — naukowe oceny bezpieczeństwa konkretnych składników,
  bezpłatne, po angielsku. Przydatne tam, gdzie potrzeba uzasadnienia ostrzeżenia
- **Raporty CIR** (Cosmetic Ingredient Review) — bezpłatne oceny toksykologiczne
- **Open Beauty Facts** — otwarta licencja; użyteczne wyłącznie jako zbiór
  **wariantów zapisu** nazw spotykanych na rynku, do testowania kanonizacji.
  **Nie jako źródło merytoryczne**
- **Słownik INCI wydawany przez Personal Care Products Council** — źródło
  pierwotne nomenklatury, ale **płatne i licencjonowane**; nie nadaje się do
  wgrania do naszej bazy

---

## 6. JAK TO ZŁOŻYĆ

Kolejność, która daje efekt najszybciej:

1. **Glosariusz 2025/1175 → tabela nazw.** Ekstrakcja z EUR-Lex, wersja polska
   i angielska. Efekt: GATE-3 działa naprawdę, a literówki dostawców zaczynają
   być widoczne
2. **CosIng → tabela funkcji.** Złączenie po nazwie INCI. Efekt: A4 ma z czego
   pisać dla większości składu, a nie dla 8 pozycji z 30
3. **Załączniki II–VI → listy bramkowe z numerami pozycji.** Efekt: GATE-1
   i GATE-2 przestają być listą przepisaną ręcznie, a stają się wyciągiem
   z rozporządzenia, który da się audytować
4. Dopiero na końcu treści opisowe — synergie, konteksty użycia — z SCCS i CIR,
   pisane przez człowieka

Punkty 1–3 to praca ekstrakcyjna i mieszczą się w potoku wykonawczym.
**Punkt 4 nie.**

---

## 7. ZASADA, KTÓREJ NIE WOLNO NARUSZYĆ

Baza wiedzy jest dla A4 zadeklarowana jako **jedyne źródło prawdy**. Jeżeli
wypełnimy ją treścią wygenerowaną przez model, halucynacje wejdą do potoku
z pieczątką źródła i **żadna bramka ich nie złapie** — bo bramki sprawdzają
wyjście modelu wobec bazy, a nie bazę wobec rzeczywistości.

Każdy wpis musi mieć w metadanych źródło i identyfikator pozycji: numer CELEX
i artykuł, pozycję załącznika albo identyfikator rekordu CosIng. Wpis bez tego
nie wchodzi do bazy.
