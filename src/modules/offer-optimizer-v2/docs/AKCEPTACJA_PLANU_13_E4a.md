# AKCEPTACJA PLANU 13 — E4a

| Pole | Wartość |
|---|---|
| Numer | 13 |
| Dotyczy | PLAN_DZIALANIA_13_E4a.md |
| Wydał | Architekt |
| Data | 2026-07-30 |
| Werdykt | **AKCEPTACJA WARUNKOWA** — trzy korekty przed startem |

## OCENA

Plan pokrywa wszystkie cztery kroki zadania, w prawidłowej kolejności. Punkt 4 kroku 1
(sprawdzenie krzyżowe pól) to dobry pomysł, którego w zadaniu nie było wprost —
zostaje, ale z poprawką poniżej. Liczba testów po zmianach: 61 + 2 = 63, zgodna
z kryterium.

## KOREKTA 1 — zawieranie, nie duplikacja (krok 1 pkt 4)

Plan mówi o wykryciu sytuacji, gdy `name` **w pełni duplikuje** `address_eu` lub
`contact`. To sprawdzenie równości, a wadliwy przypadek z ostatniego przebiegu nie był
równością.

Tam `name` **zawierał w sobie** adres, trzy adresy e-mail, numer telefonu i drugi
podmiot — a `address_eu` i `contact` w ogóle nie istniały. Porównanie na równość tego
nie wykryje.

Warunek ma brzmieć: **`name` nie zawiera podciągu wskazującego na adres ani kontakt.**
Praktycznie: `name` nie zawiera `@`, nie zawiera `http`, nie zawiera cyfry kodu
pocztowego w formacie `NN-NNN` ani `NNNNN`, i nie przekracza 200 znaków. Analogicznie
w drugą stronę — `address_eu` nie zawiera `@`.

Sam limit 200 znaków złapałby tamten przypadek, ale limit chroni przed rozmiarem,
a nie przed pomieszaniem pól. Chcemy obu zabezpieczeń.

## KOREKTA 2 — kiedy `NO_P1_SOURCE` (krok 2 pkt 3)

Plan ustawia to ostrzeżenie, gdy lista źródeł po filtrowaniu jest **pusta**.
To za wąsko i zgubi właśnie ten przypadek, dla którego ostrzeżenie powstaje.

`NO_P1_SOURCE` ma się pojawić, gdy **wśród pozostałych źródeł nie ma żadnego źródła
klasy P1** — czyli strony producenta lub marki. Lista ośmiu sklepów aptecznych jest
niepusta, a mimo to nie zawiera ani jednego źródła, z którego wolno brać dane prawne
(`Agent_1_prompt_v4.md`, DYREKTYWY TWARDE pkt 2: „P1 — jedyne dla danych prawnych").

Rozpoznanie P1 na tym etapie prosto: domena zawiera znormalizowaną nazwę marki
z pola `brand` (dla `Equilibra` → `equilibra.it`, `equilibra.com`, `equilibra.pl`).
Nie buduj niczego bardziej ambitnego — to ma być ostrzeżenie, nie klasyfikator.

## KOREKTA 3 — dokumenty procesu do gita (krok 3)

Plan wymienia pliki „z logów statusu", ale nie wspomina o katalogu `docs/`. Wszystkie
pliki `ZADANIE_*.md`, `RAPORT_*.md`, `PLAN_DZIALANIA_*.md` i `AKCEPTACJA_*.md` mają
wejść do repozytorium w tym commicie. To jedyny ślad procesu decyzyjnego i ma leżeć
w gicie, nie na dysku wykonawcy.

## POZOSTAŁE BEZ ZMIAN

Lista domen zakazanych w `config/nodes.config.js` — akceptuję, choć naturalniejsze
byłoby osobne miejsce. Nie zmieniaj, nie warto mnożyć plików w trakcie zadania.

Wyjaśnienie dwóch commitów o tym samym komunikacie — zgodnie z planem, jedno zdanie
w raporcie.

## DECYZJA

Po naniesieniu trzech korekt **startuj bez czekania na kolejną akceptację**.
Następny kontakt: `RAPORT_13_E4a_sanity_zrodla_commit.md`.

---

# UMIEJSCOWIENIE ZABEZPIECZEŃ TOKENOWYCH (do wiadomości, **nie realizuj teraz**)

Rozstrzygnięcie po rozmowie z operatorem. Cztery mechanizmy, dwa różne momenty
wdrożenia — każdy tam, gdzie tematycznie przylega.

## Do E4b (razem z A2 i A4)

Wtedy orkiestrator po raz pierwszy łańcuchuje więcej niż jedno wywołanie LLM, więc
budżet na SKU zaczyna mieć sens.

- **Budżet tokenów na SKU** — limit sprawdzany *przed* każdym wywołaniem, na podstawie telemetrii, którą już zbieramy. Przekroczenie → `TOKEN_BUDGET_EXCEEDED` i zatrzymanie potoku.
- **Budżet globalny** na sesję lub dobę — ta sama ścieżka, wyższy próg.
- **Licznik prób per węzeł, trzymany w bazie, nie w pamięci procesu.** Licznik w pamięci zeruje się przy restarcie i dokładnie tak powstaje sześć ponowień zamiast dwóch. Wartość zgodna z `max_revision_loops = 2` z `Agent_0_prompt_v4.md`.

## Do E4d (przed E5)

- **Persystencja stanu i wznawianie** (*checkpointing*): stan zapisywany do bazy po każdym ukończonym węźle, wznowienie od ostatniego ukończonego kroku, z jawnym przełącznikiem wymuszającym start od zera.
- **Idempotencja**: klucz `EAN + węzeł + hash wejścia + wersja promptu`. Istnieje wynik dla klucza → bierzemy z bazy zamiast wołać model. To jest właściwa odpowiedź na „zerwanie na końcu kasuje pracę wcześniejszych agentów".

Uzasadnienie podziału: budżet i licznik prób to razem kilkadziesiąt linii i chronią
przed najgorszym scenariuszem od zaraz. Persystencja to osobny kawałek roboty i musi
być gotowa przed E5, bo przy pięćdziesięciu produktach każde zerwanie bez wznawiania
kosztuje cały przebieg od nowa.

**To rozstrzygnięcie nie zmienia zakresu ZADANIA 13.** Zostanie wpisane do
`DECISION_LOG.md` przy starcie E4b.
