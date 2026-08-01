# KOREKTA D22 — ODCZEKANIE TO MINIMUM, NIE LIMIT

> **Wyślij agentowi natychmiast, przed pierwszym zadaniem.**
> Koryguje błędne sformułowanie w prompcie startowym.

---

## SPROSTOWANIE

W prompcie startowym padło sformułowanie „limit odstępu między zapytaniami".
**To sformułowanie było błędne i zostaje wycofane.**

Słowo „limit" oznacza wartość maksymalną. Tutaj chodzi o coś dokładnie
przeciwnego.

## OBOWIĄZUJĄCE BRZMIENIE

**Przed każdym zapytaniem do API BaseLinkera obowiązuje MINIMALNE ODCZEKANIE
60 SEKUND od momentu nadania poprzedniego zapytania.**

- 60 sekund to **wartość najmniejsza**, czyli podłoga.
- Odczekanie **dłuższe niż 60 sekund jest zawsze dozwolone** i nigdy nie jest błędem.
- Odczekanie **krótsze niż 60 sekund jest złamaniem zasady o randze inwariantu bezpieczeństwa**, niezależnie od okoliczności, wyniku i pilności.

Nie ma górnej granicy odczekania. Nie istnieje sytuacja, w której czekanie „za długo"
jest problemem. Istnieje wyłącznie sytuacja, w której czekanie było za krótkie.

## ROZUMOWANIA ZAKAZANE

Każde z poniższych jest złamaniem zasady:

- „zapytanie trwało 15 sekund, więc odczekam pozostałe 45" — **nie.** Pełne 60 sekund liczone od nadania poprzedniego zapytania, czas transmisji się nie odejmuje.
- „limit wynosi 60 sekund, więc mogę wysłać po 40" — **nie.** To nie jest limit, tylko minimum.
- „poprzednie zapytanie poszło 5 minut temu, więc mogę teraz trzy pod rząd" — **nie.** Zaległy czas się nie kumuluje i nie uprawnia do serii.
- „to małe zapytanie" / „to tylko sprawdzenie połączenia" / „to metoda tylko do odczytu" — **nie.** Liczy się liczba wywołań, nie ich rozmiar ani charakter.
- „użytkownik czeka, więc tym razem szybciej" — **nie.** Pilność nie znosi tej zasady. Nigdy.
- „zrównoleglę dwa wywołania, każde i tak odczeka swoje" — **nie.** Zrównoleglenie jest zakazane osobno.

## IMPLEMENTACJA — NIE ZALEŻY OD DOBREJ WOLI

1. Wartość `60000` ms jest **stałą w konfiguracji modułu**. Nie wolno jej zmieniać, parametryzować, skracać „na czas testów" ani obchodzić.
2. Odczekanie siedzi w **jednej funkcji opakowującej**, przez którą przechodzą wszystkie wywołania do BaseLinkera — z potoku, ze skryptów, z testów.
3. Funkcja zapisuje **znacznik czasu nadania każdego wywołania do pliku logu**.
4. Log ze znacznikami czasu jest **obowiązkową częścią raportu** z każdego zadania dotykającego BaseLinkera.

Punkt 4 jest istotny: tempo ma być **sprawdzalne w outpucie**, a nie deklarowane
w zdaniu. Raport bez logu znaczników czasu = raport nieoceniany (Z-1).

## POTWIERDZENIE — ODPOWIEDZ PRECYZYJNIE

Zanim dostaniesz zadanie, odpowiedz na cztery pytania. Odpowiadaj krótko
i konkretnie, bez parafrazowania tego dokumentu.

1. Ile wynosi **najkrótszy dopuszczalny** odstęp między dwoma zapytaniami do BaseLinkera?
2. Poprzednie zapytanie nadałeś o 12:00:00, a odpowiedź wróciła o 12:00:20. O której godzinie **najwcześniej** wolno Ci nadać następne?
3. Czy odczekanie 5 minut zamiast 60 sekund jest błędem? Odpowiedz tak lub nie.
4. Skrypt zwrócił błąd `ERROR_BLOCKED_TOKEN` przy dwunastym z dwudziestu zaplanowanych wywołań. Co robisz z pozostałymi ośmioma?

Dopiero po tych odpowiedziach czekaj na zadanie.
