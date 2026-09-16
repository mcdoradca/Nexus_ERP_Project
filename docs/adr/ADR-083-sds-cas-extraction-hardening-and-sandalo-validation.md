# ADR-083: Uszczelnienie Ekstrakcji Numerów CAS (Eliminacja Fałszywego 002-00-6 z INDEX) oraz Walidacja Karty SANDALO

## Kontekst
Podczas przetwarzania nowej karty charakterystyki `8034055535424_SDS_SANDALO (1).pdf` system uruchomił procedurę zatrzymania ochronnego (HITL) z powodu niewykrycia dwóch numerów CAS:
1. `28219-61-6` – autentyczny składnik zapachowy (Bacdanol), pomyślnie zidentyfikowany przez Agenta Śledczego.
2. `002-00-6` – nieistniejący kod chemiczny, dla którego Agent Śledczy zwrócił pusty wynik.

Analiza techniczna kodu ujawniła, że kod `002-00-6` był artefaktem wadliwego parsowania:
- W Sekcji 3.2 karty SANDALO występuje kwas octowy (`acetic acid ...%`) o urzędowym numerze indeksowym `INDEX 607-002-00-6`.
- Wyrażenie regularne `\b\d{2,7}-\d{2}-\d\b` dopasowało granicę słowa `\b` tuż po myślniku (`-` jest traktowany w regex jako separator niealfanumeryczny), ekstrahując końcówkę `002-00-6`.
- Zbiegiem okoliczności matematycznej ciąg `002-00-6` przeszedł test algorytmu sumy kontrolnej Modulo 10 ($2 \times 3 = 6$, $6 \pmod{10} = 6$).
- W oficjalnym rejestrze Chemical Abstracts Service żaden numer CAS nie rozpoczyna się od zera (najniższy w historii to 50-00-0 formaldehydu), ani nie może być częścią numeru indeksowego.

## Podjęte Decyzje Architektoniczne

1. **Uszczelnienie Regexów Ekstrakcji CAS:**
   - Zastąpiono wzorzec `\b\d{2,7}-\d{2}-\d\b` bezpiecznym wzorcem:
     `(?<![\d-])[1-9]\d{1,6}-\d{2}-\d(?![\d-])`
   - Wykorzystano negatywny lookbehind `(?<![\d-])` oraz lookahead `(?![\d-])`, co uniemożliwia wycinanie podciągów z 4-segmentowych numerów INDEX (`607-002-00-6`), numerów WE/EC (`XXX-XXX-X`), dat i numerów telefonów.
   - Wymóg pierwszej cyfry z zakresu `[1-9]` wyklucza jakiekolwiek fałszywe numery z zerami wiodącymi.
   - Poprawkę wdrożono w `extractCas` oraz `parseLimsSection3` w [sds.service.js](file:///z:/Nexus_ERP_Project/src/modules/sds/sds.service.js) oraz `normalizeIdentifiers` w [sds.table.parser.js](file:///z:/Nexus_ERP_Project/src/modules/sds/engine/sds.table.parser.js).

2. **Rozszerzenie Słownika Wiedzy Chemicznej (`CAS_TO_PL_MAP` i `ALLERGEN_NAMES_PL`):**
   - Zgodnie z ustaleniami Agenta Śledczego zasilano bazę o CAS `28219-61-6`: `2-etylo-4-(2,2,3-trimetylocyklopent-3-en-1-ylo)but-2-en-1-ol`.
   - Dodano pozostałe substancje z karty SANDALO:
     - `34590-94-8`: `(2-metoksymetyloetoksy)propanol` (zgodnie z Dz.U. 2018 NDS 240 mg/m³, NDSCh 480 mg/m³, notacja „skóra”)
     - `107898-54-4`: `(±) trans-3,3-dimetylo-5-(2,2,3-trimetylocyklopent-3-en-1-ylo)pent-4-en-2-ol` (Polysantol)
     - `470-82-6`: `1,8-cyneol (eukaliptol)`
     - `469-61-4`: `alfa-cedren`
     - `64-19-7`: `kwas octowy` (NDS 25 mg/m³, NDSCh 50 mg/m³)
     - `142-82-5`: `heptan` (NDS 1200 mg/m³, NDSCh 2000 mg/m³)
     - `108-95-2`: `fenol` (NDS 7,8 mg/m³, NDSCh 16 mg/m³, notacja „skóra”)

3. **Dedykowany Zestaw Testowy SANDALO:**
   - Utworzono [sds.sandalo_audit.test.js](file:///z:/Nexus_ERP_Project/tests/sds.sandalo_audit.test.js) (7/7 testów PASSED).
   - Weryfikuje: brak zatrzymań HITL, całkowitą eliminację `002-00-6`, obecność Bacdanolu i kwasu octowego, wstrzykiwanie limitów NDS oraz poprawny eksport DOCX.

## Konsekwencje
- Wyeliminowano fałszywe alarmy HITL wynikające z parsowania numerów indeksowych CLP.
- Karta SANDALO generuje się w 100% poprawnie i automatycznie.
- Wszystkie testy regresyjne w repozytorium zakończone sukcesem (100% PASS).
