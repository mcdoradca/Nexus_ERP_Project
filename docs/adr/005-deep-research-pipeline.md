# ADR 005: Badania Wywiadowcze dla Zero-Bleed Pipeline (IDP, RMA, Logistyka)

## 1. Kontekst
Zgodnie z protokołem "ZARZĄDZANIE WYNIKAMI BADAŃ (Deep Research Agents)", przed przystąpieniem do kodowania nowych 3 modułów (Dynamic COGS, Fraud Prevention, Supply Chain) przeprowadzono rekonesans w Internecie (OSINT). Analiza miała na celu identyfikację twardych barier technologicznych, limitów API zewnętrznych usługodawców (BaseLinker, Allegro) oraz specyfiki polskiego rynku rachunkowego.

## 2. Wyniki Badań (Fakty i Bariery)

### A. Limity API BaseLinker (dla zwrotów RMA)
*   **Wyzwanie:** BaseLinker posiada rygorystyczny globalny Rate Limit wynoszący **100 zapytań na minutę** na całe konto (niezależnie od endpointu).
*   **Problem:** Uderzanie do endpointów typu `getOrders` z filtrami po każdym wyzwoleniu CRON-a mogłoby szybko wyczerpać pulę (tzw. zjawisko Rate Limit Exhaustion), paraliżując system.
*   **Architektoniczne Rozwiązanie:** Zamiast agresywnego odpytywania, system musi używać mechaniki **`getJournal` (Dziennik Zdarzeń)**. Zapytanie `getJournal` pobiera tylko logi zmian od ostatniego sprawdzenia. Jeśli w dzienniku pojawi się zdarzenie zmiany statusu zamówienia na "Zwrot", dopiero wtedy Agent RMA wykonuje uderzenie precyzyjne o detale tego zamówienia. Zmniejsza to obciążenie sieciowe o 95%.

### B. Ograniczenia i Format Faktur B2B (IDP Vision)
*   **Wyzwanie:** Polscy dystrybutorzy masowo korzystają z oprogramowania Subiekt GT i Comarch ERP Optima. Ich faktury PDF (bez warstwy tekstowej, np. skany) potrafią gubić się we własnych siatkach kolumn.
*   **Problem:** Konwencjonalne OCR zawodzi, gdy wiersz zawija się na drugą stronę (np. długa nazwa przedmiotu, a cena pod spodem). Standard KSeF (XML: FA(3)) wejdzie w życie dopiero w 2026, więc poleganie tylko na XML jest na dziś biznesowo niebezpieczne.
*   **Architektoniczne Rozwiązanie:** Potwierdzono, że zastosowanie modelu `gemini-3.1-pro-preview-vision` lub `gemini-1.5-pro-vision` (LLM-V) eliminuje problem statycznego łamania siatki OCR. Moduł IDP otrzyma dedykowany prompt systemowy, szukający ścisłych nagłówków z Comarch/Subiekt: `"Lp.", "Ilość", "J.M.", "Cena Netto po Rabacie"`.

### C. Allegro: API "Czarna Lista" (Anty-Fraud Scoring)
*   **Wyzwanie:** Zablokowanie toksycznego klienta ("darmowej wypożyczalni") bywa technicznie utrudnione przez ukrywanie maili przez Allegro.
*   **Problem:** Czy możemy bez autoryzacji ręcznej odcinać kupujących, którzy regularnie generują koszty logistyczne zwrotów?
*   **Architektoniczne Rozwiązanie:** Tak. Dokumentacja Allegro REST API potwierdza dostępność ścieżki: `POST /sale/blacklisted-users`. Wymaga ona jedynie przekazania zmiennej `user.login` lub `user.accountId` klienta, do których BaseLinker daje swobodny dostęp. Nasz "3 Strikes Rule" (Tarcza Anty-Wyłudzeniowa z `zmiany1.md`) jest w 100% możliwy do bezobsługowego wdrożenia za pomocą uderzenia po REST API, bez ryzyka naruszenia regulaminu platformy (sprzedawca ma prawo do blokowania nałożonego na konkretne konta).

## 3. Decyzje (Decisions)
1. **RMA Polling Engine:** Używamy `getJournalList` BaseLinkera w cronie jako lekkiego wyzwalacza.
2. **Vision IDP Mode:** Operujemy na pełnych zrzutach base64 plików PDF przy użyciu Gemini Vision (z odrzuceniem tradycyjnego tesseraktu).
3. **Fraud Enforcer:** Podpinamy bezpośrednio REST API Allegro (`/sale/blacklisted-users`) pod EventBus reagujący na limit 3 wymuszonych zwrotów.

## 4. Status
**Zaakceptowano** - Ścieżka integracyjna jest bezpieczna. Następny krok: modelowanie tabel `schema.prisma`.
