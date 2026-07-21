# ADR-018: Integracja Agenta Sentimentu Opinii Klientów oraz Wdrożenie Wytycznych EU AI Act w EAN Pipeline

## 1. Kontekst i Wymagania

W ramach ciągłego rozwoju monolitu **Nexus ERP** oraz podnoszenia jakości generowanych ofert sprzedażowych dla e-commerce (Allegro, BaseLinker), podjęto decyzję o wdrożeniu dwóch kluczowych rozszerzeń funkcjonalnych w module **Master Agenta EAN Pipeline**:

1. **Integracja Sentimentu Opinii Konsumenckich:**
   Kupujący w e-commerce w pierwszej kolejności szukają w opisach potwierdzenia jakości w doświadczeniach innych użytkowników. Wdrożenie Agenta Sentimentu ma na celu przeszukiwanie recenzji i opinii w sieci dla analizowanego produktu (EAN), a następnie płynne wplecenie wniosków z opinii (np. *"Klienci w szczególności chwalą ten produkt za..."*, *"Użytkownicy doceniają..."*) w generowane treści AEO oraz opisy HTML.

2. **Zgodność z Unijnym Rozporządzeniem ws. Sztucznej Inteligencji (EU AI Act - Rozporządzenie UE 2024/1689):**
   W związku z wejściem w życie przepisów EU AI Act systemy ERP wykorzystujące modele Generatywnej AI (LLM / Vision) do tworzenia treści przeznaczonych dla konsumentów końcowych muszą spełniać ścisłe wymogi regulacyjne:
   - **Art. 50 (Transparentność i oznaczenie AI):** Wyraźne i niebudzące wątpliwości informowanie odbiorców o generowaniu treści i grafiki przez AI.
   - **Art. 14 (Nadzór Ludzki / Human-in-the-Loop):** Zapewnienie, że decyzja o publikacji treści wygenerowanych przez AI podejmuje człowiek (HitL Reviewer Gatekeeper).
   - **Art. 12 (Audytowalność i Dzienniki Zdarzeń):** Rejestrowanie logów operacji generatywnych w celu możliwości przeprowadzenia kontroli zgodności.

---

## 2. Decyzje Architektoniczne

### A. Agent Sentimentu i Opinii Klientów (Customer Feedback Intelligence)
- W module [src/modules/offer-optimizer/ai.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/ai.service.js) dodano dedykowaną funkcję `gatherCustomerSentiment(ean, productName)`.
- Funkcja używa modelu `gemini-3.1-pro-preview` wyposażonego w `googleSearch` (Grounding), aby zebrać i zsyntetyzować autentyczne recenzje konsumenckie z rynku PL/EU.
- Wygenerowany raport sentimentu jest wstrzykiwany jako kontekst do generatora opisów GEO HTML (`generateGEOTextContent`) oraz generatora AEO (`generateAEOContent`).
- Prompty wymuszają stosowanie naturalnych nagłówków i akapitów społecznego dowodu słuszności (Social Proof).

### B. Implementacja Wymogów EU AI Act (Art. 50, 14, 12)

1. **Oznaczenie Transparentności (Art. 50):**
   - Wygenerowany opis HTML zostaje automatycznie wzbogacony o estetyczną stopkę transparentności:
     `🤖 Treść oraz analiza opinii zoptymalizowane autonomicznie przez Nexus ERP AI Engine (Zgodnie z Art. 50 EU AI Act). Oferta zatwierdzona przez operatora.`
   - Obiekt `finalDraft` w bazie danych zostaje opatrzony sekcją metadanych `aiMetadata`:
     `{ isAiGenerated: true, aiModel: "gemini-3.1-pro-preview", complianceNotice: "EU AI Act Transparency Compliant (Art. 50)" }`

2. **Gwarancja Nadzoru Ludzkiego (Art. 14 - HitL):**
   - Potok `EanPipelineService` tworzy wyłącznie proponowany szkic (`offerDraft`).
   - Publikacja do zewnętrznych API (BaseLinker / Allegro) jest technicznie niemożliwa bez ręcznego kliknięcia i zatwierdzenia zmian przez operatora w panelu HitL Reviewer (`OfferOptimizerView`).

3. **Rejestracja Audytowa (Art. 12):**
   - Każde uruchomienie Agenta AI emituje ustrukturyzowane logi zdarzeń w `src/utils/logger.js`, rejestrując stempel czasowy, EAN, nazwę modelu i unikalny identyfikator sesji.

---

## 3. Status
**Zaakceptowane, skomitowane i wdrożone w systemie Nexus ERP.**

---

## 4. Konsekwencje

### Pozytywne:
- **Wyższa Konwersja (Social Proof):** Opisy zawierające syntetyczne podsumowanie autentycznych opinii klientów znacząco podnoszą wskaźnik konwersji (CR) na Allegro.
- **Bezpieczeństwo Prawne:** Pełna zgodność z unijnymi przepisami EU AI Act zabezpiecza przedsiębiorstwo przed karami finansowymi za braki w transparentności AI.
- **Kontrola Jakości:** Bramka HitL wyklucza ryzyko automatycznego opublikowania błędnych informacji.

### Negatywne / Czas Wykonania:
- Dodatkowy krok zwiadu opinii w sieci (Google Search Grounding) wydłuża czas wykonania całego EAN Pipeline o ok. 5–10 sekund, co jest w pełni kompensowane przez asynchroniczny model pracy i pasek postępu we frontendzie.
