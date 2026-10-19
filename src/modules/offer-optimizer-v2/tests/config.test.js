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

test('Konfiguracja węzłów: A5 zoptymalizowana (Flash bez thinkingLevel)', () => {
    const configA5 = getNodeConfig(5);
    assert.strictEqual(configA5.model, 'gemini-3.8-flash', 'A5 zostało zoptymalizowane pod kątem kosztów');
    assert.strictEqual(configA5.thinkingLevel, undefined, 'A5 (Flash) nie używa thinkingLevel');
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
    }
});

test('Konfiguracja węzłów: Precyzyjna taksonomia - thinkingLevel HIGH wyłącznie dla modeli Pro (A10 Sentinel)', () => {
    const proNodes = [10];
    const flashNodes = [1, 2, 4, 5, 6, 7, 9, 11];
    
    for (const id of proNodes) {
        const cfg = getNodeConfig(id);
        assert.strictEqual(cfg.model, 'gemini-3.1-pro-preview', `Węzeł Pro ${id} musi używać gemini-3.1-pro-preview`);
        assert.strictEqual(cfg.thinkingLevel, ThinkingLevel.HIGH, `Węzeł Pro ${id} wymaga ThinkingLevel.HIGH`);
    }

    for (const id of flashNodes) {
        const cfg = getNodeConfig(id);
        assert.strictEqual(cfg.model, 'gemini-3.8-flash', `Węzeł Flash ${id} musi używać gemini-3.8-flash`);
        assert.strictEqual(cfg.thinkingLevel, undefined, `Węzeł Flash ${id} nie może posiadać thinkingLevel`);
    }

    // A1 musi mieć włączony grounding (Google Search)
    const cfgA1 = getNodeConfig(1);
    assert.strictEqual(cfgA1.grounding, true, 'Węzeł A1 musi mieć włączony grounding dla OSINT');
});

test('Ochrona przed błędem 400: Żaden węzeł nie używa ThinkingLevel.MINIMAL (nieobsługiwanego przez API)', () => {
    const nodeIds = [1, 2, 4, 5, 6, 7, 9, 10, 11];
    for (const id of nodeIds) {
        const cfg = getNodeConfig(id);
        assert.notStrictEqual(cfg.thinkingLevel, ThinkingLevel.MINIMAL, `Węzeł ${id} nie może używać MINIMAL - odrzucane przez Google API`);
        if (cfg.thinkingLevel) {
            assert.strictEqual(cfg.thinkingLevel, ThinkingLevel.HIGH, `Węzeł Pro ${id} musi używać HIGH`);
        }
    }
});

