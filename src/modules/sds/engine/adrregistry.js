// Auto-extracted module: ADRRegistry
const fs = require('fs');
const path = require('path');

class ADRRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const list = JSON.parse(rawData);
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (item.un_number) {
              this.database[String(item.un_number).trim()] = item;
            }
          });
        }
        console.log(`[SYS] Załadowano rejestr ADR: ${Object.keys(this.database).length} pozycji.`);
      } catch (e) {
        this.database = {};
      }
    }
  }

  static getEntry(unNumber) {
    if (!unNumber) return null;
    const cleanUn = String(unNumber).replace(/^UN\s*/i, '').trim();
    return this.database[cleanUn] || null;
  }
}


module.exports = { ADRRegistry };
