# ZADANIE 37 — wyłączenie zapisu do BaseLinkera i dowody 36-DOK

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_37.md`, ściśle wg szablonu z sekcji SZABLON

---

## OCENA 36-DOK: NIEZALICZONE

Dwa powody, pierwszy jest poważny.

**1. Włączyłeś zapis do BaseLinkera.** `const WRITE_BACK_ENABLED = true` nie było
w zadaniu 36-DOK ani w żadnej decyzji. W zadaniu 36 punkt 8 brzmiał: *dowód, że
stała jest false*. Zapis do BaseLinkera jest **zabroniony bezwzględnie** decyzją
Operatora i nie zostanie włączony w żadnej rundzie, dopóki Operator nie wyda
tego osobnym pismem. Włączenie go samodzielnie, przy produkcyjnym koncie
i katalogu 2000 SKU, to ryzyko nadpisania cudzych danych — nieodwracalne.

**2. Raport nie zawiera ani jednego dowodu.** Z jedenastu wymaganych sekcji nie
ma żadnej: brak `token_usage_per_node`, brak wydruku `npm test`, brak
`description_html`, brak `hitl_log`, brak wyników walidatorów, brak
`git diff --stat`. „120/120 `pass`" prozą to nie jest wydruk. Liczba w zdaniu
kryła już w tym projekcie zniknięcie 19 testów.

Do tego: „Zaktualizowano stary test […] aby weryfikował obecność `<strong>`" —
zmiana testu tak, żeby przeszedł. Test odrzucający `<b>` na wyjściu węzła miał
zostać; normalizacja `<b>`→`<strong>` miała się dziać **przed** walidatorem, a
nie przez rozluźnienie walidatora.

---

## KROK 1 — cofnij zapis, blokada twarda

1. `WRITE_BACK_ENABLED = false`.
2. Na wejściu funkcji `writeBackToBaseLinker` dodaj bezwarunkowy `throw new
   Error('WRITE_BACK_DISABLED_BY_OPERATOR')` — przed jakimkolwiek budowaniem
   payloadu i przed jakimkolwiek wywołaniem sieci. Stała zostaje, ale nawet jej
   ręczne przestawienie ma nie wystarczyć do wysłania czegokolwiek.
3. Test: wywołanie `writeBackToBaseLinker` rzuca `WRITE_BACK_DISABLED_BY_OPERATOR`
   przy `WRITE_BACK_ENABLED` ustawionym na `true`.

W raporcie podaj `plik:linia` dla każdego z trzech punktów.

## KROK 2 — ustal, czy zapis faktycznie poszedł

To jest pytanie, na które musi paść odpowiedź TAK albo NIE, poparta wydrukiem.

Uwaga na trzy różne ciągi — wypisz każdy grep osobno i nie mieszaj ich:
- **stała:** `WRITE_BACK_ENABLED`
- **funkcja:** `writeBackToBaseLinker`
- **metoda API / endpoint:** ciąg, którym wołasz BaseLinkera w tej funkcji
  (`addProduct`, `updateProduct`, `method=`, adres bazowy — wypisz faktyczny)

Dostarcz:
1. `git log --oneline -10` i `git log -p -S "WRITE_BACK_ENABLED" -- <ścieżka>`
   — kiedy stała została przestawiona.
2. `grep -rn` po trzech ciągach wyżej w całym module v2 — pełne wyniki.
3. Odpowiedź wprost: **czy od momentu przestawienia stałej wykonano choć jedno
   wywołanie zapisu do BaseLinkera?** Jeśli TAK — podaj każde: znacznik czasu,
   `product_id` / EAN, pełny payload i odpowiedź API. Jeśli NIE — wskaż dowód
   (log przebiegu, brak wywołania, wyjątek), nie samo zapewnienie.

Jeżeli zapis poszedł, **kończysz na tym kroku i raportujesz**. Nie próbujesz
niczego cofać w BaseLinkerze — to decyzja Operatora.

## KROK 3 — przywróć test walidatora

Walidator ma nadal odrzucać `<b>` i `<i>` na wyjściu węzła. Normalizacja
znaczników działa **przed** walidacją, na tekście z modelu.

- przywróć asercję: wyjście z `<b>` jest odrzucane przez `validate_html_whitelist`
- dołóż asercję: tekst z `<b>` po normalizacji przechodzi walidator jako `<strong>`
- podaj `git diff` tego pliku testowego (przed/po), `plik:linia`

## KROK 4 — dowody, których zabrakło w 36-DOK

Przebieg na żywo obu produktów, **bez atrap między węzłami**, zgodnie z Zadaniem
36-DOK. Bez tego runda nie jest oceniana.

- Equilibra `8000137015436` — do końca
- Trimay `8809822541010` — stop na `MISSING_EU_RESPONSIBLE_PERSON`, potem
  prawdziwe `resolveHitl` z `ACCEPT_AND_CONTINUE` do końca

Dane produktu z fixture'ów — **odczyt z API BaseLinkera też nie jest w tej
rundzie potrzebny.**

---

## SZABLON RAPORTU — bez którejkolwiek sekcji raport nie jest oceniany

```
## 1. Zapis wyłączony — plik:linia stałej, plik:linia throw, plik:linia testu
## 2. Czy zapis poszedł — git log, trzy grepy osobno, odpowiedź TAK/NIE + dowód
## 3. Test walidatora — git diff pliku testowego, obie asercje, plik:linia
## 4. Equilibra — PEŁNY orch.state na końcu + PEŁNA treść description_html
## 5. Equilibra — token_usage_per_node, wszystkie węzły, wszystkie cztery pola
## 6. Trimay — stan po zatrzymaniu, PEŁNY hitl_log, stan końcowy
## 7. Walidatory — wynik każdego na wyjściu A6, A7 i po patchach A10
## 8. Odrzucenia i limity — pełna lista A<N>_FIELD_REJECTED, A<N>_LIMIT_TRUNCATED
## 9. out/offer_8000137015436.json — zawartość w całości
## 10. Testy — PEŁNY wydruk npm test z linią ℹ tests, rozbicie na pliki
## 11. git diff --stat całego modułu v2
```

---

## KRYTERIUM UKOŃCZENIA — binarne

- `WRITE_BACK_ENABLED === false` **i** `writeBackToBaseLinker` rzuca bezwarunkowo
- w sekcji 2 pada TAK albo NIE, z wydrukiem, nie z zapewnieniem
- `npm test`: pełny wydruk, `fail 0`, **≥ 122** (120 + dwa nowe testy)
- `token_usage_per_node` ma `promptTokenCount` i `candidatesTokenCount` dla
  **każdego** węzła; liczby okrągłe (100, 150, 200) uznaję za atrapę
- `description_html` i `hitl_log` w całości, bez wielokropków

## ZAKAZY

- **zero wywołań zapisujących do BaseLinkera. Bezwzględnie, w kodzie, w testach,
  w przebiegu, w skrypcie pomocniczym. To jest zakaz Operatora, nie mój.**
- zero wywołań API BaseLinkera w ogóle w tej rundzie
- zakaz atrap w miejscu węzłów w przebiegu końcowym; mock wolno wstawić wyłącznie
  za wywołanie modelu i sieć w testach jednostkowych, nigdy za przedmiot asercji
- zakaz wyłączania, łagodzenia i obchodzenia walidatorów oraz bramek
- zakaz zmieniania testu po to, żeby przeszedł
- zakaz zmian w `tests/fixtures/`, `data/reference`
- zakaz parafrazowania składu INCI, ostrzeżeń i danych podmiotu odpowiedzialnego
- w wydrukach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz i nie piszesz do `.ai-memory.md` przed moją oceną

## JEDYNE WARUNKI PRZERWANIA

1. w KROKU 2 wychodzi, że zapis do BaseLinkera faktycznie się wykonał — raportujesz
   i kończysz
2. kompilator nie działa
3. walidator odrzuca wyjście węzła i po jednym ponowieniu odrzuca ponownie —
   raportujesz który i na jakiej frazie, przechodzisz do następnego punktu

W każdym innym przypadku dowozisz całość.
