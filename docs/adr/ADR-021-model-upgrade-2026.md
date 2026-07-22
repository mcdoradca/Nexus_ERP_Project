# ADR-021: Wdrożenie Produkcyjnych Modeli AI (Snapshot 2026)

## Kontekst
Wcześniejsza architektura EAN Pipeline oraz Multi-Agent Swarm opierała się na błędnym założeniu używania uniwersalnego modelu `gemini-3.5-flash`. Model ten, pomimo że istniał w środowisku, nie obsługiwał kluczowych narzędzi (np. `googleSearch` dla Agenta OSINT), co prowadziło do błędów API (fast-fail, np. 400 Bad Request przy żądaniu użycia narzędzia) oraz niższej jakości przy generacji zaawansowanych treści (np. prawnych, dla modułu Compliance). Dodatkowo, wobec rygorystycznych wymogów EU AI Act i systemu Enterprise, generowanie treści podatnych na halucynacje jest niedopuszczalne.

## Decyzja
Zdecydowano się zrezygnować z modeli serii "flash" we wszystkich procesach decyzyjnych na rzecz najnowszych, dedykowanych modeli z 2026 roku:
1. **Agent OSINT & Opinie (Custom Tools):** Wdrożenie `gemini-3.1-pro-preview-customtools` dla zapewnienia bezbłędnej interakcji z Google Search.
2. **Agent Compliance (Audyt Prawny):** Zastosowanie autorskiego modelu platformowego `antigravity-preview-05-2026`, gwarantującego najwyższe bezpieczeństwo z perspektywy AI Act i Regulacji Kosmetycznych.
3. **Agent GEO (Copywriter) & Tytuł:** Upgrade do `gemini-3.1-pro-preview`, zapewniającego najwyższą jakość optymalizacji treści E-Commerce i spójność HTML.
4. **Agent Wizyjny (Vision):** Upgrade do `gemini-3-pro-image`.

## Konsekwencje
- Zwiększenie kosztu procesowania tokenów z uwagi na przejście na cięższe, profesjonalne modele `Pro` i autorskie modele systemu Antigravity.
- Wydłużenie procesu generowania opisu (wymagane ok. 45-60 sekund na pełen potok wieloagentowy) wobec oczekiwanej perfekcji i zgodności z normami E-commerce.
- Całkowita eliminacja błędów 400 dla Agentów używających narzędzi (Search) i skrajna redukcja ryzyka halucynacji (100% spójność).
