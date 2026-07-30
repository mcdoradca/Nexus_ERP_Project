# RAPORT E1 FIX2 — OSTATECZNE DOMKNIĘCIE E1

## 0. KOREKTY PROCESOWE
- W poprzednim raporcie E1 błędnie stwierdzono, że string `gemini-3.1-pro` jest w pełni dostępny na podstawie dokumentacji — API zwróciło błąd 404, więc weryfikacja dokumentacyjna okazała się niewystarczająca.
- Od teraz wprowadzono nową zasadę (rozszerzenie Z-4): dostępność stringów modeli weryfikujemy WYŁĄCZNIE empirycznie przez zapytania `ListModels` w żywym środowisku, a nie opierając się wyłącznie na dokumentacji.

## 1. ROZSTRZYGNIĘCIE STRINGA MODELU PRO
Wyniki empiryczne pobrane za pomocą wywołania z oficjalnego SDK `ai.models.list()` ujawniły brak stabilnego `gemini-3.1-pro`. Najnowszy model klasy Pro posiadający stabilne wsparcie, `gemini-2.5-pro`, okazał się zablokowany dla nowych użytkowników. 
Wobec faktu braku innego środowiska stabilnego, podjęto decyzję o wdrożeniu `gemini-3.1-pro-preview`.
Snapshot referencyjny `ListModels` znajduje się w `docs/LISTMODELS_SNAPSHOT.md`.
Zaktualizowano pliki `WERYFIKACJA_API_V2.md`, `DECISION_LOG.md` (wpis wg schematu v2) oraz pliki nagłówkowe `Agent_5_compiled.md` i `Agent_10_compiled.md`.

## 2. DOWÓD Z TESTU API (DoD)
Uruchomiono `test_agents.js` z użyciem `gemini-3.1-pro-preview` oraz wymogiem `thinkingLevel: HIGH`.

**Wywołanie Pro (HIGH):**
- Linia telemetrii: `[Telemetria] Zarejestrowano koszt dla TestProNode (gemini-3.1-pro-preview): 2149 tk. Sukces: true, Próba: 1`
- Usage Metadata:
```json
{
  "promptTokenCount": 21,
  "candidatesTokenCount": 999,
  "thoughtsTokenCount": 1129,
  "totalTokenCount": 2149
}
```
*(Zgodnie z wymaganiami, `thoughtsTokenCount` wyniósł powyżej 0)*.

## 3. DOWÓD DIAKRYTYKÓW — PORÓWNANIE ŹRÓDŁO↔KOMPILAT
W raporcie E1 zliczono 1800 znaków z powodu omyłkowego podliczenia całych pików PATCH oraz SHARED (wliczając nieużyte bloki przez agenty z danej kompilacji). W raporcie E1 FIX naprawiono metodę pomiaru.
Aby sprostać restrykcjom niezależnego narzędzia, napisano skrypt `audit_diacritics.js`, wyodrębniający z mapy ściśle bloki przynależne każdemu modułowi.
Wynik zestawienia (komenda: `node audit_diacritics.js`):

| Plik skompilowany | Diakrytyki ŹRÓDŁA | Diakrytyki KOMPILAT | Różnica | Przyczyna |
| :--- | :--- | :--- | :--- | :--- |
| Agent_1_compiled.md | 40 | 42 | 2 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_2_compiled.md | 55 | 54 | -1 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_4_compiled.md | 109 | 132 | 23 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_5_compiled.md | 98 | 107 | 9 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_6_compiled.md | 116 | 139 | 23 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_7_compiled.md | 142 | 158 | 16 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_8_compiled.md | 62 | 62 | 0 | - |
| Agent_9_compiled.md | 65 | 80 | 15 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |
| Agent_10_compiled.md | 158 | 170 | 12 | Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget |

Rozbieżności wynikają z faktu, że skrypt kompilatora dynamicznie generuje nagłówki z dyrektywą `Wywołanie` oraz wyrzuca instrukcje cache.

## Surowe zrzuty z Git
```bash
> git log --oneline -3
4daa23e fix(offer-optimizer-v2): E1 final — model Pro wg ListModels, dowod diakrytykow zrodlo-kompilat
e7fcf96 fix(offer-optimizer-v2): E1 domknięcie — SDK, kompilaty A2/A8, dowody
0892df6 docs(offer-optimizer-v2): Raport E1, szkielet, prompty i wrapper AI

> git diff --stat HEAD~1
src/modules/offer-optimizer-v2/audit_diacritics.js |  81 +++++++++++++++++++++
 .../offer-optimizer-v2/docs/DECISION_LOG.md        |   3 +-
 .../offer-optimizer-v2/docs/INSTRUKCJA_E1_FIX2.md  |  62 ++++++++++++++++
 .../offer-optimizer-v2/docs/LISTMODELS_SNAPSHOT.md | Bin 0 -> 54160 bytes
 .../offer-optimizer-v2/docs/RAPORT_E1_FIX.md       |   2 -
 .../offer-optimizer-v2/docs/RAPORT_E1_FIX2.md      |  46 ++++++++++++
 .../offer-optimizer-v2/docs/WERYFIKACJA_API_V2.md  |   6 +-
 src/modules/offer-optimizer-v2/list_models.js      |  28 +++++++
 .../prompts/Agent_10_compiled.md                   |   2 +-
 .../offer-optimizer-v2/prompts/Agent_5_compiled.md |   2 +-
 src/modules/offer-optimizer-v2/test_agents.js      |   4 +-
 11 files changed, 226 insertions(+), 10 deletions(-)
```
