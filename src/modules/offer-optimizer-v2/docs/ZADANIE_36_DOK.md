# ZADANIE 36-DOK — przebieg bez atrap

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_36_DOK.md`

Kod czterech węzłów powstał, zamrażanie sekcji jest wpięte, sklejanie naprawione —
tabela pokazuje dokładnie trzy odrzucenia (`Glyceryl Stereate`,
`Ethylhexyl Stereate`, `Ethylexyglycerin`), czyli to, czego oczekiwałem.
`Sodium Dehydroacetate` po obcięciu kropki wreszcie trafia.

Ale przebieg od A4 w dół jest na atrapach, więc **nie mamy dowodu, że potok
działa**. `node_status: OK` postawione przez atrapę nic nie znaczy, a
`out/offer_8000137015436.json` powstał z treści, której model nie napisał.
Widać to po `token_usage`: 100, 150, 200, 250, 300 to nie są liczby z API.

Zostało 26 godzin. Ta runda ma dać jedną rzecz: **potok przechodzący na żywo,
bez ani jednej atrapy między węzłami.**

---

## 1. Przyczyna blokady i jej rozwiązanie

A4 zwraca `<b>`, a `validate_html_whitelist` wymaga `<strong>`. Zamiast tego
obchodzić, normalizujesz tagi **przed** walidacją:

```
<b> → <strong>,  </b> → </strong>
<i> → <em>,      </i> → </em>
```

**Autoryzuję to wprost** i prostuję własny zakaz: zamiana znacznika
formatowania na równoważny nie jest poprawianiem treści modelu. Żadne słowo,
liczba ani nazwa się nie zmienia. Mój zakaz „nie poprawiasz treści od modelu"
dotyczył słów, nie znaczników — i to on wepchnął Cię w atrapę.

Wszystko inne, czego whitelist nie przepuszcza, **nadal odrzuca węzeł**.

## 2. Przebieg na żywo, oba produkty, zero atrap między węzłami

Jedyne mocki dopuszczalne w tej rundzie to transport HTTP w testach
jednostkowych. **W przebiegu końcowym każdy węzeł woła prawdziwy model.**

- **Equilibra** (8000137015436) — ma przejść do końca
- **Trimay** (8809822541010) — ma stanąć na `MISSING_EU_RESPONSIBLE_PERSON`,
  potem przez prawdziwe `resolveHitl` z `ACCEPT_AND_CONTINUE` dojść do końca

Jeżeli któryś węzeł zostanie odrzucony przez walidator dwa razy z rzędu —
**zatrzymujesz potok i to raportujesz**. Zatrzymanie opisane jest wynikiem.
Atrapa w miejscu węzła nie jest.

`token_usage_per_node` w raporcie ma zawierać `promptTokenCount`
i `candidatesTokenCount` dla **każdego** węzła. To jest dowód, że przebieg był
prawdziwy.

## 3. Testy czterech nowych węzłów

Dziś jest 108, czyli tyle co przed Zadaniem 36 — A5, A6, A7 i A10 nie mają ani
jednej asercji. Dopisujesz minimum:

- A5: `BLOCKED_CRITICAL_LEGAL_BREACH` zatrzymuje potok
- A5: `mandatory_safety_warnings` przechodzi dalej znak w znak
- A6: hash sekcji 3, 5, 6 trafia do `frozen_hashes`
- A6: wyjście z niedozwolonym tagiem jest odrzucane
- A7: sekcje 3, 5, 6 nie są wysyłane do modelu
- A7: zmiana sekcji zamrożonej daje `FROZEN_SECTION_VIOLATION`
- A10: patch w sekcję zamrożoną jest odrzucany
- A10: patch poza zamrożonymi nakłada się poprawnie
- normalizacja tagów z punktu 1

`npm test`: `fail 0`, **nie mniej niż 120**.

## 4. Drobiazgi do poprawienia przy okazji

- w tabeli z sekcji 1 wpisałeś `[Sklejone]` przy 27 pozycjach. Sklejenie to
  rzadki wyjątek, a Ty opisałeś tak zwykłe trafienie. Popraw etykiety na
  `TRAFIONY` / `SKLEJONY z <kim>` / `BRAK`
- `git diff --stat` wyszedł w UTF-16 i jest nieczytelny; przekieruj do pliku
  w UTF-8 albo wklej z terminala

---

## KRYTERIUM UKOŃCZENIA

- oba przebiegi na żywo, `token_usage` z prawdziwymi liczbami dla wszystkich węzłów
- `out/offer_8000137015436.json` pochodzi z przebiegu bez atrap
- `hitl_log` z przebiegu Trimay, z wpisem operatora i `HITL_OVERRIDDEN`
- `npm test`: `fail 0`, ≥ 120
- pełna treść `description_html` w raporcie
- wynik każdego walidatora po A6, po A7 i po patchach A10

## ZAKAZY

- **zakaz atrap w miejscu węzłów w przebiegu końcowym**
- zakaz wyłączania i łagodzenia walidatorów oraz bramek
- zakaz poprawiania **słów** zwróconych przez model; normalizacja znaczników
  z punktu 1 jest jedynym dozwolonym wyjątkiem
- zakaz parafrazowania składu INCI, ostrzeżeń i danych podmiotu odpowiedzialnego
- zakaz zmian w `tests/fixtures/`, `data/reference`
- w wydrukach żadna wartość nie kończy się wielokropkiem
