# ADR-032: Usunięcie Agenta 3 (SEO Title) z potoku EAN Pipeline

## Status
Zatwierdzony i wdrożony (2026-07-28)

## Kontekst
Agent 3 był odpowiedzialny za optymalizację tytułów ofert w oparciu o wytyczne Allegro (SEO Title Architect). Mimo licznych prób optymalizacji i wdrożenia protokołów Function Calling oraz Auto-Healing, napotkano krytyczną blokadę infrastrukturalną w usłudze Google Generative AI (Gemini 3.5 Flash). 

Główną przyczyną była obsługa gigantycznych zasobów danych (Knowledge Base / RAG dla SEO E-commerce) oraz odpowiedzi narzędziowych z API Allegro. W trakcie wywoływania pętli `chat.sendMessage` z historią narzędziową model napotykał na natychmiastowe blokady **429 Too Many Requests (Quota Exceeded)** dla metryki `input_token_count` (limit: 3,000,000 tokenów na minutę).
Nawet po minifikacji (truncation) ładunków zwrotnych z Allegro, sam narzut startowy i RAG okazał się zbyt wielki na utrzymanie stabilności tej architektury w jednym potężnym agencie bez doprowadzenia do blokad całej usługi API dla całej firmy.

## Decyzja
Na wyraźne żądanie Głównego Architekta (User), Agent 3 został w całości usunięty z kodu produkcyjnego oraz potoku `supervisor.service.js`.
Obowiązek tworzenia tytułów (SEO) spada tymczasowo na mechanizm *fallback*, który po prostu wstrzykuje nazwę główną produktu z ERP (`product.name`), do czasu wdrożenia lżejszej mikrousługi pozbawionej tak drastycznych narzutów pamięciowych.

## Konsekwencje
- Zmniejszenie awaryjności potoku EAN Pipeline.
- Znaczna redukcja kosztów (Token Usage) oraz ryzyka blokady API (429 Rate Limit).
- Mniejsza złożoność kodu w `ai.service.js`.
- Brak automatycznej, zaawansowanej optymalizacji tytułów pod Allegro w obecnym kształcie (konieczna iteracja architektoniczna w przyszłości).
