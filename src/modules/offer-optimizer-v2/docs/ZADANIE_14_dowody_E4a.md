# ZADANIE 14 — DOWODY DO ZADANIA 13 I ROZBIEŻNOŚĆ ADRESU

| Pole | Wartość |
|---|---|
| Numer | 14 |
| Etap | E4a (nadal otwarty) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_13 — **NIEOCENIONE**, brak surowych outputów |
| Oczekiwany raport | RAPORT_14_dowody_E4a.md |
| Zakres | **zero zmian w kodzie** — wyłącznie wklejenie wyników i jedno wyjaśnienie |

## DLACZEGO ZADANIE 13 NIE ZOSTAŁO OCENIONE

Raport opisuje wykonaną pracę, ale nie zawiera ani jednego z sześciu wymaganych
surowych outputów:

| Wymagane | Stan |
|---|---|
| surowy JSON odpowiedzi A1, pełny | brak — jest sześciolinijkowy fragment |
| surowe `usageMetadata` | brak |
| cały JSON stanu maszyny po FAZIE 1 | brak — jest fragment |
| `npm test` od linii `ℹ tests` | brak — liczba podana prozą |
| `git log --oneline -3` | brak |
| `git status --short` i `git diff --stat` | brak |

Zasada Z-1 obowiązuje bez wyjątków: **raport bez surowych outputów i bez
`git diff --stat` nie podlega ocenie.** To nie jest formalność. Ten projekt raz już
został zresetowany do zera, bo poprzednia sesja raportowała prace, których git nie
potwierdzał. Sama treść raportu może być w stu procentach prawdziwa — ale bez
outputów nie da się tego stwierdzić, a od stwierdzania na słowo już raz odeszliśmy.

Dodatkowo: kryterium mówiło `tests ≥ 63` (61 istniejących + dwa nowe przypadki
z planu — pole puste i pole ponad limit). Raport podaje 62. Brakuje jednego
przypadku albo raport podaje złą liczbę — rozstrzygnie to surowy output.

**Nie powtarzaj pracy.** Wszystko, co opisałeś, prawdopodobnie jest zrobione.
Potrzebne są wyniki, nie kolejna implementacja.

## KROK 1 — wklej sześć surowych outputów

Uruchom ponownie przebieg kontrolny dla EAN `8000137015436` i wklej, bez skracania,
bez komentarza i bez edycji:

1. **surowy JSON odpowiedzi A1** — cały obiekt, wszystkie pola,
2. **surowe `usageMetadata`**: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`,
3. **cały JSON stanu maszyny** po FAZIE 1 — łącznie z `normalization_warnings` i `a1_result`,
4. `npm test` — od linii `ℹ tests` do końca,
5. `git log --oneline -3`,
6. `git status --short` oraz `git diff --stat`.

## KROK 2 — wyjaśnij rozbieżność adresu

Podmiot odpowiedzialny zwrócony w dwóch kolejnych przebiegach tego samego SKU:

| Przebieg | `address_eu` | `contact` |
|---|---|---|
| Zadanie 12 | Via Plava 74, 10135 **Torino** (TO), Italy | cosmetica@equilibra.it |
| Zadanie 13 | Via Pavia 58, 10098 **Rivoli** (TO), Italy | info@equilibra.it |

Inna ulica, inny numer, inny kod pocztowy, inna miejscowość. Oba adresy przechodzą
walidację sanity, bo oba **wyglądają** jak adresy. Walidacja formatu nie sprawdza
prawdziwości — i nigdy nie będzie.

To jest dana, którą GPSR Art. 16 nakazuje podać w ofercie. Jeśli przy każdym przebiegu
wychodzi inna, to znaczy, że dziś nie mamy sposobu ustalenia, która jest prawdziwa.

W raporcie odpowiedz na dwa pytania, **wyłącznie na podstawie odczytu, nie z pamięci**:

- Czy `NO_P1_SOURCE` zostało podniesione w którymś z tych przebiegów? Podaj wartość ze stanu maszyny.
- Z których dokładnie domen pochodziły źródła w przebiegu z Zadania 13? Wklej `research_sources_used` sprzed filtrowania i po filtrowaniu.

Nie naprawiaj tego. Nie dodawaj logiki. Tylko ustal fakty.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Sześć outputów wklejonych bez edycji
- [ ] `research_sources_used` przed i po filtrowaniu
- [ ] Wartość `NO_P1_SOURCE` ze stanu maszyny
- [ ] Rzeczywista liczba testów widoczna w outputcie `npm test`

## ZAKAZY

- Zero zmian w kodzie, testach, promptach i konfiguracji.
- Zero commitów w tym zadaniu.
- Zero implementacji kolejnych węzłów.
- Sekrety w outputach zastępowane `***`.
