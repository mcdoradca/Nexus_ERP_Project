const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultMaterials = [
  { name: 'Tworzywa sztuczne (np. PET, HDPE)', ratePerKg: 2.70 },
  { name: 'Aluminium', ratePerKg: 1.40 },
  { name: 'Metale żelazne', ratePerKg: 0.80 },
  { name: 'Papier i tektura (Karton)', ratePerKg: 0.70 },
  { name: 'Szkło bezbarwne', ratePerKg: 0.30 },
  { name: 'Szkło barwione', ratePerKg: 0.30 },
  { name: 'Drewno (Palety/Skrzynie)', ratePerKg: 0.30 },
  { name: 'Opakowania wielomateriałowe', ratePerKg: 1.70 },
];

async function main() {
  console.log('Rozpoczęcie aktualizacji słownika środowiskowego BDO/EPR...');
  
  for (const mat of defaultMaterials) {
    await prisma.ecoMaterial.upsert({
      where: { name: mat.name },
      update: {},
      create: {
        name: mat.name,
        ratePerKg: mat.ratePerKg
      }
    });
    console.log(`Zapewniono istnienie materiału: ${mat.name} ze stawką bazową.`);
  }

  console.log('Seedowanie cennika ECO zakończone sukcesem.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
