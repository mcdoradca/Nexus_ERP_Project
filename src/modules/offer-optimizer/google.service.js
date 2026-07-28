const axios = require('axios');

/**
 * Pobiera podpowiedzi wyszukiwarki Google dla podanej frazy.
 */
async function googleSuggest(phrase) {
    if (!phrase) return [];
    try {
        const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=pl&gl=pl&q=${encodeURIComponent(phrase)}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });
        
        // Zwraca w formacie [ "oryginalna fraza", ["podpowiedź 1", "podpowiedź 2", ...] ]
        if (response.data && Array.isArray(response.data) && response.data.length > 1) {
            return response.data[1];
        }
        return [];
    } catch (error) {
        console.warn(`[GoogleService] Błąd pobierania podpowiedzi dla "${phrase}":`, error.message);
        return [];
    }
}

/**
 * Zwraca informacje o trendach (Mock/POC)
 * Ze względu na ograniczenia publicznego API bez klucza SerpApi, to narzędzie na razie działa jako stub/best-effort.
 */
async function googleTrendsCompare(terms) {
    if (!terms || terms.length < 2) return { error: "Wymagane minimum 2 terminy do porównania" };
    try {
        console.warn(`[GoogleService] Użyto zaślepki dla googleTrendsCompare: ${terms.join(', ')}`);
        // Dla potrzeb agenta zwracamy informację, że nie mamy twardych danych
        return { 
            message: "Narzędzie googleTrendsCompare jest niedostępne (brak klucza API). Opieraj się na googleSuggest lub danych Allegro.",
            status: "unavailable"
        };
    } catch (error) {
        return { error: error.message };
    }
}

module.exports = {
    googleSuggest,
    googleTrendsCompare
};
