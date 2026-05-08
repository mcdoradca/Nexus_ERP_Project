# Mapa Połączeń Systemowych: Nexus Sentinel (Wersja Produkcyjna)

Niniejszy dokument stanowi wyczerpującą mapę relacji (co z czym się łączy, dlaczego, kiedy i z jakim skutkiem) w ekosystemie **Nexus Sentinel**, uwzględniającą wszystkie moduły i procesy widoczne w środowisku produkcyjnym (n-e-s.it).

## 1. Graficzna Architektura Zależności (Mermaid)

```mermaid
graph TD
    %% Użytkownicy, Asysta i Komunikacja
    User[Użytkownik / Pracownik]
    Task[Zadanie / Kanban]
    Project[Projekt Długofalowy]
    Chat[Czat Zespołowy / Kanały]
    NexusBot[@Nexus AI Assistant]
    Announcements[Ogłoszenia Systemowe]
    
    User -->|Tworzy / Przypisany / Blokuje| Task
    User -->|Kieruje| Project
    Task -->|Składowa| Project
    User -->|Komunikuje się| Chat
    Chat <-->|Odpytuje NLP| NexusBot
    User -->|Wymuszony Odczyt| Announcements
    
    %% MTool, PIM & Pętla Finansowa
    MTool[MTool - Kombajn Narzędziowy]
    ECO[ECO BOM: BDO/PPWR]
    Sim[Kalkulator Ofert B2B/B2C]
    PIM[PIM: Centralny Katalog SKU]
    GodMode[Nexus Sentinel: True Net Margin]
    BL[BaseLinker]
    
    PIM -->|Dostarcza wagi i wymiary| ECO
    ECO -->|Oblicza koszty frakcji| MTool
    MTool -->|Zasila| Sim
    PIM -->|Dostarcza COGS| Sim
    Sim -->|Liczy w locie| GodMode
    PIM <-->|Wymienia Stany/Ofertowanie GEO| BL
    NexusBot -->|Sprawdza stany na żywo| BL
    
    %% Marketing, Kampanie i Ads
    Campaign[Kampania Promocyjna]
    SMI[Harmonogram SMI / AI Orchestrator]
    Ads[Mózg Ads / RL Backtest]
    Cat[Macierz: Lokomotywy / Wagony]
    CMO[God-Mode CMO]
    
    Campaign -->|Strukturyzuje zrzuty postów| SMI
    PIM -->|Klasyfikowane przez AI| Cat
    Cat -->|Przekazuje do| CMO
    CMO -->|Zleca agresywny bidding dla Lokomotyw| Ads
    Ads -->|Optymalizuje budżet i uderza do API Allegro| Campaign
    Ads -->|Raportuje koszty uderzające w marżę| GodMode
    
    %% Influencer CRM
    Influencer[Influencer CRM / Baza Twórców]
    NLP[Polowanie AI / Vector NLP]
    Pipeline[Pipeline: Nawiązanie -> Zapłacono]
    
    NLP -->|Wyszukuje profile do bazy| Influencer
    Influencer -->|Przechodzi przez etapy| Pipeline
    Pipeline -->|Realizuje| Campaign
    
    %% Zewnętrzni Kontrahenci
    Company[Baza CRM / Kontrahenci]
    Branch[Magazyny / Oddziały]
    
    Company -->|Posiada| Branch
    Company -->|Rozliczana w| Pipeline
    Company -->|Przypisana do| Campaign
```

---

## 2. Szczegółowy Rejestr Połączeń: Kto, Z Czym, Po Co, Kiedy i Skutek

### A. Jądro Analityczne (MTool, CMO, Mózg Ads, Sentinel)

**1. PIM (Katalog SKU) <-> MTool (ECO BOM i Kalkulator) <-> God Mode (True Net Margin)**
- **Kiedy:** Przy każdej kalkulacji cenowej dla Allegro / B2B i ustalaniu polityki.
- **Po co:** System nie pozwala na ustalenie ceny "na wyczucie". Suwaki w "Kalkulatorze Ofert" ciągną dane fizyczne (COGS) z PIM oraz parametry środowiskowe z modułu ECO BOM (stawki PPWR/BDO za frakcje PET, HDPE, Karton).
- **Skutek:** Wypluwana jest całkowicie czysta marża "True Net Margin". Jeśli zmieni się opłata za 1kg plastiku w ECO BOM, marża (True Net Margin) każdego produktu zawierającego plastik automatycznie spada.

**2. God-Mode CMO <-> Mózg Ads (RL Backtest Monitor)**
- **Kiedy:** Codzienna, ciągła optymalizacja 24/7 reklam Allegro.
- **Po co:** "God-Mode CMO" dzieli katalog PIM na "Lokomotywy" (best-sellery wpychające ruch) oraz "Wagony" (balast lub asortyment komplementarny).
- **Skutek:** Mózg Ads (silnik Reinforcement Learning) automatycznie przesuwa budżet reklamowy – nakłada agresywny bidding CPC wyłącznie na Lokomotywy, by zmaksymalizować ruch, tnąc stawki dla Wagonów. Równocześnie bada Time-Decay Attribution (opóźnione zakupy) i raportuje straty uderzające z powrotem w True Net Margin.

**3. Baza Kontrahentów <-> Strażnik Smarta (CMO)**
- **Kiedy:** Nocny audyt weryfikujący (zrobotyzowany).
- **Po co:** Sprawdza poprawność ofert i logistyki powiązanej z danym magazynem podwykonawcy (Company Branch).
- **Skutek:** Jeśli warunki programu Allegro Smart! są zagrożone z winy kuriera lub magazynu, system natychmiast wysyła alert do Ownera kampanii/magazynu, by nie dopuścić do utraty flagi "Smart" i ogromnego spadku konwersji.

### B. Marketing Wizerunkowy i AI Orchestrator

**4. MTool (Harmonogram SMI) <-> Kampanie (Centrum Promocji)**
- **Kiedy:** Podczas planowania wprowadzania nowych produktów do sieci afiliacyjnej lub do social mediów.
- **Po co:** Zamiast rozproszonych plików Excel, "AI Orchestrator" spina strukturę tzw. "rzutów" (drops). Dzieli kampanię na daty publikacji, bloki hashtagów i gotowy copy.
- **Skutek:** Zgrupowane koszty postów i prowizji rzucane są bezpośrednio na barki kosztowe danej Kampanii Promocyjnej.

**5. MTool (Baza Influencerów) <-> MTool (Vector NLP)**
- **Kiedy:** Faza "Polowanie AI" (Poszukiwanie nowych współprac).
- **Po co:** Zamiast ręcznie przeglądać setki profili, system wykorzystuje Vector NLP (Semantic Search). Handlowiec wpisuje zapytanie naturalne (np. "szukam fitness influencera z psem promującego ekomarketing").
- **Skutek:** Baza filtruje odpowiednich twórców. Od momentu nawiązania kontaktu wektorowego, twórca trafia do Pipeline'u współpracy ("Nawiązanie", "Umowa", "Paczka", "Zapłacono"), co ściśle integruje się z systemem finansowym i kampaniami.

### C. Automatyzacja Pracy i Komunikacja Zespołowa

**6. Użytkownik <-> Czat Zespołowy <-> @Nexus AI Assistant**
- **Kiedy:** Na co dzień, podczas typowej pracy operacyjnej (zamiast ręcznego przeskakiwania po zakładkach).
- **Po co:** Szybka wymiana informacji bez obciążania systemu zapytań SQL przez UI. Handlowiec na kanale pisze: `@Nexus, ile sztuk [SKU] mamy na magazynie we Wrocławiu i jaki jest na tym True Net Margin?`.
- **Skutek:** @Nexus wykorzystuje integracje API (np. BaseLinker X-BLToken) w czasie rzeczywistym. Odpowiada językiem naturalnym na czacie, łącząc dane z PIM z surowymi logami z BaseLinkera. Zwiększa drastycznie tempo obsługi klienta B2B.

**7. Task (Kanban) <-> AI Bottleneck Risk**
- **Kiedy:** Zadania przydzielone w module operacyjnym utykają na długi czas w statusie "Zaległe" lub "Zablokowane".
- **Po co:** System monitoruje czas oddelegowania i czas "blokady".
- **Skutek:** Mechanika predykcji opóźnień alarmuje (przez Announcements lub Czat) zarząd, że dany pracownik/kampania stanowi "wąskie gardło" (Bottleneck) i dany projekt długofalowy (Projekty Operacyjne) może się opóźnić zagrażając oknu sprzedażowemu w Allegro.

### D. Wzbogacanie Produktu (MDM / AI Tools)

**8. PIM (Data Quality Score) <-> "Interpoluj EAN" (AI Tools)**
- **Kiedy:** Kiedy do bazy dodawane są "Wagony" o skromnym opisie, z Data Quality Score na poziomie "Czerwonym".
- **Po co:** Sklepy internetowe (SEO/GEO 2026) wymagają gigantycznej ilości meta-danych (waga, wymiary logistyczne, opisy handlowe) aby być dobrze pozycjonowanym w ekosystemie BaseLinker/Allegro.
- **Skutek:** Moduł "Ofertowanie GEO" skanuje EAN. AI (np. zintegrowane ChatGPT/Gemini przez API z panelu Admina) odpytuje internet, dopisuje wagę, buduje rozbudowany opis aukcji "pod klucz" z uwzględnieniem wytycznych SEO na dany rok (np. GEO 2026). Zaktualizowany PIM wypycha od razu gotową, wysokiej jakości ofertę na produkcję.
