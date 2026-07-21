const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../.agents/.ai-memory/NES-opis-8-5.md');

const newContent = `

## Rutyny i Skrypty Testowe (21.07.2026)
W celu weryfikacji zdrowia systemu, wprowadzono zestaw wbudowanych skryptów diagnostycznych w folderze \`scripts/\`:
1. \`test-api-keys.js\` - Weryfikuje łączność ze wszystkimi zewnętrznymi integracjami (Prisma, Supabase, Gemini, Allegro, Claid, Google Meet, SMTP).
2. \`test-ai-agents.js\` - Testuje logikę agentów AI w środowisku izolowanym (m.in. Offer Optimizer, Sentinel) weryfikując poprawność zwracanych formatów JSON (SOT).
3. \`test-modules-e2e.js\` - Testuje zabezpieczenia JWT (kody 401/403) dla kontrolerów w modułach CRM, MDM, Analytics za pomocą symulacji zapytań HTTP.
Testy te należy okresowo uruchamiać lokalnie podczas drastycznych zmian architektury, w celu potwierdzenia że system AI Swarm oraz bramki API są stabilne.
`;

try {
    fs.appendFileSync(filePath, newContent, 'utf8');
    console.log('Dokumentacja została pomyślnie zaktualizowana.');
} catch (err) {
    console.error('Błąd aktualizacji dokumentacji:', err);
}
