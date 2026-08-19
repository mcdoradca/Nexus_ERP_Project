const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const count = await prisma.product.count();
        console.log('Products count:', count);
    } catch (error) {
        console.error('Error:', error);
    }
}
check().finally(() => prisma.$disconnect());
