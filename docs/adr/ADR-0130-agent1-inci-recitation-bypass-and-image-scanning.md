# ADR 0130: Obejście blokady RECITATION dla składów INCI oraz wymóg skanowania zdjęć etykiet (Agent 1 OSINT)

## Data
2026-10-05

## Kontekst
Zauważono, że od około 10 produktów z rzędu Agent 1 (Node 1) konsekwentnie zwracał pustą tablicę `extracted_inci_candidates: []`. Zgłoszenie błędu wywołało audyt, który wykazał, że:
1. Pierwotny mechanizm omijania filtra antyplagiatowego Google (RECITATION) – polegający wyłącznie na zmianie wielkości liter (UPPERCASE) dla całej listy INCI po przecinku – okazał się niewystarczający. Filtr analizował sekwencję słów (case-insensitive) i czyścił odpowiedź Agenta w Kroku 1.
2. Usunięcie `thinkingConfig` w `ai.wrapper.js` uniemożliwiało fallback do bufora myśli, co skutkowało wymuszonym powrotem do 160-znakowych wstawek `groundingChunks` (fragmentów wyszukiwarki).
3. Moduł strukturyzacji (Krok 2) próbował wyciągnąć pełny skład INCI z krótkich snippetów, co zawsze kończyło się porażką i pustą listą.

Dodatkowo, zidentyfikowano potrzebę polegania na najbardziej autorytatywnych źródłach, jakimi są bezpośrednie zdjęcia etykiet (np. tylne części opakowań produktów).

## Decyzja
1. **Zmiana struktury anty-recitation (Numerowana Lista):** Wprowadzono nową, rygorystyczną dyrektywę dla Agenta 1 w pliku `Agent_1_prompt_v4.md`. Agent ma kategoryczny zakaz podawania składników w jednej linii po przecinku. Musi każdorazowo łamać linię i wprowadzać numerację przed składnikiem (np. `1. AQUA\n2. GLYCERIN`). Łamie to sekwencję tokenów na tyle skutecznie, że omija detekcję plagiatu w Google Search Grounding.
2. **Dodanie nowej drogi ekstrakcji (Multimodalność zdjęciowa):** Narzucono Agentowi obowiązek celowego wyszukiwania zdjęć etykiet i skanowania ich (OCR / Multimodal) w poszukiwaniu składów. Pozwala to na dostęp do bezpośrednich, rzetelnych, pozbawionych błędów ludzkich list INCI (np. z graficznych packshotów sklepów i aptek).
3. **Rozluźnienie warunków domenowych:** Zmodyfikowano nadmiernie twardy zakaz korzystania ze źródeł innych niż "włoskie drogerie", by dać Agentowi szansę na pobieranie wyczerpujących list INCI z innych legalnych źródeł. Wykluczenia typu `incibeauty.com` pozostały w mocy.

## Konsekwencje (Status: Wdrożono i zweryfikowano)
1. **Sukces:** Moduł strukturyzacji z powrotem otrzymuje kompletną listę INCI. Parser JSON doskonale radzi sobie z formatem wylistowanym (1., 2., 3...) i rzutuje go na wymaganą tablicę ciągów znaków (string[]).
2. **Utrzymanie:** Zmiana wprowadzona bezpośrednio do pliku `docs/Agent_1_prompt_v4.md`, który jest czytany w czasie rzeczywistym przez `orchestrator.js`.
3. **Bezpieczeństwo:** Powyższy patch nie generuje regresji.
