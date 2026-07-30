const fs = require('fs');
const path = require('path');

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                scanDir(fullPath);
            }
        } else if (file.endsWith('.js') || file.endsWith('.md') || file === 'schema.prisma') {
            const buf = fs.readFileSync(fullPath);
            const str = buf.toString('utf8');
            
            let issues = [];
            if (str.includes('\uFFFD')) {
                issues.push('Znak U+FFFD () znaleziony!');
                const lines = str.split('\n');
                lines.forEach((l, i) => {
                    if (l.includes('\uFFFD')) {
                        console.log(`${fullPath}:${i+1} -> ${l.trim()}`);
                    }
                });
            }
            
            // Typical CP1250 / CP852 corruption of Polish letters:
            // ą -> ± (B1), æ (E6), a (61)
            // ć -> æ (E6), ç (E7)
            // ę -> ê (EA)
            // ł -> ³ (B3)
            // ń -> ñ (F1)
            // ó -> ó (F3) - ok, but sometimes others
            // ś -> œ (9C)
            // ż -> ¿ (BF)
            // ź -> Ÿ (9F)
            
            // W instrukcji jest "ą, ę, ł→B, ń→D, ż→|, ź→{, ó→"
            const cp1250Regex = /([B\|{D])/; // to be careful
            
            if (issues.length > 0) {
                console.log(`[UWAGA] ${fullPath}: ${issues.join(', ')}`);
            }
        }
    }
}

scanDir(path.join(__dirname, 'src/modules/offer-optimizer-v2'));
scanDir(path.join(__dirname, 'prisma'));
