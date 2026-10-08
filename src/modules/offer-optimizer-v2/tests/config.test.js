const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getNodeConfig } = require('../config/nodes.config.js');
const { ThinkingLevel } = require('@google/genai');

test('Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach', () => {
    const promptsDir = path.join(__dirname, '../prompts');
    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    
    for (const file of files) {
        const content = fs.readFileSync(path.join(promptsDir, file), 'utf8').toLowerCase();
        assert.ok(!content.includes('gemini'), `Plik ${file} zawiera niedozwolony string 'gemini'`);
        assert.ok(!content.includes('thinking'), `Plik ${file} zawiera niedozwolony string 'thinking'`);
    }
});

test('Konfiguracja węzłów: A5 zoptymalizowana (Flash/MEDIUM)', () => {
    const configA5 = getNodeConfig(5);
    assert.strictEqual(configA5.model, 'gemini-3.8-flash', 'A5 zostało zoptymalizowane pod kątem kosztów');
    assert.strictEqual(configA5.thinkingLevel, ThinkingLevel.MEDIUM, 'A5 musi używać thinkingLevel MEDIUM');
});

test('Konfiguracja węzłów: Brak wycofanych parametrów próbkowania (temperature, top_p, top_k, thinkingBudget)', () => {
    const nodeIds = [1, 2, 4, 5, 6, 7, 9, 10, 11];
    for (const id of nodeIds) {
        const cfg = getNodeConfig(id);
        assert.strictEqual(cfg.temperature, undefined, `Węzeł ${id} nie może zawierać parametru temperature`);
        assert.strictEqual(cfg.top_p, undefined, `Węzeł ${id} nie może zawierać parametru top_p`);
        assert.strictEqual(cfg.topP, undefined, `Węzeł ${id} nie może zawierać parametru topP`);
        assert.strictEqual(cfg.top_k, undefined, `Węzeł ${id} nie może zawierać parametru top_k`);
        assert.strictEqual(cfg.topK, undefined, `Węzeł ${id} nie może zawierać parametru topK`);
        assert.strictEqual(cfg.thinkingBudget, undefined, `Węzeł ${id} nie może zawierać parametru thinkingBudget`);
        assert.ok(cfg.thinkingLevel, `Węzeł ${id} musi posiadać jawny thinkingLevel`);
    }
});

test('Konfiguracja węzłów: Precyzyjna taksonomia kognitywna thinkingLevel per agent', () => {
    assert.strictEqual(getNodeConfig(1).thinkingLevel, ThinkingLevel.HIGH, 'A1 (OSINT INCI Deep Search) wymaga HIGH');
    assert.strictEqual(getNodeConfig(2).thinkingLevel, ThinkingLevel.LOW, 'A2 (Sentiment Clusterer) wymaga LOW');
    assert.strictEqual(getNodeConfig(4).thinkingLevel, ThinkingLevel.MEDIUM, 'A4 (Chemical AEO Parser) wymaga MEDIUM');
    assert.strictEqual(getNodeConfig(5).thinkingLevel, ThinkingLevel.MEDIUM, 'A5 (Legal Compliance Shield) wymaga MEDIUM');
    assert.strictEqual(getNodeConfig(6).thinkingLevel, ThinkingLevel.MEDIUM, 'A6 (Master Copywriter) wymaga MEDIUM');
    assert.strictEqual(getNodeConfig(7).thinkingLevel, ThinkingLevel.MEDIUM, 'A7 (Psychology Adaptor) wymaga MEDIUM');
    assert.strictEqual(getNodeConfig(9).thinkingLevel, ThinkingLevel.LOW, 'A9 (Vision Auditor) wymaga LOW');
    assert.strictEqual(getNodeConfig(10).thinkingLevel, ThinkingLevel.HIGH, 'A10 (Master Compliance Sentinel) wymaga HIGH');
    assert.strictEqual(getNodeConfig(11).thinkingLevel, ThinkingLevel.MEDIUM, 'A11 wymaga MEDIUM');
});

