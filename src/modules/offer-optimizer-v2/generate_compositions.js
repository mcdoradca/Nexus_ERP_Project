const fs = require('fs');

function randomRange(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

const comps = [];

// Helper to add composition
function add(label, hA, pT, pB, pL, pR) {
  comps.push(`  { pT: ${pT.toFixed(2)}, pB: ${pB.toFixed(2)}, pL: ${pL.toFixed(2)}, pR: ${pR.toFixed(2)}, hA: '${hA}', vA: 'bottom', label: '${label}' }`);
}

// 1. HUGE (20 items)
for (let i = 0; i < 7; i++) add('HUGE_CENTER', 'center', randomRange(0.02, 0.08), randomRange(0.02, 0.08), randomRange(0.05, 0.15), randomRange(0.05, 0.15));
for (let i = 0; i < 7; i++) add('HUGE_LEFT', 'left', randomRange(0.02, 0.08), randomRange(0.02, 0.08), randomRange(0.02, 0.10), randomRange(0.25, 0.40));
for (let i = 0; i < 6; i++) add('HUGE_RIGHT', 'right', randomRange(0.02, 0.08), randomRange(0.02, 0.08), randomRange(0.25, 0.40), randomRange(0.02, 0.10));

// 2. BIG (20 items)
for (let i = 0; i < 7; i++) add('BIG_CENTER', 'center', randomRange(0.08, 0.12), randomRange(0.05, 0.10), randomRange(0.10, 0.20), randomRange(0.10, 0.20));
for (let i = 0; i < 7; i++) add('BIG_LEFT', 'left', randomRange(0.08, 0.12), randomRange(0.05, 0.10), randomRange(0.05, 0.15), randomRange(0.25, 0.45));
for (let i = 0; i < 6; i++) add('BIG_RIGHT', 'right', randomRange(0.08, 0.12), randomRange(0.05, 0.10), randomRange(0.25, 0.45), randomRange(0.05, 0.15));

// 3. MID (20 items)
for (let i = 0; i < 7; i++) add('MID_CENTER', 'center', randomRange(0.12, 0.20), randomRange(0.08, 0.15), randomRange(0.15, 0.25), randomRange(0.15, 0.25));
for (let i = 0; i < 7; i++) add('MID_LEFT', 'left', randomRange(0.12, 0.20), randomRange(0.08, 0.15), randomRange(0.08, 0.20), randomRange(0.30, 0.50));
for (let i = 0; i < 6; i++) add('MID_RIGHT', 'right', randomRange(0.12, 0.20), randomRange(0.08, 0.15), randomRange(0.30, 0.50), randomRange(0.08, 0.20));

// 4. FAR (20 items)
for (let i = 0; i < 7; i++) add('FAR_CENTER', 'center', randomRange(0.20, 0.35), randomRange(0.15, 0.25), randomRange(0.20, 0.35), randomRange(0.20, 0.35));
for (let i = 0; i < 7; i++) add('FAR_LEFT', 'left', randomRange(0.20, 0.35), randomRange(0.15, 0.25), randomRange(0.10, 0.25), randomRange(0.40, 0.55));
for (let i = 0; i < 6; i++) add('FAR_RIGHT', 'right', randomRange(0.20, 0.35), randomRange(0.15, 0.25), randomRange(0.40, 0.55), randomRange(0.10, 0.25));

// 5. EDGE (10 items)
for (let i = 0; i < 5; i++) add('EDGE_LEFT', 'left', randomRange(0.10, 0.25), randomRange(0.05, 0.15), randomRange(0.02, 0.08), randomRange(0.45, 0.60));
for (let i = 0; i < 5; i++) add('EDGE_RIGHT', 'right', randomRange(0.10, 0.25), randomRange(0.05, 0.15), randomRange(0.45, 0.60), randomRange(0.02, 0.08));

// 6. HIGH_HORIZON (10 items)
for (let i = 0; i < 4; i++) add('HIGH_HORIZON_CENTER', 'center', randomRange(0.02, 0.10), randomRange(0.25, 0.45), randomRange(0.15, 0.30), randomRange(0.15, 0.30));
for (let i = 0; i < 3; i++) add('HIGH_HORIZON_LEFT', 'left', randomRange(0.02, 0.10), randomRange(0.25, 0.45), randomRange(0.05, 0.20), randomRange(0.35, 0.50));
for (let i = 0; i < 3; i++) add('HIGH_HORIZON_RIGHT', 'right', randomRange(0.02, 0.10), randomRange(0.25, 0.45), randomRange(0.35, 0.50), randomRange(0.05, 0.20));

let content = `const COMPOSITIONS = [\n${comps.join(',\n')}\n];`;
fs.writeFileSync('compositions.txt', content);
console.log('Wygenerowano 100 kompozycji!');
