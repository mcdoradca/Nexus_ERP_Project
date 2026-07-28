const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AiMetricsService {
    /**
     * Zapisuje użycie tokenów agenta AI w bazie Prisma.
     * Metoda w bloku try/catch aby zapobiec wysypaniu się głównego wątku w przypadku chwilowej awarii bazy.
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
        } catch (error) {
            console.error("[AiMetricsService] Błąd logowania telemetrii do bazy danych:", error.message);
        }
    }
}

module.exports = AiMetricsService;
