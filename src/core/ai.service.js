const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithRetry } = require('../modules/offer-optimizer/ai.service');
// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Use the precise model specified for operations
const MODEL_NAME = 'gemini-3.1-pro-preview';

/**
 * Generates an Answer Engine Optimization (AEO) description for a product.
 */
const generateAEO = async (productData) => {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  
  const prompt = `
Jesteś ekspertem ds. Answer Engine Optimization (AEO) w e-commerce.
Twoim zadaniem jest przekształcenie poniższych danych o produkcie w wysokiej jakości, ustrukturyzowany opis (HTML/tekst), 
który będzie idealnie czytelny i rozumiany przez systemy generatywnego AI (takie jak Google SGE, Perplexity, ChatGPT).
Opis musi odpowiadać na intencje poszukiwaczy, zawierać kluczowe cechy i korzyści w formacie P&A (Problem & Answer).

Dane produktu:
${JSON.stringify(productData, null, 2)}

Zwróć wynik jako gotowy tekst HTML (użyj <h2>, <ul>, <li>, <p>). 
Nie owijaj w tagi typu \`\`\`html.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('[AI Service] Error generating AEO:', error);
    throw new Error('AI AEO Generation Failed');
  }
};

/**
 * Generates a highly personalized outreach draft for an influencer.
 */
const generateOutreach = async (influencerData, productData) => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

  const prompt = `
Jesteś ekspertem PR i Influencer Marketingu. Przygotuj szkic wiadomości e-mail / DM (Outreach) do influencera w sprawie współpracy.

Influencer:
${JSON.stringify(influencerData, null, 2)}

Promowany produkt:
${JSON.stringify(productData, null, 2)}

Wymagania:
- Wiadomość musi być naturalna, personalizowana (nie sztampowa).
- Nawiąż do "authenticityScore" lub platformy twórcy.
- Zaproponuj współpracę barterową lub płatną (zależnie od jego "preferredCollab").
- Bądź zwięzły, konkretny, unikaj lania wody.
- Podpisz jako "Zespół Nexus".

Zwróć tylko treść wiadomości.
  `;

  try {
    const result = await generateWithRetry(model, prompt, 3, "Agent_PR_Outreach");
    return result.response.text().trim();
  } catch (error) {
    console.error('[AI Service] Error generating Outreach:', error);
    throw new Error('AI Outreach Generation Failed');
  }
};

/**
 * Dyspozytor (Dispatcher) - rozbija luźny prompt na zadania dla agentów platformowych.
 */
const dispatchSmiTask = async (userPrompt) => {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
Jesteś Głównym Dyspozytorem zadań (Router Agent). Przeanalizuj poniższe polecenie użytkownika i zadecyduj ile i jakich postów należy zlecić agentom specjalistycznym.
Jeśli użytkownik nie sprecyzuje platformy (np. "rozpisz 5 postów"), rozdziel to rozsądnie (np. 2 na FB, 2 na Insta, 1 TikTok).
Polecenie: "${userPrompt}"

Zwróć WYŁĄCZNIE JSON:
{
  "facebookCount": (liczba),
  "instagramCount": (liczba),
  "tiktokCount": (liczba),
  "topicGuidance": "Krótkie podsumowanie tematyki/wymagań z prompta dla agentów"
}
  `;
  const res = await generateWithRetry(model, prompt, 3, "Agent_Router_SMI");
  return JSON.parse(res.response.text());
};

const _baseSpecialistPrompt = (platform, platformRules, count, topic, campaign, productContext) => `
Jesteś wybitnym Specjalistą ds. Social Media (Agent platformy: ${platform}).
Twoim zadaniem jest stworzenie dokładnie ${count} postów na ${platform} w oparciu o wytyczne kampanii.

Tematyka / Kontekst:
"${topic}"

Kontekst Produktu (Baza PIM - BEZWZGLĘDNA PRAWDA):
${productContext}

Zasady Platformy ${platform}:
${platformRules}

Zwróć JSON jako tablicę obiektów:
[
  {
    "publishDate": "YYYY-MM-DDT12:00:00Z",
    "postType": "${platform === 'TIKTOK' ? 'TIKTOK' : platform === 'INSTAGRAM' ? 'REEL/STORY/POST' : 'POST'}",
    "content": "Treść copy...",
    "hashtags": "Zestaw tagów",
    "notes": "Wytyczne dla grafika/montażysty. Jakie wideo, jaki dźwięk."
  }
]
`;

const generateFacebookSmi = async (count, topic, campaign, productContext) => {
  if (count <= 0) return [];
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", generationConfig: { responseMimeType: "application/json" } });
  const rules = `- Dłuższe formy tekstowe.
- Możesz używać pogrubień tekstowych i emotikon.
- Target to osoby 30+, pisz dojrzalszym językiem.
- Sugeruj linki bezpośrednie w treści.`;
  const res = await generateWithRetry(model, _baseSpecialistPrompt('FACEBOOK', rules, count, topic, campaign, productContext), 3, "Agent_Facebook_SMI");
  return JSON.parse(res.response.text());
};

const generateInstagramSmi = async (count, topic, campaign, productContext) => {
  if (count <= 0) return [];
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", generationConfig: { responseMimeType: "application/json" } });
  const rules = `- Skupienie na wizualiach (Reels, Karuzele).
- Copy estetyczne, podzielone na krótkie akapity, zgrabny hook na początku.
- Zestaw 10-15 bardzo dopasowanych hashtagów (w tym tag marki).
- Podawaj dokładne wytyczne co ma być na obrazku lub wideo (Reel).`;
  const res = await generateWithRetry(model, _baseSpecialistPrompt('INSTAGRAM', rules, count, topic, campaign, productContext), 3, "Agent_Instagram_SMI");
  return JSON.parse(res.response.text());
};

const generateTikTokSmi = async (count, topic, campaign, productContext) => {
  if (count <= 0) return [];
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", generationConfig: { responseMimeType: "application/json" } });
  const rules = `- Pisz copy bardzo krótkie. 90% sukcesu to wideo.
- GŁÓWNE ZADANIE: Opisz szczegółowo SCENARIUSZ WIDEO w polu 'notes' (jaki Hook, jaka muzyka w tle - trending audio, co robi postać).
- Język dynamiczny, młodzieżowy, bezpośredni. Max 3-5 hashtagów.`;
  const res = await generateWithRetry(model, _baseSpecialistPrompt('TIKTOK', rules, count, topic, campaign, productContext), 3, "Agent_TikTok_SMI");
  return JSON.parse(res.response.text());
};

/**
 * Optimizes an existing SMI schedule based on global calendar, weather, and marketplace promo actions.
 */
const optimizeSmiSchedule = async (posts, campaignData) => {
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
    },
    tools: [
      { googleSearch: {} } // Pozwala LLM na szukanie w Google np. "Allegro Days maj 2026"
    ]
  });

  const prompt = `
Jesteś AI "Wydawcą" (Sentinel). Twoim zadaniem jest optymalizacja dat publikacji dla zaplanowanych szkiców postów Social Media.
Otrzymujesz kampanię, która trwa od ${campaignData.startDate} do ${campaignData.endDate}.
Dzisiejsza data to: ${new Date().toISOString()}.

Twoje zadanie:
1. Użyj Google Search do sprawdzenia nachodzących OPUBLIKOWANYCH i POTWIERDZONYCH akcji promocyjnych dużych marketplace'ów (np. Allegro Days, Rossmann, Hebe) w okresie trwania kampanii.
2. Sprawdź kalendarz świąt i wydarzeń, które mogą wpłynąć na konsumentów w tym okresie.
3. Dostosuj podane niżej "publishDate" tak, by maksymalizowały zasięgi:
   - Jeśli potwierdzisz grubą akcję jak Allegro Days, przesuń najważniejsze posty na dni tuż przed nią lub na jej początek.
   - Jeśli to zwykły tydzień, stosuj standardowe "peak hours" (np. wtorki, czwartki po 18:00, weekendy rano).
   - Daty bezwzględnie muszą mieścić się w przedziale trwania kampanii.
   - NIE zmieniaj treści posta ani tagów. Dopisz tylko swoje powody w polu 'notes'.

Dane postów do poprawy (JSON):
${JSON.stringify(posts.map(p => ({ id: p.id, publishDate: p.publishDate, content: p.content, notes: p.notes })), null, 2)}

Zwróć ZMODYFIKOWANY JSON (tablicę obiektów z oryginalnym ID, nowym publishDate w formacie ISO, oraz nowym polem notes z wyjaśnieniem dlaczego przesunąłeś).
Wymagany format:
[
  {
    "id": "oryginalne-id-posta",
    "publishDate": "2026-05-20T18:00:00Z",
    "notes": "Przesunięto na czwartek, by zgrać się ze startem potwierdzonego Allegro Days."
  }
]
  `;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error('[AI Service] Error optimizing SMI Schedule:', error);
    throw new Error('AI SMI Optimization Failed');
  }
};

module.exports = {
  generateAEO,
  generateOutreach,
  dispatchSmiTask,
  generateFacebookSmi,
  generateInstagramSmi,
  generateTikTokSmi,
  optimizeSmiSchedule
};
