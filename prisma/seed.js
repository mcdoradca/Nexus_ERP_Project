const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Rozpoczynam seeding bazy danych Nexus ERP...');

  // 1. Czyszczenie starych danych (dla bezpieczeństwa podczas testów)
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 2. Tworzenie zespołu (Słownik Użytkowników)
  const dummyHash = '$2b$10$xyz123abc456def789ghi0'; // dummy for seeding
  const u1 = await prisma.user.create({
    data: { email: 'anna@nexus.local', name: 'Anna K.', role: 'USER', group: 'PRACOWNICY', department: 'HANDLOWCY', passwordHash: dummyHash, color: 'bg-blue-100 text-blue-700' }
  });
  const u2 = await prisma.user.create({
    data: { email: 'piotr@nexus.local', name: 'Piotr M.', role: 'USER', group: 'PRACOWNICY', department: 'MAGAZYN', passwordHash: dummyHash, color: 'bg-orange-100 text-orange-700' }
  });
  const u3 = await prisma.user.create({
    data: { email: 'zosia@nexus.local', name: 'Zosia W.', role: 'USER', group: 'PRACOWNICY', department: 'MARKETING', passwordHash: dummyHash, color: 'bg-pink-100 text-pink-700' }
  });
  const u4 = await prisma.user.create({
    data: { id: 'admin-id', email: 'admin@aps.local', name: 'Zarząd', role: 'ADMIN', group: 'PRACOWNICY', department: 'PREZES', passwordHash: dummyHash, color: 'bg-indigo-100 text-indigo-700' }
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
      assigneeId: u1.id,
      creatorId: u4.id
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
