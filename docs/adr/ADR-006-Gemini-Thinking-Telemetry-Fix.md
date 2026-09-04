# ADR 006: Gemini Thinking Telemetry & Payload Fix

**Data:** 2026-08-17
**Status:** Wdrożone (Hotfix main)
**Komponent:** `ai.wrapper.js` (offer-optimizer-v2)

## 1. Kontekst Problemu
Wykryto, że Agent 11 generuje błąd `HTTP 400: Invalid JSON payload received. Unknown name "": Root element must be a message.` podczas wywołań przez oficjalne SDK `@google/genai`. Analiza wskazała, że problemem jest serializacja generowanego z automatu, pustego obiektu `thinkingConfig: {}` lub/oraz atrybutu `responseMimeType: ""` w konfiguracji modelu.

## 2. Eksperyment i Diagnostyka
Wykazano to poprzez uruchomienie lokalnego środowiska opartego na natywnym `fetch` uderzającym bezpośrednio w endpoint API REST: `https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.7-flash:generateContent`.

Użyto autentycznego, 1126-tokenowego Prompt Mastera dla "MIL MIL Argan". Skrypt `repro.js` przetestował 4 warianty zachowania API. Zobacz plik `diagnostyka-gemini.md` (sekcja 6) by uzyskać pełne logi.

**Krytyczny wniosek diagnostyczny (Dla innych agentów programujących AI):**
- Odkryto, że na poziomie API Gemini narzucenie `responseMimeType: "text/plain"` w połączeniu z jawnym włączeniem `thinkingLevel` powoduje wyzerowanie myślenia (`thoughtsTokenCount: 0`).
- SDK `@google/genai` źle obsługuje puste drzewa JSON w obiekcie `generationConfig`.

## 3. Rozwiązanie (Surgical Edits)
Wdrożono łatkę na `ai.wrapper.js` zapobiegającą generowaniu pustego klucza w parametrze `generationConfig`:
```javascript
// Było:
const baseConfig = { thinkingConfig: { thinkingLevel: thinkingLevel } };

// Jest:
const baseConfig = {};
if (thinkingLevel) {
    baseConfig.thinkingConfig = { thinkingLevel: thinkingLevel };
}
```

Dodatkowo w `nodes.config.js` dla Agenta 11 dodano jawny typ: `thinkingLevel: ThinkingLevel.LOW`, aby ujednolicić konfigurację.

## 4. Konsekwencje
System działa bez blokad. Telemetria w logach nie będzie już wyrzucać 400 Bad Request przy odpytywaniu Gemini. Nie wolno włączać `thinkingConfig` u agentów pracujących sztywno na wymuszonym trybie `text/plain` ze względu na zjawisko wycinania tokenów myślowych przez samo Google.
