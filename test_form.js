const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cs = require('./src/modules/campaigns/campaigns.service');
const fs = require('fs');

async function test() {
  const c = await prisma.campaign.findFirst();
  const formData = {
    name: 'TEST NAME',
    description: '',
    startDate: '2026-03-24',
    endDate: '2026-03-30',
    budget: '',
    budgetMedia: '',
    budgetPOSM: '',
    budgetAgency: '',
    brandIds: [],
    contractorIds: [],
    productId: '',
    plannedCount: '',
    instructions: '',
    color: 'bg-blue-500',
    assignees: [],
    assignedGroups: []
  };

  formData.budget = parseFloat(formData.budget) || 0;
  formData.budgetMedia = parseFloat(formData.budgetMedia) || 0;
  formData.budgetPOSM = parseFloat(formData.budgetPOSM) || 0;
  formData.budgetAgency = parseFloat(formData.budgetAgency) || 0;
  formData.plannedCount = parseInt(formData.plannedCount) || 0;
  if (!formData.productId) delete formData.productId;

  try {
    await cs.updateCampaign(c.id, formData, 'system');
    console.log('SUCCESS!');
  } catch (err) {
    fs.writeFileSync('test_out.txt', err.message);
    console.log('Wrote error to test_out.txt');
  }
}
test().catch(e => console.log(e.message)).finally(()=>prisma.$disconnect());
