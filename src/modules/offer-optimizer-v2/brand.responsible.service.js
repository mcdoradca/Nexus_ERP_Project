const fs = require('fs');
const path = require('path');
const validators = require('./validators');

const REGISTRY_PATH = path.join(__dirname, 'config', 'brand.responsible.registry.json');
const CUSTOM_REGISTRY_PATH = path.join(__dirname, 'config', 'brand.responsible.custom.json');

class BrandResponsibleService {
    constructor() {
        this.registry = this._loadRegistry();
    }

    _loadRegistry() {
        let baseData = { entities: {} };
        try {
            if (fs.existsSync(REGISTRY_PATH)) {
                baseData = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
            }
        } catch (e) {
            console.error('[BrandResponsibleService] Błąd odczytu bazy referencyjnej:', e.message);
        }

        let customData = { entities: {} };
        try {
            if (fs.existsSync(CUSTOM_REGISTRY_PATH)) {
                customData = JSON.parse(fs.readFileSync(CUSTOM_REGISTRY_PATH, 'utf8'));
            }
        } catch (e) {
            console.error('[BrandResponsibleService] Błąd odczytu bazy custom:', e.message);
        }

        return {
            ...baseData.entities,
            ...customData.entities
        };
    }

    normalizeKey(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/['’`".,\-_\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Wyszukuje urzędowy Podmiot Odpowiedzialny w UE dla danej marki lub z nazwy produktu.
     * @param {string} brandName - nazwa marki (np. "Felce Azzurra", "Mil Mil", "Chante Clair")
     * @param {string} productName - nazwa produktu (przydatna w przypadku braku marki lub generycznego wpisu w PIM)
     * @returns {Object|null} { name, address_eu, contact }
     */
    findResponsibleEntity(brandName, productName = '') {
        const normBrand = this.normalizeKey(brandName);
        const normProduct = this.normalizeKey(productName);

        // 1. Bezpośrednie dopasowanie po marce
        if (normBrand && normBrand !== 'bez marki' && normBrand !== 'nieznany producent' && normBrand !== 'pim import' && !/^\d+$/.test(normBrand)) {
            for (const [key, entity] of Object.entries(this.registry)) {
                const brands = entity.brands || [];
                for (const b of brands) {
                    const normB = this.normalizeKey(b);
                    if (normBrand === normB || normBrand.includes(normB) || normB.includes(normBrand)) {
                        const candidate = {
                            name: entity.name,
                            address_eu: entity.address_eu,
                            contact: entity.contact
                        };
                        const valRes = validators.validate_eu_responsible_person(candidate);
                        if (valRes.valid) return candidate;
                    }
                }
            }
        }

        // 2. Dopasowanie po nazwie produktu (jeśli marka w PIM jest pusta, błędna lub generyczna)
        if (normProduct) {
            for (const [key, entity] of Object.entries(this.registry)) {
                const brands = entity.brands || [];
                for (const b of brands) {
                    const normB = this.normalizeKey(b);
                    // Sprawdzamy granice słów dla marki w tytule produktu
                    const regex = new RegExp(`\\b${normB.replace(/\s+/g, '\\s+')}\\b`, 'i');
                    if (regex.test(normProduct)) {
                        const candidate = {
                            name: entity.name,
                            address_eu: entity.address_eu,
                            contact: entity.contact
                        };
                        const valRes = validators.validate_eu_responsible_person(candidate);
                        if (valRes.valid) return candidate;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Twarda tarcza sanityzacyjna: usuwa e-maile, telefony oraz linki/domeny www z tekstu opisu HTML.
     * Zapobiega blokadzie aukcji przez filtry antykontaktowe Allegro.
     */
    stripContactInfo(text) {
        if (!text || typeof text !== 'string') return text;
        return text
            // Usuń adresy e-mail (np. info@paglieri.it)
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
            // Usuń adresy URL i protokoły (np. https://..., http://...)
            .replace(/https?:\/\/[^\s<>"']+/gi, '')
            // Usuń www.domena...
            .replace(/\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/gi, '')
            // Usuń etykiety typu 'kontakt:', 'tel:', 'infolinia:'
            .replace(/\b(?:kontakt|contact|tel|telefon|phone|fax|infolinia)\s*:?\s*/gi, '')
            // Usuń numery telefonów (dowolny ciąg z plusem lub bez, z 7-15 cyframi i separatorami)
            .replace(/(?:\+?\d{1,4}[\s.-]*)?(?:\(?\d{2,4}\)?[\s.-]*)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}\b/g, '')
            // Wyczyść ewentualne podwójne przecinki, dwukropki lub pozostałości spacji
            .replace(/,\s*,/g, ',')
            .replace(/,\s*$/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    /**
     * Generuje bezpieczny wpis tekstowy do Sekcji 6 HTML:
     * WYŁĄCZNIE Nazwa Podmiotu i Fizyczny Adres Pocztowy. ZERO e-maili, ZERO telefonów, ZERO stron WWW!
     */
    formatForHtmlDescription(entity) {
        if (!entity || !entity.name || !entity.address_eu) return '';
        const cleanName = this.stripContactInfo(entity.name);
        const cleanAddress = this.stripContactInfo(entity.address_eu);
        return `${cleanName}, ${cleanAddress}`;
    }

    /**
     * Samouczenie rejestru: zapisuje nowy podmiot odpowiedzialny odkryty przez Agenta 1
     */
    registerDiscoveredEntity(brandName, entity) {
        if (!brandName || !entity || !entity.name || !entity.address_eu) return false;
        const valRes = validators.validate_eu_responsible_person(entity);
        if (!valRes.valid) return false;

        const normBrand = this.normalizeKey(brandName);
        if (!normBrand || normBrand === 'bez marki') return false;

        const entityId = normBrand.replace(/\s+/g, '_');
        this.registry[entityId] = {
            name: entity.name.trim(),
            address_eu: entity.address_eu.trim(),
            contact: (entity.contact || 'contact@manufacturer.eu').trim(),
            brands: [normBrand]
        };

        try {
            let customData = { entities: {} };
            if (fs.existsSync(CUSTOM_REGISTRY_PATH)) {
                customData = JSON.parse(fs.readFileSync(CUSTOM_REGISTRY_PATH, 'utf8'));
            }
            customData.entities[entityId] = this.registry[entityId];
            fs.writeFileSync(CUSTOM_REGISTRY_PATH, JSON.stringify(customData, null, 2), 'utf8');
            console.log(`[BrandResponsibleService] Zapisano nowo odkryty podmiot odpowiedzialny dla marki: "${brandName}" -> "${entity.name}"`);
            return true;
        } catch (e) {
            console.error('[BrandResponsibleService] Nie udało się zapisać podmiotu custom:', e.message);
            return false;
        }
    }
}

module.exports = new BrandResponsibleService();
