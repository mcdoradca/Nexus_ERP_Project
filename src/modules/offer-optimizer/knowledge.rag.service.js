const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiMetricsService = require('../../core/ai.metrics.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Rekomendowany model do wektoryzacji
const EMBEDDING_MODEL_NAME = "gemini-embedding-2";
const embeddingModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });

/**
 * Serwis KnowledgeRagService
 * Obsługuje wektoryzację (embedding) dokumentów tekstowych i wyszukiwanie (RAG)
 * z wykorzystaniem bazy Supabase (pgvector).
 */
class KnowledgeRagService {

  /**
   * Wykonuje wektoryzację tekstu. Zwraca tablicę liczb.
   * Dodatkowo loguje zużycie tokenów przy użyciu AiMetricsService.
   */
  async _getEmbeddings(text, agentId = 'Agent_Vector_Embedding') {
    try {
      const request = {
          content: { role: 'user', parts: [{ text }] },
          outputDimensionality: 768
      };
      const result = await embeddingModel.embedContent(request);
      const embedding = result.embedding;
      
      // Przybliżone zużycie tokenów (w modelu embedding 1 token to ~4 znaki)
      const approxTokens = Math.ceil(text.length / 4);
      await aiMetricsService.logUsage(
        agentId,
        EMBEDDING_MODEL_NAME,
        approxTokens,
        0,
        approxTokens
      );

      return embedding.values;
    } catch (error) {
      console.error(`[_getEmbeddings] Błąd podczas wektoryzacji:`, error.message);
      throw error;
    }
  }

  /**
   * Chunking tekstu na mniejsze fragmenty (np. co 1000 znaków).
   */
  _chunkText(text, chunkSize = 1000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Wgrywa nowy dokument (lub jego fragmenty) do bazy wektorowej.
   * Dzieli długi tekst na chunki i każdy z nich zapisuje jako osobny rekord w `KnowledgeDocument`.
   */
  async ingestDocument(text, title) {
    if (!text || text.trim() === '') {
      throw new Error('Tekst dokumentu jest pusty.');
    }

    const chunks = this._chunkText(text, 1000);
    console.log(`[KnowledgeRagService] Pocięto dokument "${title}" na ${chunks.length} fragmentów.`);

    let inserted = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkTitle = `${title} (Część ${i + 1})`;
      
      // Zdobądź wektory
      const vectorValues = await this._getEmbeddings(chunkText);
      
      // Zapis w Prisma (unsupported `vector(768)`) z użyciem `$executeRawUnsafe` 
      // lub ręcznego formatowania ponieważ typ Unsupported blokuje zwykły `prisma.knowledgeDocument.create` w ORM z wektorem
      // Prisma wymaga rzutowania tablicy na format Postgres wektora: '[0.1, 0.2, ...]'
      const vectorString = `[${vectorValues.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO "KnowledgeDocument" ("id", "title", "content", "embedding", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${chunkTitle}, ${chunkText}, ${vectorString}::vector, now(), now())
      `;
      inserted++;
    }

    return { success: true, chunksInserted: inserted };
  }

  /**
   * Wyszukuje powiązane fragmenty w oparciu o Cosine Similarity w pgvector.
   * Zwraca `limit` najlepszych wyników.
   */
  async searchKnowledge(query, limit = 3) {
    if (!query || query.trim() === '') return [];

    try {
      const queryEmbedding = await this._getEmbeddings(query);
      const vectorString = `[${queryEmbedding.join(',')}]`;

      // pgvector operator <=> oblicza Cosine Distance (im mniejszy dystans tym większe podobieństwo)
      // Pobieramy ID, title, content i liczymy odległość
      const results = await prisma.$queryRaw`
        SELECT 
          id, 
          title, 
          content, 
          1 - (embedding <=> ${vectorString}::vector) as similarity
        FROM "KnowledgeDocument"
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorString}::vector
        LIMIT ${limit}
      `;

      return results;
    } catch (error) {
      console.error(`[searchKnowledge] Błąd szukania:`, error.message);
      return [];
    }
  }
  /**
   * Usuwa wszystkie wektory powiązane z danym tytułem dokumentu.
   */
  async deleteDocumentByTitle(title) {
    try {
      const result = await prisma.knowledgeDocument.deleteMany({
        where: { title }
      });
      console.log(`[RAG] Usunięto dokument "${title}", liczba fragmentów: ${result.count}`);
      return result.count;
    } catch (error) {
      console.error(`[deleteDocumentByTitle] Błąd podczas usuwania dokumentu:`, error.message);
      throw error;
    }
  }

  /**
   * Zwraca statystyki pogrupowane dla bazy wiedzy.
   */
  async getGroupedDocuments() {
      try {
          const docs = await prisma.$queryRaw`
              SELECT title, COUNT(id) as "chunkCount", MAX("createdAt") as "createdAt"
              FROM "KnowledgeDocument"
              GROUP BY title
              ORDER BY "createdAt" DESC
          `;
          // Konwersja BigInt z Postgresa
          return docs.map(d => ({
              ...d,
              chunkCount: Number(d.chunkCount)
          }));
      } catch (error) {
          console.error(`[getGroupedDocuments] Błąd pobierania bazy wiedzy:`, error.message);
          throw error;
      }
  }
}

module.exports = new KnowledgeRagService();
