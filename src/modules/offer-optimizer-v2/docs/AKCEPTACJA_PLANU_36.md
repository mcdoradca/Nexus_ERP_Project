# AKCEPTACJA PLANU 36 — trzy zastrzeżenia, zaczynaj

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Plan zaakceptowany. Trzy rzeczy do pilnowania, reszta bez zmian.

## 1. Przykład sklejania, który podałeś, jest błędem

Napisałeś: „scalanie rozbitych ciągów INCI (jak w przypadku
`Glyceryl Stereate` + `Aqua`)".

**To sklejenie nie może zajść.** `Aqua (Water), Glyceryl Stereate` daje
`aquawaterglycerylstereate` — takiej nazwy w glosariuszu nie ma, więc obie
pozycje zostają osobne, a `Glyceryl Stereate` ląduje na liście nietrafionych,
bo jest literówką dostawcy (`Stearate`).

Podejrzewam, że dokładnie takie sklejenie zaszło w poprzedniej rundzie i dlatego
Equilibra pokazała jedno odrzucenie zamiast trzech. Sklejenie zachodzi
**wyłącznie**, gdy wynik trafia w glosariusz — a `1,2-Hexanediol` jest jedynym
znanym nam dziś przypadkiem, w którym trafia.

Tabela 30 wierszy z raportu to rozstrzygnie. Oczekuję w niej `Glyceryl Stereate`,
`Ethylhexyl Stereate` i `Ethylexyglycerin` jako **nietrafione, niesklejone**.

## 2. HITL dla Trimay przez prawdziwe `resolveHitl`

Piszesz o „sztucznej interwencji". Ma to przejść przez metodę `resolveHitl`,
którą zbudowałeś w Zadaniu 30, z prawdziwym wpisem w `hitl_log` i ze statusem
`HITL_OVERRIDDEN` na węźle. Nie przez ustawienie pola w stanie z boku.

W raporcie ma być widoczny `hitl_log` z tego przebiegu.

## 3. Kolejność, gdyby zabrakło czasu

Jeżeli o którejś godzinie zobaczysz, że nie zdążysz z całością, **nie skracaj
walidatorów ani bramek** — utnij zakres od końca:

1. A5 i A6 — bez nich nie ma oferty, to jest minimum
2. A7 — poprawia sprzedażowo, ale oferta bez niego jest kompletna i legalna
3. A10 — audyt końcowy; jego brak zapisujesz jako otwarte ryzyko

Raportujesz, co zostało niezrobione. Zadanie niedokończone i opisane jest warte
więcej niż zadanie „skończone" z wyłączonym walidatorem.
