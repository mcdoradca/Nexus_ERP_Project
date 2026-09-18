# ADR-0118: Standaryzacja i Wdrożenie Kanonicznej Korporacyjnej Stopki Sekcji 16 ITALLUX

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-09-18

## Kontekst
Wcześniejsze wersje silnika SDS w Sekcji 16 generowały skrótowy, domyślny blok literatury oraz wskazówek szkoleniowych bezpośrednio z halucynacji lub uproszczonych promptów modeli LLM (np. ogólne odniesienie do REACH/CLP i ECHA oraz 2-linijkowe wskazówki szkoleniowe). Brakowało w nim:
1. Precyzyjnych odnośników do kart surowców producentów, linków do baz ECHA (`https://echa.europa.eu/`) oraz PubChem (`https://pubchem.ncbi.nlm.nih.gov/`), a także kluczowych krajowych aktów prawnych (Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587).
2. Pełnej, urzędowej instrukcji szkoleń pracowników w zakresie BHP i postępowania w sytuacjach awaryjnych.
3. Formalnej noty o wydaniu pierwszym w języku polskim (wersja 1.0 PL) wraz z dynamiczną datą sporządzenia karty producenta oraz wyliczeniem 5 obligatoryjnych zmian dostosowawczych do prawa polskiego i UE 2020/878 (Sekcje 1.3, 8.1, 11.2/12.6, 13, 14).
4. Pełnej klauzuli ochrony praw autorskich i własności intelektualnej firmy ITALLUX Sp. z o.o. wraz z klauzulą wyłączenia odpowiedzialności.

## Podjęte Decyzje Architektoniczne
1. **Single Source of Truth (SSOT) & Zasada DRY:**
   - Całość korporacyjnej stopki została scentralizowana w metodzie `getSection16LegalFooter(metadata)` w module bazy wiedzy [local.knowledge.connector.js](file:///z:/Nexus_ERP_Project/src/modules/sds/engine/extractors/local.knowledge.connector.js).
   - Metoda ta dynamicznie wstrzykuje datę sporządzenia karty producenta (`z dnia [data] r.`) na podstawie przekazanych metadanych dokumentu z bezpiecznym fallbackiem.
2. **Deterministyczna Integracja w Potoku:**
   - **`SDSSwarmOrchestrator._applyDeterministicEnforcements`:** Oczyszcza wygenerowany przez LLM tekst Sekcji 16 ze starych nagłówków literaturowo-szkoleniowych i dokleja kanoniczną stopkę.
   - **`SDSDocxBuilder.renderSection16`:** Bezwzględnie gwarantuje obecność kanonicznej stopki w generowanym pliku DOCX, dbając o zachowanie stylów nagłówków pogrubionych i punktorów OpenXML.
   - **`SDSVisionAgent` & `AdministrativeAuditorAgent`:** Zaktualizowano prompt systemowy i instrukcje audytora administracyjnego, aby agenci operowali na tożsamym wzorcu prawnym.
3. **Weryfikacja Automatyczna:**
   - Dodano test jednostkowy weryfikujący wszystkie składowe stopki w [tests/sds.swarm_rag_compliance.test.js](file:///z:/Nexus_ERP_Project/tests/sds.swarm_rag_compliance.test.js).
   - Cały zestaw testów regresyjnych modułu SDS (42 testy) zakończył się wynikiem 100% PASS bez regresji.
