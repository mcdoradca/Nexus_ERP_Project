/**
 * Normalizuje nazwę składnika (INCI) do spójnego formatu używanego w entryName.
 * Funkcja idempotentna. Używana podczas ingestu oraz w lookupie GATE-3.
 */
function normalizeIngredientName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/[\(\)\[\]]/g, '') // Usuwa nawiasy
        .replace(/-/g, ' ')         // Zamienia myślniki na spacje
        .replace(/\s+/g, ' ')       // Redukcja wielokrotnych spacji do jednej
        .trim();
}

/**
 * Wyciąga listę nazw z danego chunku markdown.
 * 
 * @param {string} chunk - Tekst chunku
 * @param {string} sotModule - Z którego pliku/modułu pochodzi chunk
 * @returns {string[]} Tablica unikalnych i znormalizowanych nazw
 */
function extractIngredientsFromChunk(chunk, sotModule) {
    let aliases = [];

    if (sotModule === 'SOT_06') {
        // SOT_06: Grupy, nazwy w backtickach. Np. `Benzoyl Peroxide`
        const regex = /`([^`]+)`/g;
        let match;
        while ((match = regex.exec(chunk)) !== null) {
            aliases.push(match[1]);
        }
    } else if (sotModule === 'INCI_DICT') {
        // INCI_DICT: Np. "1. **Benzoyl Peroxide (Nadtlenek benzoilu)**"
        const firstLine = chunk.split('\n')[0];
        const match = firstLine.match(/\*\*(.+?)\*\*/);
        if (match) {
            const content = match[1];
            // Oddzielenie części w nawiasach jeśli występuje
            const parenMatch = content.match(/^(.*?)\s*\((.*?)\)$/);
            if (parenMatch) {
                aliases.push(parenMatch[1]);
                aliases.push(parenMatch[2]);
            } else {
                aliases.push(content);
            }
        }
    } else if (sotModule === 'SOT_10' || sotModule === 'SOT_07' || sotModule === 'SOT_05') {
        // SOT_10 / 07 / 05: Pierwsza linia to często nazwy oddzielone "/"
        const firstLine = chunk.split('\n')[0];
        // Wyciągamy wszystko z pierwszego zdania przed ew. nawiasem lub traktujemy nawias jako alias
        const parts = firstLine.split('/');
        for (let p of parts) {
            const trimmed = p.trim();
            const parenMatch = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
            if (parenMatch) {
                aliases.push(parenMatch[1]);
                aliases.push(parenMatch[2]);
            } else {
                aliases.push(trimmed);
            }
        }
    }

    // Normalizacja i deduplikacja
    const normalized = aliases
        .map(normalizeIngredientName)
        .filter(n => n.length > 0);
    return [...new Set(normalized)];
}

module.exports = { normalizeIngredientName, extractIngredientsFromChunk };
