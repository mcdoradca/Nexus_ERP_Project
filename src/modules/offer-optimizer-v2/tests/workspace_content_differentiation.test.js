const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const contentProfileService = require('../../../services/workspaceContentProfile.service');
const workspaceService = require('../../../services/workspace.service');
const photoroomService = require('../photoroom.service');
const { scan_stopwords, scan_biocidal_claims_lexical, scan_medical_claims_lexical } = require('../validators');
const googleSuggestFaqService = require('../services/google-suggest-faq.service');
const deterministicEngine = require('../services/deterministic-pipeline.engine');
const allegroMapper = require('../../../utils/allegro_mapper');
const baselinkerExportService = require('../baselinker.export.service');
const vonhalskyMapper = require('../../../utils/vonhalsky_mapper');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

async function countEdgeColorPixels(jpegBuffer) {
    const { data, info } = await sharp(jpegBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    let greenPixels = 0;
    let redPixels = 0;
    const { width, height, channels } = info;
    // Skanujemy wyłącznie obrzeże 8px obrazu (tam, gdzie rysowana jest włoska ramka)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isBorder = x < 8 || x >= width - 8 || y < 8 || y >= height - 8;
            if (!isBorder) continue;
            const idx = (y * width + x) * channels;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (g > 110 && r < 50 && b < 100) greenPixels++;
            if (r > 160 && g < 70 && b < 80) redPixels++;
        }
    }
    return { greenPixels, redPixels };
}

test('1. Przydział unikalnych profili klientom, ochrona Sekcji 6 oraz czystość prawna Module 7', () => {
    const defaultWs = { id: 'ws-default', slug: 'default', isDefault: true, settings: {} };
    const defaultProfile = contentProfileService.resolveWorkspaceContentProfile(defaultWs);
    const defaultVisual = contentProfileService.resolveWorkspaceVisualProfile(defaultWs);

    assert.equal(defaultProfile.presetId, 'DEFAULT_CLASSIC');
    assert.equal(defaultVisual.frameStyle, 'ITALIAN_TRICOLOR', 'Konto domyślne musi zachować włoską ramkę');

    const p2 = contentProfileService.pickAutoProfileForNewWorkspace([defaultWs], false);
    const ws2 = { id: 'ws-b', slug: 'firma-b', isDefault: false, settings: p2 };
    const p3 = contentProfileService.pickAutoProfileForNewWorkspace([defaultWs, ws2], false);
    const ws3 = { id: 'ws-c', slug: 'firma-c', isDefault: false, settings: p3 };

    assert.notEqual(p2.contentProfile.presetId, 'DEFAULT_CLASSIC');
    assert.notEqual(p2.contentProfile.presetId, p3.contentProfile.presetId, 'Kolejni klienci otrzymują automatycznie różne presety');
    assert.equal(p2.visualProfile.frameStyle, 'CLEAN_NONE', 'Kolejni klienci muszą domyślnie mieć wyłączoną ramkę i napis marki');
    assert.equal(p3.visualProfile.frameStyle, 'CLEAN_NONE', 'Kolejni klienci muszą domyślnie mieć wyłączoną ramkę i napis marki');
    assert.notDeepEqual(p2.contentProfile.sectionOrder, p3.contentProfile.sectionOrder);
    assert.notEqual(p2.contentProfile.defaultSekcja7, p3.contentProfile.defaultSekcja7);

    // Twarda ochrona Sekcji 6 i Sekcji 1 przed ukryciem
    const malicious = contentProfileService.resolveWorkspaceContentProfile({
        id: 'ws-b',
        isDefault: false,
        settings: {
            contentProfile: {
                sectionOrder: ['sekcja6', 'sekcja3', 'sekcja2'],
                hiddenSections: ['sekcja1', 'sekcja6', 'sekcja2']
            }
        }
    });
    assert.equal(malicious.hiddenSections.includes('sekcja1'), false, 'Sekcja 1 nigdy nie może zostać ukryta');
    assert.equal(malicious.hiddenSections.includes('sekcja6'), false, 'Sekcja 6 nigdy nie może wystąpić jako ukrywana w opisie');
    assert.equal(malicious.sectionOrder.includes('sekcja6'), false, 'Sekcja 6 nigdy nie może trafić do kolejności opisu oferty');
    assert.equal(malicious.hiddenSections.includes('sekcja2'), true, 'Sekcja 2 FAQ może zostać ukryta przez operatora');

    // Weryfikacja zgodności wszystkich presetów z Załącznikiem nr 2 i listą stop-words §A
    for (const preset of Object.values(contentProfileService.CONTENT_PROFILE_PRESETS)) {
        assert.equal(
            /wysyłk|magazyn|24h|kurier|natychmiast|dzisiaj|direct import|jesteśmy bezpośrednim importerem|oryginaln/i.test(preset.defaultSekcja7),
            false,
            `Preset ${preset.presetId} narusza Załącznik nr 2 Allegro: ${preset.defaultSekcja7}`
        );
        assert.deepStrictEqual(scan_stopwords(preset.defaultSekcja7), [], `Stop-words w ${preset.presetId}`);
        assert.deepStrictEqual(scan_biocidal_claims_lexical(preset.defaultSekcja7), []);
        assert.deepStrictEqual(scan_medical_claims_lexical(preset.defaultSekcja7), []);
    }
});

test('2. Zdjęcia AI (Photoroom V2): oryginalny prompt nietknięty, brak ramki i nazwy marki u kolejnych klientów', async () => {
    const promptMasterSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/modules/offer-optimizer-v2/prompt-master.service.js'), 'utf8');
    assert.ok(promptMasterSrc.includes('Odczytaj wszystkie informacje ze zdjęcia produktu'), 'Prompt Master musi pozostać w oryginalnej formie');
    assert.equal(/workspaceId|visualProfile/i.test(promptMasterSrc), false, 'Prompt Master nie może być modyfikowany pod profile');

    // Biały prostokąt testowy 600x600 jako surowa odpowiedź z Photoroom API
    const cleanWhiteInput = await sharp({
        create: { width: 600, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } }
    }).jpeg({ quality: 95 }).toBuffer();

    const defaultBordered = await photoroomService.applyClientFrameAndWatermark(cleanWhiteInput, {
        brandName: 'CHANTECLAIR',
        frameStyle: 'ITALIAN_TRICOLOR',
        showAiBadge: true
    });
    const borderStats = await countEdgeColorPixels(defaultBordered);
    assert.ok(borderStats.greenPixels > 100 && borderStats.redPixels > 100, 'Konto domyślne zachowuje włoską ramkę zielono-czerwono-białą');

    const clientCleanImage = await photoroomService.applyClientFrameAndWatermark(cleanWhiteInput, {
        brandName: 'CHANTECLAIR',
        frameStyle: 'CLEAN_NONE',
        showAiBadge: true
    });
    const cleanStats = await countEdgeColorPixels(clientCleanImage);
    assert.equal(cleanStats.greenPixels, 0, 'Obraz dla kolejnego klienta nie może mieć zielonej ramki ani napisu marki');
    assert.equal(cleanStats.redPixels, 0, 'Obraz dla kolejnego klienta nie może mieć czerwonej ramki');
});

test('3. Współdzielenie WYŁĄCZNIE faktów z etykiety (bez opisu/zdjęć) i straż antyduplikacji treści', async () => {
    const mockPrisma = {
        product: {
            findMany: async ({ where }) => {
                assert.equal(where.ean, '8001480025311');
                assert.equal(where.workspaceId.not, 'ws-firma-b');
                return [
                    {
                        id: 'prod-a',
                        name: 'Chanteclair Sgrassatore Uniwersalny Marsiglia 600 ml Spray',
                        allegroCategoryId: '253359',
                        weight: 0.72,
                        features: {
                            'Skład/INCI': 'Aqua, Sodium C12-18 Alkyl Sulfate, Ethanolamine',
                            'Ostrzeżenia': 'P102 – Chronić przed dziećmi. H319 – Działa drażniąco na oczy.',
                            'Sposób użycia': 'Spryskać powierzchnię, odczekać 30 sekund i przetrzeć wilgotną ściereczką.',
                            'Producent': 'Real Chimica S.r.l.',
                            'Pojemność': '600 ml',
                            'TajnePoleMarketingowe': 'Nie powinno zostać skopiowane'
                        },
                        offerDraft: {
                            title: 'Chanteclair Marsiglia Odtłuszczacz Spray 600 ml do kuchni',
                            htmlContent: {
                                sekcja1: '<h2>⭐ Chanteclair Marsiglia 600 ml</h2><p>Skuteczny odtłuszczacz w sprayu z nutą mydła marsylskiego do kuchni i piekarnika.</p>',
                                sekcja2: '<h2>❓ Pytania i odpowiedzi</h2><ul><li>❓ <b>Pytanie:</b> Czy Chanteclair Marsiglia usuwa przypalony tłuszcz?</li><li>✔️ <b>Odpowiedź:</b> Tak, formuła rozpuszcza osady tłuszczowe w kuchni.</li></ul>',
                                sekcja4: '<h2>✍️ Sposób użycia</h2><p>Spryskaj powierzchnię i przetrzyj.</p>',
                                sekcja6: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie:</b> P102 – Chronić przed dziećmi.</li></ul>'
                            },
                            images: [{ replacedUrl: 'data:image/jpeg;base64,SECRET_CLIENT_A_IMAGE' }]
                        }
                    }
                ];
            }
        }
    };

    const sharedFacts = await contentProfileService.loadSiblingPackagingFactsForEan(mockPrisma, {
        ean: '8001480025311',
        currentWorkspaceId: 'ws-firma-b'
    });
    assert.equal(sharedFacts.features['Skład/INCI'], 'Aqua, Sodium C12-18 Alkyl Sulfate, Ethanolamine');
    assert.equal(sharedFacts.features['Ostrzeżenia'], 'P102 – Chronić przed dziećmi. H319 – Działa drażniąco na oczy.');
    assert.equal(sharedFacts.features['Sposób użycia'], 'Spryskać powierzchnię, odczekać 30 sekund i przetrzeć wilgotną ściereczką.');
    assert.equal(sharedFacts.features['TajnePoleMarketingowe'], undefined, 'Niezatwierdzone pola spoza etykiety nie mogą wyciekać między firmami');

    const fingerprints = await contentProfileService.loadSiblingCopyFingerprints(mockPrisma, {
        ean: '8001480025311',
        currentWorkspaceId: 'ws-firma-b'
    });
    assert.equal(fingerprints.count, 1);
    assert.ok(fingerprints.used_titles.includes('Chanteclair Marsiglia Odtłuszczacz Spray 600 ml do kuchni'));
    assert.equal(JSON.stringify(fingerprints).includes('SECRET_CLIENT_A_IMAGE'), false, 'Zdjęcia innego klienta nigdy nie trafiają do odcisku tekstowego');

    const tooSimilarCopy = {
        section_1_html: '<h2>⭐ Chanteclair Marsiglia 600 ml</h2><p>Skuteczny odtłuszczacz w sprayu z nutą mydła marsylskiego do kuchni i piekarnika.</p>',
        section_6_html: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie:</b> P102 – Chronić przed dziećmi.</li></ul>'
    };
    const dupEval = contentProfileService.evaluateCrossWorkspaceDuplication(tooSimilarCopy, fingerprints, 0.45);
    assert.equal(dupEval.isTooSimilar, true, 'Identyczna treść marketingowa musi zostać wykryta');
    assert.ok(dupEval.flaggedSections.some(f => f.section === 'section_1_html'));
    assert.equal(dupEval.flaggedSections.some(f => f.section === 'section_6_html'), false, 'Sekcja 6 ostrzeżeń nigdy nie podlega fladze duplikacji');

    const uniqueCopy = {
        section_1_html: '<h2>⭐ Uniwersalny płyn odtłuszczający 600 ml Marsiglia</h2><p>Skoncentrowany środek z atomizerem zaprojektowany z myślą o czyszczeniu okapów, rusztów oraz blatów roboczych.</p>',
        section_6_html: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie:</b> P102 – Chronić przed dziećmi.</li></ul>'
    };
    const uniqueEval = contentProfileService.evaluateCrossWorkspaceDuplication(uniqueCopy, fingerprints, 0.45);
    assert.equal(uniqueEval.isTooSimilar, false, 'Odmienna treść dla Firmy B przechodzi weryfikację unikalności');
});

test('4. Kolejność sekcji, ukrywanie FAQ, Sekcja Porady i układ naprzemienny w Allegro / BaseLinker / Von Halsky', async () => {
    const customProfile = contentProfileService.resolveWorkspaceContentProfile({
        id: 'ws-custom',
        isDefault: false,
        settings: {
            contentProfile: {
                presetId: 'EXPERT_TECHNICAL',
                sectionOrder: ['sekcja1', 'sekcja3', 'sekcjaTips', 'sekcja5', 'sekcja4', 'sekcja7', 'sekcja2'],
                hiddenSections: ['sekcja2'],
                includeTipsSection: true,
                imageTextLayout: 'ALTERNATING'
            }
        }
    });

    const htmlContent = {
        sekcja1: '<h2>⭐ Wstęp</h2><p>Opis otwierający.</p>',
        sekcja2: '<h2>❓ FAQ</h2><ul><li>❓ <b>Pytanie:</b> Test?</li><li>✔️ <b>Odpowiedź:</b> Ukryte u klienta B.</li></ul>',
        sekcja3: '<h2>⚙️ Składniki</h2><p>Mechanizm działania.</p>',
        sekcja4: '<h2>✍️ Sposób użycia</h2><p>Krok po kroku.</p>',
        sekcja5: '<h2>⚖️ Parametry</h2><ul><li>➡️ <b>Marka:</b> Test</li></ul>',
        sekcja6: '<h2>⚠️ Bezpieczeństwo GPSR</h2><ul><li>➡️ <b>Ostrzeżenie:</b> Chronić przed dziećmi.</li></ul>',
        sekcjaTips: '<h2>⚡ Praktyczne wskazówki</h2><p>Porada eksperta.</p>',
        sekcja7: '<p>Dystrybucja europejska.</p>'
    };

    const imageUrls = [
        'https://a.allegroimg.com/original/1/slot1.jpg',
        'https://a.allegroimg.com/original/1/slot2.jpg',
        'https://a.allegroimg.com/original/1/slot3.jpg',
        'https://a.allegroimg.com/original/1/slot4.jpg',
        'https://a.allegroimg.com/original/1/slot5.jpg',
        'https://a.allegroimg.com/original/1/slot6.jpg'
    ];

    // Allegro StandardizedDescription
    const allegroBuilt = allegroMapper.buildAllegroDescriptionSections({
        htmlContent,
        imageUrls,
        contentProfile: customProfile
    });
    const allAllegroText = allegroBuilt.description.sections.map(s => s.items.find(i => i.type === 'TEXT')?.content || '').join(' ');
    assert.equal(allegroBuilt.sectionsCount, 6, 'FAQ ukryte (sekcja2) zostaje pominięte, sekcjaTips wchodzi w jego miejsce');
    assert.equal(allAllegroText.includes('Ukryte u klienta B'), false, 'Ukryta sekcja FAQ nie może wyjść na Allegro');
    assert.equal(allAllegroText.includes('Bezpieczeństwo GPSR'), false, 'Sekcja 6 GPSR nigdy nie może trafić do opisu Allegro');
    assert.ok(allegroBuilt.description.sections[1].items.some(i => i.content?.includes('Składniki')), 'Sekcja 3 przesunięta na pozycję 2');
    assert.ok(allegroBuilt.description.sections[2].items.some(i => i.content?.includes('Praktyczne wskazówki')), 'Sekcja Porady umieszczona na pozycji 3');
    assert.equal(allegroBuilt.description.sections[0].items[0].type, 'IMAGE', 'ALTERNATING: kafel #0 zaczyna się od zdjęcia');
    assert.equal(allegroBuilt.description.sections[1].items[0].type, 'TEXT', 'ALTERNATING: kafel #1 zaczyna się od tekstu');

    // BaseLinker Payload
    const origFetchParams = baselinkerExportService.fetchInventoryParameters;
    const origCompressImg = baselinkerExportService.compressImage;
    baselinkerExportService.fetchInventoryParameters = async () => [];
    baselinkerExportService.compressImage = async (u) => `url:${u}`;
    try {
        const blPayload = await baselinkerExportService.buildPayload('307', '123', {
            title: 'Produkt Testowy',
            htmlContent,
            images: [{ originalUrl: imageUrls[0], isCompliant: true }]
        }, { ean: '8001480025311', features: {} }, { contentProfile: customProfile });

        assert.ok(blPayload.text_fields.description.includes('Wstęp'));
        assert.ok(blPayload.text_fields.description_extra1.includes('Składniki'), 'BaseLinker szanuje kolejność sekcji klienta');
        assert.ok(blPayload.text_fields.description_extra2.includes('Praktyczne wskazówki'), 'BaseLinker zawiera sekcję Porady i Tipy');
        const blJoined = [
            blPayload.text_fields.description,
            blPayload.text_fields.description_extra1,
            blPayload.text_fields.description_extra2,
            blPayload.text_fields.description_extra3,
            blPayload.text_fields.description_extra4,
            blPayload.text_fields.extra_field_4245
        ].join(' ');
        assert.equal(blJoined.includes('Ukryte u klienta B'), false, 'BaseLinker pomija ukryte FAQ');
        assert.equal(blJoined.includes('Bezpieczeństwo GPSR'), false, 'BaseLinker nigdy nie umieszcza Sekcji 6 GPSR w polach opisu');
    } finally {
        baselinkerExportService.fetchInventoryParameters = origFetchParams;
        baselinkerExportService.compressImage = origCompressImg;
    }

    // InPost Von Halsky
    const vhDesc = vonhalskyMapper.buildVonHalskyDescription({
        htmlContent,
        format: 'html',
        contentProfile: customProfile
    });
    assert.equal(vhDesc.sectionsCount, 6);
    assert.equal(vhDesc.description.includes('Ukryte u klienta B'), false, 'Von Halsky pomija ukryte FAQ');
    assert.equal(vhDesc.description.includes('Bezpieczeństwo GPSR'), false, 'Von Halsky nie wkleja Sekcji 6 do opisu produktu');
    assert.ok(vhDesc.description.includes('Praktyczne wskazówki'), 'Von Halsky zawiera sekcję Porady');

    // Różnicowanie FAQ oraz Sekcji 3 i 5 między klientami
    const faq0 = await googleSuggestFaqService.harvestSearchIntentFaq({
        productName: 'Cif Płyn do łazienki 500 ml',
        brand: 'Cif',
        capacity: '500 ml',
        isChemical: true,
        variantIndex: 0
    });
    const faq1 = await googleSuggestFaqService.harvestSearchIntentFaq({
        productName: 'Cif Płyn do łazienki 500 ml',
        brand: 'Cif',
        capacity: '500 ml',
        isChemical: true,
        variantIndex: 1
    });
    assert.notDeepEqual(faq0.recommended_search_questions, faq1.recommended_search_questions, 'Pytania FAQ muszą różnić się stylistycznie między klientami');

    const s5Default = deterministicEngine.buildDeterministicSection5({
        gtin: '8001480025311',
        productName: 'Test 500 ml',
        brand: 'Cif',
        capacity: '500 ml'
    });
    const s5Alt = deterministicEngine.buildDeterministicSection5({
        gtin: '8001480025311',
        productName: 'Test 500 ml',
        brand: 'Cif',
        capacity: '500 ml',
        contentProfile: customProfile
    });
    assert.notEqual(s5Default, s5Alt, 'Nagłówek i punktor Sekcji 5 różnicują wygląd bez zmiany twardych danych');
    assert.ok(s5Alt.includes('8001480025311') && s5Alt.includes('500 ml'), 'Fakty z etykiety w Sekcji 5 są w 100% zachowane');
});

test('5. Izolacja pipeline_id w Orchestratorze V2 i aktualizacja workspace.service', async () => {
    const { Orchestrator } = require('../orchestrator');
    const orchA = new Orchestrator('8032680390036', { workspaceId: 'ws-alpha-111', workspaceIsDefault: false });
    const orchB = new Orchestrator('8032680390036', { workspaceId: 'ws-beta-222', workspaceIsDefault: false });
    assert.notEqual(orchA.state.pipeline_id, orchB.state.pipeline_id);
    assert.ok(orchA.state.pipeline_id.includes('ws-alpha-111'));
    assert.ok(orchB.state.pipeline_id.includes('ws-beta-222'));

    // Symulacja zapisu przez workspace.service.createWorkspace (auto-przydział różnego presetu i CLEAN_NONE)
    const createdRows = [];
    const mockPrismaWs = {
        $transaction: async (fn) => fn(mockPrismaWs),
        workspace: {
            findUnique: async () => null,
            findMany: async () => createdRows,
            updateMany: async () => ({ count: 0 }),
            create: async ({ data }) => {
                const row = { id: `ws-${createdRows.length + 1}`, ...data };
                createdRows.push(row);
                return row;
            }
        },
        securityAuditLog: { create: async () => ({}) }
    };

    const ws1 = await workspaceService.createWorkspace(mockPrismaWs, { name: 'Firma 1', isDefault: true });
    const ws2 = await workspaceService.createWorkspace(mockPrismaWs, { name: 'Firma 2', isDefault: false });
    const ws3 = await workspaceService.createWorkspace(mockPrismaWs, { name: 'Firma 3', isDefault: false });

    assert.equal(ws1.settings.contentProfile.presetId, 'DEFAULT_CLASSIC');
    assert.equal(ws1.settings.visualProfile.frameStyle, 'ITALIAN_TRICOLOR');
    assert.notEqual(ws2.settings.contentProfile.presetId, 'DEFAULT_CLASSIC');
    assert.equal(ws2.settings.visualProfile.frameStyle, 'CLEAN_NONE');
    assert.notEqual(ws3.settings.contentProfile.presetId, ws2.settings.contentProfile.presetId);
    assert.equal(ws3.settings.visualProfile.frameStyle, 'CLEAN_NONE');
});
