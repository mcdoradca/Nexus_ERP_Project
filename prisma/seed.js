const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Rozpoczynam seeding bazy danych Nexus ERP...');

  // 1. Czyszczenie starych danych (dla bezpieczeństwa podczas testów)
  // Najpierw usuwamy powiązanie Focus Mode z użytkowników (cykliczna zależność User <-> Task)
  await prisma.user.updateMany({ data: { activeTaskId: null } });

  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.directMessage.deleteMany();
  await prisma.globalMessage.deleteMany();
  await prisma.task.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 2. Tworzenie zespołu (Słownik Użytkowników)
  const adminHash = await bcrypt.hash('admin123', 10);
  const userHash = await bcrypt.hash('user123', 10);
  const u1 = await prisma.user.create({
    data: { email: 'anna@nexus.local', name: 'Anna K.', role: 'USER', group: 'PRACOWNICY', department: 'HANDLOWCY', passwordHash: userHash, color: 'bg-blue-100 text-blue-700' }
  });
  const u2 = await prisma.user.create({
    data: { email: 'piotr@nexus.local', name: 'Piotr M.', role: 'USER', group: 'PRACOWNICY', department: 'MAGAZYN', passwordHash: userHash, color: 'bg-orange-100 text-orange-700' }
  });
  const u3 = await prisma.user.create({
    data: { email: 'zosia@nexus.local', name: 'Zosia W.', role: 'USER', group: 'PRACOWNICY', department: 'MARKETING', passwordHash: userHash, color: 'bg-pink-100 text-pink-700' }
  });
  const u4 = await prisma.user.create({
    data: { id: 'admin-id', email: 'admin@aps.local', name: 'Zarząd', role: 'ADMIN', group: 'PRACOWNICY', department: 'PREZES', passwordHash: adminHash, color: 'bg-indigo-100 text-indigo-700' }
  });

  // 3. Tworzenie początkowych projektów (Słownik Projektów)
  const p1 = await prisma.project.create({
    data: { name: 'Wdrożenie marki CeraVe', progress: 65, color: 'bg-emerald-500' }
  });
  const p2 = await prisma.project.create({
    data: { name: 'Kampania Q3 - L\'Oreal', progress: 20, color: 'bg-purple-500' }
  });
  const p3 = await prisma.project.create({
    data: { name: 'Optymalizacja Magazynu', progress: 85, color: 'bg-blue-500' }
  });

  // 4. Utworzenie pierwszego przykładowego zadania
  await prisma.task.create({
    data: {
      title: 'Przygotować wycenę dla sieci SuperPharm',
      description: 'Klient oczekuje na przesłanie cennika B2B na Q4.',
      status: 'TODO',
      priority: 'HIGH',
      projectId: p1.id,
      assignees: {
        connect: [{ id: u1.id }]
      },
      creatorId: u4.id
    }
  });

  // 5. Tworzenie Marek (Brands) i Kampanii Testowych
  const b1 = await prisma.brand.create({ data: { name: 'CeraVe' } });
  const b2 = await prisma.brand.create({ data: { name: 'L\'Oreal' } });

  const pd1 = await prisma.product.create({
    data: { name: 'CeraVe Żel Oczyszczający', ean: '1234567890123', sku: 'CER-ZEL-01', brandId: b1.id, stock: 1500, salePrice: 49.99 }
  });

  const now = new Date();
  
  // Kampania "W Trakcie"
  const c1Start = new Date(); c1Start.setDate(c1Start.getDate() - 5);
  const c1End = new Date(); c1End.setDate(c1End.getDate() + 15);
  
  await prisma.campaign.create({
    data: {
      name: 'Promocja Wiosenna CeraVe',
      description: 'Testowa kampania wiosenna - ekspozycja apteczna',
      startDate: c1Start,
      endDate: c1End,
      budget: 15000,
      status: 'W trakcie',
      color: 'bg-emerald-500',
      brandId: b1.id,
      productId: pd1.id,
      plannedCount: 1000,
      soldCount: 450,
      instructions: '1. Umieścić POSM przy kasie\n2. Zgłosić realizację po 1 tygodniu.'
    }
  });

  // Kampania "Planowana" w przyszłości, by przetestować pozycjonowanie na osi (za 3 tygodnie)
  const c2Start = new Date(); c2Start.setDate(c2Start.getDate() + 20);
  const c2End = new Date(); c2End.setDate(c2End.getDate() + 60);

  await prisma.campaign.create({
    data: {
      name: 'L\'Oreal Nowa Seria Lato',
      description: 'Wielka aktywacja zasięgowa lato',
      startDate: c2Start,
      endDate: c2End,
      budget: 55000,
      status: 'Planowana',
      color: 'bg-blue-500',
      brandId: b2.id,
      plannedCount: 5000,
      soldCount: 0,
    }
  });

  console.log('✅ Baza danych została pomyślnie zasilona (Seeded)!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
