const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenAI } = require('@google/genai');
const aiMetricsService = require('../../core/ai.metrics.service');
const { extractIngredientsFromChunk, normalizeIngredientName } = require('./normalization');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBEDDING_MODEL_NAME = 'gemini-embedding-2';

const CHUNK_MIN = 400;   // znaków — mniejsze fragmenty doklejane do poprzednika
const CHUNK_MAX = 3500;  // znaków — twardy sufit pojedynczego chunku
const DEFAULT_MIN_SIMILARITY = 0.60;

class KnowledgeRagService {

  async _getEmbeddings(text, agentId = 'Agent_Vector_Embedding', taskType = 'RETRIEVAL_DOCUMENT') {
    try {
      const result = await ai.models.embedContent({
        model: EMBEDDING_MODEL_NAME,
        contents: text,
        config: { outputDimensionality: 768, taskType }
      });
      const usage = result?.usageMetadata || result?.response?.usageMetadata;
      if (usage) {
        await aiMetricsService.logUsage(agentId, EMBEDDING_MODEL_NAME, usage, true, 1);
      }
      
      let vec = result.embeddings[0].values;
      const length = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
      if (length > 0) {
        vec = vec.map(val => val / length);
      }
      
      return vec;
    } catch (error) {
      console.error('[_getEmbeddings] Błąd wektoryzacji:', error.message);
      throw error;
    }
  }

  _chunkMarkdown(text, sotModule) {
    const isDictionary = ['SOT_06', 'SOT_10', 'INCI_DICT', 'SOT_05', 'SOT_07'].includes(sotModule);
    const lines = text.split('\n');
    const sections = [];
    let current = { heading: '', body: [] };
    for (const line of lines) {
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        if (current.body.join('\n').trim()) sections.push(current);
        current = { heading: h[2].trim(), body: [] };
      } else {
        current.body.push(line);
      }
    }
    if (current.body.join('\n').trim()) sections.push(current);

    const chunks = [];
    for (const sec of sections) {
      const header = sec.heading ? `[${sec.heading}]\n` : '';
      const bodyText = sec.body.join('\n').trim();
      if (!bodyText) continue;

      if ((header + bodyText).length <= CHUNK_MAX) {
        chunks.push(header + bodyText);
        continue;
      }
      const atoms = bodyText.split(/\n(?=(?:\*\s|-\s|\d+\.\s|\|)|\n)/);
      let buf = header;
      for (const atom of atoms) {
        if ((buf + atom).length > CHUNK_MAX && buf.trim() !== header.trim()) {
          chunks.push(buf.trimEnd());
          buf = header;
        }
        buf += atom + '\n';
      }
      if (buf.trim() && buf.trim() !== header.trim()) chunks.push(buf.trimEnd());
    }

    if (!isDictionary) {
      const merged = [];
      for (const c of chunks) {
        if (merged.length && c.length < CHUNK_MIN &&
            (merged[merged.length - 1].length + c.length) <= CHUNK_MAX) {
          merged[merged.length - 1] += '\n' + c;
        } else {
          merged.push(c);
        }
      }
      return merged;
    }
    
    return chunks;
  }

  async ingestDocument(text, title, meta = {}) {
    if (!text || !text.trim()) throw new Error('Tekst dokumentu jest pusty.');
    const version = meta.version || `v${new Date().toISOString().slice(0, 10)}`;
    const versionedTitle = `${title}@${version}`;
    const chunkType = meta.chunkType || 'DICTIONARY_ENTRY';
    const agents = meta.targetAgents || [];
    const sotModule = meta.sotModule || null;

    if (chunkType === 'GATE' || chunkType === 'RULE') {
      console.warn(`[RAG] "${title}" ma typ ${chunkType}.`);
    }

    // Idempotencja INGESTU: przed wgraniem usuwamy wszystkie wersje TEGO dokumentu!
    await prisma.$executeRaw`
      DELETE FROM "KnowledgeDocument"
      WHERE "title" LIKE ${title + '@%'}
    `;

    const chunks = this._chunkMarkdown(text, sotModule);
    console.log(`[RAG] "${versionedTitle}": ${chunks.length} chunków semantycznych.`);

    const isIngredientModule = ['SOT_06', 'SOT_10', 'INCI_DICT'].includes(sotModule);

    for (let i = 0; i < chunks.length; i++) {
      let finalChunk = chunks[i];
      let entryNameVal = null;

      if (isIngredientModule) {
        const ingredients = extractIngredientsFromChunk(finalChunk, sotModule);
        if (ingredients.length > 0) {
           entryNameVal = `|${ingredients.join('|')}|`;
           const formattedNames = ingredients.map(n => n.toUpperCase()).join(', ');
           finalChunk = `Składnik INCI: ${formattedNames}\n` + finalChunk;
        }
      }

      const vec = await this._getEmbeddings(finalChunk, 'Node0_Ingest/embedding');
      const vectorString = `[${vec.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO "KnowledgeDocument"
          ("id","title","content","embedding","sotModule","targetAgents","chunkType","entryName","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${`${versionedTitle} (Część ${i + 1})`}, ${finalChunk},
                ${vectorString}::vector, ${sotModule}, ${agents},
                ${chunkType}, ${entryNameVal}, now(), now())
      `;
    }
    
    return { success: true, chunksInserted: chunks.length, version };
  }

  async searchKnowledge(query, {
    limit = 3, agentId = 'Agent_Vector_Embedding',
    sotModules = null, minSimilarity = DEFAULT_MIN_SIMILARITY,
  } = {}) {
    if (!query || !query.trim()) return [];
    try {
      const vec = await this._getEmbeddings(query, `${agentId}/embedding`, 'RETRIEVAL_QUERY');
      const vectorString = `[${vec.join(',')}]`;
      const results = await prisma.$queryRaw`
        SELECT id, title, content, "sotModule", "chunkType",
               1 - (embedding <=> ${vectorString}::vector) AS similarity
        FROM "KnowledgeDocument"
        WHERE embedding IS NOT NULL
          AND "sotModule" IS NOT NULL
          ${sotModules && sotModules.length ? Prisma.sql`AND "sotModule" = ANY(${sotModules})` : Prisma.empty}
        ORDER BY embedding <=> ${vectorString}::vector
        LIMIT ${limit}
      `;
      const filtered = results.filter(r => r.similarity >= minSimilarity);
      for (const r of filtered) {
        if (r.chunkType === 'GATE') {
          console.warn(`[RAG] Chunk typu GATE zwrócony przez retrieval (${r.title}).`);
        }
      }
      return filtered;
    } catch (error) {
      console.error('[searchKnowledge] Błąd szukania:', error.message);
      return [];
    }
  }

  async getKnowledgeForIngredients(ingredients, {
    agentId, sotModules, perIngredientLimit = 2,
    minSimilarity = DEFAULT_MIN_SIMILARITY, charBudget = 10000,
  } = {}) {
    if (!sotModules || !Array.isArray(sotModules) || sotModules.length === 0) {
      throw new Error("getKnowledgeForIngredients wymaga podania listy sotModules (zapytania globalne są zakazane).");
    }
    const seen = new Set();
    const block = [];
    const unknown = [];
    let used = 0;

    for (const ing of ingredients) {
      const normalizedIng = normalizeIngredientName(ing);
      const vec = await this._getEmbeddings(ing, `${agentId}/embedding`, 'RETRIEVAL_QUERY');
      const vectorString = `[${vec.join(',')}]`;

      // 1. GATE-3 Deterministic check
      const exactHits = await prisma.$queryRaw`
        SELECT id, title, content, "sotModule", "chunkType", "entryName",
               1 - (embedding <=> ${vectorString}::vector) AS similarity
        FROM "KnowledgeDocument"
        WHERE "entryName" LIKE ${'%|' + normalizedIng + '|%'}
          AND "sotModule" IS NOT NULL
        ORDER BY embedding <=> ${vectorString}::vector
      `;

      if (!exactHits || exactHits.length === 0) {
        // Brak trafienia w indeksie nazw = GATE-3
        unknown.push(ing);
        continue;
      }

      // 2. Similarity search dla zapytań opisowych (synergie itp.) z modułów kontekstowych
      const similarityHits = await this.searchKnowledge(ing, {
        limit: perIngredientLimit, agentId, sotModules, minSimilarity
      });

      // 3. Łączymy trafienia (Exact ma absolutny priorytet dopuszczenia, similarity dopełnia)
      const combined = [...exactHits];
      for (const sh of similarityHits) {
         if (!combined.find(x => x.id === sh.id)) combined.push(sh);
      }

      // Sortowanie ostateczne wg similarity
      combined.sort((a,b) => b.similarity - a.similarity);
      const topHits = combined.slice(0, perIngredientLimit);

      for (const h of topHits) {
        if (seen.has(h.id)) continue;
        if (used + h.content.length > charBudget) break;
        seen.add(h.id);
        used += h.content.length;
        block.push({ ingredient: ing, module: h.sotModule, content: h.content,
                     similarity: Number(h.similarity?.toFixed?.(3) ?? h.similarity) });
      }
    }
    return { ragBlock: block, unknownIngredients: unknown, charsUsed: used };
  }

  async getGroupedDocuments() {
    try {
      const docs = await prisma.$queryRaw`
        SELECT REGEXP_REPLACE(title, ' \\(Część \\d+\\)$', '') AS title,
               MAX("sotModule") AS "sotModule",
               COUNT(id) AS "chunkCount", MAX("createdAt") AS "createdAt"
        FROM "KnowledgeDocument"
        GROUP BY REGEXP_REPLACE(title, ' \\(Część \\d+\\)$', '')
        ORDER BY "createdAt" DESC
      `;
      return docs.map(d => ({ ...d, chunkCount: Number(d.chunkCount) }));
    } catch (error) {
      console.error('[getGroupedDocuments] Błąd:', error.message);
      throw error;
    }
  }
}

module.exports = new KnowledgeRagService();
