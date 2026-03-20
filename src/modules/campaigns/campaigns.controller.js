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
    } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji' }); }
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

module.exports = { getAll, getOne, create, update, addProduct, uploadAsset, approveAsset };