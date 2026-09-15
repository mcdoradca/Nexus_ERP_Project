# ADR-074: Całościowy Audyt Jakościowy SDS, Eliminacja Regresji w Sekcji 4 i Kanonizacja Nagłówków UE 2020/878

## Status
Zaakceptowany i wdrożony produkcyjnie.

## Data
2026-09-15

## Kontekst i Zgłoszone Problemy
Podczas weryfikacji i audytu karty charakterystyki `Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA (9).docx` w odniesieniu do włosko-angielskiego oryginału PDF producenta (`8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1) (1).pdf`) oraz uwag audytu zewnętrznego, zidentyfikowano następujące usterki i ryzyka regresji:
1. **Zubożenie Sekcji 4 (Pierwsza pomoc):** Parser `processSection4` poszukiwał wyłącznie zwrotów `In case of skin contact` itp., pomijając standardowe oznaczenia blokowe producentów (`EYES:`, `SKIN:`, `INGESTION:`, `INHALATION:`). Skutkowało to zastąpieniem bogatych zaleceń producenta ubogimi, generycznymi szablonami, a także utratą instrukcji wstępnej o konsultacji lekarskiej oraz bloku ochrony osób udzielających pomocy (*Rescuer protection*).
2. **Niespójność typograficzna nagłówków:** Sekcje deterministyczne generowały nagłówki z dwukropkiem (`SEKCJA 4: ŚRODKI PIERWSZEJ POMOCY`), podczas gdy sekcje tłumaczone przez AI lub parser przejmowały nagłówki z kropką (`SEKCJA 5. POSTĘPOWANIE W PRZYPADKU POŻARU`), a przy braku linii nagłówkowej w bloku tłumaczenia – sam numer sekcji z dwukropkiem (`SEKCJA 5:`).
3. **Błędne domyślne wersjonowanie w eksporterze:** W `SDSDocxExporter` oraz w sygnaturze `processSection16` występował fallback do wersji `"2.0 PL"`, co w przypadku braku jawnego parametru mogło wywołać sprzeczność logiczną z klauzulą wydania pierwszego w języku polskim.
4. **Deduplikacja parametrów toksykologicznych w Sekcji 11.1:** Zabezpieczenie przed powielaniem prefiksów parametrów badawczych (`LC50...: LC50...`) oraz eliminacja artefaktów jednostek czasu (`0,32 mg/l/7h 7h`).

## Podjęte Decyzje Architektoniczne

1. **Kompleksowa Przebudowa Parsingu i Słownika Sekcji 4 (`processSection4`):**
   - Rozszerzono regexy ekstrakcji o etykiety `EYES`, `OCCHI`, `SKIN`, `PELLE`, `INGESTION`, `INGESTIONE`, `INHALATION`, `INALAZIONE`, preambułę medyczną oraz blok `Rescuer protection` / `Protezione dei soccorritori`.
   - Zaktualizowano `PHRASE_DICTIONARY_PL` o wierne, profesjonalne tłumaczenia zaleceń producenta (płukanie oczu przez minimum 15 minut, natychmiastowe zdjęcie zanieczyszczonej odzieży, zakaz wywoływania wymiotów, zalecenie rękawic jednorazowych dla ratowników).
   - W Sekcji 4.2 zharmonizowano deklarację producenta o braku specyficznych danych klinicznych dla gotowej mieszaniny z merytoryczną, kliniczną dedukcją objawów (dla oczu H319, skóry z uwzględnieniem kumaryny jako alergenu, inhalacji z alkoholem oraz braku powikłań opóźnionych).
   - W Sekcji 4.3 usunięto sztuczny prefiks "Leczenie:" i wiernie oddano wymogi wyposażenia stanowiska pracy w bieżącą wodę do przemywania oczu i skóry.

2. **Kanonizacja Nagłówków w `SDSDocxExporter` (`CANONICAL_SECTION_TITLES`):**
   - Wprowadzono słownik urzędowych tytułów wszystkich 16 sekcji zgodnie z Załącznikiem II do Rozporządzenia (WE) nr 1907/2006 (zmienionym UE 2020/878).
   - Wszystkie sekcje – zarówno deterministyczne, jak i tłumaczone – otrzymują jednolity, profesjonalny nagłówek w formacie: `SEKCJA X: OFICJALNY TYTUŁ`.

3. **Ujednolicenie Wersjonowania i Metryki:**
   - Domyślną wersją w `SDSDocxExporter` i `processSection16` jest bezwzględnie `1.0 PL`.
   - Klauzula `Zastępuje wersję` przyjmuje brzmienie: `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia 14.02.2025 r.)`.

4. **Wzmocnienie Deduplikatora Toksykologicznego w 11.1:**
   - Rozszerzono wzorce w `polonizeToxicologicalSection` o uniwersalne wychwytywanie zduplikowanych etykiet `LC50 / LD50` oraz deduplikację powtórzonego czasu ekspozycji (`7h 7h` -> `7h`).

## Weryfikacja
- `tests/sds.8_points_audit.test.js`: 12/12 testów zakończonych wynikiem PASSED (w tym dedukcja objawów 4.2, piktogramy DOCX, Załącznik XVII REACH poz. 3, 40, 75, Seveso P5c, deduplikacja LC50, metryka 1.0 PL).
- `tests/sds.compliance.test.js`: 7/7 testów PASSED.
- `tests/sds.rtf.test.js`: 6/6 testów PASSED.
- `npm test`: 122/122 testów systemowych PASSED (0 błędów).
- Zweryfikowano strukturę XML i układ nagłówków wygenerowanego dokumentu DOCX.
