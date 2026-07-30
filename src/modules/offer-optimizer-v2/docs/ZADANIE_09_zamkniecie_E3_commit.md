# ZADANIE 09 — ZAMKNIĘCIE E3 COMMITEM

| Pole | Wartość |
|---|---|
| Numer | 09 |
| Etap | E3 (ostatnie zadanie etapu) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_08 — cofnięcie szkody .gitignore (wykonane poprawnie) |
| Oczekiwany raport | RAPORT_09_zamkniecie_E3_commit.md |

## KONTEKST (do przeczytania, nie do wykonania)

Stan po Zadaniu 08: migracje Prismy i `sql/` przywrócone do gita, `src/modules/.gitignore` usunięty, escapowanie markdownu w MASTER_HANDOFF §9 zdjęte.

`DECISION_LOG.md` nadal pokazuje się w `git diff --stat` jako `Bin`, ale rozmiar roboczy nie drgnął (6755 → 6755), a odczyt pierwszych 15 linii był czytelny. Oznacza to, że kopia robocza jest już UTF-8, a binarna jest wersja w HEAD. To znika po commicie — dlatego commit jest ostatnim krokiem etapu, a nie kolejną naprawą.

## KROKI

### KROK 1
```
git add -A
```

### KROK 2
```
git commit -m "E3: RAG v2 closed - deterministic GATE-3, index coverage 99-100 pct, gate label-form matching, encoding UTF-8, repo hygiene"
```
Commit message wyłącznie ASCII — bez polskich znaków.

### KROK 3
```
git log --oneline -3
```
Wklej surowy output.

### KROK 4
```
git diff HEAD~1 --stat
```
Wklej surowy output. Sprawdź, czy `DECISION_LOG.md` pokazuje się jako liczba zmienionych linii, a **nie** jako `Bin`.

Jeśli nadal `Bin` — **NIE naprawiaj**. Zgłoś w raporcie i zatrzymaj się.

### KROK 5
```
npm test
```
Wklej podsumowanie od linii `ℹ tests` do końca.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] `git log` pokazuje nowy commit
- [ ] `DECISION_LOG.md` w diffie jako liczba linii, nie `Bin`
- [ ] `npm test`: `fail 0`, `tests` ≥ 60

## ZAKAZY

- Zero zmian w kodzie i testach w tym zadaniu.
- Zero kasowania plików nieśledzonych (`??`) — sprzątanie repo jest zaplanowane na E7 (D14).
- Nie uruchamiaj `clear_db.js` ani żadnego skryptu z katalogu głównego.
- Sekrety w outputach zastępowane `***`.

## KONWENCJA NAZEWNICZA (obowiązuje od teraz, obie strony)

- Zadanie od Architekta: `ZADANIE_NN_krotki_opis.md`
- Raport od Wykonawcy: `RAPORT_NN_krotki_opis.md` — ten sam numer co zadanie.
- Każdy raport zawiera surowe outputy i `git diff --stat`. Raport bez nich nie podlega ocenie (Z-1).
- Numeracja ciągła przez cały projekt, niezależna od etapu.
