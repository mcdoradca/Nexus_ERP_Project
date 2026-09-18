// Auto-extracted module: WasteRegistry
const fs = require('fs');
const path = require('path');

class WasteRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        this.database = JSON.parse(rawData);
        console.log(`[SYS] Załadowano katalog odpadów (Dz.U. 2020 poz. 10).`);
      } catch (e) {
        this.database = {};
      }
    }
  }

  static getCategoryForProduct(textSample = "") {
    if (!this.database || !this.database.categories) return null;
    const lower = (textSample || "").toLowerCase();
    for (const [catKey, catData] of Object.entries(this.database.categories)) {
      if (catData.keywords && catData.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        return catData;
      }
    }
    return this.database.categories["general_chemical"] || null;
  }
}



// ============================================================================
// 3. PARSER DOKUMENTÓW (PDF & RTF z mostkiem Word COM) I DETEKTOR OCR
// ============================================================================


module.exports = { WasteRegistry };
