const fs = require('fs');
const path = require('path');

/**
 * LocalKnowledgeConnector - Wewnętrzny system RAG (Single Source of Truth)
 * Udostępnia Agentom funkcje dostępu do lokalnych norm, dzienników ustaw i SOP.
 */
class LocalKnowledgeConnector {
    constructor() {
        this.docsPath = path.join(__dirname, '../../../../../docs/SDS');
    }

    /**
     * Wyszukuje polskie NDS (Najwyższe Dopuszczalne Stężenia) po numerze CAS lub nazwie.
     * Symuluje wyszukiwanie w pliku 'Baza NDS RP (Dz.U. 2018 poz. 1286) - Pełny Wykaz.txt'
     */
    async lookupPolishNDS(query) {
        console.log(`[RAG] Wyszukiwanie NDS dla: ${query}`);
        // Zwracamy z bazy zasady do kontekstu
        return {
            source: "Dz.U. 2018 poz. 1286 z późn. zm.",
            query: query,
            instruction: "Zawsze usuwaj obce OEL (Wspólnotowe wartości narażenia dla Austrii, Niemiec, Francji itp.) z sekcji 8. Zastąp je wyłącznie polskimi NDS, jeśli są określone."
        };
    }

    /**
     * Zwraca wytyczne SOP (Standard Operating Procedures) dla bezpieczeństwa pracy i rozlewisk.
     */
    async querySafetySOP(topic) {
        console.log(`[RAG] Wyszukiwanie procedur bezpieczeństwa (SOP) dla: ${topic}`);
        if (topic.includes('sorbent') || topic.includes('uwolnienie') || topic.includes('rozlewisko')) {
            return {
                source: "Bezpieczeństwo Chemiczne - Dobre Praktyki",
                rule: "CAŁKOWITY ZAKAZ stosowania palnych materiałów organicznych (np. trociny, materiał organiczny) do wchłaniania rozlewisk. Dopuszczalne są WYŁĄCZNIE niepalne materiały absorbujące (piasek, ziemia okrzemkowa, wermikulit)."
            };
        }
        if (topic.includes('magazynowanie') || topic.includes('elektryczność')) {
            return {
                source: "Wymogi Magazynowania - Rozp. REACH (Sekcja 7)",
                rule: "W sekcji 7 należy obowiązkowo zastrzec nakaz stosowania uziemień, unikania ładunków elektrostatycznych oraz ZAKAZ stosowania sprężonego powietrza do opróżniania pojemników."
            };
        }
        return { info: "Brak specyficznych procedur. Zastosuj ogólne zasady bezpieczeństwa." };
    }

    /**
     * Pobiera odpowiednie polskie normy dla Środków Ochrony Indywidualnej (ŚOI) z bazy wiedzy.
     */
    async lookupPpeNorms(category) {
        console.log(`[RAG] Pobieranie norm PN-EN dla kategorii ŚOI: ${category}`);
        return {
            source: "Normy PN-EN / ISO",
            category: category,
            instruction: "Zakazane jest stosowanie zwrotów 'brak wymagań'. Należy podawać oficjalne normy ochrony. Dla oczu stosuj 'PN-EN 166'. Dla rąk stosuj 'PN-EN ISO 374-1'. Dla dróg oddechowych stosuj odpowiednie maski z filtrem."
        };
    }
}

module.exports = { LocalKnowledgeConnector };
