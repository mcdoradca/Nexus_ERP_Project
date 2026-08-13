$file = "z:\Nexus_ERP_Project\.agents\.ai-memory.md"
$content = @"

### AKTUALIZACJA PROMPT MASTER V2 - Photoroom (2026-08-10)
- **Plik:** src/modules/offer-optimizer-v2/prompt-master.service.js
- **Opis zmiany:** Usunięto parametr '8k'. Dodano twardy zakaz umieszczania produktu na środku kadru (wymóg asymetrycznej kompozycji - off-center). Zakaz dodano do instrukcji LLM oraz MANDATORY_PREFIX.
"@
[IO.File]::AppendAllText($file, $content, [System.Text.Encoding]::UTF8)
