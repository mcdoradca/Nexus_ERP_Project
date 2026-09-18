const { NarrativeTranslatorAgent } = require('./agents/narrative.translator.agent');
const { HazardClassificationAuditorAgent } = require('./agents/hazard.classification.auditor');
const { HealthEnvironmentAuditorAgent } = require('./agents/health.environment.auditor');
const { WorkplaceSafetyAuditorAgent } = require('./agents/workplace.safety.auditor');
const { AdministrativeAuditorAgent } = require('./agents/administrative.auditor');
const { SemanticArbiterAgent } = require('./agents/semantic.arbiter.agent');
const { ApifyEchaConnector } = require('./extractors/apify.echa.connector');
const { LocalKnowledgeConnector } = require('./extractors/local.knowledge.connector');

class SDSSwarmOrchestrator {
    constructor() {
        this.translator = new NarrativeTranslatorAgent();
        this.hazardAuditor = new HazardClassificationAuditorAgent();
        this.healthAuditor = new HealthEnvironmentAuditorAgent();
        this.safetyAuditor = new WorkplaceSafetyAuditorAgent();
        this.adminAuditor = new AdministrativeAuditorAgent();
        this.arbiter = new SemanticArbiterAgent();
        this.echaConnector = new ApifyEchaConnector();
        this.rag = new LocalKnowledgeConnector();
    }

    /**
     * Główny punkt wejścia dla wielomodalnego modelu sdsData (SDSVisionAgent).
     * Przeprowadza pełny, wieloagentowy audyt klastra 4 ekspertów dziedzinowych
     * z wykorzystaniem RAG (LocalKnowledgeConnector) oraz ochroną spójności (Zero-Bypass).
     */
    async auditSdsData(sdsData) {
        console.log('[SDSSwarmOrchestrator] Rozpoczynam audyt klastra 4 ekspertów dziedzinowych na modelu sdsData...');
        if (!sdsData || !sdsData.sections) {
            console.warn('[SDSSwarmOrchestrator] Brak sdsData.sections - pomijam audyt roju.');
            return sdsData;
        }

        try {
            // 1. Podział sekcji na 4 grupy dziedzinowe
            const hazardPayload = {};
            const healthPayload = {};
            const safetyPayload = {};
            const adminPayload = {};

            for (const [secKey, secContent] of Object.entries(sdsData.sections)) {
                const secNum = parseInt(secKey.replace('section_', ''), 10);
                if ([2, 3, 9, 14, 15].includes(secNum)) {
                    hazardPayload[secKey] = secContent;
                } else if ([4, 11, 12].includes(secNum)) {
                    healthPayload[secKey] = secContent;
                } else if ([5, 6, 7, 8, 10, 13].includes(secNum)) {
                    safetyPayload[secKey] = secContent;
                } else if ([1, 16].includes(secNum)) {
                    adminPayload[secKey] = secContent;
                }
            }

            // 2. Równoległy/sekwencyjny audyt ekspertów dziedzinowych
            console.log('[SDSSwarmOrchestrator] Uruchamianie agentów dziedzinowych z narzędziami RAG...');
            const [auditedHazard, auditedHealth, auditedSafety, auditedAdmin] = await Promise.all([
                this.hazardAuditor.audit(hazardPayload).catch(err => {
                    console.error('[SDSSwarmOrchestrator] Błąd Hazard Auditor:', err.message);
                    return hazardPayload;
                }),
                this.healthAuditor.audit(healthPayload).catch(err => {
                    console.error('[SDSSwarmOrchestrator] Błąd Health Auditor:', err.message);
                    return healthPayload;
                }),
                this.safetyAuditor.audit(safetyPayload).catch(err => {
                    console.error('[SDSSwarmOrchestrator] Błąd Safety Auditor:', err.message);
                    return safetyPayload;
                }),
                this.adminAuditor.audit(adminPayload).catch(err => {
                    console.error('[SDSSwarmOrchestrator] Błąd Admin Auditor:', err.message);
                    return adminPayload;
                })
            ]);

            // 3. Połączenie wyników audytu do sdsData.sections
            const mergeGroup = (sourceGroup) => {
                if (sourceGroup && typeof sourceGroup === 'object') {
                    for (const [k, v] of Object.entries(sourceGroup)) {
                        const normKey = k.replace('section_', '');
                        if (v) sdsData.sections[normKey] = v;
                    }
                }
            };

            mergeGroup(auditedHazard);
            mergeGroup(auditedHealth);
            mergeGroup(auditedSafety);
            mergeGroup(auditedAdmin);

            // 4. Deterministyczna tarcza spójności prawnej (Zero-Bypass Enforcement)
            await this._applyDeterministicEnforcements(sdsData);

            console.log('[SDSSwarmOrchestrator] Audyt klastra ekspertów dziedzinowych zakończony 100% SUKCESEM.');
            return sdsData;
        } catch (error) {
            console.error('[SDSSwarmOrchestrator] Błąd podczas audytu sdsData:', error.message);
            // Zastosuj deterministyczne zabezpieczenia nawet w razie błędu LLM
            await this._applyDeterministicEnforcements(sdsData);
            return sdsData;
        }
    }

    /**
     * Bezwzględna ochrona Zero-Bypass: wstrzykiwanie twardych norm z RAG,
     * wycinanie WGK/TRGS, obsługa Art. 18 ust. 3 CLP oraz walidacja ATE/NDS.
     */
    async _applyDeterministicEnforcements(sdsData) {
        const sections = sdsData.sections || {};

        // 1. Sekcja 2.2: Art. 18 ust. 3 CLP oraz format EUH208
        const hasHazards = Boolean(
            (sdsData.classification?.hPhrases && sdsData.classification.hPhrases.length > 0) ||
            (sdsData.classification?.hazardClasses && sdsData.classification.hazardClasses.length > 0)
        );

        if (sections['2'] && typeof sections['2'] === 'object') {
            let sec22 = sections['2']['2.2'] || '';
            if (!hasHazards) {
                // Jeśli brak klasyfikacji stwarzającej zagrożenie, nazwy niebezpiecznych substancji = "Nie dotyczy."
                if (/Nazwy niebezpiecznych substancji wymienione na etykiecie:/i.test(sec22)) {
                    sec22 = sec22.replace(/Nazwy niebezpiecznych substancji wymienione na etykiecie:[^\n]*/i, 'Nazwy niebezpiecznych substancji wymienione na etykiecie: Nie dotyczy.');
                }
            }

            // Gwarancja pełnego zdania EUH208
            if (/EUH208/i.test(sec22) && !/Może powodować wystąpienie reakcji alergicznej/i.test(sec22)) {
                sec22 = sec22.replace(/(EUH208\s+Zawiera[^.]+)(\.?)/i, '$1. Może powodować wystąpienie reakcji alergicznej.');
            }
            sections['2']['2.2'] = sec22;
        }

        // 2. Sekcja 3.2: Wzbogacenie ATE dla CAS 55965-84-9 (CMI/MIT)
        if (Array.isArray(sdsData.components)) {
            for (const comp of sdsData.components) {
                if (comp.cas === '55965-84-9' && !/ATE/i.test(comp.clp || '')) {
                    const clpData = await this.rag.lookupHarmonizedCLP('55965-84-9');
                    if (clpData.found && clpData.ate) {
                        comp.clp = (comp.clp || '') + `; ATE (droga pokarmowa) = ${clpData.ate.oral}; ATE (na skórę) = ${clpData.ate.dermal}; ATE (inhalacyjnie, pyły/mgły) = ${clpData.ate.inhalation_mists}`;
                    }
                }
            }
        }

        // 3. Sekcja 8.1: NDS z oficjalnej bazy + klauzula DNEL/PNEC
        if (sections['8'] && typeof sections['8'] === 'object') {
            const foundLimits = [];
            if (Array.isArray(sdsData.components)) {
                for (const comp of sdsData.components) {
                    if (comp.cas && comp.cas !== '-' && comp.cas !== 'Brak') {
                        const nds = await this.rag.lookupPolishNDS(comp.cas);
                        if (nds.found && nds.NDS !== 'brak') {
                            let entry = `${comp.namePl || comp.nameEn || nds.substance} [CAS: ${comp.cas}]:\n- NDS: ${nds.NDS}`;
                            if (nds.NDSCh && nds.NDSCh !== 'brak' && nds.NDSCh !== '-') entry += `\n- NDSCh: ${nds.NDSCh}`;
                            if (nds.NDSP && nds.NDSP !== 'brak' && nds.NDSP !== '-') entry += `\n- NDSP: ${nds.NDSP}`;
                            if (nds.uwagi && nds.uwagi !== 'brak' && nds.uwagi !== '-') entry += `\n- Uwagi: ${nds.uwagi}`;
                            foundLimits.push(entry);
                        }
                    }
                }
            }

            let sec81Text = "";
            if (foundLimits.length > 0) {
                sec81Text = "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n" + foundLimits.join('\n\n') + "\n\n";
            }
            const existing81 = sections['8']['8.1'] || '';
            if (existing81 && !existing81.includes('Dz.U. 2024 poz. 1017')) {
                sec81Text += existing81 + "\n\n";
            }
            if (!sec81Text.includes('Wartości DNEL') && !sec81Text.includes('nie oznaczono wartości DNEL')) {
                sec81Text += "Wartości DNEL (Pochodny poziom niepowodujący zmian) i PNEC (Przewidywane stężenie niepowodujące zmian w środowisku):\nDla mieszaniny oraz substancji składowych nie oznaczono wartości DNEL oraz PNEC.";
            }
            sections['8']['8.1'] = sec81Text.trim();
        }

        // 4. Sekcja 7: Usunięcie niemieckich TRGS 510 i WGK
        if (sections['7'] && typeof sections['7'] === 'object') {
            for (const k of Object.keys(sections['7'])) {
                if (typeof sections['7'][k] === 'string') {
                    sections['7'][k] = sections['7'][k]
                        .replace(/Storage\s*class\s*TRGS\s*510[^;\n\.]*/gi, '')
                        .replace(/TRGS\s*510[^;\n\.]*/gi, '')
                        .replace(/Lagerklasse[^;\n\.]*/gi, '')
                        .replace(/WGK\s*:\s*\d+/gi, '')
                        .trim();
                }
            }
        }

        // 5. Sekcja 13: Kody odpadów (Dz.U. 2020 poz. 10)
        if (sections['13'] && typeof sections['13'] === 'object') {
            const wasteInfo = await this.rag.lookupWasteCode(sdsData.metadata?.productName || '', hasHazards);
            sections['13']['13.1'] = `Metody unieszkodliwiania odpadów:
Odzyskać lub poddać recyklingowi, jeśli to możliwe. Nie wprowadzać do kanalizacji, wód powierzchniowych ani gruntowych. Likwidację pozostałości produktu oraz opakowań powierzać wyłącznie uprawnionym podmiotom posiadającym stosowne decyzje odpadowe (wpis do rejestru BDO).

Klasyfikacja i proponowane kody odpadów (Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów, Dz.U. 2020 poz. 10):
- Odpady z produktu (gospodarstwa domowe / konsumenci): ${wasteInfo.consumer_code}
- Odpady z produktu (sektor przemysłowy / czyszczenie instalacji): ${wasteInfo.industrial_code}
- Odpady opakowaniowe: ${wasteInfo.packaging_code}

Krajowe akty prawne:
- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).
- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).
- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).`;
        }

        // 6. Sekcja 15.1: Czysty wykaz aktów prawnych (brak WGK, TRGS, Ograniczenia 75)
        if (sections['15'] && typeof sections['15'] === 'object') {
            const isFlammable = Boolean(
                sdsData.classification?.hazardClasses?.some(c => /Flam/i.test(c)) ||
                sdsData.classification?.hPhrases?.some(h => /H22[456]/i.test(h))
            );
            sections['15']['15.1'] = this.rag.lookupLegalActs({ isFlammable, isTattooProduct: false });
            if (!sections['15']['15.2']) {
                sections['15']['15.2'] = "Dla mieszaniny nie przeprowadzono oceny bezpieczeństwa chemicznego.";
            }
        }

        // 7. Sekcja 16: Egzekwowanie kanonicznej stopki prawnej ITALLUX (literatura, szkolenia, rewizja 1.0 PL, klauzula prawna)
        if (sections['16']) {
            const canonicalFooter = this.rag.getSection16LegalFooter(sdsData.metadata || {});
            const sanitize16 = (text) => {
                if (!text || typeof text !== 'string') return canonicalFooter;
                const cutIndex = text.search(/(?:Główne\s+źródła\s+literatury|Wskazówki\s+szkoleniowe|Zalecenia\s+i\s+wskazówki\s+szkoleniowe|Informacje\s+o\s+zmianach|Klauzula\s+prawna)/i);
                const prefix = cutIndex >= 0 ? text.substring(0, cutIndex).trim() : text.trim();
                return prefix ? `${prefix}\n\n${canonicalFooter}` : canonicalFooter;
            };

            if (typeof sections['16'] === 'string') {
                sections['16'] = sanitize16(sections['16']);
            } else if (typeof sections['16'] === 'object') {
                if (sections['16']['16.1']) {
                    sections['16']['16.1'] = sanitize16(sections['16']['16.1']);
                } else if (sections['16']['16']) {
                    sections['16']['16'] = sanitize16(sections['16']['16']);
                } else {
                    sections['16']['16.1'] = canonicalFooter;
                }
            }
        }
    }

    /**
     * Starszy potok dla monolitycznego agentPayload (dla zachowania wstecznej kompatybilności).
     */
    async processPayload(agentPayload) {
        console.log('[SDSSwarmOrchestrator] Inicjowanie wieloagentowego obwodu przetwarzania SDS (legacy payload)...');
        try {
            if (agentPayload.deterministicSections && agentPayload.deterministicSections.section_3) {
                const components = agentPayload.deterministicSections.section_3.components || [];
                for (let comp of components) {
                    if (comp.cas) {
                        try {
                            const echaData = await this.echaConnector.fetchChemicalData(comp.cas);
                            if (echaData) comp.echaVerified = echaData;
                        } catch (err) {
                            console.warn(`[SDSSwarmOrchestrator] Apify ECHA niedostępne dla CAS ${comp.cas}, używam lokalnego cache.`);
                        }
                    }
                }
            }

            const translatedData = await this.translator.translate(agentPayload.descriptiveSectionsToTranslate);
            const auditedData = await this.auditWithDomainExperts(translatedData);
            const finalDescriptiveData = await this.arbiter.arbitrate(agentPayload.descriptiveSectionsToTranslate, auditedData);
            return finalDescriptiveData;
        } catch (error) {
            console.error('[SDSSwarmOrchestrator] KRYTYCZNY BŁĄD W ROJU AGENTÓW:', error.message);
            throw error;
        }
    }

    async auditWithDomainExperts(translatedData) {
        const auditedData = {};
        for (const [sectionKey, content] of Object.entries(translatedData)) {
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
                if (result && result[sectionKey]) {
                    auditedData[sectionKey] = result[sectionKey];
                } else {
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
