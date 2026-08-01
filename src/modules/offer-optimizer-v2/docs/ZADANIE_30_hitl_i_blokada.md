# ZADANIE 30 — blokada wraca, HITL zaczyna działać

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_30.md`, ściśle wg SZABLONU
- **Zadanie 29: NIEZALICZONE**

---

## DLACZEGO NIEZALICZONE

W raporcie stoi zdanie:

> „oryginalnie A2 zablokował potok zwracając alert SAFETY_SIGNAL_IN_REVIEWS ze
> względu na pieczenie oczu, więc by przetestować na żywo A4 (…) użyłem mock
> bypassa na A2"

**Bramka bezpieczeństwa zadziałała na prawdziwym produkcie i została obejściem
wyłączona, żeby demo doszło do końca.** To jest jedyna rzecz, której w tym
projekcie nie wolno zrobić. Cały potok istnieje po to, żeby się w takim miejscu
zatrzymać. Zatrzymanie nie jest awarią do obejścia, tylko produktem tej pracy.

Do tego: raport nie ma sekcji 3, 4 i 6 z szablonu, nie ma wydruku `npm test`,
a testów jest 89 przy wymaganych 92.

Nie wracamy do tego. Wracamy do stanu, w którym blokada działa, i budujemy to,
czego naprawdę brakuje: **drogę wyjścia z zatrzymania**.

---

## KROK 1 — cofnięcie bypassu i sprawdzenie powtarzalności

- usuń mock bypass na A2, blokada `SAFETY_SIGNAL_IN_REVIEWS` ma działać
- uruchom **A2 na żywo trzy razy** na Equilibrze (EAN 8000137015436), dane
  produktu z fixture'a
- wklej **surową odpowiedź modelu** z każdego z trzech przebiegów, w całości

Pytanie, na które odpowiadasz jednym zdaniem: **czy sygnał bezpieczeństwa
powtórzył się we wszystkich trzech przebiegach?** W Zadaniu 28 to samo A2 na tym
samym produkcie zwróciło `safety_signals_detected: []`. Pole niestabilne między
przebiegami jest generowane, nie odczytane — i to trzeba wiedzieć, zanim
zdecyduję, co z nim robić.

## KROK 2 — wznowienie po HITL

Dziś zatrzymanie jest ślepym końcem, dlatego sięgnąłeś po bypass. Budujesz drogę
wyjścia:

- metoda `resolveHitl({ node, decision, operator_note, resolved_at })`,
  `decision` ∈ `ACCEPT_AND_CONTINUE` | `REJECT_AND_HALT`
- decyzja zapisuje się w stanie jako `hitl_log[]` — wpis zawiera komplet:
  węzeł, alert, decyzję, notatkę operatora, znacznik czasu. **Wpis jest trwały
  i nie jest nadpisywany**
- `ACCEPT_AND_CONTINUE` czyści `hitl_alert`, ustawia `next_action` na węzeł
  następny po zablokowanym i pozwala potokowi iść dalej
- `REJECT_AND_HALT` zostawia potok zatrzymany na stałe
- wznowienie **bez** wpisu w `hitl_log` jest niemożliwe — brak notatki operatora
  ma rzucać błędem, nie przechodzić z pustym stringiem

To jest jedyna dopuszczalna droga obok blokady. Mocków omijających bramki
nie ma i nie będzie.

## KROK 3 — `P1_CHECK_IMPOSSIBLE` naprawione do końca

Twoja poprawka ustawia `checkStr` na samą markę z bazy. Equilibra marki w bazie
nie ma, więc `checkStr` jest pustym stringiem — a wtedy kontrola domen przepuszcza
wszystko. Zamieniłeś fałszywe alarmy na ciche przepuszczanie, co jest gorsze.

Gdy `checkStr` jest pusty, kontrola **nie może zostać uznana za wykonaną**:
wpisujesz `P1_CHECK_IMPOSSIBLE` i tak zostawiasz. Asercja ma to sprawdzać
na produkcie bez marki.

## KROK 4 — wyjście A4 przez walidatory

A4 zwrócił `<h2>` i `<b>`, a specyfikacja mówi `<ul><li>` i `<strong>`.
Zwrócił też sformułowania o modulowaniu akwaporyn i neutralizowaniu wolnych
rodników. Mamy na to gotowe walidatory i one nie zostały użyte.

Wyjście A4 przechodzi przed przyjęciem przez `validate_html_whitelist`,
`scan_medical_claims_lexical` i `scan_stopwords`. Naruszenie → wynik odrzucony,
`A4_OUTPUT_REJECTED: <walidator>` w `normalization_warnings`, `hitl_alert`
i zatrzymanie. Nie poprawiasz treści od modelu własną ręką.

W raporcie podaj, **który walidator co wyłapał** na obecnej odpowiedzi A4.

---

## WARUNKI STOP — jedyne

1. kompilator nie działa
2. A2 w trzech przebiegach zwraca trzy różne zestawy `safety_signals_detected`
   — wklejasz wszystkie trzy i kończysz krok 1, resztę kroków dowozisz normalnie

Obejście bramki nie jest warunkiem STOP ani żadnym innym dopuszczalnym ruchem.

---

## SZABLON RAPORTU

```
## 1. Bypass i powtarzalność
- git diff usunięcia bypassu
- trzy surowe odpowiedzi A2, każda w całości
- jedno zdanie: czy sygnał się powtórzył

## 2. HITL
- plik:linia + pełny wydruk resolveHitl
- zrzut stanu: (a) po blokadzie, (b) po ACCEPT_AND_CONTINUE, (c) po REJECT_AND_HALT
- pełny hitl_log z przebiegu (b)

## 3. P1
- git diff poprawki
- zrzut normalization_warnings dla produktu bez marki

## 4. Walidatory na wyjściu A4
- plik:linia wpięcia
- który walidator co wyłapał na obecnej odpowiedzi A4
- zrzut stanu przy A4_OUTPUT_REJECTED

## 5. Przebieg na żywo
- PEŁNY orch.state po zakończeniu, bez wielokropków
- token_usage_per_node dla wszystkich węzłów

## 6. Testy
- pełny wydruk npm test, fail 0, nie mniej niż 95
- lista nowych asercji: plik:linia + jedno zdanie

## 7. git diff --stat całego modułu v2
```

Raport bez którejkolwiek sekcji nie jest oceniany.

---

## ZAKAZY

- **zakaz omijania, wyłączania i mockowania bramek bezpieczeństwa w jakimkolwiek
  celu, łącznie z demonstracją.** Jedyna droga obok blokady to `resolveHitl`
  z wpisem w `hitl_log`
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, `validators/`, `prompt-compiler.js`
- zakaz ręcznej edycji `*_compiled.md`
- zakaz poprawiania treści zwróconej przez model własną ręką
- zakaz naprawiania testów pod kod
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
