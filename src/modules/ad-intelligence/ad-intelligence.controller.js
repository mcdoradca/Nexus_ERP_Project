const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const adIntelligenceService = require('./ad-intelligence.service');
const creativeStudioService = require('./creative-studio.service');

class AdIntelligenceController {

    /**
     * Skanuje reklamy konkurencji, ocenia je przez Gemini 3.8 Flash i syntetyzuje 28 hooków przez Gemini 3.1 Pro
     */
    async scanAndAnalyze(req, res) {
        try {
            const { query, dataset, brandProfile, limit } = req.body;

            console.log(`[AdIntelligenceController] Otrzymano żądanie skanowania rynku dla: "${query || 'domyślna nisza'}"...`);

            // 1. Ingestia reklam
            const ads = await adIntelligenceService.fetchCompetitorAds({
                query: query || 'Kosmetyki do pielęgnacji',
                dataset: dataset || null,
                limit: limit ? parseInt(limit) : 50
            });

            // 2. Scoring wielomodalny i analiza Time-Decay (Gemini 3.8 Flash)
            const scoreResult = await adIntelligenceService.scoreAdsWithGemini(ads, brandProfile || {});

            // 3. Synteza kątów, 28 hooków i matrycy kreacji (Gemini 3.1 Pro)
            const strategyResult = await adIntelligenceService.synthesizeAnglesAndHooks({
                topWinners: scoreResult.topWinners,
                marketInsights: scoreResult.marketInsights,
                brandProfile: brandProfile || {}
            });

            return res.json({
                success: true,
                totalScanned: scoreResult.totalScanned,
                topWinners: scoreResult.topWinners,
                marketInsights: scoreResult.marketInsights,
                strategy: strategyResult
            });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w scanAndAnalyze:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Wewnętrzny błąd podczas analizy reklam konkurencji.'
            });
        }
    }

    /**
     * Generuje fizyczne pliki multimedialne: statyki (Imagen 3 / Sharp) oraz Reels (FFmpeg)
     */
    async generateCreativeAssets(req, res) {
        try {
            const { briefs, brandProfile } = req.body;

            if (!Array.isArray(briefs) || briefs.length === 0) {
                return res.status(400).json({ success: false, error: 'Brak zdefiniowanych briefów kreacji do wygenerowania.' });
            }

            console.log(`[AdIntelligenceController] Rozpoczynam generowanie ${briefs.length} assetów multimedialnych...`);

            const generatedAssets = [];

            for (const item of briefs) {
                if (item.type === 'REELS' || item.format === 'Rolka (Reels)') {
                    const videoAsset = await creativeStudioService.generateReelsVideo(item.brief || item, brandProfile || {});
                    generatedAssets.push(videoAsset);
                } else {
                    const staticAsset = await creativeStudioService.generateStaticAd(item.brief || item, brandProfile || {});
                    generatedAssets.push(staticAsset);
                }
            }

            return res.json({
                success: true,
                generatedAssets
            });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w generateCreativeAssets:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Błąd podczas renderowania assetów multimedialnych.'
            });
        }
    }

    /**
     * Masowy eksport wygenerowanych kreacji do Harmonogramu SMI (tabela SmiPost)
     */
    async exportToSmi(req, res) {
        try {
            const { campaignId, items, brandName } = req.body;

            if (!campaignId) {
                return res.status(400).json({ success: false, error: 'Wymagane jest wskazanie docelowej kampanii (campaignId).' });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, error: 'Brak kreacji do wyeksportowania do harmonogramu.' });
            }

            // Sprawdzamy czy kampania istnieje
            const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
            if (!campaign) {
                return res.status(404).json({ success: false, error: `Kampania o ID ${campaignId} nie istnieje w systemie.` });
            }

            const createdPosts = [];
            const baseDate = new Date();

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Rozkładamy posty co 2-3 dni w harmonogramie
                const postPublishDate = new Date(baseDate.getTime() + (i * 2 + 1) * 86400000);

                const post = await prisma.smiPost.create({
                    data: {
                        campaignId: campaign.id,
                        brandLine: brandName || campaign.name || 'Nexus Brand',
                        publishDate: postPublishDate,
                        postType: item.format || (item.mediaType === 'video' ? 'Rolka (Reels)' : 'Zdjęcie'),
                        content: item.content || item.headline || '',
                        hashtags: item.hashtags || '',
                        hasGraphics: !!item.mediaUrl,
                        mediaUrls: item.mediaUrl ? [item.mediaUrl] : [],
                        mediaTypes: item.mediaType ? [item.mediaType] : [],
                        adBudgetInfo: item.adBudgetInfo || null,
                        notes: item.notes || 'Wygenerowano automatycznie w Ad Intelligence & Creative Studio.',
                        status: 'Do Akceptacji'
                    }
                });

                createdPosts.push(post);
            }

            console.log(`[AdIntelligenceController] Pomyślnie wyeksportowano ${createdPosts.length} postów do Harmonogramu SMI kampanii "${campaign.name}" ✅`);

            return res.json({
                success: true,
                count: createdPosts.length,
                campaignName: campaign.name,
                posts: createdPosts
            });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w exportToSmi:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Błąd podczas eksportu do harmonogramu SMI.'
            });
        }
    }
}

module.exports = new AdIntelligenceController();
