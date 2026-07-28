const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fs = require('fs');
const path = require('path');
const socketService = require('./socket');

const CIRCUIT_BREAKER_FILE = path.join(process.cwd(), 'logs', '.circuit_breaker');

class AiMetricsService {
    /**
     * Sprawdza status Circuit Breakera.
     */
    static isCircuitBreakerTripped() {
        return fs.existsSync(CIRCUIT_BREAKER_FILE);
    }

    /**
     * Zapisuje użycie tokenów agenta AI w bazie Prisma oraz weryfikuje budżet.
     */
    static async logUsage(agentId, modelName, usageMetadata, isSuccess = true, attemptNumber = 1, failureReason = null) {
        try {
            const promptTokens = usageMetadata?.promptTokenCount || 0;
            const completionTokens = usageMetadata?.candidatesTokenCount || 0;
            const totalTokens = usageMetadata?.totalTokenCount || (promptTokens + completionTokens) || 0;
            const thoughtsTokenCount = usageMetadata?.thoughtsTokenCount || 0;
            const cachedContentTokenCount = usageMetadata?.cachedContentTokenCount || 0;

            await prisma.agentMetric.create({
                data: {
                    agentId: agentId || "Unknown_Agent",
                    modelName: modelName || "gemini-model",
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    thoughtsTokenCount,
                    cachedContentTokenCount,
                    isSuccess,
                    attemptNumber,
                    failureReason
                }
            });
            console.log(`[Telemetria] Zarejestrowano koszt dla ${agentId} (${modelName}): ${totalTokens} tk. Sukces: ${isSuccess}, Próba: ${attemptNumber}`);

            // Zabezpieczenie Budżetowe (Sprawdzanie interwału 15-minutowego)
            if (totalTokens > 0) {
                const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
                const recentMetrics = await prisma.agentMetric.aggregate({
                    where: { 
                        createdAt: { gte: fifteenMinsAgo },
                        modelName: { contains: "gemini" } 
                    },
                    _sum: { totalTokens: true }
                });
                
                const sumTokens = recentMetrics._sum.totalTokens || 0;

                if (sumTokens > 500000 && !AiMetricsService.isCircuitBreakerTripped()) {
                    console.error(`🚨 [CIRCUIT BREAKER] Przekroczono 500,000 tokenów w 15 minut! Ostatnia suma: ${sumTokens}. BLOKOWANIE KOLEJKI.`);
                    fs.writeFileSync(CIRCUIT_BREAKER_FILE, `BLOCKED_AT=${new Date().toISOString()}\nREASON=Przekroczono 500k tokenów w 15 min (${sumTokens})`);
                    socketService.broadcast('nexus-notification', {
                        type: 'ERROR',
                        title: '🛑 Zabezpieczenie AI Aktywowane',
                        message: `Zużycie osiągnęło ${sumTokens} tokenów w 15 min. Kolejka AgentQueue została ZABLOKOWANA.`
                    });
                } else if (sumTokens > 200000) {
                    console.error(`⚠️ [AI BUDGET ALARM] Przekroczono 200,000 tokenów w 15 minut! Obecnie: ${sumTokens}.`);
                    socketService.broadcast('nexus-notification', {
                        type: 'WARNING',
                        title: '⚠️ Alarm Budżetu AI',
                        message: `Zużycie osiągnęło ${sumTokens} tokenów w ostatnich 15 minutach!`
                    });
                }
            }

        } catch (error) {
            console.error("[AiMetricsService] Błąd logowania telemetrii do bazy danych:", error.message);
        }
    }
}

module.exports = AiMetricsService;
