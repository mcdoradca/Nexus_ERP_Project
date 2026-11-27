const crypto = require('crypto');
const { stripRawInciFooterFromSection3 } = require('../modules/offer-optimizer-v2/normalization');
const { validateDosageYieldMath } = require('../modules/offer-optimizer-v2/services/label-truth.helpers');

const DEFAULT_SEKCJA_7_PL = '<p>Produkt pochodzi z włoskiej dystrybucji i jest dostarczany w fabrycznym, szczelnie zamkniętym opakowaniu producenta. Przed pierwszym użyciem zapoznaj się z etykietą oraz zaleceniami zamieszczonymi na opakowaniu.</p>';

const DEFAULT_SECTION_ORDER = ['sekcja1', 'sekcja2', 'sekcja3', 'sekcja4', 'sekcja5', 'sekcja7'];
const ALL_DESCRIPTION_SECTION_KEYS = ['sekcja1', 'sekcja2', 'sekcja3', 'sekcja4', 'sekcja5', 'sekcjaTips', 'sekcja7'];
const PROTECTED_SECTIONS = new Set(['sekcja1', 'sekcja6']);
const ALLOWED_BULLET_EMOJIS = ['✔️', '✅', '☑️', '➡️'];
const ALLOWED_LAYOUTS = ['IMAGE_LEFT', 'ALTERNATING', 'TEXT_LEFT'];
const ALLOWED_FRAME_STYLES = ['CLEAN_NONE', 'ITALIAN_TRICOLOR'];

const DESCRIPTION_SECTION_META = [
    { key: 'sekcja1', label: 'Moduł 1: Mocne strony i wstęp (Above-the-Fold)', canHide: false, description: 'Główna sekcja otwierająca ofertę — zawsze widoczna.' },
    { key: 'sekcja2', label: 'Moduł 2: FAQ / Najczęstsze pytania', canHide: true, description: 'Możesz ukryć tę sekcję u wybranych klientów.' },
    { key: 'sekcja3', label: 'Moduł 3: Składniki aktywne i działanie', canHide: true, description: 'Mechanizm działania składników (bez surowej listy INCI).' },
    { key: 'sekcja4', label: 'Moduł 4: Sposób użycia i dawkowanie', canHide: true, description: 'Kroki aplikacji zgodne 1:1 z etykietą opakowania.' },
    { key: 'sekcja5', label: 'Moduł 5: Specyfikacja techniczna i parametry', canHide: true, description: 'Obiektywna karta parametrów z opakowania i PIM.' },
    { key: 'sekcjaTips', label: 'Moduł dodatkowy: Porady i praktyczne tipy', canHide: true, description: 'Autorska sekcja poradnikowa generowana dla danego klienta.' },
    { key: 'sekcja7', label: 'Moduł 7: Informacja o dystrybucji i opakowaniu', canHide: true, description: 'Własna stopka tekstowa klienta (zgodna z Zał. 2 Allegro).' }
];

const CONTENT_PROFILE_PRESETS = {
    DEFAULT_CLASSIC: {
        presetId: 'DEFAULT_CLASSIC',
        presetIndex: 0,
        name: 'Klasyczny Domyślny (Włoska ramka)',
        shortDesc: 'Domyślny układ 6 modułów z klasyczną włoską ramką na zdjęciach AI i standardową polską stopką.',
        writingTone: 'Rzeczowy doradca e-commerce: klarowny opis korzyści, konkretne fakty użytkowe, spokojny profesjonalny język.',
        titleStyle: 'BRAND_TYPE_BENEFIT_CAP',
        titleInstruction: 'Schemat: [Marka] [Typ produktu] [Główne zastosowanie/wyróżnik] [Pojemność/Waga].',
        headingStyle: 'Klasyczne nagłówki funkcyjne (np. Mocne strony, Najczęstsze pytania).',
        bulletEmoji: '✔️',
        imageTextLayout: 'IMAGE_LEFT',
        sectionOrder: ['sekcja1', 'sekcja2', 'sekcja3', 'sekcja4', 'sekcja5', 'sekcja7'],
        hiddenSections: [],
        includeTipsSection: false,
        tipsSectionTitle: 'Praktyczne porady i wskazówki użycia',
        defaultSekcja7: DEFAULT_SEKCJA_7_PL,
        defaultFrameStyle: 'ITALIAN_TRICOLOR'
    },
    EXPERT_TECHNICAL: {
        presetId: 'EXPERT_TECHNICAL',
        presetIndex: 1,
        name: 'Ekspert Techniczny (Bez FAQ + Porady + Naprzemienny)',
        shortDesc: 'Składniki i parametry wyżej w ofercie, ukryte FAQ, sekcja porad użytkowych, naprzemienny układ kafelków, czyste zdjęcia bez ramki.',
        writingTone: 'Precyzyjny styl techniczno-laboratoryjny: akcent na mechanizm formuły, wydajność na użycie i merytorykę fizykochemiczną bez zbędnych przymiotników.',
        titleStyle: 'TYPE_BRAND_CAP_BENEFIT',
        titleInstruction: 'Schemat: [Typ produktu i postać] [Marka] [Pojemność] [Przeznaczenie lub nuta].',
        headingStyle: 'Nagłówki analityczne i konkretne (np. Jak działa formuła, Kluczowe zastosowania).',
        bulletEmoji: '✅',
        imageTextLayout: 'ALTERNATING',
        sectionOrder: ['sekcja1', 'sekcja3', 'sekcja5', 'sekcja4', 'sekcjaTips', 'sekcja7', 'sekcja2'],
        hiddenSections: ['sekcja2'],
        includeTipsSection: true,
        tipsSectionTitle: 'Praktyczne wskazówki i triki zastosowania',
        defaultSekcja7: '<p>Artykuł z dystrybucji europejskiej w nienaruszonym opakowaniu fabrycznym producenta. Przed rozpoczęciem stosowania zweryfikuj oznaczenia etykiety i kartę parametrów.</p>',
        defaultFrameStyle: 'CLEAN_NONE'
    },
    PRACTICAL_HOME: {
        presetId: 'PRACTICAL_HOME',
        presetIndex: 2,
        name: 'Praktyczny Doradca Domowy (Porady wyżej + Tekst po lewej)',
        shortDesc: 'Szybkie przejście do instrukcji i porad praktycznych przed FAQ, kafelki z tekstem po lewej, czyste zdjęcia bez ramki.',
        writingTone: 'Przystępny i pomocny doradca domowy: jasne przykłady codziennych sytuacji w domu, nacisk na wygodę dozowania i bezpieczeństwo powierzchni.',
        titleStyle: 'BENEFIT_BRAND_TYPE_CAP',
        titleInstruction: 'Schemat: [Przeznaczenie/Działanie] [Typ produktu] [Marka] [Linia/Wariant] [Pojemność].',
        headingStyle: 'Nagłówki użytkowe z perspektywy problemu klienta.',
        bulletEmoji: '☑️',
        imageTextLayout: 'TEXT_LEFT',
        sectionOrder: ['sekcja1', 'sekcja4', 'sekcjaTips', 'sekcja2', 'sekcja3', 'sekcja5', 'sekcja7'],
        hiddenSections: [],
        includeTipsSection: true,
        tipsSectionTitle: 'Porady domowe i tipy z praktyki',
        defaultSekcja7: '<p>Towar konfekcjonowany przez producenta w zamkniętym opakowaniu jednostkowym, sprowadzany z rynku włoskiego. Szczegółowe zalecenia użytkowe znajdują się bezpośrednio na etykiecie wyrobu.</p>',
        defaultFrameStyle: 'CLEAN_NONE'
    },
    SENSORY_PREMIUM: {
        presetId: 'SENSORY_PREMIUM',
        presetIndex: 3,
        name: 'Sensoryczny i Komfortowy (Bez porad, układ naprzemienny)',
        shortDesc: 'Akcent na komfort użycia, zapach z etykiety i kulturę formuły; układ naprzemienny, czyste zdjęcia bez ramki.',
        writingTone: 'Kulturalny styl lifestyle i komfortu: wyważony język sensoryczny oparty o faktyczne nuty i konsystencję z etykiety, bez patosu i klisz.',
        titleStyle: 'BRAND_LINE_TYPE_CAP',
        titleInstruction: 'Schemat: [Marka] [Linia/Nuta zapachowa] – [Typ produktu] [Pojemność/Waga].',
        headingStyle: 'Eleganckie, krótkie nagłówki z akcentem na komfort stosowania.',
        bulletEmoji: '➡️',
        imageTextLayout: 'ALTERNATING',
        sectionOrder: ['sekcja1', 'sekcja3', 'sekcja4', 'sekcja2', 'sekcja5', 'sekcja7'],
        hiddenSections: [],
        includeTipsSection: false,
        tipsSectionTitle: 'Wskazówki komfortowego stosowania',
        defaultSekcja7: '<p>Wyrób z selekcjonowanej dystrybucji europejskiej w zamkniętym opakowaniu producenta. Zapoznaj się z pełną treścią etykiety przed pierwszym użyciem produktu.</p>',
        defaultFrameStyle: 'CLEAN_NONE'
    },
    MINIMAL_SCANNER: {
        presetId: 'MINIMAL_SCANNER',
        presetIndex: 4,
        name: 'Minimalistyczny Skaner (Parametry na górze, ukryty Moduł 7)',
        shortDesc: 'Parametry techniczne i zastosowanie od razu po wstępie, ukryta stopka Modułu 7, zwięzłe punkty i porady, zdjęcia bez ramki.',
        writingTone: 'Styl maksymalnie zwięzły i skanowalny na telefonie: krótkie zdania, zero lania wody, od razu konkret użytkowy.',
        titleStyle: 'TYPE_CAP_BRAND_SCENT',
        titleInstruction: 'Schemat: [Typ produktu] [Pojemność] [Marka] [Wariant/Zastosowanie].',
        headingStyle: 'Ultra-krótkie nagłówki 2–4 wyrazowe.',
        bulletEmoji: '✅',
        imageTextLayout: 'IMAGE_LEFT',
        sectionOrder: ['sekcja1', 'sekcja5', 'sekcja4', 'sekcjaTips', 'sekcja3', 'sekcja2', 'sekcja7'],
        hiddenSections: ['sekcja7'],
        includeTipsSection: true,
        tipsSectionTitle: 'Sprawdzone wskazówki – jak wydajnie korzystać z opakowania',
        defaultSekcja7: '<p>Produkt w fabrycznym, zamkniętym opakowaniu producenta. Przed użyciem przeczytaj wskazówki oraz oznaczenia bezpieczeństwa widoczne na etykiecie.</p>',
        defaultFrameStyle: 'CLEAN_NONE'
    },
    ROUTINE_GUIDE: {
        presetId: 'ROUTINE_GUIDE',
        presetIndex: 5,
        name: 'Przewodnik Krok-po-Kroku (Porady + Kolejność zadaniowa)',
        shortDesc: 'Najpierw korzyści i FAQ, potem instrukcja i porady praktyczne przed parametrami; tekst po lewej, czyste zdjęcia bez ramki.',
        writingTone: 'Styl przewodnika użytkowego krok po kroku: porządkuje kolejność prac i podpowiada typowe błędy użytkowników do uniknięcia.',
        titleStyle: 'BRAND_TYPE_BENEFIT_CAP',
        titleInstruction: 'Schemat: [Marka] [Typ produktu] do [Główne zastosowanie] [Wariant/Pojemność].',
        headingStyle: 'Nagłówki zadaniowe skupione na efekcie końcowym.',
        bulletEmoji: '✔️',
        imageTextLayout: 'TEXT_LEFT',
        sectionOrder: ['sekcja1', 'sekcja2', 'sekcja4', 'sekcjaTips', 'sekcja5', 'sekcja3', 'sekcja7'],
        hiddenSections: [],
        includeTipsSection: true,
        tipsSectionTitle: 'Porady i tipy w codziennym użyciu',
        defaultSekcja7: '<p>Artykuł dostarczany w zamkniętym opakowaniu producenta z europejskiej sieci dystrybucji. Wskazania dawkowania oraz środki ostrożności umieszczono na tylnej etykiecie opakowania.</p>',
        defaultFrameStyle: 'CLEAN_NONE'
    }
};

const AUTO_ASSIGNABLE_PRESET_IDS = [
    'EXPERT_TECHNICAL',
    'PRACTICAL_HOME',
    'SENSORY_PREMIUM',
    'MINIMAL_SCANNER',
    'ROUTINE_GUIDE'
];

const PACKAGING_FACT_FEATURE_KEYS = new Set([
    'Skład/INCI',
    'INCI',
    'Skład',
    'Ostrzeżenia',
    'Ostrzeżenia (Etykieta)',
    'Sposób użycia',
    'Sposób użycia (Etykieta)',
    'Pojemność nakrętki (Etykieta)',
    'Producent',
    'Kraj pochodzenia',
    'Kraj pochodzenia (Front)',
    'Kraj pochodzenia (Etykieta)',
    'Kraj produkcji',
    'Kraj produkcji (Etykieta)',
    'Pojemność',
    'Pojemność / Waga',
    'Waga',
    'Waga netto',
    'Waga brutto',
    'Waga z opakowaniem',
    'Waga z opakowaniem jednostkowym',
    'Waga produktu z opakowaniem jednostkowym',
    'Postać',
    'Postać (Etykieta)',
    'Postać (Front)',
    'Postac',
    'Forma',
    'Dozownik',
    'Dozownik (Etykieta)',
    'Opakowanie',
    'Opakowanie produktu',
    'Opakowanie (Front)',
    'Opakowanie (Etykieta)',
    'Zapach',
    'Nuta zapachowa',
    'Linia',
    'Linia produktowa (Front)',
    'Wariant (Etykieta Front)',
    'Nazwa produktu (Etykieta Front)',
    'Nazwa produktu (Kontretykieta)',
    'Przeznaczenie (Front)',
    'Przeznaczenie (Etykieta)',
    'Przeznaczenie',
    'Zastosowanie',
    'Składniki wiodące (Front)',
    'Wyróżniki (Etykieta Front)',
    'Wyróżniki / Certyfikaty (Etykieta)',
    'Bez spłukiwania (Etykieta Front)',
    'Piktogramy CLP (Etykieta)',
    'Liczba sztuk (Front)',
    'Liczba sztuk (Etykieta)',
    'Liczba sztuk w opakowaniu',
    'Liczba prań',
    'pH (Etykieta)',
    'Wydajność',
    'Twardość włosia',
    'MPN',
    'Kod producenta',
    'Zdjęcie tyłu opakowania',
    '_backImageUrl',
    'Zdjęcie tyłu opakowania 2',
    '_backImageUrl2',
    'Zdjęcie tyłu opakowania 3',
    '_backImageUrl3',
    'Zdjęcie frontu opakowania',
    '_frontImageUrl',
    'INFORMACJE O BEZPIECZEŃSTWIE'
]);

const DEFAULT_LEGACY_IMAGE_SLOTS = {
    sekcja1: 1,
    sekcja2: 2,
    sekcja3: 3,
    sekcja4: 4,
    sekcja5: 5,
    sekcja7: 0
};

function sanitizePlainContactFragments(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        .replace(/https?:\/\/[^\s<>"']+/gi, '')
        .replace(/\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/gi, '')
        .trim();
}

function getWorkspaceMetaAndSettings(workspaceOrSettings) {
    if (!workspaceOrSettings || typeof workspaceOrSettings !== 'object') {
        return { isDefault: false, slug: '', id: '', settings: {} };
    }
    if (
        workspaceOrSettings.settings !== undefined ||
        workspaceOrSettings.isDefault !== undefined ||
        workspaceOrSettings.slug !== undefined ||
        workspaceOrSettings.id !== undefined
    ) {
        return {
            id: String(workspaceOrSettings.id || ''),
            slug: String(workspaceOrSettings.slug || ''),
            isDefault: Boolean(workspaceOrSettings.isDefault),
            settings: (workspaceOrSettings.settings && typeof workspaceOrSettings.settings === 'object')
                ? workspaceOrSettings.settings
                : {}
        };
    }
    return {
        id: '',
        slug: '',
        isDefault: false,
        settings: workspaceOrSettings
    };
}

function resolveDefaultPresetIdForWorkspace(meta) {
    if (!meta || meta.isDefault || meta.slug === 'default' || !meta.id) {
        return 'DEFAULT_CLASSIC';
    }
    const digest = crypto.createHash('md5').update(String(meta.id)).digest();
    const idx = digest[0] % AUTO_ASSIGNABLE_PRESET_IDS.length;
    return AUTO_ASSIGNABLE_PRESET_IDS[idx];
}

function resolveWorkspaceContentProfile(workspaceOrSettings) {
    const meta = getWorkspaceMetaAndSettings(workspaceOrSettings);
    const raw = (meta.settings?.contentProfile && typeof meta.settings.contentProfile === 'object')
        ? meta.settings.contentProfile
        : {};

    const requestedPresetId = typeof raw.presetId === 'string' && CONTENT_PROFILE_PRESETS[raw.presetId]
        ? raw.presetId
        : resolveDefaultPresetIdForWorkspace(meta);
    const base = CONTENT_PROFILE_PRESETS[requestedPresetId] || CONTENT_PROFILE_PRESETS.DEFAULT_CLASSIC;

    const rawOrder = Array.isArray(raw.sectionOrder) ? raw.sectionOrder : base.sectionOrder;
    const sectionOrder = [];
    const seen = new Set();
    for (const k of rawOrder) {
        const cleanKey = String(k || '').trim();
        if (!ALL_DESCRIPTION_SECTION_KEYS.includes(cleanKey) || seen.has(cleanKey)) continue;
        seen.add(cleanKey);
        sectionOrder.push(cleanKey);
    }
    if (!seen.has('sekcja1')) {
        sectionOrder.unshift('sekcja1');
        seen.add('sekcja1');
    }
    for (const k of ALL_DESCRIPTION_SECTION_KEYS) {
        if (!seen.has(k) && (base.sectionOrder.includes(k) || k === 'sekcjaTips')) {
            sectionOrder.push(k);
            seen.add(k);
        }
    }

    const rawHidden = Array.isArray(raw.hiddenSections) ? raw.hiddenSections : base.hiddenSections;
    const hiddenSections = Array.from(new Set(
        rawHidden
            .map(s => String(s || '').trim())
            .filter(s => ALL_DESCRIPTION_SECTION_KEYS.includes(s) && !PROTECTED_SECTIONS.has(s))
    ));

    const includeTipsSection = typeof raw.includeTipsSection === 'boolean'
        ? raw.includeTipsSection
        : Boolean(base.includeTipsSection);

    const tipsSectionTitle = (typeof raw.tipsSectionTitle === 'string' && raw.tipsSectionTitle.trim().length >= 3)
        ? raw.tipsSectionTitle.trim().slice(0, 80)
        : base.tipsSectionTitle;

    const bulletEmoji = ALLOWED_BULLET_EMOJIS.includes(raw.bulletEmoji)
        ? raw.bulletEmoji
        : base.bulletEmoji;

    const imageTextLayout = ALLOWED_LAYOUTS.includes(raw.imageTextLayout)
        ? raw.imageTextLayout
        : base.imageTextLayout;

    const defaultSekcja7 = (typeof raw.defaultSekcja7 === 'string' && raw.defaultSekcja7.trim().length > 0)
        ? sanitizePlainContactFragments(raw.defaultSekcja7.trim())
        : base.defaultSekcja7;

    const writingTone = (typeof raw.writingTone === 'string' && raw.writingTone.trim().length >= 5)
        ? raw.writingTone.trim().slice(0, 300)
        : base.writingTone;

    const headingStyle = (typeof raw.headingStyle === 'string' && raw.headingStyle.trim().length >= 5)
        ? raw.headingStyle.trim().slice(0, 200)
        : base.headingStyle;

    const titleStyle = (typeof raw.titleStyle === 'string' && raw.titleStyle.trim())
        ? raw.titleStyle.trim()
        : base.titleStyle;

    const titleInstruction = (typeof raw.titleInstruction === 'string' && raw.titleInstruction.trim())
        ? raw.titleInstruction.trim()
        : base.titleInstruction;

    return {
        presetId: base.presetId,
        presetIndex: base.presetIndex,
        writingTone,
        titleStyle,
        titleInstruction,
        headingStyle,
        bulletEmoji,
        imageTextLayout,
        sectionOrder,
        hiddenSections,
        includeTipsSection,
        tipsSectionTitle,
        defaultSekcja7
    };
}

function resolveWorkspaceVisualProfile(workspaceOrSettings, options = {}) {
    if (!workspaceOrSettings && !options?.workspaceId) {
        return {
            frameStyle: 'ITALIAN_TRICOLOR',
            showAiBadge: true
        };
    }
    const meta = getWorkspaceMetaAndSettings(workspaceOrSettings);
    const raw = (meta.settings?.visualProfile && typeof meta.settings.visualProfile === 'object')
        ? meta.settings.visualProfile
        : {};

    const defaultFrame = (meta.isDefault || meta.slug === 'default')
        ? 'ITALIAN_TRICOLOR'
        : 'CLEAN_NONE';

    const frameStyle = ALLOWED_FRAME_STYLES.includes(raw.frameStyle)
        ? raw.frameStyle
        : defaultFrame;

    const showAiBadge = typeof raw.showAiBadge === 'boolean' ? raw.showAiBadge : true;

    return {
        frameStyle,
        showAiBadge
    };
}

function pickAutoProfileForNewWorkspace(existingWorkspaces = [], isDefault = false) {
    if (isDefault) {
        const preset = CONTENT_PROFILE_PRESETS.DEFAULT_CLASSIC;
        return {
            contentProfile: resolveWorkspaceContentProfile({ isDefault: true, settings: { contentProfile: { presetId: preset.presetId } } }),
            visualProfile: { frameStyle: 'ITALIAN_TRICOLOR', showAiBadge: true }
        };
    }

    const usageCounts = new Map(AUTO_ASSIGNABLE_PRESET_IDS.map(id => [id, 0]));
    for (const ws of existingWorkspaces || []) {
        const wsPreset = ws?.settings?.contentProfile?.presetId;
        if (wsPreset && usageCounts.has(wsPreset)) {
            usageCounts.set(wsPreset, usageCounts.get(wsPreset) + 1);
        }
    }

    let chosenId = AUTO_ASSIGNABLE_PRESET_IDS[0];
    let minCount = Infinity;
    for (const candidateId of AUTO_ASSIGNABLE_PRESET_IDS) {
        const c = usageCounts.get(candidateId) || 0;
        if (c < minCount) {
            minCount = c;
            chosenId = candidateId;
        }
    }

    const preset = CONTENT_PROFILE_PRESETS[chosenId];
    return {
        contentProfile: {
            presetId: preset.presetId,
            presetIndex: preset.presetIndex,
            writingTone: preset.writingTone,
            titleStyle: preset.titleStyle,
            titleInstruction: preset.titleInstruction,
            headingStyle: preset.headingStyle,
            bulletEmoji: preset.bulletEmoji,
            imageTextLayout: preset.imageTextLayout,
            sectionOrder: [...preset.sectionOrder],
            hiddenSections: [...preset.hiddenSections],
            includeTipsSection: preset.includeTipsSection,
            tipsSectionTitle: preset.tipsSectionTitle,
            defaultSekcja7: preset.defaultSekcja7
        },
        visualProfile: {
            frameStyle: 'CLEAN_NONE',
            showAiBadge: true
        }
    };
}

function extractRawSectionMap(htmlContent = {}) {
    if (!htmlContent || typeof htmlContent !== 'object') return {};
    return {
        sekcja1: htmlContent.sekcja1 || htmlContent.section_1_html || '',
        sekcja2: htmlContent.sekcja2 || htmlContent.section_2_html || '',
        sekcja3: stripRawInciFooterFromSection3(htmlContent.sekcja3 || htmlContent.section_3_html || ''),
        sekcja4: htmlContent.sekcja4 || htmlContent.section_4_html || '',
        sekcja5: htmlContent.sekcja5 || htmlContent.section_5_html || '',
        sekcjaTips: htmlContent.sekcjaTips || htmlContent.section_tips_html || htmlContent.sekcja_tips || '',
        sekcja7: htmlContent.sekcja7 || htmlContent.section_7_html || ''
    };
}

function resolveOrderedVisibleDescriptionSections(htmlContent = {}, contentProfile = null, { availableImageCount = null } = {}) {
    const sectionMap = extractRawSectionMap(htmlContent);

    if (!contentProfile || typeof contentProfile !== 'object') {
        const entries = [];
        for (const key of DEFAULT_SECTION_ORDER) {
            const rawHtml = String(sectionMap[key] || '').trim();
            if (!rawHtml) continue;
            entries.push({
                key,
                html: rawHtml,
                imgIdx: DEFAULT_LEGACY_IMAGE_SLOTS[key] ?? -1,
                imageFirst: true
            });
        }
        return entries;
    }

    const normalized = resolveWorkspaceContentProfile({ isDefault: false, settings: { contentProfile } });
    const hiddenSet = new Set(normalized.hiddenSections.filter(k => !PROTECTED_SECTIONS.has(k)));
    const visibleRaw = [];

    for (const key of normalized.sectionOrder) {
        if (key === 'sekcja6') continue;
        if (hiddenSet.has(key)) continue;
        if (key === 'sekcjaTips' && !normalized.includeTipsSection && !String(sectionMap.sekcjaTips || '').trim()) {
            continue;
        }
        const rawHtml = String(sectionMap[key] || '').trim();
        if (!rawHtml) continue;
        visibleRaw.push({ key, html: rawHtml });
    }

    const usedSlots = new Set();
    for (const item of visibleRaw) {
        if (DEFAULT_LEGACY_IMAGE_SLOTS[item.key] !== undefined) {
            usedSlots.add(DEFAULT_LEGACY_IMAGE_SLOTS[item.key]);
        }
    }

    const fallbackSlotsOrder = [2, 4, 3, 5, 1, 0];
    const findTipsImageSlot = () => {
        if (typeof availableImageCount === 'number' && availableImageCount > 6) {
            return 6;
        }
        for (const slot of fallbackSlotsOrder) {
            if (!usedSlots.has(slot)) {
                usedSlots.add(slot);
                return slot;
            }
        }
        return typeof availableImageCount === 'number' ? -1 : 2;
    };

    return visibleRaw.map((item, idx) => {
        const imgIdx = DEFAULT_LEGACY_IMAGE_SLOTS[item.key] !== undefined
            ? DEFAULT_LEGACY_IMAGE_SLOTS[item.key]
            : findTipsImageSlot();
        let imageFirst = true;
        if (normalized.imageTextLayout === 'TEXT_LEFT') {
            imageFirst = false;
        } else if (normalized.imageTextLayout === 'ALTERNATING') {
            imageFirst = idx % 2 === 0;
        }
        return {
            key: item.key,
            html: item.html,
            imgIdx,
            imageFirst
        };
    });
}

function extractVerifiedPackagingFacts(product = {}) {
    let rawFeatures = product?.features;
    if (typeof rawFeatures === 'string') {
        try {
            rawFeatures = JSON.parse(rawFeatures);
        } catch (_) {
            rawFeatures = {};
        }
    }
    const features = {};
    if (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures)) {
        for (const [k, v] of Object.entries(rawFeatures)) {
            if (!PACKAGING_FACT_FEATURE_KEYS.has(k)) continue;
            if (v === undefined || v === null) continue;
            const s = String(v).trim();
            if (!s) continue;
            features[k] = v;
        }
        const capCandidate = features['Pojemność / Waga'] || features['Pojemność'] || '';
        const yieldCandidate = features['Wydajność'] || features['Liczba prań'] || '';
        if (features['Sposób użycia']) {
            const mathCheck = validateDosageYieldMath({
                capacityText: capCandidate,
                yieldText: yieldCandidate,
                usageText: features['Sposób użycia']
            });
            if (!mathCheck.valid) {
                delete features['Sposób użycia'];
            }
        }
    }
    return {
        features,
        allegroCategoryId: product?.allegroCategoryId || null,
        weight: product?.weight || null
    };
}

async function loadSiblingPackagingFactsForEan(prisma, { ean, currentWorkspaceId = null } = {}) {
    if (!prisma?.product?.findMany || !ean) {
        return { features: {}, allegroCategoryId: null, weight: null, siblingCount: 0 };
    }
    try {
        const siblings = await prisma.product.findMany({
            where: {
                ean: String(ean).trim(),
                ...(currentWorkspaceId ? { workspaceId: { not: currentWorkspaceId } } : {})
            },
            select: {
                features: true,
                allegroCategoryId: true,
                weight: true,
                updatedAt: true
            },
            orderBy: { updatedAt: 'desc' },
            take: 5
        });

        const mergedFeatures = {};
        let allegroCategoryId = null;
        let weight = null;

        for (const sib of siblings) {
            const facts = extractVerifiedPackagingFacts(sib);
            for (const [k, v] of Object.entries(facts.features)) {
                if (!mergedFeatures[k]) {
                    mergedFeatures[k] = v;
                }
            }
            if (!allegroCategoryId && facts.allegroCategoryId) {
                allegroCategoryId = facts.allegroCategoryId;
            }
            if (!weight && facts.weight) {
                weight = facts.weight;
            }
        }

        return {
            features: mergedFeatures,
            allegroCategoryId,
            weight,
            siblingCount: siblings.length
        };
    } catch (err) {
        console.warn(`[WorkspaceContentProfile] Nie udało się odczytać wspólnych faktów opakowania dla EAN ${ean}: ${err.message}`);
        return { features: {}, allegroCategoryId: null, weight: null, siblingCount: 0 };
    }
}

function extractPlainText(html = '') {
    return String(html || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeNormalizedWords(text = '') {
    return extractPlainText(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2);
}

function computeShingleJaccard(textA = '', textB = '', shingleSize = 3) {
    const wordsA = tokenizeNormalizedWords(textA);
    const wordsB = tokenizeNormalizedWords(textB);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    const k = Math.min(shingleSize, wordsA.length, wordsB.length);
    const buildShingles = (words) => {
        const set = new Set();
        for (let i = 0; i <= words.length - k; i++) {
            set.add(words.slice(i, i + k).join(' '));
        }
        return set;
    };

    const setA = buildShingles(wordsA);
    const setB = buildShingles(wordsB);
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const s of setA) {
        if (setB.has(s)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

async function loadSiblingCopyFingerprints(prisma, { ean, currentWorkspaceId = null } = {}) {
    const empty = {
        count: 0,
        used_titles: [],
        used_s1_openings: [],
        used_faq_questions: [],
        used_s4_openings: [],
        used_tips_openings: [],
        _siblingPlainBlocks: []
    };

    if (!prisma?.product?.findMany || !ean || !currentWorkspaceId) {
        return empty;
    }

    try {
        const siblings = await prisma.product.findMany({
            where: {
                ean: String(ean).trim(),
                workspaceId: { not: currentWorkspaceId }
            },
            select: {
                id: true,
                name: true,
                offerDraft: true
            },
            orderBy: { updatedAt: 'desc' },
            take: 10
        });

        const titlesSet = new Set();
        const s1Openings = [];
        const faqQuestionsSet = new Set();
        const s4Openings = [];
        const tipsOpenings = [];
        const siblingPlainBlocks = [];

        for (const sib of siblings) {
            let draft = sib.offerDraft || {};
            if (typeof draft === 'string') {
                try {
                    draft = JSON.parse(draft);
                } catch (_) {
                    draft = {};
                }
            }
            const candidateTitle = String(draft?.title || sib.name || '').trim();
            if (candidateTitle && titlesSet.size < 8) {
                titlesSet.add(candidateTitle);
            }

            const htmlObj = (draft?.htmlContent && typeof draft.htmlContent === 'object') ? draft.htmlContent : draft;
            const s1 = htmlObj?.sekcja1 || htmlObj?.section_1_html || '';
            const s2 = htmlObj?.sekcja2 || htmlObj?.section_2_html || '';
            const s4 = htmlObj?.sekcja4 || htmlObj?.section_4_html || '';
            const sTips = htmlObj?.sekcjaTips || htmlObj?.section_tips_html || '';

            const p1 = extractPlainText(s1);
            const p2 = extractPlainText(s2);
            const p4 = extractPlainText(s4);
            const pTips = extractPlainText(sTips);

            if (p1 && s1Openings.length < 6) {
                s1Openings.push(p1.slice(0, 180));
            }
            if (p4 && s4Openings.length < 6) {
                s4Openings.push(p4.slice(0, 160));
            }
            if (pTips && tipsOpenings.length < 6) {
                tipsOpenings.push(pTips.slice(0, 160));
            }

            if (s2) {
                const qRegex = /<li[^>]*>[^<]*❓\s*(?:<[^>]+>)*\s*Pytanie:?\s*(?:<[^>]+>)*\s*([^<]+)/gi;
                let m;
                while ((m = qRegex.exec(String(s2))) !== null && faqQuestionsSet.size < 12) {
                    const qClean = extractPlainText(m[1]).slice(0, 140);
                    if (qClean) faqQuestionsSet.add(qClean);
                }
            }

            if (p1 || p2 || p4 || pTips) {
                siblingPlainBlocks.push({
                    sekcja1: p1,
                    sekcja2: p2,
                    sekcja4: p4,
                    sekcjaTips: pTips
                });
            }
        }

        return {
            count: siblings.length,
            used_titles: Array.from(titlesSet),
            used_s1_openings: s1Openings,
            used_faq_questions: Array.from(faqQuestionsSet),
            used_s4_openings: s4Openings,
            used_tips_openings: tipsOpenings,
            _siblingPlainBlocks: siblingPlainBlocks
        };
    } catch (err) {
        console.warn(`[WorkspaceContentProfile] Nie udało się pobrać odcisków opisów z innych kont dla EAN ${ean}: ${err.message}`);
        return empty;
    }
}

function evaluateCrossWorkspaceDuplication(generatedSections = {}, siblingFingerprints = null, threshold = 0.45) {
    const blocks = siblingFingerprints?._siblingPlainBlocks || [];
    if (!blocks.length) {
        return { isTooSimilar: false, maxSimilarity: 0, threshold, flaggedSections: [] };
    }

    const sectionPairs = [
        { outKey: 'section_1_html', sibKey: 'sekcja1' },
        { outKey: 'section_2_html', sibKey: 'sekcja2' },
        { outKey: 'section_4_html', sibKey: 'sekcja4' },
        { outKey: 'section_tips_html', sibKey: 'sekcjaTips' }
    ];

    let maxSimilarity = 0;
    const flaggedSections = [];

    for (const pair of sectionPairs) {
        const rawHtml = generatedSections?.[pair.outKey];
        if (!rawHtml || typeof rawHtml !== 'string') continue;
        const candidatePlain = extractPlainText(rawHtml);
        if (!candidatePlain) continue;

        let bestForSection = 0;
        for (const sibBlock of blocks) {
            const sibPlain = sibBlock?.[pair.sibKey];
            if (!sibPlain) continue;
            const sim = computeShingleJaccard(candidatePlain, sibPlain, 3);
            if (sim > bestForSection) bestForSection = sim;
        }

        if (bestForSection > maxSimilarity) {
            maxSimilarity = bestForSection;
        }
        if (bestForSection >= threshold) {
            flaggedSections.push({
                section: pair.outKey,
                similarity: Number(bestForSection.toFixed(3))
            });
        }
    }

    return {
        isTooSimilar: flaggedSections.length > 0,
        maxSimilarity: Number(maxSimilarity.toFixed(3)),
        threshold,
        flaggedSections
    };
}

function getPublicContentPresetsCatalog() {
    return {
        presets: Object.values(CONTENT_PROFILE_PRESETS),
        sections: DESCRIPTION_SECTION_META,
        protectedSections: Array.from(PROTECTED_SECTIONS),
        layouts: ALLOWED_LAYOUTS,
        bulletEmojis: ALLOWED_BULLET_EMOJIS,
        frameStyles: ALLOWED_FRAME_STYLES
    };
}

module.exports = {
    DEFAULT_SEKCJA_7_PL,
    DEFAULT_SECTION_ORDER,
    ALL_DESCRIPTION_SECTION_KEYS,
    PROTECTED_SECTIONS,
    ALLOWED_BULLET_EMOJIS,
    ALLOWED_LAYOUTS,
    ALLOWED_FRAME_STYLES,
    DESCRIPTION_SECTION_META,
    CONTENT_PROFILE_PRESETS,
    AUTO_ASSIGNABLE_PRESET_IDS,
    PACKAGING_FACT_FEATURE_KEYS,
    resolveWorkspaceContentProfile,
    resolveWorkspaceVisualProfile,
    pickAutoProfileForNewWorkspace,
    resolveOrderedVisibleDescriptionSections,
    extractVerifiedPackagingFacts,
    loadSiblingPackagingFactsForEan,
    extractPlainText,
    computeShingleJaccard,
    loadSiblingCopyFingerprints,
    evaluateCrossWorkspaceDuplication,
    getPublicContentPresetsCatalog
};
