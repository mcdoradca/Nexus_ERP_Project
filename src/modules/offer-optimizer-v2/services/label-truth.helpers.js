/**
 * Czyste helpery detekcji prawdy etykietowej (bez żadnych zależności zewnętrznych),
 * współdzielone przez deterministic-pipeline.engine.js, validators/index.js oraz google-suggest-faq.service.js
 * w celu całkowitego wyeliminowania cykli require().
 */

const CANONICAL_ACRONYMS = new Set(['wc', 'uv', 'spf', 'ph', 'led', 'xxl', 'xl', 'bio', 'eco', '3d']);
const POLISH_CONNECTOR_WORDS = new Set(['w', 'z', 'i', 'do', 'na', 'po', 'za', 'od', 'ze', 'we', 'di', 'e', 'o', 'u']);

function isNoRinseFormula({ productName = '', visionFeatures = {}, features = {}, usage = '' } = {}) {
    if (visionFeatures?.['Bez spłukiwania (Etykieta Front)'] === 'Tak' || features?.['Bez spłukiwania (Etykieta Front)'] === 'Tak') {
        return true;
    }
    const sources = [
        productName,
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        visionFeatures?.['Linia produktowa (Front)'],
        features?.['Wyróżniki (Etykieta Front)'],
        features?.['Wyróżniki / Certyfikaty (Etykieta)'],
        features?.['Cechy dodatkowe'],
        features?.['Wyróżniki']
    ].filter(Boolean).join(' ');
    if (/(?:\bbez\s+(?:konieczności\s+)?spłukiwania\b|\bsenza\s+risciacquo\b|\bno\s+rinse\b|\bsans\s+rin[cç]age\b|\bohne\s+aussp[uü]len\b|\bnie\s+wymaga\s+spłukiwania\b)/i.test(sources)) {
        return true;
    }
    if (usage && /(?:\bbez\s+(?:konieczności\s+)?spłukiwania\b|\bnie\s+wymaga\s+spłukiwania\b|\bnie\s+spłukiwać\b|\bsenza\s+risciacquo\b)/i.test(String(usage))) {
        return true;
    }
    return false;
}

function hasDeclaredOdorNeutralizer({ productName = '', inci = '', detergentComposition = '', visionFeatures = {}, features = {} } = {}) {
    const inciSource = `${inci || ''} ${detergentComposition || ''}`;
    if (/(?:cyclodextrin|cyklodekstryn|zinc\s+ricinoleate|rycynooleinian\s+cynku|activated\s+charcoal|charcoal\s+powder|węgiel\s+aktywny|sodium\s+bicarbonate|wodorowęglan\s+sodu|triethyl\s+citrate)/i.test(inciSource)) {
        return true;
    }
    const claimsSource = [
        productName,
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        visionFeatures?.['Przeznaczenie (Front)'],
        features?.['Wyróżniki (Etykieta Front)'],
        features?.['Wyróżniki / Certyfikaty (Etykieta)'],
        features?.['Przeznaczenie']
    ].filter(Boolean).join(' ');
    return /(?:neutralizator\s+zapach|pochłaniacz\s+zapach|neutralizuje\s+nieprzyjemne\s+zapachy|neutralizza\s+gli\s+odori|anti[\s-]?odori?|zwalcza\s+nieprzyjemne\s+zapachy|pomaga\s+zwalczać\s+nieprzyjemne\s+zapachy)/i.test(claimsSource);
}

function detectRawCatalogNameLeak(htmlStr = '', rawProductName = '', canonicalProductName = '') {
    if (!htmlStr || !rawProductName || !canonicalProductName) return null;
    const rawTrim = String(rawProductName).trim();
    const canonTrim = String(canonicalProductName).trim();
    if (!rawTrim || !canonTrim || rawTrim.toLowerCase() === canonTrim.toLowerCase()) return null;

    const plainText = String(htmlStr)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const plainLower = plainText.toLowerCase();

    if (rawTrim.length >= 10 && plainLower.includes(rawTrim.toLowerCase())) {
        return rawTrim;
    }

    if (/\bexpres\b/i.test(rawTrim) && /\bexpres\b/i.test(plainText)) {
        return 'expres';
    }

    const canonTokens = canonTrim.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const rawTokens = rawTrim.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < rawTokens.length; i++) {
        const tok = rawTokens[i];
        const nextTok = rawTokens[i + 1] || '';
        const followedByNumber = /^\d+$/.test(nextTok);
        if (tok.length >= 2 && tok.length <= 3 && !POLISH_CONNECTOR_WORDS.has(tok) && !CANONICAL_ACRONYMS.has(tok) && followedByNumber) {
            const isPrefixOfOfficial = canonTokens.some(ct => ct.length > tok.length && ct.startsWith(tok));
            if (isPrefixOfOfficial && new RegExp(`\\b${tok}\\s+${nextTok}\\b`, 'i').test(plainText)) {
                return `${tok} ${nextTok}`;
            }
        }
    }
    return null;
}

const FRAGRANCE_ALLERGEN_MOLECULES = [
    'alpha-isomethyl ionone', 'hexyl cinnamal', 'citronellol', 'coumarin',
    'geraniol', 'limonene', 'linalool', 'citral', 'eugenol', 'isoeugenol',
    'benzyl salicylate', 'benzyl benzoate', 'benzyl alcohol', 'benzyl cinnamate',
    'hydroxycitronellal', 'amyl cinnamal', 'amylcinnamyl alcohol', 'farnesol',
    'cinnamal', 'cinnamyl alcohol', 'anise alcohol', 'evernia prunastri',
    'evernia furfuracea', 'tetramethyl acetyloctahydronaphthalenes', 'acetyl cedrene'
];

const FILLER_OR_PRESERVATIVE_HEADINGS_REGEX = /^(?:aqua|water|woda|baza wodna|sodium chloride|chlorek sodu|benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol|dmdm hydantoin|stabilizator mikrobiologiczny|układ konserwujący|konserwant(?:y)?(?:\s+formulacji)?|składniki kompozycji zapachowej|nuty aromatyczne|barwnik(?:i)?|colorants?|ci\s*\d{4,5})(?:\s*\([^)]*\))?\s*:?$/i;

const MARKETING_FILLER_ITEM_REGEX = /^(?:aqua|water|woda|sodium chloride|chlorek sodu|benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol|dmdm hydantoin|sodium benzoate|potassium sorbate|colorants?|barwniki|preservatives|środki konserwujące|konserwanty|ci\s*\d{4,5})$/i;

function isPureFillerIngredient(rawIng = '') {
    const clean = String(rawIng || '')
        .replace(/^(?:środki\s+konserwujące|konserwant(?:y)?|preservative(?:s)?|zawiera|contains|contiene)\s*[:(]?\s*/i, '')
        .replace(/[()[\]]+/g, '')
        .trim()
        .toLowerCase();
    if (!clean) return true;
    if (MARKETING_FILLER_ITEM_REGEX.test(clean)) return true;
    // Kompozycja zapachowa (Parfum) sama w sobie jest wartością marketingową (nawet jeśli na etykiecie ma w nawiasie listę alergenów)
    if (/\b(?:parfum|perfumes|fragrance|aroma|kompozycj[aęi]\s+zapachow)/i.test(clean)) return false;
    return FRAGRANCE_ALLERGEN_MOLECULES.some(m => clean === m || clean.includes(m));
}

function isFabricSoftenerProduct({ productName = '', category = '', line = '', visionFeatures = {}, features = {}, contextStr = '' } = {}) {
    const merged = `${productName} ${category} ${line} ${visionFeatures?.['Przeznaczenie (Front)'] || ''} ${features?.['Rodzaj'] || ''} ${features?.['Typ'] || ''} ${contextStr}`.trim();
    const isSoftener = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin|płukania\s+tkanin)/i.test(merged);
    const isWashDetergent = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+prania|żel[a-ząćęłńóśźż]*\s+do\s+prania|prosz[a-ząćęłńóśźż]*\s+do\s+prania|kapsułk[a-ząćęłńóśźż]*\s+do\s+prania|2w1|2\s*in\s*1|detersivo)/i.test(`${productName} ${category}`);
    return Boolean(isSoftener && !isWashDetergent);
}

function resolveSection3HeadingAndLead({ isChemical = false, isFabricSoftener = false, presetIdx = 0 } = {}) {
    const idx = Number(presetIdx || 0);
    if (isFabricSoftener) {
        const softenerHeadings = [
            '<h2>⚙️ Jak działa formuła zmiękczająca tkaniny</h2>',
            '<h2>⚙️ Składniki pielęgnujące włókna i profil zapachu</h2>',
            '<h2>⚙️ Formuła zmiękczająca oraz komfort prasowania</h2>',
            '<h2>⚙️ Co odpowiada za miękkość i świeżość tkanin</h2>',
            '<h2>⚙️ Skład funkcyjny koncentratu do płukania</h2>',
            '<h2>⚙️ Działanie formuły na włókna tekstylne</h2>'
        ];
        const softenerLeads = [
            '<p>Skoncentrowana formuła do płukania dba o <b>miękkość włókien, łatwiejsze prasowanie oraz przyjemny zapach ubrań</b> po każdym cyklu:</p>',
            '<p>Poniższe zestawienie wyjaśnia, które składniki aktywne odpowiadają za <b>gładkość tekstyliów i komfort ich codziennego noszenia</b>:</p>',
            '<p>Receptura koncentratu została skomponowana z myślą o <b>pielęgnacji włókien i trwałym odświeżeniu wypranej odzieży</b>:</p>',
            '<p>Kluczowe składniki formuły pracują podczas płukania, zapewniając <b>sprężystość i delikatność tkanin</b> po wysuszeniu:</p>'
        ];
        return {
            heading: idx > 0 ? softenerHeadings[idx % softenerHeadings.length] : softenerHeadings[0],
            introP: idx > 0 ? softenerLeads[idx % softenerLeads.length] : softenerLeads[0]
        };
    }

    const chemHeadings = [
        '<h2>⚙️ Składniki aktywne i działanie formuły</h2>',
        '<h2>⚙️ Budowa formuły i działanie poszczególnych składników</h2>',
        '<h2>⚙️ Związki aktywne odpowiedzialne za skuteczność czyszczenia</h2>',
        '<h2>⚙️ Jak składniki aktywne usuwają zabrudzenia i osady</h2>',
        '<h2>⚙️ Skład funkcyjny i profil działania receptury</h2>',
        '<h2>⚙️ Rola kluczowych komponentów w działaniu środka</h2>'
    ];
    const chemLeads = [
        '<p>Formuła łączy <b>składniki aktywne o sprawdzonym działaniu użytkowym</b>, z których każdy odpowiada za konkretny etap czyszczenia:</p>',
        '<p>Poniższe zestawienie wyjaśnia, jaką rolę w działaniu użytkowym pełnią <b>główne związki czynne</b> zawarte w formule preparatu:</p>',
        '<p>Skuteczność myjącą wyrobu buduje <b>połączenie surfaktantów i substancji wspomagających</b>, pracujących wspólnie na powierzchni zastosowania:</p>',
        '<p>Każdy z kluczowych składników receptury spełnia <b>określoną funkcję użytkową</b> podczas usuwania osadów oraz codziennych zanieczyszczeń:</p>'
    ];
    const cosmHeadings = [
        '<h2>⚙️ Składniki aktywne i mechanizm działania formuły</h2>',
        '<h2>⚙️ Kompozycja składników pielęgnacyjnych i ich rola</h2>',
        '<h2>⚙️ Jak działają kluczowe składniki z listy INCI</h2>',
        '<h2>⚙️ Aktywne komponenty formuły i komfort pielęgnacji</h2>',
        '<h2>⚙️ Profil składników myjących i kondycjonujących</h2>',
        '<h2>⚙️ Analiza składników funkcyjnych zawartych w kosmetyku</h2>'
    ];
    const cosmLeads = [
        '<p>Formuła kosmetyku łączy <b>składniki oczyszczające, nawilżające oraz kondycjonujące</b>, które współpracują ze sobą dla zachowania równowagi hydrolipidowej i wysokiego komfortu aplikacji:</p>',
        '<p>Zestawienie wyjaśnia znaczenie <b>najważniejszych substancji ze składu INCI</b> w codziennej pielęgnacji oraz utrzymaniu komfortu skóry:</p>',
        '<p>Działanie produktu opiera się na <b>zrównoważonej bazie myjącej i dodatkach pielęgnacyjnych</b> dobranych z myślą o łagodnym oczyszczaniu:</p>',
        '<p>Wewnątrz receptury wykorzystano <b>składniki odpowiadające zarówno za oczyszczanie, jak i pielęgnacyjne wygładzenie</b> naskórka:</p>'
    ];

    const headingList = isChemical ? chemHeadings : cosmHeadings;
    const leadList = isChemical ? chemLeads : cosmLeads;
    return {
        heading: idx > 0 ? headingList[idx % headingList.length] : headingList[0],
        introP: idx > 0 ? leadList[idx % leadList.length] : leadList[0]
    };
}

module.exports = {
    CANONICAL_ACRONYMS,
    POLISH_CONNECTOR_WORDS,
    isNoRinseFormula,
    hasDeclaredOdorNeutralizer,
    detectRawCatalogNameLeak,
    FRAGRANCE_ALLERGEN_MOLECULES,
    FILLER_OR_PRESERVATIVE_HEADINGS_REGEX,
    isPureFillerIngredient,
    isFabricSoftenerProduct,
    resolveSection3HeadingAndLead
};
