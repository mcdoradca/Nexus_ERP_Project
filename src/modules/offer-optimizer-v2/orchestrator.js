const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const aiWrapper = require('./ai.wrapper');
const { ean_checksum, route_chemical, validate_eu_responsible_person, gate_ingredients } = require('./validators');
const { FORBIDDEN_SOURCES, DATA_SOURCE_MODE } = require('./config/nodes.config');
const baselinkerExtract = require('./baselinker.extract.js');
const { normalizeIngredientName } = require('./normalization.js');
const ragService = require('./knowledge.rag.service.js');
const { validate_html_whitelist, scan_medical_claims_lexical, scan_stopwords } = require('./validators');

const PHASE_1_GROUNDING = 'PHASE_1_GROUNDING';
const PHASE_2_LEGAL = 'PHASE_2_LEGAL';
const PHASE_3_CREATION = 'PHASE_3_CREATION';
const PHASE_4_AUDIT = 'PHASE_4_AUDIT';

const WRITE_BACK_ENABLED = false;

const safeStringify = (obj) => {
    const seen = new WeakSet();
    const str = JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
        }
        return value;
    }, 2);
    if (str && str.length > 50000) {
        return JSON.stringify({
            _sys: "TRUNCATED_PAYLOAD",
            message: "Payload exceeded 50000 chars and was truncated to protect Socket.IO limit.",
            originalSize: str.length
        }, null, 2);
    }
    return str;
};

const traceInci = (ean, step, data) => {
    try {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const filePath = path.join(logDir, `INCI_TRACE_${ean}.log`);
        const time = new Date().toISOString();
        const strData = typeof data === 'object' ? safeStringify(data) : data;
        const msg = `[${time}] [${step}]\n${strData}\n\n`;
        fs.appendFileSync(filePath, msg, 'utf8');
        
        // WYŚWIETLANIE NA FRONTENDZIE UŻYTKOWNIKA (Złapie to globalny hook console.log i prześle przez WebSockety)
        console.log(`\n\n=== 🕵️ INCI TRACE [${step}] ===\n${strData}\n==================================\n`);
    } catch(e) {
        console.error("Blad traceInci", e);
    }
};

const normalizeTags = (htmlStr) => {
    if (!htmlStr) return htmlStr;
    return htmlStr.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')
                  .replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>');
};

const a1Schema = {
    type: "object",
    properties: {
        country_of_origin: { type: "string" },
        research_sources_used: { type: "array", items: { type: "string" }, maxItems: 8 },
        extracted_inci_candidates: { type: "array", items: { type: "array", items: { type: "string" } } },
        eu_responsible_person: { 
            type: "object", 
            properties: {
                name: { type: "string" },
                address_eu: { type: "string" },
                contact: { type: "string" }
            }
        },
        logistics: {
            type: "object",
            properties: {
                net_capacity_or_weight: { type: "string" },
                gross_weight_kg: { type: "number" },
                dimensions_cm: {
                    type: "object",
                    properties: { length_x: { type: "number" }, width_y: { type: "number" }, height_z: { type: "number" } }
                }
            }
        },
        compliance: {
            type: "object",
            properties: {
                clp_signal_word: { type: "string" },
                clp_h_phrases: { type: "array", items: { type: "string" } },
                clp_p_phrases: { type: "array", items: { type: "string" } }
            }
        },
        missing_parameters: { type: "object", additionalProperties: { type: "string" } }
    },
    required: [
        "country_of_origin",
        "research_sources_used"
    ]
};

const a2Schema = {
    type: "object",
    properties: {
        sentiment_available: { type: "boolean" },
        total_reviews_analyzed: { type: "number" },
        average_rating: { type: "number" },
        social_proof_matrix: {
            type: "object",
            properties: {
                raw_customer_delights: { type: "array", items: { type: "string" } },
                real_life_use_cases: { type: "array", items: { type: "string" } },
                competitor_pain_points_eliminated: { type: "array", items: { type: "string" } },
                authentic_minor_flaws: { type: "array", items: { type: "string" } }
            }
        },
        safety_signals_detected: { type: "array", items: { type: "string" } },
        scraped_sources: { type: "array", items: { type: "string" } }
    },
    required: [
        "sentiment_available",
        "total_reviews_analyzed",
        "average_rating",
        "social_proof_matrix",
        "safety_signals_detected",
        "scraped_sources"
    ]
};

function generateInciVariants(rawInci) {
    let cleaned = rawInci.replace(/[.,;]+$/, '').trim();
    let variants = [];
    if (cleaned.includes('(') && cleaned.includes(')')) {
        variants.push(normalizeIngredientName(cleaned));
        
        const beforeParen = cleaned.substring(0, cleaned.indexOf('(')).trim();
        if (beforeParen) variants.push(normalizeIngredientName(beforeParen));
        
        const insideParenMatch = cleaned.match(/\(([^)]+)\)/);
        if (insideParenMatch && insideParenMatch[1]) {
            variants.push(normalizeIngredientName(insideParenMatch[1].trim()));
        }

        const withoutParen = cleaned.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        if (withoutParen && withoutParen !== beforeParen) {
            variants.push(normalizeIngredientName(withoutParen));
        }
    } else {
        variants.push(normalizeIngredientName(cleaned));
    }
    
    // Piąty wariant (wariant z dodanym/odjętym 's' na bazie wynikowych wariantów)
    const extraVariants = [];
    for (let v of variants) {
        if (!v.endsWith('s')) extraVariants.push(v + 's');
        if (v.endsWith('s')) extraVariants.push(v.slice(0, -1));
    }
    
    return [...variants, ...extraVariants];
}

async function loadProductDataAsync(ean, pimData) {
    if (DATA_SOURCE_MODE === 'api') {
        if (pimData && pimData.text_fields) {
            console.log(`[Orchestrator V2] Używam danych z bazy PIM (lokalnego cache) dla EAN ${ean}, omijając zapytanie do API BaseLinkera...`);
            return pimData;
        }
        throw new Error(`Brak kompletnych danych PIM dla EAN ${ean}. Automatyczne pobieranie w locie z API BaseLinkera zostało ZABLOKOWANE przez politykę (ochrona przed banem limitów 429).`);
    }
    const dir = path.join(__dirname, 'tests', 'fixtures');
    const files = fs.readdirSync(dir);
    const eanFiles = files.filter(f => f.includes(ean));
    if (eanFiles.length === 0) {
        throw new Error('Brak fixture dla EAN: ' + ean);
    }
    const targetFile = eanFiles.find(f => f.endsWith('.raw.json')) || eanFiles[0];
    const data = fs.readFileSync(path.join(dir, targetFile), 'utf8');
    return JSON.parse(data);
}

// --- Globalny hook logów dla frontendu ---
const originalLog = console.log;
console.log = (...args) => {
    originalLog(...args);
    try {
        const socketService = require('../../core/socket');
        // Przechwytujemy wszystko do konsoli webowej, aby widać było pracę V2
        socketService.broadcast('nexus-notification', { type: 'PIPELINE_LOG', agentId: 'Orchestrator V2', message: args.map(a => typeof a === 'object' ? safeStringify(a) : a).join(' ') });
    } catch(e) {}
};

class Orchestrator {
    constructor(gtin) {
        this.gtin = gtin;
        this.state = {
            pipeline_id: "PL-" + gtin + "-" + Date.now(),
            timestamp_utc: new Date().toISOString(),
            current_phase: PHASE_1_GROUNDING,
            node_status: {},
            revision_loop_count: 0,
            next_action: 'RUN_EXTRACT',
            hitl_alert: null,
            hitl_log: [],
            frozen_hashes: { s3: null, s5: null, s6: null },
            token_usage_per_node: {},
            chemical_route: false,
            chemical_route_reasons: []
        };
    }

    emitState() {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(path.join(logDir, `state_${this.state.pipeline_id}.json`), JSON.stringify(this.state, null, 2), 'utf8');
        
        try {
            const socketService = require('../../core/socket');
            socketService.broadcast('nexus-notification', { 
                type: 'PIPELINE_STATUS', 
                ean: this.gtin, 
                payload: {
                    pipeline_id: this.state.pipeline_id,
                    current_phase: this.state.current_phase,
                    active_nodes: [this.state.next_action],
                    node_status: this.state.node_status,
                    next_action: this.state.next_action,
                    hitl_alert: this.state.hitl_alert,
                    hitl_inci_candidates: this.state.hitl_inci_candidates,
                    extracted_data: this.state.extracted_data
                } 
            });
        } catch(e) {
            console.error('[Orchestrator] Błąd wysyłania socketu:', e.message);
        }
    }

    async run(pimData) {
        const chk = ean_checksum(this.gtin);
        if (!chk.valid) {
            this.state.node_status['PRE'] = 'CRITICAL_INPUT_ERROR';
            this.state.next_action = 'HALT';
            this.emitState();
            return;
        }

        this.state.node_status['PRE'] = 'OK';

        if (this.state.current_phase === PHASE_1_GROUNDING) {
            await this.runPhase1(pimData);
        }
    }

    resumeFromState(savedState) {
        if (!savedState) return;
        this.state = savedState;
        console.log(`[Orchestrator V2] Wznowiono stan dla potoku: ${this.state.pipeline_id}`);
    }

    async runPhase1(pimData) {
        const blData = await loadProductDataAsync(this.gtin, pimData);
        let product = null;
        if (blData && blData.products) {
            product = Object.values(blData.products)[0];
        } else {
            product = blData;
        }

        const extracted = baselinkerExtract.extractFromFeatures(product);
        const descResult = baselinkerExtract.extractResponsiblePersonFromDescription(product?.text_fields?.description);
        
        this.state.extracted_data = {
            inci: extracted.inci,
            mpn: extracted.mpn,
            brand: extracted.brand,
            capacity: extracted.capacity,
            usage: extracted.usage,
            warnings: extracted.warnings,
            line: extracted.line,
            truncated: extracted.truncated,
            recovered_keys: extracted.recovered_keys,
            eu_responsible_person: { 
                source: descResult.raw_fragment ? 'description' : null, 
                data: descResult 
            },
            product_name: {
                value: product?.text_fields?.name || null,
                source: product?.text_fields?.name ? 'baselinker' : null,
                matched_key: null
            }
        };

        // --- TRASA (KROK 1) ---
        const reasons = [];
        if (this.state.extracted_data.inci?.value) {
            reasons.push('HAS_INCI');
        }
        const catKeys = ['category', 'category_id', 'group'];
        for (let key of catKeys) {
            if (product && product[key]) {
                const valStr = String(product[key]).toLowerCase();
                if (valStr.includes('chemia') || valStr.includes('chemical') || valStr.includes('biobójcz') || valStr.includes('biocid')) {
                    reasons.push('CATEGORY_CHEMICAL');
                    break;
                }
            }
        }
        reasons.push('SDS_STATUS_UNKNOWN');
        
        this.state.chemical_route_reasons = reasons;
        this.state.chemical_route = reasons.length > 0;
        // --- KONIEC TRASY ---

        const missingFields = [];
        if (!this.state.extracted_data.brand.source) missingFields.push('brand');
        if (!this.state.extracted_data.product_name.source) missingFields.push('product_name');
        if (!this.state.extracted_data.line.source) missingFields.push('line');
        missingFields.push('country_of_origin');
        if (!extracted?.inci?.value) missingFields.push('inci');
        if (!this.state.extracted_data.eu_responsible_person.source) missingFields.push('eu_responsible_person');

        // Dynamiczne wykrywanie brakujących parametrów Allegro
        if (pimData && pimData.allegro_schema) {
            const configExtract = require('./baselinker.extract.config.json');
            let featuresObj = {};
            if (pimData.features && typeof pimData.features === 'object') Object.assign(featuresObj, pimData.features);
            if (pimData['features|pl'] && typeof pimData['features|pl'] === 'object') Object.assign(featuresObj, pimData['features|pl']);
            if (typeof pimData.text_fields?.features === 'object' && pimData.text_fields?.features !== null) {
                Object.assign(featuresObj, pimData.text_fields.features);
            } else if (typeof pimData.text_fields?.features === 'string') {
                try {
                    Object.assign(featuresObj, JSON.parse(pimData.text_fields.features));
                } catch(e) {}
            }

            for (let param of pimData.allegro_schema) {
                const nameKey = param.name;
                const normNameKey = baselinkerExtract.normalizeFeatureKey(nameKey);
                
                const isInciParam = configExtract.featureSynonyms.inci.includes(normNameKey) || normNameKey.includes('sklad') || normNameKey.includes('inci');
                if (isInciParam && extracted?.inci?.value) {
                    continue;
                }

                let found = false;
                for (let k in featuresObj) {
                    if (k.toLowerCase() === nameKey.toLowerCase() && featuresObj[k]) {
                        found = true;
                        break;
                    }
                    if (baselinkerExtract.normalizeFeatureKey(k) === normNameKey && featuresObj[k]) {
                        found = true;
                        break;
                    }
                }
                if (!found && param.required) {
                    missingFields.push(nameKey);
                }
            }
        }

        if (missingFields.length > 0 && this.state.node_status['EXTRACT'] !== 'HITL_OVERRIDDEN') {
            const osintScraper = require('../offer-optimizer/osint.scraper.service');
            const productNameForOsint = product?.text_fields?.name || "Nieznany Produkt";
            console.log(`[Orchestrator] Brakujące parametry: ${missingFields.join(', ')}. Uruchamiam OSINT Scraper...`);
            const osintText = await osintScraper.searchAndExtract(this.gtin, productNameForOsint, missingFields);
            
            if (osintText) {
                this.state.osint_data = osintText;
                console.log(`[Orchestrator] Pomyślnie pobrano dane z OSINT (skrypt JS). Przekazywanie do Agenta 1.`);
            } else {
                console.log(`[Orchestrator] Pre-Scraper (JS) nie znalazł danych (lub wystąpił błąd pobierania). Ustawiam osint_data na pusty, Agent 1 musi użyć narzędzia googleSearch samodzielnie!`);
                this.state.osint_data = "";
            }
        }

        if (extracted?.inci?.value) {
            const inciArray = extracted.inci.value.split(',').map(i => normalizeIngredientName(i.trim())).filter(i => i);
            const gateRes = gate_ingredients(inciArray);
            if ((gateRes.status === 'BANNED_SUBSTANCE_DETECTED' || gateRes.status === 'INGREDIENT_NOT_COSMETIC') && this.state.node_status['EXTRACT'] !== 'HITL_OVERRIDDEN') {
                this.state.node_status['EXTRACT'] = 'HALTED_HITL_REQUIRED';
                this.state.hitl_alert = gateRes.status;
                this.state.hitl_substance = gateRes.substance;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }

        const inciRefService = require('./inci.reference.service.js');
        const notInGlossary = [];
        let rawInciArray = (extracted.inci.value || '').split(',').map(i => i.trim()).filter(i => i);
        
        const checkHit = (phrase) => {
            const variants = generateInciVariants(phrase);
            for (let v of variants) {
                if (inciRefService.isOfficialIngredient(v)) return true;
            }
            return false;
        };

        let i = 0;
        while (i < rawInciArray.length) {
            let rawI = rawInciArray[i];
            let found = checkHit(rawI);
            
            const checkHitExact = (phrase) => {
                let cleaned = phrase.replace(/[.,;]+$/, '').trim();
                let v = normalizeIngredientName(cleaned);
                let variants = [v];
                if (!v.endsWith('s')) variants.push(v + 's');
                if (v.endsWith('s')) variants.push(v.slice(0, -1));
                for (let variant of variants) {
                    if (inciRefService.isOfficialIngredient(variant)) return true;
                }
                return false;
            };

            if (!found) {
                if (i + 1 < rawInciArray.length) {
                    let gluedNext = rawI + ',' + rawInciArray[i+1];
                    if (checkHitExact(gluedNext)) {
                        rawInciArray[i] = gluedNext;
                        rawInciArray.splice(i+1, 1);
                        found = true;
                    }
                }
                
                if (!found && i - 1 >= 0) {
                    let gluedPrev = rawInciArray[i-1] + ',' + rawI;
                    if (checkHitExact(gluedPrev)) {
                        rawInciArray[i-1] = gluedPrev;
                        rawInciArray.splice(i, 1);
                        i--;
                        found = true;
                    }
                }
            }
            
            if (!found) {
                notInGlossary.push(rawI);
            }
            i++;
        }
        
        if (notInGlossary.length > 0) {
            this.state.normalization_warnings = this.state.normalization_warnings || [];
            this.state.normalization_warnings.push('INGREDIENT_NOT_IN_GLOSSARY: ' + notInGlossary.join(', '));
            // Omijamy halt (Zgodnie z D25 potok idzie dalej)
        }

        const eu = descResult;
        // WALIDACJA EU PRZENIESIONA NA KONIEC A1 ABY POZWOLIĆ AGENTOWI ZNALEŹĆ TE DANE
        
        this.state.node_status['EXTRACT'] = 'OK';

        // missingFields is now calculated earlier

        if (this.state.next_action === 'RUN_EXTRACT') {
            if (missingFields.length === 0 && !this.state.osint_data) {
                this.state.next_action = 'RUN_A2';
                this.state.node_status['A1'] = 'SKIPPED';
                this.state.token_usage_per_node['A1'] = { tokens_saved: true, reason: 'No missing fields detected after extraction.' };
            } else {
                this.state.next_action = 'RUN_A1';
            }
        }
        
        while (this.state.next_action === 'RUN_A1') {
            const agentData = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                capacity: extracted.capacity?.value || undefined,
                missingFields: missingFields,
                revision_loop_count: this.state.revision_loop_count
            };
            
            if (this.state.osint_data) {
                agentData.osint_data = this.state.osint_data;
            }
            if (this.state.revision_loop_count > 0) {
                agentData.revision_warning = `Poprzednie znaleziska INCI się różniły lub były błędne (Próba ${this.state.revision_loop_count+1}/3). MUSISZ poszukać głębiej, przeszukaj przynajmniej 2 INNE źródła, by znaleźć nową (trzecią/czwartą) wersję pozwalającą ustalić bezbłędny konsensus na podstawie powtarzalności.`;
            }
            
            let promptTemplate = fs.readFileSync(path.join(__dirname, 'docs', 'Agent_1_prompt_v4.md'), 'utf8');
            
            if (extracted?.inci?.value) {
                promptTemplate = promptTemplate.replace('- Skład INCI (absolutny priorytet).', '');
                promptTemplate = promptTemplate.replace(/1\. INCI \(Skład\):[\s\S]*?\(będzie to tablica tablic\)\./, '1. INCI (Skład): ZIGNORUJ. Skład INCI został już odnaleziony w PIM. Zwróć pustą tablicę lub null w `extracted_inci_candidates`.');
            }
            
            const prompt = promptTemplate.replace('{{SKU_DATA}}', JSON.stringify(agentData, null, 2));
            
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

                if (result.research_sources_used && Array.isArray(result.research_sources_used)) {
                    const originalSources = [...result.research_sources_used];
                    result.research_sources_used = result.research_sources_used.filter(src => {
                        try {
                            const u = new URL(src.startsWith('http') ? src : 'http://' + src);
                            if (!u.hostname.includes('.') || u.hostname.includes('..') || u.hostname.startsWith('.')) throw new Error('invalid');
                            const domain = u.hostname.toLowerCase();
                            if (FORBIDDEN_SOURCES.some(f => new RegExp(f, 'i').test(domain))) return false;
                            return true;
                        } catch {
                            warnings.push('INVALID_SOURCE_DOMAIN: ' + src);
                            return false;
                        }
                    });
                    const removed = originalSources.filter(s => !result.research_sources_used.includes(s));
                    if (removed.length > 0) warnings.push('removed_forbidden_sources: ' + removed.join(', '));
                    // P1_SOURCE_CHECK usunięty zgodnie z żądaniem (adres URL nie musi zawierać nazwy marki)
                }

                if (result.pipeline_id !== this.state.pipeline_id) {
                    result.pipeline_id = this.state.pipeline_id;
                    warnings.push('pipeline_id_overwritten');
                }

                const allowedKeys = ['country_of_origin', 'research_sources_used', 'extracted_inci_candidates', 'eu_responsible_person', 'logistics', 'compliance', 'missing_parameters'];
                const finalResult = {};
                for (let k of Object.keys(result)) {
                    if (allowedKeys.includes(k)) finalResult[k] = { value: result[k], source: "a1" };
                    else warnings.push('A1_FIELD_REJECTED: ' + k);
                }
                for (let k in result) delete result[k];
                Object.assign(result, finalResult);

                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                this.state.token_usage_per_node['A1'] = usage;
                this.state.a1_result = result;

                if (result.missing_parameters && typeof result.missing_parameters.value === 'object') {
                    for (let key of Object.keys(result.missing_parameters.value)) {
                        this.state.extracted_data[key] = {
                            value: result.missing_parameters.value[key],
                            source: 'osint_a1'
                        };
                    }
                }
                
                if (result.eu_responsible_person && result.eu_responsible_person.value && typeof result.eu_responsible_person.value === 'object' && result.eu_responsible_person.value.name) {
                    this.state.extracted_data.eu_responsible_person = {
                        data: result.eu_responsible_person.value,
                        source: 'osint_a1'
                    };
                }
                
                if (result.logistics && result.logistics.value && typeof result.logistics.value === 'object') {
                    this.state.extracted_data.logistics = {
                        data: result.logistics.value,
                        source: 'osint_a1'
                    };
                }
                
                if (result.compliance && result.compliance.value && typeof result.compliance.value === 'object') {
                    this.state.extracted_data.compliance = {
                        data: result.compliance.value,
                        source: 'osint_a1'
                    };
                }
                
                // --- WERYFIKACJA INCI ZE SKRYPTU (Zlecona przez A1 OSINT) ---
                traceInci(this.gtin, 'A1_RAW_OUTPUT_CANDIDATES', result.extracted_inci_candidates);
                const candidatesRaw = (result.extracted_inci_candidates && result.extracted_inci_candidates.value && Array.isArray(result.extracted_inci_candidates.value)) ? result.extracted_inci_candidates.value : [];
                const candidates = candidatesRaw.map(c => Array.isArray(c) ? c.join(', ') : c);
                
                traceInci(this.gtin, 'A1_MAPPED_CANDIDATES', candidates);

                if (candidates.length > 0) {
                    let selectedInci = candidates[0];
                    let foundMatch = false;
                    
                    if (candidates.length > 1) {
                        const getWords = (str) => new Set(str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2));
                        for (let i = 0; i < candidates.length; i++) {
                            const wordsI = getWords(candidates[i]);
                            for (let j = i + 1; j < candidates.length; j++) {
                                const wordsJ = getWords(candidates[j]);
                                let intersection = new Set([...wordsI].filter(x => wordsJ.has(x)));
                                let union = new Set([...wordsI, ...wordsJ]);
                                let sim = intersection.size / (union.size || 1);
                                
                                // Rygorystyczny match dla Spójnej Pary INCI: 0.85 (85% powtarzalności)
                                if (sim >= 0.85) { 
                                    selectedInci = candidates[i].length > candidates[j].length ? candidates[i] : candidates[j];
                                    foundMatch = true;
                                    break;
                                }
                            }
                            if (foundMatch) break;
                        }
                    }
                    
                    if (candidates.length > 1 && !foundMatch && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                        if (this.state.revision_loop_count < 2) {
                            this.state.revision_loop_count++;
                            this.state.next_action = 'RUN_A1';
                            this.state.node_status['A1'] = 'RETRYING';
                            console.log(`[Orchestrator] Sprzeczne INCI z OSINT (próba ${this.state.revision_loop_count}). Brak spójnej pary. Ponawiam OSINT...`);
                            continue; // Pętla wraca do RUN_A1
                        } else {
                            this.state.hitl_inci_candidates = candidates;
                            const preview1 = candidates[0].substring(0, 150) + (candidates[0].length > 150 ? '...' : '');
                            const preview2 = candidates[1].substring(0, 150) + (candidates[1].length > 150 ? '...' : '');
                            this.state.hitl_alert = `OSINT_CONFLICTING_INCI_MAX_RETRYS: Po ${this.state.revision_loop_count + 1} próbach znaleziono minimum 3 różne wersje składu w internecie (brak spójnej pary). Sprawdź ręcznie i zatwierdź.\n[Wersja 1]: ${preview1}\n[Wersja 2]: ${preview2}`;
                            this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                            this.state.next_action = 'HALT';
                            this.emitState();
                            return;
                        }
                    }
                    
                    const polishPattern = /\b(woda|kwas|ekstrakt|olej|sok|gliceryna|masło|maslo|liść|lisc|korzeń|korzen|wyciąg|wyciag)\b/i;
                    if (polishPattern.test(selectedInci) && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                        this.state.hitl_alert = 'OSINT_TRANSLATED_INCI_ERROR: Wykryto polskie tłumaczenie w składzie INCI (niedozwolone). Zaktualizuj na oryginalny skład łaciński/angielski.';
                        this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                        this.state.next_action = 'HALT';
                        this.emitState();
                        return;
                    }

                    // --- WALIDACJA SPÓJNOŚCI COSING PO OSINT (KRYTYCZNE ZABEZPIECZENIE V2) ---
                    const rawInciArrOSINT = selectedInci.split(',').map(i => i.trim()).filter(i => i);
                    const gateResOSINT = gate_ingredients(rawInciArrOSINT.map(normalizeIngredientName));
                    if ((gateResOSINT.status === 'BANNED_SUBSTANCE_DETECTED' || gateResOSINT.status === 'INGREDIENT_NOT_COSMETIC')) {
                        // Nie przerywamy od razu, dodamy do zagregowanego błędu poniżej
                        this.state.hitl_substance = gateResOSINT.substance;
                        this.state.aggregated_hitl_errors = this.state.aggregated_hitl_errors || [];
                        this.state.aggregated_hitl_errors.push(gateResOSINT.status + ' FOUND IN OSINT INCI (CMR / Banned)');
                    }
                    
                    const inciRefOSINT = require('./inci.reference.service.js');
                    let oIdx = 0;
                    const notInGlossaryOSINT = [];
                    const checkHitExactOSINT = (phrase) => {
                        let cleaned = phrase.replace(/[.,;]+$/, '').trim();
                        let v = normalizeIngredientName(cleaned);
                        let variants = [v];
                        if (!v.endsWith('s')) variants.push(v + 's');
                        if (v.endsWith('s')) variants.push(v.slice(0, -1));
                        for (let variant of variants) {
                            if (inciRefOSINT.isOfficialIngredient(variant)) return true;
                        }
                        return false;
                    };
                    
                    while (oIdx < rawInciArrOSINT.length) {
                        let rawI = rawInciArrOSINT[oIdx];
                        let found = checkHitExactOSINT(rawI);
                        if (!found) {
                            if (oIdx + 1 < rawInciArrOSINT.length) {
                                let gluedNext = rawI + ',' + rawInciArrOSINT[oIdx+1];
                                if (checkHitExactOSINT(gluedNext)) {
                                    rawInciArrOSINT[oIdx] = gluedNext;
                                    rawInciArrOSINT.splice(oIdx+1, 1);
                                    found = true;
                                }
                            }
                            if (!found && oIdx - 1 >= 0) {
                                let gluedPrev = rawInciArrOSINT[oIdx-1] + ',' + rawI;
                                if (checkHitExactOSINT(gluedPrev)) {
                                    rawInciArrOSINT[oIdx-1] = gluedPrev;
                                    rawInciArrOSINT.splice(oIdx, 1);
                                    oIdx--;
                                    found = true;
                                }
                            }
                        }
                        if (!found) notInGlossaryOSINT.push(rawI);
                        oIdx++;
                    }
                    if (notInGlossaryOSINT.length > 0) {
                        this.state.normalization_warnings = this.state.normalization_warnings || [];
                        this.state.normalization_warnings.push('INGREDIENT_NOT_IN_GLOSSARY_OSINT: ' + notInGlossaryOSINT.join(', '));
                    }
                    
                    // Nadpisanie zmiennej przefiltrowanym, spójnym tekstem
                    selectedInci = rawInciArrOSINT.join(', ');
                    // --------------------------------------------------------
                    
                    this.state.extracted_data.inci = { value: selectedInci, source: 'osint_a1' };
                    traceInci(this.gtin, 'INCI_SAVED_TO_STATE', this.state.extracted_data.inci);
                } else {
                    traceInci(this.gtin, 'A1_RETURNED_EMPTY_CANDIDATES', 'Brak kandydatów INCI w odp.');
                }
                
                // Sprawdzamy czy po OSINCIE nadal brakuje kluczowych pól i agregujemy błędy
                const stillMissing = [];
                if (!this.state.extracted_data.inci?.value) stillMissing.push('INCI');
                
                // Weryfikacja EU Responsible Person po A1
                const finalEu = this.state.extracted_data.eu_responsible_person?.data || eu;
                if (!finalEu.name || !finalEu.address_eu || !finalEu.contact) {
                    stillMissing.push('Osoba Odpowiedzialna (Brak/Niepełne)');
                } else {
                    const euSanity = validate_eu_responsible_person(finalEu);
                    if (!euSanity.valid) stillMissing.push('Osoba Odpowiedzialna (Zły format)');
                }
                
                // Weryfikacja braków dynamicznych Allegro (jeśli A1 ich nie znalazł, ale miały być z osint_a1)
                for (let missingOfAllegro of missingFields) {
                    if (missingOfAllegro !== 'brand' && missingOfAllegro !== 'product_name' && missingOfAllegro !== 'line' && missingOfAllegro !== 'country_of_origin' && missingOfAllegro !== 'inci' && missingOfAllegro !== 'eu_responsible_person') {
                        if (!this.state.extracted_data[missingOfAllegro]?.value) {
                            stillMissing.push(missingOfAllegro);
                        }
                    }
                }
                
                this.state.aggregated_hitl_errors = this.state.aggregated_hitl_errors || [];
                if (stillMissing.length > 0) {
                    this.state.aggregated_hitl_errors.push('Brakuje: ' + stillMissing.join(', '));
                }
                
                if (this.state.aggregated_hitl_errors.length > 0 && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                    this.state.hitl_alert = 'Wymagana uwaga operatora. Wykryto problemy: ' + this.state.aggregated_hitl_errors.join(' | ');
                    this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                    this.state.next_action = 'HALT';
                    this.emitState();
                    return;
                }
                
                if (this.state.next_action !== 'HALT') {
                    this.state.node_status['A1'] = 'OK';
                    this.state.next_action = 'RUN_A2';
                }
            } catch (e) {
                console.log('⚠️ BŁĄD PHASE 1 (OSINT): ' + e.message + ' -> Pomijam i idę do A2.');
                this.state.node_status['A1'] = 'ERROR_IGNORED';
                this.state.hitl_alert = 'OSINT Pominęty: ' + e.message;
                this.state.a1_result = {};
                this.state.next_action = 'RUN_A2';
            }
        }

        // --- KROK 2: A2 ---
        if (this.state.next_action === 'RUN_A2') {
            const agent2Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined
            };
            
            const prompt2Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_2_compiled.md'), 'utf8');
            const prompt2 = prompt2Template.replace('{{SKU_DATA}}', JSON.stringify(agent2Data, null, 2));

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "2",
                    prompt: prompt2,
                    schema: a2Schema
                });
                
                const warnings = [];
                
                if (result.pipeline_id) {
                    warnings.push('A2_FIELD_REJECTED: pipeline_id');
                    delete result.pipeline_id;
                }
                if (result.gtin_ean) {
                    warnings.push('A2_FIELD_REJECTED: gtin_ean');
                    delete result.gtin_ean;
                }

                const allowedKeysA2 = [
                    'sentiment_available', 'total_reviews_analyzed', 'average_rating',
                    'social_proof_matrix', 'safety_signals_detected', 'scraped_sources'
                ];
                for (let k of Object.keys(result)) {
                    if (!allowedKeysA2.includes(k)) {
                        warnings.push('A2_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }

                if (result.social_proof_matrix) {
                    const spm = result.social_proof_matrix;
                    if (Array.isArray(spm.raw_customer_delights) && spm.raw_customer_delights.length > 5) {
                        spm.raw_customer_delights = spm.raw_customer_delights.slice(0, 5);
                        warnings.push('A2_LIMIT_TRUNCATED: raw_customer_delights');
                    }
                    if (Array.isArray(spm.real_life_use_cases) && spm.real_life_use_cases.length > 4) {
                        spm.real_life_use_cases = spm.real_life_use_cases.slice(0, 4);
                        warnings.push('A2_LIMIT_TRUNCATED: real_life_use_cases');
                    }
                    if (Array.isArray(spm.competitor_pain_points_eliminated) && spm.competitor_pain_points_eliminated.length > 4) {
                        spm.competitor_pain_points_eliminated = spm.competitor_pain_points_eliminated.slice(0, 4);
                        warnings.push('A2_LIMIT_TRUNCATED: competitor_pain_points_eliminated');
                    }
                    if (Array.isArray(spm.authentic_minor_flaws) && spm.authentic_minor_flaws.length > 2) {
                        spm.authentic_minor_flaws = spm.authentic_minor_flaws.slice(0, 2);
                        warnings.push('A2_LIMIT_TRUNCATED: authentic_minor_flaws');
                    }
                }
                if (Array.isArray(result.scraped_sources)) {
                    result.scraped_sources = result.scraped_sources.filter(src => {
                        try {
                            const u = new URL(src.startsWith('http') ? src : 'http://' + src);
                            if (!u.hostname.includes('.') || u.hostname.includes('..') || u.hostname.startsWith('.')) throw new Error('invalid');
                            return true;
                        } catch {
                            warnings.push('INVALID_SOURCE_DOMAIN: ' + src);
                            return false;
                        }
                    });
                    if (result.scraped_sources.length > 6) {
                        result.scraped_sources = result.scraped_sources.slice(0, 6);
                        warnings.push('A2_LIMIT_TRUNCATED: scraped_sources');
                    }
                }
                if (Array.isArray(result.safety_signals_detected) && result.safety_signals_detected.length > 3) {
                    result.safety_signals_detected = result.safety_signals_detected.slice(0, 3);
                    warnings.push('A2_LIMIT_TRUNCATED: safety_signals_detected');
                }

                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                this.state.token_usage_per_node['A2'] = usage;
                this.state.a2_result = result;
                
                if (result.safety_signals_detected && result.safety_signals_detected.length > 0) {
                    if (this.state.node_status['A2'] !== 'HITL_OVERRIDDEN') {
                        this.state.node_status['A2'] = 'HALTED_HITL_REQUIRED';
                        this.state.hitl_alert = 'SAFETY_SIGNAL_IN_REVIEWS';
                        this.state.next_action = 'HALT';
                        this.emitState();
                        return;
                    }
                }

                this.state.node_status['A2'] = 'OK';
                this.state.next_action = 'RUN_A4';
            } catch (e) {
                this.state.node_status['A2'] = 'ERROR';
                this.state.hitl_alert = e.message;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }
        
        // --- KROK 3: A4 ---
        if (this.state.next_action === 'RUN_A4') {
            if (!this.state.chemical_route) {
                this.state.node_status['A4'] = 'SKIPPED';
                this.state.next_action = 'RUN_A5';
            } else {
                try {
                    const rawInciArray = (this.state.extracted_data.inci.value || '').split(',').map(i => i.trim()).filter(i => i);
                    
                    const inciRefService = require('./inci.reference.service.js');
                    const warnings = [];
                    let ragText = '';
                    
                    for (let rawI of rawInciArray) {
                        const variants = generateInciVariants(rawI);
                        let functionFound = false;
                        for (let v of variants) {
                            const data = inciRefService.getInciFunctionData(v);
                            if (data && data.functions && data.functions.length > 0) {
                                ragText += `[INCI_DICT] ${data.inci_name || v}: ${data.functions.join(', ')}\n`;
                                functionFound = true;
                                break;
                            }
                        }
                        if (!functionFound) {
                            warnings.push('INGREDIENT_NO_FUNCTION: ' + rawI);
                        }
                    }
                    
                    const agent4Data = {
                        gtin_ean: this.gtin,
                        product_name: product?.text_fields?.name || undefined,
                        brand: extracted.brand?.value || undefined
                    };
                    
                    const prompt4Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_4_compiled.md'), 'utf8');
                    let prompt4 = prompt4Template.replace('{{SKU_DATA}}', JSON.stringify(agent4Data, null, 2));
                    prompt4 = prompt4.replace('--- BLOK RAG + DANE SKU (dynamiczne) ---', `--- BLOK RAG ---\n${ragText}\n\n--- DANE SKU ---\n`);

                    const a4Schema = {
                        type: "object",
                        properties: {
                            category_type: { type: "string" },
                            technical_benefits_aeo: { type: "array", items: { type: "string" } },
                            detected_synergies: { type: "array", items: { type: "string" } },
                            mandatory_clp_warnings: { type: "array", items: { type: "string" }, nullable: true }
                        },
                        required: ["category_type", "technical_benefits_aeo", "detected_synergies", "mandatory_clp_warnings"]
                    };

                    const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                        agentId: "4",
                        prompt: prompt4,
                        schema: a4Schema
                    });

                    const allowedKeysA4 = ['category_type', 'technical_benefits_aeo', 'detected_synergies', 'mandatory_clp_warnings'];
                    for (let k of Object.keys(result)) {
                        if (!allowedKeysA4.includes(k)) {
                            warnings.push('A4_FIELD_REJECTED: ' + k);
                            delete result[k];
                        }
                    }

                    if (result.technical_benefits_aeo && Array.isArray(result.technical_benefits_aeo)) {
                        let htmlStr = result.technical_benefits_aeo.join('');
                        if (htmlStr.length > 2500) {
                            warnings.push('A4_LIMIT_TRUNCATED: technical_benefits_aeo');
                        }
                    }
                    
                    if (result.detected_synergies && Array.isArray(result.detected_synergies) && result.detected_synergies.length > 4) {
                        result.detected_synergies = result.detected_synergies.slice(0, 4);
                        warnings.push('A4_LIMIT_TRUNCATED: detected_synergies');
                    }
                    
                    if (result.mandatory_clp_warnings !== null) {
                        warnings.push('A4_CLP_WITHOUT_SOURCE');
                        result.mandatory_clp_warnings = null;
                    }
                    
                    if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                    
                    this.state.token_usage_per_node['A4'] = usage;
                    this.state.a4_result = result;

                    // Walidatory A4
                    if (result.technical_benefits_aeo && Array.isArray(result.technical_benefits_aeo)) {
                        for (let idx = 0; idx < result.technical_benefits_aeo.length; idx++) {
                            let htmlStr = result.technical_benefits_aeo[idx];
                            htmlStr = normalizeTags(htmlStr);
                            result.technical_benefits_aeo[idx] = htmlStr;
                            
                            const v1 = validate_html_whitelist(htmlStr);
                            if (!v1.valid) {
                                if (this.state.node_status['A4'] !== 'HITL_OVERRIDDEN') {
                                    const msg = 'A4_OUTPUT_REJECTED: validate_html_whitelist (' + v1.errors.join(', ') + ')';
                                    this.state.hitl_alert = msg;
                                    this.state.normalization_warnings.push(msg);
                                    this.state.node_status['A4'] = 'HALTED_HITL_REQUIRED';
                                    this.state.next_action = 'HALT';
                                    this.emitState();
                                    return;
                                }
                            }
                            
                            const v2 = scan_medical_claims_lexical(htmlStr);
                            if (v2.length > 0) {
                                if (this.state.node_status['A4'] !== 'HITL_OVERRIDDEN') {
                                    const msg = 'A4_OUTPUT_REJECTED: scan_medical_claims_lexical (' + v2.map(h => h.word).join(', ') + ')';
                                    this.state.hitl_alert = msg;
                                    this.state.normalization_warnings.push(msg);
                                    this.state.node_status['A4'] = 'HALTED_HITL_REQUIRED';
                                    this.state.next_action = 'HALT';
                                    this.emitState();
                                    return;
                                }
                            }
                            
                            const v3 = scan_stopwords(htmlStr);
                            if (v3.length > 0) {
                                if (this.state.node_status['A4'] !== 'HITL_OVERRIDDEN') {
                                    const msg = 'A4_OUTPUT_REJECTED: scan_stopwords (' + v3.map(h => h.word).join(', ') + ')';
                                    this.state.hitl_alert = msg;
                                    this.state.normalization_warnings.push(msg);
                                    this.state.node_status['A4'] = 'HALTED_HITL_REQUIRED';
                                    this.state.next_action = 'HALT';
                                    this.emitState();
                                    return;
                                }
                            }
                        }
                    }

                    this.state.node_status['A4'] = 'OK';
                    this.state.next_action = 'RUN_A5';
                } catch (e) {
                    this.state.node_status['A4'] = 'ERROR';
                    this.state.hitl_alert = e.message;
                    this.state.next_action = 'HALT';
                    this.emitState();
                    return;
                }
            }
        }
        

        // --- KROK 5: A5 ---
        if (this.state.next_action === 'RUN_A5') {
            const agent5Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                a1: this.state.a1_result,
                a2: this.state.a2_result,
                a4: this.state.a4_result
            };
            const prompt5Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_5_compiled.md'), 'utf8');
            const prompt5 = prompt5Template.replace('{{SKU_DATA}}', JSON.stringify(agent5Data, null, 2));

            const a5Schema = {
                type: "object",
                properties: {
                    sanitization_status: { type: "string" },
                    mandatory_safety_warnings: { type: "array", items: { type: "string" } },
                    preserved_minor_flaws_for_pratfall: { type: "array", items: { type: "string" } }
                },
                required: ["sanitization_status", "mandatory_safety_warnings", "preserved_minor_flaws_for_pratfall"]
            };

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "5", prompt: prompt5, schema: a5Schema, temperature: 0
                });
                
                const warnings = [];
                const allowedKeysA5 = ['sanitization_status', 'mandatory_safety_warnings', 'preserved_minor_flaws_for_pratfall'];
                for (let k of Object.keys(result)) {
                    if (!allowedKeysA5.includes(k)) {
                        warnings.push('A5_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }
                
                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                this.state.token_usage_per_node['A5'] = usage;
                this.state.a5_result = result;

                if (result.sanitization_status === 'BLOCKED_CRITICAL_LEGAL_BREACH') {
                    if (this.state.node_status['A5'] !== 'HITL_OVERRIDDEN') {
                        this.state.node_status['A5'] = 'HALTED_HITL_REQUIRED';
                        this.state.hitl_alert = 'BLOCKED_CRITICAL_LEGAL_BREACH';
                        this.state.next_action = 'HALT';
                        this.emitState();
                        return;
                    }
                }

                this.state.node_status['A5'] = 'OK';
                this.state.next_action = 'RUN_A6';
            } catch (e) {
                this.state.node_status['A5'] = 'ERROR';
                this.state.hitl_alert = e.message;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }

        const runHtmlValidators = (htmlStr, nodeName) => {
            htmlStr = normalizeTags(htmlStr);
            const v1 = validate_html_whitelist(htmlStr);
            if (!v1.valid) return nodeName + '_OUTPUT_REJECTED: validate_html_whitelist (' + v1.errors.join(', ') + ')';
            const v2 = scan_medical_claims_lexical(htmlStr);
            if (v2.length > 0) return nodeName + '_OUTPUT_REJECTED: scan_medical_claims_lexical (' + v2.map(h => h.word).join(', ') + ')';
            const v3 = scan_stopwords(htmlStr);
            if (v3.length > 0) return nodeName + '_OUTPUT_REJECTED: scan_stopwords (' + v3.map(h => h.word).join(', ') + ')';
            return null;
        };

        // --- KROK 6: A6 ---
        if (this.state.next_action === 'RUN_A6') {
            const agent6Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                capacity: extracted.capacity?.value || undefined,
                line: extracted.line?.value || undefined,
                a1: this.state.a1_result,
                a2: this.state.a2_result,
                a4: this.state.a4_result,
                a5: this.state.a5_result
            };
            const prompt6Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_6_compiled.md'), 'utf8');
            const prompt6 = prompt6Template.replace('{{SKU_DATA}}', JSON.stringify(agent6Data, null, 2));

            const a6Schema = {
                type: "object",
                properties: {
                    section_1_html: { type: "string" },
                    section_2_html: { type: "string" },
                    section_3_html: { type: "string" },
                    section_4_html: { type: "string" },
                    section_5_html: { type: "string" },
                    section_6_html: { type: "string" }
                },
                required: ["section_1_html", "section_2_html", "section_3_html", "section_4_html", "section_5_html", "section_6_html"]
            };

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "6", prompt: prompt6, schema: a6Schema // temp domyślne dla copywritera
                });
                
                const warnings = [];
                const allowedKeysA6 = ['section_1_html', 'section_2_html', 'section_3_html', 'section_4_html', 'section_5_html', 'section_6_html'];
                for (let k of Object.keys(result)) {
                    if (!allowedKeysA6.includes(k)) {
                        warnings.push('A6_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }
                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                this.state.token_usage_per_node['A6'] = usage;
                this.state.a6_result = result;

                // Hash
                const hashS3 = crypto.createHash('sha256').update(result.section_3_html || '').digest('hex');
                const hashS5 = crypto.createHash('sha256').update(result.section_5_html || '').digest('hex');
                const hashS6 = crypto.createHash('sha256').update(result.section_6_html || '').digest('hex');
                this.state.frozen_hashes = { s3: hashS3, s5: hashS5, s6: hashS6 };

                // Validate
                for (let i=1; i<=6; i++) {
                    let sec = result['section_' + i + '_html'];
                    if (sec) {
                        sec = normalizeTags(sec);
                        result['section_' + i + '_html'] = sec;
                        const err = runHtmlValidators(sec, 'A6');
                        if (err) {
                            if (this.state.node_status['A6'] !== 'HITL_OVERRIDDEN') {
                                this.state.node_status['A6'] = 'HALTED_HITL_REQUIRED';
                                this.state.hitl_alert = err;
                                this.state.normalization_warnings.push(err);
                                this.state.next_action = 'HALT';
                                this.emitState();
                                return;
                            }
                        }
                    }
                }

                this.state.node_status['A6'] = 'OK';
                this.state.next_action = 'RUN_A7';
            } catch (e) {
                this.state.node_status['A6'] = 'ERROR';
                this.state.hitl_alert = e.message;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }

        // --- KROK 7: A7 ---
        if (this.state.next_action === 'RUN_A7') {
            const agent7Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                section_1_html: this.state.a6_result.section_1_html,
                section_2_html: this.state.a6_result.section_2_html,
                section_4_html: this.state.a6_result.section_4_html
            };
            const prompt7Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_7_compiled.md'), 'utf8');
            const prompt7 = prompt7Template.replace('{{SKU_DATA}}', JSON.stringify(agent7Data, null, 2));

            const a7Schema = {
                type: "object",
                properties: {
                    section_1_html: { type: "string" },
                    section_2_html: { type: "string" },
                    section_4_html: { type: "string" }
                },
                required: ["section_1_html", "section_2_html", "section_4_html"]
            };

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "7", prompt: prompt7, schema: a7Schema
                });
                
                const warnings = [];
                const allowedKeysA7 = ['section_1_html', 'section_2_html', 'section_4_html'];
                for (let k of Object.keys(result)) {
                    if (['section_3_html', 'section_5_html', 'section_6_html'].includes(k)) {
                        if (this.state.node_status['A7'] !== 'HITL_OVERRIDDEN') {
                            this.state.node_status['A7'] = 'HALTED_HITL_REQUIRED';
                            this.state.hitl_alert = 'FROZEN_SECTION_VIOLATION';
                            this.state.next_action = 'HALT';
                            this.emitState();
                            return;
                        }
                    }
                    if (!allowedKeysA7.includes(k)) {
                        warnings.push('A7_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }
                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];
                this.state.token_usage_per_node['A7'] = usage;
                
                // Złóż dokument
                const a7_res_full = {
                    section_1_html: result.section_1_html,
                    section_2_html: result.section_2_html,
                    section_3_html: this.state.a6_result.section_3_html, // frozen
                    section_4_html: result.section_4_html,
                    section_5_html: this.state.a6_result.section_5_html, // frozen
                    section_6_html: this.state.a6_result.section_6_html  // frozen
                };
                this.state.a7_result = a7_res_full;

                // Validate A7
                for (let i of [1,2,4]) {
                    let sec = a7_res_full['section_' + i + '_html'];
                    if (sec) {
                        sec = normalizeTags(sec);
                        a7_res_full['section_' + i + '_html'] = sec;
                        const err = runHtmlValidators(sec, 'A7');
                        if (err) {
                            if (this.state.node_status['A7'] !== 'HITL_OVERRIDDEN') {
                                this.state.node_status['A7'] = 'HALTED_HITL_REQUIRED';
                                this.state.hitl_alert = err;
                                this.state.normalization_warnings.push(err);
                                this.state.next_action = 'HALT';
                                this.emitState();
                                return;
                            }
                        }
                    }
                }

                this.state.node_status['A7'] = 'OK';
                this.state.next_action = 'RUN_A10';
            } catch (e) {
                this.state.node_status['A7'] = 'ERROR';
                this.state.hitl_alert = e.message;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }

        // --- KROK 10: A10 ---
        if (this.state.next_action === 'RUN_A10') {
            const agent10Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                section_1_html: this.state.a7_result.section_1_html,
                section_2_html: this.state.a7_result.section_2_html,
                section_4_html: this.state.a7_result.section_4_html,
                audit_report: "Automated checks passed."
            };
            
            traceInci(this.gtin, 'AGENT_10_INPUT', agent10Data);
            
            const prompt10Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_10_compiled.md'), 'utf8');
            const prompt10 = prompt10Template.replace('{{SKU_DATA}}', JSON.stringify(agent10Data, null, 2));

            const a10Schema = {
                type: "object",
                properties: {
                    patches: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                target_section: { type: "string" },
                                find_exact: { type: "string" },
                                replace_with: { type: "string" },
                                justification: { type: "string" }
                            },
                            required: ["target_section", "find_exact", "replace_with", "justification"]
                        }
                    }
                },
                required: ["patches"]
            };

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "10", prompt: prompt10, schema: a10Schema, temperature: 0
                });
                
                const warnings = [];
                const allowedKeysA10 = ['patches'];
                for (let k of Object.keys(result)) {
                    if (!allowedKeysA10.includes(k)) {
                        warnings.push('A10_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }
                this.state.token_usage_per_node['A10'] = usage;
                
                let finalDoc = { ...this.state.a7_result };
                console.log("[DEBUG A10] a7_result na poczatku:", this.state.a7_result);
                const patches = result.patches || [];
                
                for (let p of patches) {
                    if (['section_3_html', 'section_5_html', 'section_6_html'].includes(p.target_section)) {
                        warnings.push('A10_PATCH_ON_FROZEN_SECTION: ' + p.target_section);
                        continue; // Odrzucamy ten patch, bo idzie na zamrożone
                    }
                    if (finalDoc[p.target_section]) {
                        finalDoc[p.target_section] = finalDoc[p.target_section].replace(p.find_exact, p.replace_with);
                        console.log("[DEBUG A10] finalDoc po patchu na " + p.target_section + ":", finalDoc[p.target_section]);
                    }
                }
                console.log("[DEBUG A10] finalDoc przed walidacja:", finalDoc);
                
                this.state.a10_result = finalDoc;
                
                traceInci(this.gtin, 'AGENT_10_OUTPUT_PATCHES', patches);
                traceInci(this.gtin, 'AGENT_10_FINAL_HTML', this.state.a10_result);

                if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];

                for (let i of [1,2,4]) {
                    let sec = finalDoc['section_' + i + '_html'];
                    if (sec) {
                        sec = normalizeTags(sec);
                        finalDoc['section_' + i + '_html'] = sec;
                        const err = runHtmlValidators(sec, 'A10');
                        if (err) {
                            if (this.state.node_status['A10'] !== 'HITL_OVERRIDDEN') {
                                this.state.node_status['A10'] = 'HALTED_HITL_REQUIRED';
                                this.state.hitl_alert = err;
                                this.state.normalization_warnings.push(err);
                                this.state.next_action = 'HALT';
                                this.emitState();
                                return;
                            }
                        }
                    }
                }

                this.state.node_status['A10'] = 'OK';
                this.state.next_action = 'FINISH';
            } catch (e) {
                this.state.node_status['A10'] = 'ERROR';
                this.state.hitl_alert = e.message;
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
        }
        
        // --- FINISH: Składanie ---
        if (this.state.next_action === 'FINISH') {
            const s5 = this.state.a10_result['section_5_html'] || '';
            const s6 = this.state.a10_result['section_6_html'] || '';
            const extra4 = [s5, s6].filter(Boolean).join('\n<br>\n');
            
            const offer = {
                title: this.state.extracted_data.product_name?.value,
                description: this.state.a10_result['section_1_html'] || '',
                description_extra1: this.state.a10_result['section_2_html'] || '',
                description_extra2: this.state.a10_result['section_3_html'] || '',
                description_extra3: this.state.a10_result['section_4_html'] || '',
                description_extra4: extra4,
                extra_field_4245: this.state.a10_result['section_7_html'] || '',
                ingredients_inci: this.state.extracted_data.inci?.value,
                eu_responsible_person: this.state.extracted_data.eu_responsible_person,
                safety_warnings: this.state.a5_result?.mandatory_safety_warnings || [],
                source_map: {
                    title: { source: 'baselinker', matched_key: null },
                    description: { source: 'pipeline', matched_key: 'section_1' },
                    description_extra1: { source: 'pipeline', matched_key: 'section_2' },
                    description_extra2: { source: 'pipeline', matched_key: 'section_3' },
                    description_extra3: { source: 'pipeline', matched_key: 'section_4' },
                    description_extra4: { source: 'pipeline', matched_key: 'section_5_6' },
                    extra_field_4245: { source: 'pipeline', matched_key: 'section_7' },
                    ingredients_inci: { source: 'baselinker', matched_key: null },
                    eu_responsible_person: { source: this.state.extracted_data.eu_responsible_person.source, matched_key: null },
                    safety_warnings: { source: 'a5', matched_key: null }
                }
            };
            
            this.state.final_offer = offer;
            
            traceInci(this.gtin, 'FINAL_OFFER_OBJECT', offer);
            
            const outDir = path.join(__dirname, 'out');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(outDir, `offer_${this.gtin}.json`), JSON.stringify(offer, null, 2));
            
            try {
                this.writeBackToBaseLinker(offer);
            } catch (err) {
                console.error('[WRITE_BACK] Odmowa zapisu wymuszona przez operatora:', err.message);
            }
        }


        this.emitState();
    }
    
    resolveHitl({ node, decision, operator_note, resolved_at }) {
        if (!this.state.hitl_alert) throw new Error("No active HITL alert to resolve.");
        if (!operator_note || typeof operator_note !== 'string' || operator_note.trim().length === 0) {
            throw new Error("operator_note is missing or empty.");
        }
        
        if (!this.state.hitl_log) this.state.hitl_log = [];
        this.state.hitl_log.push({
            node,
            alert: this.state.hitl_alert,
            decision,
            note: operator_note.trim(),
            timestamp: resolved_at || new Date().toISOString()
        });

        if (decision === 'ACCEPT_AND_CONTINUE') {
            this.state.hitl_alert = null;
            this.state.node_status[node] = 'HITL_OVERRIDDEN';
            
            const nextNodeMap = {
                'EXTRACT': 'RUN_A1',
                'A1': 'RUN_A2',
                'A2': 'RUN_A4',
                'A4': 'RUN_A5',
                'A5': 'RUN_A6',
                'A6': 'RUN_A7',
                'A7': 'RUN_A10',
                'A10': 'FINISH'
            };
            this.state.next_action = nextNodeMap[node] || 'HALT';
        } else if (decision === 'REJECT_AND_HALT') {
            // HALT zostaje
        } else {
            throw new Error("Invalid decision: " + decision);
        }
        this.emitState();
    }

    async runPhase2() { throw new Error('NOT_IMPLEMENTED_E4b'); }
    async runPhase3() { throw new Error('NOT_IMPLEMENTED_E4b'); }
    async runPhase4() { throw new Error('NOT_IMPLEMENTED_E4b'); }

    writeBackToBaseLinker(offer) {
        if (!WRITE_BACK_ENABLED) {
            console.log('[WRITE_BACK] Zablokowane stałą WRITE_BACK_ENABLED = false.');
            return;
        }
        
        const payload = {
            inventory_id: 1, // Domyślnie
            product_id: "", 
            ean: this.gtin,
            text_fields: {
                name: offer.title,
                description: offer.description,
                description_extra1: offer.description_extra1,
                description_extra2: offer.description_extra2,
                description_extra3: offer.description_extra3,
                description_extra4: offer.description_extra4,
                extra_field_4245: offer.extra_field_4245
            },
            features: {
                INCI: offer.ingredients_inci
            }
        };
        
        // request to https://api.baselinker.com/connector.php with addInventoryProduct
        return payload;
    }

}

module.exports = {
    Orchestrator,
    PHASE_1_GROUNDING,
    PHASE_2_LEGAL,
    PHASE_3_CREATION,
    PHASE_4_AUDIT,
    normalizeTags
};
