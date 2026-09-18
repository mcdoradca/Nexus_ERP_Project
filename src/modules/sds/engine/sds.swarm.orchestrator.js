const { NarrativeTranslatorAgent } = require('./agents/narrative.translator.agent');
const { RegulatoryAuditorAgent } = require('./agents/regulatory.auditor.agent');
const { SemanticArbiterAgent } = require('./agents/semantic.arbiter.agent');
const { ApifyEchaConnector } = require('./extractors/apify.echa.connector');

class SDSSwarmOrchestrator {
    constructor() {
        this.translator = new NarrativeTranslatorAgent();
        this.auditor = new RegulatoryAuditorAgent();
        this.arbiter = new SemanticArbiterAgent();
        this.echaConnector = new ApifyEchaConnector();
    }

    /**
     * Główny obwód (State Machine) roju (Swarm)
     * Zastępuje monolityczny processSdsWithAgent
     */
    async processPayload(agentPayload) {
        console.log('[SDSSwarmOrchestrator] Inicjowanie wieloagentowego obwodu przetwarzania SDS...');
        
        try {
            // STAN 1: Aktualizacja SSOT dla składników deterministycznych z Apify ECHA
            if (agentPayload.deterministicSections && agentPayload.deterministicSections.section_3) {
                const components = agentPayload.deterministicSections.section_3.components || [];
                for (let comp of components) {
                    if (comp.cas) {
                        try {
                            const echaData = await this.echaConnector.fetchChemicalData(comp.cas);
                            if (echaData) {
                                comp.echaVerified = echaData;
                            }
                        } catch (err) {
                            console.warn(`[SDSSwarmOrchestrator] Apify ECHA niedostępne dla CAS ${comp.cas}, używam lokalnego cache.`);
                        }
                    }
                }
            }

            // STAN 2: Tłumaczenie narracyjne (Narrative Translator Agent)
            console.log('[SDSSwarmOrchestrator] Przekazanie tekstu do Translatorskiego Agenta...');
            const translatedData = await this.translator.translate(agentPayload.descriptiveSectionsToTranslate);

            // STAN 3: Audyt prawno-chemiczny (Regulatory Auditor Agent)
            console.log('[SDSSwarmOrchestrator] Przekazanie do Audytora (Gatekeepera Prawnego)...');
            const auditedData = await this.auditor.audit(translatedData);

            // STAN 4: Arbitraż Semantyczny - Ochrona Danych Technicznych
            console.log('[SDSSwarmOrchestrator] Przekazanie do Arbitra (Ochrona Integralności Danych)...');
            const finalDescriptiveData = await this.arbiter.arbitrate(agentPayload.descriptiveSectionsToTranslate, auditedData);

            console.log('[SDSSwarmOrchestrator] Wieloagentowy potok translacyjny zakończony sukcesem.');
            return finalDescriptiveData;

        } catch (error) {
            console.error('[SDSSwarmOrchestrator] KRYTYCZNY BŁĄD W ROJU AGENTÓW:', error.message);
            throw error;
        }
    }
}

module.exports = { SDSSwarmOrchestrator };
