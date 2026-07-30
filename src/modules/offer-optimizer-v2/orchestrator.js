const fs = require('fs');
const path = require('path');
const { callAgentWithTelemetry } = require('./ai.wrapper');
const { ean_checksum, route_chemical } = require('./validators');

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
        product_name: { type: "string" },
        country_of_origin: { type: "string" },
        logistics: {
            type: "object",
            properties: {
                weight_kg: { type: "number" },
                dimensions_cm: { type: "string" },
                hazardous_material: { type: "boolean" }
            }
        },
        compliance_gpsr_clp: {
            type: "object",
            properties: {
                is_cosmetic: { type: "boolean" },
                is_detergent: { type: "boolean" },
                is_general_product: { type: "boolean" },
                requires_sds: { type: "boolean" },
                applicable_regulations: { type: "array", items: { type: "string" } }
            }
        },
        verified_certificates: { type: "array", items: { type: "string" } },
        raw_ingredients_inci: { type: "string" },
        missing_critical_data: { type: "boolean" },
        research_sources_used: { type: "array", items: { type: "string" }, maxItems: 8 }
    },
    required: ["pipeline_id", "gtin_ean", "product_name", "missing_critical_data"]
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
            const { result, usage } = await callAgentWithTelemetry({
                agentId: "1",
                prompt,
                schema: a1Schema
            });

            this.state.token_usage_per_node['A1'] = usage;
            this.state.a1_result = result;
            
            if (result.missing_critical_data) {
                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = 'Brak danych krytycznych - sprawdź research LLM';
                this.state.next_action = 'HALT';
            } else {
                this.state.node_status['A1'] = 'OK';
                this.state.next_action = 'RUN_A2';
                this.state.current_phase = PHASE_2_LEGAL;
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
