const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

async function getCampaignsForUser(user) {
    if (user.role === 'ADMIN' || user.department === 'MARKETING' || user.department === 'PREZES') {
        return prisma.campaign.findMany({
            include: { 
                campaignProducts: { include: { product: true } }, 
                assets: { include: { uploader: { select: { name: true } } } }, 
                tasks: true, 
                brand: true, 
                product: true,
                assignees: { select: { id: true, name: true, color: true, department: true } }
            },
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
            assignees: { select: { id: true, name: true, color: true, email: true } },
            assets: { include: { uploader: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: 'desc' } },
            tasks: { include: { assignees: { select: { id: true, name: true, color: true } } }, orderBy: { startDate: 'asc' } } // Zapewnia oś czasu (Gantt)
        }
    });
}

async function createCampaign(data, creatorId) {
    const { name, description, startDate, endDate, budget, budgetMedia, budgetPOSM, budgetAgency, markets, networks, color, brandId, productId, plannedCount, soldCount, instructions, assignees, assignedGroups } = data;
    
    // Obsługa relacji wielu-do-wielu dla zespołu przypisanego
    const assigneesQuery = assignees && Array.isArray(assignees) && assignees.length > 0 
        ? { connect: assignees.map(id => ({ id })) } 
        : undefined;

    const newCampaign = await prisma.campaign.create({ 
        data: { 
            name, description, startDate: new Date(startDate), endDate: new Date(endDate), 
            budget: parseFloat(budget)||0, budgetMedia: parseFloat(budgetMedia)||0, budgetPOSM: parseFloat(budgetPOSM)||0, budgetAgency: parseFloat(budgetAgency)||0, 
            markets, networks, color, brandId, productId: productId || null, 
            plannedCount: parseInt(plannedCount)||0, soldCount: parseInt(soldCount)||0, instructions,
            assignedGroups: assignedGroups || [],
            ...(assigneesQuery && { assignees: assigneesQuery })
        } 
    });
    EventBus.publish('CampaignCreated', { campaignId: newCampaign.id, creatorId });
    return newCampaign;
}

async function updateCampaign(id, data, editorId) {
    const { assignees, assignedGroups, startDate, endDate, budget, plannedCount, soldCount, budgetPOSM, budgetMedia, budgetAgency, ...rest } = data;
    
    const updateData = { ...rest };
    if (assignedGroups !== undefined) updateData.assignedGroups = assignedGroups;
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (budget !== undefined) updateData.budget = parseFloat(budget) || 0;
    if (plannedCount !== undefined) updateData.plannedCount = parseInt(plannedCount) || 0;
    if (soldCount !== undefined) updateData.soldCount = parseInt(soldCount) || 0;
    if (budgetPOSM !== undefined) updateData.budgetPOSM = parseFloat(budgetPOSM) || 0;
    if (budgetMedia !== undefined) updateData.budgetMedia = parseFloat(budgetMedia) || 0;
    if (budgetAgency !== undefined) updateData.budgetAgency = parseFloat(budgetAgency) || 0;

    // Resetowanie (Set) po stronie Prisma
    if (assignees && Array.isArray(assignees)) {
        updateData.assignees = { set: assignees.map(aId => ({ id: aId })) };
    }
    
    if (updateData.productId === '') updateData.productId = null; // Zabezpieczenie na puste stringi UUID

    const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: updateData
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
async function getSmiPosts(campaignId) {
    return prisma.smiPost.findMany({
        where: { campaignId },
        orderBy: { publishDate: 'asc' }
    });
}

async function getAllSmiPosts() {
    return prisma.smiPost.findMany({
        include: { campaign: { select: { name: true, color: true } } },
        orderBy: { publishDate: 'asc' }
    });
}

async function createSmiPost(campaignId, data) {
    const { brandLine, publishDate, postType, content, hashtags, notes, redirectUrl, adBudgetInfo, status, mediaUrl, mediaType } = data;
    return prisma.smiPost.create({
        data: {
            campaignId,
            brandLine,
            publishDate: new Date(publishDate),
            postType,
            content,
            hashtags,
            notes,
            redirectUrl,
            adBudgetInfo,
            status: status || 'Szkic',
            mediaUrl,
            mediaType
        }
    });
}

async function updateSmiPost(id, data) {
    const { publishDate, ...rest } = data;
    const updateData = { ...rest };
    if (publishDate) updateData.publishDate = new Date(publishDate);
    
    return prisma.smiPost.update({
        where: { id },
        data: updateData
    });
}

async function deleteSmiPost(id) {
    return prisma.smiPost.delete({ where: { id } });
}

module.exports = { getCampaignsForUser, getCampaignById, createCampaign, updateCampaign, addCampaignProduct, uploadAsset, approveAsset, getSmiPosts, getAllSmiPosts, createSmiPost, updateSmiPost, deleteSmiPost };