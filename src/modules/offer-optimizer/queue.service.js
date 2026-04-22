const { EventEmitter } = require('events');

class OfferOptimizerQueue extends EventEmitter {
    constructor(concurrency = 2) {
        super();
        this.queue = [];
        this.concurrency = concurrency;
        this.activeCount = 0;
        this.isProcessing = false;
        
        // Status tracking per job batch
        this.jobs = new Map();
    }

    // Dodanie grupy ofert z API do mechanizmu kolejki
    enqueueBatch(jobId, offersArray, processCallback) {
        this.jobs.set(jobId, {
            id: jobId,
            total: offersArray.length,
            completed: 0,
            failed: 0,
            status: 'QUEUED',
            results: [],
            errors: []
        });

        // Wpychamy każdą ofertę jako niezależny mikro-task chronologicznie do rury
        for (const offer of offersArray) {
            this.queue.push({
                jobId,
                offer,
                processCallback,
                retryCount: 0
            });
        }

        this.jobs.get(jobId).status = 'PROCESSING';
        this.emit('batchAdded', jobId);
        this.processQueue();
        
        return this.jobs.get(jobId);
    }

    getJobStatus(jobId) {
        return this.jobs.get(jobId) || null;
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            if (this.activeCount >= this.concurrency) {
                // Skoro osiągneliśmy limit, robimy mikro-uśpienie wątku "szuflady"
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            const task = this.queue.shift();
            this.activeCount++;

            // Rozwidlamy obsługę taska asynchronicznie (Fire&Forget z kontrolą)
            this.executeTaskWithRetry(task).finally(() => {
                this.activeCount--;
            });
        }

        this.isProcessing = false;
    }

    async executeTaskWithRetry(task, maxRetries = 3) {
        const { jobId, offer, processCallback, retryCount } = task;
        const jobStats = this.jobs.get(jobId);

        try {
            const result = await processCallback(offer);
            
            jobStats.completed++;
            jobStats.results.push({ offerId: offer.id || offer.sku, success: true, result });
            this.checkIfJobFinished(jobStats);

        } catch (error) {
            // Natywny Exponential Backoff (Chroniący przed Error 429)
            if (retryCount < maxRetries) {
                console.warn(`[Queue Worker] Wykryto błąd dla oferty ${offer.sku}. Retry ${retryCount + 1}/${maxRetries}. Czekam z Backoffem...`);
                // Wzór Backoff: np. 2000ms ^ 1, 2000ms ^ 2 etc. z uwzględnieniem szumu by nie zablokować API.
                const backoffDelay = Math.pow(2, retryCount) * 1000 + Math.random() * 500; 
                
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                
                task.retryCount++;
                this.queue.unshift(task); // Wpychamy ponownie na sam przód kolejki
            } else {
                console.error(`[Queue Worker] Permanentny błąd (Limit Exceeded) dla ${offer.sku}. Odrzucenie.`);
                jobStats.failed++;
                jobStats.errors.push({ offerId: offer.id || offer.sku, error: error.message || error });
                this.checkIfJobFinished(jobStats);
            }
        }
    }

    checkIfJobFinished(jobStats) {
        if (jobStats.completed + jobStats.failed === jobStats.total) {
            jobStats.status = 'COMPLETED';
            this.emit('jobCompleted', jobStats);
        }
    }
}

// Udostępniamy jako singleton, by Node cache zamykał wątki do jednego Managera
const queueManager = new OfferOptimizerQueue(3); // Tylko 3 concurrent operations, by chronić Google API limits & BaseLinker Limits (współdzielony)

module.exports = queueManager;
