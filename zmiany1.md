# 🛑 PLAN ARCHITEKTURY BIZNESOWEJ: NEXUS "ZERO-BLEED" PIPELINE 

Ten dokument stanowi kompleksowy potok projektowy dla 3 nowych modułów klasy Enterprise. Zgodnie z doktryną Antigravity, rozbijamy procesy monolityczne na wyspecjalizowanych Agentów, łącząc je szyną zdarzeniową (EventBus) i budując dla nich absolutne fundamenty w bazie danych.

Cel pipeline'u: **Cisza Operacyjna i 100% Retencja Marży**.

---

## 1. FUNDAMENTY (Wymagania brzegowe przed startem)
Zanim ożywimy jakiegokolwiek Agenta dla nowych modułów, musimy wdrożyć "ziemię" pod ich działania.

1. **Ewolucja `schema.prisma` (Fundament Logistyczny):**
   - Produkt w PIM musi otrzymać nowe pola: `leadTimeDays` (czas dostawy od producenta w dniach), `riskScore` (wskaźnik awaryjności), `supplierId` (relacja do nowego modelu Dostawcy).
   - Nowy model: `ReturnRecord` (Rejestr Zwrotów RMA) oraz `Supplier` (Baza B2B w CRM).
2. **Konektory API:**
   - Wdrożenie endpointów do pobierania Zwrotów bezpośrednio z API BaseLinker (`getReturnOrders`).

---

## 2. MODUŁ I: NEXUS IDP & COGS SYNCHRONIZER (Dynamiczny Koszt Zakupu)
*Zasada działania: Likwidacja ręcznego przepisywania faktur i urealnienie kosztów bazowych do analityki.*

### Agenci Operacyjni:
- 🤖 **Agent Ekstraktor Wizyjny (Vision IDP):** Operuje na najwyższym dostępnym modelu multimodalnym (`gemini-3.1-pro-preview-vision` lub `gemini-1.5-pro-vision`), który najlepiej radzi sobie z gęstymi, niestandardowymi tabelami PDF (np. zestawienia od hurtowni).

### Pipeline (Przepływ):
1. **Wyzwalacz (Trigger - UI Upload):** Administrator wgrywa plik PDF przez dedykowany interfejs UI (okno wyboru pliku / drag-and-drop). Gwarantuje to pełną kontrolę nad tym, jakie dokumenty wprowadzają dane finansowe do systemu.
2. **Praca Agenta:** Agent Wizyjny skanuje fakturę, poszukując 3 kluczy: `EAN / Kod Producenta`, `Ilość`, `Cena Netto po Rabacie`.
3. **Tarcza Błędów (Human-in-the-loop):** Agent nie nadpisuje bazy w ciemno. Zwraca JSON z "Poziomem Pewności". Jeśli pewność jest poniżej 98%, proces zatrzymuje się, a na tablicy Kanban ląduje zadanie "Faktura X: Wymagana weryfikacja dopasowania EAN".
4. **Egzekucja:** Ciche zaktualizowanie ceny bazowej (`basePrice`) w PIM.
5. **Szyna (EventBus):** Emisja `COGS_UPDATED` -> powoduje automatyczne przeliczenie zysków w `analytics.service.js`.

---

## 3. MODUŁ II: NEXUS RMA & QUALITY ASSURANCE (Strażnik Marży)
*Zasada działania: Powstrzymanie palenia pieniędzy na Adsach dla produktów, które masowo wracają do magazynu.*

### Agenci Operacyjni:
- 🤖 **Agent Sentymentu (CX Analyst):** Chłodny analityk tekstu. Model o zerowej temperaturze (0.0).

### Pipeline (Przepływ):
1. **Wyzwalacz (Cron):** Co 6 godzin `AsyncTaskQueue` odpytuje BaseLinkera o statusy zamówień oznaczonych jako ZWROT.
2. **Praca Agenta:** Agent czyta powód zwrotu wypisany przez klienta w formularzu Allegro (np. "Chiński plastik śmierdzi", "Nie działa zasilacz"). Agent klasyfikuje tekst na twarde tagi m.in.: `#niska_jakosc`, `#niezgodne_z_opisem`, `#uszkodzenie_transport`.
3. **Logika Defensywna:** Za każdy tag krytyczny `#niska_jakosc`, system podbija wskaźnik `riskScore` w bazie PIM.
4. **Zapadnia Architektoniczna (Execution):** Gdy `riskScore` przebije limit (np. 15% zwrotów jakościowych z ostatnich 100 transakcji), EventBus emituje `PRODUCT_RISK_CRITICAL`. 
5. **Reakcja Serwera:** Moduł Optymalizatora Ofert **NATYCHMIAST** obcina stawki CPC dla tego produktu do absolutnego minimum. Czekamy na decyzję człowieka.
### Sub-Moduł: NEXUS FRAUD PREVENTION (Tarcza Anty-Wyłudzeniowa i Scoring Klienta)
*Rozwinięcie ochrony przed zjawiskiem "darmowych wypożyczalni" i toksycznymi konsumentami.*

- 🤖 **Agent Audytor Ryzyka Konsumenckiego (Fraud Agent):** Prowadzi twardą analitykę behawioralną w tle, zasilając globalną listę ryzyka.

### Pipeline Anty-Fraudowy (Przepływ):
1. **Zapis Danych Konsumenckich:** Każdy zwrot wpadający z BaseLinkera inicjuje zapis danych kupującego (login Allegro, maskowany e-mail) oraz powodu zwrotu do nowej relacyjnej tabeli `CustomerRiskProfile` w bazie `schema.prisma`. 
2. **Budowa Scoringu (Data Mining):** Moduł agreguje dane z 3 płaszczyzn: *Które produkty najczęściej wracają? Z jakich powodów? Którzy klienci je zwracają?* Pozwala to precyzyjnie odciąć rzeczywiste wady fabryczne od wyłudzeń konsumenckich.
3. **Zapadnia Obronna (3 Strikes Rule):** Jeśli Agent Fraud wykryje, że dany login przekracza limit (np. 3 zwroty w ciągu 365 dni), uruchamia protokół ochrony.
4. **Egzekucja (Alert & Ban):** 
   - W systemie (UI/Kanban) pojawia się Czerwona Flaga z prośbą do operatora o ewentualne ręczne odrzucenie zwrotu (zablokowanie zwrotu środków).
   - Agent generuje solidny, uargumentowany draft wiadomości zgłaszającej wyłudzenie do supportu Allegro.
   - *Opcja Automatyzacji (God-Tier):* Poprzez API Allegro (`/sale/blacklisted-users`), Nexus automatycznie dopisuje login użytkownika do "Czarnej Listy Kupujących", definitywnie blokując mu możliwość dokonania u Ciebie kolejnych zakupów.

---

## 4. MODUŁ III: WIRTUALNY LOGISTYK & SUPPLY CHAIN
*Zasada działania: Zamawianie towaru, zanim skończy się na magazynie, połączone z twardą negocjacją z dostawcą.*

### Agenci Operacyjni:
- 🤖 **Agent Zaopatrzeniowiec (Supply Chain Analyst):** Operuje w tle, liczy twardą matematykę.
- 🤖 **Agent Negocjator B2B (Copywriter):** Generuje merytoryczne i bezkompromisowe wiadomości biznesowe.

### Pipeline (Przepływ):
1. **Wyzwalacz (Cron 04:00 rano):** Agent Zaopatrzeniowiec analizuje każdy EAN. Oblicza *Burn Rate* (ile sztuk sprzedaje się dziennie) vs *Lead Time* (ile dni jedzie towar od producenta).
2. **Detekcja Luki:** Jeśli wynik algorytmu mówi: "Zapas skończy się za 18 dni, a towar jedzie z hurtowni 14 dni" -> uruchamia alert "Action Required". Wylicza też docelowe zamówienie uwzględniające Safety Stock.
3. **Praca Agenta Negocjatora:** Biorąc pod uwagę fakt, że to nasze kolejne zamówienie w miesiącu, generuje draft wiadomości e-mail / PDF dla hurtowni, chłodno prosząc o wycenę zamówienia i wplecenie prośby o rabat wolumenowy z racji dużego obrotu.
4. **Tarcza Błędów (Human-in-the-loop):** Żadne zamówienie nie wychodzi do dostawcy bez kliknięcia człowieka. Draft ląduje na tablicy Kanban jako karta z załączonym plikiem PDF i guzikiem "Wyślij do Dostawcy X".

---

## 5. ZARZĄDZANIE WYNIKAMI BADAŃ (Deep Research Agents)
Przed napisaniem jakiejkolwiek linijki kodu w obszarach integracji OCR czy API Allegro / BaseLinker (dla zwrotów), wyznaczymy osobnego **Agenta Architekta**, którego zadaniem będzie uruchomienie narzędzia `gatherProductIntelligence / Google Search` by:
1. Sprawdzić limity API BaseLinker dotyczące zapytań o ZWROTY.
2. Zestawić formaty faktur najczęstszych dostawców na rynku polskim.
3. Rozpoznać polityki RMA Allegro. 
Dopiero nałożenie tych twardych faktów na plan pozwoli mi uruchomić edytory kodu.

**Gotowość operacyjna:** Architektura zaprojektowana w oparciu o zasadę Separation of Concerns i wymóg defensywnych "tarcz". Każdy AI Agent wykonuje 1 zadanie, a człowiek akceptuje strategiczne kroki (Kanban).
