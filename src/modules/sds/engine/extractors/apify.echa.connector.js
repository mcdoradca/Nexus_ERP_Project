const axios = require('axios');
require('dotenv').config();

/**
 * Apify ECHA Connector - Integracja z Apify ECHA Europe Chemicals Scraper
 * Pełni rolę SSOT (Single Source of Truth) dla klasyfikacji (CLP) i fraz GHS/EuPhraC.
 */
class ApifyEchaConnector {
    constructor() {
        this.apiToken = process.env.APIFY_API_TOKEN;
        // Używamy zaufanego aktora, np. parseforge~echa-europe-chemicals-scraper
        this.actorId = 'parseforge~echa-europe-chemicals-scraper'; 
        this.baseUrl = 'https://api.apify.com/v2';
    }

    /**
     * Wyszukuje substancję po numerze CAS lub nazwie.
     * @param {string} query - Numer CAS (np. '64-17-5') lub numer EC.
     * @returns {Promise<Object>} - Otrzymana, autorytatywna klasyfikacja
     */
    async fetchChemicalData(query) {
        if (!this.apiToken) {
            throw new Error('[ApifyEchaConnector] Brak APIFY_API_TOKEN w środowisku.');
        }

        try {
            console.log(`[ApifyEchaConnector] Uruchamianie aktora ECHA dla zapytania: ${query}`);
            const runResponse = await axios.post(
                `${this.baseUrl}/acts/${this.actorId}/runs?token=${this.apiToken}`,
                {
                    searchTerms: [query],
                    maxItems: 1
                }
            );

            const runId = runResponse.data.data.id;
            
            // Oczekiwanie na zakończenie aktora
            console.log(`[ApifyEchaConnector] Aktor uruchomiony (Run ID: ${runId}). Oczekiwanie na wyniki...`);
            
            const datasetId = await this._waitForRunCompletion(runId);
            
            console.log(`[ApifyEchaConnector] Zakończono, pobieranie datasetu ${datasetId}...`);
            const datasetResponse = await axios.get(
                `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}`
            );

            if (datasetResponse.data && datasetResponse.data.length > 0) {
                return this._normalizeEchaData(datasetResponse.data[0]);
            } else {
                console.warn(`[ApifyEchaConnector] Brak wyników dla: ${query}`);
                return null;
            }

        } catch (error) {
            console.error(`[ApifyEchaConnector] Błąd komunikacji z Apify:`, error.message);
            throw error;
        }
    }

    async _waitForRunCompletion(runId, maxRetries = 30) {
        let retries = 0;
        while (retries < maxRetries) {
            await new Promise(res => setTimeout(res, 5000)); // 5s interval
            const statusResponse = await axios.get(
                `${this.baseUrl}/actor-runs/${runId}?token=${this.apiToken}`
            );
            const status = statusResponse.data.data.status;
            
            if (status === 'SUCCEEDED') {
                return statusResponse.data.data.defaultDatasetId;
            }
            if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
                throw new Error(`[ApifyEchaConnector] Aktor zakończył się błędem: ${status}`);
            }
            retries++;
        }
        throw new Error('[ApifyEchaConnector] Przekroczono czas oczekiwania na aktora.');
    }

    _normalizeEchaData(rawData) {
        // Normalizacja struktury z ECHA do standardu Antigravity 2026 SDS (EuPhraC)
        return {
            substanceName: rawData.name || rawData.substanceName || null,
            casNumber: rawData.casNumber || null,
            ecNumber: rawData.ecNumber || null,
            hazardClasses: rawData.hazardClasses || [], // np. ["Flam. Liq. 2", "Eye Irrit. 2"]
            hPhrases: rawData.hStatements || rawData.hazardStatements || [], // np. ["H225", "H319"]
            pPhrases: rawData.pStatements || rawData.precautionaryStatements || [], 
            signalWord: rawData.signalWord || null,
            pictograms: rawData.pictograms || [], // np. ["GHS02", "GHS07"]
            source: 'ECHA-APIFY-SSOT'
        };
    }
}

module.exports = { ApifyEchaConnector };
