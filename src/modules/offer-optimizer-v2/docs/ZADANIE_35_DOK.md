# ZADANIE 35-DOK — dowody i sklejanie rozbitych nazw

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_35_DOK.md`

Raport 35 zawiera jedną sekcję z sześciu. Nie oceniam go — uprzedzałem dwa razy,
że wydruk testów jest blokujący i że bez niego nie czytam reszty.

Sama lista jest jednak wartościowa i wyciągam z niej dwie rzeczy poniżej.

---

## KROK 1 — blokujący, bez tego nic dalej

```
node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"
```

Cały wydruk, bez `(...)`, z `ℹ tests` na końcu. Do tego:

- lista plików `tests/*.test.js` z dysku
- liczba testów zebrana **z każdego pliku osobno**

Jeżeli któryś plik się nie ładuje, ma to być widoczne. Jeżeli któryś zawiera
sprawdzenia GATE-1 i GATE-2 i nie jest zbierany, to jest jedyna rzecz, jaka mnie
w tej rundzie interesuje.

Do tego brakujące dowody z Zadania 35: `plik:linia` i wydruk funkcji generującej
warianty, lista odrzuceń dla Equilibry, asercja o przejściu potoku mimo
nieznanego składnika, `git diff --stat`.

## KROK 2 — cztery pozycje z Twojej listy to nasz błąd, nie dostawcy

```
1
2 Hexanediol
2-Hexanediol
Hexylene Glycol Potassium Chloride
```

Pierwsze trzy to szczątki `1,2-Hexanediol`, rozbitego przez podział po przecinku,
który stoi w środku nazwy. Czwarta to dwa składniki sklejone brakiem przecinka
u dostawcy.

Teraz mamy czym to naprawić deterministycznie — mamy 30 419 prawdziwych nazw.

**Reguła sklejania:** jeżeli pozycja nie trafia w glosariusz, spróbuj skleić ją
z **sąsiednią** pozycją (najpierw z następną, potem z poprzednią), wstawiając
przecinek, i policz `canon` dla sklejenia. Trafienie w glosariusz → traktujesz
je jako jedną pozycję. Brak trafienia → zostawiasz podział bez zmian.

Sklejasz **najwyżej dwie sąsiednie pozycje** i tylko wtedy, gdy wynik trafia
w glosariusz. Nie zgadujesz, nie łączysz trzech, nie rozdzielasz niczego.

`Hexylene Glycol Potassium Chloride` to przypadek odwrotny — sklejone u dostawcy.
**Nie rozdzielaj go.** To jest brak przecinka w źródle i idzie na listę
nietrafionych, tak jak literówki.

---

## KRYTERIUM ZALICZENIA

- pełny wydruk z rozbiciem na pliki, `fail 0`, **≥ 93**
- brakujące dowody z Zadania 35
- `plik:linia` + wydruk reguły sklejania
- lista unikalnych nietrafionych **po** sklejaniu, z liczbą; oczekuję, że spadnie
  z 27 do około 24
- `git diff --stat` całego modułu v2

## ZAKAZY

- zakaz zaszywania aliasów i wyjątków w kodzie
- zakaz użycia modelu do kanonizacji, mapowania i korekty nazw
- zakaz similarity, fuzzy match i progów
- zakaz rozdzielania pozycji sklejonych w źródle
- zakaz zmian w `tests/fixtures/`, `data/reference`, `normalizeIngredientName`,
  `validators/`
- zakaz usuwania i wyłączania testów
- w wydrukach żadna wartość nie kończy się wielokropkiem
