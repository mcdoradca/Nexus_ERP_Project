const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const pdfs = [
    "Optymalizacja Kart Kontentowych Allegro.pdf",
    "Regulamin Allegro.pdf",
    "Webinar_Allegro_pdf (1).pdf",
    "Wytyczne AI_ Opisy Produktów 2026.pdf"
];

async function dumpPdfs() {
    for (const p of pdfs) {
        const fullPath = path.join('z:\\Nexus_ERP_Project\\src\\modules\\offer-optimizer', p);
        if (fs.existsSync(fullPath)) {
            const dataBuffer = fs.readFileSync(fullPath);
            try {
                const data = await pdf(dataBuffer);
                fs.writeFileSync(`z:\\Nexus_ERP_Project\\scripts\\dump_${p.replace(/[^a-zA-Z0-9]/g, '_')}.txt`, data.text);
                console.log("Dodano wykop: ", p);
            } catch(e) {
                console.error("PDF Parse error: ", e);
            }
        } else {
            console.error("Brak pliku: ", fullPath);
        }
    }
}
dumpPdfs();
