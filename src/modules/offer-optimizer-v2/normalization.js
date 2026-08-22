/**
 * Normalizuje nazwę składnika (INCI) do spójnego formatu używanego w entryName.
 * Funkcja idempotentna. Używana podczas ingestu oraz w lookupie GATE-3.
 */
function normalizeIngredientName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Usuwa znaki diakrytyczne
        .replace(/[\(\)\[\]]/g, '') // Usuwa nawiasy
        .replace(/-/g, ' ')         // Zamienia myślniki na spacje
        .replace(/\s+/g, ' ')       // Redukcja wielokrotnych spacji do jednej
        .trim();
}

const gate1 = [
    'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
];
const gate2 = [
    'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
];
const bannedGates = new Set([...gate1, ...gate2].map(normalizeIngredientName));

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
        const regex = /\*\*(.+?)\*\*/g;
        let match;
        while ((match = regex.exec(chunk)) !== null) {
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
        // SOT_10 / 07 / 05: Linie z ukośnikami często zawierają nazwy, ale pomijamy nagłówki []
        const lines = chunk.split('\n');
        for (let line of lines) {
            if (line.startsWith('[')) continue;
            // jeśli linia ma listę (np 1. lub *)
            line = line.replace(/^[\d\.\*\-\s]+/, '');
            if (line.trim().length === 0) continue;
            
            // Szukamy części przed myślnikiem jako potencjalnych nazw (częsty format "Nazwa / Nazwa - opis")
            const mainPart = line.split('-')[0].split('–')[0];
            const parts = mainPart.split('/');
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
    }

    // Normalizacja i deduplikacja
    let normalized = aliases
        .map(n => n.trim())
        .filter(n => {
            if (n.includes(':')) return false;
            if (n.endsWith('.')) return false;
            
            const lower = n.toLowerCase();
            if (lower.includes('jako ')) return false;
            if (lower.includes('często')) return false;
            if (lower.includes('funkcja')) return false;
            if (lower.includes('kategoria')) return false;
            if (lower.includes('mechanizm')) return false;
            if (lower.includes('kryterium')) return false;
            if (lower.includes('związki polimerowe')) return false;
            
            // Odrzucenie skrótów jako samodzielnych wpisów indeksowych (aliasów)
            if (['ipa', 'coco', 'apg'].includes(lower)) return false;

            // Odrzucenie statusów typu uppercase
            if (/^[A-Z0-9_]{3,}$/.test(n)) return false;
            // Odrzucenie procentów i limitów
            if (/\d+[,.]?\d*\s*%/.test(n)) return false;
            return true;
        })
        .map(normalizeIngredientName)
        .filter(n => {
            if (n.length < 4) return false;
            if (n.split(/\s+/).length > 6) return false;
            // Twardy bezpiecznik przeciw wyciekom GATE-1 i GATE-2
            if (bannedGates.has(n)) return false;
            return true;
        });
    return [...new Set(normalized)];
}

module.exports = { normalizeIngredientName, extractIngredientsFromChunk };
