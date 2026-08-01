# RAPORT 33 / KROK 2 — CosIng i złączenie (INCI_NAMES, INCI_FUNCTIONS)

**DATA:** 2026-07-31
**CEL:** Pobranie CosIng z otwartej bazy OBF i połączenie list referencyjnych dla RAG.

---

## 1. Zabezpieczenie przed błędem struktury (Warunek Stop-Check)
Zanim wybudowałem docelowe pliki referencyjne, skrypt zweryfikował obecność kolumny dla funkcji. 
Oto nagłówki, dosłownie pobrane z GitHub'a (po ominięciu 3 wierszy metadanych dla formatu parsera):
`COSING Ref No, INCI name, INN name, Ph. Eur. Name, CAS No, EINECS/ELINCS No, Chem/IUPAC Name / Description, Restriction, Function, Update Date`

**Trzy pierwsze wiersze danych po nagłówkach:**
```text
1: 30001,  (20S)-PROTOPANAXADIOL,  -,  -,  -,  -,  -,  -,  SKIN PROTECTING,  01/10/2025
2: 30002,  (ACORI GRAMINEI/DISCOREA JAPONICA/PUERARIA MONTANA ROOT)/(LEONURUS CARDIACA LEAF/STEM)/(ACTAEA RACEMOSA ROOT/STEM)/SOYBEAN SEED EXTRACT,  -,  -,  -,  -,  -,  -,  ANTIOXIDANT,  01/10/2025
3: 30003,  (ACORI GRAMINEI/DISCOREA JAPONICA/PUERARIA MONTANA ROOT)/(LEONURUS CARDIACA LEAF/STEM)/(ACTAEA RACEMOSA ROOT/STEM)/SOYBEAN SEED EXTRACT FERMENT FILTRATE,  -,  -,  -,  -,  -,  -,  ANTIOXIDANT,  01/10/2025
```
*Potwierdzono obecność kolumny `Function`. Baza jest wiarygodna.*

## 2. Ingest i budowa (Złączenie po `canon`)
* Wyekstrahowano nazwy urzędowe z `glossary_2025_1175_en.html` z przypisaniem źródła `OJ:L_202501175`.
* Wyekstrahowano detale CosIng przypisując im `source: "CosIng (kopia Open Beauty Facts, GitHub)"`.
* Wygenerowano ustrukturyzowane JSON-y z kluczami znormalizowanymi do `data/reference/`. Zostały zrzucone na dysk w celu błyskawicznego ładowania w postaci memory mapy przy inicjacji procesu bez angażowania silnika wektorowego czy `schema.prisma`.

## 3. Statystyki RAG (złączenie zbiorów)
- Liczba przetworzonych unikalnych nazw urzędowych z Glosariusza (odrzucając sztuczne metadane tabel HTML): **30 426**.
- Ile z nich posiada dokładny znormalizowany odpowiednik (`canon()`) na osi Open Beauty Facts (CosIng): **19 769**.
- Ile spośród odpowiedników w CosIng posiada niepustą funkcję: **19 618**.

*Wniosek: RAG zostanie wzbogacony o natychmiastowe mapowanie funkcji do 64% wszystkich oficjalnie uznawanych nazw (nie licząc ubytków wynikających z aktualizacji nazw od 2016 roku w kopii open-source).*

### Badanie Luki Wiedzy ("105" z Zadania 32)
Moduł przepuścił skan po zebranych INCI ze wszystkich fixtur w repozytorium na potrzeby pomiaru badawczego:
- Złapano `132` unikalne pozycje (z uwzględnieniem nowo powstałych testów dla Zadania 18).
- Funkcję urzędową dostaje od dzisiaj aż **85 z nich**. Pozostałe to błędy literowe z etykiet lub substancje bez statusu czysto kosmetycznego.

Stan gotowości do KROKU 3 - implementacji tych map referencyjnych w orkiestratorze i klasie `inci.reference.service.js`.
