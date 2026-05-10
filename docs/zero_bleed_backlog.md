# Backlog i Notatki Rozwojowe: Zero-Bleed Pipeline

## Obecny Stan Wdrożenia (Na dzień: 10.05.2026)
Wdrożyliśmy rdzeń architektury Zero-Bleed, w skład której wchodzą 3 autonomiczne moduły:
1. **Agent IDP (Multimodal Vision):** Czyta faktury przez Gemini Vision, odrzuca nieczytelne pozycje (Tarcza: Human-in-the-loop)
2. **Agent RMA Fraud:** Monitoruje BaseLinkera, identyfikuje klientów nadużywających zwrotów i blokuje ich na API Allegro po 3 próbach (3 Strikes).
3. **Agent Zaopatrzeniowiec B2B:** Śledzi stany magazynowe i "Burn Rate", a gdy zapasy zbliżają się do Lead Time, przygotowuje szkic maila (Draft) z zamówieniem, prosząc człowieka o zatwierdzenie.
4. **UI (Zero-Bleed Hub):** Wizualne centrum dowodzenia integrujące Czarną Listę RMA oraz Wirtualnego Zaopatrzeniowca B2B w jednym chowanym panelu.

## Wnioski i Przemyślenia z fazy projektowej (Do wdrożenia po testach polowych)
*   **Wąskie gardło API BaseLinkera:** Obecnie RMA używa `getReturnJournalList` pobierając deltę (optymalizacja limitów). Podczas testów z dużą ilością logów musimy obserwować Rate Limiting. W razie potrzeby należy zintegrować mechanizm Exponential Backoff.
*   **IDP Confidence Score:** Zastosowany próg `0.98` może okazać się zbyt rygorystyczny przy mocno wymiętych fakturach z hurtowni. Jeżeli na Tablicy Kanban będzie pojawiać się za dużo zapytań weryfikacyjnych, rozważymy obniżenie progu do `0.92`.
*   **Logistyka B2B - Automatyzacja Mailowa:** Aktualnie Agent przygotowuje szkice maili na Kanban. W przyszłości, jeśli odzyskamy 100% zaufania do modelu po miesięcznym okresie próbnym, możemy całkowicie wyłączyć flagę "Draft" i zezwolić Agentowi na autoryzację wysyłki via SMTP bez nadzoru (dla zaufanych dostawców "Whitelist").
*   **Moduł Dostaw (UI):** Pomyśleć nad podpięciem wykresu "Wypalania Zapasów" (Burn Rate Graph) obok widoku dostawcy, żeby od razu widzieć dynamikę spadku sztuk.

## Następne kroki po testach:
- Przeprowadzenie analizy błędów z logów serwera dotyczących IDP.
- Audyt skuteczności "Czarnej Listy" po zablokowaniu pierwszych 5 realnych oszustów.
- Ewentualne dostrojenie pętli czasowej Crona (aktualnie co 5 minut).
