# WERYFIKACJA API DLA NOWEGO SDK @google/genai

Zgodnie z weryfikacją aktualnej dokumentacji sieciowej Google AI for Developers, w szczególności dla Node.js SDK:

## 1. Wersja SDK (Node.js)
- **Źródło:** [Google GenAI SDK GitHub](https://github.com/googleapis/js-genai) / [NPM](https://www.npmjs.com/package/@google/genai)
- **Pakiet:** Obecna wspierana biblioteka to `@google/genai`. Aktualna, sprawdzona wersja pakietu to **`2.14.0`**. Wersja `@google/generative-ai` jest oznaczona jako "legacy" i nie może być używana.
- **Składnia:**
```javascript
const { GoogleGenAI, Type, ThinkingLevel } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

## 2. Dostępne stringi modeli
- **Źródło:** Wyniki empiryczne z `ai.models.list()` (zobacz [LISTMODELS_SNAPSHOT.md](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/docs/LISTMODELS_SNAPSHOT.md))
- Wykorzystywane nazewnictwo w architekturze V2:
  - `gemini-3.7-flash` - szybki model ze zmniejszonym czasem myślenia (dla większości Agenta).
  - `gemini-3.1-pro-preview` - model klasy Pro, o wysokiej zdolności głębokiego wnioskowania (najnowsza dostępna dla naszego API wersja wspierająca `generateContent` i `thinkingLevel: HIGH`). Model `gemini-3.1-pro` nie istnieje w środowisku.

## 3. Składnia `thinkingConfig` i `thinkingLevel`
- **Źródło:** [Thinking Config API](https://ai.google.dev/gemini-api/docs/reasoning)
- Sterowanie poziomem rozumowania osiąga się przez parametr `thinkingLevel` w `thinkingConfig`. Zgodnie ze źródłami, nie można łączyć go z parametrem `thinkingBudget` dla modeli 3.x.
- Wymagane mapowania:
  - Modele Flash (`gemini-3.7-flash`) obsługują: `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`.
  - Modele Pro (`gemini-3.5-pro`) obsługują wyłącznie: `LOW` i `HIGH`.
  - Całkowite wyłączenie myślenia nie jest wspierane; `MINIMAL` to najniższy poziom.
- **Składnia:**
```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3.7-flash',
  contents: 'Tekst zadania...',
  config: {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.LOW
    }
  }
});
```

## 4. Structured Outputs (responseSchema)
- **Źródło:** [Structured Outputs API](https://ai.google.dev/gemini-api/docs/structured-output)
- Wymuszenie formatu bazuje na podaniu parametrów `responseMimeType` i `responseSchema` w obiekcie `config`.
- **Składnia:**
```javascript
config: {
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      nazwa: { type: Type.STRING }
    },
    required: ["nazwa"]
  }
}
```

## 5. Odczyt `usageMetadata` (Telemetria)
- **Źródło:** [Tokens Usage Metadata](https://ai.google.dev/gemini-api/docs/tokens) / [GitHub GenAI Node](https://github.com/googleapis/js-genai)
- Zużycie tokenów znajduje się w obiekcie `response.usageMetadata` (lub w JavaScript SDK z uwzględnieniem camelCase). Zgodnie z oficjalną dokumentacją:
- **Pełna lista kluczowych pól `usageMetadata`:**
  - `promptTokenCount`: Liczba tokenów żądania wejściowego (prompt).
  - `candidatesTokenCount`: Liczba tokenów w wygenerowanej odpowiedzi (ostatecznym kandydacie).
  - `thoughtsTokenCount`: (KRYTYCZNE) Reprezentuje wygenerowane tokeny ukryte użyte podczas wewnętrznego procesu "myślenia" / "rozumowania" modelu. Są one wliczane do całkowitego bilansu (billing), nawet jeśli nie są serwowane użytkownikowi na wyjściu.
  - `totalTokenCount`: Suma powyższych (prompt + finalna odpowiedź + myślenie).
- **Składnia:**
```javascript
const response = await ai.models.generateContent({...});
const metadata = response.usageMetadata;

const promptTokens = metadata.promptTokenCount;
const candidatesTokens = metadata.candidatesTokenCount;
const thoughtsTokens = metadata.thoughtsTokenCount;
const totalTokens = metadata.totalTokenCount;
```
