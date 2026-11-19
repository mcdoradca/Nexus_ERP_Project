const axios = require('axios');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { exportLogger } = require('../../utils/logger');
const AllegroService = require('../offer-optimizer/allegro.service');
const { getBaseLinkerToken } = require('../../utils/secretVault');
const { isValidExportImageUrl } = require('../../utils/allegro_mapper');
const { stripRawInciFooterFromSection3 } = require('./normalization');

const INTERNAL_BACK_IMAGE_KEYS = new Set([
    'zdjęcie tyłu opakowania',
    'zdjecie tylu opakowania',
    '_backimageurl'
]);

/**
 * Scala parametry z PIM, UI oraz (wyłącznie jako fallback braków) katalogu Allegro,
 * gwarantując pierwszeństwo korekt operatora oraz usunięcie pól binarnych przed eksportem do BaseLinkera.
 */
function mergeFeaturesForBaselinker({ existingFeatures = {}, draftFeatures = null, hardFeatures = {}, featuresAuthoritative = false } = {}) {
    const baseExisting = (existingFeatures && typeof existingFeatures === 'object' && !Array.isArray(existingFeatures))
        ? existingFeatures
        : {};
    const hasDraftObj = Boolean(draftFeatures && typeof draftFeatures === 'object' && !Array.isArray(draftFeatures));

    // Przy pełnym snapshocie z UI (`featuresAuthoritative`) nie wskrzeszamy kluczy celowo usuniętych przez operatora
    const merged = featuresAuthoritative && hasDraftObj
        ? { ...draftFeatures }
        : { ...baseExisting, ...(hasDraftObj ? draftFeatures : {}) };

    const presentNormKeys = new Set(
        Object.keys(merged).map(k => String(k).toLowerCase().trim())
    );
    const deletedFromUiNormKeys = new Set(
        featuresAuthoritative && hasDraftObj
            ? Object.keys(baseExisting)
                .map(k => String(k).toLowerCase().trim())
                .filter(nk => !presentNormKeys.has(nk))
            : []
    );

    if (hardFeatures && typeof hardFeatures === 'object' && !Array.isArray(hardFeatures)) {
        for (const [k, v] of Object.entries(hardFeatures)) {
            if (v === undefined || v === null || String(v).trim() === '') continue;
            const normKey = String(k).toLowerCase().trim();
            if (INTERNAL_BACK_IMAGE_KEYS.has(normKey)) continue;
            if (deletedFromUiNormKeys.has(normKey)) continue;
            if (!presentNormKeys.has(normKey)) {
                merged[k] = v;
                presentNormKeys.add(normKey);
            } else {
                const existingKey = Object.keys(merged).find(mk => String(mk).toLowerCase().trim() === normKey);
                if (existingKey && (merged[existingKey] === undefined || merged[existingKey] === null || String(merged[existingKey]).trim() === '')) {
                    merged[existingKey] = v;
                }
            }
        }
    }

    for (const [key, val] of Object.entries(merged)) {
        const normKey = String(key).toLowerCase().trim();
        if (INTERNAL_BACK_IMAGE_KEYS.has(normKey) || (typeof val === 'string' && val.startsWith('data:image'))) {
            delete merged[key];
        }
    }

    return merged;
}

class BaselinkerExportService {
    
    /**
     * Koduje emoji i piktogramy na encje HTML chroniąc system przed błędami kodowania.
     * Jeśli isHtml = false (Tytuły), całkowicie usuwa emoji.
     */
    encodeEmojis(str, isHtml = true) {
        if (!str) return "";
        return str.replace(/[\p{Emoji}\uFE0F]/gu, function(match) {
            const codePoint = match.codePointAt(0);
            if (codePoint <= 127) return match; // Zostawiamy podstawowe znaki ASCII (np. cyfry, #, *)
            
            if (!isHtml) return ""; 

            if (codePoint <= 0xFFFF) return match; 

            return '&#x' + codePoint.toString(16).toUpperCase() + ';';
        });
    }

    /**
     * Zgodnie z wytycznymi z KI (Amazon Lupa) kompresuje zdjęcie jeśli to konieczne
     * aby zmieścić Base64 poniżej 2MB przy zachowaniu wymiarów.
     */
    isValidExportImageUrl(url) {
        return isValidExportImageUrl(url);
    }

    async compressImage(url) {
        const MAX_BYTES = 1.9 * 1024 * 1024;
        if (url.startsWith('data:image')) {
            const base64Data = url.split(',')[1] || "";
            if (base64Data.length <= MAX_BYTES) {
                return "data:" + base64Data;
            }
            try {
                const buffer = Buffer.from(base64Data, 'base64');
                let quality = 90;
                let compressedB64 = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
                while (compressedB64.length > MAX_BYTES && quality > 10) {
                    quality -= 10;
                    compressedB64 = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
                }
                exportLogger.info(`[BaselinkerExportService] Skompresowano obraz Base64 do jakości ${quality}.`);
                return "data:" + compressedB64;
            } catch (b64Err) {
                exportLogger.warn(`[BaselinkerExportService] Błąd kompresji obrazu Base64: ${b64Err.message}`);
                return "data:" + base64Data;
            }
        }

        if (!this.isValidExportImageUrl(url)) {
            exportLogger.warn(`[BaselinkerExportService] Odrzucono nieprawidłowy URL obrazu przed kompresją: ${url}`);
            return null;
        }

        try {
            exportLogger.info(`[BaselinkerExportService] Pobieranie obrazu do kompresji: ${url}`);
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            let buffer = Buffer.from(response.data);
            
            let quality = 95;
            let base64str = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
            
            while (base64str.length > MAX_BYTES && quality > 10) {
                quality -= 10;
                base64str = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
            }
            
            exportLogger.info(`[BaselinkerExportService] Skompresowano obraz do jakości ${quality}.`);
            return "data:" + base64str;
        } catch (err) {
            exportLogger.warn(`[BaselinkerExportService] Błąd pobierania/kompresji obrazu: ${url} - Fallback do url:`, err.message);
            return url.startsWith('http') ? `url:${url}` : null;
        }
    }

    /**
     * Buduje gotowy payload JSON (z kompresją zdjęć i mapowaniem) bez faktycznego wysyłania do API.
     */
    async buildPayload(inventoryId, productId, draftData, product) {
        exportLogger.info(`[BaselinkerExportService] Budowanie payloadu dla EAN: ${product.ean}`);
        
        const payload = {
            inventory_id: inventoryId,
            text_fields: {},
            images: {}
        };

        if (productId) {
            payload.product_id = productId;
        }

        // --- 1. KOMPILACJA SEKCJI OPISU (6 modułów — bez sekcja6 GPSR) ---
        payload.text_fields["description"] = this.encodeEmojis(draftData.htmlContent?.sekcja1 || draftData.sekcja1 || "", true);
        payload.text_fields["description_extra1"] = this.encodeEmojis(draftData.htmlContent?.sekcja2 || draftData.sekcja2 || "", true);
        const sec3 = stripRawInciFooterFromSection3(draftData.htmlContent?.sekcja3 || draftData.sekcja3 || "");
        payload.text_fields["description_extra2"] = this.encodeEmojis(sec3, true);
        payload.text_fields["description_extra3"] = this.encodeEmojis(draftData.htmlContent?.sekcja4 || draftData.sekcja4 || "", true);
        
        // Moduł 6 (sekcja6 / GPSR) jest wyłączony z opisu oferty (pozostaje wyłącznie pod kluczem GPSR).
        const sec5 = draftData.htmlContent?.sekcja5 || draftData.sekcja5 || "";
        payload.text_fields["description_extra4"] = this.encodeEmojis(sec5, true);
        
        payload.text_fields["extra_field_4245"] = this.encodeEmojis(draftData.htmlContent?.sekcja7 || draftData.sekcja7 || "", true);

        // --- 2. WALIDACJA TYTUŁU API (GEO) ---
        if (draftData.title) {
            const cleanTitle = this.encodeEmojis(draftData.title, false);
            payload.text_fields["name|pl|allegro_0"] = cleanTitle;
            payload.text_fields["name|pl|allegro_16402"] = cleanTitle;
            
            if (!payload.product_id) {
                payload.text_fields["name"] = cleanTitle;
            }
        }

        // --- 3. PARAMETRY ---
        let hardFeatures = {};
        if (product.allegroCategoryId) {
            try {
                hardFeatures = await AllegroService.getProductParametersByEan(product.ean, product.allegroCategoryId);
            } catch (e) {
                exportLogger.warn(`[BaselinkerExportService] Błąd pobierania hardFeatures z Allegro: ${e.message}`);
            }
        }
        
        let existingFeatures = {};
        if (typeof product.features === 'string') {
            try { existingFeatures = JSON.parse(product.features); } catch(e) {}
        } else if (typeof product.features === 'object' && product.features !== null) {
            existingFeatures = product.features;
        }

        const finalFeatures = mergeFeaturesForBaselinker({
            existingFeatures,
            draftFeatures: draftData.features || null,
            hardFeatures,
            featuresAuthoritative: Boolean(draftData.featuresAuthoritative)
        });

        for (const [key, val] of Object.entries(finalFeatures)) {
            if (typeof val === 'string') {
                finalFeatures[key] = this.encodeEmojis(val, false);
            }
        }
        
        payload.text_fields["features"] = finalFeatures;
        payload.text_fields["features|pl|allegro_16402"] = finalFeatures;

        // --- 4. ZDJĘCIA ---
        // Budujemy tablicę docelową: index 0 to miniaturka, reszta to galeria
        const finalImages = [];
        
        // Zabezpieczenie: Pobieramy miniaturkę z bazy (PIM)
        let mainImageUrl = product.imageUrl || null;

        if (draftData.images && Array.isArray(draftData.images) && draftData.images.length > 0) {
            // Frontend przesłał własną tablicę (np. posortowaną przez użytkownika)
            for (let img of draftData.images) {
                // replacedUrl musi mieć najwyższy priorytet, inaczej originalUrl ("Wymagane nowe zdjęcie") by go nadpisywało
                let url = typeof img === 'string' ? img : (img.replacedUrl || img.url || img.originalUrl || "");
                if (typeof url !== 'string') url = String(url);

                if (!this.isValidExportImageUrl(url)) {
                    finalImages.push(""); // Pusty string u nas oznacza skip w indeksacji (BaseLinker zignoruje ten slot)
                } else {
                    finalImages.push(url.trim());
                }
            }
        } else {
            // Logika Fallbacku z dawnego MDM: jeśli frontend nie przysłał zdjęć, wstrzykujemy PIM
            if (this.isValidExportImageUrl(mainImageUrl)) finalImages.push(mainImageUrl.trim());
            if (product.images && Array.isArray(product.images)) {
                product.images.forEach(img => {
                    if (this.isValidExportImageUrl(img)) finalImages.push(img.trim());
                });
            }
        }

        // Dodatkowa tarcza: Jeśli po wszystkim nie mamy miniaturki na index 0 (jest pusta), 
        // a w bazie PIM mamy poprawne zdjęcie główne (imageUrl) niebędące placeholderem ani BaseLinker CDN, wymuszamy je na index 0.
        if (mainImageUrl && (!finalImages[0] || finalImages[0] === "")) {
             if (this.isValidExportImageUrl(mainImageUrl)) {
                 finalImages[0] = mainImageUrl.trim();
             }
        }

        // Kompresja i przypisanie do payloadu zgodnie z indeksami (0, 1, 2...)
        for (let i = 0; i < finalImages.length; i++) {
            let url = finalImages[i];
            if (!url) continue; // Skipujemy puste (np. odrzucone linki CDN), dzięki czemu BaseLinker zachowa stare zdjęcie na tej pozycji
            
            const compressedDataUrl = await this.compressImage(url);
            if (compressedDataUrl) {
                payload.images[i.toString()] = compressedDataUrl;
            }
        }

        return payload;
    }

    /**
     * Główna metoda kompilująca parametry, sekcje, zdjęcia i ładunek w jeden poprawny format JSON dla BaseLinker
     */
    async exportToBaselinker(inventoryId, productId, draftData, product) {
        exportLogger.info(`[BaselinkerExportService] Rozpoczynam eksport dla EAN: ${product.ean}`);
        
        try {
            const payload = await this.buildPayload(inventoryId, productId, draftData, product);

            // --- 5. EKSPORT DO BASELINKER API ---
            const token = await getBaseLinkerToken(prisma);

            const params = new URLSearchParams();
            params.append('method', 'addInventoryProduct');
            params.append('parameters', JSON.stringify(payload));
            
            exportLogger.info(`[BaselinkerExportService] Wysyłanie ładunku do BaseLinker API dla EAN: ${product.ean}...`);

            const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
                headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000 // Obrazy b64 ważą sporo
            });

            if (response.data.status === 'ERROR') {
                throw new Error(`BaseLinker API Error: ${response.data.error_message}`);
            }

            exportLogger.info(`[BaselinkerExportService] Zakończono sukcesem eksport dla EAN: ${product.ean}.`);
            
            return {
                apiResponse: response.data,
                agentPayload: payload // Zwracamy payload żeby symulować strukturę jaką wcześniej wypluwał AI Agent (na użytek frontendu/logów)
            };
        } catch (error) {
            exportLogger.error(`[BaselinkerExportService] BŁĄD EKSPORTU dla EAN: ${product.ean} | Message: ${error.message}`);
            console.error(`[BaselinkerExportService] KRYTYCZNY BŁĄD EKSPORTU:`, error);
            
            if (error.response) {
                exportLogger.error(`[BaselinkerExportService] Szczegóły z API: ${JSON.stringify(error.response.data)}`);
                console.error(`[BaselinkerExportService] Szczegóły z API:`, error.response.data);
            }
            
            throw error; // Rzucamy dalej, by odpowiedź API również mogła zwrócić błąd (500)
        }
    }
}

const baselinkerExportService = new BaselinkerExportService();
baselinkerExportService.mergeFeaturesForBaselinker = mergeFeaturesForBaselinker;

module.exports = baselinkerExportService;
