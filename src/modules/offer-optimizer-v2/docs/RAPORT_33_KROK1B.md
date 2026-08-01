# RAPORT 33 / KROK 1B — Inspekcja Glosariusza INCI

**DATA:** 2026-07-31
**PLIK:** `data/reference/glossary_2025_1175_en.html` (pobrany manualnie)
**WYNIK:** Plik poprawny operacyjnie. Wymaga połączenia z bazą CosIng.

---

## 1. Metadane
* **Rozmiar pliku:** `10 521 383 bajtów`
* **SHA256:** `679d60e9e4c0172a67257597b1a36bba5e5ac9d5f645a0f8381ad95ea87cfe43`

## 2. Zawartość Tabeli
* **Nagłówki kolumn:**
  `Entry | Common Ingredient name`

* **Trzy pierwsze wiersze:**
  * _Wiersz pusty (separacyjny przed właściwymi danymi w pliku html z Dziennika Urzędowego UE)_: `&nbsp; | &nbsp;`
  * Wiersz 1: `1 | (20S)-PROTOPANAXADIOL`
  * Wiersz 2: `2 | (ACORI GRAMINEI/DISCOREA JAPONICA/PUERARIA MONTANA ROOT)/(LEONURUS CARDIACA LEAF/STEM)/(ACTAEA RACEMOSA ROOT/STEM)/SOYBEAN SEED EXTRACT`

* **Integralność i liczba wierszy:**
  * Łączna liczba wierszy tabeli: `30 421`
  * Liczba właściwych wierszy danych (odliczając nagłówek i pusty tag): **`30 419`** (wartość w 100% zgodna z kontrolą integralności).

## 3. Podsumowanie strukturalne
Z uwagi na fakt, że Glosariusz (Rozporządzenie Komisji Europejskiej) dostarcza wprost tylko dwie kolumny (numer porządkowy i nazwę znormalizowaną), **nie posiada** on w swoich strukturach atrybutów takich jak: numer CAS, numer EC, ani — co najważniejsze dla RAG — **funkcji składnika (Function)**.

Aby system i Agenci mieli świadomość urzędowej funkcji składnika, potwierdzam Twoje obawy: **CosIng jest nadal w pełni potrzebny** jako warstwa wzbogacająca, z której wyciągniemy funkcje przypisując je do zebranych tu nazw kanonicznych.
