const { NarrativeTranslatorAgent } = require('./agents/narrative.translator.agent');
const { HazardClassificationAuditorAgent } = require('./agents/hazard.classification.auditor');
const { HealthEnvironmentAuditorAgent } = require('./agents/health.environment.auditor');
const { WorkplaceSafetyAuditorAgent } = require('./agents/workplace.safety.auditor');
const { AdministrativeAuditorAgent } = require('./agents/administrative.auditor');
const { SemanticArbiterAgent } = require('./agents/semantic.arbiter.agent');
const { ApifyEchaConnector } = require('./extractors/apify.echa.connector');

class SDSSwarmOrchestrator {
    constructor() {
        this.translator = new NarrativeTranslatorAgent();
        this.hazardAuditor = new HazardClassificationAuditorAgent();
        this.healthAuditor = new HealthEnvironmentAuditorAgent();
        this.safetyAuditor = new WorkplaceSafetyAuditorAgent();
        this.adminAuditor = new AdministrativeAuditorAgent();
        this.arbiter = new SemanticArbiterAgent();
        this.echaConnector = new ApifyEchaConnector();
    }

    async processPayload(agentPayload) {
        console.log('[SDSSwarmOrchestrator] Inicjowanie wieloagentowego obwodu przetwarzania SDS...');
        
        try {
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

            console.log('[SDSSwarmOrchestrator] Przekazanie tekstu do Translatorskiego Agenta...');
            const translatedData = await this.translator.translate(agentPayload.descriptiveSectionsToTranslate);

            console.log('[SDSSwarmOrchestrator] Przekazanie do Klastra Audytorów Dziedzinowych...');
            const auditedData = await this.auditWithDomainExperts(translatedData);

            console.log('[SDSSwarmOrchestrator] Przekazanie do Arbitra (Ochrona Integralności Danych)...');
            const finalDescriptiveData = await this.arbiter.arbitrate(agentPayload.descriptiveSectionsToTranslate, auditedData);

            console.log('[SDSSwarmOrchestrator] Wieloagentowy potok translacyjny zakończony sukcesem.');
            return finalDescriptiveData;

        } catch (error) {
            console.error('[SDSSwarmOrchestrator] KRYTYCZNY BŁĄD W ROJU AGENTÓW:', error.message);
            throw error;
        }
    }

    async auditWithDomainExperts(translatedData) {
        const auditedData = {};
        for (const [sectionKey, content] of Object.entries(translatedData)) {
            // Pomijamy sekcje objęte kwarantanną (QUARANTINE) w audycie
            if (content.type === "QUARANTINE") {
                auditedData[sectionKey] = content;
                continue;
            }

            const sectionNum = parseInt(sectionKey.replace('section_', ''), 10);
            let auditorAgent = null;
            
            if ([2, 3, 9, 14, 15].includes(sectionNum)) {
                auditorAgent = this.hazardAuditor;
            } else if ([4, 11, 12].includes(sectionNum)) {
                auditorAgent = this.healthAuditor;
            } else if ([5, 6, 7, 8, 10, 13].includes(sectionNum)) {
                auditorAgent = this.safetyAuditor;
            } else if ([1, 16].includes(sectionNum)) {
                auditorAgent = this.adminAuditor;
            }

            if (auditorAgent) {
                const result = await auditorAgent.audit({ [sectionKey]: content });
                // result to np. { "section_2": { type: "DESCRIPTIVE", content: "..." } }
                if (result && result[sectionKey]) {
                    auditedData[sectionKey] = result[sectionKey];
                } else {
                    console.warn(`[SDSSwarmOrchestrator] Audytor nie zwrócił sekcji ${sectionKey}! Fallback do wersji z tłumaczenia.`);
                    auditedData[sectionKey] = content;
                }
            } else {
                auditedData[sectionKey] = content;
            }
        }
        return auditedData;
    }
}

module.exports = { SDSSwarmOrchestrator };
