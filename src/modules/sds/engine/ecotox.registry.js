// Auto-extracted module: EcotoxRegistry
const fs = require('fs');
const path = require('path');

class EcotoxRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        this.database = JSON.parse(rawData);
        console.log(`[SYS] Załadowano bufor ekotoksykologiczny: ${Object.keys(this.database).length} pozycji.`);
      } catch (e) {
        this.database = {};
      }
    }
  }

  static getEntry(casNumber) {
    return this.database[casNumber] || null;
  }
}


module.exports = { EcotoxRegistry };
