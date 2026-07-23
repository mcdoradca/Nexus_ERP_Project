const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiMetricsService = require('../../core/ai.metrics.service');

const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');

// Gemini Setup for Orchestrator
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ORCHESTRATOR_MODEL = "gemini-3.1-pro-preview";

class SupervisorService {
  constructor() {
    this.model = genAI.getGenerativeModel({ 
      model: ORCHESTRATOR_MODEL,
      generationConfig: { responseMimeType: "application/json" }
    });
  }

  /**
   * Wyzwalacz dodający zadanie do kolejki. Zastępuje bezpośrednie wywołanie EAN Pipeline.
   */
  async enqueueTask(taskType, ean, payload = {}) {
    console.log(`[Supervisor] Otrzymano zlecenie dla: ${taskType} | EAN: ${ean}`);
    const queueItem = await prisma.agentQueue.create({
      data: {
        taskType,
        ean,
        payload,
        status: 'PENDING'
      }
    });
    
    // W architekturze bez kolejek pub/sub (RabbitMQ), uruchamiamy procesowanie od razu w tle
    this.processQueue().catch(console.error);
    return queueItem;
  }

  /**
   * Opróżnia i procesuje kolejkę używając LLM jako decydenta.
   */
  async processQueue() {
    const pendingTasks = await prisma.agentQueue.findMany({
      where: { status: 'PENDING' },
      orderBy: { priority: 'desc' }
    });

    for (const task of pendingTasks) {
      await this._handleTask(task);
    }
  }

  async _handleTask(task) {
    try {
      await prisma.agentQueue.update({ where: { id: task.id }, data: { status: 'PROCESSING' } });
      
      console.log(`[Supervisor] Rozpoczęto orkiestrację zadania ID: ${task.id} (Typ: ${task.taskType}, EAN: ${task.ean})`);

      if (task.taskType === 'EAN_PIPELINE' || task.taskType === 'AEO_GENERATION') {
        await this._orchestrateEanPipeline(task);
      }

      await prisma.agentQueue.update({ where: { id: task.id }, data: { status: 'COMPLETED' } });
      console.log(`[Supervisor] Zadanie ID: ${task.id} zakończone pomyślnie.`);
    } catch (error) {
      console.error(`[Supervisor] Błąd orkiestracji dla zadania ${task.id}:`, error);
      await prisma.agentQueue.update({ where: { id: task.id }, data: { status: 'ERROR', payload: { error: error.message } } });
    }
  }

  /**
   * Sprawdza pamięć cache Supervisora, aby nie powtarzać długich akcji AI/OSINT
   */
  async _getCachedContext(key) {
    const cached = await prisma.agentCache.findUnique({ where: { cacheKey: key } });
    if (cached) {
      console.log(`[Supervisor] Trafienie w AgentCache dla klucza: ${key}`);
      return cached.value;
    }
    return null;
  }

  async _setCachedContext(key, value) {
    await prisma.agentCache.upsert({
      where: { cacheKey: key },
      update: { value },
      create: { cacheKey: key, value }
    });
  }

  /**
   * Logika Orkiestratora dla procesu EAN Pipeline przy użyciu gemini-3.1-pro-preview.
   * Model sprawdza aktualny stan katalogu PIM i decyduje, jakie kroki należy podjąć, w jakiej kolejności.
   */
  async _orchestrateEanPipeline(task) {
    const ean = task.ean;
    let product = await prisma.product.findUnique({ where: { ean }, include: { brand: true } });

    // 1. Zapewnienie bazowych danych z zewnętrznych systemów
    const needsSync = !product || !product.isSynced;
    if (needsSync) {
        console.log(`[Supervisor] Produkt ${ean} nie jest w pełni zsynchronizowany. Wywołuję BaseLinker...`);
        // Dla uproszczenia delegujemy sync do BaseLinkera od razu
        // W pełnej architekturze LLM by zdecydował, że brakuje mu danych i zażądał funkcji `syncBaseLinker`
        product = await this._syncProduct(ean, product);
    }

    // 2. Pobranie parametrów Allegro Catalog API (Twarde dane - brak zgadywania)
    const allegroService = require('./allegro.service');
    const hardCatalogFeatures = await allegroService.getProductParametersByEan(ean);
    let currentFeatures = product.features && typeof product.features === 'object' ? { ...product.features } : {};
    
    if (hardCatalogFeatures && Object.keys(hardCatalogFeatures).length > 0) {
      currentFeatures = { ...currentFeatures, ...hardCatalogFeatures };
      product = await prisma.product.update({ where: { ean }, data: { features: currentFeatures } });
    }

    // Pytamy AI Orkiestratora o plan działania
    const prompt = `Jesteś "Agentem Supervisorem" w dziale e-commerce. Otrzymujesz zgłoszenie wygenerowania opisów/AEO dla produktu o EAN: ${ean} (${product.name}).
Dane w PIM: ${JSON.stringify(currentFeatures)}.
Masz do dyspozycji agentów: 
- "Agent_11_Autofill": uzupełnia brakujące parametry katalogowe.
- "Agent_AEO": generuje teksty FAQ/AEO (Answer Engine Optimization).
- "Agent_2_Sentiment": wyszukuje opinie o produkcie.
- "Agent_4_GEO": pisze bloki tekstowe do oferty na bazie zgromadzonych danych (wymaga parametrów i sentymentu!).
- "Agent_3_Compliance": sprawdza regulaminy (wymaga gotowego opisu z GEO).

Zasada: NIE MOŻESZ generować opisów GEO dopóki katalog (Autofill) i Sentyment nie jest zrobiony. 
Określ w formacie JSON dokładną kolejność wywołań modułów.
Struktura JSON: { "plan": ["AUTOFILL", "SENTIMENT", "AEO", "GEO", "COMPLIANCE"] }
Odpowiadaj TYLKO obiektem JSON. Odnieś się do zadania. Jeśli zadanie to "AEO_GENERATION", daj tylko "AEO".`;

    let planResponse;
    try {
      const response = await aiMetricsService.logUsage(
        async () => {
          const res = await this.model.generateContent(prompt);
          return res.response.text();
        },
        'Agent_Supervisor_Router',
        ORCHESTRATOR_MODEL,
        Math.ceil(prompt.length / 4)
      );
      
      planResponse = JSON.parse(response.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, ''));
    } catch (e) {
      console.log("[Supervisor] LLM failed to route, falling back to sequential default", e);
      planResponse = { plan: task.taskType === 'AEO_GENERATION' ? ["AEO"] : ["AUTOFILL", "SENTIMENT", "AEO", "GEO", "COMPLIANCE"] };
    }

    console.log(`[Supervisor] Wygenerowany plan działania dla ${ean}:`, planResponse.plan);

    // Wykonywanie zaplanowanych agentów po kolei z uwzględnieniem pamięci Cache
    for (const step of planResponse.plan) {
      console.log(`[Supervisor] Uruchamianie kroku: ${step}`);
      
      switch (step) {
        case 'AUTOFILL':
          await this._runAutofill(ean, product);
          break;
        case 'SENTIMENT':
          await this._runSentiment(ean, product);
          break;
        case 'AEO':
          await this._runAEO(ean, product);
          break;
        case 'GEO':
          await this._runGEO(ean, product);
          break;
        case 'COMPLIANCE':
          await this._runCompliance(ean, product);
          break;
      }
      
      // Odświeżenie danych produktu po kroku
      product = await prisma.product.findUnique({ where: { ean } });
    }
  }

  // --- Implementacje delegatów ---

  async _syncProduct(ean, product) {
    const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
    const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
    let brandId = product ? product.brandId : null;
    
    // Logika brandId...
    let defaultBrand = await prisma.brand.findUnique({ where: { name: 'PIM-IMPORT' } });
    if (!defaultBrand) defaultBrand = await prisma.brand.create({ data: { name: 'PIM-IMPORT' } });
    brandId = brandId || defaultBrand.id;

    const deepPayload = {
        baselinkerInventoryId: deepData.baselinkerInventoryId,
        baselinkerId: deepData.baselinkerId,
        isSynced: true,
        stock: deepData.stock
    };
    if (!product) {
        return prisma.product.create({ data: { ean, sku: ean, name: deepData.name, brandId, ...deepPayload } });
    }
    return prisma.product.update({ where: { ean }, data: deepPayload });
  }

  async _runAutofill(ean, product) {
    const cacheKey = `autofill_${ean}`;
    if (await this._getCachedContext(cacheKey)) return;

    console.log(`[Supervisor->Agent_11_Autofill] Uzupełnianie parametrów...`);
    const filledFeatures = await AiService.autofillMissingParameters(ean, product.name, product.features || {}, []);
    if (filledFeatures && Object.keys(filledFeatures).length > 0) {
      await prisma.product.update({ where: { ean }, data: { features: filledFeatures } });
    }
    await this._setCachedContext(cacheKey, { done: true });
  }

  async _runSentiment(ean, product) {
    const cacheKey = `sentiment_${ean}`;
    let sentiment = await this._getCachedContext(cacheKey);
    
    if (!sentiment) {
      console.log(`[Supervisor->Agent_2_Sentiment] Szukanie opinii...`);
      sentiment = await AiService.gatherCustomerSentiment(ean, product.name, null);
      await this._setCachedContext(cacheKey, { sentiment });
    } else {
      sentiment = sentiment.sentiment;
    }
    
    const offerDraft = (product.offerDraft || {});
    offerDraft.customerSentiment = sentiment;
    await prisma.product.update({ where: { ean }, data: { offerDraft } });
  }

  async _runAEO(ean, product) {
    const cacheKey = `aeo_${ean}`;
    if (await this._getCachedContext(cacheKey)) return;
    
    console.log(`[Supervisor->Agent_AEO] Generowanie Answer Engine Optimization (FAQ)...`);
    const aeoText = await AiService.generateAeoContent(ean, product.name, product.features);
    await prisma.product.update({ where: { ean }, data: { aeoContent: aeoText } });
    
    await this._setCachedContext(cacheKey, { aeoContent: aeoText });
  }

  async _runGEO(ean, product) {
    console.log(`[Supervisor->Agent_4_GEO] Generowanie Opisu...`);
    // Mock wykonania GEO -> Trafia do draftu
  }

  async _runCompliance(ean, product) {
    const cacheKey = `compliance_${ean}`;
    if (await this._getCachedContext(cacheKey)) return;

    console.log(`[Supervisor->Agent_3_Compliance] Weryfikacja RAG...`);
    const ragService = require('./knowledge.rag.service');
    const legalDocs = await ragService.searchKnowledge("dyrektywa omnibus i kosmetyki", 2);
    
    console.log(`[Supervisor->Agent_3_Compliance] Znaleziono ${legalDocs.length} dokumentów prawnych w RAG Supabase.`);
    // Logika weryfikacji GEO...
    
    await this._setCachedContext(cacheKey, { done: true });
  }
}

module.exports = new SupervisorService();
