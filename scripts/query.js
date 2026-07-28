const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== AI TELEMETRY STATS ===");
    const metrics = await prisma.agentMetric.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200 // pobierz najnowsze
    });
    
    if (metrics.length === 0) {
        console.log("Brak danych w tabeli AgentMetric.");
        return;
    }

    const agentStats = {};
    let totalTokens = 0;
    
    metrics.forEach(m => {
        if (!agentStats[m.agentId]) {
            agentStats[m.agentId] = { calls: 0, totalTokens: 0, totalPromptTokens: 0, totalCachedTokens: 0, failCalls: 0, models: new Set() };
        }
        agentStats[m.agentId].calls += 1;
        agentStats[m.agentId].totalTokens += m.totalTokens;
        agentStats[m.agentId].totalPromptTokens += m.promptTokens;
        agentStats[m.agentId].totalCachedTokens += m.cachedContentTokenCount || 0;
        agentStats[m.agentId].models.add(m.modelName);
        if (!m.isSuccess) agentStats[m.agentId].failCalls += 1;
        totalTokens += m.totalTokens;
    });

    console.table(
        Object.entries(agentStats).map(([agentId, stats]) => ({
            Agent: agentId,
            Calls: stats.calls,
            Failed: stats.failCalls,
            Prompt: stats.totalPromptTokens,
            Cached: stats.totalCachedTokens,
            TotalTokens: stats.totalTokens,
        }))
    );
    console.log(`\nŁącznie tokenów w ostatnich pobranych wywołaniach: ${totalTokens}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
