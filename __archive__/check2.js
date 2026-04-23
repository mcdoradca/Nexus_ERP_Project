const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const camps = await prisma.campaign.findMany({ include: { brands: true, contractors: true } });
  console.log('CAMPAIGNS LENGTH:', camps.length);
  camps.forEach(c => {
    console.log(`Campaign: ${c.name}, brands: ${c.brands.map(b=>b.id).join(', ')}, contractors: ${c.contractors.map(co=>co.id).join(', ')}`);
  });
}
run().finally(() => prisma.$disconnect());
