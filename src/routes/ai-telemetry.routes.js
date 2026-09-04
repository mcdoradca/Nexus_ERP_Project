const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Koszty dla poszczególnych modeli wg. cennika (za 1M tokenów w USD)
const PRICING_PER_1M = {
    'gemini-1.5-pro': { input: 3.50, output: 10.50, cached: 1.75 },
    'gemini-3.1-pro-preview': { input: 5.00, output: 15.00, cached: 2.50 }, // Przykładowe wyższe stawki dla wersji preview
    'gemini-1.5-flash': { input: 0.075, output: 0.30, cached: 0.0375 },
    'gemini-3.7-flash': { input: 0.10, output: 0.40, cached: 0.05 },
    'text-embedding-004': { input: 0.01, output: 0, cached: 0 },
    'default': { input: 0, output: 0, cached: 0 }
};

function calculateCost(modelName, promptTokens, completionTokens, cachedTokens = 0, thoughtsTokens = 0) {
    const rates = PRICING_PER_1M[modelName] || PRICING_PER_1M['default'];
    const standardPrompt = Math.max(0, promptTokens - cachedTokens);
    
    const costInput = (standardPrompt / 1000000) * rates.input;
    const costCached = (cachedTokens / 1000000) * rates.cached;
    const costOutput = (completionTokens / 1000000) * rates.output;
    
    return costInput + costCached + costOutput;
}

router.get('/stats', async (req, res) => {
    try {
        const metrics = await prisma.agentMetric.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10000 
        });

        const agentStats = {};
        let totalCostUsd = 0;
        let totalTokensSystem = 0;

        metrics.forEach(m => {
            if (!agentStats[m.agentId]) {
                agentStats[m.agentId] = {
                    agentId: m.agentId,
                    calls: 0,
                    successCalls: 0,
                    failCalls: 0,
                    totalPromptTokens: 0,
                    totalCompletionTokens: 0,
                    totalThoughtsTokens: 0,
                    totalCachedTokens: 0,
                    totalTokens: 0,
                    estimatedCostUsd: 0,
                    callsWithRetry: 0,
                    failedTokensBurned: {},
                    modelsUsed: new Set()
                };
            }
            
            const stat = agentStats[m.agentId];
            stat.calls += 1;
            if (m.isSuccess) stat.successCalls += 1;
            else stat.failCalls += 1;
            
            stat.totalPromptTokens += m.promptTokens;
            stat.totalCompletionTokens += m.completionTokens;
            stat.totalThoughtsTokens += m.thoughtsTokenCount;
            stat.totalCachedTokens += m.cachedContentTokenCount;
            stat.totalTokens += m.totalTokens;
            
            if (m.attemptNumber > 1) {
                stat.callsWithRetry += 1;
            }
            
            if (!m.isSuccess) {
                const reason = m.failureReason || 'UNKNOWN_ERROR';
                if (!stat.failedTokensBurned[reason]) stat.failedTokensBurned[reason] = 0;
                stat.failedTokensBurned[reason] += m.totalTokens;
            }
            
            stat.modelsUsed.add(m.modelName);

            const callCost = calculateCost(
                m.modelName, 
                m.promptTokens, 
                m.completionTokens, 
                m.cachedContentTokenCount, 
                m.thoughtsTokenCount
            );
            stat.estimatedCostUsd += callCost;
            
            totalCostUsd += callCost;
            totalTokensSystem += m.totalTokens;
        });

        const reportArray = Object.values(agentStats).map(s => ({
            ...s,
            retryRate: s.calls > 0 ? Number(((s.callsWithRetry / s.calls) * 100).toFixed(2)) : 0,
            modelsUsed: Array.from(s.modelsUsed),
            avgTokensPerCall: Math.round(s.totalTokens / s.calls),
            estimatedCostUsd: Number(s.estimatedCostUsd.toFixed(4))
        })).sort((a, b) => b.totalTokens - a.totalTokens); 

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            overall: {
                totalCallsAnalyzed: metrics.length,
                totalTokensSystem,
                totalEstimatedCostUsd: Number(totalCostUsd.toFixed(4))
            },
            agents: reportArray
        });

    } catch (error) {
        console.error("AI Telemetry API Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
