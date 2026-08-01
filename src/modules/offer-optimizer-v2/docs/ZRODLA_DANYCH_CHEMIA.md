# ŹRÓDŁA DANYCH — CHEMIA DOMOWA I PRZEMYSŁOWA

> **ODBIORCA: DOKUMENTACJA + decyzja operatora.** Podstawa przyszłego Zadania 34.

- **Data:** 2026-07-31
- **Uzupełnienie do:** `ZRODLA_DANYCH_INCI.md`

---

## 1. Dlaczego to jest inny świat niż kosmetyki

INCI dla chemii **nie obowiązuje**. Detergent nie ma „składu INCI" w rozumieniu
1223/2009 — ma klasyfikację CLP, kartę charakterystyki i własne zasady
znakowania zawartości. To znaczy, że nasz obecny potok, zbudowany wokół pola
`inci`, dla chemii nie ma czego czytać. `route_chemical` miał to rozróżniać
i dlatego był w architekturze od początku.

Konsekwencja praktyczna: **nie da się „dołożyć chemii" do bazy INCI.** To jest
druga tabela referencyjna, karmiona z innych źródeł, i drugi kształt bloku RAG
dla A4.

---

## 2. Ramy prawne, w tej kolejności ważności

**CLP — Rozporządzenie (WE) 1272/2008.** Klasyfikacja i oznakowanie: zwroty
H i P, hasło ostrzegawcze, piktogramy, a od Załącznika VIII kod UFI i zgłoszenie
do ośrodków zatruć. To jest źródło wszystkiego, co w ofercie musi być
ostrzeżeniem.

**Detergenty — Rozporządzenie (WE) 648/2004.** Obowiązuje **dziś** i to na nim
opieramy się operacyjnie: znakowanie zawartości w przedziałach procentowych,
deklaracja perfum, konserwantów i alergenów, arkusz danych składników dla
personelu medycznego.

**Detergenty — Rozporządzenie (UE) 2026/405.** Opublikowane 2 marca 2026,
weszło w życie 22 marca 2026, ale **stosuje się dopiero od 23 września 2029**.
Zastępuje 648/2004 i wprowadza Cyfrowy Paszport Produktu, rozszerzone wymogi
biodegradowalności oraz objęcie zakresem produktów mikrobiologicznych i sprzedaży
na refill. Do 2029 nie zmienia naszych obowiązków, ale **zmienia to, co warto
projektować już teraz** — paszport produktu to struktura danych bardzo bliska
temu, co i tak budujemy w potoku.

**Biocydy — Rozporządzenie (UE) 528/2012.** Kluczowe dla treści ofert: każde
„zabija bakterie", „usuwa wirusy", „działa antybakteryjnie" to twierdzenie
biobójcze i wymaga pozwolenia oraz obowiązkowej formuły w reklamie. Dyrektywa
A4 już tego zakazuje bez zweryfikowanego pozwolenia i to jest dobrze ustawione.

**REACH.** Źródło kart charakterystyki — sekcje 2, 3, 9 i 11 dają nam
klasyfikację, skład, pH i toksykologię.

---

## 3. Co da się pobrać i wgrać

| Źródło | Co daje | Dostępność |
|---|---|---|
| **Załącznik VI Tabela 3 do CLP** | zharmonizowana klasyfikacja i oznakowanie — substancja, CAS, EC, kody H, piktogramy. Lista urzędowa i wiążąca | ECHA i EUR-Lex, do pobrania |
| **Wykaz C&L ECHA** | klasyfikacje zgłoszone przez producentów, znacznie szerszy niż Zał. VI | ECHA, do pobrania |
| **Lista kandydacka SVHC** | substancje wzbudzające szczególnie duże obawy — obowiązek informacyjny przy sprzedaży | ECHA |
| **Lista DID** (Detergent Ingredient Database, EU Ecolabel) | składniki detergentów z danymi o biodegradowalności i toksyczności wodnej | Komisja, bezpłatna |
| **Karty charakterystyki dostawców** | to, co realnie mamy dla konkretnego SKU | od dostawcy, nie do pobrania hurtem |

**Rekomendowana kolejność:** Załącznik VI Tabela 3 → wykaz C&L → lista DID.
Pierwsza pozycja jest wiążąca prawnie i od niej powinny pochodzić bramki dla
chemii, tak jak dla kosmetyków bramki mają pochodzić z załączników do 1223/2009.

---

## 4. Czego brakuje po naszej stronie i to jest problem

Ustaliliśmy w Zadaniu 25 i 26, że BaseLinker **nie ma strukturalnych pól CLP** —
ani hasła ostrzegawczego, ani zwrotów H i P, ani kodu UFI, ani pH. Ustaliliśmy
też, że `sds_required` nie jest w module v2 przez nic ustawiane.

To znaczy, że dla produktu chemicznego potok **nie ma dziś skąd wziąć danych
wymaganych prawem**, a te dane muszą trafić na ofertę. Żadna baza referencyjna
tego nie naprawi, bo referencja mówi, co dana substancja oznacza — nie mówi,
co jest w konkretnej butelce.

Wyjścia są trzy i to jest decyzja biznesowa, nie techniczna:

1. **Karty charakterystyki od dostawców**, parsowane do struktury — najbardziej
   pracochłonne, ale jedyne dające komplet
2. **Wprowadzanie danych CLP ręcznie do BaseLinkera** jako pola dodatkowe, raz
   na produkt — to samo podejście, które przyjąłeś dla podmiotu odpowiedzialnego
3. **Wyłączenie chemii z automatu** do czasu, aż jedno z powyższych powstanie —
   kosmetyki idą potokiem, chemia zostaje przy obecnym procesie

Do czasu Twojej decyzji obowiązuje wariant trzeci **z definicji**, bo potok nie
ma czym wypełnić obowiązkowych ostrzeżeń, a S-3 i tak zatrzyma taki produkt.

---

## 5. Uwaga o datach

Terminy w tym dokumencie pochodzą z wyszukiwania i mają charakter roboczy.
**Przed publikacją czegokolwiek dla chemii zweryfikuj je u doradcy ds. zgodności** —
w szczególności datę stosowania 2026/405 i obowiązki wynikające z Załącznika VIII
do CLP.
