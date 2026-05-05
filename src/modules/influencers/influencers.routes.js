const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const vectorMappingService = require('./vectorMappingService');
const socialIntegrationService = require('./socialIntegrationService');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const EventBus = require('../../core/EventBus');

// Endpoint: GET /api/influencers/all
// Pobiera ustrukturyzowany zrzut Repozytorium wszystkich fizycznie zapisanych twórców
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const rawProfiles = await prisma.influencerProfile.findMany({
       orderBy: { createdAt: 'desc' },
       include: {
           deals: { include: { campaign: true } },
           notes: { orderBy: { createdAt: 'desc' } }
       }
    });
    // Bezpieczeństwo: wycinamy grube "wektory" z odpowiedzi sieciowej JSON dla wydajności frontendu
    const sanitizedProfiles = rawProfiles.map(p => {
       const { vectorData, ...rest } = p;
       return rest;
    });
    return res.status(200).json(sanitizedProfiles);
  } catch (err) {
    console.error('[API Smart Repository Read Error]:', err);
    return res.status(500).json({ error: 'Błąd pobierania widoku Repozytorium.' });
  }
});

// Endpoint: POST /api/influencers/hunt
// Przyjmuje Prompt usera i wywołuje model Google Gemini aby wymyślić / wyłowić kandydatów na podstawie wiedzy o świecie
router.post('/hunt', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
       return res.status(400).json({ error: 'Brak specyfikacji kampanii (promptu).' });
    }

    // 1. Uderzenie po generator JSON (Do 10 profili) z Pamięci World-Knowledge
    const huntedProfilesJson = await vectorMappingService.huntInfluencers(prompt);
    
    if (!huntedProfilesJson || !Array.isArray(huntedProfilesJson)) {
        throw new Error("Nieprawidłowy model wymiany JSON z Agenta.");
    }

    const savedRecords = [];
    // 2. Mapowanie masowe (Pętla po ofiarach łowcy) i wektoryzacja każdej z nich do ustrukturyzowanej ramki PIM
    for (const hunted of huntedProfilesJson) {
        // Obliczenie wektora bogatego z finansami
        const baseContentForVector = `${hunted.handle} ${hunted.name} ${hunted.platform} - Followers: ${hunted.followers}. Wektor: ${hunted.niche}. Współpraca preferowana: ${hunted.preferredCollab}, Budżet od ${hunted.minRate} do ${hunted.maxRate} PLN.`;
        const embedding = await vectorMappingService.embedText(baseContentForVector);

        // Import do Bazy Postgres
        const created = await prisma.influencerProfile.upsert({
            where: { handle: hunted.handle },
            update: {
                followers: hunted.followers,
                demographicData: { niche: hunted.niche },
                preferredCollab: hunted.preferredCollab,
                minRate: hunted.minRate || 0,
                maxRate: hunted.maxRate || 0,
                avatarUrl: hunted.avatarUrl || null
            },
            create: {
                handle: hunted.handle,
                name: hunted.name || hunted.handle,
                platform: hunted.platform || "INSTAGRAM",
                followers: hunted.followers || 0,
                demographicData: { niche: hunted.niche || "Wyłowiony przez Agenta PIM z wiedzy globalnej" },
                vectorData: embedding.map(e => e.toString()), // Przekształcenie wektora Float -> String[] w DB
                engagementRate: 0.0,
                authenticityScore: hunted.authenticityScore || 1.0,
                preferredCollab: hunted.preferredCollab || "BARTER",
                minRate: hunted.minRate || 0,
                maxRate: hunted.maxRate || 0,
                avatarUrl: hunted.avatarUrl || null,
                socialUrl: hunted.socialUrl || null,
                email: hunted.email || null
            }
        });
        savedRecords.push(created);
    }

    return res.status(200).json({ success: true, count: savedRecords.length, imported: savedRecords });

  } catch (err) {
    console.error('[API Agent Hunter Payload Error]:', err.message);
    return res.status(500).json({ error: 'Operacja Łowcy zawiodła: ' + err.message });
  }
});

// Endpoint: POST /api/influencers/discovery
// Zwraca posortowanych twórców pod rygorem wektorów sztucznej inteligencji
router.post('/discovery', authenticateToken, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Brak query do wyszukiwarki' });
    }

    // Pobranie żywej, ustrukturyzowanej bazy twórców (zapisy z Importera)
    const influencerProfiles = await prisma.influencerProfile.findMany();
    
    if (influencerProfiles.length === 0) {
      return res.status(200).json([]);
    }

    // Wykorzystanie silnika Gemini AI by przeszukać bazę podług intencji kognitywnych użytkownika
    const rankedInfluencers = await vectorMappingService.matchInfluencersToSearchQuery(query, influencerProfiles);

    return res.status(200).json(rankedInfluencers);
  } catch (err) {
    console.error('[API Smart Discovery Error]:', err.message);
    return res.status(500).json({ error: 'Błąd wewnętrzny wektorowania' });
  }
});

// Endpoint: POST /api/influencers/import
// Rozbija publiczny URL społecznościowy na metadane i wrzuca go do bazy danych wraz z wektorami dla Gemini
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Brak linku społecznościowego' });

    // 1. Scrapowanie danych przez Social Integration
    const scrapedData = await socialIntegrationService.scrapeSocialProfile(url);

    // 2. Tłumaczenie profilu na liczbowe wektory Euklidesowe (do bazy by w przyszłości można było łatwiej szukać)
    // Tworzymy korpus semantyczny
    const semanticCorpus = `${scrapedData.handle} ${scrapedData.name} ${scrapedData.platform} - Followers: ${scrapedData.followers}. Niche: ${scrapedData.demographicData.niche}`;
    const generatedVector = await vectorMappingService.embedText(semanticCorpus);

    // 3. Zapis twardy przez Prisma
    const newProfile = await prisma.influencerProfile.create({
      data: {
        name: scrapedData.name || 'Brak Nazwy',
        handle: scrapedData.handle,
        email: scrapedData.email || null,
        platform: scrapedData.platform,
        followers: Number(scrapedData.followers) || 0,
        engagementRate: parseFloat(scrapedData.engagementRate) || 0.0,
        authenticityScore: scrapedData.authenticityScore || 1.0,
        preferredCollab: scrapedData.preferredCollab || "BARTER",
        minRate: scrapedData.minRate || 0,
        maxRate: scrapedData.maxRate || 0,
        avatarUrl: scrapedData.avatarUrl || null,
        demographicData: scrapedData.demographicData,
        vectorData: generatedVector.map(String), // Ze względu m.in na limity PostgreSQL String[] mapping
      }
    });

    return res.status(201).json({ status: 'Success', profile: newProfile });
  } catch (err) {
    console.error('[API Smart Import Error]:', err);
    // Jeśli Unikalność Handlu zawiedzie
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ten Influencer znajduje się już w CRM.' });
    return res.status(500).json({ error: 'Błąd importowania. Skontaktuj się z administratorem.' });
  }
});

// ==========================================
// 4. [GET] /deals - Pobranie zawartości Lejka CRM
// ==========================================
router.get('/deals', authenticateToken, async (req, res) => {
    try {
        const deals = await prisma.dealIRM.findMany({
            include: { influencer: true },
            orderBy: { id: 'desc' }
        });
        res.json(deals);
    } catch (err) {
        res.status(500).json({ error: "Błąd bazy danych CRM Deals", details: err.message });
    }
});

// ==========================================
// 5. [POST] /deals - Dodanie twórcy do Lejka CRM
// ==========================================
router.post('/deals', authenticateToken, async (req, res) => {
    try {
        let { influencerId, campaignId, productId } = req.body;
        
        // Dynamika relacji. Jeśli użytkownik przekazuje do lejka influencera z pustej ręki CRM, dobieramy ustrukturyzowane rekordy
        if (!campaignId) {
            const firstCamp = await prisma.campaign.findFirst({ orderBy: { createdAt: 'desc' } });
            if (!firstCamp) return res.status(400).json({ error: "Brak zdefiniowanych kampanii w systemie ERP. Zakładka 'Kampanie' musi zawierać min. 1 projekt." });
            campaignId = firstCamp.id;
        }

        if (!productId) {
            const firstProd = await prisma.product.findFirst({ orderBy: { createdAt: 'desc' } });
            if (!firstProd) return res.status(400).json({ error: "Brak zdefiniowanych produktów. Przejdź do 'Magazyn/BDO'." });
            productId = firstProd.id;
        }

        // Zabezpieczenie przed dublowaniem w jednym ogólnym lejku na potrzeby MVP
        const existing = await prisma.dealIRM.findFirst({
            where: { influencerId, campaignId, productId }
        });

        if (existing) {
            return res.status(400).json({ error: "Ten twórca realizuje już zadania w wybranym skojarzeniu produktowym i kampanijnym." });
        }

        const newDeal = await prisma.dealIRM.create({
            data: {
                influencerId,
                campaignId,
                productId,
                status: "NAWIAZANIE"
            },
            include: { influencer: true }
        });
        EventBus.publish('DEAL_MARKETING_COST_UPDATED', { deal: newDeal, source: 'CRM_INFLUENCERS_CREATE' });
        res.status(201).json(newDeal);
    } catch (err) {
        console.error("DealIRM Create Error:", err);
        res.status(500).json({ error: "Nie udało się przypiąć twórcy do Lejka", details: err.message });
    }
});

// ==========================================
// 5.5 [POST] /deals/:id/outreach - AI Outreach Draft Generator
// ==========================================
const aiService = require('../../core/ai.service');

router.post('/deals/:id/outreach', authenticateToken, async (req, res) => {
    try {
        const deal = await prisma.dealIRM.findUnique({
            where: { id: req.params.id },
            include: { influencer: true, product: true }
        });
        if (!deal) return res.status(404).json({ error: "Deal nie istnieje" });

        const draft = await aiService.generateOutreach(deal.influencer, deal.product);
        
        const updated = await prisma.dealIRM.update({
            where: { id: deal.id },
            data: { outreachDraft: draft }
        });

        res.status(200).json(updated);
    } catch (err) {
        console.error("Outreach Generation Error:", err);
        res.status(500).json({ error: "Błąd generowania wiadomości AI", details: err.message });
    }
});

// ==========================================
// 6. [PUT] /deals/:id/status - Zmiana etapu Lejka (Drag & Drop)
// ==========================================
router.put('/deals/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        const updated = await prisma.dealIRM.update({
            where: { id: req.params.id },
            data: { status },
            include: { influencer: true }
        });
        EventBus.publish('DEAL_MARKETING_COST_UPDATED', { deal: updated, source: 'CRM_INFLUENCERS_STATUS_UPDATE' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: "Błąd zmiany statusu", details: err.message });
    }
});

// ==========================================
// 7. [PUT] /api/influencers/:id - Edycja Profilu (CRUD)
// ==========================================
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, email, minRate, maxRate, niche, preferredCollab, socialUrl, engagementRate } = req.body;
        const updated = await prisma.influencerProfile.update({
            where: { id: req.params.id },
            data: {
                name,
                email,
                minRate: parseInt(minRate) || 0,
                maxRate: parseInt(maxRate) || 0,
                demographicData: { niche: niche },
                preferredCollab,
                socialUrl,
                engagementRate: parseFloat(engagementRate)
            }
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: "Błąd aktualizacji bazy influencera", details: err.message });
    }
});

// ==========================================
// 8. [DELETE] /api/influencers/:id - Usuwanie twórcy
// ==========================================
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.influencerProfile.delete({ where: { id: req.params.id } });
        res.status(200).json({ success: true, message: "Konto usunięte bezpowrotnie." });
    } catch (err) {
        res.status(500).json({ error: "Błąd niszczenia encji.", details: err.message });
    }
});

// ==========================================
// 9. [POST] /api/influencers/:id/notes - Notatnik Negocjacyjny
// ==========================================
router.post('/:id/notes', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: "Treść notatki jest wymagana." });

        const note = await prisma.influencerNote.create({
            data: {
                influencerId: req.params.id,
                content: content
            }
        });
        res.status(201).json(note);
    } catch (err) {
        res.status(500).json({ error: "Nie udało się zapisać w Dzienniku", details: err.message });
    }
});

module.exports = router;
