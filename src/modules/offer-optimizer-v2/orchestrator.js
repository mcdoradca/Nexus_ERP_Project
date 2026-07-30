const fs = require('fs');
const path = require('path');
const aiWrapper = require('./ai.wrapper');
const { ean_checksum, route_chemical, validate_eu_responsible_person } = require('./validators');
const { FORBIDDEN_SOURCES } = require('./config/nodes.config');

const PHASE_1_GROUNDING = 'PHASE_1_GROUNDING';
const PHASE_2_LEGAL = 'PHASE_2_LEGAL';
const PHASE_3_CREATION = 'PHASE_3_CREATION';
const PHASE_4_AUDIT = 'PHASE_4_AUDIT';

const a1Schema = {
    type: "object",
    properties: {
        pipeline_id: { type: "string" },
        gtin_ean: { type: "string" },
        brand: { type: "string" },
        line: { type: "string" },
        mpn: { type: "string" },
        product_name: { type: "string" },
        country_of_origin: { type: "string" },
        logistics: {
            type: "object",
            properties: {
                net_capacity_or_weight: { type: "string" },
                gross_weight_kg: { type: "number" },
                dimensions_cm: { type: "string" }
            }
        },
        compliance_gpsr_clp: {
            type: "object",
            properties: {
                eu_responsible_person: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        address_eu: { type: "string" },
                        contact: { type: "string" }
                    },
                    nullable: true
                },
                clp_signal_word: { type: "string" },
                clp_h_phrases: { type: "array", items: { type: "string" } },
                clp_p_phrases: { type: "array", items: { type: "string" } },
                ufi_code: { type: "string" },
                biocidal_or_medical_permit: { type: "string" },
                ph_value: { type: "string" },
                sds_required: { type: "boolean" }
            }
        },
        verified_certificates: { type: "array", items: { type: "string" } },
        raw_ingredients_inci: { type: "string" },
        missing_critical_data: { type: "boolean" },
        missing_critical_data_reason: { type: "string" },
        research_sources_used: { type: "array", items: { type: "string" }, maxItems: 8 }
    },
    required: [
        "pipeline_id",
        "gtin_ean",
        "brand",
        "line",
        "mpn",
        "product_name",
        "country_of_origin",
        "logistics",
        "compliance_gpsr_clp",
        "verified_certificates",
        "raw_ingredients_inci",
        "missing_critical_data",
        "missing_critical_data_reason",
        "research_sources_used"
    ]
};

class Orchestrator {
    constructor(gtin) {
        this.gtin = gtin;
        this.state = {
            pipeline_id: `PL-${gtin}-${Date.now()}`,
            timestamp_utc: new Date().toISOString(),
            current_phase: PHASE_1_GROUNDING,
            node_status: {},
            revision_loop_count: 0,
            next_action: 'INIT',
            hitl_alert: null,
            frozen_hashes: { s3: null, s5: null, s6: null },
            token_usage_per_node: {}
        };
    }

    emitState() {
        // Logs disabled to avoid cluttering std out. The user wants to see JSON at the end.
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(path.join(logDir, `state_${this.state.pipeline_id}.json`), JSON.stringify(this.state, null, 2), 'utf8');
    }

    async run(pimData) {
        // Pre-validation
        const chk = ean_checksum(this.gtin);
        if (!chk.valid) {
            this.state.node_status['PRE'] = 'CRITICAL_INPUT_ERROR';
            this.state.next_action = 'HALT';
            this.emitState();
            return;
        }

        const isChemical = route_chemical(pimData);
        this.state.node_status['PRE'] = 'OK';
        this.state.chemical_route = isChemical;

        if (this.state.current_phase === PHASE_1_GROUNDING) {
            await this.runPhase1(pimData);
        }
        
        // E4b, E4c, E4d
    }

    async runPhase1(pimData) {
        this.state.next_action = 'RUN_A1';
        this.emitState();
        
        const safePim = { ...pimData };
        delete safePim.images;
        delete safePim.offerDraft; // huge base64 fields
        
        const promptTemplate = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_1_compiled.md'), 'utf8');
        const prompt = promptTemplate.replace('{{SKU_DATA}}', JSON.stringify(safePim, null, 2));
        
        try {
            const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                agentId: "1",
                prompt,
                schema: a1Schema
            });

            const warnings = [];
            const deepNormalize = (obj, path = "") => {
                for (let k in obj) {
                    if (obj[k] !== null && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
                        deepNormalize(obj[k], path ? `${path}.${k}` : k);
                    } else if (typeof obj[k] === 'string') {
                        const t = obj[k].trim().toLowerCase();
                        if (t === '' || ['null', 'none', 'n/a', 'brak'].includes(t)) {
                            obj[k] = null;
                            warnings.push(path ? `${path}.${k}` : k);
                        }
                    }
                }
            };
            deepNormalize(result);

            if (result.mpn === result.gtin_ean) {
                result.mpn = null;
                warnings.push('mpn_equals_ean');
            }

            if (result.research_sources_used && Array.isArray(result.research_sources_used)) {
                const originalSources = [...result.research_sources_used];
                result.research_sources_used = result.research_sources_used.filter(src => {
                    const domain = src.toLowerCase();
                    return !FORBIDDEN_SOURCES.some(f => new RegExp(f, 'i').test(domain));
                });
                const removed = originalSources.filter(s => !result.research_sources_used.includes(s));
                if (removed.length > 0) {
                    warnings.push('removed_forbidden_sources: ' + removed.join(', '));
                }
                
                const brand = (result.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (brand && result.research_sources_used.length > 0) {
                    const hasP1 = result.research_sources_used.some(src => src.toLowerCase().replace(/[^a-z0-9]/g, '').includes(brand));
                    if (!hasP1) {
                        warnings.push('NO_P1_SOURCE');
                    }
                }
            }

            if (result.pipeline_id !== this.state.pipeline_id) {
                result.pipeline_id = this.state.pipeline_id;
                warnings.push('pipeline_id_overwritten');
            }

            if (warnings.length > 0) {
                this.state.normalization_warnings = warnings;
            }

            this.state.token_usage_per_node['A1'] = usage;
            this.state.a1_result = result;
            
            const gpsr = result.compliance_gpsr_clp || {};
            const eu = gpsr.eu_responsible_person || {};
            
            const euSanity = validate_eu_responsible_person(eu);
            
            if (!euSanity.valid) {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'MALFORMED_EU_RESPONSIBLE_PERSON';
                this.state.next_action = 'HALT';
            } else if (!eu.name || !eu.address_eu || !eu.contact) {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'MISSING_EU_RESPONSIBLE_PERSON';
                this.state.next_action = 'HALT';
            } else if (gpsr.sds_required === true && (!gpsr.clp_h_phrases || gpsr.clp_h_phrases.length === 0)) {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'MISSING_SDS';
                this.state.next_action = 'HALT';
            } else if (result.missing_critical_data_reason === 'BANNED_SUBSTANCE_DETECTED') {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'BANNED_SUBSTANCE_DETECTED';
                this.state.next_action = 'HALT';
            } else if (result.missing_critical_data) {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'Brak danych krytycznych - sprawdź research LLM';
                this.state.next_action = 'HALT';
            } else {
                this.state.node_status['A1'] = 'OK';
                this.state.next_action = 'RUN_A2';
                // Zgodnie z 12-E4a: A1 i A2 to ta sama faza. Nie zmieniamy fazy.
            }
            
        } catch (e) {
            this.state.node_status['A1'] = 'ERROR';
            this.state.hitl_alert = e.message;
            this.state.next_action = 'HALT';
        }
        
        this.emitState();
    }
    
    async runPhase2() { throw new Error('NOT_IMPLEMENTED_E4b'); }
    async runPhase3() { throw new Error('NOT_IMPLEMENTED_E4b'); }
    async runPhase4() { throw new Error('NOT_IMPLEMENTED_E4b'); }
}

module.exports = {
    Orchestrator,
    PHASE_1_GROUNDING,
    PHASE_2_LEGAL,
    PHASE_3_CREATION,
    PHASE_4_AUDIT
};
