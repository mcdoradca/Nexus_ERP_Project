# Nexus Sentinel: God-Mode Analytics (Architektura Prawdy)

Zgodnie z poleceniem, "Zwiad AI" przeanalizował typowe zebrania zarządów e-commerce, raporty dyrektorów marketingu i sztuczki agencji reklamowych. Wyciągnęliśmy na wierzch wszystkie niewygodne, podchwytliwe i trudne pytania, którymi próbują zabłysnąć "sceptycy" oraz "karierowicze".

Nexus Sentinel nie będzie prezentował ładnych, okrągłych wykresów. Będzie bezlitosnym, matematycznym sędzią, który zamyka usta danymi.

## 1. Pytania Sceptyków i Odpowiedzi Nexusa (Matryca Dowodowa)

| Podchwytliwe Pytanie (Karierowicz / Sceptyk) | Odpowiedź / Dowód z Nexus Sentinel | Wskaźnik w UI |
| :--- | :--- | :--- |
| *"Chwalicie się wysokim ROAS (Zwrotem z Reklamy). Ale czy to jest **Przyrostowy ROAS (iROAS)**, czy po prostu reklama przypisuje sobie klientów, którzy i tak kupiliby organicznie?"* | System analizuje krzywą sprzedaży organicznej przed odpaleniem kampanii i odcina "bazową sprzedaż" (Baseline). Raportuje wyłącznie to, co wygenerowano **ponad stan**. | **Incremental ROAS (iROAS)** |
| *"Pokazujecie Zysk Brutto. A co ze zwrotami (Return Rate), kosztami pakowania i opłatami BDO za ten dodatkowy karton?"* | Sentinel w locie dekonstruuje Unit Economics: Cena - VAT - Prowizja - Zakup - Karton - Folia - Koszt Kuriera - % Zwrotów = Twardy Zysk Netto na koncie bankowym. | **True Net Margin (TNM)** |
| *"Reklama na ten produkt ma ujemny ROAS! Przepalamy budżet, wyłączcie to natychmiast!"* | Sentinel uruchamia analizę koszykową (Apriori). Wykazuje, że wejścia z tej reklamy kończą się dokupieniem 3 innych produktów (Efekt Halo). Produkt A to Lokomotywa, stratę z jego reklamy w 300% pokrywa zysk z koszyka. | **Cross-Attribution Halo (CAH)** |
| *"Zrobiliście zniżkę 5% na Zestaw by załapać się na Smart. Spadła nam marża na sztuce. Kto za to zapłaci?"* | Sentinel udowadnia twardym prawem popytu (Elastyczność Cenowa), że zrzeczenie się 5% marży wywołało wzrost wolumenu o 48%, co matematycznie wygenerowało np. +12 000 PLN dodatkowej masy marży w miesiącu. | **Price Elasticity Uplift** |
| *"Stworzyliście 50 wirtualnych zestawów. Czy one nie kanibalizują (nie kradną) nam sprzedaży z głównej, pojedynczej oferty?"* | Nexus śledzi wolumen Lokomotywy "solo" vs w Zestawach. Wykres warstwowy pokaże, czy suma urosła (inkrementacja), czy tylko przesunęła się do zestawów (czysta kanibalizacja). | **Cannibalization Rate (CR%)** |

---

## 2. Architektura Widoku "God-Mode Dashboard"

Dashboard będzie podzielony na sekcje zbrojne przeciwko ignorancji:

### Sekcja A: "Wodospad Prawdy" (True Cost Waterfall)
Interaktywny wykres kaskadowy dekonstruujący przychód z wybranego EAN-u / Zestawu:
1. **Przychód Brutto (Cena klienta)**
2. `- VAT (23%)`
3. `- Prowizja Allegro (12%)`
4. `- Koszty Bezpośrednie COGS (Cena w hurtowni)`
5. `- Logistics & Packaging (Karton, taśma, folia, etykieta, BDO)`
6. `- Reklama (Średni koszt kliknięć CPC przypisany do sztuki)`
7. `= ZYSK NETTO NA CZYSTO (True Net Profit)`

### Sekcja B: Tarcza Atrybucyjna (Efekt Halo i iROAS)
Widok z dwiema kolumnami:
* **Zysk Bezpośredni:** Wynik z samego promowanego produktu (często ujemny lub niski).
* **Zysk Asystowany (Halo):** Produkty organiczne dorzucone do koszyka dzięki temu kliknięciu.

### Sekcja C: Ołtarz A/B (Dowód Przyrostu)
Narzędzie do porównywania okresu `Przed Zmianą (np. Tyg. 1-2)` i `Po Zmianie (np. Tyg. 3-4)`. System matematycznie wylicza czy wzrost sprzedaży to trend rynkowy, czy faktycznie efekt podjętej akcji strategicznej przez handlowca (lub agenta AI).

---

## 3. Plan Implementacji Kodowej
1. **Backend (`analytics.service.js`):** Zbudowanie silnika agregującego dane z tabel zamówień i wyliczającego złożone wzory na Incremental ROAS oraz weryfikującego zawartość "sąsiednich" koszyków dla Efektu Halo.
2. **Endpoint API (`/api/analytics/god-mode`):** Dostarczanie zagregowanych, surowych JSON-ów gotowych do wyrenderowania przez wykresy Recharts.
3. **Frontend (`GodModeAnalyticsView.jsx`):** Nowy, oszałamiający wizualnie, w pełni interaktywny dashboard z mrocznym, "wojskowym" designem Nexusa, wyposażony w przyciski pozwalające rozbijać dane na czynniki pierwsze. Zintegrujemy to jako główną zakładkę Nexusa.
