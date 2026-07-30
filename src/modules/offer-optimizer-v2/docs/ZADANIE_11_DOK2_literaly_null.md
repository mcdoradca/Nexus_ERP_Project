# ZADANIE 11-DOK2 — E4a: LITERAŁY `null` I POLE `mpn`

| Pole | Wartość |
|---|---|
| Numer | 11-DOK2 |
| Etap | E4a (ostatnia poprawka przed zamknięciem podetapu) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_11-DOK — cel osiągnięty, dwa defekty do usunięcia |
| Oczekiwany raport | RAPORT_11_DOK2_literaly_null.md |
| SKU testowe | EAN **8000137015436** (bez zmian) |

## CO ZOSTAŁO OSIĄGNIĘTE (nie ruszaj)

Schemat odpowiedzi A1 jest teraz zgodny z kontraktem z `Agent_1_prompt_v4.md`.
Komplet pól `compliance_gpsr_clp` obecny, pola routingu usunięte, `mpn`
i `net_capacity_or_weight` dodane.

Najważniejsze: **podmiot odpowiedzialny w UE został odnaleziony i jest kompletny** —
`Equilibra S.r.l.`, `Via Plava 74, 10135 Torino, Italy`, `cosmetica@equilibra.it`.
To dokładnie ten blok danych, którego brak przy poprzednim schemacie przepuściłby
ofertę niezgodną z GPSR Art. 16.

`promptTokenCount` spadł z 6339 do 1594 przy tym samym węźle. `thoughtsTokenCount: 0`.
Bateria 60/60. Źródła bez domen aukcyjnych.

## DEFEKT 1 — `"null"` jako string zamiast literału `null` (blokujące)

W zwróconym JSON-ie pięć pól ma wartość **czteroznakowego stringa** `"null"`,
a nie literału `null`:

```
"biocidal_or_medical_permit": "null"
"clp_signal_word": "null"
"ph_value": "null"
"ufi_code": "null"
"missing_critical_data_reason": "null"
```

To jest placeholder, a zadanie mówiło wprost: wartość nieodnaleziona = `null`,
zakaz placeholderów (`Agent_1_prompt_v4.md`, DYREKTYWY TWARDE pkt 1).

Skutki, wszystkie realne:
- każde sprawdzenie `x === null` w dalszym kodzie zwróci `false`,
- każde `if (x)` potraktuje `"null"` jako wartość prawdziwą, bo niepusty string jest truthy,
- `Agent_6_prompt_v4.md` sekcja s5 nakazuje: „parametr `null` → pomiń cały `<li>`, zakaz 'Brak danych'". Przy stringu `"null"` copywriter wydrukuje w parametrach oferty **słowo „null"**,
- `clp_signal_word` z wartością truthy w miejscu, gdzie kod ma rozpoznać brak hasła ostrzegawczego, to defekt na ścieżce bezpieczeństwa (S-1).

### Do wykonania

Wymuś literał `null` w schemacie i zweryfikuj po stronie orkiestratora.

- W `responseSchema` pola opcjonalne mają być **nullable**, nie typu `string` z dopuszczalną treścią `"null"`.
- W prompcie A1, w bloku statycznym, dopisz jednoznacznie: wartość nieodnaleziona ma być literałem `null` w JSON, **nie tekstem**.
- W orkiestratorze, bezpośrednio po odebraniu odpowiedzi A1, normalizacja: string `"null"`, `"none"`, `"n/a"`, `"brak"` (bez względu na wielkość liter, po `trim()`) → `null`. Fakt normalizacji zapisywany w stanie jako ostrzeżenie z listą pól, których dotyczył.

Normalizacja w kodzie jest zabezpieczeniem, nie rozwiązaniem — prompt i schemat mają
zwracać poprawny typ same z siebie. Obie rzeczy robimy, nie jedną z nich.

## DEFEKT 2 — `mpn` wypełniony numerem EAN

Zwrócono `"mpn": "8000137015436"`, czyli wartość identyczną z `gtin_ean`.

MPN to numer katalogowy producenta. Model go nie znalazł i podstawił EAN — to
inferencja, zakazana przez DYREKTYWY TWARDE pkt 1. Nieodnaleziony `mpn` = `null`.

### Do wykonania

- Dopisz do bloku statycznego A1 zakaz podstawiania `gtin_ean` pod `mpn`.
- W orkiestratorze: jeśli `mpn === gtin_ean` → ustaw `mpn = null` i zapisz ostrzeżenie w stanie.

## DEFEKT 3 — `git diff --stat` nie jest surowy

Raport podaje:
```
1 files changed, 38 insertions(+), 8 deletions(-)
```

Git wypisuje w takim przypadku `1 file changed` — w liczbie pojedynczej. Do tego
w raporcie jest adnotacja o „uwzględnieniu tylko kluczowych elementów", a plik
`test_orchestrator.js`, o którym mowa w sekcji 1, w diffie nie występuje.

Diff ma być **wklejony bez edycji**. To nie jest formalność: cały ten projekt raz już
zdryfował na raportach, które nie odpowiadały stanowi repozytorium (Z-1, Z-7).

### Do wykonania

W raporcie wklej surowy, nieedytowany output:
```
git status --short
git diff --stat
```

Jeśli `test_orchestrator.js` jest plikiem nieśledzonym — to w porządku, ma się pojawić
w `git status` jako `??`. Chodzi o zgodność raportu ze stanem, nie o samą liczbę plików.

## PYTANIE KONTROLNE DO RAPORTU

W sekcji 1 napisałeś, że katalog `prompts/` został przekompilowany, ponieważ
PATCH v4.1 **wcześniej się nie zaaplikował**. Oznacza to, że w Zadaniu 11 węzeł A1
pracował na prompcie bez bramki GATE-1.

Potwierdź jednym zdaniem w raporcie, czy skompilowany prompt A1 zawiera obecnie
pkt 6 ZAKRESU POZYSKANIA (`BANNED_SUBSTANCE_DETECTED`) — i podaj `plik:linia`
z aktualnego odczytu skompilowanego pliku.

## KROK KOŃCOWY — przebieg kontrolny

Uruchom potok dla EAN `8000137015436` i wklej:

1. surowy JSON odpowiedzi A1 — pełny, nieskrócony,
2. surowe `usageMetadata`,
3. JSON stanu maszyny po FAZIE 1 — **cały obiekt**, bez wycinania pól,
4. `npm test` od linii `ℹ tests`,
5. `git status --short` i `git diff --stat` — surowe.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] W JSON-ie z A1 **nie występuje** string `"null"` w żadnym polu
- [ ] `mpn` jest `null` albo różny od `gtin_ean`
- [ ] Skompilowany prompt A1 zawiera bramkę GATE-1 — z referencją `plik:linia`
- [ ] `git status --short` i `git diff --stat` wklejone bez edycji
- [ ] `npm test`: `fail 0`, `tests` ≥ 60

## SPROSTOWANIE ARCHITEKTA

W prompcie startowym napisałem, że dla SKU testowego `route_chemical()` zwróci
`false`. **To była moja pomyłka** — pomyliłem „chemię domową" jako kategorię
asortymentu z chemiczną ścieżką potoku.

Twoja implementacja jest poprawna: `is_chemical: true` z powodem „Has INCI
ingredients" zgadza się z dokumentacją. `route_chemical()` decyduje o wywołaniu A4
(INCI Parser), a ten pracuje na składzie — więc każdy produkt z INCI, w tym kosmetyk,
idzie ścieżką chemiczną. Produkt „niechemiczny" to taki bez składu, dla którego
`Agent_6_prompt_v4.md` każe budować sekcję s3 z cech użytkowych z PIM.

Nie zmieniaj tego kodu.

## ZAKAZY

- Zero implementacji A2, A4, A5, A6, A7, A10 — kolejne podetapy.
- Zero A8 i A9 (D11).
- Nie ruszaj walidatorów, warstwy RAG ani istniejących testów.
- Nie realizuj ZADANIA 12 — nadal zablokowane.
- Zakaz `git add -A`; zapis plików przez `fs.writeFileSync` utf8; commit message ASCII; sekrety jako `***`.
