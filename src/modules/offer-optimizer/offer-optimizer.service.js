const queueManager = require('./queue.service');
const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');
const { sanitizeHtml, sanitizeTitle } = require('./html-sanitizer.utils');

class OfferOptimizerService {
    /**
     * Główny zapalnik (Trigger) modułu puszczający zadaną paczkę SKU/ID do maszyny kolejkującej.
     */
    static async startBulkOptimization(inventoryId, productIds) {
        // Unikalne UUID paczki
        const jobId = `JOB_OPT_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        
        // 1. Zczytanie suchych danych bazowych wprost z hurtowni BL API (Odpoczynek serwerów Nexusa)
        const productsData = await BaseLinkerService.getInventoryProducts(inventoryId, productIds);
        
        // Transformacja obiektu Słownika do zwykłej tablicy dla wygody Workera
        const offersArray = Object.keys(productsData).map(key => ({
            id: key,
            ...productsData[key]
        }));

        // 2. Delegacja do asynchronicznego menedżera The Queue, by zapobiec zablokowaniu event loopa (GWARANCJA API-FIRST)
        // Definiujemy processCallback jako naszą wstrzykiwaną esencję GEO 2026.
        const jobStatus = queueManager.enqueueBatch(jobId, offersArray, async (offer) => {
            return await OfferOptimizerService.processSingleOffer(inventoryId, offer);
        });

        return jobStatus;
    }

    /**
     * Metoda pracownicza (Callback Kolejki) procesująca pojedynczy element z twardym limitem Czasu i Błędów.
     */
    static async processSingleOffer(inventoryId, offer) {
        console.log(`[Optimizer Service] Optymalizacja dla indeksu [${offer.sku}] startuje...`);
        
        // --- 1. Audyt Multimodalny (Vision AI)
        // Zakładamy, że BL zwraca linki pod kluczem images
        let visionAudit = null;
        if (offer.images && offer.images.length > 0) {
            const mainImg = offer.images[0]; // Miniatura Twardy Regulamin (RGB)
            const galleryImg = offer.images.slice(1);
            
            // VisionAudit odpala asynchronicznie odczyt. Jeśli rzuci błąd - złapie to QueueExponentialBackoff.
            visionAudit = await AiService.auditOfferImages(mainImg, galleryImg);
        }

        // --- 2. Tekstowy SEO / GEO 2026 Builder (Text AI)
        // Zczytanie Features i Atrybutów do tablicy 
        const features = offer.features ? Object.keys(offer.features).map(k => ({ name: k, value: offer.features[k] })) : [];
        const baseTitle = offer.text_fields?.name || offer.sku;

        const generatedJson = await AiService.generateOfferJSON(baseTitle, features);
        
        // --- 3. SANITYZACJA (Krytyczny Payload Builder chroniący przed wtopą na REST API)
        let safeTitle = sanitizeTitle(generatedJson.title);
        
        // AI lubi wygenerować JSON gdzie sekcje mają "content" ułomnie.
        let finalDescriptionHtml = '';
        if (generatedJson.sections && Array.isArray(generatedJson.sections)) {
            const rawHtmlChunks = generatedJson.sections
                .filter(s => s.type === 'TEXT') // BL pozwala też na obrazy, ale my upraszczamy i czyścimy tekst
                .map(s => s.content);
                
            const rawMerged = rawHtmlChunks.join('');
            // Fizycznie uruchamiamy Regex Niszczyciel (Zostawia TYLKO 7 dopuszczalnych znaków wg. PRD!)
            finalDescriptionHtml = sanitizeHtml(rawMerged);
        }

        // --- 4. Zapis Wyników (Eksport Danych do bazy gniazdowej)
        await BaseLinkerService.updateProductDescriptionAndTitle(inventoryId, offer.id, safeTitle, finalDescriptionHtml);
        
        console.log(`[Optimizer Service] Zakończono dla [${offer.sku}].`);
        
        return {
            vision_status: visionAudit,
            applied_title: safeTitle,
            status_code: 200
        };
    }
    
    /**
     * Endpoint podglądu Frontendu do ładowania wskaźnika % (Status Bar) rury
     */
    static getJobStatus(jobId) {
        return queueManager.getJobStatus(jobId);
    }
}

module.exports = OfferOptimizerService;
