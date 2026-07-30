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

test('Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH', () => {
    const configA5 = getNodeConfig(5);
    // Klasa Pro wg decyzji
    assert.strictEqual(configA5.model, 'gemini-3.1-pro-preview', 'A5 musi używać modelu klasy Pro (gemini-3.1-pro-preview)');
    assert.strictEqual(configA5.thinkingLevel, ThinkingLevel.HIGH, 'A5 musi używać thinkingLevel HIGH');
});
