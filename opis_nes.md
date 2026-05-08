# Dokumentacja Funkcjonalna: ERP/CRM Nexus Sentinel (Wersja Produkcyjna)

Niniejszy dokument przedstawia wyczerpujący i szczegółowy opis absolutnie wszystkich modułów, funkcji, działań oraz możliwości systemu **Nexus Sentinel** (domena n-e-s.it). Jest to zaawansowana platforma klasy ERP/CRM zintegrowana z silnikami AI, stworzona do kompleksowego zarządzania e-commerce (ze szczególnym uwzględnieniem Allegro), logistyką oraz marketingiem influencerskim.

---

## 1. Moduł: Tablica (Widok Operacyjny - Kanban)
**Jak działa:** Operacyjne serce systemu oparte o metodyki zwinne do alokacji zasobów ludzkich.
**Funkcje:**
- **Zarządzanie Zadaniami:** Centralna tablica podzielona na sekcje: *Zaległe / Backlog*, *W Realizacji*, *Weryfikacja QA*, *Zakończone*.
- **Karty Zadań:** Każda zawiera ID, priorytet, tytuł, przypisanie do projektu lub kampanii, oddelegowanych pracowników oraz statusy (np. mechanika flagowania "Blokada").
- **Inicjacja Operacji:** Formularz "Nowe Zadanie" umożliwia definiowanie tytułu, szczegółowego opisu, estymowanego czasu, priorytetu oraz dat startu i deadline'u, a także delegowanie osób z podziałem na grupy.
- **AI Bottleneck Risk:** System wyliczający ryzyko i prawdopodobieństwo opóźnień operacyjnych na danym wąskim gardle.

## 2. Moduł: MTool (Modularny Kombajn Narzędziowy)
**Jak działa:** Najbardziej rozbudowany moduł ekspercki zawierający specjalistyczne mikro-aplikacje analityczne, inżynierii cenowej i marketingowej.
**Funkcje:**
- **Harmonogram SMI (Social Media Influencer):** Planer kampanii w mediach z wbudowanym **AI Orchestrator**. Pozwala na operacyjne zarządzanie rzutami (drops), ustrukturyzowaniem copywritingu, generowaniem bloków hashtagów oraz nadzorowaniem komentarzy.
- **ECO BOM (ROP/BDO/PPWR):** Zaawansowany ekologiczny manager materiałowy. Posiada drzewo BOM produktu do kalibracji wagi opakowań i aktualne stawki Organizacji Odzysku dla frakcji tworzyw (np. PET, HDPE, PVC, LDPE, PP, PS, Karton).
- **Kalkulator Ofert (Unit Economics Simulator):** 
  - Symulacja elastyczności cen i marży w locie z uwzględnieniem pełnego kosztorysu (COGS, transport, koszty pakowania, podatki BDO). 
  - Tryby zaawansowane: **B2B Wektor** oraz **B2C Rynek**.
  - Dynamiczne suwaki do błyskawicznego modelowania marży handlowej.
- **Baza Influencerów (Enterprise Influencer CRM):**
  - **Polowanie AI:** Narzędzie do wyszukiwania twórców przy pomocy zapytań języka naturalnego (NLP).
  - **Vector NLP:** Wyszukiwanie semantyczne (wektorowe) w repozytorium profili twórców.
  - **Pipeline Współpracy:** Prowadzenie twórcy przez etapy: Nawiązanie -> Umowa -> Paczka -> Zapłacono.
- **Ofertowanie GEO (AI):** Generator treści aukcji na bazie BaseLinkera. Sztuczna inteligencja skanuje EAN i buduje wysokokonwertujące opisy i analizy dostosowane do najnowszych wytycznych (tryby SEO/GEO 2026).
- **Resi Studio:** Moduł do zarządzania i kompozycji zasobów medialnych/sesji w fazie integracji.

## 3. Moduł: Mózg Ads (Allegro Ads Intelligence)
**Jak działa:** Autonomiczny i w pełni zintegrowany z Allegro Ads system zarządzania budżetem CPC z pominięciem interfejsu Allegro.
**Funkcje:**
- **RL Backtest Monitor:** Zaawansowany panel do monitorowania skuteczności algorytmów (Reinforcement Learning) ucinających lub podnoszących stawki CPC w czasie rzeczywistym.
- **Silnik Testowy E2E:** Możliwość uruchamiania symulacji i pełnych testów wydajnościowych obciążeń kampanii dla konkretnych par SKU/EAN.
- **Time-Decay Attribution:** Modelowanie opóźnionej atrybucji konwersji (jak wartość kliknięcia sprzed dni przekłada się na dzisiejszy zakup).

## 4. Moduł: God-Mode CMO (Portfolio Manager)
**Jak działa:** Główny pulpit dowodzenia strategicznego, na podstawie algorytmów analitycznych podejmujący decyzje asortymentowe.
**Funkcje:**
- **Macierz Asortymentu:** Systematyzacja produktów (tzw. "Lokomotywy" generujące ruch i główne przychody oraz "Wagony" stanowiące produkty komplementarne lub balast).
- **Rekomendacje AI:** Wbudowany agent operacyjny podpowiadający decyzje (np. zastosowanie agresywnego biddingu CPC w Ads dla oznaczonych "Lokomotyw").
- **Analiza Korelacji (Koszykowa):** Obliczanie prawdopodobieństwa zakupów łączonych i sugerowanie "Virtual Bundles" (zestawów promocyjnych) do utworzenia.
- **Strażnik Smarta:** Zrobotyzowany, nocny audytor ofert Allegro, który cyklicznie upewnia się, że spełniają wymogi statusu Smart! i w razie problemów podnosi alarm.

## 5. Moduł: Nexus Sentinel (Analityka God-Mode)
**Jak działa:** Środowisko finansowo-analityczne łączące koszty mediów z marżowością produktową z PIM.
**Funkcje:**
- **True Net Margin:** Agregacja wszystkich fizycznych kosztów stałych/zmiennych, opłat ryczałtowych, transportu z kampaniami reklamowymi dla wyliczenia ostatecznej, najczystszej marży na poziomie konkretnego SKU.
- **iROAS (Incremental ROAS):** Obliczanie wpływu przyrostowego wydatków na poszczególne kanały (jak dodatkowy 1000 PLN w Allegro wpływa na sprzedaż vs w Facebook Ads).
- **Prognozy (Forecast):** Analiza efektów „halo” i kanibalizacji własnych marek z użyciem modala Analytics Forecast Modal.

## 6. Moduł: Kampanie (Centrum Promocji)
**Jak działa:** Zarządzanie aktywnościami promocyjnymi i przydziałem produktów w danym oknie czasowym.
**Funkcje:**
- **Kalendarz Promocji (Oś Czasu):** Interfejs wizualny wyświetlający ułożenie kampanii (w ujęciu 4 tygodni, kwartału lub roku).
- **Struktury i Filtrowanie:** Wyodrębnienie marek (własnych i kontrahentów), przydzielanie wielopoziomowego budżetu (Agency, Media, POSM), przypisywanie asortymentu w ramach CampaignProduct.

## 7. Moduł: Projekty (Zarządzanie Portfelem Operacyjnym)
**Jak działa:** Planowanie wieloetapowych inicjatyw przekładających się na zadania.
**Funkcje:**
- **Projekty Długofalowe:** Zarządzanie zadaniami biznesowymi (np. "Wdrożenie marki na rynek francuski", "Optymalizacja Magazynu"). 
- **Monitorowanie:** Paski postępu (Progress bar), wskaźniki dat startu/zakończenia, rozliczanie Ownerów i PMów projektów.

## 8. Moduł: PIM (Product Information Management)
**Jak działa:** Centralny Single Source of Truth dla danych i atrybutów produktowych z synchronizacją BaseLinker/Subiekt.
**Funkcje:**
- **Katalog SKU & DQS:** Zestawienie indeksów wraz ze wskaźnikiem jakości danych (Data Quality Score), zmuszającym do trzymania porządku w kartotekach.
- **Karty Produktów:** Ekstremalnie rozbudowana edycja z podziałem na Ekonomię (COGS, VAT, cła, basePrice, salePrice), Logistykę (architektura zapasów WMS/ERP, waga, kubatura) oraz Ekologię.
- **AI Tools ("Interpoluj EAN"):** Funkcja zautomatyzowanego pobierania parametrów technicznych z sieci i uzupełniania danych na podstawie samego kodu EAN za pomocą sztucznej inteligencji.

## 9. Moduł: Kontrahenci (CRM)
**Jak działa:** Zarządzanie powiązaniami, fakturowaniem i strukturą firm z którymi platforma współpracuje (agencje, B2B, dostawcy).
**Funkcje:**
- **Ewidencja Kontrahentów:** Rejestr KRS, NIP, forma prawna, oceny (1-5 gwiazdek), zarządzanie hierarchią oddziałów (`CompanyBranch` jak centrale i magazyny) oraz powiązane osoby kontaktowe (Dyrektorzy, Handlowcy).

## 10. Moduł: Czat (Komunikacja & AI Assistant)
**Jak działa:** Komunikator zespołowy z głęboką asystą systemu wirtualnego.
**Funkcje:**
- **Kanały (Wiadomości Globalne i DM):** Podział rozmów na dedykowane czaty dla poszczególnych działów (Magazyn, Zarząd, Handlowcy). Komunikacja P2P.
- **@Nexus (Zintegrowany Asystent AI):** Bot dostępny na czacie, z którym można rozmawiać językiem naturalnym. Posiada uprawnienia do: przeszukiwania bazy BaseLinkera, sprawdzania aktualnych stanów magazynowych na konkretnym magazynie, odpytywania o zyskowność (True Net Margin) produktu, tworzenia podsumowań i szukania statystyk systemowych. Zastępuje ręczne przeskakiwanie przez panele.
- **System Ogłoszeń (Announcements):** Wysyłanie komunikatów krytycznych ze zweryfikowanym śledzeniem przeczytania.

## 11. Moduł: Admin (Panel Zarządzania i IdP)
**Jak działa:** Rdzeń zarządzania bezpieczeństwem, uprawnieniami i systemami integracyjnymi.
**Funkcje:**
- **Baza Osobowościowa:** Zarządzanie kadrą, role (ADMIN, USER), kontrola dostępu (zakładka po zakładce), przypisywanie do działów.
- **Zarządzanie Połączeniami (Integracje API):** Miejsce konfiguracji kluczy, np. autoryzacja BaseLinker X-BLToken, zarządzanie połączeniami dla Subiekta czy modeli AI (Claid, Bria, ElevenLabs, HeyGen).
- **Archiwum Zadań / Logi Aktywności:** Pełny audyt (Action Logs) pokazujący każdą operację w systemie z timestampem, kluczowe w razie rozwiązywania problemów i przywracania danych.
- **IDP (Intelligent Document Processing):** Wrzutki faktur i dokumentacji podlegające procedurom OCR.

---
**Podsumowanie Integracyjne:**
System działa na pełnym zamkniętym obiegu. Automatyka asortymentu w God-Mode CMO dyktuje politykę w Mózgu Ads. Wypalane budżety trafiają z powrotem do Sentinel Analytics łącząc się z kosztami BDO i COGS generowanymi w PIM oraz MTool. Prace ludzkie nad optymalizacją (tworzone z wykorzystaniem narzędzi "Ofertowanie GEO" czy AI @Nexus na czacie) logują czas pracy w module Kanban, co ostatecznie obciąża wynik danej marki, podając zarządowi czysty zysk bez żadnych przybliżeń.
