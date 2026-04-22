const OfferOptimizerService = require('./offer-optimizer.service');
const AiService = require('./ai.service');
const AllegroService = require('./allegro.service');

const startOptimization = async (req, res) => {
    try {
        const { inventoryId, productIds } = req.body;

        if (!inventoryId || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: "Wymagane poprawne ID magazynu (inventoryId) oraz niepusta tablica (productIds)." });
        }

        // Puszcza asynchronicznie, nie blokujemy klienta czekaniem na koniec - zwracamy mu JOB TICKET
        const jobTicket = await OfferOptimizerService.startBulkOptimization(inventoryId, productIds);

        res.status(202).json({
            message: "Masowa restrukturyzacja GEO 2026 i Audyt graficzny rozpoczęte pomyślnie.",
            jobId: jobTicket.id,
            status: jobTicket.status,
            total_items: jobTicket.total
        });

    } catch (error) {
        console.error("[OfferOptimizerController] Błąd Initacji Zlecenia:", error);
        res.status(500).json({ error: error.message || "Wystąpił błąd wewnętrzny serwera." });
    }
};

const checkStatus = (req, res) => {
    try {
        const jobId = req.params.jobId;
        const jobStatus = OfferOptimizerService.getJobStatus(jobId);

        if (!jobStatus) {
            return res.status(404).json({ error: "Brak zlecenia o podanym Job ID w maszynie kolejkującej." });
        }

        res.status(200).json(jobStatus);

    } catch (error) {
        console.error("[OfferOptimizerController] Błąd sprawdzania statusu:", error);
        res.status(500).json({ error: "Błąd odczytu instancji bazy/kolejki pamięci." });
    }
};

const analyzeSingle = async (req, res) => {
    try {
        const { offerId, analysisMode } = req.body;
        const mode = analysisMode || "STANDARD";

        if (!offerId) {
            return res.status(400).json({ error: "Wymagane ID oferty Allegro." });
        }

        console.log(`[Vision API] Rozpoczęto natywną analizę dla ID: ${offerId}. Tryb: ${mode}`);
        
        // Faza 1: Pobieranie pełnych danych z API Allegro
        const offerData = await AllegroService.getFullOfferData(offerId);

        if (!offerData.imageUrls || offerData.imageUrls.length === 0) {
             console.warn("[Vision API] Ostrzeżenie: Oferta nie posiada żadnych zdjęć.");
        }

        // Faza 2: Karmienie Bestii (Gemini 2.5 Pro / 3.1) - Native Analysis
        console.log("[AiService] Odpalanie silnika Multimodalnego dla Native API w tle...");
        const payloadFromGemini = await AiService.generateNativeAnalysis(offerData.textContent, offerData.imageUrls, mode);

        if (!payloadFromGemini || (payloadFromGemini.title === undefined && !payloadFromGemini.htmlContent)) {
             throw new Error("Generative Engine nie zwróciło poprawnej struktury.");
        }

        return res.status(200).json({
            title: payloadFromGemini.title,
            ean: offerData.ean,
            htmlContent: payloadFromGemini.htmlContent,
            images: payloadFromGemini.images || []
        });

    } catch (error) {
        console.error("CRASH: Błąd optymalizatora API:", error.message, error.stack);
        return res.status(500).json({ error: error.message, details: error.message });
    }
};

module.exports = {
    startOptimization,
    checkStatus,
    analyzeSingle
};
