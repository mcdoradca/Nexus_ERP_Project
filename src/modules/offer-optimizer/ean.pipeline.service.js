const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const SupervisorService = require('./supervisor.service');

// Usunięto lokalny Mutex (activePipelines), ponieważ logiką kolejki zajmuje się teraz Supervisor w Prisma.

class EanPipelineService {
    static async execute(ean) {
        console.log(`[EAN Pipeline] Przekazywanie EAN ${ean} do Supervisora (Kolejkowanie)...`);
        
        // Zamiast liniowego rurociągu delegujemy sterowanie do AgentQueue zarządzanego przez Supervisora.
        const task = await SupervisorService.enqueueTask('EAN_PIPELINE', ean);
        
        return { 
            status: 'queued', 
            taskId: task.id,
            message: `Pipeline dla EAN ${ean} został umieszczony w kolejce nadzorcy.`
        };
    }
}

module.exports = EanPipelineService;
