const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const path = require('path');

const files = [
  '00_PLAN_REFAKTORYZACJI_v4.md',
  'Agent_0_prompt_v4.md',
  'Agent_10_prompt_v4.md',
  'Agent_1_prompt_v4.md',
  'Agent_2_prompt_v4.md',
  'Agent_4_prompt_v4.md',
  'Agent_5_prompt_v4.md',
  'Agent_6_prompt_v4.md',
  'Agent_7_prompt_v4.md',
  'Agent_8_prompt_v4.md',
  'Agent_9_prompt_v4.md',
  'MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md',
  'PATCH_v4.1_prompty.md',
  'PROMPT_WDROZENIOWY_ANTIGRAVITY.md',
  'RAG_ORCHESTRATION_v4.1.md',
  'SHARED_RULES_v4.1.md',
  'SHARED_RULES_v4.md',
  'knowledge.rag.service.v2.js'
];

console.log('| Plik | Hash historyczny (879b193~1) | Hash obecny (docs/) | ZGODNOŚĆ |');
console.log('|---|---|---|---|');

let allMatch = true;

for (const file of files) {
  try {
    const histBlob = execSync(`git rev-parse 879b193~1:"src/modules/offer-optimizer/files/${file}"`, { encoding: 'utf8' }).trim();
    // To get the hash of the current file as git would see it:
    const currentPath = path.join(__dirname, 'docs', file);
    const currBlob = execSync(`git hash-object "${currentPath}"`, { encoding: 'utf8' }).trim();
    
    const match = histBlob === currBlob ? 'ZGODNY' : 'RÓŻNY';
    if (match !== 'ZGODNY') allMatch = false;
    console.log(`| ${file} | ${histBlob} | ${currBlob} | ${match} |`);
  } catch (err) {
    console.log(`| ${file} | BRAK/BŁĄD | BŁĄD | RÓŻNY |`);
    allMatch = false;
  }
}
if (!allMatch) {
  console.log('\nUWAGA: RÓŻNOŚĆ LUB BRAK WYKRYTY');
}
