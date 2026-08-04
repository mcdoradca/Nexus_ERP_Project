const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteProducts() {
  try {
    console.log("Rozpoczynam bezpieczne usuwanie produktów...");

    // 1. Odłączenie produktów od istniejących kampanii, aby uniknąć błędów FK Constraint
    const campaignsUpdated = await prisma.campaign.updateMany({
      where: { productId: { not: null } },
      data: { productId: null }
    });
    console.log(`✅ Odłączono główne produkty od ${campaignsUpdated.count} kampanii.`);

    // 2. Usunięcie wszystkich produktów
    const deletedProducts = await prisma.product.deleteMany({});
    console.log(`🗑️ Usunięto całkowicie ${deletedProducts.count} produktów z bazy danych.`);

  } catch (error) {
    console.error("❌ Błąd podczas usuwania produktów:", error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteProducts();
