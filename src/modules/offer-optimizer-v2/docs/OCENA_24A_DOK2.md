# OCENA RAPORTU 24A-DOK2 — zamknięcie 24A

> **ODBIORCA: DOKUMENTACJA.** Tylko do `docs/`. Wykonawcy nie wklejasz.

- **Zadanie:** 24A-DOK2
- **Raport:** `RAPORT_24A_DOK2.md`
- **Data oceny:** 2026-07-31
- **Werdykt: ZALICZONE. Zadanie 24A zamknięte.**

---

## 1. Bilans

| Kryterium | Wynik |
|---|---|
| `git diff -- prompt-compiler.js` | pusty, zgodnie z oczekiwaniem |
| `git diff -- PATCH_v4.1_prompty.md` | spełnione |
| pełna treść `Agent_1_compiled.md` | spełnione |
| `allowedKeys` = dwa pola, `plik:linia` + wydruk | spełnione (`orchestrator.js:255-257`) |
| pełny `orch.state` z listą wstrzyknięć | spełnione |
| `npm test`, `fail 0`, ≥ 80 | spełnione — 80/80 |

**„Nowa treść" w patchu okazała się pustą linią.** Diff pokazuje wyłącznie
usunięcie ośmiu wierszy sekcji A1; sekcja A4 stoi nietknięta bezpośrednio pod
spodem. Zdanie z poprzedniego raportu było niefortunnie sformułowane, nie było
zmianą. Sprawa zamknięta.

**Przeczytałem skompilowany prompt A1 w całości.** Zawiera dokładnie to, co
powinien: zwężoną rolę, trzy dyrektywy twarde z hierarchią P1/P2/P3, jeden punkt
zakresu, wyjście na dwóch polach. Doklejony blok `--- WSPÓLNE REGUŁY --- §I`
pochodzi z SHARED_RULES v4.1, nie z patcha, i nie każe A1 zwracać żadnego pola
spoza schematu — opisuje bramki jako egzekwowane przez kod.

Potwierdza się też, że kompilator wiernie przenosi źródło: w dyrektywie 1 stoi
zdanie o literale `null` dopisane w Zadaniu 11-DOK2.

**Blokada `brand` udowodniona na najtrudniejszym przypadku** — Equilibra bez
marki w BaseLinkerze, mock A1 podstawia `"ZMYSLONA MARKA Z A1"`, w stanie zostaje
`brand.value: null`, w ostrzeżeniach `A1_FIELD_REJECTED: brand`, w `a1_result`
klucza nie ma.

---

## 2. Stan kontraktu A1 po 24A

A1 zwraca wyłącznie `country_of_origin` i `research_sources_used`. Wszystko
pozostałe jest odrzucane bezwarunkowo, niezależnie od tego, czy istnieje źródło
P1. Ścieżka, którą powstały `Purifying Black Carbon`, `Purifying Active Charcoal`
i zmyślony adres podmiotu odpowiedzialnego, jest zamknięta kodem, nie instrukcją
słowną.

Do zamknięcia zostało trzynaście rund. Warto to zapamiętać przy planowaniu E4c.

---

## 3. Nowe defekty — drobne, do sprzątania

| Kod | Defekt |
|---|---|
| D-24.1 | W skompilowanym prompcie marker `--- DANE SKU ---` występuje **dwa razy**: pusty, przeniesiony ze źródła, i realny z `{{SKU_DATA}}` po blokach wspólnych. Model widzi najpierw pustą sekcję danych. Dotyczy wszystkich dziesięciu promptów, nie tylko A1 — to zachowanie kompilatora, nie skutek naszych zmian |
| D-24.2 | Nagłówek `§I. BRAMKI SKŁADNIKOWE — NOWE w v4.1 (A1, A4...)` nadal wskazuje A1 jako uczestnika bramek. Bramki działają w kodzie przed wywołaniem A1. Nieszkodliwe, nieaktualne |
| D-24.3 | **W zrzucie nie ma ani `NO_P1_SOURCE`, ani `P1_CHECK_IMPOSSIBLE`**, mimo że A1 zwrócił `country_of_origin: "IT"` bez jednego źródła. Po zwężeniu kontraktu `country_of_origin` jest jedynym merytorycznym polem A1 — kontrola źródeł P1 musi obejmować właśnie je. Do 24B, razem z D-23.1 i D-23.2 |

D-24.3 wzmacnia pytanie otwarte z D23: skoro kraj pochodzenia przychodzi
z modelu bez źródła i nikt tego nie sprawdza, to pytanie, czy wolno go brać
z modelu, przestaje być teoretyczne.

---

## 4. Kolejka

1. **26** — `route_chemical` i konsumenci `isChemical` (D-25.1), runda ustaleń
2. **24B** — sanityzacja pól bez źródła, kontrola P1 dla `country_of_origin`
   (D-23.1, D-23.2, D-24.3), przeniesienie `mpn == EAN` (D-23.5), korekta ADR
