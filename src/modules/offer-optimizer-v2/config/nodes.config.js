const { ThinkingLevel } = require('@google/genai');

const nodesConfig = {
    1: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    2: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    4: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    5: { model: 'gemini-3.1-pro-preview', thinkingLevel: ThinkingLevel.HIGH },
    6: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW },
    7: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW },
    8: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW },
    9: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MINIMAL },
    10: { model: 'gemini-3.1-pro-preview', thinkingLevel: ThinkingLevel.LOW }
};

function getNodeConfig(agentId) {
    if (!nodesConfig[agentId]) {
        throw new Error(`Brak konfiguracji w nodes.config.js dla agenta: ${agentId}`);
    }
    return nodesConfig[agentId];
}

module.exports = {
    nodesConfig,
    getNodeConfig
};
