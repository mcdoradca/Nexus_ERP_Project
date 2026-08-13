$file = "z:\Nexus_ERP_Project\.agents\.ai-memory.md"
$content = @"

### AKTUALIZACJA SEKCJI 7 (FRONTEND) (2026-08-10)
- **Plik:** frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx
- **Opis zmiany:** Zmieniono domyślny tekst w sekcji reklamowej (Sekcja 7). Słowo "gwarantuje" zostało podmienione na "umożliwia" w sformułowaniu "co umożliwia natychmiastową wysyłkę".
"@
[IO.File]::AppendAllText($file, $content, [System.Text.Encoding]::UTF8)
