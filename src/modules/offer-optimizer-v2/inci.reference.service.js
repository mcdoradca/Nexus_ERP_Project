const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data', 'reference');

let inciNamesMap = null;
let inciFuncsMap = null;

function loadReferences() {
    if (inciNamesMap && inciFuncsMap) return; // Loaded
    
    inciNamesMap = new Map();
    inciFuncsMap = new Map();

    const namesFile = path.join(DATA_DIR, 'INCI_NAMES.json');
    const funcsFile = path.join(DATA_DIR, 'INCI_FUNCTIONS.json');

    if (fs.existsSync(namesFile)) {
        const namesData = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
        for (const item of namesData) {
            inciNamesMap.set(item.canon, item);
        }
    }

    if (fs.existsSync(funcsFile)) {
        const funcsData = JSON.parse(fs.readFileSync(funcsFile, 'utf8'));
        for (const item of funcsData) {
            inciFuncsMap.set(item.canon, item);
        }
    }
}

/**
 * Zwraca informację z INCI_NAMES (Glosariusza) lub null jeśli brak
 */
function getInciNameData(canon) {
    loadReferences();
    return inciNamesMap.get(canon) || null;
}

/**
 * Zwraca informacje z INCI_FUNCTIONS (CosIng) lub null jeśli brak
 */
function getInciFunctionData(canon) {
    loadReferences();
    return inciFuncsMap.get(canon) || null;
}

/**
 * Pomocnicza metoda orkiestratora - czy INCI istnieje w urzędowej bazie?
 */
function isOfficialIngredient(canon) {
    loadReferences();
    return inciNamesMap.has(canon);
}

module.exports = {
    loadReferences,
    getInciNameData,
    getInciFunctionData,
    isOfficialIngredient
};
