$file = "z:\Nexus_ERP_Project\.agents\.ai-memory.md"
$content = @"

### AKTUALIZACJA ARCHITEKTURY - PROAKTYWNE ODŚWIEŻANIE TOKENÓW (2026-08-10)
- **Pliki:** src/core/cron.js, src/modules/offer-optimizer/allegro.service.js
- **Opis zmiany:** Zaprojektowano i wdrożono zautomatyzowany mechanizm proaktywnego odświeżania tokenów API Allegro. Aby zlikwidować błąd "invalid_grant" spowodowany wyścigiem (Race Condition) na ułamki sekund przed wygaśnięciem 12-godzinnego tokenu, dodano zadanie CRON (uruchamiane co 8 godzin). Funkcja getAllegroToken zyskała flagę `forceRefresh`, która pozwala zignorować cache bazy i siłowo odświeżyć token asynchronicznie.
"@
[IO.File]::AppendAllText($file, $content, [System.Text.Encoding]::UTF8)
