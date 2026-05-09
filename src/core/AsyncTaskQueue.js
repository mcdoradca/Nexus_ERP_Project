const socketService = require('./socket');
const EventBus = require('./EventBus');
const { v4: uuidv4 } = require('uuid');

/**
 * Prosty system kolejkowania zadań w tle (Message Broker in-memory).
 * Zastępuje zewnętrzne usługi (Redis/BullMQ) w celu zachowania zgodności z narzuconym środowiskiem.
 * Zapobiega blokowaniu Głównego Wątku (Event Loop) wysyłając odpowiedź HTTP natychmiastowo,
 * a wyniki rozgłasza przez WebSockets (Socket.io).
 */
class AsyncTaskQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Dodaje zadanie do kolejki
     * @param {string} taskName Nazwa/Typ zadania (np. 'EBOOK_GENERATION')
     * @param {string} userId ID użytkownika zlecającego (do wysłania Socket.io)
     * @param {Function} taskFn Asynchroniczna funkcja do wykonania
     * @returns {string} taskId
     */
    enqueue(taskName, userId, taskFn) {
        // Fallback dla userId (jesli system)
        const uid = userId || 'system';
        const taskId = uid + '_' + Date.now();
        
        this.queue.push({
            id: taskId,
            name: taskName,
            userId: uid,
            fn: taskFn,
            status: 'QUEUED',
            createdAt: new Date()
        });
        
        EventBus.publish('task_enqueued', { taskId, taskName, userId: uid });
        
        // Nie blokujemy wątku głównego dodając setImmediate
        setImmediate(() => this.processQueue());
        
        return taskId;
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        const task = this.queue.shift();
        task.status = 'PROCESSING';
        
        console.log(`[TaskQueue] ⚙️ Przetwarzanie zadania w tle: ${task.name} (${task.id})`);
        
        // Emisja startu
        socketService.sendToUser(task.userId, 'task_started', { 
            taskId: task.id, 
            taskName: task.name, 
            message: `Rozpoczęto zadanie w tle: ${task.name}` 
        });

        try {
            // Wykonanie zadania
            const result = await task.fn();
            
            console.log(`[TaskQueue] ✅ Zakończono zadanie: ${task.name} (${task.id})`);
            
            // Emisja sukcesu (wynik przesyłany przez socket)
            socketService.sendToUser(task.userId, 'task_completed', { 
                taskId: task.id, 
                taskName: task.name, 
                result 
            });
            
        } catch (error) {
            console.error(`[TaskQueue] ❌ Błąd zadania ${task.name} (${task.id}):`, error.message);
            
            // Emisja błędu
            socketService.sendToUser(task.userId, 'task_failed', { 
                taskId: task.id, 
                taskName: task.name, 
                error: error.message 
            });
            
            EventBus.publish('task_failed', { taskId: task.id, taskName: task.name, error: error.message });
        } finally {
            this.isProcessing = false;
            // Rekurencyjnie sprawdzamy następne zadania
            setImmediate(() => this.processQueue());
        }
    }
}

module.exports = new AsyncTaskQueue();
