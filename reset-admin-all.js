const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  const result = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { passwordHash: hash }
  });
  console.log("Gotowe, zresetowano kont administracyjnych:", result.count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
