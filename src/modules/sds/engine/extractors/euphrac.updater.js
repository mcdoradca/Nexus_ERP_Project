const fs = require('fs');
const path = require('path');
const { ApifyEchaConnector } = require('./apify.echa.connector');

class EuphracUpdater {
    constructor() {
        this.connector = new ApifyEchaConnector();
        this.ragKnowledgePath = path.join(__dirname, '..', '..', 'rag_knowledge');
        this.ssotFilePath = path.join(this.ragKnowledgePath, 'euphrac_ssot.json');
    }

    async updateChemicalPhrases(casList) {
        console.log('[EuphracUpdater] Rozpoczynam aktualizację bazy SSOT z Apify ECHA...');
        if (!fs.existsSync(this.ragKnowledgePath)) {
            fs.mkdirSync(this.ragKnowledgePath, { recursive: true });
        }

        let ssotData = { hPhrases: {}, pPhrases: {}, hazardClasses: {}, updatedAt: null };
        
        if (fs.existsSync(this.ssotFilePath)) {
            try {
                ssotData = JSON.parse(fs.readFileSync(this.ssotFilePath, 'utf8'));
            } catch (err) {
                console.warn('[EuphracUpdater] Błąd odczytu istniejącego pliku SSOT, tworzę nowy.');
            }
        }

        for (const cas of casList) {
            try {
                const data = await this.connector.fetchChemicalData(cas);
                if (data) {
                    // W normalnym przypadku Apify zwraca kody i opisy (np. H225: "Wysoce łatwopalna ciecz i pary.")
                    // Tu symulujemy ekstrakcję słownikową z ustrukturyzowanej odpowiedzi ECHA.
                    if (data.hPhrases) {
                        data.hPhrases.forEach(phrase => {
                            const match = phrase.match(/^(H\d+[a-zA-Z]*)\s*:\s*(.*)/);
                            if (match) ssotData.hPhrases[match[1]] = match[2];
                        });
                    }
                    if (data.pPhrases) {
                        data.pPhrases.forEach(phrase => {
                            const match = phrase.match(/^(P\d+(?:\+P\d+)*)\s*:\s*(.*)/);
                            if (match) ssotData.pPhrases[match[1]] = match[2];
                        });
                    }
                }
            } catch (err) {
                console.error(`[EuphracUpdater] Błąd pobierania danych dla CAS ${cas}:`, err.message);
            }
        }

        ssotData.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.ssotFilePath, JSON.stringify(ssotData, null, 2));
        console.log(`[EuphracUpdater] Baza SSOT została zaktualizowana i zapisana w: ${this.ssotFilePath}`);
    }
}

module.exports = { EuphracUpdater };
