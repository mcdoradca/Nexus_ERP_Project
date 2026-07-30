# ZADANIE 10 — REJESTR DECYZJI I KOREKTA COMMITU 04e1494

| Pole | Wartość |
|---|---|
| Numer | 10 |
| Etap | E3 → E4 (zadanie pomostowe, bez kodu potoku) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_09 — zamknięcie E3 commitem (wykonane, z dwoma skutkami ubocznymi) |
| Oczekiwany raport | RAPORT_10_rejestr_decyzji.md |

## KONTEKST (do przeczytania, nie do wykonania)

E3 jest zamknięty: commit `04e1494`, bateria 60/60, pokrycie indeksu 98,89% / 100% / 100%. Etap uznaję za domknięty i nie wracamy do niego.

Zadanie 09 miało dwa skutki uboczne, oba do naprawienia tutaj.

**Pierwszy — błąd Architekta.** Krok 1 Zadania 09 brzmiał `git add -A`. To polecenie wciągnęło do commitu wszystkie luźne pliki z katalogu głównego (`check_*.js`, `run_*.js`, `read_headers.js`, `sample_extract.js`, `clear_db.js`, `fix_encoding.js`, `diff.txt`, `logs/`, pliki `*-audit.json`) — 1561 wstawionych linii, z czego znakomita większość to śmieci robocze. Instrukcja była moja, nie wykonawcy. Poniżej cofnięcie.

**Drugi — `DECISION_LOG.md` nadal binarny.** Rozmiar nie drgnął (5592 → 6755 w obu przebiegach), mimo że odczyt 15 linii był czytelny. Najprostsze wyjaśnienie: w Zadaniu 07 plik został odczytany i zdekodowany do wypisania na ekran, ale **nigdy nie zapisany z powrotem na dysk**. Krok 1 poniżej to rozstrzyga jednoznacznie.

Rejestr decyzji jest potrzebny teraz, przed pierwszą linią kodu E4, bo cztery decyzje architektoniczne z ostatnich rund nie mają nigdzie śladu. Projekt raz już zdryfował dokładnie z tego powodu.

## KROKI

### KROK 1 — konwersja DECISION_LOG.md z zapisem na dysk

Skrypt jednorazowy w Node (uruchom przez `node -e` albo plik tymczasowy):

- odczytaj `src/modules/offer-optimizer-v2/docs/DECISION_LOG.md` jako `Buffer`,
- wykryj kodowanie po BOM (`FF FE` = UTF-16LE, `FE FF` = UTF-16BE, `EF BB BF` = UTF-8 z BOM),
- zdekoduj do stringa,
- usuń BOM z początku stringa,
- **zapisz z powrotem**: `fs.writeFileSync(path, tekst, 'utf8')`.

Weryfikacja — wklej surowy output:
```
git diff --stat -- src/modules/offer-optimizer-v2/docs/DECISION_LOG.md
```
Musi pokazać liczbę zmienionych linii. Jeśli nadal `Bin` — **STOP i zgłoś**, nie próbuj dalej.

To samo zastosuj do `docs/RAPORT_E3_FIX2.md` i `docs/RAPORT_E3_FIX3.md`.

### KROK 2 — dopisanie wpisów D11–D14

Dopisz na koniec `DECISION_LOG.md` poniższy blok **dosłownie**, przez `fs.writeFileSync` w utf8. Zakaz escapowania markdownu (żadnych `\[`, `\_`, `\.`).

```markdown
## [2026-07-30] Decyzje Architekta — runda przejęcia

D11. ZAKRES E4 — ZAWĘŻENIE
2026-07-30 | plan: E4 = pełny potok A1-A10 | decyzja operatora: E4 = potok tekstowy A1-A7 + A10; A8/A9 (wizualia, Photoroom, etykieta AI Act) po cutoverze |
uzasadnienie: ryzyko prawne leży w treści ofertowej, nie w zdjęciach lifestyle; skrócenie drogi do testu A/B |
konsekwencje: (1) E6 = cutover CZĘŚCIOWY - endpointy serwujące grafiki zostają na starym module; (2) E7 nie usuwa starego modułu przed wdrożeniem A8/A9; (3) SHARED_RULES §G wypada z mapy dystrybucji prefiksów w E4 - kompilator nie wstrzykuje go do żadnego węzła; (4) E5 obejmuje wyłącznie treść tekstową |
ryzyko: AI Act art. 50 stosowany od 2.08.2026 - wizualia AI pozostają poza kontrolą v2 do czasu wdrożenia A8/A9.

D12. WPISY WARUNKOWE W BRAMKACH
2026-07-30 | SOT 04 §1: Titanium Dioxide (nano) zakazany "w produktach doustnych/higienicznych"; SOT 06 §2: Climbazole zakazany "jako substancja lecznicza" | repo wymaga: kod dopasowuje po nazwie i implementuje oba wpisy BEZWARUNKOWO |
decyzja: bramka pozostaje twarda (S-2 nienaruszone, STOP nie jest zmiękczany do ostrzeżenia), ale wpisy warunkowe otrzymują osobne kody powodu: BANNED_SUBSTANCE_CONDITIONAL i INGREDIENT_NOT_COSMETIC_CONDITIONAL - żeby HITL rozstrzygał je w sekundy zamiast rozbierać sprawę od zera |
wdrożenie: E4b |
obserwacja dodatkowa: wpisy "corticosteroids" i "antybiotyki" to nazwy klas, nie nazwy INCI - nie mogą trafić w żadną prawdziwą etykietę; realnie działają dopiero nazwy jednostkowe pod nimi (hydrocortisone, erythromycin, clindamycin, neomycin) |
ryzyko: fałszywe STOP-y na szamponach przeciwłupieżowych z klimbazolem i na kosmetykach z TiO2 nano.

D13. NOTACJA NANO W BRAMCE GATE-1
2026-07-30 | dokumentacja: rozp. 1223/2009 art. 19(1)(g) - etykiety UE oznaczają nanomateriały zapisem [nano] w nawiasie KWADRATOWYM (np. "Titanium Dioxide [nano]") | repo wymaga: SOT 04 §1 i listy w kodzie używają zapisu (nano) w nawiasie okrągłym |
stan przed poprawką: gate_ingredients porównywał surowy string bez normalizacji - GATE-1 był ŚLEPY na prawdziwą formę etykietową, zakazany nanomateriał przechodził przez bramkę przy zielonej baterii testów |
decyzja: normalizeIngredientName sprowadza [nano] / (nano) / "nano" do jednego tokenu i jest stosowana PO OBU STRONACH porównania; porównanie pozostaje ŚCISŁE (nigdy podciągowe, żeby zwykły Titanium Dioxide nie dawał fałszywego trafienia) |
status: wdrożone w ZADANIE_05; testy "GATE-1 forma etykietowa" i "GATE-1 brak falszywych trafien" zielone |
ryzyko: brak - S-6 nienaruszone, żadna pozycja list nie została dodana, usunięta ani zmieniona.

D14. SPRZĄTANIE REPOZYTORIUM
2026-07-30 | decyzja operatora: luźne pliki robocze w katalogu głównym zostają na dysku; sprzątanie ostrożne, z listą do akceptacji, dopiero w E7 |
zasada natychmiastowa: ZAKAZ uruchamiania clear_db.js i jakiegokolwiek skryptu z katalogu głównego bez jawnego polecenia |
uzasadnienie: repozytorium ewoluowało od lutego 2026 przez wiele iteracji, przynależność plików nie jest ustalona, kasowanie na tym etapie to ryzyko bez zysku.
```

### KROK 3 — cofnięcie skutku `git add -A`

Zdejmij z gita pliki wciągnięte omyłkowo. **Pliki zostają na dysku** (D14), znikają wyłącznie z indeksu:

```
git rm --cached check_encoding.js check_inci.js check_leaks.js check_schema.js clear_db.js fix_encoding.js read_headers.js run_headers.js run_hygiene.js run_inventory.js sample_extract.js diff.txt fix_db.js
git rm --cached -r logs/
```

Następnie uzupełnij `.gitignore` w katalogu głównym o brakujące pozycje (dopisz, nie nadpisuj istniejących):
```
check_*.js
run_*.js
read_headers.js
sample_extract.js
clear_db.js
fix_encoding.js
update_env.js
diag.js
diag.sh
```

### KROK 4 — commit i weryfikacja

```
git add -u
git add .gitignore src/modules/offer-optimizer-v2/docs/DECISION_LOG.md src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX2.md src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX3.md
git commit -m "docs: decision log D11-D14, utf8 conversion, untrack scratch scripts"
```

Uwaga: **nie używaj `git add -A`** w tym zadaniu.

Wklej surowe outputy:
```
git log --oneline -2
git diff HEAD~1 --stat
git status --short
```

## KRYTERIUM ZALICZENIA (binarne)

- [ ] `DECISION_LOG.md` w `git diff --stat` pokazuje liczbę linii, nie `Bin`
- [ ] Wpisy D11–D14 obecne w pliku, bez escapowania markdownu
- [ ] `git status --short` nie zawiera już `check_*.js`, `run_*.js`, `clear_db.js`, `diff.txt`, `logs/` jako plików śledzonych
- [ ] `prisma/migrations/` i `sql/` NADAL w gicie (nie mogą zniknąć — sprawdź, że nie ma przy nich `D`)

## ZAKAZY

- Zero zmian w kodzie potoku, walidatorach i testach.
- Zero kasowania plików z dysku.
- Zakaz `git add -A`.
- Zakaz uruchamiania `clear_db.js`.
- Sekrety w outputach zastępowane `***`.
