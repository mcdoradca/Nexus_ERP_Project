# ZADANIE 33 / KROK 3 — wpięcie i pomiar na żywo

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_33_KROK3.md`, ściśle wg SZABLONU

Krok 2 przyjęty. **85 ze 132 składników dostaje urzędową funkcję** zamiast 16 ze
105 — to jest różnica między opisem kadłubowym a używalnym.

Dwie rzeczy do wyprostowania po drodze.

**Rozbieżność liczników.** W KROKU 1B naliczyłeś **30 419** wierszy danych, a w
KROKU 2 **30 426** unikalnych nazw z tego samego pliku. Unikalnych nie może być
więcej niż wierszy — parser gdzieś dzieli komórkę.

**Wiek kopii.** Napisałeś o „aktualizacjach od 2016 roku", a `Update Date`
w pobranym pliku pokazuje `01/10/2025`. Kopia jest świeża i tak ma być opisana
w metadanych, bez domysłów.

---

## KROKI

**1.** Wyjaśnij rozbieżność 30 419 / 30 426. Podaj, które wiersze parser rozbił,
i popraw licznik.

**2.** Do metadanych CosIng dopisz **najstarszą i najnowszą `Update Date`**
z pliku. To jest jedyny twardy dowód wieku tej kopii.

**3. GATE-3.** `canon` sprawdzany wobec `INCI_NAMES`. Brak trafienia →
`INGREDIENT_NOT_IN_GLOSSARY: <nazwa>` i HITL. **Bez autokorekty nazw.**

**4. Blok RAG dla A4** budowany z `INCI_FUNCTIONS`: nazwa i funkcje urzędowe.
Składnik bez funkcji nie wchodzi do bloku — trafia do ostrzeżeń.

**5. Przebieg na żywo** `EXTRACT → A1 → A2 → A4` na Equilibrze
(EAN 8000137015436), dane produktu z fixture'a.

**6. Pomiar porównywalny.** Ze **105 pozycji z Zadania 32** — ile dostaje
funkcję. Ta sama podstawa, żeby liczby dało się zestawić z poprzednim pomiarem.
Zbiór 132 pozycji podaj osobno, nie zamiast.

---

## WARUNKI STOP — jedyne

1. rozbieżność z punktu 1 okazuje się błędem ingestu, a nie liczenia — wtedy
   poprawiasz ingest i raportujesz, ale nie idziesz do przebiegu na żywo
2. walidatory odrzucą wyjście A4 — to jest wynik poprawny, raportujesz który
   walidator i na jakiej frazie, potok zostaje zatrzymany

---

## SZABLON RAPORTU

```
## 1. Rozbieżność liczników — przyczyna, rozbite wiersze, poprawiony licznik
## 2. Metadane CosIng — najstarsza i najnowsza Update Date
## 3. GATE-3 — plik:linia wpięcia + lista INGREDIENT_NOT_IN_GLOSSARY dla Equilibry
## 4. Blok RAG — plik:linia budowy + ile z 30 składników weszło do bloku
## 5. Przebieg na żywo — PEŁNY orch.state, token_usage_per_node, PEŁNA treść technical_benefits_aeo
## 6. Walidatory — wynik validate_html_whitelist, scan_medical_claims_lexical, scan_stopwords na wyjściu A4
## 7. Pomiar — ile ze 105 pozycji ma funkcję; osobno ile ze 132
## 8. Testy — PEŁNY wydruk npm test z licznikiem ℹ tests, fail 0
## 9. git diff --stat całego modułu v2
```

---

## ZAKAZY

- **zakaz dopisywania czegokolwiek do plików w `data/reference`** — są wyciągiem
  ze źródeł i niczym więcej
- **zakaz autokorekty nazw składników** — tylko zgłoszenie do HITL
- zakaz generowania treści bazy wiedzy przez model
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, promptach agentów, `prompt-compiler.js`
- zakaz naprawiania testów pod kod; rozszerzenie mocka wolno tylko po to,
  by wykonanie dotarło do badanego kodu
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
