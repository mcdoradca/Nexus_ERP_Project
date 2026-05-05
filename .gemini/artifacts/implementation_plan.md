# Strategia Modernizacji Nexus ERP (AI & Workflow 2026)

Poniższy dokument przedstawia mapę drogową ulepszeń dla każdego z modułów Twojego systemu ERP. Opiera się na mojej fizycznej i kodowej eksploracji obecnych funkcjonalności oraz dogłębnym badaniu sieci (Deep Research) pod kątem najnowocześniejszych standardów rynkowych na rok 2026, wykorzystujących modele takie jak **Gemini 3.1 Pro**.

## Cel Projektu
Przekształcenie Nexus ERP z pasywnego systemu zarządzania w aktywny, autonomiczny "system operacyjny" (Agentic Workflow). Chcemy, by system nie tylko przechowywał dane, ale proaktywnie optymalizował marże, przewidywał sukcesy kampanii i automatyzował żmudne procesy contentowe.

---

> [!IMPORTANT]
> ## User Review Required
> Przed przystąpieniem do implementacji kodu, musisz zapoznać się z proponowanymi zmianami w każdym module i zdecydować, od którego etapu zaczynamy fizyczną pracę. Możesz odrzucić niektóre pomysły, zmodyfikować je lub zaakceptować całość.

> [!WARNING]
> ## Open Questions
> 1. **Pricing (Kalkulator):** Czy chcesz, aby moduł Dynamic Pricing automatycznie wypychał zaktualizowane ceny do zewnętrznych systemów (np. API BaseLinkera), czy ma na razie działać jako system "rekomendacyjny" (nadpisywanie tylko w PIM)?
> 2. **SMI (Social Media):** Czy mamy zintegrować bezpośrednie publikowanie (np. poprzez Meta API), czy system pozostaje "planerem" i dyskiem na zasoby?
> 3. **Influencer CRM:** Jak dużą autonomię w pisaniu maili/komunikacji z twórcami chcemy przekazać sztucznej inteligencji? 

---

## Proponowane Zmiany i Ulepszenia Modułowe

### 📦 1. Katalog SKU (PIM) & ECO BOM
**Obecny stan:** Solidne centrum prawdy połączone z BaseLinkerem. Przechowuje BOM i koszty EPR/BDO.
**Nowe trendy z sieci (2026):** PIM staje się infrastrukturą natywną dla AI (Automated Data Governance, Digital Product Passports, Answer Engine Optimization).
*   **Propozycja A (AEO - Answer Engine Optimization):** Zrestrukturyzowanie opisu (`descriptionHtml` i `features`), aby był zoptymalizowany pod kątem konsumenckich botów AI (np. Google SGE, Perplexity), a nie tylko tradycyjnego SEO.
*   **Propozycja B (Automatyczna Walidacja DPP):** Rozszerzenie ECO BOM o automatyczne generowanie Cyfrowego Paszportu Produktu (Digital Product Passport), stającego się wymogiem w UE, na bazie wpisanych surowców.
*   **Propozycja C (Predictive Enrichment):** Agent AI skanujący braki w atrybutach i sugerujący, które pola bazy danych należy wypełnić, by statystycznie podnieść konwersję na Allegro.

---

### 💰 2. Kalkulator Ofert (AlgoPricing)
**Obecny stan:** Rozbudowany system wyliczania marży ("Live Unit Economics") bazujący na stałych kosztach (Overhead) i zmiennych (Transport, BDO, AI).
**Nowe trendy z sieci (2026):** AI Dynamic Pricing zoptymalizowany pod kątem ochrony marży całkowitej (Contribution Margin), a nie tylko wojny cenowej.
*   **Propozycja A (Model Przewidywania Elastyczności):** Wdrożenie dynamicznego algorytmu, który nie tylko liczy "Target Margin", ale na bazie wahań kosztów PIM ostrzega o ryzyku i sam sugeruje korekty cen, maksymalizując wskaźnik *Profit Unit*.
*   **Propozycja B (Segmentacja B2B):** Dodanie algorytmu rekomendującego minimalne zamówienie logistyczne (MOQ) dla klienta B2B, by zneutralizować wpływ sztywnych kosztów logistyki i factoringu.

---

### 🤝 3. Influencer CRM & Deal IRM
**Obecny stan:** ERP i panel CRM śledzący wskaźniki twórców, kampanie, negocjacje (Barter/Paid) oraz metryki UOKiK.
**Nowe trendy z sieci (2026):** Przejście na Predictive Analytics i zautomatyzowane lejki wspierające relacje (Nurturing).
*   **Propozycja A (Predictive ROI):** AI (Gemini) na bazie followersów i "Authenticity Score" przewiduje estymowany zasięg (EMV) *przed* domknięciem umowy (DealIRM), minimalizując ryzyko "przepalenia" budżetu.
*   **Propozycja B (Automated Outreach):** Agent analizujący "Influencer Note" i automatycznie generujący wysoce spersonalizowane maile outreachowe lub scenariusze negocjacyjne z twórcami.
*   **Propozycja C (UOKiK Compliance Scan):** Wrzucanie transkrypcji/postów z kampanii do LLM w celu automatycznej walidacji, czy twórca poprawnie użył hashtagów #WspółpracaReklamowa.

---

### 📱 4. MTool: Harmonogram SMI & Ofertowanie GEO
**Obecny stan:** Ręczny planer publikacji (Szkic, Do Akceptacji) i system wgrywania Assetów dla kampanii. Generowanie ofert z produktów w GEO.
**Nowe trendy z sieci (2026):** Single-Prompt Campaigns, Proactive Strategy i Agentowe Orkiestrowanie.
*   **Propozycja A (Social Media Agent):** Bot, który po zatwierdzeniu strategii kampanii automatycznie rozbija ją na odpowiedni "Harmonogram SMI" (generuje pomysły na Rolki, Infografiki, Daty publikacji).
*   **Propozycja B (Multimodalne Generowanie z 1 promptu):** Wykorzystanie modułu Ofertowania GEO do zasilania również SMI – generujemy ofertę i natychmiast z tego samego kontekstu wypuszczamy paczkę postów do Harmonogramu.

---

### 📊 5. Projekty, Zadania (Kanban) i Komunikator
**Obecny stan:** Rozbudowany przepływ pracy, komunikator Socket.io per wątek projektu, logowanie czasu i blokady zadań.
**Nowe trendy z sieci (2026):** Systemy wyłapujące wzorce i samoczynnie proponujące optymalizacje pracy.
*   **Propozycja A (Inteligentne Podsumowania Czatów):** Gemini analizujące "Universal Chat" i codziennie rano serwujące zespołowi pigułkę najważniejszych ustaleń w sekcji "Wątki Kontekstowe" (eliminacja "przebijania się" przez setki wiadomości).
*   **Propozycja B (Task Bottleneck Predictor):** Wyłapywanie na Kanbanie, kiedy zadania historycznie blokują się na statusie "Review" i powiadamianie menedżera projektu o potencjalnych zatorach, zanim zagrożą deadlinom.

---

## Plan Weryfikacji (Verification Plan)
Po zatwierdzeniu przez Ciebie wybranych funkcji:
1. Zbuduję/zmodyfikuję strukturę bazy danych w `schema.prisma`.
2. Zaktualizuję silniki backendu Node.js o nowe algorytmy Gemini 3.1 Pro.
3. Wdrożę interfejsy w React, utrzymując dotychczasowy, spójny design (Tailwind/Lucide).
4. Przetestujemy każdy workflow z wirtualnymi kontami operatorów.
