# ADR-068: SDS Regulatory Refinements & Gemini 3.8 Flash Compliance Auditor Integration

## Status
Zaakceptowany i wdrożony (Production-Ready)

## Kontekst i Problem Biznesowy
Podczas weryfikacji formalno-prawnej karty SDS dla mieszaniny *SWEET HOME - PROFUMATORE AMBIENTE ORCHIDEA E VANIGLIA V2* zidentyfikowano serię 5 krytycznych niezgodności formalno-prawnych i regulacyjnych w odniesieniu do aktów prawnych znajdujących się w repozytorium (`docs/SDS/`): Rozporządzenia (UE) 2020/878 (Załącznik II do REACH), Rozporządzenia (WE) nr 1272/2008 (CLP), Rozporządzenia Ministra Pracy w sprawie NDS (Dz.U. 2024 poz. 1017) oraz Rozporządzenia Ministra Klimatu w sprawie katalogu odpadów (Dz.U. 2020 poz. 10):

1. **Sekcja 9.1:** Pozostawiony obcojęzyczny zwrot `not specified` oraz błędne określenie rozpuszczalności w wodzie (naruszenie art. 31 ust. 5 REACH; w karcie źródłowej producent wskazał `Solubility: soluble in water`).
2. **Sekcja 8.1:** Zniekształcony i nieczytelny zapis wartości DNEL (sklejone wartości liczbowe bez podziału na populację konsumenci vs pracownicy oraz rodzaj narażenia; naruszenie pkt 8.1.1 Załącznika II do REACH).
3. **Sekcja 12 (12.1, 12.2, 12.4):** Pominięcie badań ekotoksyczności kumaryny w 12.1 (6 badań), podatności kumaryny na biodegradację w 12.2 oraz współczynnika podziału gleba/woda Koc = 4,2 dla BHT w 12.4 z powodu wady składniowej regexu granicy bloku ostatniej substancji.
4. **Sekcja 2.2:** Przekroczenie limitu zwrotów wskazujących środki ostrożności (7 zwrotów P zamiast max 6 zgodnie z art. 28 ust. 3 CLP – nadmiarowy zwrot `P302+P352`) oraz brak formy biernikowej w zwrocie `EUH208` ("Zawiera kumarynę...").
5. **Sekcja 1.2:** Zniekształcenia tabelaryczne powstałe z formatu PDF (`- -` w polu zastosowań zidentyfikowanych).
6. **Brak aktywnego Agenta Audytora AI:** Agent `SDSVerifierAgent` posiadał import `GoogleGenerativeAI`, jednak model `gemini-3.8-flash` nie był włączony do procesu ostatecznej weryfikacji.

## Podjęte Decyzje Architektoniczne

1. **Naprawa deterministycznej ekstrakcji w Sekcji 12 (`sds.service.js`):**
   - Zamknięto wzorzec `endPat` w nawias grupujący `(?:${endPat})` w funkcji `extractSubstanceBlock`. Wyeliminowało to błąd pierwszeństwa operatorów alternatywy regexu, przywracając bezbłędną ekstrakcję dla wszystkich składników zamykających sekcje (kumaryna w 12.1 i 12.2, BHT w 12.4).
   - Wprowadzono wyznaczanie podsekcji 12.4 (`block4`) z wykorzystaniem znacznika `idxMob` w trybie sklejonych nagłówków (`clumpedMatch`).

2. **Ustrukturyzowanie parametrów Sekcji 9.1 i normalizacji fizykochemicznej:**
   - Wdrożono rozbijanie sklejeń kolumnowych parsera PDF (`Method:`, `Temperature:`, `Remark:`).
   - Dodano precyzyjne mapowanie rozpuszczalności (`soluble in water` -> `rozpuszczalny w wodzie`), wykluczając jakiekolwiek pozostawianie obcych terminów (`not specified` -> `nie określono`).

3. **Determinizm regulacyjny Sekcji 2.2 i Sekcji 8.1:**
   - Wdrożono algorytm redukcji zwrotów P w `processSection2` eliminujący zwroty o niskim priorytecie (np. `P302+P352` przy braku zaklasyfikowania jako działający drażniąco na skórę) i gwarantujący $\le 6$ zwrotów P zgodnie z art. 28 ust. 3 CLP.
   - Wdrożono algorytm fleksyjny `toAccusative` zapewniający poprawną odmianę nazw chemicznych na biernik w `EUH208` (`kumaryna` $\to$ `kumarynę`).
   - Wdrożono czytelną hierarchię wartości DNEL i PNEC w `extractDnelPnec` z rozbiciem na populacje (Pracownicy, Konsumenci), drogi narażenia oraz charakter skutków.

4. **Aktywacja Nadzorczego Audytora AI (`gemini-3.8-flash`) w reżimie Defensive AI:**
   - Wzbogacono `SDSVerifierAgent` (`sds.verifier.agent.js`) o asynchroniczną metodę `auditWithGemini`.
   - Model `gemini-3.8-flash` wyposażono w instrukcję systemową opartą na aktach prawnych z `docs/SDS/` (Załącznik II do REACH, CLP, NDS Dz.U. 2024 poz. 1017, Katalog Odpadów).
   - Zastosowano architekturę Defensive AI z timeoutem (45s) i osłoną try-catch: w razie awarii połączenia deterministyczne reguły JS gwarantują 100% stabilności procesu produkcyjnego.

## Skutki i Weryfikacja
- Wszystkie 122 testy jednostkowe i integracyjne w `npm test` przechodzą pomyślnie (`pass 122, fail 0`).
- Dedykowany audyt `tests/sds.8_points_audit.test.js` potwierdza spełnienie wszystkich punktów audytowych (w tym 5 nowych wymagań).
- Dedykowany audyt `tests/sds.compliance.test.js` (7 testów prawnych) przechodzi pomyślnie.
- Wygenerowano finalny, bezbłędny plik produkcyjny: `docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA_V2_PL.docx`.
