const fs = require('fs');
const path = require('path');

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
function detectCanonicalSearchCategory({ productName = '', category = '', visionFeatures = {}, features = {}, isChemical = false } = {}) {
    const combined = [
        productName,
        category,
        visionFeatures?.['Przeznaczenie (Front)'],
        visionFeatures?.['Postać'],
        features?.['Rodzaj'],
        features?.['Typ'],
        features?.['Zastosowanie']
    ].filter(Boolean).join(' ').toLowerCase();

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
        return { key: 'deodorant', labelPl: 'dezodorant', group: 'BODY_CARE' };
    }
    if (/(talk|puder\s+do\s+ciała|talco)/i.test(combined)) {
        return { key: 'talcum_powder', labelPl: 'talk kosmetyczny do ciała', group: 'BODY_CARE' };
    }
    if (/(mydło|mydlo|sapone)/i.test(combined)) {
        return { key: 'soap', labelPl: 'mydło do rąk i ciała', group: 'BODY_CARE' };
    }
    if (/(szampon|shampoo)/i.test(combined)) {
        return { key: 'shampoo', labelPl: 'szampon do włosów', group: 'HAIR_CARE' };
    }
    if (/(odżywk[ai]\s+do\s+włosów|maska\s+do\s+włosów|balsamo\s+capelli)/i.test(combined)) {
        return { key: 'hair_conditioner', labelPl: 'odżywka do włosów', group: 'HAIR_CARE' };
    }
    if (/(krem\s+do\s+rąk|krem\s+do\s+twarzy|balsam\s+do\s+ciała|mleczko\s+do\s+ciała|crema\s+corpo|crema\s+mani)/i.test(combined)) {
        return { key: 'body_cream', labelPl: 'balsam i krem pielęgnacyjny', group: 'BODY_CARE' };
    }
    if (/(żel\s+pod\s+prysznic|zel\s+pod\s+prysznic|płyn\s+do\s+kąpieli|bagnodoccia|docciaschiuma|bagnoschiuma)/i.test(combined)) {
        return { key: 'shower_gel', labelPl: 'żel pod prysznic i płyn do kąpieli', group: 'BODY_CARE' };
    }

    return { key: 'general_cosmetic', labelPl: 'kosmetyk pielęgnacyjny', group: 'BODY_CARE' };
}

/**
 * Buduje naturalną, czytelnie odmienioną polską nazwę produktu (bez WIELKICH LITER z katalogu ERP).
 */
function formatNaturalProductName(productName = '', brand = '', capacity = '') {
    let clean = String(productName || '').trim();
    if (!clean) return brand || 'ten produkt';

    const properNouns = new Set([
        'cif', 'candeggina', 'chanteclair', 'felce', 'azzurra', 'paglieri', 'bref', 'ajax',
        'domestos', 'ariel', 'persil', 'lenor', 'coccolino', 'dash', 'finish', 'fairy',
        'vanish', 'omino', 'bianco', 'spuma', 'sciampagna', 'tesori', 'oriente', 'milmil',
        'intesa', 'malizia', 'borotalco', 'nivea', 'dove', 'colgate', 'palmolive', 'frosch',
        'ludwik', 'somat', 'pronto', 'sidolux', 'vileda', 'heitmann', 'beckmann', 'harpic',
        'kret', 'tytan', 'unilever', 'henkel', 'marsiglia', 'argan', 'sensitive', 'classico', 'soft'
    ]);
    const acronyms = new Set(['wc', 'uv', 'spf', 'ph', 'led', 'xxl', 'xl', 'bio', 'eco', '3d']);

    // Normalizacja słowo po słowie: likwidacja pojedynczych słów pisanych CAPS LOCKIEM (np. "CIF ŻEL DO ŁAZIENEK Candeggina")
    // oraz przywrócenie wielkiej litery dla nazw własnych (np. "candeggina" -> "Candeggina").
    const words = clean.split(/\s+/);
    clean = words.map((w, idx) => {
        const cleanW = w.replace(/[^a-ząćęłńóśźż0-9]/gi, '').toLowerCase();
        if (!cleanW) return w;
        if (acronyms.has(cleanW)) return w.toUpperCase();
        if (properNouns.has(cleanW)) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        const lettersInW = w.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
        const upperInW = w.replace(/[^A-ZĄĆĘŁŃÓŚŹŻ]/g, '');
        if (lettersInW.length >= 2 && upperInW.length === lettersInW.length) {
            const lowerW = w.toLowerCase();
            return idx === 0 ? lowerW.charAt(0).toUpperCase() + lowerW.slice(1) : lowerW;
        }
        if (idx === 0) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }
        return w;
    }).join(' ');

    // Przywrócenie poprawnej wielkiej litery dla marki
    if (brand && typeof brand === 'string' && brand.trim().length > 1) {
        const brandTrim = brand.trim();
        const escapedBrand = brandTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        clean = clean.replace(new RegExp(`\\b${escapedBrand}\\b`, 'gi'), brandTrim);
    }

    // Normalizacja jednostek (w tym ułamków poniżej 1 L / 1 kg, np. "0,500 l" -> "500 ml")
    clean = clean
        .replace(/\b0[.,](\d{1,3})\s*(?:l|litr[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} ml`)
        .replace(/\b0[.,](\d{1,3})\s*kg(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} g`)
        .replace(/\b(\d+(?:[.,]\d+)?)\s*ML\b/gi, '$1 ml')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*G\b/gi, '$1 g')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*KG\b/gi, '$1 kg')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*L\b/gi, '$1 l')
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
    inci = '',
    detergentComposition = '',
    googleSuggestions = []
} = {}) {
    const combinedInci = `${inci || ''} ${detergentComposition || ''} ${JSON.stringify(visionFeatures || {})}`.toLowerCase();
    const hasBleach = /(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|wybielacz)/i.test(combinedInci + ' ' + naturalName);
    const hasAcid = /(citric\s+acid|kwas\s+cytrynowy|sulfamic|amidosulfonow|formic|mrówkow|phosphoric|fosforow|hydrochloric|solny|lactic|mlekow|acetic|octow|anticalcare|odkamieniacz)/i.test(combinedInci + ' ' + naturalName);
    const hasOpticalBrighteners = /(optical\s+brightener|fluorescent\s+brightener|rozjaśniacz)/i.test(combinedInci);
    const hasAluminum = /(aluminum\s+chlorohydrate|aluminum\s+sesquichlorohydrate|sole\s+aluminium)/i.test(combinedInci);
    const frontPurpose = visionFeatures?.['Przeznaczenie (Front)'] || '';
    const frontWashCount = visionFeatures?.['Wydajność'] || '';
    const cleanScent = String(scent || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
    const scentPhrase = formatPolishScentPhrase(cleanScent);
    const shortBrandRef = brand ? `preparat ${brand}` : 'ten preparat';
    const isWcSpecific = catInfo.key === 'wc_cleaner';
    const isBathroomSpecific = catInfo.key === 'bathroom_cleaner' ||
        (/(łazienk|lazienk|sanitar|bagno)/i.test(`${naturalName} ${frontPurpose}`) && !isWcSpecific && !/(kuchni|cucina)/i.test(`${naturalName} ${frontPurpose}`));
    const isKitchenSpecific = catInfo.key === 'kitchen_cleaner' ||
        (/(kuchni|kuchenn|cucina|piekarnik|grill)/i.test(`${naturalName} ${frontPurpose}`) && !/(łazienk|lazienk|bagno)/i.test(`${naturalName} ${frontPurpose}`));

    const questions = [];

    if (catInfo.group === 'LAUNDRY') {
        // FILAR 1: Intencja AI Shopping / Discovery ("Znajdź mi dobry płyn/proszek do prania z zapachem który długo się utrzymuje")
        if (scentPhrase) {
            questions.push(`Co sprawia, że ${naturalName} skutecznie odświeża tkaniny i pozostawia na ubraniach długo utrzymujący się aromat (${scentPhrase})?`);
        } else {
            questions.push(`Co sprawia, że ${naturalName} skutecznie usuwa plamy już w niskich temperaturach i zapewnia długotrwałą świeżość prania?`);
        }

        // FILAR 2: Intencja Instruktażowa Google ("Jak stosować proszek do prania Soft?" / "Czy płyn do prania wlewa się do bębna czy szuflady?")
        if (catInfo.key === 'laundry_powder') {
            questions.push(`Jak prawidłowo stosować i dozować ten proszek do prania w pralce automatycznej oraz podczas prania ręcznego?`);
        } else if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            questions.push(`Jak dozować ${shortBrandRef} do przegródki pralki, aby uzyskać miękkość tkanin i trwały zapach po wysuszeniu?`);
        } else {
            questions.push(`Jak prawidłowo dozować ten detergent – do szuflady pralki czy bezpośrednio do bębna?`);
        }

        // FILAR 3: Intencja Kompatybilności i Bezpieczeństwa Tkanin (z Google PAA + wykluczenia fizykochemiczne)
        if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            questions.push(`Do jakich rodzajów tkanin nadaje się ${shortBrandRef} i jak wpływa na miękkość oraz ułatwianie prasowania ubrań?`);
        } else if (hasOpticalBrighteners) {
            questions.push(`Do jakich rodzajów tkanin przeznaczony jest ${shortBrandRef} i dlaczego nie należy stosować go do wełny, jedwabiu oraz czarnych ubrań?`);
        } else {
            questions.push(`Do jakich rodzajów tkanin i kolorów nadaje się ten środek piorący, a jakich delikatnych włókien (np. wełny lub jedwabiu) należy unikać?`);
        }

        // FILAR 4: Intencja Wydajności Opakowania ("Na ile prań wystarcza..." / "Na ile cykli płukania...")
        if (catInfo.key === 'fabric_softener' || catInfo.key === 'laundry_perfume') {
            const rinseCount = frontWashCount ? String(frontWashCount).replace(/pra[ńn]/i, 'płukań') : null;
            if (rinseCount) {
                questions.push(`Na ile cykli płukania wystarcza opakowanie (${rinseCount}) przy standardowym załadunku pralki?`);
            } else {
                questions.push(`Jaka jest wydajność opakowania${capacity ? ` ${capacity}` : ''} i jak prawidłowo dozować koncentrat do przegródki na płyn zmiękczający?`);
            }
        } else if (frontWashCount) {
            questions.push(`Na ile cykli prania wystarcza opakowanie (${frontWashCount}) przy standardowym załadunku pralki?`);
        } else {
            questions.push(`Jaka jest wydajność opakowania${capacity ? ` ${capacity}` : ''} i które składniki aktywne odpowiadają za rozpuszczanie zabrudzeń?`);
        }
    } else if (catInfo.group === 'SURFACE_CLEANER' || catInfo.group === 'DISH_CLEANER') {
        // FILAR 1: Intencja AI Shopping / Skuteczność czyszczenia (z rozdzieleniem WC, Łazienki i Kuchni)
        if (isWcSpecific) {
            if (hasBleach && !hasAcid) {
                questions.push(`Jakie przebarwienia, zżółknięcia i osady organiczne usuwa ${naturalName} w muszli toaletowej oraz co sprawia, że przywraca ceramice WC higieniczną czystość?`);
            } else {
                questions.push(`Jakie osady i zabrudzenia usuwa ${naturalName} w muszli toaletowej oraz co sprawia, że przywraca ceramice WC higieniczną czystość?`);
            }
        } else if (isBathroomSpecific) {
            questions.push(`Jakie osady i zabrudzenia usuwa ${naturalName} w łazience oraz co sprawia, że przywraca ceramice sanitarnej higieniczną czystość?`);
        } else if (isKitchenSpecific) {
            questions.push(`Jakie zabrudzenia tłuszczowe i osady usuwa ${naturalName} w kuchni bez pozostawiania smug?`);
        } else if (frontPurpose) {
            const cleanPurpose = String(frontPurpose).replace(/^(?:do\s+)?/i, 'do ').trim();
            questions.push(`Jakie zabrudzenia usuwa ${naturalName} (${cleanPurpose}) i jak działa jego formuła czyszcząca?`);
        } else {
            questions.push(`Jakie zabrudzenia usuwa ${naturalName} i jak działa jego aktywna formuła czyszcząca?`);
        }

        // FILAR 2: Intencja z Google Autocomplete ("czy mleczko cif rysuje" / kompatybilność powierzchniowa + zakaz armatury i tkanin przy chlorze)
        if (catInfo.key === 'scouring_cream') {
            questions.push(`Czy to mleczko czyszczące rysuje powierzchnie i na jakich materiałach można je bezpiecznie stosować?`);
        } else if (hasBleach) {
            questions.push(`Do jakich powierzchni nadaje się ten preparat z aktywnym wybielaczem, a dlaczego nie wolno stosować go na armaturze chromowanej, metalach, drewnie, marmurze ani na jakichkolwiek tkaninach?`);
        } else if (catInfo.key === 'descaler') {
            questions.push(`Czy ${shortBrandRef} skutecznie usuwa kamień wodny oraz osady z mydła i na jakich powierzchniach kwasowrażliwych (np. marmur, wapień) nie należy go stosować?`);
        } else if (frontPurpose) {
            questions.push(`Do jakich elementów i powierzchni przeznaczony jest ${shortBrandRef} oraz jakich materiałów i podzespołów należy unikać podczas czyszczenia?`);
        } else {
            questions.push(`Do jakich powierzchni przeznaczony jest ${shortBrandRef} i na jakich delikatnych materiałach należy zachować ostrożność?`);
        }

        // FILAR 3: Intencja Instruktażowa ("Jak stosować... i jak spłukiwać?")
        if (isWcSpecific) {
            questions.push(`Jak prawidłowo aplikować i spłukiwać ${shortBrandRef} pod obrzeżem muszli toaletowej oraz pod linią wody, aby uzyskać higieniczną czystość?`);
        } else if (isBathroomSpecific) {
            questions.push(`Jak prawidłowo aplikować i spłukiwać żel na ceramice sanitarnej, wannach, umywalkach oraz fugach, aby uzyskać czystość bez zacieków?`);
        } else {
            questions.push(`Jak prawidłowo aplikować i zmywać ${shortBrandRef}, aby szybko usunąć zabrudzenia oraz osady bez zacieków?`);
        }

        // FILAR 4: Intencja Składnikowa / Zapachowa z Google Suggest (z poprawną fleksją "o świeżym zapachu" i bez powtarzania pełnej nazwy)
        questions.push(`Jakie składniki aktywne odpowiadają za działanie formuły${scentPhrase ? ` ${scentPhrase}` : ''} i jak wydajne jest opakowanie${capacity ? ` ${capacity}` : ''}?`);
    } else if (catInfo.group === 'ORAL_CARE') {
        questions.push(`Jakie korzyści w codziennej higienie jamy ustnej i ochronie szkliwa zapewnia ${naturalName}?`);
        questions.push(`Jak prawidłowo stosować ten produkt podczas codziennego mycia zębów, aby zadbać o dziąsła i świeży oddech?`);
        questions.push(`Dla kogo przeznaczony jest ${shortBrandRef} i czy sprawdza się przy wrażliwych zębach oraz dziąsłach?`);
        questions.push(`Na jak długo wystarcza opakowanie${capacity ? ` ${capacity}` : ''} przy regularnym stosowaniu rano i wieczorem?`);
    } else {
        // BODY_CARE / HAIR_CARE / KOSMETYKI
        questions.push(`Jakie właściwości pielęgnacyjne ma ${naturalName} i co sprawia, że jego aromat${scentPhrase ? ` (${scentPhrase})` : ''} przyjemnie utrzymuje się na skórze?`);
        questions.push(`Jak prawidłowo stosować ten kosmetyk podczas codziennej kąpieli lub pielęgnacji, aby nie przesuszać naskórka?`);
        if (catInfo.key === 'deodorant') {
            questions.push(`Czy ${shortBrandRef} ${hasAluminum ? 'zawiera sole glinu (aluminium)' : 'ma formułę bez soli aluminium'} i czy pozostawia ślady na ubraniach?`);
        } else if (catInfo.key === 'talcum_powder') {
            questions.push(`Do jakiego typu skóry przeznaczony jest ${shortBrandRef} i jak bezpiecznie aplikować sypki puder mineralny po kąpieli?`);
        } else {
            questions.push(`Do jakiego typu skóry lub włosów najlepiej sprawdza się ${shortBrandRef} i czy nadaje się do codziennego użytku?`);
        }
        questions.push(`Jakie składniki kondycjonujące zawiera formuła i na jak długo wystarcza opakowanie${capacity ? ` ${capacity}` : ''}?`);
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
    detergentComposition = ''
} = {}) {
    const catInfo = detectCanonicalSearchCategory({ productName, category, visionFeatures, features, isChemical });
    const naturalName = formatNaturalProductName(productName, brand, capacity);
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
        inci,
        detergentComposition,
        googleSuggestions
    });
}

module.exports = {
    detectCanonicalSearchCategory,
    formatNaturalProductName,
    formatPolishScentPhrase,
    filterAndCleanGoogleSuggestions,
    harvestSearchIntentFaq
};
