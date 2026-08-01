# ZADANIE 35-DOK2 — dwie regresje do cofnięcia

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_35_DOK2.md`

Wydruk testów wreszcie jest i jest w porządku: **108 / 108, `fail 0`**, rozbicie
na pliki, bramki GATE-1 i GATE-2 widoczne w dwóch miejscach. Sklejanie działa,
27 spadło do 22. Warianty czwarty i piąty wpięte. To wszystko zostaje.

Dwie rzeczy w tym raporcie są jednak poważne i cofamy je, zanim ruszymy dalej.

---

## 1. Zniknął twardy stop na braku podmiotu odpowiedzialnego

Piszesz o teście z asercją `node_status['EXTRACT'] === 'OK'` **mimo pustego
`eu_responsible_person`**, przy nazwie testu
`Orchestrator - HARD FAIL na pustym eu_responsible_person w EXTRACT`.
Nazwa mówi jedno, asercja drugie.

**D26 zniósł zatrzymanie na braku składu i nic poza tym.** Podmiot odpowiedzialny
to inne pole i inna podstawa: art. 19 rozporządzenia 1223/2009 wymaga go na
opakowaniu i w ofercie, a my nie mamy go dziś skąd wziąć — pozyskiwanie danych
z sieci powstanie dopiero w Zadaniu 36. W obecnym stanie taki produkt poszedłby
do publikacji bez danych, których wymaga prawo.

Przywracasz `HALTED_HITL_REQUIRED` z alertem `MISSING_EU_RESPONSIBLE_PERSON`.
Test ma asertować to, co mówi jego nazwa.

## 2. Testy orkiestratora nie sprawdzają glosariusza, tylko atrapę

```javascript
inciRefService.isOfficialIngredient = (i) => i !== 'fakeingredient' && i !== 'unknown_in_db';
```

Ta podmiana sprawia, że **każdy** składnik oprócz dwóch magicznych ciągów jest
„urzędowy". Sam piszesz: „dla pliku Equilibry mock nie rejestruje braku, więc
wszystkie składniki przechodzą".

To znaczy, że żaden test nie dotyka prawdziwego dopasowania do glosariusza,
a kryterium „lista odrzuceń dla Equilibry nie dłuższa niż 4 pozycje" nie zostało
sprawdzone ani razu — zostało obejściem uczynione niemożliwym do sprawdzenia.

Usuwasz podmianę. Testy orkiestratora korzystają z prawdziwego
`inci.reference.service.js` i prawdziwych map z `data/reference`.

**Podajesz rzeczywistą listę odrzuceń dla Equilibry** (EAN 8000137015436),
w całości. Jeżeli będzie dłuższa niż 4 pozycje — wklejasz ją i kończysz, to jest
wynik, a nie porażka.

---

## KRYTERIUM ZALICZENIA

- `git diff` przywrócenia stopu na `eu_responsible_person` + nazwa testu zgodna
  z asercją
- `grep -n "isOfficialIngredient\s*=" src/modules/offer-optimizer-v2/tests/` —
  wynik pusty, wklejony nawet pusty
- rzeczywista lista odrzuceń dla Equilibry, z liczbą
- pełny wydruk `npm test`, `fail 0`, **≥ 108**, rozbicie na pliki
- `git diff --stat` całego modułu v2

## ZAKAZY

- **zakaz podmieniania w testach usług, które test ma sprawdzać** — mock wolno
  wstawić tylko za rzeczy, których test nie bada (wywołania modelu, sieć),
  nigdy za logikę będącą przedmiotem asercji
- zakaz znoszenia twardych stopów bez decyzji na piśmie; D26 dotyczy wyłącznie
  składu
- zakaz zaszywania aliasów i wyjątków w kodzie
- zakaz użycia modelu do kanonizacji, mapowania i korekty nazw
- zakaz zmian w `tests/fixtures/`, `data/reference`, `validators/`
- w wydrukach żadna wartość nie kończy się wielokropkiem
