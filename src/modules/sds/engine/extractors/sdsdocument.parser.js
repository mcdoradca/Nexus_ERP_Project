// Auto-extracted module: SDSDocumentParser
const fs = require('fs');
const path = require('path');

class SDSDocumentParser {
  static isRtfFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    if (filePath.toLowerCase().endsWith('.rtf')) return true;
    try {
      const header = fs.readFileSync(filePath, { encoding: 'binary', flag: 'r' }).slice(0, 5);
      return header.startsWith('{\\rtf');
    } catch (e) {
      return false;
    }
  }

  static isDocxFile(filePath) {
    return SDSDocxParser.isDocxFile(filePath);
  }

  static async extractText(filePath, forceOcr = false) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`[DocumentParser] Plik nie istnieje: ${filePath}`);
    }

    const isDocx = this.isDocxFile(filePath);
    if (isDocx) {
      console.log(`[DocumentParser] Wykryto plik DOCX. Ekstrakcja za pomocą natywnego silnika SDSDocxParser...`);
      return await SDSDocxParser.extractText(filePath);
    }

    const isRtf = this.isRtfFile(filePath);

    if (isRtf) {
      // 1. Sprawdź opcjonalny mostek Word COM (wyłącznie Windows) z pełną osłoną try-catch
      if (process.platform === 'win32') {
        let convertedPdf = null;
        try {
          console.log(`[DocumentParser] Wykryto plik RTF (Windows). Próba konwersji przez Word COM...`);
          convertedPdf = await SDSRtfConverter.convertToPdf(filePath);
          const text = await SDSPDFParser.extractTextFromPdf(convertedPdf, forceOcr);
          if (text && text.trim().length > 100) {
            return text;
          }
        } catch (comErr) {
          console.warn(`[DocumentParser] Word COM niedostępny (${comErr.message}). Przełączanie na natywny silnik SDSRTFParser...`);
        } finally {
          if (convertedPdf && fs.existsSync(convertedPdf)) {
            try { fs.unlinkSync(convertedPdf); } catch (e) {}
          }
        }
      }

      // 2. Niezawodny natywny silnik JavaScript SDSRTFParser (Linux VPS / OVH / Docker / Fallback)
      console.log(`[DocumentParser] Ekstrakcja RTF za pomocą natywnego silnika SDSRTFParser...`);
      return await SDSRTFParser.extractTextFromRtf(filePath);
    } else {
      return await SDSPDFParser.extractTextFromPdf(filePath, forceOcr);
    }
  }
}


module.exports = { SDSDocumentParser };
