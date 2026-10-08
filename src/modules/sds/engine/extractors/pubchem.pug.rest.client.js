const axios = require('axios');

/**
 * PubChemPugRestClient - Autentyczny klient NCBI PubChem PUG REST / PUG View
 * Oficjalna dokumentacja: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 * Pełni rolę tarczy obronnej (Defensive Fallback) dla Apify ECHA Scraper.
 */
class PubChemPugRestClient {
    constructor() {
        this.pugRestBaseUrl = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
        this.pugViewBaseUrl = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view';
        this.timeoutMs = 12000; // 12s timeout per request
    }

    /**
     * Pobiera podstawowe właściwości chemiczne (IUPAC, wzór, tytuł, CID)
     * Endpoint: /compound/name/{query}/property/IUPACName,MolecularFormula,Title/JSON
     * @param {string} query - Numer CAS lub nazwa chemiczna
     * @returns {Promise<Object|null>}
     */
    async fetchCompoundProperties(query) {
        if (!query || typeof query !== 'string') return null;
        const cleanQuery = query.trim();

        const url = `${this.pugRestBaseUrl}/compound/name/${encodeURIComponent(cleanQuery)}/property/IUPACName,MolecularFormula,Title/JSON`;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await axios.get(url, {
                    timeout: this.timeoutMs,
                    headers: { 'User-Agent': 'NexusERP-PubChem-Fallback/1.0' }
                });

                if (response.data?.PropertyTable?.Properties?.[0]) {
                    const prop = response.data.PropertyTable.Properties[0];
                    return {
                        cid: prop.CID,
                        molecularFormula: prop.MolecularFormula || null,
                        iupacName: prop.IUPACName || null,
                        title: prop.Title || null
                    };
                }
                return null;
            } catch (error) {
                // 404 oznacza, że substancja nie została znaleziona w PubChem
                if (error.response && error.response.status === 404) {
                    return null;
                }
                // Błędy sieciowe / rate limiting (429, 503)
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                } else {
                    console.warn(`[PubChemPugRestClient] Błąd pobierania właściwości dla '${cleanQuery}': ${error.message}`);
                    return null;
                }
            }
        }
        return null;
    }

    /**
     * Pobiera zharmonizowane dane GHS (zwroty H, zwroty P, piktogramy, hasło ostrzegawcze)
     * Endpoint: /data/compound/{CID}/JSON?heading=GHS%20Classification
     * @param {number} cid - PubChem Compound ID
     * @returns {Promise<Object>}
     */
    async fetchGHSClassification(cid) {
        if (!cid) return { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };

        const url = `${this.pugViewBaseUrl}/data/compound/${cid}/JSON?heading=GHS%20Classification`;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await axios.get(url, {
                    timeout: this.timeoutMs,
                    headers: { 'User-Agent': 'NexusERP-PubChem-Fallback/1.0' }
                });

                const ghsSection = this._extractGhsSection(response.data?.Record?.Section);
                if (!ghsSection) {
                    return { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };
                }

                return this._parseGhsInformation(ghsSection.Information || []);
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    return { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };
                }
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                } else {
                    console.warn(`[PubChemPugRestClient] Błąd pobierania GHS dla CID ${cid}: ${error.message}`);
                    return { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };
                }
            }
        }
        return { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };
    }

    /**
     * Kompleksowy profil substancji łączący dane identyfikacyjne i klasyfikację GHS / ECHA
     * @param {string} query - Numer CAS lub nazwa chemiczna
     * @returns {Promise<Object|null>}
     */
    async fetchFullChemicalProfile(query) {
        if (!query || typeof query !== 'string') return null;
        const cleanQuery = query.trim();

        try {
            console.log(`[PubChemPugRestClient] Odpytywanie PubChem PUG REST dla '${cleanQuery}'...`);
            const properties = await this.fetchCompoundProperties(cleanQuery);
            if (!properties) {
                console.warn(`[PubChemPugRestClient] Brak rekordu w PubChem dla '${cleanQuery}'.`);
                return null;
            }

            let ghsData = { hPhrases: [], pPhrases: [], pictograms: [], signalWord: null, hazardClasses: [] };
            if (properties.cid) {
                ghsData = await this.fetchGHSClassification(properties.cid);
            }

            const isCas = /^\d{2,7}-\d{2}-\d$/.test(cleanQuery);

            return {
                substanceName: properties.title || properties.iupacName || cleanQuery,
                iupacName: properties.iupacName || null,
                molecularFormula: properties.molecularFormula || null,
                casNumber: isCas ? cleanQuery : null,
                ecNumber: null,
                cid: properties.cid || null,
                hazardClasses: ghsData.hazardClasses,
                hPhrases: ghsData.hPhrases,
                pPhrases: ghsData.pPhrases,
                signalWord: ghsData.signalWord,
                pictograms: ghsData.pictograms,
                source: 'PUBCHEM-PUG-REST-ECHA-FALLBACK'
            };
        } catch (err) {
            console.error(`[PubChemPugRestClient] Nieoczekiwany błąd fallbacku dla '${cleanQuery}':`, err.message);
            return null;
        }
    }

    _extractGhsSection(sections) {
        if (!Array.isArray(sections)) return null;
        for (const sec of sections) {
            if (sec.TOCHeading === 'GHS Classification') return sec;
            if (sec.Section) {
                const found = this._extractGhsSection(sec.Section);
                if (found) return found;
            }
        }
        return null;
    }

    _parseGhsInformation(informationList) {
        const hSet = new Set();
        const pSet = new Set();
        const picSet = new Set();
        const classSet = new Set();
        let rawSignal = null;

        for (const info of informationList) {
            const name = info.Name;

            // 1. Hasło ostrzegawcze (Signal)
            if (name === 'Signal' && !rawSignal) {
                rawSignal = info.Value?.StringWithMarkup?.[0]?.String || null;
            }

            // 2. Zwroty wskazujące rodzaj zagrożenia (H Statements)
            if (name === 'GHS Hazard Statements') {
                const strings = info.Value?.StringWithMarkup || [];
                for (const item of strings) {
                    const text = item.String || '';
                    // Ekstrakcja kodów H (np. H225, H319, H314)
                    const hMatches = text.match(/\bH\d{3}[a-zA-Z]?\b/g);
                    if (hMatches) {
                        hMatches.forEach(h => hSet.add(h));
                    }
                    // Ekstrakcja klasy zagrożenia z nawiasów kwadratowych np. [Danger Flammable liquids]
                    const classMatch = text.match(/\[(?:Danger|Warning)\s+([^\]]+)\]/i);
                    if (classMatch && classMatch[1]) {
                        classSet.add(classMatch[1].trim());
                    }
                }
            }

            // 3. Zwroty wskazujące środki ostrożności (P Statements)
            if (name === 'Precautionary Statement Codes') {
                const strings = info.Value?.StringWithMarkup || [];
                for (const item of strings) {
                    const text = item.String || '';
                    const pMatches = text.match(/\bP\d{3}(?:\+P\d{3})*\b/g);
                    if (pMatches) {
                        pMatches.forEach(p => pSet.add(p));
                    }
                }
            }

            // 4. Piktogramy GHS
            if (name === 'Pictogram(s)') {
                const strings = info.Value?.StringWithMarkup || [];
                for (const item of strings) {
                    const markups = item.Markup || [];
                    for (const mk of markups) {
                        const urlMatch = mk.URL?.match(/GHS\d{2}/i);
                        if (urlMatch) {
                            picSet.add(urlMatch[0].toUpperCase());
                        }
                    }
                }
            }
        }

        // Tłumaczenie hasła ostrzegawczego na język polski
        let signalWordPl = null;
        if (rawSignal) {
            const lower = rawSignal.toLowerCase().trim();
            if (lower === 'danger') signalWordPl = 'Niebezpieczeństwo';
            else if (lower === 'warning') signalWordPl = 'Uwaga';
            else signalWordPl = rawSignal;
        }

        return {
            hPhrases: Array.from(hSet),
            pPhrases: Array.from(pSet),
            pictograms: Array.from(picSet),
            signalWord: signalWordPl,
            hazardClasses: Array.from(classSet)
        };
    }
}

module.exports = { PubChemPugRestClient };
