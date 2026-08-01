# AKCEPTACJA PLANU 30 — trzy uzupełnienia

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Plan zaakceptowany, zaczynaj. Trzy rzeczy do dopisania, reszta bez zmian.

**1. Nadpisanie decyzją operatora ma zostać widoczne w stanie.**
Po `ACCEPT_AND_CONTINUE` węzeł **nie wraca do `OK`**. Ustawiasz
`node_status[node] = 'HITL_OVERRIDDEN'` i tak zostaje do końca życia rekordu.
`hitl_log` to rejestr decyzji, ale ktoś czytający sam stan musi widzieć, że
produkt przeszedł dalej mimo blokady, bez zaglądania do logu.

**2. `next_action` po wznowieniu = węzeł następny po zablokowanym.**
Nie od początku fazy, nie ten sam węzeł jeszcze raz. Zablokowany węzeł nie jest
wołany ponownie — jego wynik już jest w stanie i to on podlegał decyzji.

**3. Jeśli walidatory odrzucą obecne wyjście A4 — to jest wynik poprawny.**
Spodziewam się, że `scan_medical_claims_lexical` coś na nim złapie. Wtedy
**nie zmiękczasz walidatora, nie zmieniasz progu, nie poprawiasz tekstu od
modelu i nie przepisujesz promptu A4.** Raportujesz, który walidator, na jakiej
frazie, i zostawiasz potok zatrzymany. Decyzja co dalej jest moja.

To samo dotyczy trzech przebiegów A2: jeżeli blokada bezpieczeństwa zapali się
we wszystkich trzech, przebieg A4 na żywo w tej rundzie **nie odbędzie się** —
i to też jest wynik poprawny, a nie powód do obejścia. Wpisujesz to w raporcie
i kończysz.
