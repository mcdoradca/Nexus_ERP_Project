const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const camps = await prisma.campaign.findMany();
  const comps = await prisma.company.findMany();
  if (camps.length > 0 && comps.length > 0) {
     const c = camps[0];
     const co = comps[0];
     await prisma.campaign.update({
        where: { id: c.id },
        data: { contractors: { connect: [{ id: co.id }] } }
     });
     console.log('Linked company', co.name, 'to campaign', c.name);
  }
}
run().finally(() => prisma.$disconnect());
