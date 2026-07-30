const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenAI } = require('@google/genai');
const aiMetricsService = require('../../core/ai.metrics.service');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBEDDING_MODEL_NAME = 'gemini-embedding-2';

/*
 * KnowledgeRagService v2 — zmiany vs v1:
 * 1. Chunking SEMANTYCZNY (po nagłówkach ## / ### i wpisach słownikowych) zamiast
 *    ślepego cięcia co 1000 znaków. Reguła prawna / wiersz tabeli / wpis słownika
 *    = niepodzielny atom. Cięcie reguły w pół doręczało agentom zakazy bez
 *    wyjątków i limity bez jednostek — ryzyko prawne, nie tylko jakościowe.
 * 2. Metadane chunków: sotModule, targetAgents[], chunkType. Wyszukiwanie
 *    filtrowane per moduł/agent — koniec z serwowaniem psychologii (SOT 09)
 *    parserowi chemii (A4).
 * 3. chunkType GATE/RULE: bloki prawa i bramek NIE są przeznaczone do retrieval —
 *    trafiają do statycznych prefiksów węzłów (patrz RAG_ORCHESTRATION §0).
 *    Serwis loguje ostrzeżenie, jeśli zapytanie RAG zwraca chunk typu GATE.
 * 4. getKnowledgeForIngredients(): zapytania per składnik, deduplikacja, próg
 *    podobieństwa, budżet znakowy — jedno wywołanie z Node 0 buduje cały blok
 *    RAG dla A4 zamiast N nieskoordynowanych zapytań.
 * 5. Telemetria: agentId węzła ZLECAJĄCEGO przekazywany do logUsage —
 *    na dashboardzie widać, który węzeł generuje koszt wektoryzacji.
 * 6. Wersjonowanie tytułów (SOT_01@v2026.07) + atomowa podmiana przy ingest.
 *
 * WYMAGANA MIGRACJA SQL:
 *   ALTER TABLE "KnowledgeDocument"
 *     ADD COLUMN IF NOT EXISTS "sotModule"    text,
 *     ADD COLUMN IF NOT EXISTS "targetAgents" text[],
 *     ADD COLUMN IF NOT EXISTS "chunkType"    text DEFAULT 'DICTIONARY_ENTRY';
 *   CREATE INDEX IF NOT EXISTS idx_kd_module ON "KnowledgeDocument"("sotModule");
 */

const CHUNK_MIN = 400;   // znaków — mniejsze fragmenty doklejane do poprzednika
const CHUNK_MAX = 3500;  // znaków — twardy sufit pojedynczego chunku
const DEFAULT_MIN_SIMILARITY = 0.72;

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
      // Normalizacja L2 (dla outputDimensionality < domyślnej, wektor musi być znormalizowany do metryki cosine)
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

  /**
   * Chunking semantyczny markdown:
   * - dzieli po nagłówkach (#, ##, ###) — sekcja SOT = kandydat na chunk,
   * - sekcje > CHUNK_MAX dzieli po wpisach list (linie zaczynające się od
   *   "* ", "- ", "N. ") lub pustych liniach — nigdy w środku wpisu,
   * - sekcje < CHUNK_MIN skleja z poprzedzającym nagłówkiem (kontekst reguły).
   * Każdy chunk niesie ścieżkę nagłówków w prefiksie — embedding "wie",
   * z jakiej sekcji pochodzi wpis (poprawia trafność similarity).
   */
  _chunkMarkdown(text) {
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
      // Sekcja za duża: tnij po atomach (wpisy list / akapity), nigdy w środku.
      const atoms = bodyText.split(/\n(?=(?:\*\s|-\s|\d+\.\s|\|)|\n)/);
      let buf = header;
      for (const atom of atoms) {
        if ((buf + atom).length > CHUNK_MAX && buf.trim() !== header.trim()) {
          chunks.push(buf.trimEnd());
          buf = header; // każdy kawałek zachowuje kontekst nagłówka
        }
        buf += atom + '\n';
      }
      if (buf.trim() && buf.trim() !== header.trim()) chunks.push(buf.trimEnd());
    }

    // Sklejanie zbyt małych chunków z poprzednikiem (reguła bez kontekstu = ryzyko)
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

  /**
   * Ingest z metadanymi. Podmiana wersji jest atomowa: najpierw insert nowych
   * chunków pod tytułem wersjonowanym, na końcu delete starej wersji.
   * meta = { sotModule: 'SOT_06', targetAgents: ['Agent_4_INCIParser'],
   *          chunkType: 'DICTIONARY_ENTRY' | 'RULE' | 'GATE' | 'CONTEXT',
   *          version: 'v2026.07' }
   */
  async ingestDocument(text, title, meta = {}) {
    if (!text || !text.trim()) throw new Error('Tekst dokumentu jest pusty.');
    const version = meta.version || `v${new Date().toISOString().slice(0, 10)}`;
    const versionedTitle = `${title}@${version}`;
    const chunkType = meta.chunkType || 'DICTIONARY_ENTRY';
    const agents = meta.targetAgents || [];

    if (chunkType === 'GATE' || chunkType === 'RULE') {
      console.warn(`[RAG] "${title}" ma typ ${chunkType} — zgodnie z architekturą ` +
        'v4 bloki prawa/bramek powinny trafiać do STATYCZNYCH prefiksów węzłów, ' +
        'nie do puli retrieval. Ingest wykonany, ale zweryfikuj routing.');
    }

    const chunks = this._chunkMarkdown(text);
    console.log(`[RAG] "${versionedTitle}": ${chunks.length} chunków semantycznych.`);

    for (let i = 0; i < chunks.length; i++) {
      const vec = await this._getEmbeddings(chunks[i], 'Node0_Ingest/embedding');
      const vectorString = `[${vec.join(',')}]`;
      await prisma.$executeRaw`
        INSERT INTO "KnowledgeDocument"
          ("id","title","content","embedding","sotModule","targetAgents","chunkType","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${`${versionedTitle} (Część ${i + 1})`}, ${chunks[i]},
                ${vectorString}::vector, ${meta.sotModule || null}, ${agents},
                ${chunkType}, now(), now())
      `;
    }
    // Usuń poprzednie wersje tego samego dokumentu (separator @ chroni przed
    // omyłkowym skasowaniem "SOT_01x" przy usuwaniu "SOT_01").
    await prisma.$executeRaw`
      DELETE FROM "KnowledgeDocument"
      WHERE "title" LIKE ${title + '@%'} AND "title" NOT LIKE ${versionedTitle + '%'}
    `;
    return { success: true, chunksInserted: chunks.length, version };
  }

  /**
   * Wyszukiwanie z filtrem modułu, progiem podobieństwa i atrybucją kosztu.
   */
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
          console.warn(`[RAG] Chunk typu GATE zwrócony przez retrieval (${r.title}) — ` +
            'bramki powinny być w prefiksie statycznym, nie w puli wyszukiwania.');
        }
      }
      return filtered;
    } catch (error) {
      console.error('[searchKnowledge] Błąd szukania:', error.message);
      return [];
    }
  }

  /**
   * Buduje kompletny blok RAG dla węzła na podstawie listy składników.
   * Wzorzec z RAG_ORCHESTRATION §2: zapytanie per składnik (limit 2),
   * deduplikacja po id, budżet znakowy, lista unknown_ingredients dla bramki
   * UNKNOWN_INGREDIENT_NEEDS_LOOKUP (SOT 06 §2).
   */
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
      const hits = await this.searchKnowledge(ing, {
        limit: perIngredientLimit, agentId, sotModules, minSimilarity,
      });
      if (!hits.length) { unknown.push(ing); continue; }
      for (const h of hits) {
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
