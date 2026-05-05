# Nexus Portfolio Manager: Roadmapa Wdrożenia (Allegro + BaseLinker)

Dokument stanowi architektoniczny plan działania (Master Plan) dla przejścia z pojedynczych optymalizacji ofert na model "Dyrektora Marketingu" zarządzającego całym kontem i budżetem.

---
## 🚀 DEVELOPER PIPELINE (Kolejność Wykonania Wdrożenia)
Na podstawie analizy architektury, ustalam następujący "Bulletproof Pipeline" wdrażania. Kodujemy i zabezpieczamy warstwa po warstwie:
1. **[ZROBIONE] Algorytmy Analityczne:** Silniki do asocjacji (Basket) i kategoryzacji (SKU).
2. **[TERAZ] Orkiestracja Fazy 1:** Zbudowanie centralnego `portfolio.service.js`, który połączy BaseLinker -> Basket -> SKU Categorizer i wygeneruje stan portfela.
3. **[NASTĘPNIE] Strażnik Smarta (Sentinel):** Kodowanie nocnego watchdoga, by od pierwszego dnia chronił rentowność darmowej wysyłki Zestawów.
4. **Front-End CMO Dashboard:** Przeniesienie wyników Fazy 1 do UI, by użytkownik widział rekomendacje i mógł w nie klikać (Tinder dla e-commerce).
5. **Egzekutor PIM:** Podpięcie przycisku "Akceptuj" pod tworzenie wirtualnego zestawu na bazie danych z ERP (Prisma).
6. **God-Tier (Wirtualne Półki):** Łączenie zdjęć produktów za pomocą agentów AI i Claid.ai oraz generowanie łączonych opisów.
---

## Faza 1: Analiza Koszyka i Kategoryzacja (Złote Źródło: BaseLinker API)
1. **Pobranie historii zamówień (Data Ingestion):**
   * Synchronizacja danych o zamówieniach z ostatnich 3-6 miesięcy z BaseLinkera.
   * Ekstrakcja danych o przepływach towarowych (Stock Velocity).
2. **Market Basket Analysis (Analiza Asocjacji):**
   * Wdrożenie algorytmu koszykowego (np. Apriori), który znajdzie ukryte powiązania (np. "Produkt A sprzedaje się w 40% z Produktem B").
   * Cel: Naturalne sugestie do tworzenia Zestawów i Wielopaków.
3. **Kategoryzacja Asortymentu (Klasyfikator AI):**
   * **Lokomotywy (Bait Products):** Oferty generujące >60% ruchu i sprzedaży. Przeznaczane na front walki CPC.
   * **Wagony (Generatory Marży):** Kupowane razem z Lokomotywami. Przeznaczane do podbijania AOV (Kupony, Monety).
   * **Śpiochy (Złogi Magazynowe):** Brak sprzedaży >60 dni. Przeznaczane do Strefy Okazji lub agresywnych Zestawów wyprzedażowych.

## Faza 2: Fuzja Danych o Rychu (Allegro Analytics API)
1. **Zestawienie Ruchu z Konwersją:**
   * Pobranie danych o Odsłonach (Impressions) i Kliknięciach z Allegro.
   * Mapowanie wejść z Allegro na finalną sprzedaż z BaseLinkera.
2. **Diagnoza problemu:**
   * Dużo odsłon + brak sprzedaży = problem z ceną/miniaturą (odrzucenie).
   * Brak odsłon + dobra sprzedaż jak już wejdą = problem z ekspozycją (wymaga CPC/Monet).

## Faza 3: Silnik Rekomendacji Promocyjnych (Mózg Nexus)
1. **Globalny Budżet Miesięczny:** Użytkownik określa budżet (np. 10 000 PLN).
2. **Generowanie Zadań:** Zamiast cichego działania w tle, AI wystawia pakiety zadań:
   * Sugestia: "Dodaj 10 Monet do 15 ofert z grupy Wagony (Szacowany koszt przy sprzedaży: 180 PLN)".
   * Sugestia: "Ustaw CPC na 0.80 PLN dla Lokomotywy EAN X, bo konkurencja osłabła".
   * Sugestia: "Utwórz w BaseLinkerze nowy Zestaw: Szampon A + Maska B, omijając porównywarkę Allegro".

## Faza 4: Interfejs "Dyrektora Marketingu" (Front-end UI)
1. Zakładka **Centrum Strategii**: Panel z kafelkami wygenerowanych rekomendacji.
2. System Akceptacji: Przycisk **[Zatwierdź]** przy rekomendacji, który wyzwala żądanie API. Pełna kontrola w rękach użytkownika, ale bez konieczności przechodzenia do panelu Allegro.

## Faza 5: Egzekucja Ofertowa (API)
1. Przesyłanie zatwierdzonych akcji promocyjnych (Monety, CPC, Strefa Okazji) przez system uwierzytelniania Allegro REST API.
2. Tworzenie wirtualnych ofert (Zestawów) przy użyciu metody `addInventoryProduct` w BaseLinkerze.

---

## Faza 6: "God-Mode Analytics" (Moduł Raportowy dla Analityka-Sceptyka)
Moduł stworzony na żądanie, aby uciąć wszelkie domysły i pokazać twarde, niepodważalne liczby z każdej akcji reklamowej.

1. **Jeden Przycisk "Raport":** 
   * Generuje PDF lub interaktywny dashboard dla wskazanej kampanii/produktu/zestawu.
2. **Dekonstrukcja Kosztów (True Cost Analysis):**
   * Rozbicie kosztu na ułamki grosza: Przychód - (COGS + Prowizja Allegro + Koszt Dostawy Smart + Koszt BDO/Kartonu + Koszt Wydanych Monet + Koszt Kliknięć CPC).
   * Ostateczny **Zysk Netto na czysto (True ROI)**.
3. **Analiza Przyrostowa (Uplift / A-B Testing):**
   * Automatyczne nałożenie na wykres okresu sprzed promocji (np. 14 dni wstecz) vs okres z promocją.
   * Dowód matematyczny: "Wydano 200 zł na monety, wygenerowano 800 zł dodatkowej marży netto. Czysty zysk z akcji: 600 zł".
4. **Atrybucja Krzyżowa (Efekt Halo na wykresie):**
   * Wykazanie "Sprzedaży Wspomaganej". Raport pokaże sceptykowi: *"Kliknięcia z Adsów poszły w Lokomotywę A (co wygenerowało stratę 20 zł), ALE klienci ci włożyli do koszyka również Wagony B i C, dając ostatecznie 150 zł zysku z całego koszyka"*.
   * To najpotężniejsza broń przeciwko oskarżeniom o "przepalanie budżetu" w CPC.
5. **Audyt Historyczny (Traceability):**
   * Zapis każdej podjętej decyzji z podaniem argumentacji AI (np. "Dlaczego AI podniosło wczoraj stawkę? Bo o 14:00 konkurent podniósł cenę, a my mieliśmy przewagę"). Pełna audytowalność logów.

---

## Faza 7: "God-Tier 2026" (Wirtualne Półki Nieskończoności i Arbitraż Semantyczny)
Kiedy standardowe optymalizacje CPC i Zestawów osiągną sufit, włączamy ostateczną broń architektoniczną. Zamiast walczyć o kliknięcie na zatłoczonym rynku, AI **tworzy nowe rynki**, na których nie ma konkurencji.

1. **Wirtualne Półki Nieskończoności (Infinite Virtual Inventory):**
   * Posiadając fizycznie w magazynie 500 SKU, AI w BaseLinkerze generuje **50 000 wirtualnych ofert**. 
   * Jak? System tworzy "Zestawy Celowe" (Intent-Based Bundles). Zamiast sprzedawać "Krem z Aloesem", AI generuje z niego 50 nowych ofert: "Zestaw Ratunkowy po Opalaniu", "Zimowa Ochrona Cery Naczynkowej", "Zestaw dla Nastolatka na Trądzik".
   * Wykorzystujemy moduł *Bria AI / Claid AI*, który już zintegrowaliśmy w systemie, aby w 10 sekund wygenerować nową miniaturę lifestyle'ową dla każdej wirtualnej oferty. 
   * **Zysk:** Topimy konkurencję wolumenem ofert trafiających w ultrawąskie nisze (long-tail), omijając walkę cenową o główne słowa kluczowe.
2. **Arbitraż Semantyczny (Search Intent Hijacking):**
   * Nasłuch trendów. Jeśli AI przez Google Trends / Allegro Analytics wykryje, że nagle rośnie wyszukiwanie "kosmetyki z kwasem hialuronowym na prezent", a Twój produkt go zawiera, system natychmiast generuje dedykowaną wirtualną ofertę z tytułem idealnie skrojonym pod to zapytanie, nakłada na miniaturę ramkę "Idealne na Prezent" i ustawia na to 100% budżetu CPC. Wygrywamy aukcję, bo mamy 100% trafności tytułu z zapytaniem.
3. **Produkt Dodany Informacyjnie (Zero-Cost Value):**
   * AI dołącza do ofert wirtualny gratis, np. wygenerowany w locie przez Gemini PDF "E-book: Poradnik świadomej pielęgnacji cery trądzikowej". Koszt produkcji: 0 zł. Wartość postrzegana przez klienta: +49 zł. W ten sposób sprzedajesz ten sam krem o 15 zł drożej niż konkurencja, a klienci i tak wybierają Ciebie.
   * **Efekt:** Konkurencja zostaje na peronie, zastanawiając się, jak możesz sprzedawać ten sam krem drożej i mieć 10x więcej sprzedaży. Odpowiedź: bo Ty nie sprzedajesz kremu. Sprzedajesz gotowe rozwiązanie problemu.

---

## Faza 8: Ekosystem Niezależnych Strażników (The Sentinel Network)
System oparty na AI nie może ufać samemu sobie. Podobnie jak w lotnictwie czy algorytmach giełdowych, wprowadzamy architekturę "Adversarial AI" – niezależnych agentów weryfikujących pracę innych agentów i ludzi. Działają oni w tle (CRON, np. codziennie o 3:00 w nocy) i mają uprawnienia do nałożenia twardej blokady na dowolny proces.

1. **Strażnik Smarta (Smart! Guardian):**
   * **Cel:** Ochrona strategii darmowej dostawy.
   * **Działanie:** Jeśli Zestaw A+B został utworzony celowo, aby dobić do kwoty 49,99 PLN (próg Smart), Strażnik nakłada na te produkty "blokadę cenową" (Price Lock) na 30 dni. 
   * **Audyt Nocny:** Strażnik codziennie skanuje cenniki Allegro i nasze oferty. Jeśli Allegro podniesie próg do 54,99 PLN, lub jeśli handlowiec przypadkowo obniży cenę produktu A o złotówkę w BaseLinkerze (psując zestaw), Strażnik natychmiast wysyła alert: *"🚨 ALERT: Zestaw X przestał być w programie Smart! Wymagana korekta ceny o +1,20 PLN"*.
2. **Strażnik Marży (Margin Overseer):**
   * **Cel:** Zapobieganie przepalaniu budżetu w przypadku pomyłki głównego Agenta RL.
   * **Działanie:** Niezależny skrypt, który nie wie, jaki był cel kampanii, patrzy tylko na twarde saldo. Jeśli zauważy, że wczoraj wygenerowaliśmy stratę na danym EAN-ie (koszty CPC > Zysk Netto), wymusza pauzę bez pytania głównego Agenta o zgodę.
3. **Strażnik Jakości Danych (Data Purity Guard):**
   * **Cel:** Pilnowanie poprawności danych wprowadzanych przez człowieka w Nexus PIM.
   * **Działanie:** Wyłapuje błędy ludzkie (tzw. "Czeski błąd"). Jeśli pracownik wpisze koszt zakupu szamponu jako 0,50 zł zamiast 50,00 zł (co oszukałoby Agenta Biddingowego, że mamy 2000% marży i kazało mu licytować w nieskończoność), Strażnik wyłapuje taką statystyczną anomalię i blokuje ofertę do czasu weryfikacji przez człowieka.
