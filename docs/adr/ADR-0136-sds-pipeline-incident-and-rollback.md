# ADR-0136: Incydent Dezintegracji Potoku SDS i Natychmiastowy Rollback (Przywrócenie Ciągłości Operacyjnej)

## Data
2026-10-08

## Status
Zaakceptowany i Wdrożony (Rollback wykonany: Commit 9c97e8b, Status: 100% PRODUKCJA / STABILNY)

## Kontekst i Przyczyna Awarii
W gałęzi `main` wdrożono commit `b29d832`, którego intencją była eliminacja rzekomego sabotażu klasyfikacji odpadów oraz usunięcie hardkodów DNEL/PNEC w Sekcji 8.1. W ślad za tym w drzewie roboczym podjęto próbę wprowadzenia sztywnego arbitrażu SSOT (bez generatywności) z agresywnymi placeholderami błędów (`[Błąd Ekstrakcji...]`).

Konsekwencją usunięcia wbudowanych wymuszeń systemowych w `SDSDocxBuilder`, `SDSSwarmOrchestrator` oraz `SDSVerifierAgent` była natychmiastowa dezintegracja potoku generowania kart SDS:
1. **Przenikanie surowego tekstu źródłowego:** Warstwa ekstrahująca przepuściła do finalnego dokumentu surowy tekst w języku włoskim (Sekcje 3, 4, 8, 9).
2. **Fałszywe nazwy zastępcze i ucięcie danych:** Dokumenty zaczęły zawierać zastępcze placeholdery błędu zamiast autentycznych danych z kart oraz doszło do ucięcia klasyfikacji odpadów w Sekcji 13.
3. **Konflikt architektoniczny:** Usunięcie pół-deterministycznej logiki strażniczej, która dotychczas łatała braki i gwarantowała przepustowość systemu przed audytorem zewnętrznym, zamroziło proces produkcyjny. Sztywny pseudodeterminizm naruszył filozofię AI-Driven całego systemu Nexus ERP.

## Decyzja Architektoniczna
1. **Natychmiastowy Rollback do bezpiecznego stanu (Rollback to ADR-0135):**
   - Odrzucono zmiany z drzewa roboczego (`git restore src/modules/sds/sds.service.js src/modules/sds/sds.vision.agent.js`).
   - Wykonano pełną rewersję commita `b29d832` poleceniem `git revert b29d832 --no-edit` (nowy commit: `9c97e8b`).
   - Przywrócono sprawdzony, stabilny stan produkcyjny z commita `06b2aee` (ADR-0135: pełna flota 10 agentów SDS z `ThinkingLevel: "HIGH"`).
2. **Obrona Ciągłości Operacyjnej:**
   - Przywrócono deterministyczne tarcze ochronne w `SDSVerifierAgent` (Reguła 5 kwalifikacji odpadów wg Dz.U. 2020 poz. 10).
   - Przywrócono reguły zabezpieczające sekcję 8.1 (DNEL/PNEC) i 1.1 (nazwa handlowa) w `SDSDocxBuilder` oraz `SDSSwarmOrchestrator`.

## Weryfikacja Jakościowa
- Składnia wszystkich plików JS zweryfikowana poleceniem `node -c`: 0 błędów.
- Testy zgodności prawno-chemicznej SDS (`tests/sds.compliance.test.js`): 7/7 PASSED (100%).
- Testy walidatora schematu SDS (`tests/sds.schema.validator.test.js`): 7/7 PASSED (100%).
- Testy systemowe potoku integracyjnego Nexus ERP (`src/modules/offer-optimizer-v2/tests/*.test.js`): 155/155 PASSED (100%).
- Brak niezatwierdzonych zmian w repozytorium gita (`working tree clean`).
