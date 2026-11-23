/**
 * Pomocnik paczkowanego zapisu rekordów Prisma (zmniejsza liczbę roundtripów sieciowych DB ~20-50x).
 * Obsługuje zarówno realny `prisma.$transaction([...])`, jak i mocki testowe in-memory bez `$transaction`.
 */
async function runBatchUpserts(items = [], buildPrismaOp, { prismaClient, chunkSize = 50, onItemError = null } = {}) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    const size = Math.max(1, Math.trunc(Number(chunkSize) || 50));
    const hasTx = typeof prismaClient?.$transaction === 'function';
    let processed = 0;

    for (let i = 0; i < items.length; i += size) {
        const chunk = items.slice(i, i + size);
        if (hasTx) {
            let ops = [];
            try {
                ops = chunk.map(item => buildPrismaOp(item));
                await prismaClient.$transaction(ops);
                processed += chunk.length;
                continue;
            } catch (_) {
                if (ops.length > 0) {
                    await Promise.allSettled(ops);
                }
                // Fallback element po elemencie w razie konfliktu jednego wiersza w paczce
            }
        }

        for (const item of chunk) {
            try {
                await buildPrismaOp(item);
                processed++;
            } catch (err) {
                if (typeof onItemError === 'function') {
                    onItemError(err, item);
                } else {
                    throw err;
                }
            }
        }
    }

    return processed;
}

module.exports = {
    runBatchUpserts
};
