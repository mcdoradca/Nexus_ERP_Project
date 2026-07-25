const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiMetricsService = require('../../core/ai.metrics.service');

const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');
const socketService = require('../../core/socket');

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
      
      if (task.taskType === 'EAN_PIPELINE') {
          const finalProduct = await prisma.product.findUnique({ where: { ean: task.ean } });
          socketService.broadcast('nexus-notification', {
              type: 'PIPELINE_COMPLETE',
              ean: task.ean,
              result: finalProduct
          });
      }
    } catch (error) {
      console.error(`[Supervisor] Błąd orkiestracji dla zadania ${task.id}:`, error.message, '\nStack:', error.stack);
      await prisma.agentQueue.update({ where: { id: task.id }, data: { status: 'ERROR', payload: { error: error.message, stack: error.stack } } });
      
      if (task.taskType === 'EAN_PIPELINE') {
          await prisma.product.update({
              where: { ean: task.ean },
              data: { offerDraft: { status: 'ERROR', error: error.message } }
          }).catch(() => {});
          
          socketService.broadcast('nexus-notification', {
              type: 'PIPELINE_ERROR',
              ean: task.ean,
              error: error.message || "Błąd wewnętrzny serwera podczas procesowania EAN Pipeline."
          });
      }
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
   * Logika Orkiestratora dla procesu EAN Pipeline - ARCHITEKTURA SWARM V3
   * Wykonuje deterministyczną maszynę stanową 4 faz z użyciem Węzłów 1-10.
   */
  async _orchestrateEanPipeline(task) {
    const ean = task.ean;
    let product = await prisma.product.findUnique({ where: { ean }, include: { brand: true } });

    // Zapewnienie bazowych danych z zewnętrznych systemów
    if (!product || !product.isSynced) {
        console.log(`[Supervisor] Produkt ${ean} nie jest zsynchronizowany. Pobieranie z PIM/BaseLinker...`);
        product = await this._syncProduct(ean, product);
    }

    const broadcastStatus = (phase, nodesActive, nodeStatuses, nextAction = null, hitl = null) => {
        const payload = {
            pipeline_id: task.id,
            current_phase: phase,
            active_nodes: nodesActive,
            node_status: nodeStatuses,
            next_action: nextAction,
            hitl_alert: hitl
        };
        console.log(`[Supervisor Node 0] Status:`, JSON.stringify(payload));
        socketService.broadcast('nexus-notification', { type: 'PIPELINE_STATUS', ean, payload });
    };

    try {
        // ==========================================
        // FAZA 1: GROUNDING (Badania)
        // ==========================================
        broadcastStatus("FAZA_1_GROUNDING", ["Agent_1_Autofill", "Agent_2_Sentiment", "Agent_3_SEOTitle"], { Agent_1_Autofill: "IN_PROGRESS" });
        
        const autofillData = await AiService.runNode1_Autofill(ean, product.name);
        if (autofillData.missing_critical_data) {
            broadcastStatus("FAZA_1_GROUNDING", [], {}, "HALTED", "Brak kluczowych danych EAN/SDS - przerwano potok.");
            throw new Error("HITL_ALERT: Agent 1 zgłosił brak krytycznych danych technicznych.");
        }
        
        broadcastStatus("FAZA_1_GROUNDING", ["Agent_2_Sentiment", "Agent_3_SEOTitle"], { Agent_1_Autofill: "COMPLETED", Agent_2_Sentiment: "IN_PROGRESS" });
        const sentimentData = await AiService.runNode2_Sentiment(ean, product.name);
        
        broadcastStatus("FAZA_1_GROUNDING", ["Agent_3_SEOTitle"], { Agent_2_Sentiment: "COMPLETED", Agent_3_SEOTitle: "IN_PROGRESS" });
        const seoData = await AiService.runNode3_SEOTitle(ean, product.name, product.category || 'Brak');
        
        // ==========================================
        // FAZA 2: LEGAL SHIELD (Chemia i Prawo)
        // ==========================================
        broadcastStatus("FAZA_2_LEGAL_SHIELD", ["Agent_4_INCIParser", "Agent_5_LegalSanitizer"], { Agent_3_SEOTitle: "COMPLETED", Agent_4_INCIParser: "IN_PROGRESS" });
        
        const ragService = require('./knowledge.rag.service');
        const inciDocs = await ragService.searchKnowledge("Słownik INCI Kosmetyki Chemia", 2);
        const inciKnowledge = inciDocs.map(d => d.content).join("\n");
        
        // Ekstrakcja INCI z parametrów
        const inciString = autofillData.inci_ingredients || "Brak podanego INCI w danych PIM.";
        const inciAEOData = await AiService.runNode4_INCIParser(inciString, inciKnowledge);
        
        if (inciAEOData.ingredient_gate_status === "INGREDIENT_NOT_COSMETIC") {
            broadcastStatus("FAZA_2_LEGAL_SHIELD", [], {}, "HALTED", "Wykryto substancję leczniczą/zakazaną.");
            throw new Error("HITL_ALERT: Agent 4 zablokował produkt (nie-kosmetyk).");
        }
        
        broadcastStatus("FAZA_2_LEGAL_SHIELD", ["Agent_5_LegalSanitizer"], { Agent_4_INCIParser: "COMPLETED", Agent_5_LegalSanitizer: "IN_PROGRESS" });
        const legalDocs = await ragService.searchKnowledge("Oświadczenia medyczne claims prawo EU", 2);
        const legalKnowledge = legalDocs.map(d => d.content).join("\n");
        const legalData = await AiService.runNode5_LegalSanitizer(product.name, inciAEOData, sentimentData, legalKnowledge);

        // ==========================================
        // FAZA 3: CREATION (Copy & Psycho)
        // ==========================================
        broadcastStatus("FAZA_3_CREATION", ["Agent_6_Copywriter", "Agent_7_Psychology", "Agent_8_Scenographer"], { Agent_5_LegalSanitizer: "COMPLETED", Agent_6_Copywriter: "IN_PROGRESS" });
        const copywriterData = await AiService.runNode6_Copywriter(product.name, inciAEOData, { tone: "Ekspercki i bezpieczny" });
        
        broadcastStatus("FAZA_3_CREATION", ["Agent_7_Psychology", "Agent_8_Scenographer"], { Agent_6_Copywriter: "COMPLETED", Agent_7_Psychology: "IN_PROGRESS" });
        const psychologyData = await AiService.runNode7_Psychology(product.name, copywriterData, legalData);
        
        broadcastStatus("FAZA_3_CREATION", ["Agent_8_Scenographer"], { Agent_7_Psychology: "COMPLETED", Agent_8_Scenographer: "IN_PROGRESS" });
        const scenographerData = await AiService.runNode8_Scenographer(product.name, { target: "Świadomy konsument" });

        // ==========================================
        // FAZA 4: AUDIT (Vision & Sentinel)
        // ==========================================
        broadcastStatus("FAZA_4_AUDIT", ["Agent_9_VisionAuditor", "Agent_10_Sentinel"], { Agent_8_Scenographer: "COMPLETED", Agent_9_VisionAuditor: "IN_PROGRESS" });
        // Pobieramy obrazy z produktu (mock jeśli brak)
        const images = product.images || [];
        const visionData = images.length > 0 ? await AiService.runNode9_VisionAuditor(images) : { status: "NO_IMAGES", passed: true };
        
        if (visionData.vision_audit_status !== "PASSED") {
             broadcastStatus("FAZA_4_AUDIT", [], {}, "HALTED", "Błąd tła lub brak etykiety AI (Vision Auditor).");
             throw new Error("HITL_ALERT: Agent 9 zablokował ofertę z powodu grafik.");
        }

        broadcastStatus("FAZA_4_AUDIT", ["Agent_10_Sentinel"], { Agent_9_VisionAuditor: "COMPLETED", Agent_10_Sentinel: "IN_PROGRESS" });
        
        // Złożenie ostatecznego payloadu
        const finalPayload = {
            title: seoData.seo_title || product.name,
            attributes: autofillData,
            htmlContent: psychologyData,
            scenography: scenographerData
        };

        const sentinelData = await AiService.runNode10_Sentinel(finalPayload, autofillData);
        
        if (sentinelData.final_verdict === "BLOCKED_DUE_TO_NON_COMPLIANCE") {
            broadcastStatus("FAZA_4_AUDIT", [], {}, "HALTED", "Sentinel zablokował ostateczną ofertę. Wymagana interwencja człowieka.");
            throw new Error(`HITL_ALERT: Agent 10 odrzucił generację. Powód: ${sentinelData.reason}`);
        }

        // Zapis do bazy
        await prisma.product.update({ 
            where: { ean }, 
            data: { 
                features: autofillData,
                aeoContent: JSON.stringify(psychologyData),
                offerDraft: finalPayload
            } 
        });

        broadcastStatus("COMPLETED", [], { Agent_10_Sentinel: "COMPLETED" }, "ALL_NODES_FINISHED");

    } catch (error) {
        console.error(`[Supervisor] Przerwano potok EAN ${ean}:`, error.message);
        throw error;
    }
  }

  // --- Implementacje delegatów (Zachowane do kompatybilności wewnętrznej) ---

  async _syncProduct(ean, product) {
    const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
    const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
    let brandId = product ? product.brandId : null;
    
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
}

module.exports = new SupervisorService();
