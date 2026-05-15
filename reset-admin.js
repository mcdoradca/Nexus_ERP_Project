const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("Znalezieni użytkownicy:", users.map(u => ({ id: u.id, email: u.email, role: u.role })));
  
  if (users.length > 0) {
     const admin = users.find(u => u.role === 'ADMIN') || users[0];
     const hash = await bcrypt.hash('admin123', 10);
     await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: hash }
     });
     console.log(`Pomyślnie zresetowano hasło dla konta: ${admin.email} (nowe hasło: admin123)`);
  } else {
     console.log("Brak użytkowników w bazie! Tworzę konto awaryjne...");
     const hash = await bcrypt.hash('admin123', 10);
     await prisma.user.create({
         data: {
             email: 'admin@nes.it',
             passwordHash: hash,
             name: 'Administrator',
             role: 'ADMIN'
         }
     });
     console.log("Utworzono domyślnego użytkownika. Login: admin@nes.it | Hasło: admin123");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
