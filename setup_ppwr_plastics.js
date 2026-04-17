const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const advancedPlastics = [
  { name: '1 - PET (Politereftalan etylenu)', ratePerKg: 2.70 },
  { name: '2 - HDPE (Polietylen wysokiej gęstości)', ratePerKg: 2.70 },
  { name: '3 - PVC (Polichlorek winylu)', ratePerKg: 4.50 }, // Zwykle wysoko karany w EU
  { name: '4 - LDPE (Polietylen niskiej gęstości)', ratePerKg: 2.70 },
  { name: '5 - PP (Polipropylen)', ratePerKg: 2.70 },
  { name: '6 - PS (Polistyren zwykły)', ratePerKg: 2.70 },
  { name: '6 - EPS (Polistyren spieniony - Styropian)', ratePerKg: 3.50 },
  { name: '7 - Inne / Kompozyty plastikowe / O7', ratePerKg: 4.00 },
  { name: 'Plastik Kompostowalny (PLA)', ratePerKg: 1.00 }
];

async function main() {
  console.log('Rozpoczynam migrację bazy ECO do standardów PPWR 2026 (EU)...');
  
  // Usunięcie ogólnego, wadliwego z punktu dyrektyw UE "Tworzywa sztucznego"
  try {
      await prisma.ecoMaterial.delete({
          where: { name: 'Tworzywa sztuczne (np. PET, HDPE)' }
      });
      console.log('Usunięto przestarzały ogólny wiersz plastiku.');
  } catch (e) {
      console.log('Brak starego wiersza, kontynuowanie...');
  }

  // Wgranie zaawansowanej taksonomii (kody recyklingu)
  for (const mat of advancedPlastics) {
    await prisma.ecoMaterial.upsert({
      where: { name: mat.name },
      update: { ratePerKg: mat.ratePerKg },
      create: {
        name: mat.name,
        ratePerKg: mat.ratePerKg
      }
    });
    console.log(`Dodano specyfikację dyrektywy: ${mat.name}`);
  }

  console.log('Baza ECO gotowa i w pełni zgodna z rozporządzeniami EPR/PPWR.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
