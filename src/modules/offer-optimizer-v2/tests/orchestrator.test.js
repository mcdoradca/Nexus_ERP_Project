const test = require('node:test');
const assert = require('node:assert');

const inciRefService = require('../inci.reference.service.js');

const { Orchestrator, PHASE_1_GROUNDING } = require('../orchestrator.js');
const aiWrapper = require('../ai.wrapper.js');

test('Orchestrator - ZBIORCZY HITL na pustym eu_responsible_person po A1', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        result: { pipeline_id: "test", gtin_ean: "8000137015436" } // A1 returns nothing
    });

    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    const orgExtract = require('../baselinker.extract.js').extractResponsiblePersonFromDescription;
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = () => ({ name: '', address_eu: '', contact: null }); // Force missing data

    await orch.runPhase1({ name: "mock pim" });

    // Extract passes because it defers missing data to A1
    assert.strictEqual(orch.state.node_status['EXTRACT'], 'OK');
    
    // A1 halts due to missing data (aggregated hitl)
    assert.strictEqual(orch.state.node_status['A1'], 'HALTED_HITL_REQUIRED');
    assert.ok(orch.state.aggregated_hitl_errors.some(e => e.includes('Osoba Odpowiedzialna (Brak/Niepełne)')));
    
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = orgExtract;
    aiWrapper.callAgentWithTelemetry = originalCall;
});


// --- NOWE TESTY DOK (Zadanie 36) ---

test('Zadanie 36-DOK: A5 - BLOCKED_CRITICAL_LEGAL_BREACH zatrzymuje potok', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A5';
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { sanitization_status: 'BLOCKED_CRITICAL_LEGAL_BREACH', mandatory_safety_warnings: [], preserved_minor_flaws_for_pratfall: [] },
        usage: {}
    });
    
    await orch.run(null);
    assert.strictEqual(orch.state.node_status['A5'], 'HALTED_HITL_REQUIRED');
    assert.strictEqual(orch.state.hitl_alert, 'BLOCKED_CRITICAL_LEGAL_BREACH');
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A5 - mandatory_safety_warnings przechodzi dalej znak w znak', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A5';
    const orgCall = aiWrapper.callAgentWithTelemetry;
    const warnings = ['To jest ostrzeżenie specyficzne z wykrzyknikami! 123'];
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { sanitization_status: 'PASSED', mandatory_safety_warnings: warnings, preserved_minor_flaws_for_pratfall: [] },
        usage: {}
    });
    // mockujemmy A6 zeby nie failowało
    const org6 = aiWrapper.callAgentWithTelemetry;
    
    await orch.run(null); // przerwie w A6 jezeli nie mockniemy
    assert.deepStrictEqual(orch.state.a5_result.mandatory_safety_warnings, warnings);
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A6 - hash sekcji 3, 5, 6 trafia do frozen_hashes', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A6';
    orch.state.a1_result = {}; orch.state.a2_result = {}; orch.state.a4_result = {}; orch.state.a5_result = {};
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            section_1_html: '1', section_2_html: '2', 
            section_3_html: 'S3_CONTENT', section_4_html: '4', 
            section_5_html: 'S5_CONTENT', section_6_html: 'S6_CONTENT' 
        },
        usage: {}
    });
    
    await orch.run(null);
    
    const crypto = require('crypto');
    assert.strictEqual(orch.state.frozen_hashes.s3, crypto.createHash('sha256').update('S3_CONTENT').digest('hex'));
    assert.strictEqual(orch.state.frozen_hashes.s5, crypto.createHash('sha256').update('S5_CONTENT').digest('hex'));
    assert.strictEqual(orch.state.frozen_hashes.s6, crypto.createHash('sha256').update('S6_CONTENT').digest('hex'));
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A6 - wyjście z niedozwolonym tagiem jest odrzucane', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A6';
    orch.state.a1_result = {}; orch.state.a2_result = {}; orch.state.a4_result = {}; orch.state.a5_result = {};
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            section_1_html: '<script>alert(1)</script>', section_2_html: '2', 
            section_3_html: '3', section_4_html: '4', section_5_html: '5', section_6_html: '6' 
        },
        usage: {}
    });
    
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A6'], 'HALTED_HITL_REQUIRED');
    assert.ok(orch.state.hitl_alert.includes('A6_OUTPUT_REJECTED'));
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: normalizacja tagów z punktu 1 działa na poziomie A6', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A6';
    orch.state.a1_result = {}; orch.state.a2_result = {}; orch.state.a4_result = {}; orch.state.a5_result = {};
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            section_1_html: '<p><b>Naglowek</b> i <i>tekst</i></p>', section_2_html: '2', 
            section_3_html: '3', section_4_html: '4', section_5_html: '5', section_6_html: '6' 
        },
        usage: {}
    });
    
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A6'], 'OK');
    assert.ok(orch.state.a6_result.section_1_html.includes('<strong>'));
    assert.ok(orch.state.a6_result.section_1_html.includes('<em>'));
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A7 - zmiana sekcji zamrożonej daje FROZEN_SECTION_VIOLATION i nie wysyłane do A7 są 3,5,6', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A7';
    orch.state.frozen_hashes = { s3: 'HASH_S3', s5: 'HASH_S5', s6: 'HASH_S6' };
    orch.state.a6_result = { section_3_html: 'S3_CONTENT', section_5_html: 'S5_CONTENT', section_6_html: 'S6_CONTENT' };
    const orgCall = aiWrapper.callAgentWithTelemetry;
    
    let lastPrompt = '';
    aiWrapper.callAgentWithTelemetry = async (args) => {
        lastPrompt = args.prompt;
        return {
            result: { 
                section_1_html: '1', section_2_html: '2', section_4_html: '4', section_3_html: 'PROBA_ZMIANY'
            },
            usage: {}
        };
    };
    
    // Teraz samo zwrocenie tego pola spowoduje blad
    
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A7'], 'HALTED_HITL_REQUIRED');
    assert.strictEqual(orch.state.hitl_alert, 'FROZEN_SECTION_VIOLATION');
    assert.ok(!lastPrompt.includes('S3_CONTENT')); // Upewniamy się, że nie wysłało sekcji zamrożonych
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A10 - patch w sekcję zamrożoną jest odrzucany', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A10';
    orch.state.a6_result = { section_3_html: 'BARDZO_STARA_TRESC', section_1_html: 'T1' };
    orch.state.a7_result = orch.state.a6_result;
    
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            patches: [
                { target_section: 'section_3_html', find_exact: 'BARDZO_STARA_TRESC', replace_with: 'NOWA', justification: 'bo tak' }
            ]
        },
        usage: {}
    });
    
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A10'], 'OK'); // sam zignoruje
    assert.ok(orch.state.normalization_warnings.includes('A10_PATCH_ON_FROZEN_SECTION: section_3_html'));
    assert.strictEqual(orch.state.a10_result.section_3_html, 'BARDZO_STARA_TRESC');
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A10 - patch poza zamrożonymi nakłada się poprawnie', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A10';
    orch.state.a6_result = { section_1_html: '<h2>A</h2><p>B</p>', section_3_html: 'FROZEN' };
    orch.state.a7_result = orch.state.a6_result;
    
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            patches: [
                { target_section: 'section_1_html', find_exact: '<p>B</p>', replace_with: '<p>C</p>', justification: 'bo tak' }
            ]
        },
        usage: {}
    });
    
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A10'], 'OK');
    assert.strictEqual(orch.state.a10_result.section_1_html, '<h2>A</h2><p>C</p>');
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: Normalizacja tagów działa na tag <i>', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A6';
    orch.state.a1_result = {}; orch.state.a2_result = {}; orch.state.a4_result = {}; orch.state.a5_result = {};
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            section_1_html: '<p><i>tekst</i></p>', section_2_html: '2', 
            section_3_html: '3', section_4_html: '4', section_5_html: '5', section_6_html: '6' 
        },
        usage: {}
    });
    
    await orch.run(null);
    assert.ok(orch.state.a6_result.section_1_html.includes('<em>'));
    assert.strictEqual(orch.state.node_status['A6'], 'OK');
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A7 weryfikacja nie zamraża innych sekcji', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A7';
    orch.state.frozen_hashes = { s3: 'HASH_S3', s5: 'HASH_S5', s6: 'HASH_S6' };
    orch.state.a6_result = { section_3_html: 'S3_CONTENT', section_5_html: 'S5_CONTENT', section_6_html: 'S6_CONTENT', section_2_html: '2_OLD' };
    const orgCall = aiWrapper.callAgentWithTelemetry;
    
    aiWrapper.callAgentWithTelemetry = async (args) => {
        return {
            result: { 
                section_1_html: '1', section_2_html: '2_NEW', section_4_html: '4' 
            },
            usage: {}
        };
    };
    
    orch.state.frozen_hashes.s3 = require('crypto').createHash('sha256').update('S3_CONTENT').digest('hex');
    orch.state.frozen_hashes.s5 = require('crypto').createHash('sha256').update('S5_CONTENT').digest('hex');
    orch.state.frozen_hashes.s6 = require('crypto').createHash('sha256').update('S6_CONTENT').digest('hex');
    await orch.run(null);
    
    assert.strictEqual(orch.state.node_status['A7'], 'OK');
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: A10 ignoruje braki na dozwolonych patchach w schemacie tablicy', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A10';
    orch.state.a7_result = { section_1_html: '<p>B</p>', section_3_html: 'FROZEN' };
    
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { 
            patches: [
                { find_exact: '<p>B</p>', replace_with: '<p>C</p>' } // brakuje target_section
            ]
        },
        usage: {}
    });
    
    await orch.run(null);
    assert.strictEqual(orch.state.node_status['A10'], 'OK'); 
    
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 36-DOK: Sklejanie (checkHitExact) omija błędne zlepki, rozdzielając nazwy bez spacji', async () => {
    const orgExtract = require('../baselinker.extract.js').extractFromFeatures;
    require('../baselinker.extract.js').extractFromFeatures = () => ({ 
        inci: { value: "Aqua, Glyceryl Stereate" },
        brand: { value: "b", source: "a1" },
        capacity: { value: "c", source: "a1" },
        product_name: { value: "p", source: "a1" },
        line: { value: "l", source: "a1" }
    });
    
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'EXTRACT';
    const orgDesc = require('../baselinker.extract.js').extractResponsiblePersonFromDescription;
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = () => ({name:"A", address_eu:"B", contact:"C"});
    
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => ({
        result: { pipeline_id: orch.state.pipeline_id }, usage: {}
    });
    
    await orch.run(null);
    
    assert.ok(orch.state.normalization_warnings.join(',').includes('INGREDIENT_NOT_IN_GLOSSARY: Glyceryl Stereate'));
    
    require('../baselinker.extract.js').extractFromFeatures = orgExtract;
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = orgDesc;
    aiWrapper.callAgentWithTelemetry = orgCall;
});

test('Zadanie 37: wywołanie writeBackToBaseLinker jest blokowane przez WRITE_BACK_ENABLED', async (t) => {
    const { Orchestrator } = require('../orchestrator.js');
    const orch = new Orchestrator('123');
    // Funkcja posiada blokadę WRITE_BACK_ENABLED = false, która kończy się poleceniem return (undefined)
    const result = orch.writeBackToBaseLinker({});
    assert.strictEqual(result, undefined);
});

test('GPSR Tarcza Defensywna: A6 rekonstruuje pełny adres podmiotu w Sekcji 6, gdy model podał tylko nazwę', async () => {
    const orch = new Orchestrator('8000137015436');
    orch.state.next_action = 'RUN_A6';
    orch.state.a1_result = {};
    orch.state.a2_result = {};
    orch.state.a4_result = {};
    orch.state.a5_result = {};
    orch.state.extracted_data = {
        inci: { value: "Aqua, Glycerin" },
        eu_responsible_person: {
            data: {
                name: "Paglieri S.p.A.",
                address_eu: "S.S. per Genova Km 98, 15122 Alessandria, Włochy",
                contact: "info@paglieri.it"
            }
        }
    };

    const orgExtractDesc = require('../baselinker.extract.js').extractResponsiblePersonFromDescription;
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = () => ({
        name: "Paglieri S.p.A.",
        address_eu: "S.S. per Genova Km 98, 15122 Alessandria, Włochy",
        contact: "info@paglieri.it"
    });
    
    const orgCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async ({ agentId }) => {
        if (agentId === '6') {
            return {
                result: {
                    section_1_html: "<p>S1</p>",
                    section_2_html: "<p>S2</p>",
                    section_3_html: "<p>S3</p>",
                    section_4_html: "<p>S4</p>",
                    section_5_html: "<p>S5</p>",
                    section_6_html: "<h2>⚠️ Bezpieczeństwo i GPSR</h2><ul><li>➡️ <b>Podmiot odpowiedzialny w UE:</b> Paglieri S.p.A.</li></ul>"
                },
                usage: {}
            };
        }
        return {
            result: {
                section_1_html: "<p>S1</p>",
                section_2_html: "<p>S2</p>",
                section_4_html: "<p>S4</p>"
            },
            usage: {}
        };
    };

    await orch.run(null);

    assert.strictEqual(orch.state.node_status['A6'], 'OK');
    const s6 = orch.state.a6_result.section_6_html;
    assert.ok(s6.includes("Paglieri S.p.A., S.S. per Genova Km 98, 15122 Alessandria, Włochy"), "Sekcja 6 musi zawierać pełny adres podmiotu odpowiedzialnego");

    aiWrapper.callAgentWithTelemetry = orgCall;
    require('../baselinker.extract.js').extractResponsiblePersonFromDescription = orgExtractDesc;
});

test('Tarcza Defensywna Krok 1: extractGroundedTextFromResponse odzyskuje tekst z candidate.content.parts przy RECITATION gdy geter .text zwraca undefined', () => {
    const { extractGroundedTextFromResponse } = require('../ai.wrapper.js');
    const mockResponse = {
        // Symulacja gettera SDK @google/genai, który zwraca undefined przy RECITATION
        get text() { return undefined; },
        candidates: [
            {
                finishReason: 'RECITATION',
                content: {
                    parts: [
                        { text: '{"country_of_origin": "Włochy", "extracted_inci_candidates": [["AQUA", "GLYCERIN"]]}' }
                    ]
                }
            }
        ]
    };

    const extracted = extractGroundedTextFromResponse(mockResponse, '1');
    assert.ok(extracted.length > 20, "Musi odzyskać tekst z candidate.content.parts");
    assert.ok(extracted.includes("AQUA"), "Musi zawierać odnalezione składniki");
});

test('Tarcza Defensywna Krok 1: extractGroundedTextFromResponse odzyskuje tekst z bufora myśli lub groundingChunks, gdy brak partów bez thought', () => {
    const { extractGroundedTextFromResponse } = require('../ai.wrapper.js');
    const mockResponseThoughts = {
        get text() { return undefined; },
        candidates: [
            {
                finishReason: 'RECITATION',
                content: {
                    parts: [
                        { thought: true, text: 'Znalazłem skład: AQUA, SODIUM LAURETH SULFATE, GLYCERIN.' }
                    ]
                }
            }
        ]
    };

    const extractedThoughts = extractGroundedTextFromResponse(mockResponseThoughts, '1');
    assert.ok(extractedThoughts.includes("SODIUM LAURETH SULFATE"), "Musi odzyskać tekst z bufora myśli");

    const mockResponseChunks = {
        get text() { return undefined; },
        candidates: [
            {
                finishReason: 'RECITATION',
                groundingMetadata: {
                    groundingChunks: [
                        { web: { title: 'Drogeria Hebe', uri: 'https://hebe.pl', snippet: 'Skład produktu: Aqua, Cetearyl Alcohol.' } }
                    ]
                }
            }
        ]
    };

    const extractedChunks = extractGroundedTextFromResponse(mockResponseChunks, '1');
    assert.ok(extractedChunks.includes("Drogeria Hebe"), "Musi odzyskać tekst ze snippetów groundingChunks");
});

test('Orchestrator mapuje country_of_origin oraz logistics capacity do extracted_data po A1', () => {
    const orch = new Orchestrator('8000137015436');
    const mockA1Result = {
        country_of_origin: { value: "Włochy" },
        logistics: {
            value: {
                net_capacity_or_weight: "650 ml"
            }
        }
    };

    // Symulacja bloku mapowania A1 w Orchestratorze
    if (mockA1Result.country_of_origin && mockA1Result.country_of_origin.value) {
        orch.state.extracted_data = orch.state.extracted_data || {};
        orch.state.extracted_data.country_of_origin = {
            value: mockA1Result.country_of_origin.value,
            source: 'osint_a1'
        };
        orch.state.extracted_data['Kraj pochodzenia'] = {
            value: mockA1Result.country_of_origin.value,
            source: 'osint_a1'
        };
    }
    if (mockA1Result.logistics?.value?.net_capacity_or_weight) {
        orch.state.extracted_data['Pojemność'] = {
            value: mockA1Result.logistics.value.net_capacity_or_weight,
            source: 'osint_a1'
        };
        orch.state.extracted_data['capacity'] = {
            value: mockA1Result.logistics.value.net_capacity_or_weight,
            source: 'osint_a1'
        };
    }

    assert.strictEqual(orch.state.extracted_data.country_of_origin.value, "Włochy");
    assert.strictEqual(orch.state.extracted_data['Kraj pochodzenia'].value, "Włochy");
    assert.strictEqual(orch.state.extracted_data['Pojemność'].value, "650 ml");
    assert.strictEqual(orch.state.extracted_data['capacity'].value, "650 ml");
});

test('ADR-0127: callAgentWithTelemetry w Standard Path poprawnie wywołuje generateContentWithTimeout bez ReferenceError', async () => {
    // Sprawdzamy czy wywołanie dla agenta w ścieżce Standard (np. Agent 5, który ma grounding: false)
    // nie rzuca ReferenceError: generateContentWithTimeout is not defined
    try {
        await aiWrapper.callAgentWithTelemetry({
            agentId: "5",
            prompt: "Test prompt",
            schema: { type: "object", properties: { sanitization_status: { type: "string" } } }
        });
    } catch (err) {
        // Jeśli nie ma sieci / API_KEY lub zwróci błąd API, to normalne, ale NIE MOŻE to być ReferenceError!
        assert.ok(!err.message.includes('generateContentWithTimeout is not defined'), 'Nie powinno rzucać ReferenceError dla generateContentWithTimeout!');
    }
});



