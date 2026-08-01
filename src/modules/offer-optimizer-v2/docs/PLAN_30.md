# [PLAN DZIAŁANIA] - Zadanie 30

1. **Logika wyjścia (resolveHitl)**: W `orchestrator.js` utworzona zostanie nowa metoda `resolveHitl`, zapisująca obiekty w stałym `hitl_log` i wymuszająca uzasadnienie od operatora. Działania: `ACCEPT_AND_CONTINUE` zniesie alert i ustali `next_action` (pozwalając procesowi iść w dół), a `REJECT_AND_HALT` zakotwiczy status na zatrzymaniu. 

2. **Korekta błędu i walidatory (P1 & A4)**: Naprawiony zostanie filtr domen P1 poprzez zgłaszanie statusu `P1_CHECK_IMPOSSIBLE` w przypadku braku odczytanej nazwy marki, bez uszkadzania prawidłowych adresów. Z wyjścia A4 zostanie wpięte trio walidatorów (HTML, Stop-Words, Medical Claims), by gwarantować zrzucanie do HITL z tagiem `A4_OUTPUT_REJECTED`, blokując w potoku zwroty urojone lub niebezpieczne.

3. **Przebiegi na żywo i środowisko asercji (Raport)**: Po usunięciu bypassu, Agenty przejdą autoryzowane trzy-krotne wykonanie *live* na produkcie testowym, aby zebrać dane powtarzalności dla Architekta do `RAPORT_30.md`. Dopisane zostaną asercje dla weryfikacji braku notatki, wycieku walidatorów A4 oraz P1 bez marki, by po pomyślnym wykonaniu `npm test` zdać raport wg precyzyjnie wymaganego szablonu.
