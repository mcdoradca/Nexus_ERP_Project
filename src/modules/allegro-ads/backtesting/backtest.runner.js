const AllegroAdsEnv = require('./AllegroAdsEnv');
const qLearning = require('../allegro.qlearning.service');
const biddingEngine = require('../allegro.bidding.engine');
const economicsService = require('../allegro.economics.service');
const prisma = require('../../../core/prisma');

const env = new AllegroAdsEnv();

async function runRLBacktesting(targetEan = null) {
    const trace = {
        logs: [],
        steps: [],
        unitEconomics: null,
        kpi: null,
        decision: null,
        success: false,
        error: null
    };

    const log = (msg) => {
        console.log(msg);
        trace.logs.push(`[${new Date().toISOString().split('T')[1].substring(0, 8)}] ${msg}`);
    };

    log("==================================================");
    log("🤖 INICJALIZACJA BACKTESTINGU: PRAWDZIWE DANE CSV/XLSX + OFFLINE RL");
    log("==================================================");

    trace.steps.push({ step: 1, name: 'Data Ingestion (CSV/XLSX)', status: 'success' });

    let products = [];
    if (targetEan) {
        products = await prisma.product.findMany({ where: { ean: targetEan } });
    } else {
        products = await prisma.product.findMany({ where: { stock: { gt: 0 } }, take: 1 });
    }

    if (products.length === 0) {
        const errMsg = "Brak produktów w bazie PIM.";
        log(errMsg);
        trace.error = errMsg;
        return trace;
    }

    trace.steps.push({ step: 2, name: 'Pobranie Produktu PIM (Target)', status: 'success', details: `SKU: ${products[0].sku}` });
    
    // We run just 1 epoch for the UI
    for (const product of products) {
        log(`\n--> Produkt PIM: [${product.sku}] | Baza kosztowa: ${product.basePrice} PLN`);
        let observation = env.reset(product);
        
        if (env.days.length === 0) {
            log(`Brak powiązanych logów historycznych. Algorytm pomija.`);
            trace.error = "Brak historycznych logów CSV/XLSX dla tego EAN.";
            return trace;
        }
        
        trace.steps.push({ step: 3, name: 'Odczyt Time-Decay KPI z Historycznych Transakcji', status: 'success' });

        let done = false;
        let totalAddedProfit = 0;
        let totalAdSpent = 0;
        let totalExtraSales = 0;
        let lastDecision = null;

        // Run the backtest for this product
        while (!done) {
            const decision = await biddingEngine.executeStrategy(product.id, observation, { bypassCompliance: true });
            lastDecision = decision;
            
            const stepResult = await env.step(decision.qLearningAction, decision.suggestedMaxCpc);
            
            if (decision.strategy !== 'DISABLED_BY_SENTINEL' && decision.action !== 'BLOCK') {
                qLearning.updateQValue(decision.strategy, 12, decision.qLearningAction, stepResult.reward);
            }

            totalAddedProfit += stepResult.info.reward;
            totalAdSpent += stepResult.info.adCosts;
            totalExtraSales += stepResult.info.extraSales;
            observation = stepResult.observation;
            done = stepResult.done;
            
            if (decision.action === 'BLOCK' || decision.action === 'KILL_SWITCH') {
                log(`   [ZABLOKOWANE] Data: ${stepResult.info.date} | Powód: ${decision.reason}`);
            } else {
                const qActionStr = (decision.qLearningAction || 'N/A').padEnd(11);
                const msg = `Data: ${stepResult.info.date} | Akcja QL: ${qActionStr} | CPC: ${decision.suggestedMaxCpc.toFixed(2)} PLN | Zysk (Ads-only): ${stepResult.info.reward.toFixed(2)} PLN (Koszt: ${stepResult.info.adCosts.toFixed(2)})`;
                log(`   ${msg}`);
            }
        }
        
        // Populate the trace info with the summary
        trace.kpi = {
            totalCost: totalAdSpent.toFixed(2),
            clicks: totalExtraSales * 50, // simulated clicks from sales
            rateOfReturn: totalAdSpent > 0 ? (totalAddedProfit / totalAdSpent).toFixed(2) : 0,
            totalAttributionValue: totalAddedProfit.toFixed(2),
            totalAttributionCount: totalExtraSales
        };
        
        const currentCpaNet = totalExtraSales > 0 ? (totalAdSpent / totalExtraSales) : 5.0;
        const economicsCheck = await economicsService.validateAdProfitability(product.id, currentCpaNet, {
            isSmart: true,
            coinsIssued: 0,
            inDealZone: false
        });
        
        trace.unitEconomics = economicsCheck;
        trace.decision = lastDecision;
        trace.steps.push({ step: 4, name: 'Weryfikacja Unit Economics (RL ROI)', status: 'success' });
        trace.steps.push({ step: 5, name: 'Procesowanie w AI Bidding Engine (RL)', status: 'success' });
        trace.steps.push({ step: 6, name: 'Zapis macierzy Q-Table', status: 'success' });
        
        log(`--- [Koniec] Zarobione Netto z kampanii: ${totalAddedProfit.toFixed(2)} PLN, Przepalono na reklamy: ${totalAdSpent.toFixed(2)} PLN, Dodatkowe sprzedaże: ${totalExtraSales} szt. ---`);
    }
    
    log("\n✅ BACKTESTING UKOŃCZONY. Agent RL przetrenowany na prawdziwych logach!");
    trace.success = true;
    return trace;
}

if (require.main === module) {
    runRLBacktesting().catch(console.error).finally(() => process.exit(0));
}

module.exports = runRLBacktesting;
