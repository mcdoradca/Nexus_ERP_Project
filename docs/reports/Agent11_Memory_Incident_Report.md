# Raport Incydentu: Pamięć Agenta 11 i Konflikt Konfiguracji API (Post-Mortem)
**Data incydentu:** 2026-08-17 (w przedziale od 11:22 do 13:34)
**Komponenty:** `prompt-master.service.js`, `nodes.config.js`, `Agent 11 (Prompt Master)`, `Agent 1 (EAN Pipeline)`
**Commity:** `ae2741c` (Wdrożenie błędu) -> `e50fadb` (Wycofanie / Hotfix)

Niniejszy raport stanowi szczegółową, techniczną analizę błędnych decyzji programistycznych, które zdestabilizowały pracę LLM, oraz sposobów ich wycofania w środowisku produkcyjnym.

---

## 1. Geneza Problemu (Commit `ae2741c` - godz. 11:22)
**Cel:** Ochrona Agenta 11 przed "przeładowaniem kontekstu" (LLM context saturation) i "few-shot poisoningiem". Inżynier założył, że wysyłanie pełnej historii dziesiątek wygenerowanych wcześniej promptów zaburza ocenę sytuacji przez model.

**Co zmieniono w kodzie (`prompt-master.service.js`):**
Zastosowano siłowe przycięcie tablicy bufora pamięci do ostatnich 10 wygenerowanych promptów.
```javascript
// Przed zmianą:
previousPrompts = cacheRecord.value;

// Po zmianie (ae2741c):
// Ograniczamy pamięć do 10 ostatnich promptów, żeby agent nie zafiksował się na starych błędach
previousPrompts = cacheRecord.value.slice(-10);
```

**Konsekwencje wdrożenia:**
Zamiast poprawić jakość, operacja ta wywołała "Amnezję Agenta". Agent 11 generując 11-ty lub 12-ty prompt dla tego samego produktu (EAN), **nie wiedział, że użył już danych pomysłów w krokach 1 i 2**. Spowodowało to **Monokulturę dla EAN-ów** – agent po wyczerpaniu świeżych pomysłów z okna (10) zaczął zapętlać się i w kółko generować te same, zduplikowane wizje artystyczne, łamiąc wytyczną nakazującą różnorodność.

---

## 2. Drugi Zator: Wyhalucynowane Limity API (Zanotowane w `e50fadb`)
Równolegle, w nieudokumentowanym szerzej momencie, do systemu dodano nierealistyczne limity generowanych tokenów, oczekując, że Gemini Flash "wypisze więcej". 

**Obecne w systemie przed Hotfixem (`nodes.config.js`):**
```javascript
1: { model: 'gemini-3.5-flash', ..., maxOutputTokens: 15000, timeoutMs: 120000 },
...
11: { model: 'gemini-3.5-flash', ..., maxOutputTokens: 5000 }
```

**Konsekwencje wdrożenia:**
Model sprzętowo oznaczony jako `gemini-3.5-flash` odrzucał polecenia posiadające `maxOutputTokens` wykraczające poza hard limit serwera Google (powodowało to blokady i 400 Bad Request w RAG oraz przy generowaniu dużych zrzutów tekstowych). 

---

## 3. Rozwiązanie Incydentu (Hotfix Rollback `e50fadb` - godz. 13:34)
Użytkownik dostrzegł destrukcyjne skutki wprowadzonych zmian i wdrożył natychmiastowy rollback (Cofnięcie) w połączonym commicie łatki.

**Dowody kodowe na naprawę:**

### A. Odbudowa pamięci fotograficznej Agenta 11 (`prompt-master.service.js`)
Usunięto wadliwą funkcję `.slice(-10)`. Zezwolono LLM na czytanie CAŁEJ bazy wygenerowanych przez siebie promptów. Mimo rosnącego kontekstu jest to jedyna metoda na stuprocentowe uniknięcie duplikacji scen dla tego samego EANu.
```diff
- // Ograniczamy pamięć do 10 ostatnich promptów, żeby agent nie zafiksował się na starych błędach
- previousPrompts = cacheRecord.value.slice(-10);
+ previousPrompts = cacheRecord.value;
```

### B. Zrzucenie limitatorów sprzętowych (`nodes.config.js`)
Wyczyszczono parametry odcinające wyjście LLM, pozwalając modelom na swobodną, zoptymalizowaną alokację tokenów zgodną z ich bazową sygnaturą w API.
```diff
- 1: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MEDIUM, temperature: 0, grounding: true, maxOutputTokens: 15000, timeoutMs: 120000 },
+ 1: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.MEDIUM, temperature: 0, grounding: true },

- 11: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW, temperature: 0.8, maxOutputTokens: 5000 }
+ 11: { model: 'gemini-3.5-flash', thinkingLevel: ThinkingLevel.LOW, temperature: 0.8 }
```

---

## 4. Wytyczne Zapobiegawcze na Przyszłość (Złota Zasada):
Zabrania się modyfikowania wielkości pobieranej historii w `PrismaClient / AgentCache` poprzez metody ograniczające typu `slice()` bez uprzedniego wdrożenia RAG-a semantycznego opartego o kosinus, który wykluczałby powtórzenia na bazie wektorów zamiast chamskiego ucinania pamięci. 

Zabrania się manipulowania wartością `maxOutputTokens` w `nodes.config.js` bez uprzedniego sprawdzenia absolutnych pułapów restrykcyjnych platformy docelowej GCP (Google Cloud Platform).
