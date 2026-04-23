const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const all = await prisma.company.findMany();
  console.log("Wszystkie NIPy w bazie:", all.map(c => c.taxId));
}
run().finally(()=>prisma.$disconnect());
