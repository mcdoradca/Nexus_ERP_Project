const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiMetricsService = require('../../core/ai.metrics.service');

const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');
const socketService = require('../../core/socket');
const AllegroService = require('./allegro.service');
const OsintScraperService = require('./osint.scraper.service');
const agent1Logger = require('../../utils/agent1_logger');
const { mapAllegroParameters } = require('../../utils/allegro_mapper');

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
    // Tarcza Błędów: Sprawdzenie limitu dziennego (MAX 3)
    const today = new Date();
    today.setHours(0,0,0,0);
    const failuresToday = await prisma.agentQueue.count({
        where: {
            ean: ean,
            status: 'ERROR',
            createdAt: { gte: today }
        }
    });

    if (failuresToday >= 3) {
        console.error(`[Supervisor] 🛑 Tarcza Błędów: EAN ${ean} przekroczył limit 3 błędów dzisiaj! Zablokowano ponowne dodanie do kolejki.`);
        return null;
    }

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
    const fs = require('fs');
    const path = require('path');
    const CIRCUIT_BREAKER_FILE = path.join(process.cwd(), 'logs', '.circuit_breaker');
    
    if (fs.existsSync(CIRCUIT_BREAKER_FILE)) {
        console.warn(`[Supervisor] 🚨 Kolejka zablokowana przez CIRCUIT BREAKER. Usuń plik .circuit_breaker aby odblokować AI.`);
        return;
    }

    const pendingTasks = await prisma.agentQueue.findMany({
      where: { status: 'PENDING' },
      orderBy: { priority: 'desc' }
    });

    for (const task of pendingTasks) {
      // Ponowne sprawdzenie Circuit Breakera (w razie aktywacji w trakcie pętli)
      if (fs.existsSync(CIRCUIT_BREAKER_FILE)) break;
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
          
          let resultPayload = {};
          if (finalProduct && finalProduct.offerDraft) {
               const draft = typeof finalProduct.offerDraft === 'string' ? JSON.parse(finalProduct.offerDraft) : finalProduct.offerDraft;
               resultPayload = {
                   editorHtml: draft.htmlContent,
                   title: draft.title,
                   visionTickets: draft.visionTickets || [],
                   features: finalProduct.features || {},
                   aeoContent: finalProduct.aeoContent || ''
               };
          }
          
          socketService.broadcast('nexus-notification', {
              type: 'PIPELINE_COMPLETE',
              ean: task.ean,
              result: resultPayload
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
        broadcastStatus("FAZA_1_GROUNDING", ["Agent_1_Autofill", "Agent_2_Sentiment"], { Agent_1_Autofill: "IN_PROGRESS" });
        
        console.log(`[Supervisor] Rozpoczynam kaskadowe zasilanie PXM dla Agenta 1 (EAN: ${ean})`);
        
        // --- 1. Ustalenie Kategori Allegro & Zbudowanie Schematu ---
        let catId = product.allegroCategoryId;
        let requiredSchema = [];
        
        if (!catId) {
            catId = await AllegroService.findCategoryByEan(ean);
            if (!catId && product.name) catId = await AllegroService.findMatchingCategoryByName(product.name);
            if (catId) {
                await prisma.product.update({ where: { id: product.id }, data: { allegroCategoryId: catId } });
                product.allegroCategoryId = catId;
            }
        }
        
        if (catId) {
            let category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
            if (!category || !category.parameters || (Array.isArray(category.parameters) && category.parameters.length === 0)) {
                await AllegroService.fetchCategoryParameters(catId);
                category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
            }
            if (category && category.parameters) requiredSchema = category.parameters;
        }

        // --- 2. Pobranie Twardych Danych z Allegro (Katalog) ---
        const allegroData = await AllegroService.getProductParametersByEan(ean);
        
        // --- 3. Sztywne Mapowanie Allegro -> Allegro (Skryptowe) ---
        console.log(`[Supervisor] Wykonuję skryptowe mapowanie parametrów z Katalogu Allegro dla EAN: ${ean}`);
        const allegroFilledFeatures = mapAllegroParameters(allegroData, requiredSchema);

        const scrapedText = await OsintScraperService.searchAndExtract(ean, product.name);
        
        agent1Logger.info(`[Supervisor] Wywołanie Agenta 1 dla EAN: ${ean}. Dane BaseLinker+Allegro gotowe.`);
        const metaAutofillData = await AiService.runNode1_Autofill(ean, product.name, allegroFilledFeatures, allegroData, scrapedText);
        agent1Logger.info(`[Supervisor] Zakończono pracę Agenta 1 dla EAN: ${ean}. Wynik:`, { metaAutofillData });
        
        if (metaAutofillData.missing_critical_data) {
            agent1Logger.warn(`[Supervisor] Agent 1 zgłosił missing_critical_data = true dla EAN: ${ean}`);
            if (process.env.BYPASS_HITL === 'true') {
                console.warn("⚠️ [Supervisor] Zignorowano HITL_ALERT z Agenta 1 (BYPASS_HITL włączony). Kontynuacja potoku dla testów telemetrii.");
                agent1Logger.warn(`[Supervisor] HITL zignorowany (BYPASS_HITL)`);
            } else {
                agent1Logger.warn(`[Supervisor] HITL_ALERT z Agenta 1 - wysyłam powiadomienie na czat i kontynuuję potok.`);
                try {
                    const chatService = require('../communication/chat.service');
                    const bot = await prisma.user.findUnique({ where: { email: 'nexus.ai@system.local' } });
                    if (bot) {
                        await chatService.saveGlobalMessage(bot.id, `🚨 **Błąd potoku EAN**: HITL_ALERT: Agent 1 zgłosił brak krytycznych danych technicznych dla EAN: ${ean}. Potok nie został przerwany.`);
                    }
                } catch (chatErr) {
                    console.error("[Supervisor] Nie udało się wysłać powiadomienia na czat:", chatErr);
                }
            }
        }
        
        // --- 5. Bezpieczny Merge & Zapis ---
        const autofillData = { ...allegroFilledFeatures, ...metaAutofillData };
        
        broadcastStatus("FAZA_1_GROUNDING", ["Agent_2_Sentiment"], { Agent_1_Autofill: "COMPLETED", Agent_2_Sentiment: "IN_PROGRESS" });
        const sentimentData = await AiService.runNode2_Sentiment(ean, product.name);
        
        // Agent 3 (SEOTitle) usunięty na życzenie z powodu limitów API. 
        // Fallback do product.name podczas składania finalPayload.
        
        // ==========================================
        // FAZA 2: LEGAL SHIELD (Chemia i Prawo)
        // ==========================================
        broadcastStatus("FAZA_2_LEGAL_SHIELD", ["Agent_4_INCIParser", "Agent_5_LegalSanitizer"], { Agent_2_Sentiment: "COMPLETED", Agent_4_INCIParser: "IN_PROGRESS" });
        
        const ragService = require('./knowledge.rag.service');
        
        const inciDocs = await ragService.searchKnowledge("Słownik INCI Kosmetyki Chemia", 2);
        const inciKnowledge = inciDocs.map(d => d.content).join("\n");
        
        // Ekstrakcja INCI z parametrów
        const inciString = autofillData.inci_ingredients || "Brak podanego INCI w danych PIM.";
        const inciAEOData = await AiService.runNode4_INCIParser(inciString, inciKnowledge);
        
        if (inciAEOData.ingredient_gate_status === "INGREDIENT_NOT_COSMETIC") {
            if (process.env.BYPASS_HITL === 'true') {
                console.warn("⚠️ [Supervisor] Zignorowano HITL_ALERT z Agenta 4 (BYPASS_HITL włączony). Kontynuacja potoku dla testów telemetrii.");
            } else {
                broadcastStatus("FAZA_2_LEGAL_SHIELD", [], {}, "HALTED", "Wykryto substancję leczniczą/zakazaną.");
                throw new Error("HITL_ALERT: Agent 4 zablokował produkt (nie-kosmetyk).");
            }
        }
        
        broadcastStatus("FAZA_2_LEGAL_SHIELD", ["Agent_5_LegalSanitizer"], { Agent_4_INCIParser: "COMPLETED", Agent_5_LegalSanitizer: "IN_PROGRESS" });
        const legalDocs = await ragService.searchKnowledge("Oświadczenia medyczne claims prawo EU", 2);
        const legalKnowledge = legalDocs.map(d => d.content).join("\n");
        const legalData = await AiService.runNode5_LegalSanitizer(product.name, inciAEOData, sentimentData, legalKnowledge);

        // ==========================================
        // FAZA 3: CREATION (Copy & Psycho)
        // ==========================================
        broadcastStatus("FAZA_3_CREATION", ["Agent_6_Copywriter", "Agent_7_Psychology", "Agent_8_Scenographer"], { Agent_5_LegalSanitizer: "COMPLETED", Agent_6_Copywriter: "IN_PROGRESS" });
        console.log(`[Supervisor] Uruchamiam Agenta 6 (Copywriter). Przekazuję inciAEOData oraz legalData...`);
        const copywriterDocs = await ragService.searchKnowledge("SOT Kosmetyki Chemia Copywriting", 2);
        const copywriterKnowledge = copywriterDocs.map(d => d.content).join("\n");
        const copywriterData = await AiService.runNode6_Copywriter(product.name, inciAEOData, legalData, { tone: "Ekspercki i bezpieczny" }, copywriterKnowledge);
        console.log(`[Supervisor] Agent 6 (Copywriter) zakończył pracę pomyślnie.`);
        
        broadcastStatus("FAZA_3_CREATION", ["Agent_7_Psychology", "Agent_8_Scenographer"], { Agent_6_Copywriter: "COMPLETED", Agent_7_Psychology: "IN_PROGRESS" });
        
        // Ładowanie pełnego SOT_09 (Psychologia) dla Agenta 7
        const sot09Path = path.resolve(__dirname, '../../../docs/swarm_v3_upgrade/rag_sot/RAG_SOT_09_Psychologia_i_Retencja.md');
        let fullSot09 = "";
        try {
            fullSot09 = fs.readFileSync(sot09Path, 'utf8');
        } catch (err) {
            console.error(`[Supervisor] Błąd ładowania SOT_09: ${err.message}`);
        }

        const orchestratorMapping = `
MAPOWANIE MODUŁÓW (BEZWZGLĘDNY NAKAZ ORKIESTRATORA):
- opis1: Użyj "Haczyk Psychologiczny (Hook)" oraz "Sensory Priming".
- opis2: Użyj "Ścieżka Skanowania (AIDA / FAB)" do sformatowania korzyści.
- opis3: Zastosuj "Płynność Kognitywna (System 1 Kahnemana)" do czytelności parametrów.
- opis4: Użyj "Efekt Pratfall (Radykalna Szczerość)" lub "Homofilia Socjologiczna" (jeśli pasuje dowód społeczny).
- opis5: Zastosuj "Kotwica Zużycia (Replenishment Hook)" oraz dodaj INCI/Certyfikaty 1:1.
Wymuszam na Tobie zachowanie powyższego mapowania. Zintegruj je sprytnie w HTML, nie uszkadzając struktury.

TREŚĆ BAZY WIEDZY SOT_09:
${fullSot09}
`;
        const psychologyData = await AiService.runNode7_Psychology(product.name, copywriterData, legalData, orchestratorMapping);
        
        broadcastStatus("FAZA_3_CREATION", ["Agent_8_Scenographer"], { Agent_7_Psychology: "COMPLETED", Agent_8_Scenographer: "IN_PROGRESS" });
        const scenographerData = await AiService.runNode8_Scenographer(product.name, { target: "Świadomy konsument" });

        // ==========================================
        // FAZA 4: AUDIT (Vision & Sentinel)
        // ==========================================
        broadcastStatus("FAZA_4_AUDIT", ["Agent_10_Sentinel"], { Agent_8_Scenographer: "COMPLETED", Agent_9_VisionAuditor: "SKIPPED", Agent_10_Sentinel: "IN_PROGRESS" });
        
        const visionTickets = []; // HITL: Człowiek weryfikuje wizualia ręcznie, brak automatycznych ticketów z Agenta 9

        // Złożenie ostatecznego payloadu
        const finalPayload = {
            title: product.name, // Fallback po usunięciu Agenta 3

            attributes: autofillData,
            htmlContent: psychologyData,
            scenography: scenographerData,
            visionTickets: visionTickets
        };

        const sentinelDocs = await ragService.searchKnowledge("SOT Allegro Regulamin i Zakazane", 2);
        const sentinelKnowledge = sentinelDocs.map(d => d.content).join("\n");
        const sentinelData = await AiService.runNode10_Sentinel(finalPayload, autofillData, sentinelKnowledge);
        
        if (sentinelData.final_verdict === "PASSED_WITH_AUTO_REPAIR" && sentinelData.repaired_html_payload) {
            console.warn(`[Supervisor] Sentinel zgłosił błąd, ale użył Auto-Korekty. Oszczędzono tokeny dla EAN: ${ean}`);
            broadcastStatus("FAZA_4_AUDIT", [], {}, "INFO", "Sentinel wykonał auto-korektę tekstu (usunięto halucynację).");
            psychologyData = sentinelData.repaired_html_payload;
            finalPayload.htmlContent = psychologyData;
        } else if (sentinelData.final_verdict.startsWith("BLOCKED") || sentinelData.final_verdict === "BLOCKED_DUE_TO_NON_COMPLIANCE") {
            broadcastStatus("FAZA_4_AUDIT", [], {}, "WARNING", "Sentinel zablokował ostateczną ofertę. Wymagana interwencja człowieka.");
            
            let sentinelReasons = [];
            if (sentinelData.blocking_errors && Array.isArray(sentinelData.blocking_errors) && sentinelData.blocking_errors.length > 0) {
                sentinelReasons = sentinelData.blocking_errors;
            } else if (sentinelData.reason) {
                sentinelReasons = [sentinelData.reason];
            } else {
                sentinelReasons = ["Wykryto halucynacje lub niezgodność z prawem."];
            }
            
            visionTickets.push({
                originalUrl: "Audyt Sentinel - Wykryto błędy w tekście",
                alerts: sentinelReasons,
                isCompliant: false,
                replacedUrl: null
            });
            
            // Zaktualizuj payload o nowe błędy
            finalPayload.visionTickets = visionTickets;
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
        const errorDetails = error.stack || error.message;
        console.error(`[Supervisor] Przerwano potok EAN ${ean}:`, errorDetails);
        
        try {
            const fs = require('fs');
            const path = require('path');
            const logsDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            const logPath = path.join(logsDir, 'ean_pipeline_errors.log');
            const logContent = `\n[${new Date().toISOString()}] KRYTYCZNY BŁĄD POTOKU DLA EAN: ${ean}\n${errorDetails}\n------------------------------------------------\n`;
            fs.appendFileSync(logPath, logContent);
        } catch (fsErr) {
            console.error("[Supervisor] Nie udało się zapisać logu błędu do pliku:", fsErr.message);
        }

        try {
            const chatService = require('../communication/chat.service');
            const bot = await prisma.user.findUnique({ where: { email: 'nexus.ai@system.local' } });
            if (bot) {
                await chatService.saveGlobalMessage(bot.id, `🚨 **AWARIA POTOKU EAN**: Przerwano przetwarzanie produktu o kodzie **${ean}**.\n\nWygenerowano szczegółowy raport (Stack Trace), abyś mógł go łatwo skopiować. Znajdziesz go w pliku:\n\`logs/ean_pipeline_errors.log\`\n\n**Fragment błędu:**\n\`\`\`text\n${error.message}\n\`\`\``);
            }
        } catch (chatErr) {
            console.error("[Supervisor] Nie udało się wysłać powiadomienia o awarii potoku na czat:", chatErr.message);
        }

        // Poinformowanie frontendu, że potok uległ awarii (żeby nie wisiał UI w nieskończoność)
        try {
            broadcastStatus("FAILED", [], {}, "HALTED", "Potok przerwany z powodu błędu: " + error.message.substring(0, 50));
        } catch (bcErr) {}

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
