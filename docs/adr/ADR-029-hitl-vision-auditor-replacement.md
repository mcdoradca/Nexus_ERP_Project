# ADR 029: Wyłączenie Agenta 9 (Vision Auditor) na rzecz weryfikacji manualnej (HITL)

**Data:** 2026-07-28
**Status:** Zaakceptowany

## 1. Kontekst
W ramach architektury Swarm V3, Faza 4 (High Assurance Audit) opierała się na dwóch węzłach audytujących: `Agent_9_VisionAuditor` (audyt obrazów pod kątem tła RGB 255 i EU AI Act) oraz `Agent_10_Sentinel` (audyt tekstu i spójności danych PIM). Mimo że Agent 9 z powodzeniem odciążał operatora i wymuszał automatyczne poprawki na Agencie 8, generował on dodatkowe obciążenie potoku EAN i wymagał dodatkowego czasu na analizę pikseli przez model Gemini 3.5 Flash. Operator (Product Manager) zdecydował się na przejęcie odpowiedzialności za audyt graficzny na siebie (Human In The Loop).

## 2. Rozwiązanie
Zdecydowano się **trwale wyłączyć wywołanie `Agent_9_VisionAuditor`** z pliku `supervisor.service.js`. Zamiast tego:
- Faza 4 pomija oczekiwanie na model wizyjny i uruchamia wyłącznie Agenta 10 (Sentinel).
- Generowanie ticketów błędów wizualnych (`visionTickets`) zostało zastąpione na stałe pustą tablicą `[]`.
- Status rozgłaszany przez WebSocket informuje interfejs, że Agent 9 przyjął status `SKIPPED`, co zapobiega powieszeniu się pętli nasłuchującej Reacta.
Weryfikacja jakości grafik, braku niedozwolonego tła i obecności obowiązkowych znaków "[Wygenerowano przez AI]" spoczywa teraz w 100% na człowieku (HITL), który weryfikuje ofertę w UI tuż przed publikacją na Allegro.

## 3. Odrzucone Alternatywy
- **Całkowite usunięcie kodu węzła 9 z `ai.service.js`:** Odrzucono z powodu ryzyka. Zostawiono funkcję `runNode9_VisionAuditor` i plik promptów `Agent_9_prompt.md` jako ukryty potencjał. Można go w przyszłości podpiąć z powrotem jednym przełącznikiem bez pisania kodu od zera, jeśli wolumen produktów uniemożliwi wydajną pracę manualną operatora.
- **Odpytywanie na żądanie (Zamiast w Potoku):** Rozważano przeniesienie Agenta 9 pod osobny przycisk na frontendzie. Zrezygnowano – skoro operator i tak patrzy na zdjęcia, odpalanie AI z opóźnieniem mijało się z celem skrócenia czasu procesu.
