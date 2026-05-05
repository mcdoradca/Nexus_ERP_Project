const fs = require('fs');
const path = require('path');

const os = require('os');

/**
 * Moduł Reinforcement Learning (Q-Learning) do optymalizacji CPC.
 * Agent traktuje środowisko Allegro jako grę i uczy się metodą prób i błędów.
 * Stan (State): Kategoryzacja produktu (CASH_COW, NEW_RELEASE itp.) + Godzina
 * Akcja (Action): Modyfikatory CPC (+10%, -10%, HOLD)
 * Nagroda (Reward): Obliczane na podstawie wzrostu lub spadku ROI.
 */
class QLearningService {
    constructor() {
        this.qTablePath = path.join(os.tmpdir(), 'nexus_q_table.json');
        this.alpha = 0.1; // Learning rate (szybkość uczenia)
        this.gamma = 0.9; // Discount factor (waga przyszłych nagród)
        this.epsilon = 0.2; // Exploration rate (jak często eksplorujemy zamiast brać najlepszą akcję)
        this.qTable = this._loadQTable();
        
        this.availableActions = ['INCREASE_10', 'DECREASE_10', 'HOLD'];
    }

    _loadQTable() {
        try {
            if (fs.existsSync(this.qTablePath)) {
                return JSON.parse(fs.readFileSync(this.qTablePath, 'utf8'));
            }
        } catch (e) {
            console.error("Błąd ładowania Q-Table", e);
        }
        return {};
    }

    _saveQTable() {
        try {
            const dir = path.dirname(this.qTablePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.qTablePath, JSON.stringify(this.qTable, null, 2));
        } catch (e) {
            console.error("Błąd zapisu Q-Table", e);
        }
    }

    _getStateKey(strategy, currentHour) {
        // Prosty podział godzinowy dla stanu: RANO, DZIEN, WIECZOR, NOC
        let timeWindow = 'DZIEN';
        if (currentHour >= 1 && currentHour <= 5) timeWindow = 'NOC';
        else if (currentHour >= 6 && currentHour <= 11) timeWindow = 'RANO';
        else if (currentHour >= 18 && currentHour <= 22) timeWindow = 'WIECZOR';

        return `${strategy}_${timeWindow}`;
    }

    /**
     * Wybór akcji na podstawie stanu z wykorzystaniem epsilon-greedy policy.
     */
    chooseAction(strategy, currentHour) {
        const state = this._getStateKey(strategy, currentHour);
        if (!this.qTable[state]) {
            this.qTable[state] = { INCREASE_10: 0, DECREASE_10: 0, HOLD: 0 };
        }

        // Eksploracja: losowa akcja (znajdowanie nowych lepszych ścieżek)
        if (Math.random() < this.epsilon) {
            const randomIndex = Math.floor(Math.random() * this.availableActions.length);
            return this.availableActions[randomIndex];
        }

        // Eksploatacja: najlepsza znana akcja
        let bestAction = 'HOLD';
        let maxQ = -Infinity;
        for (const action of this.availableActions) {
            if (this.qTable[state][action] > maxQ) {
                maxQ = this.qTable[state][action];
                bestAction = action;
            }
        }
        return bestAction;
    }

    /**
     * Aktualizacja Q-Table na podstawie odebranej Nagrody (Bellman Equation).
     */
    updateQValue(strategy, currentHour, action, reward) {
        const state = this._getStateKey(strategy, currentHour);
        if (!this.qTable[state]) {
            this.qTable[state] = { INCREASE_10: 0, DECREASE_10: 0, HOLD: 0 };
        }

        // max Q dla kolejnego stanu zakłada, że pozostajemy w podobnym stanie na następnej iteracji
        let maxNextQ = -Infinity;
        for (const a of this.availableActions) {
            if (this.qTable[state][a] > maxNextQ) {
                maxNextQ = this.qTable[state][a];
            }
        }

        const oldQ = this.qTable[state][action];
        // Bellman Equation
        this.qTable[state][action] = oldQ + this.alpha * (reward + this.gamma * maxNextQ - oldQ);
        
        this._saveQTable();
    }
}

module.exports = new QLearningService();
