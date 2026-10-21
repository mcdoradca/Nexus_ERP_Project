const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const aiWrapper = require('./ai.wrapper');
const { ean_checksum, route_chemical, validate_eu_responsible_person, gate_ingredients, hasBannedLilial } = require('./validators');
const { FORBIDDEN_SOURCES, DATA_SOURCE_MODE } = require('./config/nodes.config');
const baselinkerExtract = require('./baselinker.extract.js');
const { normalizeIngredientName } = require('./normalization.js');
const ragService = require('./knowledge.rag.service.js');
const { validate_html_whitelist, scan_medical_claims_lexical, scan_stopwords, normalize_aeo_faq_labels, aeo_faq_check, validate_section5_compliance, validate_section6_compliance, validate_section3_ingredients_closed_world } = require('./validators');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const visionExtractorService = require('./vision-extractor.service');
const brandResponsibleService = require('./brand.responsible.service');

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

const traceNode = (nodeId, gtin, step, data) => {
    try {
        const logDir = path.join(__dirname, 'logs', 'nodes_trace');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const filePath = path.join(logDir, `Node_${nodeId}_Execution_Trace_${gtin}.log`);
        const time = new Date().toISOString();
        const strData = typeof data === 'object' ? safeStringify(data) : data;
        const msg = `[${time}] [${step}]\n${strData}\n\n`;
        fs.appendFileSync(filePath, msg, 'utf8');
        
        // WYŚWIETLANIE NA FRONTENDZIE UŻYTKOWNIKA (Przez hook console.log -> WebSocket)
        console.log(`\n\n=== 🕵️ NODE TRACE [${step}] ===\n${strData}\n==================================\n`);
    } catch(e) {
        console.error("Blad traceNode", e.message);
    }
};

const normalizeTags = (htmlStr) => {
    if (!htmlStr) return htmlStr;
    return htmlStr.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')
                  .replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>');
};

const sanitizeSection5Html = (htmlStr, pimData = {}) => {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    let res = htmlStr;

    // 1. BEZWZGLĘDNY ZAKAZ ZNAKU CE DLA KOSMETYKÓW I CHEMII GOSPODARCZEJ (Rozp. 1223/2009 & 765/2008):
    // Znak CE dotyczy wyrobów medycznych MDR (2017/745), zabawek, elektroniki itp.
    // Kosmetyki i chemia gospodarcza NIE posiadają i nie mogą posiadać oznaczenia CE.
    const isMedicalDevice = pimData?.is_medical_device === true ||
                            pimData?.medical_device === true ||
                            /\b(?:wyr[oó]b\s+medyczny|medical\s+device)\b/i.test(JSON.stringify(pimData || {}));

    if (!isMedicalDevice) {
        // Usuń cały punkt <li>, jeśli jedynym certyfikatem jest CE (np. "Certyfikaty: CE", "Certyfikat: Oznakowanie CE", "Certyfikaty: <b>CE</b>")
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*Certyfikat(?:y)?:?\s*(?:<\/b>|<\/strong>)?\s*(?:<b>|<strong>)?\s*(?:Oznakowanie\s+)?CE\b\s*(?:<\/b>|<\/strong>)?\s*<\/li>/gi, '');

        // Jeśli w liście certyfikatów CE występuje obok innych certyfikatów (np. "ECOCERT, CE" lub "CE, Vegan"), wytnij wyłącznie samo "CE"
        res = res.replace(/(<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*Certyfikat(?:y)?:?\s*(?:<\/b>|<\/strong>)?[\s\S]*?)(?:,\s*CE\b|\bCE\s*,\s*)/gi, '$1');
    }

    // 2. RYGOR FIZYKOCHEMICZNY PARAMETRU pH (Definicja: pH = -log[H3O+] w roztworze wodnym):
    // Odczyn pH istnieje wyłącznie w obecności wolnej fazy wodnej.
    // Czyste pudry mineralne (talk w proszku), pudry sypkie/prasowane, cienie do powiek, artykuły stałe (szczoteczki, nici), czyste oleje bezwodne fizykochemicznie NIE POSIADAJĄ pH.
    const pimContext = (JSON.stringify(pimData || {}) + ' ' + htmlStr).toLowerCase();
    const isAnhydrousOrArticle = /\b(puder|pudru|talk|talku|proszek|proszku|shadow|cie[nń]|cienie|puder mineralny|szczoteczk|artyku[lł]|ni[cć] dentystyczn|olej\b|olejek\b)\b/i.test(pimContext);

    if (isAnhydrousOrArticle) {
        // Dla wyrobów bezwodnych / pudrów / artykułów usuwamy CAŁY punkt <li> z pH bez względu na treść
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*pH:?\s*(?:<\/b>|<\/strong>)?[\s\S]*?<\/li>/gi, '');
    } else {
        // Dla pozostałych wyrobów: usuwamy marketingowy bełkot niemający wartości liczbowej (np. "pH: Zbilansowane", "pH: Neutralne", "pH: Odpowiednie", "pH: Brak danych")
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*pH:?\s*(?:<\/b>|<\/strong>)?\s*(?:<b>|<strong>)?\s*(?:zbilansowane|neutralne|fizjologiczne|odpowiednie|w[lł]a[sś]ciwe|optymalne|przyjazne|brak\s+danych|null)\s*(?:<\/b>|<\/strong>)?\s*<\/li>/gi, '');
    }

    // 3. OCHRONA I UZUPEŁNIENIE PODMIOTU WYTWÓRCZEGO (GPSR / Specyfikacja Techniczna):
    // Jeśli w sekcji 5 brakuje parametru Producent, a podmiot wytwórczy jest znany z PIM/GPSR i różni się od pustego,
    // deterministycznie wstawiamy parametr Producent:.
    const manufacturerName = pimData?.manufacturer || pimData?.producer || pimData?.eu_responsible_person?.name;
    if (manufacturerName && typeof manufacturerName === 'string' && manufacturerName.trim().length > 1) {
        const cleanManuf = manufacturerName.trim();
        const hasProducerTag = /<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*Producent:?\s*(?:<\/b>|<\/strong>)?/i.test(res);
        if (!hasProducerTag) {
            const brandPattern = /(<li[^>]*>\s*(?:➡️|⚖️|📊|\*|-)?\s*(?:<b>|<strong>)?\s*Marka:?\s*(?:<\/b>|<\/strong>)?[sS]*?<\/li>)/i;
            const producerLi = `<li>➡️ <b>Producent:</b> ${cleanManuf}</li>`;
            if (brandPattern.test(res)) {
                res = res.replace(brandPattern, `$1\n${producerLi}`);
            } else if (res.includes('</ul>')) {
                res = res.replace('</ul>', `${producerLi}</ul>`);
            }
        }
    }

    // 4. Eliminacja ewentualnych pustych list <ul></ul> powstałych po usunięciu elementów
    res = res.replace(/<ul[^>]*>\s*<\/ul>/gi, '');

    return res;
};

const sanitizeSection3Html = (htmlStr, allowedSourcesStr = '') => {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    let res = htmlStr;

    // Eliminacja halucynacji konserwantów kosmetycznych w detergentach (np. Phenoxyethanol)
    const allowedLower = String(allowedSourcesStr || '').toLowerCase();
    const knownHallucinablePreservatives = [
        { name: 'Phenoxyethanol', regex: /\b(?:phenoxyethanol|fenoksyetanol)\b/i }
    ];

    for (const item of knownHallucinablePreservatives) {
        if (item.regex.test(res) && !item.regex.test(allowedLower)) {
            console.warn(`[Orchestrator V2] Wykryto halucynację ${item.name} w Sekcji 3. Wycinanie nieautoryzowanego składnika.`);
            res = res.replace(new RegExp(`<li[^>]*>\\s*(?:⚙️|⚡)?\\s*<b>\\s*(?:Składnik:?\\s*)?${item.name}[^<]*<\\/b>[\\s\\S]*?<\\/li>`, 'gi'), '');
        }
    }

    return res;
};

const sanitizeSection6Html = (htmlStr) => {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    let res = htmlStr;

    // 1. Standaryzacja językowa i eliminacja archaizmów fleksyjnych (np. "DO OCZÓW" -> "DO OCZU")
    res = res.replace(/\bDO OCZÓW\b/gi, 'DO OCZU');

    // 2. Normalizacja tagu do jednolitego standardu ekosystemu Allegro (Ostrzeżenie CLP/GPSR)
    res = res.replace(/<b>\s*Ostrzeżenie\s+CLP:\s*<\/b>/gi, '<b>Ostrzeżenie CLP/GPSR:</b>');

    // 2.1. Standaryzacja hasła ostrzegawczego (myślnik zamiast dwukropka)
    res = res.replace(/Hasło\s+ostrzegawcze:\s*(UWAGA|NIEBEZPIECZEŃSTWO)/gi, 'Hasło ostrzegawcze – $1');

    // 3. Rozklejanie sklejonych procedur medycznych kodów P w punktach <li>
    // np. "<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> P305+P351+P338 + P337+P313: ...</li>"
    const gpsrSafetyService = require('./services/gpsr.safety.service');
    res = res.replace(/<li[^>]*>\s*(?:⚠️|➡️|🛡️|\*|-)?\s*(?:<b>\s*Ostrzeżenie\s*(?:\((?:CLP|GPSR)\)|CLP\/GPSR)?:?\s*<\/b>\s*)?(P\d{3}(?:\+P\d{3})*\s*(?:\+|\/|\band\b|\boraz\b)\s*P\d{3}[^<]*)<\/li>/gi, (match, pGroup) => {
        const splitPhrases = gpsrSafetyService.splitCombinedPPhrases(pGroup);
        if (splitPhrases.length > 1) {
            return splitPhrases.map(phrase => `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> ${phrase}</li>`).join('\n');
        }
        return match;
    });

    // 4. Likwidacja zbitych dwukropków po etykiecie ostrzeżenia i kodzie zwrotu:
    // np. "<b>Ostrzeżenie CLP/GPSR:</b> P102: ..." -> "<b>Ostrzeżenie CLP/GPSR:</b> P102 – ..."
    res = res.replace(/(<b>\s*(?:Ostrzeżenie\s*(?:\((?:CLP|GPSR)\)|CLP\/GPSR)?|Wytyczne\s+bezpieczeństwa\s*(?:\(GPSR\)|CLP\/GPSR)?|Środki\s+ostrożności\s*(?:\(GPSR\)|CLP\/GPSR)?):?\s*<\/b>\s*)([A-Z0-9+]+):/gi, '$1$2 –');

    // 5. Likwidacja podwójnych dwukropków "::" w całym stringu
    res = res.replace(/::+/g, ':');

    // 6. Standaryzacja zwrotu EUH208
    res = res.replace(/(EUH208):/gi, '$1 –');

    // 7. Eliminacja osieroconych nagłówków okolicznościowych, jeśli w opisie jest już pełna formuła
    if (/P301\+P312/.test(res)) {
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚠️)?\s*(?:<b>[^<]*<\/b>\s*)?P301\s*–\s*W\s+PRZYPADKU\s+POŁKNIĘCIA:\s*<\/li>/gi, '');
    }
    if (/P305\+P351\+P338/.test(res)) {
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚠️)?\s*(?:<b>[^<]*<\/b>\s*)?P305\s*–\s*W\s+PRZYPADKU\s+DOSTANIA\s+SIĘ\s+DO\s+OCZU:\s*<\/li>/gi, '');
    }
    if (/P337\+P313/.test(res)) {
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚠️)?\s*(?:<b>[^<]*<\/b>\s*)?P337\s*–\s*W\s+przypadku\s+utrzymywania\s+się\s+działania\s+drażniącego\s+na\s+oczy:\s*<\/li>/gi, '');
    }

    // 8. Eliminacja redundancji semantycznej (Deduplikacja ostrzeżeń o oczach):
    const hasP305 = /P305/i.test(res);
    if (hasP305) {
        res = res.replace(/<li[^>]*>\s*(?:➡️|⚠️|🛡️|\*|-)?\s*(?:<b>\s*(?:Ostrzeżenie\s*(?:\((?:CLP|GPSR)\)|CLP\/GPSR)?|Wytyczne\s+bezpieczeństwa\s*(?:\(GPSR\)|CLP\/GPSR)?|Środki\s+ostrożności\s*(?:\(GPSR\)|CLP\/GPSR)?):?\s*<\/b>\s*)?W przypadku dostania się produktu do oczu natychmiast przepłukać je obficie czystą, letnią wodą\.?\s*<\/li>/gi, '');
    }

    // 9. Eliminacja redundancji między <p> wstępnym a listą punktowaną dot. dzieci:
    const hasP102 = /P102|Chronić przed dziećmi/i.test(res);
    if (hasP102) {
        res = res.replace(/(<p[^>]*>[\s\S]*?)(?:Przechowywać poza zasięgiem dzieci\.?|Chronić przed dziećmi\.?)\s*([\s\S]*?<\/p>)/gi, (m, before, after) => {
            const combined = (before + ' ' + after).replace(/\s\s+/g, ' ').replace(/<p>\s+/, '<p>').replace(/\s+<\/p>/, '</p>');
            return combined;
        });
    }

    // 10. Twarda tarcza anty-kontaktowa Allegro (zakaz e-mail, telefonów, stron www w opisie oferty pod rygorem bana)
    res = brandResponsibleService.stripContactInfo(res);

    return res;
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
            },
            required: ["name", "address_eu"]
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
    if (pimData && pimData.text_fields) {
        return pimData;
    }
    if (DATA_SOURCE_MODE === 'api') {
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
        this.emitState();

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
        this.state.node_status['EXTRACT'] = 'RUNNING';
        this.emitState();

        const blData = await loadProductDataAsync(this.gtin, pimData);
        let product = null;
        if (blData && blData.products) {
            product = Object.values(blData.products)[0];
        } else {
            product = blData;
        }

        // =========================================================================
        // KROK 0: ANALIZA WIZUALNA PRZEDNIEJ ETYKIETY (GEMINI VISION AI -> PIM SSOT)
        // =========================================================================
        const candidateImages = [];
        if (pimData?.imageUrl) candidateImages.push(pimData.imageUrl);
        if (Array.isArray(pimData?.images)) {
            for (const img of pimData.images) {
                if (img && !candidateImages.includes(img)) candidateImages.push(img);
            }
        }
        const frontImageUrl = candidateImages.length > 0 ? candidateImages[0] : null;

        if (frontImageUrl && this.state.node_status['A0'] !== 'OK') {
            this.state.node_status['A0'] = 'RUNNING';
            this.emitState();

            try {
                console.log(`[Orchestrator V2] Uruchamianie Agenta 0 (Vision Extractor) dla zdjęć frontu (${candidateImages.length} kandydatów, główny: ${frontImageUrl})`);
                const visionResult = await visionExtractorService.extractFrontPackFeatures(
                    candidateImages,
                    this.gtin,
                    (msg) => console.log(msg)
                );

                if (!visionResult.skipped && visionResult.pimFeatures && Object.keys(visionResult.pimFeatures).length > 0) {
                    let currentFeatures = { ...(product?.text_fields?.features || {}) };
                    let hasNew = false;
                    for (const [k, v] of Object.entries(visionResult.pimFeatures)) {
                        // ZASADA NIENARUSZALNOŚCI: Nie nadpisujemy wartości zdefiniowanych ręcznie przez operatora w PIM
                        if (v && (!currentFeatures[k] || String(currentFeatures[k]).trim() === '')) {
                            currentFeatures[k] = v;
                            hasNew = true;
                        }
                    }

                    if (hasNew) {
                        try {
                            await prisma.product.update({
                                where: { ean: this.gtin },
                                data: { features: currentFeatures }
                            });
                            console.log(`[Orchestrator V2] Zapisano ${Object.keys(visionResult.pimFeatures).length} cech z etykiety frontowej do bazy PIM (Prisma).`);
                        } catch (dbErr) {
                            console.warn(`[Orchestrator V2] Ostrzeżenie zapisu cech do bazy PIM: ${dbErr.message}`);
                        }

                        if (!product) product = { text_fields: {} };
                        if (!product.text_fields) product.text_fields = {};
                        product.text_fields.features = currentFeatures;

                        if (pimData) {
                            pimData.features = { ...(pimData.features || {}), ...currentFeatures };
                            if (pimData.text_fields) pimData.text_fields.features = currentFeatures;
                        }
                    }

                    this.state.vision_extracted_features = visionResult.pimFeatures;
                    this.state.node_status['A0'] = 'OK';
                    if (visionResult.usage) {
                        this.state.token_usage_per_node['A0'] = visionResult.usage;
                    }
                } else {
                    const skipReason = visionResult.error || visionResult.reason || 'Brak czytelnych cech na etykiecie';
                    console.warn(`[Orchestrator V2] Agent 0 nie odczytał cech (${skipReason}). Fallback do danych tekstowych PIM.`);
                    this.state.node_status['A0'] = 'FAILED_FALLBACK_TO_PIM';
                    this.state.node_warnings = this.state.node_warnings || {};
                    this.state.node_warnings['A0'] = `Brak odczytu z etykiety (${skipReason}). Zastosowano dane tekstowe PIM.`;
                }
            } catch (vErr) {
                console.warn(`[Orchestrator V2] Błąd analizy wizualnej: ${vErr.message}. Fallback do danych tekstowych PIM.`);
                this.state.node_status['A0'] = 'FAILED_FALLBACK_TO_PIM';
                this.state.node_warnings = this.state.node_warnings || {};
                this.state.node_warnings['A0'] = `Błąd analizy wizualnej: ${vErr.message}`;
            }

            const resolveResponsiblePerson = (extractedBrand, productName, descResult) => {
                if (descResult && descResult.name && descResult.address_eu && descResult.contact) {
                    return { source: 'description', data: descResult };
                }
                const matched = brandResponsibleService.findResponsibleEntity(extractedBrand, productName);
                if (matched) {
                    return { source: 'brand_registry', data: matched };
                }
                return {
                    source: descResult?.raw_fragment ? 'description' : null,
                    data: descResult || { name: null, address_eu: null, contact: null }
                };
            };

            const interimExtracted = baselinkerExtract.extractFromFeatures(product);
            const interimDesc = baselinkerExtract.extractResponsiblePersonFromDescription(product?.text_fields?.description);
            const interimBrandName = interimExtracted.brand?.value || product?.brand?.name || '';
            const productName = product?.text_fields?.name || '';
            const interimEu = resolveResponsiblePerson(interimBrandName, productName, interimDesc);

            // --- BACK-OF-PACK VISION INCI OCR ---
            // Jeśli w PIM brakuje poprawnego składu INCI, a dysponujemy zdjęciami produktu,
            // Gemini 3.8 Flash Vision skanuje etykietę w poszukiwaniu składu w 3 sekundy.
            if ((!interimExtracted.inci?.value || !baselinkerExtract.isValidInciValue(interimExtracted.inci.value)) && candidateImages.length > 0) {
                try {
                    console.log(`[Orchestrator V2] Brak składu INCI w PIM. Uruchamianie Agenta 0 (Vision Back-of-Pack OCR) na ${candidateImages.length} zdjęciach...`);
                    const visionInciRes = await visionExtractorService.extractInciFromBackPack(
                        candidateImages,
                        this.gtin,
                        (msg) => console.log(msg)
                    );

                    if (visionInciRes && visionInciRes.found && visionInciRes.inci) {
                        const vInci = visionInciRes.inci;
                        console.log(`[Orchestrator V2] Vision Extractor pomyślnie odczytał skład ze zdjęcia: ${vInci.substring(0, 80)}...`);
                        
                        if (!product) product = { text_fields: {} };
                        if (!product.text_fields) product.text_fields = {};
                        const updatedFeatures = { ...(product.text_fields.features || {}) };
                        updatedFeatures['INCI'] = vInci;
                        updatedFeatures['Skład'] = vInci;
                        product.text_fields.features = updatedFeatures;

                        if (pimData) {
                            pimData.features = { ...(pimData.features || {}), ...updatedFeatures };
                            if (pimData.text_fields) pimData.text_fields.features = updatedFeatures;
                        }

                        try {
                            await prisma.product.update({
                                where: { ean: this.gtin },
                                data: { features: updatedFeatures }
                            });
                            console.log(`[Orchestrator V2] Zapisano odczytany ze zdjęcia skład INCI do bazy PIM (Prisma).`);
                        } catch (dbErr) {
                            console.warn(`[Orchestrator V2] Ostrzeżenie zapisu INCI do bazy PIM: ${dbErr.message}`);
                        }

                        interimExtracted.inci = { value: vInci, source: 'vision_packshot', matched_key: 'INCI' };
                    }
                } catch (vInciErr) {
                    console.warn(`[Orchestrator V2] Błąd skanowania Vision Back-of-Pack INCI: ${vInciErr.message}`);
                }
            }

            this.state.extracted_data = {
                inci: interimExtracted.inci,
                mpn: interimExtracted.mpn,
                brand: interimExtracted.brand,
                capacity: interimExtracted.capacity,
                usage: interimExtracted.usage,
                warnings: interimExtracted.warnings,
                line: interimExtracted.line,
                truncated: interimExtracted.truncated,
                recovered_keys: interimExtracted.recovered_keys,
                eu_responsible_person: interimEu,
                product_name: {
                    value: product?.text_fields?.name || null,
                    source: product?.text_fields?.name ? 'baselinker' : null,
                    matched_key: null
                },
                features: product?.text_fields?.features || {},
                vision_features: this.state.vision_extracted_features || {}
            };
            this.emitState();
        }

        const resolveResponsiblePerson = (extractedBrand, productName, descResult) => {
            if (descResult && descResult.name && descResult.address_eu && descResult.contact) {
                return { source: 'description', data: descResult };
            }
            const matched = brandResponsibleService.findResponsibleEntity(extractedBrand, productName);
            if (matched) {
                return { source: 'brand_registry', data: matched };
            }
            return {
                source: descResult?.raw_fragment ? 'description' : null,
                data: descResult || { name: null, address_eu: null, contact: null }
            };
        };

        const extracted = baselinkerExtract.extractFromFeatures(product);
        const descResult = baselinkerExtract.extractResponsiblePersonFromDescription(product?.text_fields?.description);
        const brandName = extracted.brand?.value || product?.brand?.name || '';
        const productName = product?.text_fields?.name || '';
        const finalEu = resolveResponsiblePerson(brandName, productName, descResult);
        
        this.state.extracted_data = {
            inci: extracted.inci,
            mpn: extracted.mpn,
            brand: extracted.brand,
            capacity: extracted.capacity,
            usage: extracted.usage,
            warnings: extracted.warnings,
            line: extracted.line,
            clp_signal_word: extracted.clp_signal_word,
            clp_h_phrases: extracted.clp_h_phrases,
            clp_p_phrases: extracted.clp_p_phrases,
            clp_euh_phrases: extracted.clp_euh_phrases,
            detergent_composition: extracted.detergent_composition,
            truncated: extracted.truncated,
            recovered_keys: extracted.recovered_keys,
            eu_responsible_person: finalEu,
            product_name: {
                value: product?.text_fields?.name || null,
                source: product?.text_fields?.name ? 'baselinker' : null,
                matched_key: null
            },
            features: product?.text_fields?.features || {},
            vision_features: this.state.vision_extracted_features || {}
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
                if (/(chemia|chemical|biob[oó]jcz|biocid|prani|laundry|detergent|czyszcz|czysto[sś][cć]|myci|odkamien|zmywark|dishwash|p[lł]yn do |kapsu[lł]k)/i.test(valStr)) {
                    reasons.push('CATEGORY_CHEMICAL');
                    break;
                }
            }
        }
        if (product?.text_fields?.name && /(p[lł]yn do prania|kapsu[lł]ki do prania|odplamiacz|proszek do prania|p[lł]yn do p[lł]ukania|detergent|odkamieniacz|udro[żz]niacz|p[lł]yn do wc)/i.test(product.text_fields.name)) {
            if (!reasons.includes('CATEGORY_CHEMICAL')) reasons.push('CATEGORY_CHEMICAL');
        }
        if (extracted.clp_signal_word?.value || product?.clp_signal_word) {
            if (!reasons.includes('CATEGORY_CHEMICAL')) reasons.push('CATEGORY_CHEMICAL');
        }
        reasons.push('SDS_STATUS_UNKNOWN');
        
        this.state.chemical_route_reasons = reasons;
        this.state.chemical_route = reasons.length > 0;
        // --- KONIEC TRASY ---

        // Skonsolidowany obiekt cech produktu (PIM + product + vision features)
        let featuresObj = {};
        if (pimData && pimData.features && typeof pimData.features === 'object') Object.assign(featuresObj, pimData.features);
        if (pimData && pimData['features|pl'] && typeof pimData['features|pl'] === 'object') Object.assign(featuresObj, pimData['features|pl']);
        if (typeof pimData?.text_fields?.features === 'object' && pimData?.text_fields?.features !== null) {
            Object.assign(featuresObj, pimData.text_fields.features);
        } else if (typeof pimData?.text_fields?.features === 'string') {
            try {
                Object.assign(featuresObj, JSON.parse(pimData.text_fields.features));
            } catch(e) {}
        }
        if (product?.text_fields?.features && typeof product.text_fields.features === 'object') {
            Object.assign(featuresObj, product.text_fields.features);
        }
        if (this.state.vision_extracted_features && typeof this.state.vision_extracted_features === 'object') {
            Object.assign(featuresObj, this.state.vision_extracted_features);
        }

        const missingFields = [];
        if (!this.state.extracted_data.brand.source && !product?.brand?.name && !featuresObj['Marka']) missingFields.push('brand');
        if (!this.state.extracted_data.product_name.source && !product?.text_fields?.name) missingFields.push('product_name');
        if (!this.state.extracted_data.line.source && !featuresObj['Linia']) missingFields.push('line');
        const hasOrigin = featuresObj['Kraj pochodzenia'] || featuresObj['Kraj produkcji'] || featuresObj['country_of_origin'] || featuresObj['Kraj'] || this.state.extracted_data['Kraj pochodzenia']?.value;
        if (!hasOrigin) missingFields.push('country_of_origin');
        if (!extracted?.inci?.value) missingFields.push('inci');
        if (!this.state.extracted_data.eu_responsible_person.source) missingFields.push('eu_responsible_person');

        const hasInci = Boolean(extracted?.inci?.value && baselinkerExtract.isValidInciValue(extracted.inci.value));
        const hasResponsible = Boolean(this.state.extracted_data.eu_responsible_person?.source && (this.state.extracted_data.eu_responsible_person?.data?.name || typeof this.state.extracted_data.eu_responsible_person?.data === 'string'));
        const hasBrand = Boolean(this.state.extracted_data.brand?.source || product?.brand?.name || featuresObj['Marka']);
        const hasName = Boolean(this.state.extracted_data.product_name?.source || product?.text_fields?.name);

        const criticalMissing = [];
        if (!hasInci) criticalMissing.push('inci');
        if (!hasResponsible) criticalMissing.push('eu_responsible_person');
        if (!hasBrand) criticalMissing.push('brand');
        if (!hasName) criticalMissing.push('product_name');

        // Dynamiczne wykrywanie brakujących parametrów Allegro
        if (pimData && pimData.allegro_schema) {
            const configExtract = require('./baselinker.extract.config.json');

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

                // Specjalne mapowanie synonimów fizycznych packshotu z Agenta 0 (Pojemność, Postać, Zapach, Dozownik)
                if (!found) {
                    if ((normNameKey.includes('pojemnosc') || normNameKey.includes('waga') || normNameKey === 'pojemnosc ml') && 
                        (featuresObj['Pojemność'] || featuresObj['Pojemność / Waga'] || featuresObj['Waga'] || extracted?.capacity?.value)) {
                        found = true;
                    } else if ((normNameKey.includes('postac') || normNameKey.includes('forma')) && featuresObj['Postać']) {
                        found = true;
                    } else if ((normNameKey.includes('zapach') || normNameKey.includes('aromat') || normNameKey.includes('wariant zapachowy')) && featuresObj['Zapach']) {
                        found = true;
                    } else if ((normNameKey.includes('dozownik') || normNameKey.includes('opakowanie')) && featuresObj['Dozownik']) {
                        found = true;
                    }
                }

                if (!found && param.required) {
                    missingFields.push(nameKey);
                }
            }
        }

        if (criticalMissing.length > 0 && this.state.node_status['EXTRACT'] !== 'HITL_OVERRIDDEN') {
            const osintScraper = require('../offer-optimizer/osint.scraper.service');
            const productNameForOsint = product?.text_fields?.name || "Nieznany Produkt";
            console.log(`[Orchestrator] Brakujące parametry krytyczne: ${criticalMissing.join(', ')}. Uruchamiam OSINT Scraper...`);
            const osintText = await osintScraper.searchAndExtract(this.gtin, productNameForOsint, criticalMissing);
            
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
        this.emitState();

        // missingFields is now calculated earlier

        if (this.state.next_action === 'RUN_EXTRACT') {
            if (criticalMissing.length === 0 && !this.state.osint_data) {
                this.state.next_action = 'RUN_A2';
                this.state.node_status['A1'] = 'SKIPPED';
                this.state.token_usage_per_node['A1'] = { 
                    tokens_saved: true, 
                    reason: 'Dane krytyczne (INCI, GPSR / Podmiot Odpowiedzialny, Marka, Nazwa) obecne w PIM/rejestrze. Pominięto OSINT i Agenta 1.' 
                };
            } else {
                this.state.next_action = 'RUN_A1';
            }
            this.emitState();
        }
        
        while (this.state.next_action === 'RUN_A1') {
            const hasPimInci = Boolean(extracted?.inci?.value && baselinkerExtract.isValidInciValue(extracted.inci.value));
            const hasResponsible = Boolean(this.state.extracted_data.eu_responsible_person?.source && (this.state.extracted_data.eu_responsible_person?.data?.name || typeof this.state.extracted_data.eu_responsible_person?.data === 'string'));
            const agentData = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                manufacturer: extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name || undefined,
                scent: extracted.scent?.value || product?.text_fields?.features?.['Zapach'] || product?.text_fields?.features?.['Nuta zapachowa'] || this.state.vision_extracted_features?.['Zapach'] || undefined,
                capacity: extracted.capacity?.value || this.state.vision_extracted_features?.['Pojemność'] || this.state.vision_extracted_features?.['Pojemność / Waga'] || undefined,
                existing_pim_inci: hasPimInci ? extracted.inci.value : undefined,
                existing_eu_responsible_person: hasResponsible ? this.state.extracted_data.eu_responsible_person.data : undefined,
                features: product?.text_fields?.features || {},
                vision_features: this.state.vision_extracted_features || undefined,
                missingFields: missingFields,
                criticalMissing: criticalMissing,
                revision_loop_count: this.state.revision_loop_count
            };
            
            traceNode('1', this.gtin, 'A1_START', { missingFields, criticalMissing, osint_data: !!this.state.osint_data, loop: this.state.revision_loop_count, hasPimInci, hasResponsible });
            this.state.node_status['A1'] = this.state.revision_loop_count > 0 ? 'RETRYING' : 'RUNNING';
            this.emitState();
            
            if (this.state.osint_data) {
                agentData.osint_data = this.state.osint_data;
            }
            if (this.state.revision_loop_count > 0) {
                if (hasPimInci) {
                    agentData.revision_warning = `Poprzednie próby odnalezienia brakujących danych (GPSR / Podmiot Odpowiedzialny / logistyka) były niepełne (Próba ${this.state.revision_loop_count+1}/3). Zbadaj MINIMUM 5 KOLEJNYCH UNIKALNYCH STRON, skupiając się na podmiocie odpowiedzialnym w UE i parametrach brakujących. ZAKAZ szukania składu INCI.`;
                } else {
                    agentData.revision_warning = `Poprzednie znaleziska INCI się różniły lub były niepełne (Próba ${this.state.revision_loop_count+1}/3). Zbadaj MINIMUM 5 KOLEJNYCH UNIKALNYCH STRON. Użyj międzynarodowych synonimów w Google: 'ingredienti', 'inhaltsstoffe', 'ingredients', 'composizione' i sprawdź bezpośrednio oficjalny serwis marki lub zagraniczne drogerie, by znaleźć wariant pozwalający ustalić bezbłędny konsensus powtarzalności.`;
                }
            }
            
            let promptTemplate = fs.readFileSync(path.join(__dirname, 'docs', 'Agent_1_prompt_v4.md'), 'utf8');
            
            if (hasPimInci) {
                promptTemplate = promptTemplate.replace(
                    /(\s*\*\s*Skład INCI \(absolutny priorytet\)\.)/,
                    '\n     * Skład INCI: POMIŃ (Skład INCI został już w 100% podany w PIM - KATEGORYCZNY ZAKAZ wyszukiwania składu).'
                );
                promptTemplate = promptTemplate.replace(
                    /- WIELOJĘZYCZNA MATRYCA KWEREND[\s\S]*?(?=- CELE WYSZUKIWANIA:)/,
                    '- WIELOJĘZYCZNA MATRYCA KWEREND (MULTILINGUAL OPERATORS): Skład INCI jest już znany z PIM. KATEGORYCZNY ZAKAZ generowania kwerend o składniki w Google Search (np. ingredienti, inhaltsstoffe, ingredients)! Skup się wyłącznie na pozostałych brakach: Podmiot Odpowiedzialny w UE (GPSR), logistyka, CLP oraz missingFields.\n   '
                );
                promptTemplate = promptTemplate.replace(
                    /1\. INCI \(Skład\):[\s\S]*?(?=2\. LOGISTYKA:)/,
                    '1. INCI (Skład): ZIGNORUJ. Skład produktu został już podany i zatwierdzony w PIM (Karta Techniczna i Skład). KATEGORYCZNY ZAKAZ wyszukiwania składu w sieci, skanowania etykiet pod kątem INCI i marnowania tokenów wyszukiwarki. Zwróć pustą tablicę [] w `extracted_inci_candidates`.\n'
                );
            }

            if (hasResponsible) {
                const respData = this.state.extracted_data.eu_responsible_person.data;
                const respName = (respData && respData.name) || (typeof respData === 'string' ? respData : 'Zarejestrowany w bazie');
                promptTemplate = promptTemplate.replace(
                    /(\s*\*\s*Podmiot Odpowiedzialny w UE \(wymóg GPSR - nazwa, pełny adres, mail\/WWW\)\.)/,
                    '\n     * Podmiot Odpowiedzialny w UE: POMIŃ (Podmiot odpowiedzialny został już w 100% zidentyfikowany i zarejestrowany w bazie - KATEGORYCZNY ZAKAZ wyszukiwania w sieci).'
                );
                promptTemplate = promptTemplate.replace(
                    /3\. GPSR & PODMIOT ODPOWIEDZIALNY W UE[\s\S]*?(?=4\. CLP \(Klasyfikacja)/,
                    `3. GPSR & PODMIOT ODPOWIEDZIALNY W UE (eu_responsible_person): ZNANY I ZMAPOWANY Z REJESTRU BAZY (${respName}).\n   - Podmiot odpowiedzialny w UE został już w 100% zidentyfikowany i zweryfikowany w rejestrze bazy: ${JSON.stringify(respData)}.\n   - KATEGORYCZNY ZAKAZ wykonywania jakichkolwiek zapytań w Google Search o podmiot odpowiedzialny, producenta, ich adresy lub telefony! Nie marnuj na to żadnych zapytań ani tokenów.\n   - W polu \`eu_responsible_person\` przepisz dokładnie ten obiekt przekazany w danych lub null, skupiając się wyłącznie na pozostałych brakach.\n`
                );
                promptTemplate += `\n\n### 🛡️ PODMIOT ODPOWIEDZIALNY W UE (GPSR) ZAPISANY W BAZIE:\nPodmiot odpowiedzialny: ${respName} (${JSON.stringify(respData)}). KATEGORYCZNY ZAKAZ generowania kwerend w Google Search dotyczących podmiotu odpowiedzialnego, producenta lub ich adresów.\n`;
            }

            if (this.state.vision_extracted_features && Object.keys(this.state.vision_extracted_features).length > 0) {
                const keysList = Object.entries(this.state.vision_extracted_features).map(([k, v]) => `${k}: "${v}"`).join(', ');
                promptTemplate += `\n\n### 🛡️ ZWERYFIKOWANE CECHY FIZYCZNE PACKSHOTU (AGENT 0 - VISION AI):\nNastępujące cechy fizyczne zostały odczytane w 100% ze zdjęcia frontowego packshotu: ${keysList}.\nKATEGORYCZNY ZAKAZ ich wyszukiwania w Google ani nadpisywania halucynacjami z sieci. Skup się wyłącznie na pozostałych brakach (GPSR, Podmiot Odpowiedzialny w UE, logistyka, wymiary).\n`;
            }

            const prompt = promptTemplate.replace('{{SKU_DATA}}', JSON.stringify(agentData, null, 2));
            
            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "1",
                    prompt,
                    schema: a1Schema
                });
                
                traceNode('1', this.gtin, 'A1_RAW_RESULT', result);
                
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
                traceNode('1', this.gtin, 'A1_WARNINGS_AND_NORMALIZATION', warnings);
                this.state.token_usage_per_node['A1'] = usage;
                this.state.a1_result = result;

                if (result.country_of_origin && result.country_of_origin.value) {
                    this.state.extracted_data.country_of_origin = {
                        value: result.country_of_origin.value,
                        source: 'osint_a1'
                    };
                    this.state.extracted_data['Kraj pochodzenia'] = {
                        value: result.country_of_origin.value,
                        source: 'osint_a1'
                    };
                }

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
                    const activeBrand = extracted.brand?.value || product?.brand?.name || '';
                    if (activeBrand) {
                        brandResponsibleService.registerDiscoveredEntity(activeBrand, result.eu_responsible_person.value);
                    }
                }
                
                if (result.logistics && result.logistics.value && typeof result.logistics.value === 'object') {
                    this.state.extracted_data.logistics = {
                        data: result.logistics.value,
                        source: 'osint_a1'
                    };
                    if (result.logistics.value.net_capacity_or_weight) {
                        this.state.extracted_data['Pojemność'] = {
                            value: result.logistics.value.net_capacity_or_weight,
                            source: 'osint_a1'
                        };
                        this.state.extracted_data['capacity'] = {
                            value: result.logistics.value.net_capacity_or_weight,
                            source: 'osint_a1'
                        };
                    }
                }
                
                if (result.compliance && result.compliance.value && typeof result.compliance.value === 'object') {
                    this.state.extracted_data.compliance = {
                        data: result.compliance.value,
                        source: 'osint_a1'
                    };
                }
                
                // --- WERYFIKACJA INCI ZE SKRYPTU (Zlecona przez A1 OSINT) ---
                traceInci(this.gtin, 'A1_RAW_OUTPUT_CANDIDATES', result.extracted_inci_candidates);

                if (hasPimInci) {
                    console.log(`[Orchestrator] Skład INCI podany w PIM (${extracted.inci.value.substring(0, 50)}...). Pomijam ewaluację kandydatów OSINT i chronię stan PIM przed nadpisaniem.`);
                    this.state.extracted_data.inci = extracted.inci;
                    traceInci(this.gtin, 'INCI_PRESERVED_FROM_PIM', this.state.extracted_data.inci);
                } else {
                    const candidatesRaw = (result.extracted_inci_candidates && result.extracted_inci_candidates.value && Array.isArray(result.extracted_inci_candidates.value)) ? result.extracted_inci_candidates.value : [];
                    let candidates = candidatesRaw.map(c => Array.isArray(c) ? c.map(i => i.replace(/^\d+\.\s*/, '')).join(', ') : (typeof c === 'string' ? c.replace(/^\d+\.\s*/, '') : c));
                    
                    // --- FILTRACJA STARYCH / WYCOFANYCH FORMUŁ (Lilial / Butylphenyl Methylpropional - zakaz UE od 01.03.2022) ---
                    if (candidates.length > 0) {
                        const legalCandidates = candidates.filter(c => !hasBannedLilial(c));
                        if (legalCandidates.length > 0 && legalCandidates.length < candidates.length) {
                            const discarded = candidates.filter(c => hasBannedLilial(c));
                            console.log(`[Orchestrator V2] Odrzucono ${discarded.length} starych/wycofanych wariantów INCI zawierających zakazany BUTYLPHENYL METHYLPROPIONAL (Lilial, zakaz UE od 2022). Pozostało ${legalCandidates.length} wariantów nowej formuły.`);
                            traceInci(this.gtin, 'A1_DISCARDED_LILIAL_CANDIDATES', discarded);
                            candidates = legalCandidates;
                        } else if (legalCandidates.length === 0 && candidates.some(c => hasBannedLilial(c))) {
                            console.warn(`[Orchestrator V2] Wszyscy kandydaci INCI (${candidates.length}) zawierają zakazany BUTYLPHENYL METHYLPROPIONAL (Lilial). Wymagana reformulacja lub weryfikacja HITL.`);
                            traceInci(this.gtin, 'A1_ALL_CANDIDATES_HAVE_LILIAL', candidates);
                        }
                    }

                    if (candidates.length > 0) {
                        this.state.last_inci_candidates = candidates;
                    } else if (this.state.last_inci_candidates && this.state.last_inci_candidates.length > 0) {
                        candidates.push(...this.state.last_inci_candidates);
                        this.state.revision_loop_count = 2; // Wymuś koniec prób i przejście do HITL
                    }

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
                                    
                                    // Uelastyczniony próg konsensusu: 0.65 (65% powtarzalności)
                                    // Pokrywa synonimy (np. optical brightener vs fluorescent brightener) oraz drobne reformulacje
                                    if (sim >= 0.65) { 
                                        selectedInci = candidates[i].length > candidates[j].length ? candidates[i] : candidates[j];
                                        foundMatch = true;
                                        console.log(`[Orchestrator V2] Znaleziono spójną parę INCI (podobieństwo: ${(sim * 100).toFixed(1)}%). Akceptacja dłuższego wariantu.`);
                                        break;
                                    }
                                }
                                if (foundMatch) break;
                            }

                            // Fallback gdy żaden match nie przekroczył 0.65, ale kandydaci są poprawnymi składami
                            if (!foundMatch) {
                                const validCandidates = candidates.filter(c => 
                                    baselinkerExtract.isValidInciValue(c) && 
                                    !hasBannedLilial(c) && 
                                    ((c.match(/,/g) || []).length + 1) >= 4
                                );

                                if (validCandidates.length >= 2) {
                                    for (let i = 0; i < validCandidates.length; i++) {
                                        const wordsI = getWords(validCandidates[i]);
                                        for (let j = i + 1; j < validCandidates.length; j++) {
                                            const wordsJ = getWords(validCandidates[j]);
                                            let intersection = new Set([...wordsI].filter(x => wordsJ.has(x)));
                                            let union = new Set([...wordsI, ...wordsJ]);
                                            let sim = intersection.size / (union.size || 1);
                                            
                                            if (sim >= 0.45) {
                                                selectedInci = validCandidates[i].length > validCandidates[j].length ? validCandidates[i] : validCandidates[j];
                                                foundMatch = true;
                                                console.log(`[Orchestrator V2] Wykryto warianty składu z tego samego produktu (podobieństwo: ${(sim * 100).toFixed(1)}%). Akceptacja bezpiecznego, pełniejszego wariantu bez blokowania potoku.`);
                                                break;
                                            }
                                        }
                                        if (foundMatch) break;
                                    }
                                }
                            }
                        } else if (candidates.length === 1) {
                            // Pojedynczy, ale kompletny skład z zaufanego źródła
                            const singleCandidate = candidates[0];
                            const singleItemCount = (singleCandidate.match(/,/g) || []).length + 1;
                            const isStructurallyValid = baselinkerExtract.isValidInciValue(singleCandidate);
                            const hasNoLilial = !hasBannedLilial(singleCandidate);
                            
                            // Jeśli skład ma co najmniej 4 składniki, jest poprawną strukturą INCI i nie zawiera Lilialu
                            if (isStructurallyValid && singleItemCount >= 4 && hasNoLilial) {
                                selectedInci = singleCandidate;
                                foundMatch = true;
                                console.log(`[Orchestrator V2] Znaleziono 1 kompletny, poprawny skład INCI (${singleItemCount} składników) spełniający normy. Akceptacja bez wymuszania retry.`);
                            }
                        }
                        
                        if (!foundMatch && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                            if (this.state.revision_loop_count < 2) {
                                this.state.revision_loop_count++;
                                this.state.next_action = 'RUN_A1';
                                this.state.node_status['A1'] = 'RETRYING';
                                traceNode('1', this.gtin, 'A1_INCI_CONFLICT_RETRY', { count: this.state.revision_loop_count });
                                console.log(`[Orchestrator] Sprzeczne/pojedyncze INCI z OSINT (próba ${this.state.revision_loop_count}). Brak spójnej pary. Ponawiam OSINT...`);
                                continue; // Pętla wraca do RUN_A1
                            } else {
                                this.state.hitl_inci_candidates = candidates;
                                const preview1 = candidates[0] ? candidates[0].substring(0, 150) + (candidates[0].length > 150 ? '...' : '') : 'Brak';
                                const preview2 = candidates.length > 1 ? candidates[1].substring(0, 150) + (candidates[1].length > 150 ? '...' : '') : 'Brak drugiego wariantu';
                                this.state.hitl_alert = `OSINT_CONFLICTING_INCI_MAX_RETRYS: Po ${this.state.revision_loop_count + 1} próbach nie udało się znaleźć spójnej pary składów (lub znaleziono tylko jedno źródło). Sprawdź ręcznie i zatwierdź.\n[Wersja 1]: ${preview1}\n[Wersja 2]: ${preview2}`;
                                this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                                traceNode('1', this.gtin, 'A1_HALT_TRIGGERED', 'Brak spójnej pary INCI po max próbach. Wersja 1: ' + preview1 + ', Wersja 2: ' + preview2);
                                this.state.next_action = 'HALT';
                                this.emitState();
                                return;
                            }
                        }
                        
                        const polishPattern = /\b(woda|kwas|ekstrakt|olej|sok|gliceryna|masło|maslo|liść|lisc|korzeń|korzen|wyciąg|wyciag)\b/i;
                        if (polishPattern.test(selectedInci) && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                            this.state.hitl_alert = 'OSINT_TRANSLATED_INCI_ERROR: Wykryto polskie tłumaczenie w składzie INCI (niedozwolone). Zaktualizuj na oryginalny skład łaciński/angielski.';
                            this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                            traceNode('1', this.gtin, 'A1_HALT_TRIGGERED', 'Wykryto polskie tłumaczenie w składzie INCI: ' + selectedInci);
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
                            traceNode('1', this.gtin, 'A1_COSING_GATE_HIT', gateResOSINT);
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
                            traceNode('1', this.gtin, 'A1_GLOSSARY_WARNING', notInGlossaryOSINT);
                        }
                        
                        // Nadpisanie zmiennej przefiltrowanym, spójnym tekstem
                        selectedInci = rawInciArrOSINT.join(', ');
                        // --------------------------------------------------------
                        
                        this.state.extracted_data.inci = { value: selectedInci, source: 'osint_a1' };
                        traceInci(this.gtin, 'INCI_SAVED_TO_STATE', this.state.extracted_data.inci);
                    } else {
                        traceInci(this.gtin, 'A1_RETURNED_EMPTY_CANDIDATES', 'Brak kandydatów INCI w odp.');
                    }
                }
                
                // Sprawdzamy czy po OSINCIE nadal brakuje kluczowych pól i agregujemy błędy
                const stillMissing = [];
                if (!this.state.extracted_data.inci?.value) stillMissing.push('INCI');
                
                // Weryfikacja EU Responsible Person po A1
                const finalEu = this.state.extracted_data.eu_responsible_person?.data || {};
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
                    traceNode('1', this.gtin, 'A1_STILL_MISSING', stillMissing);
                }
                
                if (this.state.aggregated_hitl_errors.length > 0 && this.state.node_status['A1'] !== 'HITL_OVERRIDDEN') {
                    this.state.hitl_alert = 'Wymagana uwaga operatora. Wykryto problemy: ' + this.state.aggregated_hitl_errors.join(' | ');
                    this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                    traceNode('1', this.gtin, 'A1_HALT_TRIGGERED', 'Zagregowane błędy: ' + this.state.aggregated_hitl_errors.join(' | '));
                    this.state.next_action = 'HALT';
                    this.emitState();
                    return;
                }
                
                if (this.state.next_action !== 'HALT') {
                    traceNode('1', this.gtin, 'A1_COMPLETED_SUCCESSFULLY', 'Przejście do A2');
                    this.state.node_status['A1'] = 'OK';
                    this.state.next_action = 'RUN_A2';
                    this.emitState();
                }
            } catch (e) {
                console.log('⚠️ BŁĄD PHASE 1 (OSINT): ' + e.message);
                
                try {
                    const errorLogDir = path.join(__dirname, 'logs', 'agents_errors');
                    if (!fs.existsSync(errorLogDir)) fs.mkdirSync(errorLogDir, { recursive: true });
                    const errorLogPath = path.join(errorLogDir, `Agent_1_Error_${this.gtin}.log`);
                    const timestamp = new Date().toISOString();
                    const errorPayload = `[${timestamp}] PIPELINE: ${this.state.pipeline_id}\nERROR: ${e.message}\nSTACK: ${e.stack}\n======================================\n`;
                    fs.appendFileSync(errorLogPath, errorPayload, 'utf8');
                } catch (fsError) {
                    console.error('⚠️ KRYTYCZNY BŁĄD SYSTEMU PLIKÓW - Nie udało się zapisać logu błędu Agenta 1:', fsError.message);
                }

                this.state.a1_result = {};
                if (!this.state.extracted_data.inci?.value) {
                    console.log('⚠️ BRAK INCI PO BŁĘDZIE A1 -> ZATRZYMUJĘ POTOK.');
                    this.state.node_status['A1'] = 'HALTED_HITL_REQUIRED';
                    traceNode('1', this.gtin, 'A1_HALT_TRIGGERED', 'Błąd OSINT i brak INCI w systemie. Exception: ' + e.message);
                    this.state.hitl_alert = 'CRITICAL_MISSING_INCI: Brak składu (INCI) w PIM i błąd OSINT (' + e.message + '). Uzupełnij dane.';
                    this.state.next_action = 'HALT';
                    this.emitState();
                    return;
                } else {
                    console.log('⚠️ BŁĄD PHASE 1 (OSINT) -> Pomijam i idę do A2 (INCI JEST).');
                    traceNode('1', this.gtin, 'A1_ERROR_IGNORED', 'Błąd OSINT zignorowany (INCI było już wcześniej): ' + e.message);
                    this.state.node_status['A1'] = 'ERROR_IGNORED';
                    this.state.hitl_alert = 'OSINT Pominęty: ' + e.message;
                    this.state.next_action = 'RUN_A2';
                    this.emitState();
                }
            }
        }

        // --- KROK 2: A2 ---
        if (this.state.next_action === 'RUN_A2') {
            this.state.node_status['A2'] = 'RUNNING';
            this.emitState();
            if (!this.state.extracted_data.inci?.value) {
                console.log('⚠️ BLOKADA KRYTYCZNA: Próba przejścia do A2 bez INCI.');
                this.state.node_status['A1'] = 'CRITICAL_MISSING_INCI';
                this.state.hitl_alert = 'Nie można kontynuować potoku bez składu INCI. Zaktualizuj PIM.';
                this.state.next_action = 'HALT';
                this.emitState();
                return;
            }
            const agent2Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined
            };
            if (this.state.vision_extracted_features && Object.keys(this.state.vision_extracted_features).length > 0) {
                agent2Data.physical_grounding_context = {
                    ...this.state.vision_extracted_features,
                    _instruction: "UWAGA: Poniższe parametry fizyczne z etykiety frontowej packshotu służą wyłącznie jako kotwica weryfikacyjna wariantu (aby odrzucić opinie dotyczące innych formatów, np. saszetek uzupełniających lub innych wariantów zapachowych). ZAKAZ ograniczania analizy VoC tylko do nich. Przeanalizuj pełne, holistyczne doświadczenia klientów z działania, właściwości i użytkowania produktu na rynku."
                };
            }
            
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
                this.emitState();
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
                this.emitState();
            } else {
                this.state.node_status['A4'] = 'RUNNING';
                this.emitState();
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
                                ragText += `[INCI_DICT_COSING] ${data.inci_name || v}: ${data.functions.join(', ')}\n`;
                                functionFound = true;
                                break;
                            }
                        }
                        if (!functionFound) {
                            warnings.push('INGREDIENT_NO_FUNCTION: ' + rawI);
                        }
                    }
                    if (ragText) {
                        ragText += `\n[WYTYCZNA REKONTEKSTUALIZACJI DZIEDZINOWEJ DLA A4]: Powyższy słownik CosIng reprezentuje zastosowania w formulacjach kosmetycznych (WE 1223/2009). Jeżeli produkt należy do chemii gospodarczej lub detergentów (WE 648/2004 – np. odkamieniacz, płyn do WC, płyn do łazienek, preparat czyszczący, myjący), składniki interpretuj zgodnie z ich rolą technologiczną w czyszczeniu i odkamienianiu (kwasy organiczne/nieorganiczne = substancje aktywne rozpuszczające kamień wapienny i rdzę; kategoryczny zakaz opisywania ich jako konserwantów!).\n`;
                    }
                    
                    const complianceData = this.state.extracted_data.compliance?.data || {
                        clp_signal_word: this.state.extracted_data.clp_signal_word?.value,
                        clp_h_phrases: this.state.extracted_data.clp_h_phrases?.value ? (Array.isArray(this.state.extracted_data.clp_h_phrases.value) ? this.state.extracted_data.clp_h_phrases.value : [this.state.extracted_data.clp_h_phrases.value]) : [],
                        clp_p_phrases: this.state.extracted_data.clp_p_phrases?.value ? (Array.isArray(this.state.extracted_data.clp_p_phrases.value) ? this.state.extracted_data.clp_p_phrases.value : [this.state.extracted_data.clp_p_phrases.value]) : []
                    };
                    const agent4Data = {
                        gtin_ean: this.gtin,
                        product_name: product?.text_fields?.name || undefined,
                        brand: extracted.brand?.value || undefined,
                        category: product?.text_fields?.features?.['Kategoria'] || product?.category?.name || undefined,
                        inci: this.state.extracted_data.inci?.value || undefined,
                        detergent_composition: this.state.extracted_data.detergent_composition?.value || undefined,
                        compliance: complianceData
                    };
                    if (this.state.vision_extracted_features && Object.keys(this.state.vision_extracted_features).length > 0) {
                        agent4Data.physical_grounding_context = {
                            ...this.state.vision_extracted_features,
                            _instruction: "UWAGA: Poniższe cechy fizyczne (postać, zapach) stanowią kontekst formy aplikacyjnej produktu. Główne benefity techniczne i synergie MUSZĄ wynikać w 100% z mechanizmów biochemicznych składników aktywnych INCI i słownika RAG, a nie z samego opakowania czy dozownika."
                        };
                    }
                    
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
                    
                    if (result.mandatory_clp_warnings && Array.isArray(result.mandatory_clp_warnings) && result.mandatory_clp_warnings.length > 0) {
                        this.state.mandatory_clp_warnings = result.mandatory_clp_warnings;
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
                    this.emitState();
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
            this.state.node_status['A5'] = 'RUNNING';
            this.emitState();
            const gpsrSafetyService = require('./services/gpsr.safety.service');
            const isActualHouseholdChemical = Boolean(
                this.state.chemical_route_reasons?.includes('CATEGORY_CHEMICAL') || 
                product?.sds_required || 
                product?.clp_signal_word ||
                this.state.extracted_data.clp_signal_word?.value ||
                this.state.extracted_data.compliance?.data
            );
            const complianceData = this.state.extracted_data.compliance?.data || {
                clp_signal_word: this.state.extracted_data.clp_signal_word?.value,
                clp_h_phrases: this.state.extracted_data.clp_h_phrases?.value ? (Array.isArray(this.state.extracted_data.clp_h_phrases.value) ? this.state.extracted_data.clp_h_phrases.value : [this.state.extracted_data.clp_h_phrases.value]) : [],
                clp_p_phrases: this.state.extracted_data.clp_p_phrases?.value ? (Array.isArray(this.state.extracted_data.clp_p_phrases.value) ? this.state.extracted_data.clp_p_phrases.value : [this.state.extracted_data.clp_p_phrases.value]) : []
            };
            const gpsrBaseline = gpsrSafetyService.generateGpsrWarnings({
                inci: this.state.extracted_data.inci?.value || this.state.extracted_data.detergent_composition?.value,
                productName: product?.text_fields?.name,
                isChemical: isActualHouseholdChemical,
                compliance: complianceData,
                hPhrases: complianceData.clp_h_phrases,
                pPhrases: complianceData.clp_p_phrases,
                features: product?.features || {}
            });

            if (this.state.mandatory_clp_warnings && Array.isArray(this.state.mandatory_clp_warnings)) {
                for (const w of this.state.mandatory_clp_warnings) {
                    if (!gpsrBaseline.warnings.includes(w)) {
                        gpsrBaseline.warnings.push(w);
                    }
                }
            }

            const agent5Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                inci: this.state.extracted_data.inci?.value || undefined,
                detergent_composition: this.state.extracted_data.detergent_composition?.value || undefined,
                compliance: complianceData,
                gpsr_safety_baseline: gpsrBaseline,
                a1: this.state.a1_result,
                a2: this.state.a2_result,
                a4: this.state.a4_result
            };
            if (this.state.vision_extracted_features && Object.keys(this.state.vision_extracted_features).length > 0) {
                agent5Data.physical_grounding_context = {
                    ...this.state.vision_extracted_features,
                    _instruction: "UWAGA: W parach pytań i odpowiedzi FAQ (Sekcja 2) zachowaj pełną różnorodność tematyczną (skuteczność, typ skóry/powierzchni, sposób aplikacji, przechowywanie, bezpieczeństwo składników). Maksymalnie jedno pytanie może nawiązywać do dozownika/opakowania. ZAKAZ tworzenia powtarzalnych, szablonowych pytań wyłącznie o butelkę lub dozownik."
                };
            }
            const prompt5Template = fs.readFileSync(path.join(__dirname, 'prompts', 'Agent_5_compiled.md'), 'utf8');
            const prompt5 = prompt5Template.replace('{{SKU_DATA}}', JSON.stringify(agent5Data, null, 2));

            const a5Schema = {
                type: "object",
                properties: {
                    sanitization_status: { type: "string" },
                    mandatory_safety_warnings: { type: "array", items: { type: "string" } },
                    preserved_minor_flaws_for_pratfall: { type: "array", items: { type: "string" } },
                    safe_aeo_questions: { type: "array", items: { type: "string" } },
                    safe_aeo_answers: { type: "array", items: { type: "string" } }
                },
                required: ["sanitization_status", "mandatory_safety_warnings", "preserved_minor_flaws_for_pratfall", "safe_aeo_questions", "safe_aeo_answers"]
            };

            try {
                const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                    agentId: "5", prompt: prompt5, schema: a5Schema
                });
                
                const warnings = [];
                const allowedKeysA5 = ['sanitization_status', 'mandatory_safety_warnings', 'preserved_minor_flaws_for_pratfall', 'safe_aeo_questions', 'safe_aeo_answers'];
                for (let k of Object.keys(result)) {
                    if (!allowedKeysA5.includes(k)) {
                        warnings.push('A5_FIELD_REJECTED: ' + k);
                        delete result[k];
                    }
                }

                // Tarcza Defensive AI dla FAQ SEO/GEO (Sekcja 2): pary pytań i odpowiedzi muszą być 1:1.
                // Brak par → A6 buduje FAQ samodzielnie wg reguł promptu (fallback), z ostrzeżeniem w logu.
                const aeoQuestions = Array.isArray(result.safe_aeo_questions) ? result.safe_aeo_questions.filter(q => typeof q === 'string' && q.trim() !== '') : [];
                const aeoAnswers = Array.isArray(result.safe_aeo_answers) ? result.safe_aeo_answers.filter(a => typeof a === 'string' && a.trim() !== '') : [];
                if (aeoQuestions.length === 0 || aeoAnswers.length === 0) {
                    warnings.push('A5_AEO_FAQ_MISSING: A6 zbuduje FAQ samodzielnie');
                    console.warn(`[A5] Brak par FAQ SEO/GEO dla ${this.gtin} (pytania: ${aeoQuestions.length}, odpowiedzi: ${aeoAnswers.length})`);
                    result.safe_aeo_questions = [];
                    result.safe_aeo_answers = [];
                } else {
                    const pairCount = Math.min(aeoQuestions.length, aeoAnswers.length);
                    if (aeoQuestions.length !== aeoAnswers.length) {
                        warnings.push(`A5_AEO_FAQ_LENGTH_MISMATCH: ${aeoQuestions.length}/${aeoAnswers.length} -> przycięto do ${pairCount}`);
                        console.warn(`[A5] Niezgodna liczba pytań/odpowiedzi FAQ dla ${this.gtin}: ${aeoQuestions.length}/${aeoAnswers.length}`);
                    }
                    result.safe_aeo_questions = aeoQuestions.slice(0, pairCount);
                    result.safe_aeo_answers = aeoAnswers.slice(0, pairCount);
                }
                
                // Tarcza Defensive AI: jeśli A5 zwrócił pustą listę ostrzeżeń, wstrzykujemy bazowe ostrzeżenia z SDS GPSR
                if (!result.mandatory_safety_warnings || !Array.isArray(result.mandatory_safety_warnings) || result.mandatory_safety_warnings.length === 0) {
                    if (gpsrBaseline.warnings && gpsrBaseline.warnings.length > 0) {
                        result.mandatory_safety_warnings = gpsrBaseline.warnings;
                    }
                } else {
                    result.mandatory_safety_warnings = result.mandatory_safety_warnings.map(w => 
                        w.replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                         .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3}):\s*/i, '$1 – ')
                    );
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
                this.emitState();
            } catch (e) {
                const isRecitationBlocked = typeof e.message === 'string' && (e.message.includes('RECITATION') || e.message.includes('skopiował zbyt dużo tekstu'));
                if (isRecitationBlocked) {
                    console.warn(`[DEFENSIVE AI - A5] Zgłoszono blokadę RECITATION dla węzła A5 (EAN: ${this.gtin}). Aktywacja deterministycznej tarczy GPSR baseline.`);
                    const fallbackWarnings = (gpsrBaseline && Array.isArray(gpsrBaseline.warnings) && gpsrBaseline.warnings.length > 0)
                        ? gpsrBaseline.warnings
                        : ['Chronić przed dziećmi.', 'Stosować zgodnie z przeznaczeniem.'];

                    this.state.a5_result = {
                        sanitization_status: 'PASSED_CLEAN',
                        mandatory_safety_warnings: fallbackWarnings,
                        preserved_minor_flaws_for_pratfall: [],
                        safe_aeo_questions: [],
                        safe_aeo_answers: []
                    };
                    this.state.token_usage_per_node['A5'] = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
                    this.state.normalization_warnings = [
                        ...(this.state.normalization_warnings || []),
                        'A5_RECITATION_DEFENSIVE_FALLBACK: Zastosowano deterministyczne ostrzeżenia GPSR z bazy PIM (filtr RECITATION Google)'
                    ];
                    this.state.node_status['A5'] = 'OK';
                    this.state.next_action = 'RUN_A6';
                    this.emitState();
                    return;
                }

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

        // BRAMKA FAQ SEO/GEO (Sekcja 2): deterministyczna normalizacja etykiet (Problem→Pytanie,
        // Rozwiązanie/Answer→Odpowiedź, emoji ❓/✔️) + walidacja struktury (pary 1:1, pytanie z '?').
        // Zwraca { html, halted }. halted=true → węzeł zatrzymany do HITL (wywołujący robi return).
        const applyAeoFaqGate = (sectionHtml, nodeName) => {
            const fixedHtml = normalize_aeo_faq_labels(sectionHtml);
            if (fixedHtml !== sectionHtml) {
                this.state.normalization_warnings = [...(this.state.normalization_warnings || []), nodeName + '_AEO_FAQ_LABELS_NORMALIZED'];
                console.log(`[${nodeName}] Sekcja 2: znormalizowano etykiety FAQ (Pytanie/Odpowiedź) dla ${this.gtin}`);
            }
            const faqCheck = aeo_faq_check(fixedHtml);
            if (!faqCheck.valid) {
                const err = nodeName + '_OUTPUT_REJECTED: aeo_faq_check (' + faqCheck.errors.join(', ') + ')';
                console.warn(`[${nodeName}] ${err}`);
                this.state.normalization_warnings = [...(this.state.normalization_warnings || []), err];
                if (this.state.node_status[nodeName] !== 'HITL_OVERRIDDEN') {
                    this.state.node_status[nodeName] = 'HALTED_HITL_REQUIRED';
                    this.state.hitl_alert = err;
                    this.state.next_action = 'HALT';
                    this.emitState();
                    return { html: fixedHtml, halted: true };
                }
            }
            return { html: fixedHtml, halted: false };
        };

        // --- KROK 6: A6 ---
        if (this.state.next_action === 'RUN_A6') {
            this.state.node_status['A6'] = 'RUNNING';
            this.emitState();
            const agent6Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                capacity: extracted.capacity?.value || this.state.vision_extracted_features?.['Pojemność'] || this.state.vision_extracted_features?.['Pojemność / Waga'] || undefined,
                line: extracted.line?.value || undefined,
                inci: this.state.extracted_data.inci?.value || undefined,
                detergent_composition: this.state.extracted_data.detergent_composition?.value || undefined,
                compliance: this.state.extracted_data.compliance?.data || undefined,
                eu_responsible_person: this.state.extracted_data.eu_responsible_person?.data ? {
                    name: this.state.extracted_data.eu_responsible_person.data.name,
                    address_eu: this.state.extracted_data.eu_responsible_person.data.address_eu
                } : undefined,
                features: product?.text_fields?.features || {},
                vision_features: this.state.vision_extracted_features || {},
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

                // TARCZA DEFENSYWNA DLA GPSR (Podmiot odpowiedzialny w Sekcji 6):
                // Gwarantujemy, że Sekcja 6 HTML zawiera pełny fizyczny adres pocztowy i nazwę,
                // bez jakichkolwiek danych kontaktowych (zakaz e-mail, telefonów, stron WWW wg regulaminu Allegro).
                const euData = this.state.extracted_data.eu_responsible_person?.data;
                if (euData && euData.name && euData.address_eu && result.section_6_html) {
                    const fullEuString = brandResponsibleService.formatForHtmlDescription(euData);
                    const euPattern = /(<li[^>]*>\s*(?:➡️|⚠️|🛡️|\*|-)?\s*<b>\s*Podmiot odpowiedzialny w UE:?\s*<\/b>\s*)(.*?)(<\/li>)/i;
                    if (euPattern.test(result.section_6_html)) {
                        result.section_6_html = result.section_6_html.replace(euPattern, (match, prefix, content, suffix) => {
                            return `${prefix}${fullEuString}${suffix}`;
                        });
                    } else if (result.section_6_html.includes('</ul>')) {
                        result.section_6_html = result.section_6_html.replace('</ul>', `<li>➡️ <b>Podmiot odpowiedzialny w UE:</b> ${fullEuString}</li></ul>`);
                    }
                }

                // TARCZA DETERMINISTYCZNA DLA SEKCJI 3 (Closed-World INCI):
                // Eliminacja halucynacji kosmetycznych konserwantów (np. Phenoxyethanol w detergentach)
                if (result.section_3_html) {
                    const allowedSourcesStr = [
                        this.state.extracted_data.inci?.value,
                        this.state.extracted_data.detergent_composition?.value,
                        JSON.stringify(product?.text_fields?.features || {}),
                        JSON.stringify(this.state.a4_result || {})
                    ].filter(Boolean).join(' ');
                    result.section_3_html = sanitizeSection3Html(result.section_3_html, allowedSourcesStr);
                }

                // TARCZA DETERMINISTYCZNA DLA SEKCJI 5 (Parametry Techniczne ⚖️):
                // Eliminacja fałszywych certyfikatów CE w kosmetykach oraz marketingowych halucynacji pH w pudrach i formach bezwodnych
                if (result.section_5_html) {
                    const pimPayload = {
                        ...(this.state.pim_data || {}),
                        product_name: this.state.product_name,
                        name: this.state.product_name,
                        category: this.state.category_path,
                        features: this.state.features,
                        manufacturer: extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name,
                        brand: extracted.brand?.value || this.state.extracted_data?.brand?.value,
                        eu_responsible_person: this.state.extracted_data?.eu_responsible_person?.data
                    };
                    result.section_5_html = sanitizeSection5Html(result.section_5_html, pimPayload);
                }

                // TARCZA DETERMINISTYCZNA POPRAWNOŚCI JĘZYKOWEJ I HIGIENY INTERPUNKCYJNEJ DLA SEKCJI 6:
                if (result.section_6_html) {
                    result.section_6_html = sanitizeSection6Html(result.section_6_html);
                }

                // Globalna tarcza językowa i anty-kontaktowa Allegro dla wszystkich sekcji:
                for (let k of allowedKeysA6) {
                    if (result[k] && typeof result[k] === 'string') {
                        result[k] = brandResponsibleService.stripContactInfo(result[k]);
                        result[k] = result[k].replace(/\bDO OCZÓW\b/gi, 'DO OCZU').replace(/::+/g, ':');
                    }
                }

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

                const faqGateA6 = applyAeoFaqGate(result.section_2_html, 'A6');
                result.section_2_html = faqGateA6.html;
                if (faqGateA6.halted) return;

                this.state.node_status['A6'] = 'OK';
                this.state.next_action = 'RUN_A7';
                this.emitState();
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
            this.state.node_status['A7'] = 'RUNNING';
            this.emitState();
            const agent7Data = {
                gtin_ean: this.gtin,
                product_name: product?.text_fields?.name || undefined,
                brand: extracted.brand?.value || undefined,
                scent_variant: extracted.scent?.value || product?.text_fields?.features?.['Zapach'] || product?.text_fields?.features?.['Nuta zapachowa'] || this.state.vision_extracted_features?.['Zapach'] || undefined,
                vision_features: this.state.vision_extracted_features || undefined,
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

                const faqGateA7 = applyAeoFaqGate(a7_res_full.section_2_html, 'A7');
                a7_res_full.section_2_html = faqGateA7.html;
                if (faqGateA7.halted) return;

                this.state.node_status['A7'] = 'OK';
                this.state.next_action = 'RUN_A10';
                this.emitState();
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
            if (this.state.node_status['A10'] === 'HITL_OVERRIDDEN') {
                console.log('[Orchestrator] Węzeł A10 oznaczony jako HITL_OVERRIDDEN. Pomijam wywołanie LLM, przyjmuję sekcje z A7.');
                this.state.a10_result = { ...(this.state.a7_result || {}) };
                this.state.next_action = 'FINISH';
                this.emitState();
            } else {
                this.state.node_status['A10'] = 'RUNNING';
                this.emitState();

                // Generowanie realnego raportu pre-audytu kodowego dla Agenta 10 na wszystkich 6 sekcjach
                const detectedStopwords = [];
                for (let i = 1; i <= 6; i++) {
                    const secHtml = this.state.a7_result['section_' + i + '_html'];
                    if (secHtml) {
                        const hits = scan_stopwords(secHtml);
                        detectedStopwords.push(...hits.map(h => ({ section: `section_${i}_html`, word: h.word })));
                    }
                }

                // Weryfikacja zgodności prawnej sekcji 3, 5 i 6
                const s5Check = validate_section5_compliance(this.state.a7_result.section_5_html, {
                    is_medical_device: product?.is_medical_device,
                    product_name: product?.text_fields?.name,
                    manufacturer: extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name,
                    require_manufacturer: Boolean(extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name)
                });
                const s6Check = validate_section6_compliance(this.state.a7_result.section_6_html, {
                    has_eye_irritation: Boolean(this.state.chemical_route_reasons?.includes('CATEGORY_CHEMICAL')),
                    has_sensitizers: Boolean(this.state.extracted_data.inci?.value && /(linalool|limonene|coumarin|hexyl cinnamal|benzyl salicylate|isothiazolinone)/i.test(this.state.extracted_data.inci.value)),
                    is_chemical: Boolean(this.state.chemical_route_reasons?.includes('CATEGORY_CHEMICAL'))
                });
                const allowedSourcesList = (this.state.extracted_data.inci?.value || '').split(',').map(s => s.trim());
                if (this.state.extracted_data.detergent_composition?.value) {
                    allowedSourcesList.push(...this.state.extracted_data.detergent_composition.value.split(',').map(s => s.trim()));
                }
                const s3Check = validate_section3_ingredients_closed_world(this.state.a7_result.section_3_html, allowedSourcesList);

                const complianceIssues = [
                    ...s5Check.errors.map(e => `[Sekcja 5] ${e}`),
                    ...s6Check.errors.map(e => `[Sekcja 6] ${e}`),
                    ...s3Check.errors.map(e => `[Sekcja 3] ${e}`)
                ];

                let preAuditReport = '';
                if (detectedStopwords.length > 0) {
                    preAuditReport += `WYKRYTO SŁOWA ZAKAZANE REGULAMINEM ALLEGRO (§A): ${detectedStopwords.map(d => `${d.section}: "${d.word}"`).join(', ')}. BEZWZGLĘDNY OBOWIĄZEK SAMONAPRAWY PATCHEM W patches NA NEUTRALNE ODPOWIEDNIKI.\n`;
                }
                if (complianceIssues.length > 0) {
                    preAuditReport += `WYKRYTO NIEZGODNOŚCI PRAWNE I FORMALNE: ${complianceIssues.join(' | ')}. BEZWZGLĘDNY OBOWIĄZEK SAMONAPRAWY PATCHEM W patches.\n`;
                }
                if (!preAuditReport) {
                    preAuditReport = "Automated checks passed.";
                }

                const agent10Data = {
                    gtin_ean: this.gtin,
                    product_name: product?.text_fields?.name || undefined,
                    brand: extracted.brand?.value || undefined,
                    manufacturer: extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name || undefined,
                    scent_variant: extracted.scent?.value || product?.text_fields?.features?.['Zapach'] || product?.text_fields?.features?.['Nuta zapachowa'] || this.state.vision_extracted_features?.['Zapach'] || undefined,
                    inci: this.state.extracted_data.inci?.value || undefined,
                    detergent_composition: this.state.extracted_data.detergent_composition?.value || undefined,
                    vision_features: this.state.vision_extracted_features || undefined,
                    section_1_html: this.state.a7_result.section_1_html,
                    section_2_html: this.state.a7_result.section_2_html,
                    section_3_html: this.state.a7_result.section_3_html,
                    section_4_html: this.state.a7_result.section_4_html,
                    section_5_html: this.state.a7_result.section_5_html,
                    section_6_html: this.state.a7_result.section_6_html,
                    audit_report: preAuditReport
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
                        agentId: "10", prompt: prompt10, schema: a10Schema
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
                    
                    const allowedSectionsA10 = ['section_1_html', 'section_2_html', 'section_3_html', 'section_4_html', 'section_5_html', 'section_6_html'];
                    for (let p of patches) {
                        if (!allowedSectionsA10.includes(p.target_section)) {
                            warnings.push('A10_PATCH_ON_UNKNOWN_SECTION: ' + p.target_section);
                            continue;
                        }
                        if (finalDoc[p.target_section] && p.find_exact) {
                            finalDoc[p.target_section] = finalDoc[p.target_section].split(p.find_exact).join(p.replace_with);
                            console.log("[DEBUG A10] finalDoc po patchu na " + p.target_section + ":", finalDoc[p.target_section]);
                        }
                    }

                    // Reinforcement post-patch sanitizers
                    if (finalDoc.section_3_html) {
                        const allowedSourcesStr = [
                            this.state.extracted_data.inci?.value,
                            this.state.extracted_data.detergent_composition?.value,
                            JSON.stringify(product?.text_fields?.features || {}),
                            JSON.stringify(this.state.a4_result || {})
                        ].filter(Boolean).join(' ');
                        finalDoc.section_3_html = sanitizeSection3Html(finalDoc.section_3_html, allowedSourcesStr);
                    }
                    if (finalDoc.section_5_html) {
                        finalDoc.section_5_html = sanitizeSection5Html(finalDoc.section_5_html, {
                            product_name: this.state.product_name,
                            category: this.state.category_path,
                            features: this.state.features,
                            manufacturer: extracted.manufacturer?.value || product?.text_fields?.features?.['Producent'] || this.state.extracted_data?.eu_responsible_person?.data?.name,
                            brand: extracted.brand?.value || this.state.extracted_data?.brand?.value,
                            eu_responsible_person: this.state.extracted_data?.eu_responsible_person?.data
                        });
                    }
                    if (finalDoc.section_6_html) {
                        finalDoc.section_6_html = sanitizeSection6Html(finalDoc.section_6_html);
                    }

                    console.log("[DEBUG A10] finalDoc przed walidacja:", finalDoc);
                    
                    this.state.a10_result = finalDoc;
                    
                    traceInci(this.gtin, 'AGENT_10_OUTPUT_PATCHES', patches);
                    traceInci(this.gtin, 'AGENT_10_FINAL_HTML', this.state.a10_result);

                    if (warnings.length > 0) this.state.normalization_warnings = [...(this.state.normalization_warnings || []), ...warnings];

                    for (let i of [1, 2, 3, 4, 5, 6]) {
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

                    const faqGateA10 = applyAeoFaqGate(finalDoc.section_2_html, 'A10');
                    finalDoc.section_2_html = faqGateA10.html;
                    if (faqGateA10.halted) return;

                    this.state.node_status['A10'] = 'OK';
                    this.state.next_action = 'FINISH';
                    this.emitState();
                } catch (e) {
                    if (this.state.node_status['A10'] === 'HITL_OVERRIDDEN') {
                        console.warn(`[Orchestrator] Błąd A10 zignorowany ze względu na HITL_OVERRIDDEN: ${e.message}`);
                        this.state.a10_result = { ...(this.state.a7_result || {}) };
                        this.state.next_action = 'FINISH';
                        this.emitState();
                    } else {
                        this.state.node_status['A10'] = 'HALTED_HITL_REQUIRED';
                        this.state.hitl_alert = e.message;
                        this.state.next_action = 'HALT';
                        this.emitState();
                        return;
                    }
                }
            }
        }
        
        // --- FINISH: Składanie ---
        if (this.state.next_action === 'FINISH') {
            if (!this.state.a10_result) {
                this.state.a10_result = { ...(this.state.a7_result || {}) };
            }
            const s5 = this.state.a10_result['section_5_html'] || '';
            const s6 = this.state.a10_result['section_6_html'] || '';
            const extra4 = [s5, s6].filter(Boolean).join('\n<br>\n');
            
            const offer = {
                title: this.state.extracted_data.product_name?.value,
                description: brandResponsibleService.stripContactInfo(this.state.a10_result['section_1_html'] || ''),
                description_extra1: brandResponsibleService.stripContactInfo(this.state.a10_result['section_2_html'] || ''),
                description_extra2: brandResponsibleService.stripContactInfo(this.state.a10_result['section_3_html'] || ''),
                description_extra3: brandResponsibleService.stripContactInfo(this.state.a10_result['section_4_html'] || ''),
                description_extra4: brandResponsibleService.stripContactInfo(extra4),
                extra_field_4245: brandResponsibleService.stripContactInfo(this.state.a10_result['section_7_html'] || ''),
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

        try {
            const socketService = require('../../core/socket');
            socketService.broadcast('nexus-notification', {
                type: 'PIPELINE_COMPLETE',
                ean: this.gtin,
                result: {
                    title: this.state.final_offer.title,
                    editorHtml: {
                        sekcja1: this.state.final_offer.description,
                        sekcja2: this.state.final_offer.description_extra1,
                        sekcja3: this.state.final_offer.description_extra2,
                        sekcja4: this.state.final_offer.description_extra3,
                        sekcja5: this.state.final_offer.description_extra4,
                        sekcja7: this.state.final_offer.extra_field_4245
                    },
                    features: { 
                        INCI: this.state.final_offer.ingredients_inci,
                        "Skład": this.state.final_offer.ingredients_inci
                    }
                }
            });
        } catch(e) {
            console.error('[Orchestrator] Błąd wysyłania PIPELINE_COMPLETE:', e.message);
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
            if (node === 'A10' && !this.state.a10_result) {
                this.state.a10_result = { ...(this.state.a7_result || {}) };
            }
            
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
    normalizeTags,
    sanitizeSection5Html,
    sanitizeSection6Html
};
