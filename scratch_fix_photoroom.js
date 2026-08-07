const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'modules', 'offer-optimizer-v2', 'photoroom.service.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Clamp paddingLeft and paddingRight
content = content.replace(/pL:\s*(0\.\d+)/g, (match, p1) => {
    let val = parseFloat(p1);
    if (val > 0.49) return 'pL: 0.49';
    return match;
});
content = content.replace(/pR:\s*(0\.\d+)/g, (match, p1) => {
    let val = parseFloat(p1);
    if (val > 0.49) return 'pR: 0.49';
    return match;
});
// Także paddingTop i paddingBottom tak na wszelki wypadek
content = content.replace(/pT:\s*(0\.\d+)/g, (match, p1) => {
    let val = parseFloat(p1);
    if (val > 0.49) return 'pT: 0.49';
    return match;
});
content = content.replace(/pB:\s*(0\.\d+)/g, (match, p1) => {
    let val = parseFloat(p1);
    if (val > 0.49) return 'pB: 0.49';
    return match;
});

// 2. Disable beautify.mode and lighting.mode
content = content.replace(/'beautify\.mode', 'ai\.auto'/g, "'beautify.mode', 'none'");
content = content.replace(/'lighting\.mode', 'ai\.auto'/g, "'lighting.mode', 'none'");

// 3. Update negative prompt (usuwamy no text, no logos)
content = content.replace(/`no people, no text, no logos.`/g, "`no people.`");

fs.writeFileSync(filePath, content, 'utf8');
console.log("Fixed photoroom.service.js");
