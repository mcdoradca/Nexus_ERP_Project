# ADR-040: Wdrożenie Architektury "Zero-Bypass" dla Systemu Kart Charakterystyki (SDS)

**Status:** Zaakceptowane / Wdrożone na produkcji
**Data:** 2026-09-11
**Kontekst:** 
Podczas wcześniejszej iteracji wdrażania modułu tłumaczącego karty charakterystyki (SDS) wykorzystano model LLM (Gemini 1.5 Flash) jako głównego orkiestratora RAG, a braki w lokalnych rejestrach prawnych zastąpiono mockowymi, sztucznymi "zaślepkami" JSON. Ze względu na rygor prawny dokumentacji chemicznej (rozporządzenia REACH, CLP oraz odpowiedzialność karna za wady kart), takie podejście stwarzało drastyczne zagrożenie bezpieczeństwa i mogło prowadzić do halucynacji danych prawnych (limitów NDS, kodów UN ADR). 

**Decyzja:**
Podjęto decyzję o natychmiastowym wstrzymaniu prac na starym modelu i rygorystycznym przejściu na architekture "Zero-Bypass" (opisaną w przemysłowej Instrukcji Wdrożeniowej). Architektura ta bezwzględnie separuje deterministyczne dane prawne/chemiczne od silnika językowego AI.

Rozwiązanie opiera się na 3-krokowym systemie (Pipeline):
1. **KROK 1 (Ekstrakcja i Determinizm w Node.js):** Silnik parsuje dokument PDF (z opcjonalnym fallbackiem do Tesseract OCR). Następnie deterministycznie wyszukuje numery CAS. Dla każdego numeru CAS wysyłane jest darmowe i otwarte żądanie HTTP do PubChem PUG REST API w celu potwierdzenia tożsamości IUPAC. Następnie silnik ładuje wbudowaną lokalną bazę NDS z pliku (pełen rejestr Dz.U. 2018 poz. 1286) i bezpiecznie wpina limity. Sekcje 1, 2, 3, 8, 13, 15 zostają trwale osadzone i zamknięte przed AI.
2. **KROK 2 (Hermetyzacja Agenta LLM):** Modelowi Gemini zostają całkowicie odebrane uprawnienia do Tool Callingu (narzędzi API) w celu zapobieżenia niekontrolowanym wywołaniom lub pominięciom. Agent otrzymuje wyłącznie wyłuskane Sekcje Opisowe (4, 5, 6, 7, 9, 10, 11, 12, 14, 16) wraz z twardym System Promptem wymuszającym m.in. ton medyczny, rygor ECHA dla podsekcji o hormonach oraz zwrot wyników jako poprawny obiekt JSON.
3. **KROK 3 (Asemblacja Finalna DOCX):** Deterministyczny silnik Node.js waliduje otrzymany od Agenta obiekt JSON. Następnie łączy osadzone w KROKU 1 sekcje chemiczne, wygenerowane natywnie piktogramy GHS i przetłumaczone przez AI sekcje opisowe w pojedynczy, paginowany i sformatowany dokument DOCX.

**Konsekwencje:**
- **Pozytywne:** Eliminacja zjawiska halucynacji LLM dla danych krytycznych dla życia i zdrowia. Gwarancja zgodności wygenerowanej karty z Dz.U. 2018 poz. 1286. 100% zautomatyzowana weryfikacja rejestru REACH / IUPAC poprzez PubChem API.
- **Negatywne / Ograniczenia:** Skrypt wymaga posiadania na stałe pełnego i zaktualizowanego pliku `nds_database_2018.json`. Moduł jest wrażliwy na limity zapytań (rate-limiting) PubChem (wymusiło to implementację mechanizmu 3-krotnego Exponential Backoff w kodzie). Zwiększona złożoność kodu orkiestrującego (konieczność zachowania rygoru `application/json` z API Gemini).

**Powiązane dokumenty:**
- `docs/SDS/Instrukcja Wdrożeniowa Agenta Antigravity_ Automatyczna Adaptacja Kart SDS.md`
- `docs/SDS/kompletny_procesor_i_generator_kart_sds_w_node_js.js`
