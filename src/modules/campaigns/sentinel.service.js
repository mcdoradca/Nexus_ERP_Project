const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiService = require('../../core/ai.service');

async function runSentinelOptimization() {
    console.log('[Sentinel] Uruchamiam skanowanie rynku i analizę postów SMI (Deep Research)...');
    try {
        // Pobieramy posty o statusie 'Szkic'
        const postsToOptimize = await prisma.smiPost.findMany({
            where: { status: 'Szkic' },
            include: { campaign: true }
        });

        if (postsToOptimize.length === 0) {
            console.log('[Sentinel] Brak nowych postów do optymalizacji.');
            return;
        }

        console.log(`[Sentinel] Znaleziono ${postsToOptimize.length} postów do optymalizacji. Uruchamiam Agenta...`);

        // Grupujemy posty po kampanii (by optymalizować kontekstowo per kampania)
        const postsByCampaign = {};
        postsToOptimize.forEach(p => {
            if (!postsByCampaign[p.campaignId]) {
                postsByCampaign[p.campaignId] = { campaign: p.campaign, posts: [] };
            }
            postsByCampaign[p.campaignId].posts.push(p);
        });

        // Wysyłamy do AI
        for (const campaignId in postsByCampaign) {
            const { campaign, posts } = postsByCampaign[campaignId];
            
            try {
                const optimizedPosts = await aiService.optimizeSmiSchedule(posts, campaign);
                
                // Zapisujemy nowe daty i notatki z powrotem do bazy
                for (const opt of optimizedPosts) {
                    await prisma.smiPost.update({
                        where: { id: opt.id },
                        data: {
                            publishDate: new Date(opt.publishDate),
                            notes: opt.notes,
                            status: 'Zoptymalizowane' // Zmieniamy status
                        }
                    });
                }
                console.log(`[Sentinel] Zoptymalizowano kampanię: ${campaign.name}`);
            } catch (err) {
                console.error(`[Sentinel] Błąd optymalizacji kampanii ${campaign.name}:`, err.message);
            }
        }
        
        console.log('[Sentinel] Cykl zakończony sukcesem.');
    } catch (error) {
        console.error('[Sentinel] Błąd główny:', error);
    }
}

module.exports = { runSentinelOptimization };
