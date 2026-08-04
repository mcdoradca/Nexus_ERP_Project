const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../.agents/.ai-memory.md');
const log = `\n### 2026-08-04: Dodano funkcję usuwania pracowników (Kadra Pracownicza)\n- Zaimplementowano bezpieczne miękkie usuwanie (soft-delete) po stronie bazy Prisma, aby chronić historię przypisanych zadań i komentarzy.\n- Na backendzie dodano endpoint \`DELETE /api/users/:id\` reagujący na status \`isActive: false\`.\n- Na frontendzie dodano przycisk kosza obok edycji z monitem potwierdzającym. Wykorzystano optimistic UI update do wycięcia użytkownika ze stanu z widoku \`AdminPanelView\`.\n`;
fs.appendFileSync(file, log, 'utf8');
console.log("Memory appended successfully.");
