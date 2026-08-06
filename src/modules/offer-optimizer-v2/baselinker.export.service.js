const axios = require('axios');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { exportLogger } = require('../../utils/logger');
const AllegroService = require('../offer-optimizer/allegro.service');

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
            return '&#x' + codePoint.toString(16).toUpperCase() + ';';
        });
    }

    /**
     * Zgodnie z wytycznymi z KI (Amazon Lupa) kompresuje zdjęcie jeśli to konieczne
     * aby zmieścić Base64 poniżej 2MB przy zachowaniu wymiarów.
     */
    async compressImage(url) {
        if (url.startsWith('data:image')) {
            const base64Data = url.split(',')[1] || "";
            return "data:" + base64Data;
        }

        try {
            exportLogger.info(`[BaselinkerExportService] Pobieranie obrazu do kompresji: ${url}`);
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            let buffer = Buffer.from(response.data);
            
            // Limit to < 1.9MB
            const MAX_BYTES = 1.9 * 1024 * 1024;
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
            return `url:${url}`; // Bezpośredni fallback z prefiksem `url:` w razie błędu proxy/dostępu
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
            images: {},
            features: {}
        };

        if (productId) {
            payload.product_id = productId;
        }

        // --- 1. KOMPILACJA SEKCJI OPISU (7 pól -> 6 sekcji) ---
        payload.text_fields["description"] = this.encodeEmojis(draftData.htmlContent?.sekcja1 || draftData.sekcja1 || "", true);
        payload.text_fields["description_extra1"] = this.encodeEmojis(draftData.htmlContent?.sekcja2 || draftData.sekcja2 || "", true);
        payload.text_fields["description_extra2"] = this.encodeEmojis(draftData.htmlContent?.sekcja3 || draftData.sekcja3 || "", true);
        payload.text_fields["description_extra3"] = this.encodeEmojis(draftData.htmlContent?.sekcja4 || draftData.sekcja4 || "", true);
        
        const sec5 = draftData.htmlContent?.sekcja5 || draftData.sekcja5 || "";
        const sec6 = draftData.htmlContent?.sekcja6 || draftData.sekcja6 || "";
        const combinedSec56 = [sec5, sec6].filter(Boolean).join("\n\n");
        payload.text_fields["description_extra4"] = this.encodeEmojis(combinedSec56, true);
        
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

        payload.features = { ...existingFeatures, ...hardFeatures, ...(draftData.features || {}) };
        
        for (const [key, val] of Object.entries(payload.features)) {
            if (typeof val === 'string') {
                payload.features[key] = this.encodeEmojis(val, false);
            }
        }

        // --- 4. ZDJĘCIA ---
        // Budujemy tablicę docelową: index 0 to miniaturka, reszta to galeria
        const finalImages = [];
        
        // Zabezpieczenie: Pobieramy miniaturkę z bazy (PIM)
        let mainImageUrl = product.imageUrl || null;

        if (draftData.images && Array.isArray(draftData.images) && draftData.images.length > 0) {
            // Frontend przesłał własną tablicę (np. posortowaną przez użytkownika)
            for (let img of draftData.images) {
                let url = typeof img === 'string' ? img : (img.url || img.originalUrl || img.replacedUrl || "");
                if (url.includes('upload.cdn.baselinker.com') || url.includes('placeholder.com')) {
                    finalImages.push(""); // Pusty string u nas oznacza skip w indeksacji
                } else if (url) {
                    finalImages.push(url);
                }
            }
        } else {
            // Logika Fallbacku z dawnego MDM: jeśli frontend nie przysłał zdjęć, wstrzykujemy PIM
            if (mainImageUrl) finalImages.push(mainImageUrl);
            if (product.images && Array.isArray(product.images)) {
                product.images.forEach(img => finalImages.push(img));
            }
        }

        // Dodatkowa tarcza: Jeśli po wszystkim nie mamy miniaturki na index 0 (jest pusta), 
        // a w bazie PIM mamy zdjęcie główne (imageUrl) i nie jest to BaseLinker CDN, wymuszamy je na index 0.
        if (mainImageUrl && (!finalImages[0] || finalImages[0] === "")) {
             if (!mainImageUrl.includes('upload.cdn.baselinker.com') && !mainImageUrl.includes('placeholder.com')) {
                 finalImages[0] = mainImageUrl;
             }
        }

        // Kompresja i przypisanie do payloadu zgodnie z indeksami (0, 1, 2...)
        for (let i = 0; i < finalImages.length; i++) {
            let url = finalImages[i];
            if (!url) continue; // Skipujemy puste (np. odrzucone linki CDN), dzięki czemu BaseLinker zachowa stare zdjęcie na tej pozycji
            
            const compressedDataUrl = await this.compressImage(url);
            payload.images[i.toString()] = compressedDataUrl;
        }

        return payload;
    }

    /**
     * Główna metoda kompilująca parametry, sekcje, zdjęcia i ładunek w jeden poprawny format JSON dla BaseLinker
     */
    async exportToBaselinker(inventoryId, productId, draftData, product) {
        exportLogger.info(`[BaselinkerExportService] Rozpoczynam eksport dla EAN: ${product.ean}`);
        
        const payload = await this.buildPayload(inventoryId, productId, draftData, product);

        // --- 5. EKSPORT DO BASELINKER API ---
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        if (!tokenRecord || !tokenRecord.value) {
            throw new Error("Brak tokenu BASELINKER_TOKEN w bazie");
        }
        const token = tokenRecord.value;

        const params = new URLSearchParams();
        params.append('method', 'addInventoryProduct');
        params.append('parameters', JSON.stringify(payload));
        
        exportLogger.info(`[BaselinkerExportService] Wysyłanie ładunku do BaseLinker API...`);

        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
            headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000 // Obrazy b64 ważą sporo
        });

        if (response.data.status === 'ERROR') {
            throw new Error(`BaseLinker API Error: ${response.data.error_message}`);
        }

        exportLogger.info(`[BaselinkerExportService] Zakończono sukcesem eksport dla EAN: ${product.ean}. Wynik API:`, { responseData: response.data });
        return {
            apiResponse: response.data,
            agentPayload: payload // Zwracamy payload żeby symulować strukturę jaką wcześniej wypluwał AI Agent (na użytek frontendu/logów)
        };
    }
}

module.exports = new BaselinkerExportService();
