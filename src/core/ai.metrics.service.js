const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AiMetricsService {
    /**
     * Zapisuje użycie tokenów agenta AI w bazie Prisma.
     * Metoda w bloku try/catch aby zapobiec wysypaniu się głównego wątku w przypadku chwilowej awarii bazy.
     */
    static async logUsage(agentId, modelName, promptTokens, completionTokens, totalTokens) {
        try {
            await prisma.agentMetric.create({
                data: {
                    agentId: agentId || "Unknown_Agent",
                    modelName: modelName || "gemini-model",
                    promptTokens: promptTokens || 0,
                    completionTokens: completionTokens || 0,
                    totalTokens: totalTokens || (promptTokens + completionTokens) || 0
                }
            });
            console.log(`[Telemetria] Zarejestrowano koszt dla ${agentId} (${modelName}): ${totalTokens || (promptTokens + completionTokens)} tk.`);
        } catch (error) {
            console.error("[AiMetricsService] Błąd logowania telemetrii do bazy danych:", error.message);
        }
    }
}

module.exports = AiMetricsService;
