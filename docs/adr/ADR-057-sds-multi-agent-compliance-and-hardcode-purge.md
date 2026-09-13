# ADR-057: Eliminacja Zafałszowań i Hardkodów, Architektura Wieloagentowa z Agentem Audytorem (SDSVerifierAgent) oraz Pełna Zgodność Prawna (UE 2020/878, CLP, Seveso III, Dz.U. 2020 poz. 10, Dz.U. 2018 poz. 1286, Dz.U. 2016 poz. 1488)

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
Audyt modułu generowania kart SDS (`src/modules/sds/`) wykazał obecność sztywnych wpisów (hardkodów), założeń i pozostałości po fazie testowej na pojedynczym typie produktów (perfumy do tkanin), które mogły fałszować treść dokumentów dla innych rodzajów chemikaliów i produktów technicznych:
1. **Sekcja 8.1 (Wartości OEL):** Sztywne doklejanie austriackiego limitu OEL (0,05 mg/m³) dla konserwantu CMI/MI (CAS: 55965-84-9) nawet wtedy, gdy substancja ta w ogóle nie występowała w składzie produktu.
2. **Sekcja 12.6 (Właściwości zaburzające funkcjonowanie układu hormonalnego):** Domyślne orzekanie o obecności Galaksolidu (CAS: 1222-05-5) na liście ED ECHA dla każdej karty, niezależnie od składu.
3. **Sekcja 3.2 (Charakterystyka mieszaniny):** Sztywny opis w tabeli DOCX („Mieszanina zapachowa na bazie wodnej z dodatkiem solubilizatorów i substancji konserwujących”).
4. **Sekcja 13 (Gospodarka odpadami):** Sztywne przypisanie kodów odpadów wyłącznie dla branży detergentów (`07 06 99` / `07 06 04*`), pomijające farby, kleje, rozpuszczalniki czy aerozole.
5. **Sekcja 15.1 (Przepisy prawne):** Bezwzględne powoływanie Rozporządzenia (WE) nr 648/2004 o detergentach dla produktów niedetergentowych oraz brak precyzyjnego orzeczenia progów Seveso III (Dz.U. 2022 poz. 1816).
6. **Sekcja 8.2 (Środki Ochrony Indywidualnej):** Brak rygorystycznego powiązania z polskimi i unijnymi normami BHP (Dz.U. 2016 poz. 1488, PN-EN 166, PN-EN ISO 374-1, PN-EN 14387) przy występowaniu zagrożeń korozyjnych, drażniących i łatwopalnych.
7. **Architektura:** Brak niezależnej instancji kontrolnej (Quality Gatekeeper) w modelu Multi-Agent Swarm weryfikującej spójność chemiczno-prawną wygenerowanych sekcji przed eksportem do DOCX.

## Podjęte Decyzje Architektoniczne

### 1. Rozszerzenie Baz Wiedzy RAG
- **`src/modules/sds/rag_knowledge/waste_codes_pl.json` [NOWY]:** Utworzono branżowy rejestr kodów odpadów zgodny z Rozporządzeniem Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10). Baza obejmuje 6 kategorii (detergenty, farby/lakiery, kleje, rozpuszczalniki, aerozole, chemia ogólna) wraz z kodami odpadu produktu, opakowań (15 01 02, 15 01 10*) i odpadów komunalnych. Zaimplementowano klasę `WasteRegistry`.
- **`src/modules/sds/rag_knowledge/adr_transport_pl.json` [ROZSZERZONY]:** Rozszerzono bazę transportową do 27 kluczowych pozycji UN (m.in. UN 1266, UN 1993, UN 1170, UN 1203, UN 1223, UN 1230, UN 1760, UN 1789, UN 1791, UN 1805, UN 1824, UN 1830, UN 1950, UN 2014, UN 2031, UN 2672, UN 3082), w tym kody klasyfikacyjne, grupy pakowania, nalepki, kody ograniczeń przewozu przez tunele oraz ilości wyłączone i ograniczone (LQ/EQ).

### 2. Nowy Agent Audytor Prawno-Chemiczny (`SDSVerifierAgent`)
- Wdrożono agenta `src/modules/sds/sds.verifier.agent.js` działającego z temperaturą `0.0` (zero tolerancji dla halucynacji i kreatywności).
- Agent weryfikuje 7 kluczowych kryteriów prawnych:
  1. *Spójność ED (2.3 vs 12.6):* Wykrywanie sprzeczności między deklaracją w 2.3 a obecnością substancji zaburzającej układ hormonalny w 12.6.
  2. *Wiarygodność OEL (8.1 vs 3.2):* Zabezpieczenie przed przypisywaniem limitów OEL substancjom nieobecnym w składzie.
  3. *Adekwatność ŚOI (8.2 vs 2.1/2.2):* Sprawdzanie wymogu ochrony oczu (PN-EN 166) i rąk (PN-EN ISO 374-1) przy klasyfikacji zagrożeń fizycznych i zdrowotnych (H318, H319, H314, H315, H317, H224, H225, EUH066).
  4. *Zgodność Kodów Odpadów (13):* Sprawdzanie poprawności formatu XX YY ZZ i gwiazdki `*` dla odpadów niebezpiecznych wg Dz.U. 2020 poz. 10.
  5. *Zgodność Transportowa ADR (14):* Walidacja 7 podsekcji i formatu numeru UN.
  6. *Prawidłowość Podstaw Prawnych (15.1):* Warunkowość Rozporządzenia 648/2004 i poprawność aktów prawnych RP.
  7. *Kompletność Zwrotów H (16):* Zgodność ze słownikiem CLP (brak nieprzetłumaczonych fraz).
- Wdrożono mechanizm automatycznej remediacji (`autoRemediate`), który natychmiast koryguje wykryte rozbieżności przed eksportem.

### 3. Eliminacja Hardkodów w `sds.service.js`
- **Sekcja 1.3:** Wprowadzono pełną konfigurację teleadresową firmy wprowadzającej do obrotu (`companyConfig` z polami: name, street, postalCode, city, voivodeship, country, email, phone) z bezpiecznymi fallbackami.
- **Sekcja 2.3 i 12.6:** Usunięto sztywny Galaksolid (CAS: 1222-05-5). Weryfikacja statusu ED odbywa się wyłącznie na podstawie numerów CAS faktycznie wyekstrahowanych z sekcji 3 i zweryfikowanych w bazie `EcotoxRegistry`. Informacja z 12.6 dynamicznie zasila oświadczenie w 2.3.
- **Sekcja 3.2:** Zastąpiono statyczny opis uniwersalną metodą `_determineMixtureDescription(composition, rawSec3, rawSec1)` analizującą składniki i przypisującą precyzyjną naturę fizykochemiczną mieszaniny (roztwór wodny, alkoholowy, rozpuszczalnikowy, formulacja aerozolowa lub mieszanina substancji organicznych).
- **Sekcja 5.1:** Zapewniono bezpieczny pożarowo fallback w podsekcji 5.1 w przypadku braku danych w karcie źródłowej (proszek gaśniczy, CO2, piana gaśnicza, mgła wodna; zakaz zwartego strumienia wody).
- **Sekcja 8.1:** Wartości OEL są przypisywane wyłącznie wówczas, gdy dany CAS znajduje się w składzie mieszaniny. Dodano ekstrakcję poziomów DNEL i PNEC z tekstu źródłowego PDF.
- **Sekcja 8.2:** Pełna deterministyczna ochrona ŚOI oparta na Rozporządzeniu Ministra Gospodarki z dnia 21 grudnia 2005 r. (Dz.U. 2016 poz. 1488) oraz normach: PN-EN 166, PN-EN ISO 374-1 i PN-EN 14387.
- **Sekcja 13:** Dynamiczny dobór kodów odpadów w oparciu o kategorię branżową z `WasteRegistry`.
- **Sekcja 15.1:** Rozporządzenie 648/2004 jest przywoływane wyłącznie dla detergentów i środków czyszczących. Dodano precyzyjne orzeczenie progów Seveso III (Dz.U. 2022 poz. 1816).

### 4. Integracja w Pipeline Wieloagentowym (`sds.agent.js`)
- Do cyklu przetwarzania włączono Krok 4: Weryfikacja Prawno-Chemiczna przez `SDSVerifierAgent`.
- Pełna integracja telemetryczna: audyt i auto-korekta są logowane do metadanych sekcji.

## Weryfikacja i Wyniki
1. **Testy Jednostkowe i Prawne:** Nowy zestaw testów `tests/sds.compliance.test.js` zweryfikował 7 kluczowych aspektów prawnych – 7/7 testów zakończonych sukcesem.
2. **Testy Regresyjne:** Kompletny zestaw 122 testów systemowych w repozytorium przeszedł w 100% pozytywnie (`exit code 0`).
3. **Weryfikacja End-to-End:** Przetworzono rzeczywisty plik PDF karty SDS (`docs/SDS/8051944811087_SDS_NAJMA.pdf`). Generator wyprodukował poprawny plik DOCX bez błędów, z zero naruszeń w audycie `SDSVerifierAgent`.
