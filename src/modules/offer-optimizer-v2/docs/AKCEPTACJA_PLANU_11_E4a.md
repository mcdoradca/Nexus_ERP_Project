# AKCEPTACJA PLANU 11 — E4a

| Pole | Wartość |
|---|---|
| Numer | 11 |
| Dotyczy | PLAN_DZIALANIA_11.md (odpowiedź wykonawcy na ZADANIE_11) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Werdykt | **AKCEPTACJA WARUNKOWA** — plan poprawny, dwa braki do uzupełnienia przed startem |

## OCENA

Trzy punkty planu pokrywają KROKI 1–4 z `ZADANIE_11_E4a_orkiestrator_A1.md`
poprawnie i w odpowiedniej kolejności. Nie zgłaszam zastrzeżeń do zakresu ani
do rozumienia zadania.

## ZASTRZEŻENIE 1 — brak KROKU 5 (blokujące)

Plan nie wymienia przebiegu na SKU testowym. Bez niego zadanie nie ma dowodu
i **nie podlega ocenie** (Z-1), niezależnie od jakości kodu.

Do raportu obowiązkowo wchodzi komplet pięciu pozycji:

1. surowy JSON odpowiedzi A1 dla EAN **8000137015436** — pełny, nieskrócony, bez komentarza,
2. surowe `usageMetadata` tego wywołania: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`,
3. JSON stanu maszyny po zakończeniu FAZY 1,
4. `npm test` — podsumowanie od linii `ℹ tests`,
5. `git diff --stat`.

Pozycja 2 jest kryterium binarnym zadania: `thoughtsTokenCount` ≈ 0 to jedyny
dowód, że `thinkingLevel: minimal` faktycznie zadziałał, a nie tylko widnieje
w konfiguracji.

## ZASTRZEŻENIE 2 — źródło parametrów wywołania (D2)

W punkcie 3 planu `thinkingLevel: 'minimal'` pojawia się jako parametr wywołania.
Ma pochodzić **wyłącznie** z `config/nodes.config.js` — nie z kodu wywołania,
nie z nagłówka promptu.

Powód (D2): katalog `prompts/` jest generowany, a ręczna edycja nagłówków ginie
przy rekompilacji. Zdarzyło się to już raz w tym projekcie.

Kompilator promptów ma **wycinać** parametry wywołania z nagłówka
`Agent_1_prompt_v4.md` (linia `# Wywołanie: flash + grounding | thinkingBudget: 0`),
a nie przepisywać ich do promptu. Uwaga na rozjazd nazewnictwa: w nagłówku promptu
figuruje `thinkingBudget` (nomenklatura v3), obowiązuje `thinkingLevel` (enum,
zweryfikowany w E0 — Z-4).

## PRZYPOMNIENIE ZAKAZÓW OBOWIĄZUJĄCYCH W TEJ RUNDZIE

- Zero implementacji A2, A4, A5, A6, A7, A10 — to E4b/E4c/E4d.
- Zero implementacji A8 i A9 w ogóle (D11); §G SHARED_RULES nie wchodzi do żadnego węzła.
- Zakaz cache w jakiejkolwiek postaci (OP-1).
- Zakaz kopiowania kodu ze starego modułu (OP-3).
- Zakaz `git add -A` — pliki dodawane po nazwie.
- Zakaz uruchamiania `clear_db.js` i skryptów z katalogu głównego (D14).
- Zapis plików tekstowych wyłącznie przez `fs.writeFileSync` utf8 (D9).
- Commit message ASCII; sekrety w outputach zastępowane `***`.

## DECYZJA

Po uzupełnieniu planu o KROK 5 i po przeniesieniu parametrów wywołania do
`config/nodes.config.js` — **startuj bez oczekiwania na kolejną akceptację**.
Następny kontakt: `RAPORT_11_E4a_orkiestrator_A1.md`.
