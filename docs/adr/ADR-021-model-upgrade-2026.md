# ADR-021: Wdrożenie Produkcyjnych Modeli AI (Snapshot 2026)

## Kontekst
Wcześniejsza architektura EAN Pipeline oraz Multi-Agent Swarm opierała się na błędnym założeniu używania uniwersalnego modelu `gemini-3.5-flash`. Model ten, pomimo że istniał w środowisku, nie obsługiwał kluczowych narzędzi (np. `googleSearch` dla Agenta OSINT), co prowadziło do błędów API (fast-fail, np. 400 Bad Request przy żądaniu użycia narzędzia) oraz niższej jakości przy generacji zaawansowanych treści (np. prawnych, dla modułu Compliance). Dodatkowo, wobec rygorystycznych wymogów EU AI Act i systemu Enterprise, generowanie treści podatnych na halucynacje jest niedopuszczalne.

## Decyzja
Zdecydowano się na architekturę zróżnicowaną pod kątem kosztów (Tiered Model Architecture), w której każdy z ponad 25 Agentów korzysta z innego, zoptymalizowanego modelu:
1. **Agent PIM Auto-Fill (Ostatnia Linia Wsparcia):** Wdrożenie bardzo taniego modelu `gemini-2.5-flash-lite` do szybkiego wyszukiwania szczątkowych braków (oszczędność ~91000 tokenów na zapytanie), bez pełnych opcji Deep Research.
2. **Agent OSINT & Opinie (Custom Tools):** Wdrożenie `gemini-3.1-pro-preview-customtools` dla zapewnienia bezbłędnej, głębokiej interakcji z Google Search.
3. **Agent Compliance (Audyt Prawny):** Zastosowanie autorskiego modelu platformowego `antigravity-preview-05-2026`, gwarantującego najwyższe bezpieczeństwo z perspektywy AI Act i Regulacji Kosmetycznych.
4. **Agent GEO (Copywriter) & Tytuł:** Upgrade do `gemini-3.1-pro-preview`, zapewniającego najwyższą jakość optymalizacji treści E-Commerce i spójność HTML.
5. **Agent Wizyjny (Vision):** Upgrade do `gemini-3-pro-image`.

## Konsekwencje
- Drastyczna redukcja kosztów (nawet o 95% w przypadku procesów pomocniczych, jak Auto-Fill PIM) dzięki rezygnacji z modeli PRO tam, gdzie wystarczą płytkie wyszukiwania i proste wnioskowanie.
- Zachowanie najwyższej jakości i odporności na halucynacje w kluczowych węzłach (Tworzenie treści GEO/AEO, Aspekty prawne).
- Pełna separacja Agentów (każdy Agent używa optymalnego modelu).
