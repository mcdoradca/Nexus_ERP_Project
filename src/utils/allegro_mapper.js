/**
 * Skryptowy Mapper Allegro -> Allegro
 * Służy do sztywnego przypisania parametrów z Katalogu Allegro (hardFeatures)
 * do struktury drzewa kategorii (requiredSchema), omijając sztuczną inteligencję.
 */
function mapAllegroParameters(hardFeatures, requiredSchema) {
    if (!hardFeatures || Object.keys(hardFeatures).length === 0) return {};
    if (!requiredSchema || !Array.isArray(requiredSchema)) return hardFeatures; // Fallback

    const mappedFeatures = {};

    // Normalizuje string do porównań (małe litery, bez spacji brzegowych)
    const normalize = (str) => {
        if (typeof str !== 'string') return String(str).toLowerCase().trim();
        return str.toLowerCase().trim();
    };

    requiredSchema.forEach(param => {
        const catalogValue = hardFeatures[param.name];
        if (catalogValue !== undefined && catalogValue !== null) {
            
            // Jeśli parametr słownikowy, szukamy w słowniku najbardziej zbliżonej wartości
            if (param.type === 'dictionary' && Array.isArray(param.dictionary)) {
                const normalizedCatalog = normalize(catalogValue);
                
                // 1. Szukamy dokładnego dopasowania
                let exactMatch = param.dictionary.find(d => normalize(d.value) === normalizedCatalog);
                
                if (exactMatch) {
                    mappedFeatures[param.name] = exactMatch.value;
                } else {
                    // 2. Jeśli brak dokładnego, szukamy czy wartość z katalogu zawiera się w wartości słownikowej (lub odwrotnie)
                    let partialMatch = param.dictionary.find(d => {
                        const normDict = normalize(d.value);
                        return normDict.includes(normalizedCatalog) || normalizedCatalog.includes(normDict);
                    });
                    
                    if (partialMatch) {
                        mappedFeatures[param.name] = partialMatch.value;
                    } else {
                        // Ostateczność: zachowujemy wartość z katalogu
                        mappedFeatures[param.name] = catalogValue;
                    }
                }
            } else {
                // Dla parametrów niesłownikowych (np. string, integer, float) bierzemy wartość wprost
                mappedFeatures[param.name] = catalogValue;
            }
        }
    });

    return mappedFeatures;
}

module.exports = { mapAllegroParameters };
