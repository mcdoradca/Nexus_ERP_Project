const EventEmitter = require('events');

/**
 * Wewnętrzna szyna zdarzeń (Event Bus).
 * W przyszłości (gdy system urośnie) ten plik możemy podmienić na 
 * połączenie z Kafka, RabbitMQ lub Redis Pub/Sub, bez zmiany reszty kodu!
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
    }

    // Publikowanie zdarzenia na szynie
    publish(eventName, payload) {
        console.log(`[EVENT BUS] 📢 Emituję: ${eventName} | UserID: ${payload?.userId || payload?.editorId || payload?.creatorId || 'System'}`);
        this.emit(eventName, payload);
    }

    // Nasłuchiwanie na zdarzenie z szyny
    subscribe(eventName, callback) {
        this.on(eventName, callback);
    }
}

module.exports = new EventBus();