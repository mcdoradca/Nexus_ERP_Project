const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const pdfs = [
    "Kosmetyczne Składy_ Ocena i Trendy 2026.pdf",
    "INCI i ich działanie.pdf"
];

async function dumpPdfs() {
    let combinedText = "BAZA WIEDZY INCI I TRENDY KOSMETYCZNE 2026:\n\n";
    for (const p of pdfs) {
        const fullPath = path.join('z:\\Nexus_ERP_Project\\src\\modules\\offer-optimizer', p);
        if (fs.existsSync(fullPath)) {
            const dataBuffer = fs.readFileSync(fullPath);
            try {
                const data = await pdf(dataBuffer);
                combinedText += `--- DOKUMENT: ${p} ---\n${data.text}\n\n`;
                console.log("Przetworzono: ", p);
            } catch(e) {
                console.error("PDF Parse error: ", e);
            }
        } else {
            console.error("Brak pliku: ", fullPath);
        }
    }
    
    fs.writeFileSync('z:\\Nexus_ERP_Project\\src\\modules\\offer-optimizer\\inci_knowledge.txt', combinedText);
    console.log("Zapisano połączoną bazę do inci_knowledge.txt");
}
dumpPdfs();
