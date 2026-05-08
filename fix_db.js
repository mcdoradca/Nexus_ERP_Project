const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function fix() {
  const companies = await prisma.company.findMany({ where: { id: '' } });
  for (const c of companies) {
     const newId = crypto.randomUUID();
     console.log('Fixing company', c.name, 'with new ID', newId);
     await prisma.$executeRaw`UPDATE "Company" SET id = ${newId} WHERE id = ''`;
  }
}
fix().then(()=>process.exit(0)).catch(e => console.error(e));
