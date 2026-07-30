# E3 FIX4 Implementation Plan

## Goal
Domknięcie Etapu E3 poprzez naprawę korupcji kodowania spowodowanej w poprzednich krokach (użycie `echo >>` w PowerShell), zaktualizowanie metody wyszukiwania na `ANY(string_to_array)`, wprowadzenie filtrów do indeksu nazw oraz zebranie kompletnych dowodów na działanie bramki GATE-3 (w tym brak uszkodzeń w listach walidatorów).

## Open Questions
- Brak pytań otwartych. Zgodnie z wytycznymi plan obejmuje zdefiniowane kroki kontroli kodowania (Z-1) i wdrożenie `ANY(string_to_array)` dla GATE-3.

## Proposed Changes

### 1. Audyt Kodowania i Naprawa
Zostanie przeprowadzona inwentaryzacja kodowania za pomocą skryptów weryfikujących zawartość (U+FFFD i znaki z CP1250). Wstępna analiza wykazała, że problem dotknął plików `RAPORT_E3_FIX3.md` i `DECISION_LOG.md` (użyto `echo >>` bez parametru kodowania). `validators/index.js` nie wykazuje korupcji, co udowodnię w raporcie.
- Wykonanie `node src/modules/offer-optimizer-v2/scripts/audit_diacritics.js` na katalogu `prompts/`.
- Przepisanie błędnych logów w `RAPORT_E3_FIX3.md` i `DECISION_LOG.md` jako UTF-8. 
- Do `DECISION_LOG.md` zostanie wpisana ZASADA STAŁA o używaniu `fs.writeFileSync(..., 'utf8')` lub jawnego `Out-File -Encoding utf8`.

#### [MODIFY] [DECISION_LOG.md](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/docs/DECISION_LOG.md)
#### [NEW] [RAPORT_E3_FIX4.md](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX4.md)

---
### 2. Filtry Indeksu Nazw (Ekstrakcja)
Aktualizacja logiki w `normalization.js` używanej do wprowadzania wpisów do kolumny `entryName`.
- Odrzucanie chunów typu `GATE`, `RULE`, `CONTEXT` (tylko słowniki `DICTIONARY_ENTRY`). Usunięcie z bazy ewentualnych śmieci po poprzednich przebiegach.
- Zastosowanie filtrów ekstrakcji dla tablicy aliasów:
  - Odrzucenie statusów typu uppercase: `/^[A-Z0-9_]{3,}$/`
  - Limit wyrazów (maks 6, długość min 3 znaki)
  - Odrzucenie procentów i objętości (np. `0,3%`)

#### [MODIFY] [normalization.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/normalization.js)
#### [MODIFY] [ingest.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/scripts/ingest.js)

---
### 3. Wyszukiwanie GATE-3 
Aktualizacja zapytań SQL dla Exact Match. Odejście od `LIKE` (podatnego na kolizje) na rzecz deterministycznego splitu:
- Zmiana z `WHERE ${param} LIKE '%|' + normalized + '|%'` na:
  `WHERE $1 = ANY(string_to_array("entryName", '|'))`
- Ujednolicenie potoku: lookup będzie wywoływał tę samą funkcję `normalizeIngredientName` używaną przy ingeście.

#### [MODIFY] [knowledge.rag.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/knowledge.rag.service.js)

---
### 4. Testy i Dowody
Wprowadzenie nowych testów automatycznych na okoliczność detekcji diakrytyków, by chronić potok przed cichym pomijaniem fraz przy korupcji.
- Wdrożenie w `tests/rag.service.test.js` dodatkowych testów dla walidatora `scan_medical_claims_lexical` oraz `scan_stopwords` ze zdefiniowanymi "na twardo" w pliku ciągami tekstowymi (np. "produkt leczy łuszczycę").
- Zebranie miar (similarity i idempotencja po re-ingest) do ostatecznego zestawienia.

#### [MODIFY] [rag.service.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/rag.service.test.js)

## Verification Plan

### Automated Tests
- `node --test src/modules/offer-optimizer-v2/tests/rag.service.test.js`
- `node src/modules/offer-optimizer-v2/scripts/audit_diacritics.js`

### Manual Verification
- Wygenerowanie finalnego raportu `RAPORT_E3_FIX4.md` zawierającego wymagane informacje, w tym bezpośrednie zrzuty kodu dla list bezpieczeństwa (`validators/index.js`), testy coverage i output logi wg poleceń z Etapu E3.
