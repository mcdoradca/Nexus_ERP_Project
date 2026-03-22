const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const campaignsService = {
  async updateCampaign(id, data) {
    const { assignees, assignedGroups, startDate, endDate, budget, plannedCount, soldCount, budgetPOSM, budgetMedia, budgetAgency, brandIds, contractorIds, ...rest } = data;
    const updateData = { ...rest };
    
    if (brandIds && Array.isArray(brandIds)) {
        updateData.brands = { set: brandIds.map(bId => ({ id: bId })) };
    }
    if (contractorIds && Array.isArray(contractorIds)) {
        updateData.contractors = { set: contractorIds.map(cId => ({ id: cId })) };
    }

    if (updateData.productId === '') updateData.productId = null;

    const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: updateData,
        include: { brands: true, contractors: true }
    });
    return updatedCampaign;
  }
};

async function test() {
  const c = await prisma.campaign.findFirst();
  const co = await prisma.company.findFirst();
  console.log('TESTING CAMPAIGN UPDATE...');
  try {
    const res = await campaignsService.updateCampaign(c.id, { contractorIds: [co.id] });
    console.log('OK, CONTRACTORS:', res.contractors.length);
  } catch (err) {
    console.error('ERROR IN PRISMA UPDATE:', err);
  }
}
test().finally(()=>prisma.$disconnect());
