const fs = require('fs');
const path = require('path');
const { classifyProductPhysicalForm } = require('./product-form.classifier');
const { sanitizeOfferTitle, resolveCanonicalProductName, isNoRinseFormula } = require('./deterministic-pipeline.engine');

const CACHE_FILE_PATH = path.join(__dirname, '..', 'data', 'google_suggest_faq_cache.json');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

/**
 * Lista znanych marek konkurencyjnych i detalistów, które należy odfiltrować z surowych podpowiedzi Google,
 * jeśli nie są marką aktualnie przetwarzanego produktu.
 */
const THIRD_PARTY_BRANDS_AND_RETAILERS = [
    'ariel', 'persil', 'perwoll', 'woolite', 'coccolino', 'lenor', 'bryza', 'purox', 'domol', 'wirek',
    'kłębuszek', 'klebuszek', 'vizir', 'lovela', 'bobo', 'jelen', 'jeleń', 'dove', 'palmolive', 'nivea',
    'lensil', 'proszek e', 'prania e ', 'jest zdrowe', 'jest żrące',
    'ziaja', 'garnier', 'loreal', 'l\'oreal', 'head & shoulders', 'pantene', 'syoss', 'gliss', 'elseve',
    'ajax', 'ludwik', 'fairy', 'pur', 'finish', 'somat', 'calgon', 'vanish', 'dr beckmann', 'pronto',
    'sidolux', 'domestos', 'bref', 'harpic', 'tytan', 'clin', 'meglio', 'frosch', 'gallus', 'savo',
    'cif', 'chanteclair', 'chante clair', 'tesori', 'felce azzurra', 'borotalco', 'spuma di sciampagna',
    'omino bianco', 'quasar', 'winni', 'amuchina', 'ace', 'dash', 'soft', 'dixan', 'vernel', 'coccolatevi',
    'neutro roberts', 'intesa', 'malizia', 'bilboa', 'prep', 'marvis', 'pasta del capitano', 'biorepair',
    'elmex', 'meridol', 'colgate', 'sensodyne', 'lacalut', 'blend-a-med', 'oral-b', 'curaprox', 'listerine',
    // Detaliści i portale ogłoszeniowe / śmieciowe zapytania
    'biedronka', 'rossmann', 'lidl', 'hebe', 'pepco', 'action', 'dealz', 'kaufland', 'auchan', 'carrefour',
    'dino', 'żabka', 'zabka', 'media expert', 'empik', 'allegro', 'ceneo', 'olx', 'wizaz', 'wizaż',
    'karta charakterystyki', 'sds', 'msds', 'krzyżówka', 'krzyzowka', 'jak zrobić', 'jak zrobic',
    'domowy', 'samemu', 'cena', 'promocja', 'gdzie kupić', 'gdzie kupic', 'opinie', 'forum', 'odpowiednik'
];

/**
 * Zakazane słowa biobójcze, medyczne i superlatywy Allegro, które nie mogą trafić z Google Suggest do pytań.
 */
const PROHIBITED_SUGGEST_TERMS_REGEX = /\b(?:dezynfekuj[a-ząćęłńóśźż]*|odkaża[a-ząćęłńóśźż]*|sterylizuj[a-ząćęłńóśźż]*|bakteri[a-ząćęłńóśźż]*|wirus[a-ząćęłńóśźż]*|zarazk[a-ząćęłńóśźż]*|grzyb[a-ząćęłńóśźż]*|pleś[ńn][a-ząćęłńóśźż]*|biobójcz[a-ząćęłńóśźż]*|lecz[a-ząćęłńóśźż]*|łuszczyc[a-ząćęłńóśźż]*|egzem[a-ząćęłńóśźż]*|trądzik[a-ząćęłńóśźż]*|100\s*%|99[.,]9\s*%|najlepsz[a-ząćęłńóśźż]*|najtańsz[a-ząćęłńóśźż]*|szkodliw[a-ząćęłńóśźż]*|trując[a-ząćęłńóśźż]*|rakotwórcz[a-ząćęłńóśźż]*)\b/i;

function loadSuggestCache() {
    try {
        if (fs.existsSync(CACHE_FILE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
        }
    } catch (err) {
        console.warn('[GoogleSuggestFAQ] Ostrzeżenie odczytu cache:', err.message);
    }
    return {};
}

function saveSuggestCache(cacheObj) {
    try {
        const dir = path.dirname(CACHE_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheObj, null, 2), 'utf8');
    } catch (err) {
        console.warn('[GoogleSuggestFAQ] Ostrzeżenie zapisu cache:', err.message);
    }
}

/**
 * Wykrywa kanoniczną frazę kategorii konsumenckiej po polsku (taką, jaką klienci wpisują w pasek Google).
 */
function detectCanonicalSearchCategory({ productName = '', category = '', visionFeatures = {}, features = {}, isChemical = false, inci = '', detergentComposition = '' } = {}) {
    const combined = [
        productName,
        category,
        visionFeatures?.['Przeznaczenie (Front)'],
        visionFeatures?.['Postać'],
        features?.['Postać'],
        features?.['Rodzaj'],
        features?.['Typ'],
        features?.['Zastosowanie']
    ].filter(Boolean).join(' ').toLowerCase();

    const physicalForm = classifyProductPhysicalForm({
        productName,
        category,
        visionFeatures,
        features,
        inci,
        detergentComposition
    });

    if (/(mleczko\s+do\s+czyszczenia|mleczko\s+czyszczące|mleczko\s+cif|crema\s+pulente)/i.test(combined)) {
        return { key: 'scouring_cream', labelPl: 'mleczko do czyszczenia', group: 'SURFACE_CLEANER' };
    }
    if (/(odtłuszczacz|odtluszczacz|sgrassatore)/i.test(combined)) {
        return { key: 'degreaser', labelPl: 'odtłuszczacz uniwersalny', group: 'SURFACE_CLEANER' };
    }
    if (/(odkamieniacz|anticalcare|kamie[ńn]\s+i\s+rdz)/i.test(combined)) {
        return { key: 'descaler', labelPl: 'odkamieniacz do łazienki i armatury', group: 'SURFACE_CLEANER' };
    }
    if (/(płyn\s+do\s+wc|żel\s+do\s+wc|kostk[ai]\s+do\s+wc|toalet)/i.test(combined)) {
        return { key: 'wc_cleaner', labelPl: 'żel do czyszczenia WC', group: 'SURFACE_CLEANER' };
    }
    if (/(do\s+łazienek|do\s+łazienki|do\s+lazienek|do\s+lazienki|łazienkow|lazienkow|powierzchni\s+sanitarnych|sanitar|bagno)/i.test(combined) && !/(kuchni|cucina)/i.test(combined)) {
        return { key: 'bathroom_cleaner', labelPl: 'środek do czyszczenia łazienki i sanitariatów', group: 'SURFACE_CLEANER' };
    }
    if (/(do\s+kuchni|kuchenn|cucina|piekarnik|grill)/i.test(combined) && !/(łazienk|lazienk|bagno)/i.test(combined)) {
        return { key: 'kitchen_cleaner', labelPl: 'środek do czyszczenia kuchni', group: 'SURFACE_CLEANER' };
    }
    if (/(płyn\s+do\s+podłóg|plyn\s+do\s+podlog|pavimenti)/i.test(combined)) {
        return { key: 'floor_cleaner', labelPl: 'płyn do mycia podłóg', group: 'SURFACE_CLEANER' };
    }
    if (/(płyn\s+do\s+szyb|plyn\s+do\s+szyb|luster|vetri)/i.test(combined)) {
        return { key: 'glass_cleaner', labelPl: 'płyn do mycia szyb i luster', group: 'SURFACE_CLEANER' };
    }
    if (/(płyn\s+do\s+naczyń|plyn\s+do\s+naczyn|piatti)/i.test(combined)) {
        return { key: 'dish_soap', labelPl: 'płyn do mycia naczyń', group: 'DISH_CLEANER' };
    }
    if (/(proszek\s+do\s+prania|fustino|polvere\s+lavatrice)/i.test(combined)) {
        return { key: 'laundry_powder', labelPl: 'proszek do prania', group: 'LAUNDRY' };
    }
    if (/(kapsułk[ai]\s+do\s+prania|caps|pods|pacs)/i.test(combined)) {
        return { key: 'laundry_capsules', labelPl: 'kapsułki do prania', group: 'LAUNDRY' };
    }
    if (/(perfumy\s+do\s+prania|profumo\s+bucato|eliksir\s+do\s+prania)/i.test(combined)) {
        return { key: 'laundry_perfume', labelPl: 'perfumy do prania', group: 'LAUNDRY' };
    }
    if (/(płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin)/i.test(combined)) {
        return { key: 'fabric_softener', labelPl: 'płyn do płukania tkanin', group: 'LAUNDRY' };
    }
    if (/(płyn\s+do\s+prania|plyn\s+do\s+prania|żel\s+do\s+prania|zel\s+do\s+prania|detergent\s+do\s+prania|lavatrice|bucato)/i.test(combined)) {
        return { key: 'laundry_liquid', labelPl: 'płyn do prania', group: 'LAUNDRY' };
    }
    if (/(odplamiacz|smacchiatore)/i.test(combined)) {
        return { key: 'stain_remover', labelPl: 'odplamiacz do tkanin', group: 'LAUNDRY' };
    }
    if (/(środek\s+wielofunkcyjny|spray\s+do\s+czyszczenia|kuchni|łazienk|candeggina|wybielacz|czyszczenia\s+powierzchni)/i.test(combined) || isChemical) {
        return { key: 'multipurpose_cleaner', labelPl: 'środek do czyszczenia powierzchni', group: 'SURFACE_CLEANER' };
    }
    if (/(szczoteczk[ai]\s+do\s+zębów|toothbrush)/i.test(combined)) {
        return { key: 'toothbrush', labelPl: 'szczoteczka do zębów', group: 'ORAL_CARE' };
    }
    if (/(pasta\s+do\s+zębów|dentifricio|toothpaste)/i.test(combined)) {
        return { key: 'toothpaste', labelPl: 'pasta do zębów', group: 'ORAL_CARE' };
    }
    if (/(płyn\s+do\s+płukania\s+jamy\s+ustnej|collutorio|mouthwash)/i.test(combined)) {
        return { key: 'mouthwash', labelPl: 'płyn do płukania jamy ustnej', group: 'ORAL_CARE' };
    }
    if (/(dezodorant|antyperspirant|roll-on|deodorante)/i.test(combined)) {
        return { key: 'deodorant', labelPl: 'dezodorant', group: 'BODY_CARE', physicalForm };
    }
    if (/(mydło|mydlo|sapone)/i.test(combined)) {
        return { key: 'soap', labelPl: 'mydło do rąk i ciała', group: 'BODY_CARE', physicalForm };
    }
    if (/(żel\s+pod\s+prysznic|zel\s+pod\s+prysznic|płyn\s+do\s+kąpieli|bagnodoccia|docciaschiuma|bagnoschiuma)/i.test(combined)) {
        return { key: 'shower_gel', labelPl: 'żel pod prysznic i płyn do kąpieli', group: 'BODY_CARE', physicalForm };
    }
    if (/(szampon|shampoo)/i.test(combined)) {
        return { key: 'shampoo', labelPl: 'szampon do włosów', group: 'HAIR_CARE', physicalForm };
    }
    if (/(odżywk[ai]\s+do\s+włosów|maska\s+do\s+włosów|balsamo\s+capelli)/i.test(combined)) {
        return { key: 'hair_conditioner', labelPl: 'odżywka do włosów', group: 'HAIR_CARE', physicalForm };
    }
    if (/(krem\s+do\s+rąk|krem\s+do\s+twarzy|balsam\s+do\s+ciała|mleczko\s+do\s+ciała|crema\s+corpo|crema\s+mani)/i.test(combined)) {
        return { key: 'body_cream', labelPl: 'balsam i krem pielęgnacyjny', group: 'BODY_CARE', physicalForm };
    }
    if (physicalForm.isDryPowder && /(talk|puder\s+do\s+ciała|talco)/i.test(combined)) {
        return { key: 'talcum_powder', labelPl: 'talk kosmetyczny do ciała', group: 'BODY_CARE', physicalForm };
    }

    return { key: 'general_cosmetic', labelPl: 'kosmetyk pielęgnacyjny', group: 'BODY_CARE', physicalForm };
}

/**
 * Buduje naturalną, czytelnie odmienioną polską nazwę produktu (bez WIELKICH LITER z katalogu ERP i bez literówek).
 */
function formatNaturalProductName(productName = '', brand = '', capacity = '', options = {}) {
    const baseSource = options?.canonicalName && String(options.canonicalName).trim()
        ? String(options.canonicalName).trim()
        : String(productName || '').trim();
    if (!baseSource) return brand || 'ten produkt';

    let clean = sanitizeOfferTitle(baseSource);

    // Przywrócenie poprawnej wielkiej litery dla marki
    if (brand && typeof brand === 'string' && brand.trim().length > 1) {
        const brandTrim = brand.trim();
        const escapedBrand = brandTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        clean = clean.replace(new RegExp(`\\b${escapedBrand}\\b`, 'gi'), brandTrim);
    }

    clean = clean
        .replace(/\bWC\b/gi, 'WC')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (capacity && !/\b\d+\s*(?:ml|l|g|kg|szt)\b/i.test(clean)) {
        clean = `${clean} ${capacity}`.trim();
    }

    return clean;
}

/**
 * Odmienia przymiotnik lub rzeczownik zapachowy do poprawnej polszczyzny (eliminuje kalkę "w wariancie zapachowym cytrynowy" -> "o zapachu cytrynowym").
 */
function formatPolishScentPhrase(rawScent = '') {
    const s = String(rawScent || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (!s || /^(brak|neutralny|bezzapachowy|classic|classico)$/i.test(s)) return '';
    const lower = s.toLowerCase();

    // 1. Przymiotniki zakończone na -y (np. cytrynowy, świeży, cytrusowy, lawendowy, leśny, sosnowy, itp.)
    if (/^[a-ząćęłńóśźż]+y$/i.test(lower)) {
        return `o zapachu ${lower.replace(/y$/i, 'ym')}`;
    }
    // 2. Przymiotniki zakończone na -i (np. morski, niebieski, rześki)
    if (/^[a-ząćęłńóśźż]+i$/i.test(lower)) {
        return `o zapachu ${lower.replace(/i$/i, 'im')}`;
    }
    // 3. Rzeczowniki rodzaju żeńskiego na -a (np. cytryna -> o zapachu cytryny, lawenda -> o zapachu lawendy, wanilia -> o zapachu wanilii)
    if (/^[a-ząćęłńóśźż]+a$/i.test(lower)) {
        if (/ia$/i.test(lower)) return `o zapachu ${lower.replace(/ia$/i, 'ii')}`;
        if (/[k|g]a$/i.test(lower)) return `o zapachu ${lower.replace(/a$/i, 'i')}`;
        return `o zapachu ${lower.replace(/a$/i, 'y')}`;
    }
    // 4. Rzeczowniki męskie / ogólne / złożone (np. eukaliptus, jaśmin, drzewo sandałowe)
    return `o zapachu ${lower}`;
}

/**
 * Odpytuje oficjalny endpoint Google Autocomplete (suggestqueries.google.com) z twardym timeoutem.
 */
async function fetchGoogleAutocompleteSingle(query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pl&gl=pl&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.[1]) ? data[1] : [];
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Filtruje surowe podpowiedzi Google: odrzuca sklepy, ceny, obce marki, zwroty zakazane przez Allegro i BPR.
 */
function filterAndCleanGoogleSuggestions(rawSuggestions = [], currentBrand = '') {
    const brandLower = String(currentBrand || '').toLowerCase().trim();
    const brandTokens = brandLower.split(/\s+/).filter(t => t.length >= 3);

    const cleaned = [];
    const seen = new Set();

    for (const raw of rawSuggestions) {
        if (!raw || typeof raw !== 'string') continue;
        const s = raw.trim().toLowerCase();
        if (s.length < 10 || s.length > 110) continue;

        // Odrzucenie zwrotów zakazanych przez Allegro / BPR / prawo kosmetyczne
        if (PROHIBITED_SUGGEST_TERMS_REGEX.test(s)) continue;

        // Odrzucenie obcych marek i detalistów
        let hasForeignBrandOrRetailer = false;
        for (const forbidden of THIRD_PARTY_BRANDS_AND_RETAILERS) {
            if (brandLower && (brandLower.includes(forbidden) || forbidden.includes(brandLower) || brandTokens.includes(forbidden))) {
                continue; // To marka naszego produktu (np. Cif, Chanteclair, Soft, Tesori)
            }
            const regex = new RegExp(`(?:^|\\s)${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`, 'i');
            if (regex.test(s)) {
                hasForeignBrandOrRetailer = true;
                break;
            }
        }
        if (hasForeignBrandOrRetailer) continue;

        if (!seen.has(s)) {
            seen.add(s);
            cleaned.push(s);
        }
    }

    return cleaned.slice(0, 12);
}

/**
 * Buduje 4-filarową matrycę pytań wyszukiwarkowych (Google Search + AI Shopping Agents: ChatGPT, Perplexity, Google AI Overviews, Allegro)
 * dopasowaną 1:1 do konkretnego produktu, jego składników i cech z frontu opakowania.
 */
function buildFourPillarQuestions({
    catInfo,
    naturalName,
    brand = '',
    capacity = '',
    scent = '',
    visionFeatures = {},
    features = {},
    inci = '',
    detergentComposition = '',
    googleSuggestions = [],
    variantIndex = 0
} = {}) {
    const combinedInci = `${inci || ''} ${detergentComposition || ''} ${JSON.stringify(visionFeatures || {})}`.toLowerCase();
    const hasBleach = /(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|wybielacz)/i.test(combinedInci + ' ' + naturalName);
    const hasAcid = /(citric\s+acid|kwas\s+cytrynowy|sulfamic|amidosulfonow|formic|mrówkow|phosphoric|fosforow|hydrochloric|solny|lactic|mlekow|acetic|octow|anticalcare|odkamieniacz)/i.test(combinedInci + ' ' + naturalName);
    const hasOpticalBrighteners = /(optical\s+brightener|fluorescent\s+brightener|rozjaśniacz)/i.test(combinedInci);
    const hasAluminum = /(aluminum\s+chlorohydrate|aluminum\s+sesquichlorohydrate|sole\s+aluminium)/i.test(combinedInci);
    const noRinse = isNoRinseFormula({ productName: naturalName, visionFeatures, features });
    const frontPurpose = visionFeatures?.['Przeznaczenie (Front)'] || '';
    const frontWashCount = visionFeatures?.['Wydajność'] || '';
    const cleanScent = String(scent || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
    const scentPhrase = formatPolishScentPhrase(cleanScent);
    const shortBrandRef = brand ? `preparat ${brand}` : 'ten preparat';
    const altVariant = Math.abs(Number(variantIndex) || 0) % 4;
    const isWcSpecific = catInfo.key === 'wc_cleaner';
    const isBathroomSpecific = catInfo.key === 'bathroom_cleaner' ||
        (/(łazienk|lazienk|sanitar|bagno)/i.test(`${naturalName} ${frontPurpose}`) && !isWcSpecific && !/(kuchni|cucina)/i.test(`${naturalName} ${frontPurpose}`));
    const isKitchenSpecific = catInfo.key === 'kitchen_cleaner' ||
        (/(kuchni|kuchenn|cucina|piekarnik|grill)/i.test(`${naturalName} ${frontPurpose}`) && !/(łazienk|lazienk|bagno)/i.test(`${naturalName} ${frontPurpose}`));

    const pickVariant = (v0, v1, v2, v3) => {
        if (altVariant === 1 && v1) return v1;
        if (altVariant === 2 && v2) return v2;
        if (altVariant === 3 && v3) return v3;
        return v0;
    };

    const questions = [];

    if (catInfo.group === 'LAUNDRY') {
        if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            questions.push(pickVariant(
                scentPhrase
                    ? `Jak ${naturalName} zmiękcza tkaniny i na czym polega profil zapachowy ${scentPhrase.replace(/^o\s+/i, '')}?`
                    : `Jak ${naturalName} zmiękcza tkaniny i ułatwia codzienne prasowanie ubrań?`,
                scentPhrase
                    ? `W jaki sposób ${naturalName} pielęgnuje włókna podczas płukania i utrwala świeżość ${scentPhrase}?`
                    : `W jaki sposób ${naturalName} pielęgnuje włókna podczas płukania i nadaje ubraniom świeżość?`,
                `Dlaczego ${naturalName} poprawia miękkość tekstyliów i zapobiega ich elektryzowaniu?`,
                `Jakie właściwości użytkowe ma ${naturalName} podczas płukania domowej odzieży i ręczników?`
            ));
        } else if (scentPhrase) {
            questions.push(pickVariant(
                `Jak ${naturalName} usuwa zabrudzenia w praniu i jak utrzymuje się świeżość ${scentPhrase}?`,
                `W jaki sposób ${naturalName} pielęgnuje włókna podczas prania ${scentPhrase}?`,
                `Dlaczego ${naturalName} sprawdza się w codziennym praniu i chroni kolory oraz świeżość tkanin?`,
                `Jakie właściwości użytkowe ma ${naturalName} w codziennej pielęgnacji pranych ubrań?`
            ));
        } else {
            questions.push(pickVariant(
                `Co sprawia, że ${naturalName} skutecznie usuwa plamy już w niskich temperaturach i zapewnia długotrwałą świeżość prania?`,
                `W jakich temperaturach prania działa ${naturalName} i jak radzi sobie z codziennymi zabrudzeniami tkanin?`,
                `Jakie rodzaje zabrudzeń usuwa ${naturalName} w cyklu prania automatycznego oraz ręcznego?`,
                `Co wyróżnia działanie użytkowe formuły ${naturalName} przy regularnym praniu ubrań?`
            ));
        }

        if (catInfo.key === 'laundry_powder') {
            questions.push(pickVariant(
                `Jak prawidłowo stosować i dozować ten proszek do prania w pralce automatycznej oraz podczas prania ręcznego?`,
                `Ile proszku odmierzyć do pralki w zależności od stopnia zabrudzenia i twardości wody?`,
                `Do której komory szuflady pralki wsypać ten proszek i jak przygotować roztwór do namaczania?`,
                `Jak dobrać dawkę tego proszku przy pełnym wsadzie bębna oraz praniu ręcznym?`
            ));
        } else if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            questions.push(pickVariant(
                `Jak dozować ${shortBrandRef} do przegródki pralki, aby uzyskać miękkość tkanin i trwały zapach po wysuszeniu?`,
                `Gdzie wlać ${shortBrandRef} w szufladzie pralki i jaką miarkę stosować na pojedynczy cykl płukania?`,
                `Jaką ilość płynu do płukania odmierzyć na standardowy załadunek, aby nie przeciążyć włókien?`,
                `Czy ${shortBrandRef} nadaje się także do ostatniego płukania podczas prania ręcznego i w jakiej ilości?`
            ));
        } else {
            questions.push(pickVariant(
                `Jak prawidłowo dozować ten detergent – do szuflady pralki czy bezpośrednio do bębna?`,
                `Jaką dawkę płynu dobrać na pojedyncze pranie i gdzie wlać preparat przed uruchomieniem programu?`,
                `Jak dostosować ilość detergentu do poziomu zabrudzenia ubrań oraz objętości bębna?`,
                `W jaki sposób poprawnie aplikować ten środek do prania w programach krótkich i standardowych?`
            ));
        }

        if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            questions.push(pickVariant(
                `Do jakich rodzajów tkanin nadaje się ${shortBrandRef} i jak wpływa na miękkość oraz ułatwianie prasowania ubrań?`,
                `Czy po użyciu ${shortBrandRef} włókna łatwiej się rozprostowują podczas suszenia i prasowania?`,
                `Jakie materiały można płukać z użyciem tej formuły, a przy jakich tkaninach funkcyjnych lepiej zachować ostrożność?`,
                `Do jakich ubrań i tekstyliów domowych sprawdzi się ten koncentrat zmiękczający na etapie płukania?`
            ));
        } else if (hasOpticalBrighteners) {
            questions.push(pickVariant(
                `Do jakich rodzajów tkanin przeznaczony jest ${shortBrandRef} i dlaczego nie należy stosować go do wełny, jedwabiu oraz czarnych ubrań?`,
                `Jakie tkaniny zachowają intensywność bieli przy użyciu ${shortBrandRef}, a jakich delikatnych materiałów należy unikać?`,
                `Dlaczego formuły zawierającej rozjaśniacze nie powinno się używać do czarnej odzieży, wełny i jedwabiu?`,
                `Do jakich wsadów prania najlepiej używać ${shortBrandRef} oraz jakie włókna są wykluczone z etykiety?`
            ));
        } else {
            questions.push(pickVariant(
                `Do jakich rodzajów tkanin i kolorów nadaje się ten środek piorący, a jakich delikatnych włókien (np. wełny lub jedwabiu) należy unikać?`,
                `Jakie materiały można bezpiecznie prać z tym środkiem oraz czy sprawdza się przy praniu codziennej odzieży?`,
                `Do jakiego koloru ubrań przewidziano tę recepturę i jakich tkanin wymagających specjalistycznych płynów nie prać w tym programie?`,
                `Czy ten produkt nadaje się do bawełny i tkanin mieszanych oraz jak chroni włókna wrażliwe?`
            ));
        }

        if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            const rinseCount = frontWashCount ? String(frontWashCount).replace(/pra[ńn]/i, 'płukań') : null;
            if (rinseCount) {
                questions.push(pickVariant(
                    `Na ile cykli płukania wystarcza opakowanie (${rinseCount}) przy standardowym załadunku pralki?`,
                    `Jaką wydajność (${rinseCount}) deklaruje etykieta produktu i od czego zależy rzeczywista liczba płukań?`,
                    `Ile cyklów płukania można wykonać z jednej butelki (${rinseCount}) przy codziennym użytkowaniu?`,
                    `Na jak wiele użyć wystarcza opakowanie o wydajności ${rinseCount}?`
                ));
            } else {
                questions.push(pickVariant(
                    `Jaka jest wydajność opakowania${capacity ? ` ${capacity}` : ''} i jak prawidłowo dozować koncentrat do przegródki na płyn zmiękczający?`,
                    `Jak ekonomicznie korzystać z butelki${capacity ? ` ${capacity}` : ''} przy regularnych cyklach płukania?`,
                    `Jak przechowywać opakowanie${capacity ? ` ${capacity}` : ''}, aby aromat i konsystencja pozostały stabilne do ostatniego użycia?`,
                    `Co wpływa na wydajność produktu${capacity ? ` ${capacity}` : ''} przy różnych twardościach wody?`
                ));
            }
        } else if (frontWashCount) {
            questions.push(pickVariant(
                `Na ile cykli prania wystarcza opakowanie (${frontWashCount}) przy standardowym załadunku pralki?`,
                `Jaką liczbę prań (${frontWashCount}) przewidziano na etykiecie przy typowym wsadzie bębna?`,
                `Jak wydajne jest opakowanie (${frontWashCount}) przy przestrzeganiu zaleceń dozowania?`,
                `Ile standardowych prań wykonasz z jednego opakowania (${frontWashCount})?`
            ));
        } else {
            questions.push(pickVariant(
                `Jaka jest wydajność opakowania${capacity ? ` ${capacity}` : ''} i które składniki aktywne odpowiadają za rozpuszczanie zabrudzeń?`,
                `Na jak długo wystarcza pojemność${capacity ? ` ${capacity}` : ''} oraz jakie surfaktanty budują działanie myjące receptury?`,
                `Jakie składniki odpowiadają za skuteczność prania i jak najlepiej wykorzystać pojemność${capacity ? ` ${capacity}` : ''}?`,
                `Co znajduje się w bazie czyszczącej formuły i jaka jest praktyczna wydajność opakowania${capacity ? ` ${capacity}` : ''}?`
            ));
        }
    } else if (catInfo.group === 'SURFACE_CLEANER' || catInfo.group === 'DISH_CLEANER') {
        if (isWcSpecific) {
            if (hasBleach && !hasAcid) {
                questions.push(pickVariant(
                    `Jakie przebarwienia, zżółknięcia i osady organiczne usuwa ${naturalName} w muszli toaletowej oraz co sprawia, że przywraca ceramice WC higieniczną czystość?`,
                    `Z jakimi osadami organicznymi w muszli klozetowej radzi sobie ${naturalName} bez zawartości kwasów?`,
                    `Jak ${naturalName} oczyszcza wnętrze muszli toaletowej i niweluje zżółknięcia na ceramice sanitarnej?`,
                    `Co sprawia, że ${naturalName} utrzymuje higieniczną czystość wewnątrz muszli WC?`
                ));
            } else {
                questions.push(pickVariant(
                    `Jakie osady i zabrudzenia usuwa ${naturalName} w muszli toaletowej oraz co sprawia, że przywraca ceramice WC higieniczną czystość?`,
                    `W jaki sposób ${naturalName} rozpuszcza zabrudzenia wewnątrz muszli WC i pod jej kołnierzem?`,
                    `Jakie zanieczyszczenia na ceramice toaletowej skutecznie usuwa ${naturalName}?`,
                    `Jak działa formuła ${naturalName} przy czyszczeniu wnętrza muszli klozetowej?`
                ));
            }
        } else if (isBathroomSpecific) {
            questions.push(pickVariant(
                `Jakie osady i zabrudzenia usuwa ${naturalName} w łazience oraz co sprawia, że przywraca ceramice sanitarnej higieniczną czystość?`,
                `Czy ${naturalName} dobrze radzi sobie z zaciekami z wody i nalotem z mydła na powierzchniach łazienkowych?`,
                `Jakie typy codziennych osadów sanitarnych usuwa ${naturalName} bez rysowania ceramiki?`,
                `W czym tkwi skuteczność ${naturalName} przy porządkach w kabinie prysznicowej, na wannie i umywalce?`
            ));
        } else if (isKitchenSpecific) {
            questions.push(pickVariant(
                `Jakie zabrudzenia tłuszczowe i osady usuwa ${naturalName} w kuchni bez pozostawiania smug?`,
                `Jak ${naturalName} rozbija zaschnięty tłuszcz na powierzchniach kuchennych i okapie?`,
                `Z jakimi plamami i zabrudzeniami kuchennymi najlepiej radzi sobie ${naturalName}?`,
                `Czy ${naturalName} pozwala szybko oczyścić powierzchnie kuchenne bez uciążliwego polerowania?`
            ));
        } else if (frontPurpose) {
            const cleanPurpose = String(frontPurpose).replace(/^(?:do\s+)?/i, 'do ').trim();
            questions.push(pickVariant(
                `Jakie zabrudzenia usuwa ${naturalName} w zastosowaniach ${cleanPurpose} i jak działa jego formuła?`,
                `Jak sprawdza się ${naturalName} ${cleanPurpose} i jakie zanieczyszczenia rozpuszcza?`,
                `Co sprawia, że ${naturalName} skutecznie czyści powierzchnie ${cleanPurpose}?`,
                `Jak działa kompozycja składników w ${naturalName} przy zadaniach ${cleanPurpose}?`
            ));
        } else {
            questions.push(pickVariant(
                `Jakie zabrudzenia usuwa ${naturalName} i jak działa jego aktywna formuła czyszcząca?`,
                `Do jakich codziennych zadań porządkowych przeznaczony jest ${naturalName} i jak rozbija brud?`,
                `W jaki sposób aktywna baza ${naturalName} usuwa plamy, osady i naloty z powierzchni?`,
                `Co wyróżnia działanie użytkowe produktu ${naturalName} podczas domowego sprzątania?`
            ));
        }

        if (catInfo.key === 'scouring_cream') {
            questions.push(pickVariant(
                `Czy to mleczko czyszczące rysuje powierzchnie i na jakich materiałach można je bezpiecznie stosować?`,
                `Jak dobrać miękką gąbkę lub ściereczkę do tego mleczka, aby bezpiecznie czyścić emalię i ceramikę bez zarysowań?`,
                `Na jakich powierzchniach sprawdza się to mleczko z mikrocząsteczkami, a jakich delikatnych tworzyw unikać?`,
                `Jak bezpiecznie testować i stosować mleczko czyszczące na powierzchniach gładkich?`
            ));
        } else if (hasBleach) {
            questions.push(pickVariant(
                `Do jakich powierzchni nadaje się ten preparat z aktywnym wybielaczem, a dlaczego nie wolno stosować go na armaturze chromowanej, metalach, drewnie, marmurze ani na jakichkolwiek tkaninach?`,
                `Jakich materiałów nie należy czyścić tym środkiem zawierającym podchloryn sodu (armatura, metale, tekstylia, kamień naturalny)?`,
                `Gdzie wolno bezpiecznie aplikować ten preparat z aktywnym chlorem, a przed czym chronić metal, drewno i ubrania?`,
                `Dlaczego w przypadku tego środka z wybielaczem należy omijać baterie łazienkowe, aluminium i tkaniny?`
            ));
        } else if (catInfo.key === 'descaler') {
            questions.push(pickVariant(
                `Czy ${shortBrandRef} skutecznie usuwa kamień wodny oraz osady z mydła i na jakich powierzchniach kwasowrażliwych (np. marmur, wapień) nie należy go stosować?`,
                `Które powierzchnie odporne można bezpiecznie odkamieniać tym środkiem, a dlaczego marmur i wapień są wykluczone?`,
                `Jak bezpiecznie stosować ten odkamieniacz w łazience i czego bezwzględnie omijać ze względu na kwasową recepturę?`,
                `Jakiego kontaktu z kamieniem naturalnym, aluminium i uszkodzoną emalią należy unikać podczas używania ${shortBrandRef}?`
            ));
        } else if (frontPurpose) {
            questions.push(pickVariant(
                `Do jakich elementów i powierzchni przeznaczony jest ${shortBrandRef} oraz jakich materiałów i podzespołów należy unikać podczas czyszczenia?`,
                `Jakie materiały domowe tolerują aplikację tego środka, a kiedy warto zachować ostrożność?`,
                `Gdzie najlepiej wykorzystać ${shortBrandRef}, aby uzyskać czystą powierzchnię bez uszkodzenia podłoża?`,
                `Które powierzchnie w domu można myć tym środkiem zgodnie z etykietą producenta?`
            ));
        } else {
            questions.push(pickVariant(
                `Do jakich powierzchni przeznaczony jest ${shortBrandRef} i na jakich delikatnych materiałach należy zachować ostrożność?`,
                `Na jakich powierzchniach zmywalnych sprawdzi się ${shortBrandRef} i gdzie warto zrobić próbę na mało widocznym fragmencie?`,
                `Czy ten środek nadaje się do codziennych zmywalnych powierzchni i jakich tworzyw unikać?`,
                `Jak dopasować powierzchnię do działania ${shortBrandRef}, aby zachować estetykę czyszczonych elementów?`
            ));
        }

        if (isWcSpecific) {
            questions.push(pickVariant(
                `Jak prawidłowo aplikować i spłukiwać ${shortBrandRef} pod obrzeżem muszli toaletowej oraz pod linią wody, aby uzyskać higieniczną czystość?`,
                `Jak długo pozostawić preparat w muszli klozetowej przed spłukaniem i wyszczotkowaniem?`,
                `W jaki sposób nanieść produkt w trudno dostępne miejsce pod kołnierzem muszli WC?`,
                `Jak przebiega prawidłowy schemat aplikacji w toalecie krok po kroku zgodnie z etykietą?`
            ));
        } else if (isBathroomSpecific) {
            const formWord = catInfo.physicalForm?.formAccusativePl || classifyProductPhysicalForm({
                productName: naturalName,
                postac: visionFeatures?.['Postać'],
                dozownik: visionFeatures?.['Dozownik']
            }).formAccusativePl || 'ten preparat';
            if (noRinse) {
                questions.push(pickVariant(
                    `Czy ${shortBrandRef} wymaga spłukiwania wodą po czyszczeniu ceramiki sanitarnej, wanny i umywalki?`,
                    `Jak prawidłowo aplikować i przecierać ${formWord} o formule bez spłukiwania, aby uniknąć smug?`,
                    `Jak używać ${formWord} bez spłukiwania w kabinie prysznicowej i na armaturze łazienkowej?`,
                    `Na czym polega szybka aplikacja bez spłukiwania wodą przy użyciu ${shortBrandRef}?`
                ));
            } else {
                questions.push(pickVariant(
                    `Jak prawidłowo aplikować i spłukiwać ${formWord} na ceramice sanitarnej, wannach, umywalkach oraz fugach, aby uzyskać czystość bez zacieków?`,
                    `Po jakim czasie zmyć wodą ${formWord} z powierzchni wanny, umywalki i glazury, aby nie pozostały smugi?`,
                    `Jak używać ${formWord} podczas mycia kabiny prysznicowej i ceramiki sanitarnej dla szybkiego efektu bez smug?`,
                    `Jaki jest zalecany czas kontaktu przed spłukaniem, gdy nakładasz ${formWord} w łazience?`
                ));
            }
        } else if (noRinse) {
            questions.push(pickVariant(
                `Czy ${shortBrandRef} wymaga spłukiwania wodą po zastosowaniu na zmywalnej powierzchni?`,
                `Jak prawidłowo rozpylić i przetrzeć ${shortBrandRef} bez spłukiwania, aby uniknąć smug?`,
                `Jak działa formuła bez spłukiwania w ${shortBrandRef} przy codziennym sprzątaniu?`,
                `W jaki sposób wykończyć czyszczenie za pomocą ${shortBrandRef} bez konieczności spłukiwania wodą?`
            ));
        } else {
            questions.push(pickVariant(
                `Jak prawidłowo aplikować i zmywać ${shortBrandRef}, aby szybko usunąć zabrudzenia oraz osady bez zacieków?`,
                `Czy po aplikacji środka wystarczy przetrzeć powierzchnię wilgotną ściereczką i wytrzeć do sucha?`,
                `Jak aplikować produkt na pionowe oraz poziome powierzchnie zmywalne zgodnie z etykietą?`,
                `W jakiej kolejności nanieść i zmyć preparat, aby powierzchnia pozostała czysta i bez smug?`
            ));
        }

        questions.push(pickVariant(
            `Jakie składniki aktywne odpowiadają za działanie formuły i jak wydajne jest opakowanie${capacity ? ` ${capacity}` : ''}?`,
            `Które związki czynne w składzie budują siłę czyszczącą oraz na jak długo wystarcza pojemność${capacity ? ` ${capacity}` : ''}?`,
            `Co odpowiada za rozpuszczanie brudu i jaka jest praktyczna wydajność opakowania${capacity ? ` ${capacity}` : ''}?`,
            `Jak przechowywać opakowanie${capacity ? ` ${capacity}` : ''} i jakie kluczowe składniki pracują podczas czyszczenia?`
        ));
    } else if (catInfo.group === 'ORAL_CARE') {
        questions.push(pickVariant(
            `Jakie korzyści w codziennej higienie jamy ustnej i ochronie szkliwa zapewnia ${naturalName}?`,
            `W jaki sposób ${naturalName} wspiera codzienną higienę jamy ustnej i uczucie czystości zębów?`,
            `Co wyróżnia stosowanie ${naturalName} w porannej i wieczornej rutynie mycia zębów?`,
            `Jakie funkcje higieniczne spełnia ${naturalName} podczas codziennego szczotkowania i pielęgnacji?`
        ));
        questions.push(pickVariant(
            `Jak prawidłowo stosować ten produkt podczas codziennego mycia zębów, aby zadbać o dziąsła i świeży oddech?`,
            `Na jakie nawyki i czas szczotkowania zwrócić uwagę przy codziennym używaniu tego artykułu higienicznego?`,
            `Jak włączyć ten produkt do codziennej higieny jamy ustnej, aby skutecznie usuwać osad nazębny?`,
            `W jaki sposób aplikować produkt podczas rutynowego mycia zębów?`
        ));
        questions.push(pickVariant(
            `Dla kogo przeznaczony jest ${shortBrandRef} i czy sprawdza się przy wrażliwych zębach oraz dziąsłach?`,
            `Kto szczególnie skorzysta z parametrów użytkowych tego produktu w codziennej higienie?`,
            `Jak ten wyrób sprawdza się przy delikatnej linii dziąseł i codziennej pielęgnacji jamy ustnej?`,
            `Jakie właściwości z etykiety decydują o dopasowaniu produktu do potrzeb użytkownika?`
        ));
        questions.push(pickVariant(
            `Na jak długo wystarcza opakowanie${capacity ? ` ${capacity}` : ''} przy regularnym stosowaniu rano i wieczorem?`,
            `Jak wygląda wydajność opakowania${capacity ? ` ${capacity}` : ''} w codziennym rytmie higieny domowej?`,
            `Jak bezpiecznie przechowywać produkt po użyciu, aby zachować higienę i właściwości użytkowe?`,
            `Co zyskujesz pod względem wydajności w opakowaniu${capacity ? ` ${capacity}` : ''} przy regularnym używaniu?`
        ));
    } else {
        questions.push(pickVariant(
            scentPhrase
                ? `Jakie właściwości pielęgnacyjne ma ${naturalName} ${scentPhrase} i jak sprawdza się na skórze?`
                : `Jakie właściwości pielęgnacyjne ma ${naturalName} i jak sprawdza się w codziennej pielęgnacji?`,
            scentPhrase
                ? `Jak ${naturalName} oczyszcza skórę w codziennej pielęgnacji i czym wyróżnia się profil ${scentPhrase}?`
                : `Jak ${naturalName} oczyszcza skórę w codziennej pielęgnacji i jakie daje odczucie na naskórku?`,
            `Dlaczego ${naturalName} sprawdza się pod prysznicem i podczas codziennej pielęgnacji dłoni?`,
            `Jakie odczucia na skórze oraz cechy użytkowe oferuje ${naturalName} przy regularnym stosowaniu?`
        ));
        questions.push(pickVariant(
            `Jak prawidłowo stosować ten kosmetyk podczas codziennej kąpieli lub pielęgnacji, aby nie przesuszać naskórka?`,
            `W jaki sposób aplikować ten kosmetyk na wilgotną skórę i jak dokładnie go spłukać po umyciu?`,
            `Jaka ilość produktu wystarcza na jedno mycie, aby uzyskać miękką pianę i komfort naskórka?`,
            `Jak wpleść ten kosmetyk w codzienny rytuał kąpieli zgodnie z zaleceniem na opakowaniu?`
        ));
        if (catInfo.key === 'deodorant') {
            questions.push(pickVariant(
                `Czy ${shortBrandRef} ${hasAluminum ? 'zawiera sole glinu (aluminium)' : 'ma formułę bez soli aluminium'} i czy pozostawia ślady na ubraniach?`,
                `Jak formuła tego dezodorantu zachowuje się na skórze oraz tekstyliach pod kątem komfortu noszenia?`,
                `Czy receptura ${hasAluminum ? 'z solami glinu' : 'bez soli aluminium'} szybko wysycha po aplikacji pod pachami?`,
                `Co warto wiedzieć o składzie i aplikacji tego dezodorantu przed założeniem odzieży?`
            ));
        } else if (catInfo.key === 'talcum_powder') {
            questions.push(pickVariant(
                `Do jakiego typu skóry przeznaczony jest ${shortBrandRef} i jak bezpiecznie aplikować sypki puder mineralny po kąpieli?`,
                `Jak nakładać sypki puder pielęgnacyjny po osuszeniu skóry i na co uważać przy aplikacji blisko twarzy?`,
                `Czy ten talk mineralny sprawdza się do odświeżania i osuszania skóry po kąpieli?`,
                `Dla jakich partii ciała i jakiego rodzaju skóry przewidziano ten sypki talk kosmetyczny?`
            ));
        } else {
            questions.push(pickVariant(
                `Do jakiego typu skóry lub włosów najlepiej sprawdza się ${shortBrandRef} i czy nadaje się do codziennego użytku?`,
                `Czy ta formuła pielęgnacyjna może być używana każdego dnia przez domowników przy częstym myciu?`,
                `Dla jakiej skóry opracowano ten kosmetyk i czy zapewnia uczucie miękkości po zmyciu?`,
                `Kto najlepiej wykorzysta właściwości oczyszczająco-kondycjonujące tego kosmetyku na co dzień?`
            ));
        }
        questions.push(pickVariant(
            `Jakie składniki kondycjonujące zawiera formuła i na jak długo wystarcza opakowanie${capacity ? ` ${capacity}` : ''}?`,
            `Które składniki ze składu INCI odpowiadają za komfort skóry oraz na ile użyć wystarcza${capacity ? ` ${capacity}` : ''}?`,
            `Jakie substancje myjące i nawilżające zastosowano w składzie oraz jak wydajne jest opakowanie${capacity ? ` ${capacity}` : ''}?`,
            `Jak dbać o przechowywanie opakowania${capacity ? ` ${capacity}` : ''} i które składniki INCI wspierają kondycję naskórka?`
        ));
    }

    return {
        detected_category_pl: catInfo.labelPl,
        detected_group: catInfo.group,
        natural_product_name: naturalName,
        front_purpose_hint: frontPurpose || undefined,
        google_autocomplete_queries: googleSuggestions,
        recommended_search_questions: questions
    };
}

/**
 * Główna funkcja serwisowa (0 tokenów LLM):
 * Pobiera (lub odczytuje z lokalnego cache) realne zapytania z Google Autocomplete dla danej kategorii/marki
 * i buduje 4-filarowy blueprint pytań pod wyszukiwarkę Google, Allegro oraz boty zakupowe AI (GEO/AEO).
 */
async function harvestSearchIntentFaq({
    productName = '',
    brand = '',
    capacity = '',
    scent = '',
    category = '',
    isChemical = false,
    visionFeatures = {},
    features = {},
    inci = '',
    detergentComposition = '',
    variantIndex = 0
} = {}) {
    const catInfo = detectCanonicalSearchCategory({ productName, category, visionFeatures, features, isChemical, inci, detergentComposition });
    const canonicalName = resolveCanonicalProductName({ productName, brand, capacity, visionFeatures, features });
    const naturalName = formatNaturalProductName(productName, brand, capacity, { canonicalName });
    const cleanBrand = String(brand || '').trim().toLowerCase();
    const cacheKey = `${cleanBrand || 'generic'}::${catInfo.key}`;

    const cache = loadSuggestCache();
    let googleSuggestions = [];

    const cachedEntry = cache[cacheKey];
    if (cachedEntry && Array.isArray(cachedEntry.suggestions) && (Date.now() - (cachedEntry.timestamp || 0) < CACHE_TTL_MS)) {
        googleSuggestions = cachedEntry.suggestions;
    } else {
        try {
            const seedQueries = [
                `czy ${catInfo.labelPl} `,
                `jak stosować ${catInfo.labelPl}`,
                `${catInfo.labelPl} który `
            ];
            if (cleanBrand && cleanBrand.length >= 2) {
                seedQueries.unshift(`czy ${cleanBrand} ${catInfo.labelPl.split(' ')[0]} `);
                seedQueries.push(`${cleanBrand} ${catInfo.labelPl.split(' ')[0]} `);
            }

            const results = await Promise.all(seedQueries.map(q => fetchGoogleAutocompleteSingle(q)));
            const flatRaw = results.flat();
            googleSuggestions = filterAndCleanGoogleSuggestions(flatRaw, brand);

            cache[cacheKey] = {
                timestamp: Date.now(),
                category_pl: catInfo.labelPl,
                suggestions: googleSuggestions
            };
            saveSuggestCache(cache);
        } catch (err) {
            console.warn('[GoogleSuggestFAQ] Fallback po błędzie sieci Google Suggest:', err.message);
            googleSuggestions = [];
        }
    }

    return buildFourPillarQuestions({
        catInfo,
        naturalName,
        brand,
        capacity,
        scent,
        visionFeatures,
        features,
        inci,
        detergentComposition,
        googleSuggestions,
        variantIndex
    });
}

/**
 * Zbiera zakupowe frazy wyszukiwań klientów PL pod budowę tytułów Allegro SEO i Allegro Ads.
 * W trybie `offlineOnly` (lub DATA_SOURCE_MODE === 'fixture') nie wykonuje zapytań sieciowych i nie mutuje cache.
 */
async function harvestTitleKeywordSignals({
    productName = '',
    brand = '',
    category = '',
    scent = '',
    isChemical = false,
    visionFeatures = {},
    features = {},
    inci = '',
    detergentComposition = '',
    offlineOnly = false
} = {}) {
    const catInfo = detectCanonicalSearchCategory({
        productName,
        category,
        visionFeatures,
        features,
        isChemical,
        inci,
        detergentComposition
    });
    const cleanBrand = String(brand || '').trim();
    const cleanBrandLower = cleanBrand.toLowerCase();
    const isFixture = offlineOnly === true || process.env.DATA_SOURCE_MODE === 'fixture';

    let rawSuggestions = [];
    const cacheKey = `title::${cleanBrandLower || 'generic'}::${catInfo.key}`;
    const cache = loadSuggestCache();
    const cachedEntry = cache[cacheKey];

    if (cachedEntry && Array.isArray(cachedEntry.suggestions) && (Date.now() - (cachedEntry.timestamp || 0) < CACHE_TTL_MS)) {
        rawSuggestions = cachedEntry.suggestions;
    } else if (!isFixture) {
        try {
            const baseCat = catInfo.labelPl;
            const seedQueries = [
                `${baseCat} `,
                `${baseCat} do `
            ];
            if (cleanBrand.length >= 2) {
                seedQueries.push(`${cleanBrand} ${baseCat.split(' ')[0]} `);
            }
            const results = await Promise.all(seedQueries.map(q => fetchGoogleAutocompleteSingle(q)));
            rawSuggestions = filterAndCleanGoogleSuggestions(results.flat(), cleanBrand);
            cache[cacheKey] = {
                timestamp: Date.now(),
                category_pl: catInfo.labelPl,
                suggestions: rawSuggestions
            };
            saveSuggestCache(cache);
        } catch (err) {
            console.warn('[GoogleSuggestTitle] Fallback offline po błędzie sieci:', err.message);
            rawSuggestions = [];
        }
    }

    const phraseSet = new Set();
    const addSafePhrase = (val) => {
        const s = sanitizeOfferTitle(String(val || '').trim()).toLowerCase();
        if (!s || s.length < 4 || s.length > 45) return;
        if (PROHIBITED_SUGGEST_TERMS_REGEX.test(s)) return;
        if (/\b(?:opinie|cena|skład|forum|rossmann|biedronka|lidl|hebe|allegro|ceneo|olx)\b/i.test(s)) return;
        phraseSet.add(s);
    };

    addSafePhrase(catInfo.labelPl);
    if (catInfo.key === 'descaler') {
        addSafePhrase('odkamieniacz do łazienki');
        addSafePhrase('odkamieniacz do kabin i armatury');
    } else if (catInfo.key === 'bathroom_cleaner') {
        addSafePhrase('płyn do czyszczenia łazienki');
        addSafePhrase('spray do armatury i ceramiki');
    } else if (catInfo.key === 'fabric_softener') {
        addSafePhrase('płyn do płukania tkanin');
        addSafePhrase('koncentrat do płukania ubrań');
    } else if (catInfo.key === 'soap') {
        addSafePhrase('mydło w płynie do rąk');
    } else if (catInfo.key === 'shower_gel') {
        addSafePhrase('żel pod prysznic do ciała');
    }

    const cleanScentStr = String(scent || visionFeatures?.['Zapach'] || features?.['Zapach'] || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (cleanScentStr && !/^(?:brak|neutralny|bezzapachowy|classic|classico)$/i.test(cleanScentStr)) {
        addSafePhrase(formatPolishScentPhrase(cleanScentStr));
    }

    for (const s of rawSuggestions) {
        addSafePhrase(s);
    }

    return {
        category_key: catInfo.key,
        category_pl: catInfo.labelPl,
        group: catInfo.group,
        suggested_phrases: [...phraseSet].slice(0, 8),
        source: rawSuggestions.length > 0 ? 'google_suggest_cache_or_live' : 'offline_canonical_taxonomy'
    };
}

module.exports = {
    detectCanonicalSearchCategory,
    formatNaturalProductName,
    formatPolishScentPhrase,
    filterAndCleanGoogleSuggestions,
    buildFourPillarQuestions,
    harvestSearchIntentFaq,
    harvestTitleKeywordSignals
};
