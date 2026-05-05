const campaignsService = require('./campaigns.service');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const hasMarketingRights = (user) => ['ADMIN', 'PREZES'].includes(user.role) || user.department === 'MARKETING';

async function getAll(req, res) {
    try {
        const campaigns = await campaignsService.getCampaignsForUser(req.user);
        res.status(200).json(campaigns);
    } catch (error) { res.status(500).json({ error: 'Błąd serwera' }); }
}

async function getOne(req, res) {
    try {
        const campaign = await campaignsService.getCampaignById(req.params.id);
        if (!campaign) return res.status(404).json({ error: 'Kampania nie znaleziona' });
        res.status(200).json(campaign);
    } catch (error) { res.status(500).json({ error: 'Błąd serwera' }); }
}

async function create(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień. Tylko Marketing/Zarząd.' });
    try {
        const newCampaign = await campaignsService.createCampaign(req.body, req.user.id);
        res.status(201).json(newCampaign);
    } catch (error) { res.status(500).json({ error: 'Błąd przy tworzeniu kampanii', details: error.message }); }
}

async function update(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień.' });
    try {
        const updated = await campaignsService.updateCampaign(req.params.id, req.body, req.user.id);
        res.status(200).json(updated);
    } catch (error) { 
        console.error("FATAL BŁĄD AKTUALIZACJI KAMPANII:", error);
        res.status(500).json({ error: 'Błąd aktualizacji', details: error.message }); 
    }
}

async function addProduct(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień.' });
    try {
        const { productId, promoMechanic, posmAllocation } = req.body;
        const result = await campaignsService.addCampaignProduct(req.params.id, productId, promoMechanic, posmAllocation);
        res.status(201).json(result);
    } catch (error) { res.status(500).json({ error: 'Błąd powiązania produktu' }); }
}

async function uploadAsset(req, res) {
    if (req.user.department === 'HANDLOWCY') return res.status(403).json({ error: 'Dział handlowy nie może wgrywać projektów kreacji.' });
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const fileExt = file.originalname.split('.').pop();
        const fileName = `camp-${req.params.id}-${Date.now()}.${fileExt}`;
        
        const { error } = await supabase.storage.from('nexus-files').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(fileName);
        const newAsset = await campaignsService.uploadAsset(req.params.id, req.user.id, file.originalname, publicUrl);
        res.status(201).json(newAsset);
    } catch (error) { res.status(500).json({ error: 'Błąd zapisu pliku' }); }
}

async function approveAsset(req, res) {
    // Tylko marketing / zarząd może klepnąć kreację Agencji
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Tylko dział marketingu może zatwierdzać materiały.' });
    try {
        const { status } = req.body; // 'APPROVED' lub 'REJECTED'
        if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Nieprawidłowy status' });
        
        const asset = await campaignsService.approveAsset(req.params.assetId, req.user.id, status);
        res.status(200).json(asset);
    } catch (error) { res.status(500).json({ error: 'Błąd zmiany statusu' }); }
}

async function getSmiPosts(req, res) {
    try {
        const posts = await campaignsService.getSmiPosts(req.params.id);
        res.status(200).json(posts);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania SMI' }); }
}

async function generateAutoSmi(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień. Tylko Marketing/Zarząd.' });
    try {
        const campaign = await campaignsService.getCampaignById(req.params.id);
        if (!campaign) return res.status(404).json({ error: 'Kampania nie znaleziona' });

        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Brak promptu do generacji.' });

        let enrichedContext = '';
        const eanMatch = prompt.match(/\b\d{8,14}\b/);
        if (eanMatch) {
            const ean = eanMatch[0];
            try {
                console.log(`[Deep Research] Rozpoczynam mapowanie po EAN: ${ean}`);
                const BaseLinkerService = require('../offer-optimizer/baselinker.service');
                const { PrismaClient } = require('@prisma/client');
                const prisma = new PrismaClient();
                
                let productData = await prisma.product.findFirst({ where: { ean }, include: { brand: true } });
                
                if (!productData) {
                    const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
                    const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
                    productData = deepData;
                } else if (productData.baselinkerId && productData.baselinkerInventoryId) {
                    try {
                        const deepData = await BaseLinkerService.fetchDeepProductData(productData.baselinkerInventoryId, productData.baselinkerId);
                        productData.features = deepData.features;
                        productData.descriptionHtml = deepData.descriptionHtml;
                    } catch(err) {
                        console.warn("[Deep Research] Błąd dociągania danych BL", err.message);
                    }
                }
                
                enrichedContext = `\n\n[WYNIKI DEEP RESEARCH - BAZA PIM / BASELINKER]\n` +
                `EAN: ${ean}\n` +
                `Dostawca/Importer w bazie: ${productData.brand?.name || productData.manufacturer || 'Brak danych'}\n` +
                `Pełna Nazwa: ${productData.name || 'Brak'}\n` +
                `Parametry / Cechy: ${JSON.stringify(productData.features || {})}\n` +
                `Krótki opis / Copy z bazy: ${productData.descriptionHtml ? productData.descriptionHtml.replace(/<[^>]*>?/gm, '').substring(0, 800) : 'Brak'}\n\n` +
                `ZASADY TWORZENIA TREŚCI:\n` +
                `1. Odróżnij rzeczywistą markę kosmetyku (np. wynikającą z pełnej nazwy, np. Trimay) od nazwy dostawcy/importera (np. PIM-IMPORT). Zawsze używaj rzeczywistej marki kosmetyku w hashtagach i copy (np. #Trimay, a nie #PIMIMPORT).\n` +
                `2. Używaj rzeczywistych parametrów i korzyści wymienionych powyżej.\n` +
                `3. Nie halucynuj nieprawdziwych cech produktu, oprzyj się ściśle na powyższym opisie i własnej wiedzy o tym konkretnym produkcie.`;
                
            } catch (error) {
                console.error("Deep Research EAN Error:", error);
                enrichedContext = `\n\n[UWAGA DEEP RESEARCH] Nie udało się odnaleźć EAN ${eanMatch[0]} w bazie BaseLinker. Nie wymyślaj szczegółów i cech jeśli ich nie znasz.`;
            }
        }

        const aiService = require('../../core/ai.service');
        
        // 1. Zlecenie do Agenta Dyspozytora
        const taskDistribution = await aiService.dispatchSmiTask(prompt);
        console.log("[Swarm] Dyspozytor rozdzielił zadania:", taskDistribution);

        // 2. Równoległe wywołanie Agentów Specjalistycznych
        const [fbPosts, instaPosts, ttPosts] = await Promise.all([
            aiService.generateFacebookSmi(taskDistribution.facebookCount, taskDistribution.topicGuidance, campaign, enrichedContext),
            aiService.generateInstagramSmi(taskDistribution.instagramCount, taskDistribution.topicGuidance, campaign, enrichedContext),
            aiService.generateTikTokSmi(taskDistribution.tiktokCount, taskDistribution.topicGuidance, campaign, enrichedContext)
        ]);

        const generatedPosts = [...fbPosts, ...instaPosts, ...ttPosts];

        const createdPosts = [];
        for (const p of generatedPosts) {
            const post = await campaignsService.createSmiPost(campaign.id, {
                publishDate: p.publishDate,
                postType: p.postType,
                content: p.content,
                hashtags: p.hashtags,
                notes: p.notes,
                status: 'Szkic'
            });
            createdPosts.push(post);
        }

        res.status(201).json(createdPosts);
    } catch (error) {
        console.error("Auto SMI Error:", error);
        res.status(500).json({ error: 'Błąd automatycznej generacji harmonogramu SMI' });
    }
}

async function createSmiPost(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień. Tylko Marketing/Zarząd.' });
    try {
        const post = await campaignsService.createSmiPost(req.params.id, req.body);
        res.status(201).json(post);
    } catch (error) { res.status(500).json({ error: 'Błąd tworzenia posta SMI' }); }
}

async function updateSmiPost(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień.' });
    try {
        const post = await campaignsService.updateSmiPost(req.params.smiId, req.body);
        res.status(200).json(post);
    } catch (error) { 
        res.status(400).json({ error: error.message || 'Błąd aktualizacji SMI' }); 
    }
}

async function deleteSmiPost(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień.' });
    try {
        await campaignsService.deleteSmiPost(req.params.smiId);
        res.status(204).send();
    } catch (error) { res.status(500).json({ error: 'Błąd usuwania SMI' }); }
}

async function getGlobalSmi(req, res) {
    try {
        const posts = await campaignsService.getAllSmiPosts();
        res.status(200).json(posts);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania panelu MTool' }); }
}

async function uploadSmiMedia(req, res) {
    if (!hasMarketingRights(req.user)) return res.status(403).json({ error: 'Brak uprawnień do edycji harmonogramu.' });
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const fileExt = file.originalname.split('.').pop();
        const fileName = `smi-media-${req.params.smiId}-${Date.now()}.${fileExt}`;
        
        const { error } = await supabase.storage.from('nexus-files').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase Error: ${error.message}` });
        
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(fileName);
        
        const mediaType = file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE';
        
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const post = await prisma.smiPost.findUnique({ where: { id: req.params.smiId } });
        
        const newMediaUrls = [...(post.mediaUrls || []), publicUrl];
        const newMediaTypes = [...(post.mediaTypes || []), mediaType];
        
        const updated = await campaignsService.updateSmiPost(req.params.smiId, { mediaUrls: newMediaUrls, mediaTypes: newMediaTypes });
        res.status(200).json(updated);
    } catch (error) { res.status(500).json({ error: 'Błąd wgrywania pliku medialnego SMI' }); }
}

module.exports = { getAll, getOne, create, update, addProduct, uploadAsset, approveAsset, getSmiPosts, createSmiPost, generateAutoSmi, updateSmiPost, deleteSmiPost, getGlobalSmi, uploadSmiMedia };