const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const adIntelligenceService = require('./ad-intelligence.service');
const creativeStudioService = require('./creative-studio.service');

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    : null;

class AdIntelligenceController {

    /**
     * Wgrywanie pliku multimedialnego (zdjęcie, wideo, packshot) bezpośrednio z dysku komputera
     */
    async uploadMediaMaterial(req, res) {
        try {
            const file = req.file;
            if (!file) {
                return res.status(400).json({ success: false, error: 'Brak przesłanego pliku.' });
            }

            const uploadDir = path.join(__dirname, '../../../frontend/public/uploads/ad-intelligence');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const rawExt = (path.extname(file.originalname) || '').toLowerCase() || '.png';
            const safeName = `material_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${rawExt}`;
            const localFilePath = path.join(uploadDir, safeName);

            // 1. Zapis fizyczny pliku w lokalnym publicznym katalogu serwera
            fs.writeFileSync(localFilePath, file.buffer);
            const localUrl = `/uploads/ad-intelligence/${safeName}`;

            // 2. Upload do Supabase Storage jeśli skonfigurowano
            let publicUrl = null;
            if (supabase) {
                try {
                    const storagePath = `ad-intelligence/materials/${safeName}`;
                    const { error } = await supabase.storage
                        .from('nexus-files')
                        .upload(storagePath, file.buffer, {
                            contentType: file.mimetype,
                            upsert: true
                        });
                    if (!error) {
                        const { data } = supabase.storage.from('nexus-files').getPublicUrl(storagePath);
                        publicUrl = data?.publicUrl || null;
                    }
                } catch (supaErr) {
                    console.warn('[AdIntelligenceController] Ostrzeżenie uploadu do Supabase:', supaErr.message);
                }
            }

            const isVideo = file.mimetype.startsWith('video/') || ['.mp4', '.mov', '.webm', '.avi'].includes(rawExt);
            const mediaType = isVideo ? 'video' : 'image';

            console.log(`[AdIntelligenceController] Pomyślnie wgrano plik z dysku: "${file.originalname}" (${mediaType}, ${file.size} B) -> ${publicUrl || localUrl}`);

            return res.json({
                success: true,
                url: publicUrl || localUrl,
                localUrl,
                publicUrl,
                fileName: safeName,
                originalName: file.originalname,
                mediaType,
                size: file.size
            });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w uploadMediaMaterial:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Błąd podczas wgrywania pliku z komputera.'
            });
        }
    }

    /**
     * Pobiera listę produktów z PIM (baza Nexus ERP) na potrzeby selektora w studio
     */
    async getProductsForPicker(req, res) {
        try {
            const { search } = req.query;
            const whereClause = search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { sku: { contains: search, mode: 'insensitive' } },
                    { ean: { contains: search, mode: 'insensitive' } }
                ]
            } : {};

            const products = await prisma.product.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    ean: true,
                    salePrice: true,
                    basePrice: true,
                    imageUrl: true,
                    images: true,
                    descriptionHtml: true,
                    features: true,
                    status: true,
                    brand: { select: { id: true, name: true } }
                },
                orderBy: { name: 'asc' },
                take: 100
            });

            return res.json({ success: true, products });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w getProductsForPicker:', err);
            return res.status(500).json({ success: false, error: 'Błąd pobierania produktów z PIM.' });
        }
    }

    /**
     * Skanuje reklamy konkurencji, ocenia je przez Gemini 3.8 Flash i syntetyzuje 28 hooków przez Gemini 3.1 Pro
     * z uwzględnieniem wybranego produktu z PIM
     */
    async scanAndAnalyze(req, res) {
        try {
            const { query, dataset, brandProfile, limit, productId, apifyToken, apifyDatasetId } = req.body;
            const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 300);

            console.log(`[AdIntelligenceController] Otrzymano żądanie skanowania rynku dla: "${query || 'produkt PIM'}" (Produkt ID: ${productId || 'brak'}, Limit PL: ${safeLimit})...`);

            // Pobieramy dane fizycznego produktu z PIM jeśli został wskazany, lub tworzymy syntetyczny profil produktu spoza PIM
            let productData = null;
            if (productId) {
                productData = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { brand: true }
                });
            } else if (brandProfile && (brandProfile.name || brandProfile.customProductImgUrl || brandProfile.usp)) {
                productData = {
                    id: null,
                    name: brandProfile.name || query || 'Produkt',
                    imageUrl: brandProfile.customProductImgUrl || null,
                    images: brandProfile.customProductImgUrl ? [brandProfile.customProductImgUrl] : [],
                    salePrice: brandProfile.salePrice || null,
                    brand: { name: brandProfile.name || 'Nasza Marka' },
                    features: brandProfile.usp || null,
                    descriptionHtml: brandProfile.proof || null
                };
            }

            const effectiveQuery = (query || '').trim() || (productData ? productData.name : '');
            if (!effectiveQuery && (!dataset || dataset.length === 0) && !apifyDatasetId) {
                return res.status(400).json({ success: false, error: 'Wymagane jest podanie słowa kluczowego, nazwy marki, wyboru produktu z PIM lub datasetu Apify.' });
            }

            // 1. Ingestia reklam z autentycznych źródeł (Apify / Live Search / Meta API / Dataset)
            const ads = await adIntelligenceService.fetchCompetitorAds({
                query: effectiveQuery,
                dataset: dataset || null,
                apifyToken: apifyToken || null,
                apifyDatasetId: apifyDatasetId || null,
                limit: safeLimit
            });

            // 2. Scoring wielomodalny i analiza Time-Decay (Gemini 3.8 Flash)
            const scoreResult = await adIntelligenceService.scoreAdsWithGemini(ads, brandProfile || {});

            // 3. Synteza kątów, 28 hooków i matrycy kreacji (Gemini 3.1 Pro z integracją PIM)
            const strategyResult = await adIntelligenceService.synthesizeAnglesAndHooks({
                topWinners: scoreResult.topWinners,
                marketInsights: scoreResult.marketInsights,
                brandProfile: brandProfile || {},
                productData: productData || {}
            });

            return res.json({
                success: true,
                totalScanned: scoreResult.totalScanned,
                topWinners: scoreResult.topWinners,
                marketInsights: scoreResult.marketInsights,
                strategy: strategyResult,
                product: productData ? {
                    id: productData.id,
                    name: productData.name,
                    sku: productData.sku || 'Spoza PIM',
                    salePrice: productData.salePrice,
                    imageUrl: productData.imageUrl,
                    images: productData.images
                } : null,
                notice: scoreResult.totalScanned === 0 
                    ? 'Nie wykryto aktywnych reklam w bibliotece dla tego hasła w Polsce. Strategia została wygenerowana w oparciu o profil produktu z PIM.'
                    : null
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
     * Generuje fizyczne pliki multimedialne: statyki (Sharp + Shadow Baking) oraz Reels (FFmpeg)
     */
    async generateCreativeAssets(req, res) {
        try {
            const { briefs, brandProfile, productId } = req.body;

            if (!Array.isArray(briefs) || briefs.length === 0) {
                return res.status(400).json({ success: false, error: 'Brak zdefiniowanych briefów kreacji do wygenerowania.' });
            }

            let productData = null;
            if (productId) {
                productData = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { brand: true }
                });
            } else if (brandProfile && (brandProfile.name || brandProfile.customProductImgUrl || brandProfile.usp)) {
                productData = {
                    id: null,
                    name: brandProfile.name || 'Produkt',
                    imageUrl: brandProfile.customProductImgUrl || null,
                    images: brandProfile.customProductImgUrl ? [brandProfile.customProductImgUrl] : [],
                    salePrice: brandProfile.salePrice || null,
                    brand: { name: brandProfile.name || 'Nasza Marka' },
                    features: brandProfile.usp || null,
                    descriptionHtml: brandProfile.proof || null
                };
            }

            console.log(`[AdIntelligenceController] Rozpoczynam generowanie ${briefs.length} assetów multimedialnych dla produktu "${productData?.name || 'ogólnego'}"...`);

            const generatedAssets = [];

            for (const item of briefs) {
                const targetBrief = item.brief || item;
                if (item.type === 'REELS' || item.format === 'Rolka (Reels)' || targetBrief.format === 'Rolka (Reels)') {
                    const videoAsset = await creativeStudioService.generateReelsVideo(targetBrief, brandProfile || {}, productData || {});
                    generatedAssets.push(videoAsset);
                } else {
                    const staticAsset = await creativeStudioService.generateStaticAd(targetBrief, brandProfile || {}, productData || {});
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
     * Pojedynczy re-render assetu w trybie HITL (Human-In-The-Loop)
     * Pozwala na natychmiastowe zaktualizowanie grafiki/wideo po edycji copy, scen lub zdjęcia
     */
    async reRenderAsset(req, res) {
        try {
            const { brief, brandProfile, productId } = req.body;

            if (!brief) {
                return res.status(400).json({ success: false, error: 'Wymagany jest obiekt brief do ponownego wyrenderowania.' });
            }

            let productData = null;
            if (productId) {
                productData = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { brand: true }
                });
            } else if (brandProfile && (brandProfile.name || brandProfile.customProductImgUrl || brandProfile.usp)) {
                productData = {
                    id: null,
                    name: brandProfile.name || 'Produkt',
                    imageUrl: brandProfile.customProductImgUrl || null,
                    images: brandProfile.customProductImgUrl ? [brandProfile.customProductImgUrl] : [],
                    salePrice: brandProfile.salePrice || null,
                    brand: { name: brandProfile.name || 'Nasza Marka' },
                    features: brandProfile.usp || null,
                    descriptionHtml: brandProfile.proof || null
                };
            }

            console.log(`[AdIntelligenceController] HITL Re-render assetu: "${brief.headline || brief.title || brief.id}"...`);

            let asset;
            if (brief.type === 'REELS' || brief.format === 'Rolka (Reels)' || brief.mediaType === 'video') {
                asset = await creativeStudioService.generateReelsVideo(brief, brandProfile || {}, productData || {});
            } else {
                asset = await creativeStudioService.generateStaticAd(brief, brandProfile || {}, productData || {});
            }

            return res.json({
                success: true,
                asset
            });
        } catch (err) {
            console.error('[AdIntelligenceController] Błąd w reRenderAsset:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Błąd podczas re-renderowania assetu multimedialnego.'
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
                // Rozkładamy posty co 2 dni w harmonogramie
                const postPublishDate = new Date(baseDate.getTime() + (i * 2 + 1) * 86400000);

                const finalMediaUrl = item.mediaUrl || item.localUrl || null;

                const post = await prisma.smiPost.create({
                    data: {
                        campaignId: campaign.id,
                        brandLine: brandName || item.productName || campaign.name || 'Nexus Brand',
                        publishDate: postPublishDate,
                        postType: item.format || (item.mediaType === 'video' ? 'Rolka (Reels)' : 'Zdjęcie'),
                        content: item.content || item.headline || '',
                        hashtags: item.hashtags || '',
                        hasGraphics: Boolean(finalMediaUrl),
                        mediaUrls: finalMediaUrl ? [finalMediaUrl] : [],
                        mediaTypes: item.mediaType ? [item.mediaType] : ['image'],
                        adBudgetInfo: item.adBudgetInfo || null,
                        notes: item.notes || `Wygenerowano w Ad Intelligence dla ${item.productName || 'produktu'}.`,
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
