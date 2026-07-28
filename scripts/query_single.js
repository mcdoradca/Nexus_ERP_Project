const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const metric = await prisma.agentMetric.findFirst({
        where: { agentId: 'Agent_10_Sentinel' },
        orderBy: { createdAt: 'desc' }
    });
    console.log(metric);
}

main().finally(() => prisma.$disconnect());
