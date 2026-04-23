const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.company.findMany().then(c => console.log('Companies:', c.length, c.map(x => ({ nip: x.nip, name: x.name })))).finally(() => prisma.$disconnect());
