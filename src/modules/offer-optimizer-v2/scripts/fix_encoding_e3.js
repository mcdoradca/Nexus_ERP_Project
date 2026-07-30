const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const files = ['DECISION_LOG.md', 'RAPORT_E3_FIX2.md', 'RAPORT_E3_FIX3.md', 'INSTRUKCJA_E3_FIX3.md', 'INSTRUKCJA_E3_FIX4.md'];

for (const file of files) {
    const filePath = path.join(docsDir, file);
    if (!fs.existsSync(filePath)) continue;
    
    const buffer = fs.readFileSync(filePath);
    const nullIndex = buffer.indexOf(0);
    
    if (nullIndex !== -1) {
        console.log(`Fixing encoding for ${file}`);
        
        // Find the start of the UTF-16 payload. It's usually aligned to 2 bytes, 
        // but if it was appended after an odd length of UTF-8, it might be misaligned.
        // Let's find the first FF FE or FE FF, or just assume the null byte tells us where the 16-bit chars start.
        // Usually, the appended UTF-16 starts with BOM FF FE. Let's look for it near nullIndex.
        
        let startUtf16 = buffer.indexOf(Buffer.from([0xFF, 0xFE]));
        if (startUtf16 === -1) {
           // Maybe no BOM. Let's just find where nulls start appearing frequently.
           startUtf16 = nullIndex - 1; // e.g. char followed by 00
           if (startUtf16 < 0) startUtf16 = 0;
        }
        
        const part1 = buffer.slice(0, startUtf16).toString('utf8');
        const part2 = buffer.slice(startUtf16);
        
        // Remove BOM from part2 if present
        let utf16Str = part2.toString('utf16le');
        if (utf16Str.charCodeAt(0) === 0xFEFF) {
            utf16Str = utf16Str.substring(1);
        }
        
        const finalContent = part1 + utf16Str;
        fs.writeFileSync(filePath, finalContent, 'utf8');
    }
}
