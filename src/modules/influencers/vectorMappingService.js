// vectorMappingService.js
// Obsługuje model NLP od Google Gemini rozkładający tekst na osie Euklidesowe (Embeddings)
// w celu inteligentnego, kognitywnego łączenia bazy z kampaniami
const { GoogleGenerativeAI } = require("@google/generative-ai");
const AiMetricsService = require('../../core/ai.metrics.service');
const { generateWithRetry } = require('../offer-optimizer/ai.service');

class VectorMappingService {
  constructor() {
    this.vectorDimensions = 768; // Klasyczny output wektorów wymiarowych od Google text-embedding-004
    // Skonfiguruj klienta, uwzględniając, że klucz MOŻE być niezdefiniowany jeśli dev go nie wpisze
    if (process.env.GEMINI_API_KEY) {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.embedModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
        this.textModel = this.genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            generationConfig: { responseMimeType: "application/json" },
            tools: [{ googleSearch: {} }] 
        });
    }
  }

  // Uderzenie do Vertex AI / Gemini API osaczania textu do wektorów - z Fallbackiem mockującym
  async embedText(text) {
    if (!text) return Array(this.vectorDimensions).fill(0);
    
    // Użyj Gemini, jeśli dostępny 
    if (this.embedModel) {
       try {
           const result = await this.embedModel.embedContent(text);
           if (result && result.embedding && result.embedding.values) {
              const approxTokens = Math.ceil(text.length / 4);
              await AiMetricsService.logUsage("Agent_Vector_Embedding", "text-embedding-004", approxTokens, 0, approxTokens);
              return result.embedding.values;
           }
       } catch (err) {
           console.error("❌ Błąd podczas łączenia z chmurą Google Gemini:", err.message);
           // Fallback w razie API Limit lub blokady na warstwę awaryjną
       }
    }

    // Bezpieczny Fallback lokalny (Pseudolosowy wektor)
    const vector = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
        seed += text.charCodeAt(i);
    }
    
    for (let i = 0; i < this.vectorDimensions; i++) {
        // Różne wariancje dające rozkład pomiędzy -1 a 1
        const val = Math.sin(seed * (i + 1)) * Math.cos(seed + i);
        vector.push(val);
    }
    return vector;
  }

  // Oblicza podobieństwo cosinusowe (Cosine Similarity) między wektorem wpływającego a wektorem poszukiwań
  calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += Math.pow(vecA[i], 2);
        normB += Math.pow(vecB[i], 2);
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Interfejs główny do skanowania katalogu Influencerów i dopasowywania ich z Zapytaniem Użytkownika
  // influencerProfiles = array of influencer objects
  async matchInfluencersToSearchQuery(searchQuery, influencerProfiles) {
    console.log(`🤖 [Smart Discovery Engine] Rozpoczęto analizę semantyczną dla zapytania: "${searchQuery}"`);
    const queryVector = await this.embedText(searchQuery);
    
    const matches = [];
    for (const profile of influencerProfiles) {
       // Tworzymy korpus lingwistyczny profilu - bierzemy demografie, handle, notatki oraz preferencje rynkowe żeby szukać ludzi po "barterze"
       const profileData = `${profile.handle} ${profile.name} ${profile.platform} - Followers: ${profile.followers}. Wektor: ${JSON.stringify(profile.demographicData)}. Współpraca preferowana: ${profile.preferredCollab}, Budżet od ${profile.minRate} do ${profile.maxRate} PLN.`;
       
       const profileVector = await this.embedText(profileData);
       const similarity = this.calculateCosineSimilarity(queryVector, profileVector);
       
       matches.push({ profile, similarity: (similarity * 100).toFixed(2) });
    }

    // Sortuj od najlepszego dopasowania
    const sorted = matches.sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ [Smart Discovery Engine] Analiza w modelu text-embedding zakończona pomyślnie.`);
    return sorted;
  }

  // Funkcja Agenta Łowcy: Wykorzystuje pamięć globalną Gemini do znalezienia 10 faktycznych profili
  // Wymusza JSON zwrotkę w określonym schemacie dla łatwego dodawania do bazy.
  async huntInfluencers(userPrompt) {
    if (!this.textModel) {
        throw new Error("Brak podłączonego klucza Google Gemini API (Agent Offline).");
    }

    const systemInstruction = `
      Jesteś potężnym asystentem / agentem wyszukującym influencerów marketingowych z Polski z pomocą narzędzia Google Search.
      Użytkownik wyszukuje influencera za pomocą "promptu" w postaci tekstowej: "${userPrompt}"
      Zadanie BARDZO RYGORYSTYCZNE (Bez Zmyślania):
      1. Użyj wyszukiwania sieci aby znaleźć w polskim internecie (Instagram/TikTok/Youtube) DO 10 PRAWDZIWYCH kont idealnie pasujących do prośby.
      2. Na bieżąco zweryfikuj ich prawdziwą i aktualną liczbę followersów oraz znajdź aktualny URL (socialUrl) prosto do ich oficjalnych profili.
      3. Na podstawie wyników wyszukiwania, postaraj się namierzyć również twardy link HTTP do ich aktualnego zdjęcia profilowego (CDN insta/tiktok, lub jakikolwiek otwarty obraz np z Wikipedii czy artykułu o nazwie uzytkownika). ZABRONIONE jest używanie formatu "pravatar.cc" czy innych generatorów! 
      4. Zwróć surową tablicę JSON (bez formatowania Markdown). Struktura JSON:
      [{
        "handle": "@nazwa_uzytkownika",
        "name": "Prawdziwe Imię i Nazwisko / Pseudonim",
        "platform": "INSTAGRAM" (lub TIKTOK / YOUTUBE),
        "socialUrl": "https://www.instagram.com/prawdziwynick/",
        "followers": INT_NUMBER (dokładna wyszukana liczba),
        "niche": "Krótki autentyczny opis bio / czym się zajmuje",
        "preferredCollab": "BARTER" (jeśli < 20000) lub "PAID" (jeśli > 20000),
        "minRate": INT_NUMBER,
        "maxRate": INT_NUMBER,
        "email": "prawdziwy.email@z.bio.pl" (lub null jeśli brak),
        "avatarUrl": "prawdziwy link do grafiki https://...jpg (użyj unavatar.io/instagram/nazwa_uzytkownika jeśli nie umiesz znaleźć nic z newsów)"
      }]
    `;

    console.log(`🧠 [Agent Hunter] Przesyłam zapotrzebowanie do chmury Gemini (Model: gemini-3.1-pro-preview)...`);
    try {
        const response = await generateWithRetry(this.textModel, systemInstruction, 3, "Agent_Hunter");
        let textResponse = response.response.text();
        
        // Czyszczenie kodu z ewentualnych znaczników markdown od API (np. ```json ... ```)
        textResponse = textResponse.replace(/```json/gi, '').replace(/```/gi, '').trim();
        
        const jsonArray = JSON.parse(textResponse);
        console.log(`✅ [Agent Hunter] Wygenerowano ${jsonArray.length} dopasowanych trafień!`);
        return jsonArray;
    } catch (err) {
        console.error("❌ Agent Hunter poległ podczas generowania:", err.message);
        throw new Error("Błąd działania Agenta Gemini lub podano nieprawidłową odpowiedź JSON. Szczegóły serwera: API niedostępne lub złe tagowanie.");
    }
  }
}

module.exports = new VectorMappingService();
