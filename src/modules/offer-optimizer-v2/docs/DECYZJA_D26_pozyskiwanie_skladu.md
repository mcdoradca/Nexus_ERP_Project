# DECYZJA D26 — brak składu w BaseLinkerze to zadanie do wykonania, nie powód do zatrzymania

> **ODBIORCA: WYKONAWCA + DOKUMENTACJA.** Wpis do `DECISION_LOG.md`.

## 1. Błąd, który prostuję

Potok zatrzymywał się na braku INCI (`Brak INCI przerywa na EXTRACT`).
To było odwrócenie celu programu. Program istnieje po to, żeby **uzupełniać**
braki w BaseLinkerze i **oddawać** dane z powrotem. Brak składu jest wejściem do
pracy, a nie warunkiem stopu.

Zasada S-1 w brzmieniu „brak INCI = HALT" zostaje uchylona i zastąpiona
punktem 3 poniżej.

## 2. Czego to **nie** znaczy

D18 i D19 zostają w mocy. Powodem ich powstania nie było to, że skład jest
niepotrzebny — tylko to, że A1 **zmyślał** składy i źródła
(`gs1.org.gs1.pl`, `beautytester.it.com.amazon.it`). Skład wypisany z pamięci
modelu na kosmetyku to fałszywa lista składników w rozumieniu art. 19
rozporządzenia 1223/2009 i realna szansa na ukrycie alergenu.

**Skład pozyskujemy, ale wyłącznie jako pobrany artefakt, nigdy jako wypowiedź
modelu.** Dokładnie tak, jak działa dziś podmiot odpowiedzialny Equilibry:
adres URL, dosłowny fragment źródła, znacznik czasu — i to działa.

## 3. Nowy węzeł: pozyskanie składu

Kolejność źródeł, pierwsze trafienie wygrywa:

1. strona marki producenta
2. strona podmiotu odpowiedzialnego (mamy go już z `description`)
3. karta produktu dystrybutora lub hurtowni
4. zdjęcia oferty z BaseLinkera — OCR opakowania

Dla każdego pozyskania zapisujemy komplet: `source_url`, `raw_fragment`
w oryginalnej postaci, `retrieved_at`, `method` (`html` / `ocr`).
Brak kompletu = brak pozyskania.

## 4. Test przyjęcia — i tu wreszcie zarabia glosariusz

Pobrany tekst dzielimy na pozycje i sprawdzamy, ile z nich to **oficjalne nazwy
z `INCI_NAMES`**. Mamy ich 30 419.

- **≥ 80 % pozycji to nazwy urzędowe** → to jest lista składników, przyjmujemy
- **< 80 %** → to nie jest lista składników, tylko proza marketingowa albo
  zła strona; odrzucamy i idziemy do następnego źródła

To jest deterministyczny sprawdzian autentyczności, którego nie da się oszukać
prozą modelu, i używa wyłącznie tego, co już zbudowaliśmy.

Skład pozyskany tą drogą wchodzi do stanu z `source: "acquired"` i przechodzi
**te same bramki GATE-1, GATE-2 i GATE-3**, co skład z BaseLinkera. Żadnej taryfy
ulgowej dla danych z zewnątrz.

## 5. Zapis zwrotny do BaseLinkera

Skład przyjęty testem z punktu 4 wraca do BaseLinkera razem z opisem.
W polu dodatkowym zapisujemy `source_url` i `retrieved_at`, żeby po roku dało się
odtworzyć, skąd to jest.

Dopóki nie ma zgody na zapis do API, wynik ląduje w pliku wyjściowym w tym samym
kształcie. **Zapis do BaseLinkera to osobna decyzja operatora** — dotyczy
nadpisywania danych produkcyjnych i nie podejmę jej sam.

## 6. Kolejność prac

- **35** — kończysz jak zlecone: wydruk testów, czwarty wariant nawiasowy,
  `C10-18 Triglyceride`
- **36** — węzeł pozyskania składu wg punktów 3 i 4
- **37** — ekran odległości edycyjnej na liście zakazanej (D25 punkt 3)

## ZAKAZY, które się nie zmieniają

- **model nie pisze składu.** Może wskazać, gdzie szukać; treść pochodzi
  wyłącznie z pobranego fragmentu
- skład bez `source_url` i `raw_fragment` nie wchodzi do stanu
- zakaz obchodzenia bramek dla składu pozyskanego z zewnątrz
- lista INCI publikowana na ofercie jest kopią przyjętego artefaktu, nie
  parafrazą
