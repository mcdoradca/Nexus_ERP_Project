# INSTRUKCJA_E2 — WALIDATORY KODOWE I BRAMKI (ZERO LLM)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E2.md
# Jedna sesja = ten etap (OP-8). Wynik: docs/RAPORT_E2.md + commit.
# Zakres źródłowy: MASTER_HANDOFF §6/E2, 00_PLAN §2, SHARED_RULES v4.1.

## 0. DOMKNIĘCIA PO E1 (przed właściwym zakresem)
a) E1 = ZAMKNIĘTY decyzją Architekta. Do DECISION_LOG dopisz ratyfikację:
   [data] | pakiet v4.1: gemini-3.1-pro (404) | API: brak stabilnego Pro
   dostępnego dla konta | decyzja Architekta: gemini-3.1-pro-preview dla
   A5/A10 | ryzyko: model preview — obowiązkowa re-weryfikacja ListModels
   przed E5 i przed E6.
b) Dowód blokady gemini-2.5-pro: wykonaj jedno wywołanie generateContent
   na gemini-2.5-pro i wklej SUROWY błąd API do wpisu DECISION_LOG z pkt a).
   Jeśli wywołanie przejdzie (brak blokady) — STOP, raport, decyzja Architekta.
c) LISTMODELS_SNAPSHOT.md jest plikiem binarnym (UTF-16 z PowerShella).
   Przekonwertuj na UTF-8 bez BOM. ZASADA STAŁA (wpisz do DECISION_LOG):
   wszystkie pliki projektu = UTF-8 bez BOM; zrzuty z PowerShella
   przepuszczaj przez `Out-File -Encoding utf8` lub konwertuj. Dowód:
   `git diff --stat` pokazuje plik jako tekst (liczba linii, nie "Bin").

## 1. ZAKRES — MODUŁ WALIDATORÓW (czysty kod, deterministyczny)
Katalog: src/modules/offer-optimizer-v2/validators/ (+ testy w tests/).
Implementujesz DOKŁADNIE poniższe funkcje. Listy słów i substancji kopiujesz
1:1 z SHARED_RULES_v4.1.md (S-6: zakaz rozszerzania i skracania z własnej
wiedzy). Referencja sekcji przy każdej funkcji w komentarzu nagłówkowym.

V1 ean_checksum(gtin) — suma kontrolna GS1 (EAN-8/13/14). Błąd →
   CRITICAL_INPUT_ERROR. [00_PLAN §2]
V2 route_chemical(pim) — decyzja is_chemical PRZED wywołaniem A4: true gdy
   kategoria chemiczna/biobójcza LUB sds_required==true LUB niepusty
   raw_ingredients_inci LUB clp_signal_word!=null. Zwraca {is_chemical,
   reasons[]}. [00_PLAN §2; naprawa wzorca passthrough A4]
V3 scan_stopwords(html) — listy §A v4.1 (marketingowe + overpromising),
   regex case-insensitive z odmianami fleksyjnymi słów Z LISTY (odmiana
   ≠ nowe słowo; np. "promocja|promocji|promocją"). Zwraca trafienia
   z pozycjami. [§A; 00_PLAN §2]
V4 scan_medical_claims_lexical(html) — leksykon blokujący §D v4.1
   (z odmianami jak V3). Lista dozwolonych §D NIE jest skanowana — służy
   A5, nie walidatorowi. Trafienie → routing do A5. [§D]
V5 validate_html_whitelist(html) — WYŁĄCZNIE h1,h2,p,ul,ol,li,b.
   Twarde błędy: <br>, <strong>, jakikolwiek inny tag, <b> wewnątrz
   <h1>/<h2>, linki, dane kontaktowe (mail/telefon/URL), cudzysłowy inne
   niż apostrof. [§B v4.1 — UWAGA: NIE wersja z SHARED_RULES_v4.md]
V6 diff_numeric(html, pim) — ekstrakcja liczb+jednostek (ml, l, g, kg, %,
   pH, EAN, szt., cm) z HTML i porównanie 1:1 z PIM. Liczba w HTML bez
   pokrycia w PIM → HALLUCINATION_DATA_MISMATCH z listą rozbieżności.
   Tolerancja zapisu: przecinek/kropka dziesiętna równoważne. [00_PLAN §2]
V7 emoji_structure_check(html) — każdy h1/h2/li zaczyna się emotikonem
   z listy dozwolonych §C v4.1; wzorce nagłówków sekcji s1🌟 s2❓ s3⚙️ s4📝
   s5📊 s6⚠️; pary sekcji 2 wg wzorca 🔴 Problem / 🟢 Answer; emotikony
   zakazane (🔥😱💥😍🚀) = błąd; emotikon w środku tekstu = błąd. [§C v4.1]
V8 gate_ingredients(inci_list) — bramki §I:
   GATE-1 substancje zakazane (lista 1:1 z §I) → BANNED_SUBSTANCE_DETECTED,
   GATE-2 substancje lecznicze (lista 1:1 z §I) → INGREDIENT_NOT_COSMETIC.
   Obie = STOP potoku + HITL (status blokujący, nie ostrzeżenie).
   Dopasowanie po nazwach INCI case-insensitive. GATE-3 realizuje warstwa
   RAG w E3 (unknown_ingredients) — tu tylko zdefiniuj stały kod statusu
   UNKNOWN_INGREDIENT_NEEDS_LOOKUP. [§I; S-2]
V9 c2pa_check(file) — STUB wg OP-7: zawsze zwraca
   {status: 'C2PA_CHECK_UNAVAILABLE', severity: 'WARNING'}. Zakaz
   instalowania bibliotek C2PA; zakaz zwracania "metadane OK". [OP-7]
V10 freeze_sections(s3,s5,s6) / verify_frozen(s3,s5,s6, hashes) —
   SHA-256 per sekcja po normalizacji ZERO (bajty jak są — żadnego trim/
   normalizacji whitespace; hash liczony na dokładnych bajtach UTF-8).
   verify_frozen: mismatch → BLOCKED_CRITICAL. [S-1; 00_PLAN §2]

## 2. TESTY JEDNOSTKOWE (DoD etapu)
Framework: wbudowany node:test + assert (decyzja Architekta — zero nowych
zależności). Minimum przypadków per walidator:
- pozytywny (czysty input przechodzi),
- negatywny z dokumentacji (np. V5: <br>, <strong>, <b> w h1; V3: każde
  słowo z listy w formie odmienionej; V6: liczba zmyślona vs PIM; V8: po
  jednej substancji z GATE-1 i GATE-2; V10: zmiana jednego znaku w s6 →
  BLOCKED_CRITICAL),
- brzegowy (pusty input, null).
V8: test obejmuje 100% substancji z obu list §I (iteracja po liście, nie
próbka). Do RAPORT_E2.md surowy output runnera (liczba testów, pass/fail).

## 3. ZAKAZY
Zakaz dotykania starego modułu i frontendu. Zakaz implementacji orkiestratora,
RAG, wywołań LLM (to E3/E4). Zakaz rozszerzania list o synonimy "z własnej
wiedzy" (S-6). Wątpliwość interpretacyjna co do reguły → wpis DECISION_LOG
+ STOP dla tego fragmentu, reszta zakresu kontynuowana.

## 4. ZAMKNIĘCIE
Commit: `feat(offer-optimizer-v2): E2 walidatory kodowe + bramki + testy`.
RAPORT_E2.md: zakres z referencjami plik:linia, output testów, wpisy
DECISION_LOG, TODO/HITL, czego nie zweryfikowano, git diff --stat HEAD~1,
git log --oneline -3. STOP — akceptacja Architekta przed E3.
