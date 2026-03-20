const EventBus = require('../../core/EventBus');
const notificationsService = require('../communication/notifications.service');
const prisma = require('../../core/prisma');

function registerCampaignListeners() {
    // Kiedy Agencja wgra plik kreacji...
    EventBus.subscribe('CampaignAssetUploaded', async ({ campaignId, uploaderId }) => {
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }});
        const marketers = await prisma.user.findMany({ where: { OR: [{ role: 'ADMIN' }, { department: 'MARKETING' }] } });
        
        const notificationPromises = marketers
            .filter(admin => admin.id !== uploaderId)
            .map(admin => notificationsService.createAndSendNotification(admin.id, 'Kreacja do akceptacji 🎨', `Wgrano nową grafikę do kampanii: ${campaign.name}`, 'info'));
        
        const results = await Promise.allSettled(notificationPromises);
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.error('[EventBus] Błąd wysyłania powiadomienia (CampaignAssetUploaded):', result.reason);
            }
        });
    });

    // Kiedy Marketing klepnie (lub odrzuci) projekt...
    EventBus.subscribe('CampaignAssetReviewed', async ({ asset, approverId, status }) => {
        const statusText = status === 'APPROVED' ? 'Zaakceptowano ✅' : 'Odrzucono ❌';
        try {
            await notificationsService.createAndSendNotification(asset.uploaderId, `Status kreacji: ${statusText}`, `Twój plik w kampanii "${asset.campaign.name}" zmienił status.`, 'info');
        } catch (error) {
            console.error('[EventBus] Błąd wysyłania powiadomienia (CampaignAssetReviewed):', error);
        }
    });
}
module.exports = { registerCampaignListeners };