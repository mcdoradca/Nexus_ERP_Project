# AKCEPTACJA PLANU 31B — cztery uzupełnienia

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Plan zaakceptowany. Cztery rzeczy do dopisania, reszta bez zmian.

**1. Pułapka, na którą wpadniesz w regresji.** Na liście GATE-1 stoi wpis
`perboric acid, sodium salt` — **z przecinkiem w środku nazwy**. Jeśli skład
dzielisz po przecinku i porównujesz pozycja po pozycji, ten wpis nie dopasuje się
nigdy, bo rozpadnie się na dwa kawałki. Istniejące sprawdzenie `GATE-1 check 1`
zgaśnie i wyjdzie Ci fałszywa regresja.

Dlatego dopasowanie ma dwa przebiegi:

- **przebieg A, po pozycjach** (skład dzielony po przecinku): `canon` pozycji
  równy `canon` wpisu, albo `canon(pozycja).includes(canon(wpis))` gdy
  `canon(wpis)` ma co najmniej **8** znaków
- **przebieg B, po całym skanonizowanym składzie**: `includes`, ale **wyłącznie
  dla wpisów, które w liście źródłowej same zawierają przecinek**. Tylko dla nich,
  dla żadnych innych — inaczej dopasowanie zacznie przeskakiwać między sąsiednimi
  składnikami i dostaniesz fałszywe blokady

**2. Warunek ośmiu znaków ma być w kodzie jawnie.** W planie napisałeś
„dwu-stopniowe dopasowanie" bez tej liczby. Bez niej `tpo`, `egf`, `fgf`, `bp-2`
zaczną trafiać w środek niewinnych nazw. To jest ten sam warunek, który chroni
`GATE-1 brak falszywych trafien` i `Safe ingredients` przed zgaśnięciem.

**3. Listy zakazane zostają nietknięte na dysku.** `canon` liczysz w locie, przy
porównaniu. Żadnego przepisywania `SOT 04 §1` ani `SOT 06 §2` do postaci
skanonizowanej — źródło ma pozostać czytelne dla człowieka i porównywalne
z rozporządzeniem.

**4. Sekcja 5 raportu jest obowiązkowa.** W planie sprzeczność liczb RAG
(30 nietrafionych w tabeli kontra 23 w przebiegu na żywo) jest wspomniana jako
„weryfikacja manualna". To ma być pełna sekcja: `plik:linia` ścieżki, którą pyta
Twój skrypt diagnostyczny, `plik:linia` ścieżki, którą pyta orkiestrator, i jedno
zdanie rozstrzygające, która z nich mówi prawdę. Bez tego raport nie jest oceniany.
