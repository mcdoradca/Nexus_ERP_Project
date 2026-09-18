// Auto-extracted module: SDSPDFParser
const fs = require('fs');
const path = require('path');

class SDSPDFParser {
  static lastExtractionUsedOcr = false;
  static ocrDiagnosticMessage = null;

  static async extractTextFromPdf(filePath, forceOcr = false) {
    let text = "";
    this.lastExtractionUsedOcr = false;
    this.ocrDiagnosticMessage = null;

    if (!forceOcr && pdfParse) {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        text = data.text.trim();
      } catch (err) { text = ""; }
    }

    // Detekcja skanu (jeśli mało tekstu)
    if (text.length < 150 || forceOcr) {
      this.lastExtractionUsedOcr = true;
      try {
        console.log("[SYS] Aktywacja optycznego rozpoznawania znaków (OCR Tesseract)...");
        const tempDir = path.join(process.cwd(), "temp_ocr_sds");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        
        // Wymaga zainstalowanego poppler-utils i tesseract-ocr w systemie
        execSync(`pdftoppm -jpeg -r 300 "${filePath}" "${path.join(tempDir, 'page')}"`);
        
        const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.jpg')).sort();
        let ocrPages = [];
        for (const file of files) {
           const imgPath = path.join(tempDir, file);
           const outPath = path.join(tempDir, `out_${file}`);
           execSync(`tesseract "${imgPath}" "${outPath}" -l ita+pol+eng --psm 3`);
           ocrPages.push(fs.readFileSync(`${outPath}.txt`, 'utf8'));
        }
        text = ocrPages.join('\n');
        
        // Czyszczenie temp
        fs.rmSync(tempDir, { recursive: true, force: true });
        this.ocrDiagnosticMessage = `Zrekonstruowano ${files.length} stron przez OCR. Sprawdź tabele stężeń.`;
      } catch (ocrErr) {
        this.ocrDiagnosticMessage = `Błąd silnika OCR (wymaga Tesseract/Poppler w systemie OS).`;
        console.error(this.ocrDiagnosticMessage);
      }
    }
    return text;
  }

  static segmentInto16Sections(fullText) {
    const sectionPatterns = {
      section_1: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*1\s*[:\.\-]?\s*(?:IDENTIFICAZIONE|IDENTIFICATION|IDENTYFIKACJA)/i,
      section_2: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*2\s*[:\.\-]?\s*(?:IDENTIFICAZIONE DEI PERICOLI|HAZARDS|IDENTYFIKACJA ZAGROŻEŃ)/i,
      section_3: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*3\s*[:\.\-]?\s*(?:COMPOSIZIONE|COMPOSITION|SKŁAD)/i,
      section_4: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*4\s*[:\.\-]?\s*(?:MISURE DI PRIMO SOCCORSO|FIRST AID|ŚRODKI PIERWSZEJ POMOCY)/i,
      section_5: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*5\s*[:\.\-]?\s*(?:MISURE ANTINCENDIO|FIREFIGHTING|POSTĘPOWANIE W PRZYPADKU POŻARU)/i,
      section_6: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*6\s*[:\.\-]?\s*(?:MISURE IN CASO DI RILASCIO|ACCIDENTAL RELEASE|POSTĘPOWANIE W PRZYPADKU NIEZAMIERZONEGO)/i,
      section_7: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*7\s*[:\.\-]?\s*(?:MANIPOLAZIONE E IMMAGAZZINAMENTO|HANDLING|POSTĘPOWANIE Z SUBSTANCJAMI|MAGAZYNOWANIE)/i,
      section_8: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*8\s*[:\.\-]?\s*(?:CONTROLLI DELL.ESPOSIZIONE|EXPOSURE|KONTROLA NARAŻENIA)/i,
      section_9: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*9\s*[:\.\-]?\s*(?:PROPRIET[AÀ] FISICHE E CHIMICHE|PHYSICAL|WŁAŚCIWOŚCI FIZYCZNE)/i,
      section_10: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*10\s*[:\.\-]?\s*(?:STABILIT[AÀ] E REATTIVIT[AÀ]|STABILITY|STABILNOŚĆ)/i,
      section_11: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*11\s*[:\.\-]?\s*(?:INFORMAZIONI TOSSICOLOGICHE|TOXICOLOGICAL|INFORMACJE TOKSYKOLOGICZNE)/i,
      section_12: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*12\s*[:\.\-]?\s*(?:INFORMAZIONI ECOLOGICHE|ECOLOGICAL|INFORMACJE EKOLOGICZNE)/i,
      section_13: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*13\s*[:\.\-]?\s*(?:CONSIDERAZIONI SULLO SMALTIMENTO|DISPOSAL|POSTĘPOWANIE Z ODPADAMI)/i,
      section_14: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*14\s*[:\.\-]?\s*(?:INFORMAZIONI SUL TRASPORTO|TRANSPORT|INFORMACJE DOTYCZĄCE TRANSPORTU)/i,
      section_15: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*15\s*[:\.\-]?\s*(?:INFORMAZIONI SULLA REGOLAMENTAZIONE|REGULATORY|INFORMACJE DOTYCZĄCE PRZEPISÓW)/i,
      section_16: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*16\s*[:\.\-]?\s*(?:ALTRE INFORMAZIONI|OTHER INFORMATION|INNE INFORMACJE)/i
    };

    let positions = [];
    for (const [key, regex] of Object.entries(sectionPatterns)) {
      const match = regex.exec(fullText);
      if (match) positions.push({ key, index: match.index });
    }
    positions.sort((a, b) => a.index - b.index);

    let sections = {};
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].index;
      const end = (i + 1 < positions.length) ? positions[i + 1].index : fullText.length;
      sections[positions[i].key] = fullText.substring(start, end).trim();
    }
    for (let i = 1; i <= 16; i++) {
      if (!sections[`section_${i}`]) sections[`section_${i}`] = `Brak danych dla Sekcji ${i} w pliku źródłowym.`;
    }
    return sections;
  }
}

// ============================================================================
// 4. EKSTRAKTOR CHEMICZNY
// ============================================================================

module.exports = { SDSPDFParser };
