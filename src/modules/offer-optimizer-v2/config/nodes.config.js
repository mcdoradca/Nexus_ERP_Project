const { ThinkingLevel } = require('@google/genai');

const nodesConfig = {
    1: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MEDIUM, temperature: 0, grounding: false, maxOutputTokens: 15000, timeoutMs: 120000 },
    2: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL, temperature: 0 },
    4: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW, temperature: 0 },
    5: { model: 'gemini-3.1-pro-preview', thinkingLevel: ThinkingLevel.HIGH },
    6: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW },
    7: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW },
    9: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    10: { model: 'gemini-3.1-pro-preview', thinkingLevel: ThinkingLevel.MEDIUM },
    11: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW, temperature: 0.8, maxOutputTokens: 5000 }
};

function getNodeConfig(agentId) {
    if (!nodesConfig[agentId]) {
        throw new Error(`Brak konfiguracji w nodes.config.js dla agenta: ${agentId}`);
    }
    return nodesConfig[agentId];
}

const FORBIDDEN_SOURCES = [
    'allegro\\.pl', 'allegrolokalnie\\.pl', 'olx\\.pl', 'empik\\.com',
    'ebay\\..*', 'amazon\\..*', 'aliexpress\\..*', 'ceneo\\.pl'
];

const DATA_SOURCE_MODE = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test')) ? 'fixture' : 'api';

module.exports = {
    nodesConfig,
    getNodeConfig,
    FORBIDDEN_SOURCES,
    DATA_SOURCE_MODE
};
