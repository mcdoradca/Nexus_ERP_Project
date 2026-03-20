const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

async function getCampaignsForUser(user) {
    if (user.role === 'ADMIN' || user.department === 'MARKETING' || user.department === 'PREZES') {
        return prisma.campaign.findMany({
            include: { campaignProducts: { include: { product: true } }, assets: { include: { uploader: { select: { name: true } } } }, tasks: true, brand: true, product: true },
            orderBy: { startDate: 'asc' }
        });
    }
    if (user.group === 'AGENCJE') {
        return prisma.campaign.findMany({
            where: { tasks: { some: { assignees: { some: { id: user.id } } } } },
            select: { id: true, name: true, description: true, startDate: true, endDate: true, status: true, color: true, tasks: { include: { assignees: true } }, assets: true, brand: true, product: true, brandId: true, productId: true, soldCount: true, plannedCount: true, instructions: true, budget: true },
            orderBy: { startDate: 'asc' }
        });
    }
    if (user.department === 'HANDLOWCY') {
        return prisma.campaign.findMany({
            where: { status: { in: ['Zatwierdzona', 'W trakcie', 'Planowana'] } },
            select: { id: true, name: true, description: true, startDate: true, endDate: true, status: true, color: true, campaignProducts: { include: { product: { select: { sku: true, name: true, stock: true } } } }, assets: { where: { status: 'APPROVED' } }, brand: true, product: true, brandId: true, productId: true, soldCount: true, plannedCount: true, instructions: true, budget: true },
            orderBy: { startDate: 'asc' }
        });
    }
    return [];
}

async function getCampaignById(id) {
    return prisma.campaign.findUnique({
        where: { id },
        include: {
            campaignProducts: { include: { product: true } },
            brand: true,
            product: true,
            assets: { include: { uploader: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: 'desc' } },
            tasks: { include: { assignees: { select: { id: true, name: true, color: true } } }, orderBy: { startDate: 'asc' } } // Zapewnia oś czasu (Gantt)
        }
    });
}

async function createCampaign(data, creatorId) {
    const { name, description, startDate, endDate, budget, budgetMedia, budgetPOSM, budgetAgency, markets, networks, color, brandId, productId, plannedCount, soldCount, instructions } = data;
    const newCampaign = await prisma.campaign.create({ 
        data: { name, description, startDate: new Date(startDate), endDate: new Date(endDate), budget: parseFloat(budget)||0, budgetMedia, budgetPOSM, budgetAgency, markets, networks, color, brandId, productId, plannedCount: parseInt(plannedCount)||0, soldCount: parseInt(soldCount)||0, instructions } 
    });
    EventBus.publish('CampaignCreated', { campaignId: newCampaign.id, creatorId });
    return newCampaign;
}

async function updateCampaign(id, data, editorId) {
    const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data
    });
    EventBus.publish('CampaignUpdated', { campaignId: id, editorId });
    return updatedCampaign;
}

async function addCampaignProduct(campaignId, productId, promoMechanic, posmAllocation) {
    const link = await prisma.campaignProduct.create({
        data: { campaignId, productId, promoMechanic, posmAllocation: parseInt(posmAllocation) || 0 }
    });
    EventBus.publish('CampaignProductAdded', { campaignId, productId });
    return link;
}

async function uploadAsset(campaignId, uploaderId, fileName, fileUrl) {
    const asset = await prisma.campaignAsset.create({ data: { campaignId, uploaderId, name: fileName, fileUrl, status: 'PENDING' } });
    EventBus.publish('CampaignAssetUploaded', { campaignId, uploaderId, assetId: asset.id });
    return asset;
}

async function approveAsset(assetId, approverId, status) {
    const asset = await prisma.campaignAsset.update({ where: { id: assetId }, data: { status }, include: { campaign: true, uploader: true } });
    EventBus.publish('CampaignAssetReviewed', { asset, approverId, status });
    return asset;
}

module.exports = { getCampaignsForUser, getCampaignById, createCampaign, updateCampaign, addCampaignProduct, uploadAsset, approveAsset };