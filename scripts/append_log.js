const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../.agents/.ai-memory.md');
const log = `\n### 2026-08-04: Rozbudowa integracji z BaseLinkerem (Unified Product Pipeline)\n- Dodano metodę \`fetchProductIdByEanAndSku\` w \`baselinker.service.js\`, umożliwiającą namierzenie produktu używając podwójnej weryfikacji (EAN + SKU).\n- Wystawiono nowy endpoint \`GET /api/products/baselinker-id\`.\n- Na froncie w komponencie \`UnifiedProductPipelineView\` zaktualizowano grid formularza i dodano przycisk "Pobierz ID", by obsłużyć to w jednym wierszu z Nazwą i SKU.\n`;
fs.appendFileSync(file, log, 'utf8');
console.log("Memory appended successfully.");
