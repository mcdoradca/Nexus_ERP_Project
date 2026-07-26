# ADR-025: Defensive AI State Protection - Rozdział Danych PIM i Szkiców AI

**Data:** 2026-07-26
**Status:** Zaakceptowany
**Kontekst:** Architektura EAN Pipeline (Swarm V3)

## Kontekst i Zidentyfikowany Problem

W architekturze aplikacji `Nexus_ERP_Project` wykorzystujemy zunifikowany interfejs `UnifiedProductPipelineView`, który pozwala operatorowi na jednoczesne przeglądanie i modyfikowanie "twardych" danych produktu (PIM) oraz zarządzanie potokiem AI i wygenerowanymi treściami sprzedażowymi (GEO/AEO, Vision AI).

Podczas migracji i refaktoryzacji interfejsu doszło do incydentów związanych z wymazaniem wygenerowanego dorobku Agentów w bazie danych. 
Zidentyfikowano krytyczny błąd integracyjny (brak tzw. Defensive AI) na styku frontendu z backendem:
1. **Frontend:** Z powodu błędów w architekturze React (state drifting i pominięte przyciski zapisu szkicu), główny stan PIM (`newProductForm`) nie zawsze zawierał pełny obiekt nowo wygenerowanego szkicu (`offerDraft`).
2. **Backend:** Endpoint zapisu PIM (`PATCH /api/products/:id`) realizował "ślepy zapis" – akceptował przysłany payload z frontendu (który posiadał wyczyszczony `offerDraft`) i w 100% nadpisywał rekord bazy Prisma. W rezultacie ciężka praca Agentów, kosztująca dziesiątki tysięcy tokenów LLM, była nadpisywana pustym obiektem.

## Decyzja

Wdrożono rygorystyczny rozdział strumieni zapisu danych, uodparniając backend na ewentualne wady i asynchronię na frontendzie:

1. **Defensive API (Backend):**
   - W endpoint'cie odpowiadającym za ogólny zapis PIM (`app.patch('/api/products/:id')` w `server.js`) wymuszono wycinanie atrybutów należących ekskluzywnie do Agentów AI:
     ```javascript
     delete payload.offerDraft; 
     delete payload.aeoContent;
     ```
   - Cel: **Twardy interfejs PIM nigdy nie ma prawa zapisać, ani nadpisać szkiców wygenerowanych przez AI.** Jeśli użytkownik edytuje wagę produktu, to endpoint nadpisze wagę, bezpowrotnie ignorując stary, błędny lub pusty zrzut szkicu AI z formularza klienckiego.

2. **Dedykowany Endpoint Szkicu:**
   - Stan szkicu AI może być modyfikowany w bazie **wyłącznie** poprzez oddzielny endpoint `/api/offer-optimizer/save-draft`.

3. **Uspójnienie Frontendu:**
   - Przywrócono oddzielne, niezależne kontrolki ("Zapisz Szkic AI" i "Zatwierdź & Eksportuj") do prawego panelu. 
   - Wymuszono aktualizację stanu formularza na frontendzie w momencie otrzymania sygnału WebSocket `PIPELINE_COMPLETE`, aby interfejs zawsze pozostawał spójny.
   - Refaktoryzacja komponentu `TitleValidator`, zapewniająca przepływ zmiennych zgodnie ze schematem _Controlled Component_.

## Konsekwencje
- Zablokowanie możliwości przypadkowego wymazania kosztownych danych z LLM (100% Data Loss Prevention dla modułów AI).
- Backend jest chroniony przed niedoskonałościami i "ślepotą" komponentów React.
- Jasny podział kompetencji: PIM i AI żyją w osobnych strumieniach zapisu.
