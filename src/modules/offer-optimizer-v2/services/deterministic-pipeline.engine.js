const fs = require('fs');
const path = require('path');
const brandResponsibleService = require('../brand.responsible.service');

const INCI_MECH_PATH = path.join(__dirname, '..', 'data', 'reference', 'inci_mechanisms_pl.json');

let cachedMechanismsDb = null;

function loadMechanismsDb() {
    if (cachedMechanismsDb) return cachedMechanismsDb;
    try {
        if (fs.existsSync(INCI_MECH_PATH)) {
            cachedMechanismsDb = JSON.parse(fs.readFileSync(INCI_MECH_PATH, 'utf8'));
            return cachedMechanismsDb;
        }
    } catch (err) {
        console.warn('[DeterministicEngine] Ostrzeżenie odczytu inci_mechanisms_pl.json:', err.message);
    }
    cachedMechanismsDb = { ingredients: {}, synergies: [], auto_learned: {} };
    return cachedMechanismsDb;
}

function saveMechanismsDb(db) {
    try {
        cachedMechanismsDb = db;
        fs.writeFileSync(INCI_MECH_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.warn('[DeterministicEngine] Ostrzeżenie zapisu inci_mechanisms_pl.json:', err.message);
    }
}

/**
 * 1. SANITYZACJA WEJŚCIA PIM (Odchudzanie promptów z 35 KB szablonów HTML/SVG np. "kod karty")
 */
function cleanFeaturesForPrompt(featuresObj) {
    if (!featuresObj || typeof featuresObj !== 'object') return {};
    const cleaned = {};
    const blacklistedKeys = [
        'kod karty', 'szablon', 'template', 'html', 'opis_html', 'opis html',
        'allegro_html', 'baselinker_html', 'style', 'css', 'svg', 'baner',
        'zdjęcie tyłu opakowania', 'zdjecie tylu opakowania', '_backimageurl'
    ];

    for (const [rawKey, rawVal] of Object.entries(featuresObj)) {
        if (rawVal === null || rawVal === undefined) continue;
        const keyLower = String(rawKey).trim().toLowerCase();
        if (blacklistedKeys.some(bk => keyLower.includes(bk))) {
            continue;
        }

        const valStr = typeof rawVal === 'string' ? rawVal.trim() : JSON.stringify(rawVal);
        if (!valStr) continue;

        // Odrzucamy surowe bloby HTML/SVG/Base64 (np. <svg><path d="...">)
        if (/<\s*(?:svg|path|style|script|table|iframe|img|div)\b/i.test(valStr)) {
            continue;
        }
        if (/data:image\/[a-z]+;base64,/i.test(valStr)) {
            continue;
        }

        const isInciOrLabelKey = /(inci|skład|sklad|ingredients|composizione|ostrze[żz]enia|warnings|bezpiecze[ńn]stw|spos[oó]b\s+u[żz]ycia|spos[oó]b\s+u[żz]ywania|instrukcja|dozowanie|stosowanie)/i.test(keyLower);
        if (!isInciOrLabelKey && valStr.length > 500) {
            continue;
        }
        if (isInciOrLabelKey && valStr.length > 3000) {
            continue;
        }

        const isCapKey = /(pojemno[sś][cć]|waga|capacity|weight)/i.test(keyLower);
        if (isCapKey) {
            cleaned[rawKey] = normalizeCapacityValue(valStr, featuresObj?.['Nazwa'] || '', featuresObj);
        } else {
            cleaned[rawKey] = isInciOrLabelKey ? valStr : sanitizeHtmlClaimsAndStopwords(valStr);
        }
    }
    return cleaned;
}

/**
 * 1b. TWARDA DETEKCJA KATEGORII CHEMII GOSPODARCZEJ / DETERGENTÓW (WE 648/2004 / CLP 1272/2008)
 * Chroni przed pomyleniem środka czyszczącego/wybielacza (np. Cif Candeggina) z kosmetykiem do skóry/włosów.
 */
function detectHouseholdChemical({
    productName = '',
    category = '',
    inci = '',
    detergentComposition = '',
    visionFeatures = {},
    features = {},
    a4CategoryType = '',
    isChemical = false,
    sdsRequired = false,
    clpSignalWord = '',
    clpHPhrases = []
} = {}) {
    if (isChemical === true || sdsRequired === true) return true;
    if (a4CategoryType === 'HOUSEHOLD_CHEMISTRY' || a4CategoryType === 'BIOCIDAL_SPECIALIZED') return true;
    if (clpSignalWord && String(clpSignalWord).trim().length > 0) return true;
    if (Array.isArray(clpHPhrases) && clpHPhrases.length > 0) return true;

    const textContext = [
        productName,
        category,
        visionFeatures?.['Przeznaczenie (Front)'],
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        visionFeatures?.['Składniki wiodące (Front)'],
        features?.['Przeznaczenie'],
        features?.['Zastosowanie'],
        features?.['Kategoria']
    ].filter(Boolean).join(' ').toLowerCase();

    if (/(chemia|chemical|biob[oó]jcz|biocid|prani|laundry|detergent|czyszcz|czysto[sś][cć]\s+powierzchni|odkamien|zmywark|dishwash|p[lł]yn do prania|żel do prania|zel do prania|kapsu[lł]ki do prania|odplamiacz|proszek do prania|p[lł]yn do p[lł]ukania|udro[żz]niacz|p[lł]yn do wc|żel do wc|kostka do wc|zawieszka do wc|[sś]rodek wielofunkcyjny|srodek wielofunkcyjny|[sś]rodek czyszcz[aą]cy|srodek czyszczacy|[sś]rodek do czyszczenia|[sś]rodek myj[aą]cy|preparat czyszcz[aą]cy|preparat do czyszczenia|p[lł]yn uniwersalny|plyn uniwersalny|p[lł]yn do mycia|mleczko do czyszczenia|odt[lł]uszczacz|odtluszczacz|wybielacz|do kuchni|do [lł]azien|do pod[lł][oó]g|do szyb|do luster|do mebli|do dywan|do tapicerki|do naczy[nń]|do piekarnik|do grilla|do kabin|do armatury|do fug|czyszczenie powierzchni|zmywalnych powierzchni|powierzchni twardych|t[lł]uszcz kuchenny|od[sś]wie[żz]acz powietrza|neutralizator zapach|poch[lł]aniacz wilgoci|candeggin|sgrassatore|multiuso|anticalcare|pavimenti|lavatrice|lavastoviglie|bucato|ammorbidente|smacchiatore)/i.test(textContext)) {
        return true;
    }

    const inciContext = [inci, detergentComposition].filter(Boolean).join(' ').toLowerCase();
    if (/(sodium\s+hypochlorite|podchloryn\s+sodu|calcium\s+hypochlorite|sodium\s+c14-17\s+alkyl\s+sec\s+sulfonate|sodium\s+dodecylbenzenesulfonate|alkylbenzene\s+sulfonate|sodium\s+silicate|sodium\s+metasilicate|krzemian\s+sodu|phosphonates|fosfoniany|polycarboxylates|polikarboksylany|zeolites|zeolity|optical\s+brightener|fluorescent\s+brightener|rozja[sś]niacze\s+optyczne|sodium\s+percarbonate|nadw[eę]glan\s+sodu|\btaed\b|sulfamic\s+acid|formic\s+acid|anionowe\s+[sś]rodki\s+powierzchniowo\s+czynne|niejonowe\s+[sś]rodki\s+powierzchniowo\s+czynne|zwi[aą]zki\s+wybielaj[aą]ce)/i.test(inciContext)) {
        return true;
    }

    return false;
}

/**
 * 1c. NORMALIZACJA POJEMNOŚCI / WAGI NETTO (Eliminacja surowych ułamków typu "0,650" oraz nienaturalnych "0,500 l" -> "500 ml")
 */
function normalizeCapacityValue(rawCapacity, productName = '', visionFeatures = {}) {
    const formatQuantityAndUnit = (numStr, unitStr) => {
        const num = parseFloat(String(numStr).replace(',', '.'));
        let unit = String(unitStr || '').toLowerCase();
        if (unit === 'litr') unit = 'l';
        if (unit === 'gram') unit = 'g';
        if (!isNaN(num) && num > 0) {
            if (num < 1 && unit === 'l') {
                return `${Math.round(num * 1000)} ml`;
            }
            if (num < 1 && unit === 'kg') {
                return `${Math.round(num * 1000)} g`;
            }
            const cleanNumStr = String(numStr).replace('.', ',').replace(/,(\d*?)0+$/, (_, d) => (d ? `,${d}` : ''));
            return `${cleanNumStr} ${unit}`;
        }
        return `${String(numStr).replace('.', ',')} ${unit}`;
    };

    const visionCap = visionFeatures?.['Pojemność / Waga'] || visionFeatures?.['Pojemność'] || visionFeatures?.['Waga'] || '';
    if (visionCap && /\b(\d+(?:[.,]\d+)?)\s*(ml|l|litr|g|kg|gram|szt\.?|kaps\.?|tabletek|kapsułek|prań)\b/i.test(String(visionCap))) {
        const m = String(visionCap).trim().match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|litr|g|kg|gram|szt\.?|kaps\.?|tabletek|kapsułek|prań)$/i);
        if (m) {
            return formatQuantityAndUnit(m[1], m[2]);
        }
        return String(visionCap).trim()
            .replace(/\b0[.,](\d{1,3})\s*(?:l|litr[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} ml`)
            .replace(/\b0[.,](\d{1,3})\s*kg(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} g`);
    }

    const nameMatch = String(productName || '').match(/\b(\d+(?:[.,]\d+)?)\s*(ml|l|litr|g|kg|gram|szt\.?|kaps\.?|tabletek|kapsułek)\b/i);
    const rawStr = String(rawCapacity || '').trim();

    if (rawStr) {
        const rawWithUnit = rawStr.match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|litr|g|kg|gram|szt\.?|kaps\.?|m)\b/i);
        if (rawWithUnit) {
            return formatQuantityAndUnit(rawWithUnit[1], rawWithUnit[2]);
        }
    }

    if (nameMatch) {
        return formatQuantityAndUnit(nameMatch[1], nameMatch[2]);
    }

    if (rawStr && /^\d+(?:[.,]\d+)?$/.test(rawStr)) {
        const num = parseFloat(rawStr.replace(',', '.'));
        if (!isNaN(num) && num > 0) {
            const isSolid = /\b(proszek|puder|talk|kostk|mydło w kostce|sól|tabletki)\b/i.test(`${productName} ${visionFeatures?.['Postać'] || ''}`);
            if (num < 1) {
                return `${Math.round(num * 1000)} ${isSolid ? 'g' : 'ml'}`;
            }
            if (num < 10) {
                const cleanNumStr = rawStr.replace('.', ',').replace(/,(\d*?)0+$/, (_, d) => (d ? `,${d}` : ''));
                return `${cleanNumStr} ${isSolid ? 'kg' : 'l'}`;
            }
            return `${Math.round(num)} ${isSolid ? 'g' : 'ml'}`;
        }
    }

    return rawStr;
}

/**
 * 2. TARCZA PRAWNA: SANITYZACJA TYTUŁU OFERTY (BPR 528/2012, Claim Compliance 655/2013, Stop-words Allegro 2026)
 * Żaden z oferowanych produktów nie jest produktem biobójczym — eliminujemy wszelkie sugestie biobójczości z tytułów.
 */
function sanitizeOfferTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return rawTitle;
    let title = rawTitle.trim();

    // Naprawa częstych literówek z katalogów hurtowych (np. CANDEGINA -> Candeggina)
    title = title.replace(/\bcandegina\b/gi, 'Candeggina');

    // Jeśli cały tytuł lub pojedyncze słowa w tytule są zapisane KRZYKLIWYM CAPS LOCKIEM
    // (np. "CIF ŚRODEK WIELOFUNKCYJNY CANDEGINA 650 ML" lub "CIF ŻEL DO ŁAZIENEK Candeggina 750 ml"),
    // konwertujemy je na estetyczny zapis mieszany z zachowaniem wielkich liter dla marek i skrótów.
    const properNouns = new Set([
        'cif', 'candeggina', 'chanteclair', 'felce', 'azzurra', 'paglieri', 'bref', 'ajax',
        'domestos', 'ariel', 'persil', 'lenor', 'coccolino', 'dash', 'finish', 'fairy',
        'vanish', 'omino', 'bianco', 'spuma', 'sciampagna', 'tesori', 'oriente', 'milmil',
        'intesa', 'malizia', 'borotalco', 'nivea', 'dove', 'colgate', 'palmolive', 'frosch',
        'ludwik', 'somat', 'pronto', 'sidolux', 'vileda', 'heitmann', 'beckmann', 'harpic',
        'kret', 'tytan', 'unilever', 'henkel', 'marsiglia', 'argan', 'sensitive', 'classico', 'soft'
    ]);
    const acronyms = new Set(['wc', 'uv', 'spf', 'ph', 'led', 'xxl', 'xl', 'bio', 'eco', '3d']);
    const words = title.split(/\s+/);
    title = words.map((w, idx) => {
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

    // Normalizacja jednostek miar w tytule (np. "650 ML" -> "650 ml", "1,5 L" -> "1,5 l", "0,500 l" -> "500 ml")
    title = title
        .replace(/\b0[.,](\d{1,3})\s*(?:l|litr[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} ml`)
        .replace(/\b0[.,](\d{1,3})\s*kg(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} g`)
        .replace(/\b(\d+(?:[.,]\d+)?)\s*(ML|L|KG|G|SZT)\b/g, (_, num, unit) => `${num} ${unit.toLowerCase()}`);

    // A. Eliminacja roszczeń biobójczych, antybakteryjnych, przeciwwirusowych i dezynfekujących (BPR 528/2012)
    title = title
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:antybakteryjn(?:y|a|e|ym|ych|ego|ej)|przeciwbakteryjn(?:y|a|e|ym|ych)|bakteriobójcz(?:y|a|e)|antibatteric[oaie]|antibacterial)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => {
            if (/a$/i.test(m)) return 'Oczyszczająca';
            if (/e$/i.test(m)) return 'Oczyszczające';
            return 'Oczyszczający';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:przeciwwirusow(?:y|a|e)|antywirusow(?:y|a|e)|wirusobójcz(?:y|a|e)|antiviral)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => {
            if (/a$/i.test(m)) return 'Higieniczna';
            if (/e$/i.test(m)) return 'Higieniczne';
            return 'Higieniczny';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:biobójcz(?:y|a|e)|grzybobójcz(?:y|a|e)|pleśniobójcz(?:y|a|e)|przeciwgrzybicz(?:y|a|e))(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => {
            if (/a$/i.test(m)) return 'Czyszcząca';
            if (/e$/i.test(m)) return 'Czyszczące';
            return 'Czyszczący';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekuj(?:ący|ąca|ące)|odkażaj(?:ący|ąca|ące)|sterylizuj(?:ący|ąca|ące)|igienizzante|disinfettante|sanitizing)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => {
            if (/a$/i.test(m)) return 'Higieniczna';
            if (/e$/i.test(m)) return 'Higieniczne';
            return 'Higieniczny';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekcj(?:a|i|ą|ę)|odkażani(?:e|a)|sterylizacj(?:a|i))(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'Higieniczna Czystość');

    // B. Eliminacja roszczeń medycznych (WE 1223/2009 / 655/2013) z tytułu
    title = title
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:lecznicz(?:y|a|e)|terapeutyczn(?:y|a|e)|uzdrawiaj(?:ący|ąca|ące))(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => {
            if (/a$/i.test(m)) return 'Pielęgnująca';
            if (/e$/i.test(m)) return 'Pielęgnujące';
            return 'Pielęgnujący';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:leczy|goi\s+rany|antybiotyk[a-ząćęłńóśźż]*|lekarstwo)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'Pielęgnacja');

    // C. Eliminacja słów zakazanych przez Regulamin Allegro 2026 (§A Stop-words) z tytułu (z pełnymi polskimi granicami słów Unicode)
    title = title
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:w\s+)?100\s*%/gi, '')
        .replace(/(?<!\d)100\s*%/g, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:100%\s*)?(?:orygina[łl][a-ząćęłńóśźż]*|oryginaln[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:gwarancj[a-ząćęłńóśźż]*|gwarantuj[a-ząćęłńóśźż]*|niezawodn[a-ząćęłńóśźż]*|cudown[a-ząćęłńóśźż]*|magiczn[a-ząćęłńóśźż]*|najlepsz[a-ząćęłńóśźż]*|bezkonkurencyjn[a-ząćęłńóśźż]*|niezrównan[a-ząćęłńóśźż]*|rewelacyjn[a-ząćęłńóśźż]*|rewelacj[a-ząćęłńóśźż]*|ekstra|numer\s+1|nr\s+1)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:hit\s+cenowy|super\s+cena|niska\s+cena|cena\s+hurtowa|najniższa\s+cena|darmowa\s+dostawa|szybka\s+wysyłka|wysyłka\s+24h|kup\s+teraz|zamów\s+teraz|tylko\s+u\s+nas)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:bestseller[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|promocyjn[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|okazj[a-ząćęłńóśźż]*|okazyjn[a-ząćęłńóśźż]*|gratis[a-ząćęłńóśźż]*|rabat[a-ząćęłńóśźż]*|upust[a-ząćęłńóśźż]*|zniżk[a-ząćęłńóśźż]*|najtaniej|tanio|tani[a-ząćęłńóśźż]*|allegro|aukcj[a-ząćęłńóśźż]*|polecam[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|mega|super|hit)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, '');

    // Czyszczenie nadmiarowych spacji i wiszących myślników
    title = title
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s\-–—,:;!/|]+|[\s\-–—,:;!/|]+$/g, '')
        .trim();

    return title;
}

/**
 * 3. TARCZA PRAWNA DLA OPISÓW HTML: AUTOMATYCZNA TRANSLACJA ROSZCZEŃ BIOBÓJCZYCH (BPR 528/2012),
 *    MEDYCZNYCH (WE 1223/2009 / 655/2013), STOP-WORDS ALLEGRO (§A) ORAZ HIGIENA JĘZYKOWA POLSZCZYZNY
 */
function sanitizeHtmlClaimsAndStopwords(htmlStr, context = {}) {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    let res = htmlStr;

    // --- KROK A: TARCZA ANTY-BIOBÓJCZA (Rozp. UE 528/2012 BPR & Ustawa o produktach biobójczych) ---
    res = res
        // Frazy złożone z procentami i drobnoustrojami
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:zabija|usuwa|eliminuje|likwiduje|zwalcza|niszczy)\s+(?:do\s+|nawet\s+)?(?:99[.,]9%\s*)?(?:bakteri[eią]|wirusy|wirusów|zarazki|zarazków|drobnoustroje|drobnoustrojów|mikroby|mikrobów|grzyby|grzybów|pleśń|pleśni)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'skutecznie usuwa zanieczyszczenia i osady')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])99[.,]9%\s*(?:bakterii|wirusów|zarazków|drobnoustrojów|mikrobów|grzybów|pleśni)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'codziennych zabrudzeń i osadów')
        // Przymiotniki i przysłówki biobójcze / antybakteryjne / przeciwwirusowe
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:antybakteryjn|przeciwbakteryjn|bakteriobójcz)(y|a|e|ym|ych|ego|ej|ą|o)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'higienicznie';
            return `higienicznie oczyszczając${s}`;
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:przeciwwirusow|antywirusow|wirusobójcz)(y|a|e|ym|ych|ego|ej|ą|o)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'głęboko';
            return `głęboko oczyszczając${s}`;
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:biobójcz|grzybobójcz|pleśniobójcz|przeciwgrzybicz)(y|a|e|ym|ych|ego|ej|ą|o)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'intensywnie';
            return `intensywnie czyszcząc${s}`;
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekuj|odkażaj|sterylizuj)(ący|ąca|ące|ącego|ącej|ącym|ących)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, suffix) => {
            return `higienicznie czyszcząc${suffix.slice(2).toLowerCase()}`;
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekuje|odkaża|sterylizuje)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'zapewnia higieniczną czystość')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekują|odkażają|sterylizują)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'zapewniają higieniczną czystość')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekować|odkażać|sterylizować)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'higienicznie oczyszczać')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:dezynfekcj|odkażani|sterylizacj)(a|i|ę|ą|e|u|em)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'i' || s === 'a') return 'higienicznej czystości';
            if (s === 'ą' || s === 'em') return 'higienicznym oczyszczaniem';
            return 'higieniczną czystość';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:antibatteric[oaie]|igienizzant[ei]|disinfettant[ei])(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'higienicznie oczyszczający');

    // --- KROK B: TARCZA ANTY-MEDYCZNA (Rozp. WE 1223/2009 i 655/2013) ---
    res = res
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])likwiduje\s+(?:łuszczycę|egzemę|trądzik|azs)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'pielęgnuje skórę wymagającą i skłonną do podrażnień')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])regeneruje\s+tkanki\s+chorobowe(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wspiera naturalną odnowę naskórka')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])zapobiega\s+chorobom(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wspiera utrzymanie dobrej kondycji skóry')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])goi\s+rany(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wspomaga regenerację naskórka')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:wyleczy[a-ząćęłńóśźż]*|uzdrawia[a-ząćęłńóśźż]*|lecz(?:y|ą|yć|ący|ąca|ące|enie|niczy|nicza|nicze))(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'pielęgnuje i koi')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])terapi(a|i|ę|ą)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'i') return 'kuracji pielęgnacyjnej';
            if (low === 'ę') return 'kurację pielęgnacyjną';
            if (low === 'ą') return 'kuracją pielęgnacyjną';
            return 'kuracja pielęgnacyjna';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:lekarstw[a-ząćęłńóśźż]*|antybiotyk[a-ząćęłńóśźż]*|diagnozuj[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'preparat pielęgnacyjny');

    // --- KROK C: TARCZA STOP-WORDS ALLEGRO 2026 & UOKiK OVERPROMISING (§A) Z GRANICAMI UNICODE ---
    res = res
        // Oryginalny / oryginał -> fabryczny / producenta
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+oryginalnym\s+opakowaniu(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'w fabrycznym opakowaniu producenta')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])oryginaln(e|ego|ym|ych)\s+opakowani(e|a|u|ach)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'fabryczne opakowanie producenta')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:gwarancj[a-ząćęłńóśźż]*\s+oryginalnoś[ćc][a-ząćęłńóśźż]*|oryginalnoś[ćc][a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'autentyczność receptury')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])oryginaln(y|a|e|ym|ych|ego|ej|ą)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => `fabryczn${s.toLowerCase()}`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])orygina[łl][a-ząćęłńóśźż]*(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'produkt fabryczny')
        // Gwarancje i obietnice pewnościowe
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])gwarancj[a-ząćęłńóśźż]*\s+(?:najniższej\s+ceny|jakoś[ćc]i|satysfakcji|zwrotu)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wysoki standard wykonania')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])gwarantuj(e|ą|emy)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => (s.toLowerCase() === 'ą' ? 'zapewniają' : 'zapewnia'))
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])gwarantuj(ący|ąca|ące|ącego|ącej|ącym|ących|ąc)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => `zapewniając${s.slice(2).toLowerCase()}`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])gwarancj(a|i|ę|ą)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'ą') return 'podstawą';
            if (low === 'ę') return 'pewność';
            return 'wyznacznik';
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:w\s+100%\s+udowodnion[a-ząćęłńóśźż]*|100%\s+udowodnion[a-ząćęłńóśźż]*|udowodnion[a-ząćęłńóśźż]*\s+skutecznoś[ćc])(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'potwierdzone działanie użytkowe')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:pewnoś[ćc]\s+działania|pewnoś[ćc]\s+zakupu|100%\s+pewnoś[ćc]i)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'przewidywalny efekt użytkowy')
        // Deklaracje "100%" i superlatywy marketingowe zakazane przez Allegro (z zachowaniem fleksji polskiej)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+uporczywego\s+brudu(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa uporczywy brud' : 'skutecznie usuwa uporczywy brud')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+tłuszczu(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa tłuszcz' : 'skutecznie usuwa tłuszcz')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+kamienia(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa kamień' : 'skutecznie usuwa kamień')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+(?:nawet\s+|do\s+)?100\s*%/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa całość' : 'skutecznie usuwa całość')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+100\s*%/gi, 'w pełni')
        .replace(/(?<!\d)100\s*%\s*/g, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:najlepsz|bezkonkurencyjn|niezrównan|rewelacyjn|cudown|magiczn|niezawodn)(y|a|e|ym|ych|ego|ej|ą|ie)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'ie') return 'skutecznie';
            return `skuteczn${low}`;
        })
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:rewelacj[a-ząćęłńóśźż]*|numer\s+1|nr\s+1|ekstra)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wysoka skuteczność')
        // Promocje, ceny, CTA (z granicami słów Unicode, co chroni polskie wyrazy typu "sprzątania", "pytania", "czytania")
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:najniższa\s+cena|nisk[a-ząćęłńóśźż]*\s+cen[a-ząćęłńóśźż]*|super\s+cen[a-ząćęłńóśźż]*|cen[a-ząćęłńóśźż]*\s+hurtow[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*\s+dostaw[a-ząćęłńóśźż]*|za\s+darmo|kup\s+teraz|kupuj\s+teraz|zamów\s+teraz|dodaj\s+do\s+koszyka|tylko\s+u\s+nas|sprawdź\s+to|szybka\s+wysyłka|wysyłk[a-ząćęłńóśźż]*\s+24h|hit[a-ząćęłńóśźż]*\s+cenow[a-ząćęłńóśźż]*|lepsze\s+niż|w\s+stylu)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wysoka wydajność')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:gratis[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*|najtaniej|tanio|tani[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|promocyjn[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|bestseller[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|rabat[a-ząćęłńóśźż]*|upust[a-ząćęłńóśźż]*|zniżk[a-ząćęłńóśźż]*|kliknij|allegro|aukcj[a-ząćęłńóśźż]*|odpowiednik|zamiennik)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'produkt')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:okazj[a-ząćęłńóśźż]*|okazyjn[a-ząćęłńóśźż]*|prezent[a-ząćęłńóśźż]*|hit[a-ząćęłńóśźż]*)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wybór')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])polecam(y)?(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'zaleca się')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:mega|super)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wysoce');

    // --- KROK D: ELIMINACJA OBCOJĘZYCZNYCH WTRĄCEŃ W NAWIASACH (np. "(Potere Sbiancante)", "(Schiuma Potente)", "(multiuso)") ---
    res = res
        .replace(/\s*\(\s*(?:potere\s+sbiancante|schiuma\s+potente|spray\s+attivo|formula\s+migliorata|multiuso|azione\s+sgrassante|senza\s+aloni|senza\s+risciacquo|con\s+candeggina|pulito\s+profondo|profumo\s+di\s+pulito)\s*\)/gi, '');

    // --- KROK E: TARCZA POPRAWNOŚCI JĘZYKOWEJ, JEDNOSTEK MIAR (< 1 L -> ml) I NATURALNEJ POLSZCZYZNY ---
    res = res
        // Naprawa ewentualnych artefaktów z dawnych regexów ASCII
        .replace(/sprząprodukt/gi, 'sprzątania')
        // Automatyczna konwersja ułamkowych litrów i kilogramów poniżej 1 jednostki w tekście (np. "0,500 l" -> "500 ml") z wyjątkiem parametrów logistycznych wagi brutto
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])0[.,](\d{1,3})\s*(?:l|litr(?:y|ów|a|ze)?)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} ml`)
        .replace(/(?<!(?:waga|brutto|ok[.]?)\s+)(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])0[.,](\d{1,3})\s*kg(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, dec) => `${Math.round(parseFloat(`0.${dec}`) * 1000)} g`)
        // Eliminacja sztucznych pseudo-synonimów LLM ("czyszczona strefa", "czyszczona płaszczyzna") — uwaga: słowa kończące się na 'ę'/'ą' wymagają granic Unicode, nie ASCII \b!
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(czyszczon|zabrudzon|myt)(ą|ej|e|ym|ych)\s+(?:stref|płaszczyzn)(ę|y|ie|źnie|om|ach|y)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, prefix, adjEnd, nounEnd) => {
            const p = prefix;
            const nEnd = nounEnd.toLowerCase();
            if (nEnd === 'ę') return `${p}ą powierzchnię`;
            if (nEnd === 'y' && adjEnd.toLowerCase() === 'e') return `${p}e powierzchnie`;
            if (nEnd === 'y' || nEnd === 'ie' || nEnd === 'źnie') return `${p}ej powierzchni`;
            if (nEnd === 'om') return `${p}ym powierzchniom`;
            if (nEnd === 'ach') return `${p}ych powierzchniach`;
            return `${p}${adjEnd} powierzchnię`;
        })
        // Eliminacja pleonazmów, kalek językowych i tautologii ("osusz do sucha", "o zapachu świeży", "zapach czystości", "tkaniny kolorowe" przy wybielaczu)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])osusz\s+do\s+sucha(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => /^[A-Z]/.test(m) ? 'Wytrzyj do sucha' : 'wytrzyj do sucha')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])osuszyć\s+do\s+sucha(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wytrzeć do sucha')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])osuszając\s+do\s+sucha(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wycierając do sucha')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+wariancie\s+zapachowym\s+([a-ząćęłńóśźż]+)y(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, stem) => `o zapachu ${stem.toLowerCase()}ym`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+wariancie\s+zapachowym\s+([a-ząćęłńóśźż]+)i(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, stem) => `o zapachu ${stem.toLowerCase()}im`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+wariancie\s+zapachowym\s+/gi, 'o zapachu ')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])o\s+zapachu\s+([a-ząćęłńóśźż]+(?:ow|n|sk|ck|cz|liw|ist|od|ed|yd))y(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, stem) => `o zapachu ${stem.toLowerCase()}ym`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])o\s+zapachu\s+(śwież|morsk|cytrusow|kwiatow|leśn|sosnow|lawendow|orientaln|klasyczn|delikatn|owocow)y(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, stem) => `o ${stem.toLowerCase()}ym zapachu`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])o\s+zapachu\s+(śwież|morsk)i(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (_, stem) => `o ${stem.toLowerCase()}im zapachu`)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:czyszczenia\s+lub\s+prania|czyszczenia\s+albo\s+prania)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'sprzątania')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])zapach\s+czystości(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'świeży zapach')
        .replace(/Synergia\s+bazy\s+czyszczącej\s+i\s+olejków\s+zapachowych/gi, 'Synergia Skutecznego Czyszczenia i Świeżości')
        .replace(/gładkość\s+armatury\s+i\s+płytek/gi, 'gładkość ceramiki sanitarnej i płytek')
        .replace(/oraz\s+tkaniny\s+kolorowe/gi, 'oraz wszelkie tkaniny i tekstylia')
        .replace(/W\s+PRZYPADKU\s+KONTAKTU\s+ZE\s+SKÓRĄ/gi, 'W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ')
        .replace(/Brak\s+zdjęcia\s+w\s+slocie\s*#\d+/gi, '')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])spłucz\s+obficie\s+czyszczoną\s+powierzchnię\s+bieżącą\s+wodą(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, (m) => /^[A-Z]/.test(m) ? 'Przetrzyj czyszczoną powierzchnię czystą, wilgotną ściereczką lub spłucz wodą' : 'przetrzyj czyszczoną powierzchnię czystą, wilgotną ściereczką lub spłucz wodą')
        // Higiena interpunkcyjna
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])DO OCZÓW(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'DO OCZU')
        .replace(/::+/g, ':')
        .replace(/\s{2,}/g, ' ');

    // --- KROK F: TARCZA ANTYKONTAKTOWA ALLEGRO (Zero e-maili, linków, domen www i telefonów w opisie HTML) ---
    res = res
        // Usuń adresy e-mail (np. consumer-service.it@unilever.com, info@paglieri.it)
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        // Usuń adresy URL z protokołem (http://..., https://...)
        .replace(/https?:\/\/[^\s<>"']+/gi, '')
        // Usuń www.domena...
        .replace(/\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?/gi, '')
        // Usuń gołe domeny internetowe producentów i marek (np. unilever.com, paglieri.it, realchimica.it, ceway.eu)
        .replace(/(?<![a-zA-Z0-9@])[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|it|pl|eu|de|fr|org|net|nl)(?:\/[^\s<>"']*)?(?![a-zA-Z0-9])/gi, '')
        // Usuń numery telefonów międzynarodowe i z etykietami kontaktowymi
        .replace(/(?:\b(?:infolinia|infolinea|telefon|tel)\.?\s*:?\s*)?\+\d{1,3}(?:[\s.-]*\(?\d{1,4}\)?)*(?:[\s.-]*\d{2,4}){2,}\b/gi, '')
        .replace(/\b(?:infolinia|infolinea|telefon|tel)\.?\s*:?\s*(?:\(?\d{2,4}\)?[\s.-]*)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}\b/gi, '')
        // Usuń osierocone etykiety kontaktowe
        .replace(/\b(?:infolinia|infolinea|e-mail|email|strona\s+www)\.?\s*:?\s*/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/,\s*<\/(?:li|p|h[1-6])>/gi, '</$1>')
        .replace(/\s{2,}/g, ' ');

    // --- KROK G: ELIMINACJA KALEEK PRALNICZYCH, ZMYWARKOWYCH I KUCHENNYCH ORAZ TARCZA BHP PLEŚNI ---
    res = res
        // Eliminacja kalek kuchennych w chemii sanitarnej / łazienkowej
        .replace(/usuwa\s+przypalenia\s+i\s+neutralizuje\s+kwaśne\s+zapachy/gi, 'wspomaga odrywanie zanieczyszczeń organicznych i neutralizuje nieprzyjemne zapachy')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+przypalenia(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'wspomaga odrywanie zanieczyszczeń')
        // Tarcza BHP procedury usuwania pleśni/grzybów (Krok 1: Kategoryczny zakaz ścierania na sucho i pylenia zarodników)
        .replace(/(?:usuń\s+z\s+niego\s+powierzchowne\s+zanieczyszczenia|usuń\s+powierzchowne\s+zanieczyszczenia|zetrzyj\s+powierzchniowy\s+nalot)/gi, 'nanieś preparat bezpośrednio na zapleśniałą powierzchnię bez wstępnego ścierania mechanicznego (aby uniknąć rozprzestrzeniania zarodników w powietrzu)')
                // Tarcza interwencyjności: eliminacja zwrotów o "codziennych porządkach" dla silnej chemii żrącej/chlorowej
        .replace(/(?:do|podczas|w\s+trakcie)\s+codziennych\s+porządków/gi, 'do doraźnych zabiegów czyszczących')
        .replace(/(?:do|podczas|w\s+trakcie)\s+regularnych\s+porządków/gi, 'do okresowej interwencji sanitarnej')
        .replace(/(?:w\s+codziennych\s+porządkach|w\s+regularnych\s+porządkach)/gi, 'w doraźnych zabiegach czyszczących')
        .replace(/wiele\s+tygodni\s+regularnych\s+porządków/gi, 'wiele doraźnych zabiegów czyszczących')
        // Eliminacja kalek pralniczych
        .replace(/rozpuszczają\s+zaschnięty\s+tłuszcz,\s+oleje\s+i\s+sebum\s+już\s+w\s+niskich\s+temperaturach\s*\(od\s*20[–-]30\s*°?\s*C\)/gi, 'błyskawicznie zwilżają mytą powierzchnię, ułatwiając wnikanie w osady mineralne i mydlane oraz ich spłukiwanie bez smug')
        .replace(/już\s+w\s+niskich\s+temperaturach\s*\(od\s*20[–-]30\s*°?\s*C\)/gi, 'podczas codziennego zmywania i czyszczenia')
        .replace(/chronią\s+grzałkę\s+pralki\s+przed\s+kamieniem\s+i\s+zapobiegają\s+szarzeniu\s+tkanin/gi, 'wiążą jony twardości wody, zapobiegając powstawaniu zacieków wapiennych na armaturze i ceramice')
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])tłuszcz,\s*oleje\s+i\s+sebum(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'tłuszcz, oleje i osady mineralne');

    // --- KROK G2: TARCZA PRZECIW HALUCYNACJI PRZEMYSŁOWEGO ŚOI (MASKI / GOGLE / OKULARY) W CHEMII DOMOWEJ ---
    const labelTextForPpe = `${context?.pimWarnings || ''} ${context?.pimUsage || ''}`;
    if (!/(?:mask[ęięa]\s+ochronn|półmask|respirator|gogl[ei]\s+ochronn|okular[yów]\s+ochronn)/i.test(labelTextForPpe)) {
        res = res
            .replace(/(?:załóż|założyć|stosuj|stosować|używaj|używać)\s+(?:rękawice\s+ochronne\s*,\s*)?(?:maskę(?:\s+ochronną)?|półmaskę|respirator)\s+(?:oraz|i)\s+(?:okulary|gogle)(?:\s+ochronne)?/gi, 'załóż rękawice ochronne i zadbaj o wietrzenie pomieszczenia')
            .replace(/(?:załóż|założyć|stosuj|stosować|używaj|używać)\s+(?:okulary|gogle)(?:\s+ochronne)?\s+(?:oraz|i)\s+(?:maskę(?:\s+ochronną)?|półmaskę|respirator)/gi, 'załóż rękawice ochronne i zadbaj o wietrzenie pomieszczenia')
            .replace(/(?:w\s+masce\s+ochronnej\s+i\s+okularach(?:\s+ochronnych)?|w\s+masce\s+i\s+okularach(?:\s+ochronnych)?|w\s+okularach\s+ochronnych\s+i\s+masce)/gi, 'w rękawicach ochronnych przy dobrej wentylacji')
            .replace(/,\s*(?:maskę\s+ochronną|okulary\s+ochronne|gogle\s+ochronne)(?:\s+(?:oraz|i)\s+(?:maskę\s+ochronną|okulary\s+ochronne|gogle\s+ochronne))?/gi, '')
            .replace(/(?:oraz|i)\s+(?:maskę\s+ochronną|okulary\s+ochronne|gogle\s+ochronne)/gi, '')
            .replace(/Stosować\s+rękawice\s+ochronne\s*\/\s*odzież\s+ochronną\s*\/\s*ochronę\s+oczu\s*\/\s*ochronę\s+twarzy\.?/gi, 'Stosować rękawice ochronne.')
            .replace(/Stosować\s+ochronę\s+oczu\s*\/\s*ochronę\s+twarzy\.?/gi, 'Stosować rękawice ochronne.');
    }

    // --- KROK H: WYODRĘBNIENIE BLOKU WYKLUCZENIA MATERIAŁOWEGO (PRATFALL W SEKCJI 4) ---
    // Konwersja nieautoryzowanego na Allegro symbolu ⛔ na dozwolony symbol ostrzegawczy ⚠️
    res = res.replace(/⛔/g, '⚠️');
    if (!/WYKLUCZENIE\s+ZASTOSOWANIA/i.test(res)) {
        // Przypadek A: wykluczenie zaszyte wewnątrz dłuższego akapitu po kropce lub innym znaku interpunkcyjnym
        res = res.replace(/([.!?])\s+((?:Ze względu na|Nie\s+(?:należy\s+)?(?:stosować|używać)\s+na|Preparatu\s+nie\s+należy\s+stosować\s+na)[^<]*?(?:marmur|trawertyn|wapie[ńn]|aluminium|kwasowrażliw|kamie[ńn]\s+naturaln|tkanin)[^<]*?)(<\/p>)/i, (m, punct, g1, g2) => {
            return punct + '</p><p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> ' + g1 + g2;
        });
        // Przypadek B: cały akapit to wykluczenie, ale brakowało nagłówka ⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b>
        res = res.replace(/<p>\s*((?:Ze względu na|Nie\s+(?:należy\s+)?(?:stosować|używać)\s+na|Preparatu\s+nie\s+należy\s+stosować\s+na)[^<]*?(?:marmur|trawertyn|wapie[ńn]|aluminium|kwasowrażliw|kamie[ńn]\s+naturaln|tkanin)[^<]*?)<\/p>/i, (m, g1) => {
            return '<p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> ' + g1 + '</p>';
        });
    }

    // --- KROK I: TARCZA ONTO-TECHNOLOGICZNA DLA PŁYNÓW DO PŁUKANIA TKANIN (AMMORBIDENTE) ---
    // Płyn/koncentrat do płukania tkanin NIE JEST detergentem piorącym – nie pierze, nie usuwa plam, służy wyłącznie do płukania (zmiękczanie, zapach, ochrona włókien).
    const isSoftener = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin)/i.test(`${context?.productName || ''} ${res}`) &&
        !/(?:płyn[a-ząćęłńóśźż]*\s+do\s+prania|żel[a-ząćęłńóśźż]*\s+do\s+prania|prosz[a-ząćęłńóśźż]*\s+do\s+prania|kapsułk[a-ząćęłńóśźż]*\s+do\s+prania|2w1|2\s*in\s*1|detersivo)/i.test(context?.productName || '');

    if (isSoftener) {
        res = res
            // Konwersja liczby prań na cykle płukania z poprawną fleksją języka polskiego
            .replace(/(\d+)\s*(?:prań|prania|pranie)/gi, (m, num) => {
                const n = parseInt(num, 10);
                if (n === 1) return `${n} cykl płukania`;
                const mod10 = n % 10;
                const mod100 = n % 100;
                if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
                    return `${n} cykle płukania`;
                }
                return `${n} cykli płukania`;
            })
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])cykl([a-ząćęłńóśźż]*)\s+prania(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'cykl$1 płukania')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])po\s+każdym\s+praniu(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'po każdym płukaniu')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])podczas\s+prania(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'podczas płukania tkanin')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(środek\s+piorący|detergent\s+piorący)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'płyn do płukania tkanin')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(środka\s+piorącego|detergentu\s+piorącego)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'płynu do płukania tkanin')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(środkiem\s+piorącym|detergentem\s+piorącym)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'płynem do płukania tkanin')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])usuwa\s+(?:uporczywe\s+)?(?:plamy|brud|zabrudzenia)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'zmiękcza włókna i chroni tkaniny')
            .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])rozpuszczani[ea]\s+zabrudzeń(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi, 'nadawanie miękkości i elastyczności włóknom');
    }

    return res;
}

/**
 * 4. DETERMINISTYCZNY GENERATOR A2 (Zastępuje puste / halucynujące wywołanie Agenta 2 — 0 tokenów!)
 */
function buildDeterministicA2Result({ isChemical = false, productName = '', visionFeatures = {}, features = {}, inci = '', detergentComposition = '' } = {}) {
    const resolvedIsChemical = detectHouseholdChemical({
        isChemical,
        productName,
        inci,
        detergentComposition,
        visionFeatures,
        features
    });
    const nameLower = String(productName || '').toLowerCase();
    const inciLower = [inci, detergentComposition].filter(Boolean).join(' ').toLowerCase();
    const combinedLower = `${nameLower} ${inciLower} ${JSON.stringify(visionFeatures || {}).toLowerCase()}`;
    const minorFlaws = [];

    if (resolvedIsChemical) {
        if (/(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|wybielacz)/i.test(combinedLower)) {
            minorFlaws.push('Ze względu na zawartość aktywnego wybielacza (podchlorynu sodu) i silnie zasadowy odczyn preparatu nie wolno stosować na armaturze chromowanej, mosiężnej, niklowanej ani czarnej matowej, a także na surowym drewnie, aluminium, linoleum, marmurze oraz jakichkolwiek tkaninach i tekstyliach');
        } else if (/(mleczko\s+do\s+czyszczenia|mleczko\s+czyszczące|calcium\s+carbonate|węglan\s+wapnia|naturalne\s+cząsteczki)/i.test(combinedLower)) {
            minorFlaws.push('Ze względu na zawartość mineralnych mikrocząsteczek czyszczących mleczka nie należy stosować na powierzchniach lakierowanych na wysoki połysk, delikatnym akrylu oraz nieodpornych na ścieranie tworzywach sztucznych');
        } else if (/(prani|płyn do prania|żel do prania|proszek|kapsułk|lavatrice|bucato)/i.test(combinedLower)) {
            if (!/(wełny|jedwabiu|delikatn)/i.test(nameLower)) {
                minorFlaws.push('Formuła o odczynie alkalicznym nie jest przeznaczona do prania naturalnej wełny i jedwabiu');
            }
            if (/(optical brightener|fluorescent brightener|rozjaśniacz|biel)/i.test(combinedLower)) {
                minorFlaws.push('Ze względu na zawartość rozjaśniaczy optycznych produkt nie jest zalecany do prania czarnych i ciemnych tkanin');
            }
        } else if (/(odkamien|kwaśn|anticalcare|citric acid|lactic acid|sulfamic acid|formic acid)/i.test(combinedLower)) {
            minorFlaws.push('Formuła odkamieniająca nie nadaje się do powierzchni kwasowrażliwych, takich jak marmur, trawertyn, wapień czy niezabezpieczone aluminium');
        } else if (/(odtłuszczacz|odtluszczacz|sgrassatore)/i.test(combinedLower)) {
            minorFlaws.push('Silnie odtłuszczająca formuła nie jest przeznaczona do surowego drewna, poliwęglanów (pleksi) oraz powierzchni woskowanych');
        } else if (/(?:do\s+szyb|do\s+szkła|do\s+luster|vetri|glass|cristalli|specchi)/i.test(combinedLower)) {
            minorFlaws.push('Dla uniknięcia smug nie należy rozpylać płynu na tafle szklane silnie nagrzane bezpośrednim działaniem słońca oraz na niezabezpieczone, surowe drewno');
        } else {
            minorFlaws.push('Przed użyciem na delikatnych lub lakierowanych materiałach zaleca się wykonanie próby w mało widocznym miejscu oraz dokładne przetarcie powierzchni wilgotną ściereczką po czyszczeniu');
        }
    } else if (/(szczoteczk|toothbrush)/i.test(nameLower)) {
        minorFlaws.push('Włókna ulegają naturalnemu zużyciu mechanicznemu, dlatego szczoteczkę należy wymieniać co 2–3 miesiące');
    } else if (/(talk|puder)/i.test(nameLower)) {
        minorFlaws.push('Sypka postać mineralna wymaga ostrożnej aplikacji z dala od twarzy, aby uniknąć wdychania drobin proszku');
    } else {
        minorFlaws.push('Skoncentrowana konsystencja wymaga dokładnego spłukania ciepłą wodą po zakończeniu mycia lub aplikacji');
    }

    return {
        sentiment_available: false,
        total_reviews_analyzed: 0,
        scraped_sources: [],
        social_proof_matrix: {
            raw_customer_delights: [],
            real_life_use_cases: [],
            competitor_pain_points_eliminated: [],
            authentic_minor_flaws: minorFlaws
        },
        safety_signals_detected: []
    };
}

/**
 * 4b. DETERMINISTYCZNY GENERATOR A5 (Tarcza GPSR/CLP — oszczędza ~7 500 tokenów Węzła 5).
 *     UWAGA: Zwraca puste tablice `safe_aeo_questions: []` i `safe_aeo_answers: []`, aby Agent 6
 *     napisał w Sekcji 2 w 100% naturalne, ludzkie i dopasowane do produktu pytania i odpowiedzi FAQ
 *     z pogrubieniami `<b>` (zamiast sztywnych szablonów ze sklejanych stringów JS).
 */
function buildDeterministicA5Result({
    productName = '',
    brand = '',
    capacity = '',
    isChemical = false,
    gpsrWarnings = [],
    gpsrBaseline = null,
    minorFlaws = [],
    a2Result = null,
    a4Result = null,
    visionFeatures = {},
    features = {},
    inci = ''
} = {}) {
    const resolvedGpsrWarnings = (Array.isArray(gpsrWarnings) && gpsrWarnings.length > 0)
        ? gpsrWarnings
        : (Array.isArray(gpsrBaseline?.warnings) ? gpsrBaseline.warnings : []);
    const resolvedMinorFlaws = (Array.isArray(minorFlaws) && minorFlaws.length > 0)
        ? minorFlaws
        : (Array.isArray(a2Result?.social_proof_matrix?.authentic_minor_flaws) ? a2Result.social_proof_matrix.authentic_minor_flaws : []);

    return {
        sanitization_status: 'PASSED_CLEAN',
        mandatory_safety_warnings: resolvedGpsrWarnings,
        preserved_minor_flaws_for_pratfall: resolvedMinorFlaws,
        safe_aeo_questions: [],
        safe_aeo_answers: []
    };
}

/**
 * 5. DETERMINISTYCZNY SILNIK SEKCJI 3 I AGENTA 4 (Mechanizmy INCI + Synergie — oszczędza ~11 000 tokenów)
 *    Wykorzystuje lokalną bazę `inci_mechanisms_pl.json` oraz wyróżniki z frontu opakowania (Agent 0 Vision).
 */
function tryBuildDeterministicSection3({
    inci = '',
    detergentComposition = '',
    isChemical = false,
    productName = '',
    category = '',
    visionFeatures = {},
    features = {},
    compliance = null,
    clpWarnings = []
} = {}) {
    const db = loadMechanismsDb();
    const rawSource = [inci, detergentComposition].filter(Boolean).join(', ');
    if (!rawSource || rawSource.trim().length === 0) {
        return { canSkipA4: false };
    }

    const resolvedIsChemical = detectHouseholdChemical({
        isChemical,
        productName,
        category,
        inci,
        detergentComposition,
        visionFeatures,
        features,
        clpSignalWord: compliance?.clp_signal_word,
        clpHPhrases: compliance?.clp_h_phrases
    });

    const categoryType = resolvedIsChemical ? 'HOUSEHOLD_CHEMISTRY' : 'COSMETICS_BEAUTY';
    const rawItems = rawSource
        .split(/[,;\n]+/)
        .map(s => s.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);

    // Składniki wyróżnione na froncie opakowania przez Agenta 0 Vision
    const frontHeroRaw = visionFeatures?.['Składniki wiodące (Front)'] || '';
    const frontHeroItems = frontHeroRaw
        ? String(frontHeroRaw).split(/[,;]+/).map(s => s.trim()).filter(Boolean)
        : [];

    const matchedBenefits = [];
    const matchedRoles = new Set();
    const usedDbKeys = new Set();

    // Kolekcjonujemy specyficzne alergeny zapachowe i konserwanty obecne w rzeczywistym INCI produktu
    const detectedAllergenNames = [];
    const detectedPreservativeNames = [];
    const stripGroupWrapper = (str) => String(str || '')
        .replace(/^(?:środki\s+konserwujące|konserwant(?:y)?|conservante|preservative(?:s)?|kompozycja\s+zapachowa|parfum|profumo|fragrance|zawiera|contains|contiene)\s*[:(]?\s*/i, '')
        .replace(/[()[\]]+/g, '')
        .replace(/^[\s,;/]+|[\s,;/]+$/g, '')
        .trim();

    const subTokens = rawSource
        .split(/[,;\n/()]+/)
        .map(s => stripGroupWrapper(s.replace(/^\d+\.\s*/, '')))
        .filter(Boolean);

    for (const item of subTokens) {
        const lowerItem = item.toLowerCase().trim();
        const allergenEntry = db.ingredients?.['fragrance_allergens'];
        if (allergenEntry && allergenEntry.names.some(n => lowerItem === n || (n.length >= 4 && lowerItem.includes(n)))) {
            const capName = item.charAt(0).toUpperCase() + item.slice(1).toLowerCase();
            if (!detectedAllergenNames.includes(capName)) detectedAllergenNames.push(capName);
        }
        const presEntry = db.ingredients?.['preservatives'];
        if (presEntry && presEntry.names.some(n => lowerItem === n || (n.length >= 4 && lowerItem.includes(n)))) {
            const capName = item.charAt(0).toUpperCase() + item.slice(1).toLowerCase();
            if (!detectedPreservativeNames.includes(capName)) detectedPreservativeNames.push(capName);
        }
    }

    const formatBulletHtml = (dbKey, entry) => {
        let htmlBullet = resolvedIsChemical
            ? (entry.chemical_html || entry.cosmetic_html)
            : (entry.cosmetic_html || entry.chemical_html);
        if (!htmlBullet) return '';

        if (dbKey === 'fragrance_allergens') {
            if (detectedAllergenNames.length > 0) {
                htmlBullet = htmlBullet.replace(/<b>(Nuty aromatyczne|Składniki kompozycji zapachowej)(?:\s*\([^)]*\))?:<\/b>/i, `<b>$1 (${detectedAllergenNames.join(', ')}):</b>`);
            }
        } else if (dbKey === 'preservatives') {
            if (detectedPreservativeNames.length > 0) {
                htmlBullet = htmlBullet.replace(/<b>(Stabilizator mikrobiologiczny|Układ konserwujący)(?:\s*\([^)]*\))?:<\/b>/i, `<b>$1 (${detectedPreservativeNames.join(' / ')}):</b>`);
            }
        }
        return htmlBullet;
    };

    const matchSingleIngredient = (ingStr) => {
        const lower = ingStr.toLowerCase().trim();
        if (!lower) return null;

        // 1. Sprawdzenie w bazie kanonicznej
        for (const [dbKey, entry] of Object.entries(db.ingredients || {})) {
            if (usedDbKeys.has(dbKey)) continue;
            const names = (entry.names || [dbKey]).map(n => n.toLowerCase());
            if (names.some(n => lower === n || (n.length >= 4 && lower.includes(n)))) {
                return { dbKey, entry };
            }
        }

        // 2. Sprawdzenie w bazie samouczącej (auto_learned)
        for (const [learnedKey, learnedEntry] of Object.entries(db.auto_learned || {})) {
            if (usedDbKeys.has(`learned:${learnedKey}`)) continue;
            if (lower === learnedKey || (learnedKey.length >= 4 && lower.includes(learnedKey))) {
                return { dbKey: `learned:${learnedKey}`, entry: learnedEntry };
            }
        }

        return null;
    };

    // KROK 1: Najpierw priorytetowo dopasowujemy Składniki Wiodące z Frontu Opakowania (Agent 0 Vision)
    let unmatchedFrontHero = false;
    for (const hero of frontHeroItems) {
        const hit = matchSingleIngredient(hero);
        if (hit) {
            usedDbKeys.add(hit.dbKey);
            if (hit.entry.role) matchedRoles.add(hit.entry.role);
            const htmlBullet = formatBulletHtml(hit.dbKey, hit.entry);
            if (htmlBullet) matchedBenefits.push(htmlBullet);
        } else {
            unmatchedFrontHero = true;
        }
    }

    // KROK 2: Dopasowujemy składniki z listy INCI / składu detergentowego
    for (const item of rawItems) {
        const hit = matchSingleIngredient(item);
        if (hit) {
            usedDbKeys.add(hit.dbKey);
            if (hit.entry.role) matchedRoles.add(hit.entry.role);
            const htmlBullet = formatBulletHtml(hit.dbKey, hit.entry);
            if (htmlBullet && matchedBenefits.length < 10) {
                matchedBenefits.push(htmlBullet);
            }
        }
    }

    // KROK 2b: Jeżeli dla chemii gospodarczej deklaracja składu (Rozp. 648/2004) wymienia wyłącznie konserwanty/kompozycję zapachową
    // (ponieważ lotne rozpuszczalniki glikolowe/alkoholowe i surfaktanty < 0,2% nie podlegają progowi procentowemu na etykiecie),
    // uzupełniamy punkty ⚙️ o rzeczywisty mechanizm bazy czyszczącej z etykiety, aby Sekcja 3 NIGDY nie składała się wyłącznie z konserwantów!
    const hasActiveCleaningRole = Array.from(matchedRoles).some(r => !['preservative', 'fragrance', 'colorant'].includes(r));
    if (resolvedIsChemical && !hasActiveCleaningRole && matchedBenefits.length > 0) {
        const contextStr = `${productName || ''} ${category || ''} ${JSON.stringify(visionFeatures || {})} ${JSON.stringify(features || {})}`;
        const isGlassOrMirrorSpray = /(?:do\s+szyb|do\s+szkła|do\s+luster|vetri|glass|cristalli|specchi)/i.test(contextStr);
        const hasAirLabelOrNatural = /(?:air\s*label|jakoś[ćc]\s+powietrza|orizon|pulito\s+che\s+respira|surowc[eó]w\s+pochodzenia\s+naturalnego|natural\s+origin)/i.test(contextStr);

        if (isGlassOrMirrorSpray) {
            matchedBenefits.unshift(
                hasAirLabelOrNatural
                    ? '<li>⚙️ <b>Technologia niskiej emisji lotnych związków (certyfikat Air Label Score A+):</b> zoptymalizowana czystość parowania ogranicza uwalnianie substancji do powietrza w pomieszczeniu, <b>zapewniając komfort oddechowy i przyjazny mikroklimat podczas sprzątania</b>.</li>'
                    : '<li>⚙️ <b>Układ antystatyczno-nabłyszczający do gładkich tafli:</b> przyspiesza równomierne wysychanie rozpylonej mgiełki po przetarciu suchą ściereczką, <b>nadając powierzchniom krystaliczny połysk bez konieczności długiego polerowania</b>.</li>'
            );
            matchedBenefits.unshift(
                '<li>⚙️ <b>Szybko odparowująca baza czyszcząca na bazie surowców pochodzenia naturalnego:</b> obniża napięcie powierzchniowe na szkle, kryształach, lustrach oraz powierzchniach plastikowych i laminowanych, <b>rozpuszczając tłuste ślady i kurz bez pozostawiania smug oraz zacieków</b>.</li>'
            );
            matchedRoles.add('surfactant');
            matchedRoles.add('solvent');
        } else {
            matchedBenefits.unshift(
                '<li>⚙️ <b>Wodny układ rozprowadzający o szybkim odparowaniu:</b> zapewnia równomierne zwilżenie czyszczonego podłoża, <b>ułatwiając dokładne zebranie rozpuszczonego brudu ściereczką bez pozostawiania lepkiego filmu</b>.</li>'
            );
            matchedBenefits.unshift(
                '<li>⚙️ <b>Aktywna baza powierzchniowo czynna:</b> wnika w strukturę codziennych zabrudzeń i osadów na zmywalnych powierzchniach, <b>umożliwiając ich szybkie odspojenie i skuteczne mycie bez smug</b>.</li>'
            );
            matchedRoles.add('surfactant');
        }
    }

    // KROK 3: Dopasowujemy synergie na podstawie wykrytych ról fizykochemicznych
    const detectedSynergies = [];
    for (const syn of db.synergies || []) {
        if (Array.isArray(syn.required_roles) && syn.required_roles.every(r => matchedRoles.has(r))) {
            const synHtml = resolvedIsChemical ? (syn.chemical_html || syn.cosmetic_html) : (syn.cosmetic_html || syn.chemical_html);
            if (synHtml && detectedSynergies.length < 3) {
                detectedSynergies.push(synHtml);
            }
        }
    }

    // Jeśli nie mamy ani jednej synergii z par ról, dodajemy uniwersalną synergię formuły przy >= 3 składnikach
    if (detectedSynergies.length === 0 && matchedBenefits.length >= 3) {
        if (resolvedIsChemical) {
            detectedSynergies.push('<li>⚡ <b>Synergia Skutecznego Czyszczenia i Stabilności Formuły:</b> współdziałanie szybko działającej bazy myjącej z układami pomocniczymi <b>przyspiesza usuwanie zabrudzeń bez smug i gwarantuje długotrwałą świeżość roztworu w opakowaniu</b>.</li>');
        } else {
            detectedSynergies.push('<li>⚡ <b>Synergia Oczyszczająco-Pielęgnująca:</b> zbilansowane połączenie bazy myjącej lub nośnikowej ze składnikami kondycjonującymi <b>zapewnia skuteczne działanie przy zachowaniu komfortu i miękkości naskórka</b>.</li>');
        }
    }

    // Warunek bezpieczeństwa: pomijamy LLM Agenta 4, gdy rozpoznaliśmy min. 3 składniki
    // (lub wszystkie składniki z krótkiego składu wraz z wyróżnikiem frontowym).
    const minRequiredMatches = Math.min(3, rawItems.length);
    if (matchedBenefits.length < minRequiredMatches || (unmatchedFrontHero && matchedBenefits.length < 3)) {
        return { canSkipA4: false };
    }

    const heading = resolvedIsChemical
        ? `<h2>⚙️ Skład chemiczny i mechanizm działania aktywnej formuły</h2>`
        : `<h2>⚙️ Składniki aktywne i mechanizm działania formuły</h2>`;

    const introP = resolvedIsChemical
        ? `<p>Receptura produktu opiera się na <b>celowanym doborze związków powierzchniowo czynnych i składników funkcyjnych</b>, w której każdy element odpowiada za konkretny etap rozbijania i wypłukiwania zabrudzeń:</p>`
        : `<p>Formuła kosmetyku łączy <b>składniki oczyszczające, nawilżające oraz kondycjonujące</b>, które współpracują ze sobą dla zachowania równowagi hydrolipidowej i wysokiego komfortu aplikacji:</p>`;

    const rawFooterComp = detergentComposition || inci;
    const inciFooter = rawFooterComp
        ? (resolvedIsChemical
            ? `<p><b>Skład (zgodnie z Rozp. WE 648/2004):</b> ${sanitizeHtmlClaimsAndStopwords(rawFooterComp)}</p>`
            : `<p><b>Skład INCI:</b> ${sanitizeHtmlClaimsAndStopwords(rawFooterComp)}</p>`)
        : '';

    const section3Html = `${heading}${introP}<ul>${matchedBenefits.join('')}${detectedSynergies.join('')}</ul>${inciFooter}`;

    const a4ResultObj = {
        category_type: categoryType,
        technical_benefits_aeo: matchedBenefits,
        detected_synergies: detectedSynergies,
        mandatory_clp_warnings: Array.isArray(clpWarnings) && clpWarnings.length > 0 ? clpWarnings : null
    };

    return {
        canSkipA4: true,
        a4Result: a4ResultObj,
        a4_result: a4ResultObj,
        section3Html,
        section_3_html: section3Html
    };
}

/**
 * Samouczący się zapis nowych składników wygenerowanych przez Agenta 4 do bazy `inci_mechanisms_pl.json`.
 */
function learnFromAgent4Output(a4Result, isChemical = false) {
    if (!a4Result || !Array.isArray(a4Result.technical_benefits_aeo)) return 0;
    const db = loadMechanismsDb();
    if (!db.auto_learned) db.auto_learned = {};

    let learnedCount = 0;
    const bulletRegex = /<li[^>]*>\s*⚙️\s*<(?:b|strong)>\s*([^:<(]+?)(?:\s*\([^)]*\))?\s*:?\s*<\/(?:b|strong)>\s*([\s\S]*?)<\/li>/i;

    for (const rawItem of a4Result.technical_benefits_aeo) {
        if (typeof rawItem !== 'string') continue;
        const m = rawItem.match(bulletRegex);
        if (!m) continue;

        const ingName = m[1].replace(/^Składnik\s*/i, '').trim();
        const keyLower = ingName.toLowerCase();
        if (!keyLower || keyLower.length < 3 || keyLower.length > 80) continue;

        // Sprawdzamy, czy składnik już istnieje w bazie głównej
        const existsInMain = Object.entries(db.ingredients || {}).some(([k, v]) => {
            const names = (v.names || [k]).map(n => n.toLowerCase());
            return names.includes(keyLower);
        });
        if (existsInMain) continue;

        const cleanHtml = sanitizeHtmlClaimsAndStopwords(
            rawItem.replace(/<\s*strong\s*>/gi, '<b>').replace(/<\s*\/\s*strong\s*>/gi, '</b>')
        );

        if (!db.auto_learned[keyLower]) {
            db.auto_learned[keyLower] = {
                names: [keyLower],
                learned_at: new Date().toISOString()
            };
        }
        if (isChemical) {
            if (!db.auto_learned[keyLower].chemical_html) {
                db.auto_learned[keyLower].chemical_html = cleanHtml;
                learnedCount++;
            }
        } else {
            if (!db.auto_learned[keyLower].cosmetic_html) {
                db.auto_learned[keyLower].cosmetic_html = cleanHtml;
                learnedCount++;
            }
        }
    }

    if (learnedCount > 0) {
        saveMechanismsDb(db);
        console.log(`[DeterministicEngine] Samouczenie: dopisano ${learnedCount} nowych mechanizmów składników do inci_mechanisms_pl.json.`);
    }
    return learnedCount;
}

/**
 * 6. DETERMINISTYCZNY KOMPILATOR SEKCJI 5 (Karta Techniczna i Parametry `⚖️`)
 *    Łączy dane z PIM, Agenta 0 Vision (front opakowania) i OSINT A1 bez ryzyka halucynacji CE/pH.
 */
function buildDeterministicSection5({
    gtin = '',
    productName = '',
    brand = '',
    manufacturer = '',
    line = '',
    capacity = '',
    countryOfOrigin = '',
    features = {},
    visionFeatures = {},
    isMedicalDevice = false,
    weight = null,
    grossWeight = null
} = {}) {
    const cleanTitle = sanitizeOfferTitle(productName || '');
    const items = [];

    const cleanItalianAndClaims = (str) => {
        if (!str || typeof str !== 'string') return '';
        return sanitizeHtmlClaimsAndStopwords(str, { productName: cleanTitle })
            .replace(/\s*\(\s*(?:multiuso|potere\s+sbiancante|schiuma\s+potente|spray\s+attivo|formula\s+migliorata|azione\s+sgrassante|senza\s+aloni|senza\s+risciacquo|con\s+candeggina|candeggina|z\s+wybielaczem|pulito\s+profondo|profumo\s+di\s+pulito)\s*\)/gi, '')
            .replace(/\bformula\s+migliorata\b/gi, 'Ulepszona formuła')
            .replace(/\bspray\s+attivo\b/gi, 'Aktywny spray')
            .replace(/\bpotere\s+sbiancante\b/gi, 'Siła wybielania')
            .replace(/\bschiuma\s+potente\b/gi, 'Aktywna piana')
            .replace(/\bazione\s+sgrassante\b/gi, 'Działanie odtłuszczające')
            .replace(/\bsenza\s+aloni\b/gi, 'Bez smug')
            .replace(/\bsenza\s+risciacquo\b/gi, 'Bez spłukiwania')
            .replace(/\bcon\s+candeggina\b/gi, 'z wybielaczem')
            .replace(/\bmultiuso\b/gi, 'wielofunkcyjny')
            .replace(/\s{2,}/g, ' ')
            .trim();
    };

    const addParam = (label, val) => {
        if (!val || typeof val !== 'string') return;
        let trimmed = cleanItalianAndClaims(val);
        if (!trimmed || /^(null|undefined|brak|brak danych|nieznany|nieznany producent|unknown|n\/a|-)$/i.test(trimmed)) return;
        if (trimmed.length > 0 && /^[a-ząćęłńóśźż]/.test(trimmed) && /^[A-ZĄĆĘŁŃÓŚŹŻ0-9]/.test(val.trim())) {
            trimmed = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        }
        items.push(`<li>➡️ <b>${label}:</b> ${trimmed}</li>`);
    };

    const isInvalidManufacturer = (m) => !m || /^(?:null|undefined|brak|brak\s+danych|nieznany|nieznany\s+producent|unknown|n\/a|-)$/i.test(String(m).trim());
    let resolvedBrand = brand || features?.['Marka'] || features?.['Brand'] || visionFeatures?.['Marka'] || '';
    if (!resolvedBrand && cleanTitle) {
        const brandMatch = cleanTitle.match(/^(Dual\s+Power|Chanteclair|Cif|Coccolino|Soft|Dermomed|Svelto|Lysoform|Spuma\s+di\s+Sciampagna|Tesori\s+d'Oriente|Felce\s+Azzurra|Quasar|Napisan|Winni's|Omino\s+Bianco|Smac|Vetril|Bref|Domestos|Ajax|Frosch|Ace)\b/i);
        if (brandMatch) {
            resolvedBrand = brandMatch[1];
        }
    }
    const rawManufacturerCandidates = [manufacturer, features?.['Producent'], visionFeatures?.['Producent']];
    let resolvedManufacturer = rawManufacturerCandidates.find(c => !isInvalidManufacturer(c)) || '';
    if (/^(?:unilever|unilever\s+europe\s+b\.?v\.?)$/i.test(String(resolvedManufacturer).trim()) ||
        (!resolvedManufacturer && /^(?:cif|coccolino|svelto|lysoform|dove)$/i.test(String(resolvedBrand).trim()))) {
        resolvedManufacturer = 'Unilever Italia Mkt. Operations S.r.l.';
    } else if (!resolvedManufacturer && /^(?:dual\s*power|orizon|dermomed|chanteclair)$/i.test(String(resolvedBrand).trim())) {
        resolvedManufacturer = /chanteclair/i.test(String(resolvedBrand)) ? 'Real Chimica S.r.l.' : 'Italchimica S.r.l.';
    }
    const resolvedLine = line || features?.['Linia'] || visionFeatures?.['Linia'] || '';
    const resolvedPostac = visionFeatures?.['Postać'] || features?.['Postać'] || features?.['Postac'] || features?.['Forma'] || '';
    const rawCap = capacity || visionFeatures?.['Pojemność / Waga'] || visionFeatures?.['Pojemność'] || visionFeatures?.['Waga'] || features?.['Pojemność'] || features?.['Waga'] || '';
    const resolvedCapacity = normalizeCapacityValue(rawCap, cleanTitle, visionFeatures);

    // Obliczanie parametru logistycznego wagi brutto
    const rawGross = grossWeight || weight ||
        visionFeatures?.['Waga brutto'] || visionFeatures?.['Waga z opakowaniem'] || visionFeatures?.['Waga'] ||
        features?.['Waga brutto'] || features?.['Waga z opakowaniem'] || features?.['Waga (z opakowaniem)'] || features?.['Waga'] || '';

    let resolvedGrossWeight = '';
    if (rawGross) {
        const num = parseFloat(String(rawGross).replace(',', '.').replace(/[^\d.]/g, ''));
        if (!isNaN(num) && num > 0) {
            if (num > 30) {
                // Wartość w gramach (np. 850 g -> 0,85 kg)
                resolvedGrossWeight = `${(num / 1000).toFixed(2).replace('.', ',').replace(/,00$/, '')} kg`;
            } else {
                resolvedGrossWeight = `${num.toString().replace('.', ',')} kg`;
            }
        } else if (typeof rawGross === 'string' && rawGross.trim()) {
            resolvedGrossWeight = rawGross.trim();
        }
    }

    const isUnscentedArticle = /\b(szczoteczk|toothbrush|ni[cć]\s+dentystyczn|gąbk|pęset|maszynk)\b/i.test(cleanTitle + ' ' + resolvedPostac);

    // Jeśli brak jawnej wagi brutto w PIM/cechach, a mamy pojemność netto w ml lub l:
    // obliczamy wiarygodną estymację logistyczną (gęstość płynu/żelu ~1.05 + waga butelki/zamknięcia)
    if (!resolvedGrossWeight && resolvedCapacity && !isUnscentedArticle) {
        const capMatch = String(resolvedCapacity).match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg)\b/i);
        if (capMatch) {
            const val = parseFloat(capMatch[1].replace(',', '.'));
            const unit = capMatch[2].toLowerCase();
            let estimatedKg = 0;
            if (unit === 'ml') {
                const liters = val / 1000;
                const tare = liters > 1 ? 0.12 : (liters >= 0.5 ? 0.065 : 0.04);
                estimatedKg = (liters * 1.05) + tare;
            } else if (unit === 'l') {
                const tare = val > 2 ? 0.20 : 0.08;
                estimatedKg = (val * 1.04) + tare;
            } else if (unit === 'g') {
                const tare = val >= 500 ? 0.05 : 0.02;
                estimatedKg = (val / 1000) + tare;
            } else if (unit === 'kg') {
                estimatedKg = val + 0.08;
            }
            if (estimatedKg > 0) {
                resolvedGrossWeight = `ok. ${estimatedKg.toFixed(2).replace('.', ',')} kg`;
            }
        }
    }

    const resolvedDozownik = visionFeatures?.['Dozownik'] || features?.['Dozownik'] || features?.['Opakowanie'] || '';
    const resolvedWydajnosc = visionFeatures?.['Wydajność'] || features?.['Wydajność'] || features?.['Liczba prań'] || '';
    const isFabricSoftener = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin)/i.test(`${cleanTitle} ${features?.['Kategoria'] || ''} ${resolvedLine}`) &&
        !/(?:płyn[a-ząćęłńóśźż]*\s+do\s+prania|żel[a-ząćęłńóśźż]*\s+do\s+prania|prosz[a-ząćęłńóśźż]*\s+do\s+prania|kapsułk[a-ząćęłńóśźż]*\s+do\s+prania|2w1|2\s*in\s*1|detersivo)/i.test(cleanTitle);

    let formattedWydajnosc = resolvedWydajnosc;
    if (isFabricSoftener && formattedWydajnosc) {
        formattedWydajnosc = String(formattedWydajnosc).replace(/(\d+)\s*(?:prań|prania|pranie)/gi, (m, num) => {
            const n = parseInt(num, 10);
            if (n === 1) return `${n} cykl płukania`;
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
                return `${n} cykle płukania`;
            }
            return `${n} cykli płukania`;
        });
        if (/^\d+$/.test(String(formattedWydajnosc).trim())) {
            const n = parseInt(String(formattedWydajnosc).trim(), 10);
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (n === 1) formattedWydajnosc = `${n} cykl płukania`;
            else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) formattedWydajnosc = `${n} cykle płukania`;
            else formattedWydajnosc = `${n} cykli płukania`;
        }
    }

    const resolvedTwardosc = visionFeatures?.['Twardość włosia'] || features?.['Twardość włosia'] || '';
    let resolvedZapach = visionFeatures?.['Zapach'] || features?.['Zapach'] || features?.['Nuta zapachowa'] || '';
    let resolvedHero = visionFeatures?.['Składniki wiodące (Front)'] || '';
    const frontPrzeznaczenie = String(visionFeatures?.['Przeznaczenie (Front)'] || '').trim();
    const backPrzeznaczenie = String(features?.['Przeznaczenie'] || features?.['Zastosowanie'] || '').trim();
    const resolvedPrzeznaczenie = (backPrzeznaczenie.length > frontPrzeznaczenie.length) ? backPrzeznaczenie : (frontPrzeznaczenie || backPrzeznaczenie);
    const mergedWyroznikiParts = [
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        features?.['Cechy dodatkowe'],
        features?.['Wyróżniki']
    ].filter(Boolean).join(', ');
    const seenWyroznikSet = new Set();
    const resolvedWyrozniki = mergedWyroznikiParts
        .split(/[,;]+/)
        .map(s => s.trim())
        .filter(s => {
            if (!s) return false;
            const k = s.toLowerCase();
            if (seenWyroznikSet.has(k)) return false;
            seenWyroznikSet.add(k);
            return true;
        })
        .join(', ');
    let resolvedCountry = countryOfOrigin || features?.['Kraj pochodzenia'] || features?.['Kraj produkcji'] || '';

    // Korekta konfliktu pochodzenia: Unilever Italia / włoskie linie z holenderskim prefiksem EAN 87
    if ((/unilever\s+italia/i.test(resolvedManufacturer) || /italia|włoch/i.test(resolvedManufacturer) || /anticalcare|candeggina|sgrassatore|con\s+aceto/i.test(cleanTitle)) && (!resolvedCountry || /niderland|holand/i.test(resolvedCountry))) {
        resolvedCountry = 'Włochy';
    }

    // Jeśli w polu Zapach znalazł się składnik chemiczny (np. "con Candeggina (z wybielaczem)"), nie wyświetlaj go jako zapachu
    if (resolvedZapach && /(?:candeggin|wybielacz|bicarbonato|sod[aą]\s+oczyszczon|ammoniaca|amoniak)/i.test(resolvedZapach)) {
        if (!resolvedHero && /candeggin|wybielacz/i.test(resolvedZapach)) {
            resolvedHero = 'Wybielacz';
        }
        resolvedZapach = '';
    }

    addParam('Marka', resolvedBrand);
    if (resolvedManufacturer) {
        addParam('Producent', resolvedManufacturer);
    } else if (resolvedBrand) {
        addParam('Producent', resolvedBrand);
    }
    addParam('Nazwa produktu', cleanTitle);
    addParam('Linia produktowa', resolvedLine);
    addParam('Postać fizyczna', resolvedPostac);
    addParam('Pojemność / Waga netto', resolvedCapacity);
    if (resolvedGrossWeight) {
        addParam('Waga brutto', resolvedGrossWeight);
    }
    if (resolvedDozownik && !/^brak$/i.test(resolvedDozownik)) {
        addParam('Typ dozownika / zamknięcia', resolvedDozownik);
    }
    if (resolvedTwardosc) {
        addParam('Twardość włosia', resolvedTwardosc);
    }
    if (resolvedZapach && !isUnscentedArticle) {
        addParam('Wariant zapachowy', resolvedZapach);
    }
    if (resolvedHero) {
        addParam('Kluczowe składniki (z etykiety)', resolvedHero);
    }
    if (resolvedPrzeznaczenie) {
        addParam('Przeznaczenie', resolvedPrzeznaczenie);
    }
    if (formattedWydajnosc && /\d/.test(String(formattedWydajnosc)) && !/^(?:długi\s+czas\s+użytkowania|wysoka(?:\s+wydajność)?|standardowa|duża|ekonomiczna)$/i.test(String(formattedWydajnosc).trim())) {
        addParam('Wydajność deklarowana', formattedWydajnosc);
    }
    if (resolvedWyrozniki) {
        // Eliminacja pustych sloganów reklamowych z Cech dodatkowych (np. Siła wybielania, Potere Sbiancante)
        const cleanWyrozniki = String(resolvedWyrozniki)
            .split(/[,;]+/)
            .map(s => s.trim())
            .filter(s => s && !/(?:siła\s+wybielania|potere\s+sbiancante|ulepszona\s+formuła|formula\s+migliorata|aktywny\s+spray|spray\s+attivo|silna\s+formuła|super\s+moc|moc\s+czyszczenia|błyskawiczne\s+działanie)/i.test(s))
            .join(', ');
        if (cleanWyrozniki) {
            addParam('Cechy dodatkowe', cleanWyrozniki);
        }
    }
    addParam('Kraj pochodzenia', resolvedCountry);
    addParam('Stan opakowania', 'Fabryczne opakowanie producenta');
    if (gtin) {
        addParam('Kod EAN (GTIN)', String(gtin));
    }

    return `<h2>⚖️ Specyfikacja techniczna i parametry produktu</h2><ul>${items.join('')}</ul>`;
}

/**
 * 7. DETERMINISTYCZNY KOMPILATOR SEKCJI 6 (Bezpieczeństwo GPSR/CLP `⚠️/➡️` i Podmiot Odpowiedzialny w UE)
 */
function buildDeterministicSection6({
    productName = '',
    isChemical = false,
    inci = '',
    detergentComposition = '',
    compliance = null,
    mandatoryWarnings = [],
    mandatorySafetyWarnings = [],
    euResponsiblePerson = null,
    visionFeatures = {},
    features = {}
} = {}) {
    const resolvedWarnings = (Array.isArray(mandatoryWarnings) && mandatoryWarnings.length > 0)
        ? mandatoryWarnings
        : (Array.isArray(mandatorySafetyWarnings) ? mandatorySafetyWarnings : []);
    const resolvedIsChemical = detectHouseholdChemical({
        isChemical,
        productName,
        inci,
        detergentComposition,
        visionFeatures,
        features,
        clpSignalWord: compliance?.clp_signal_word,
        clpHPhrases: compliance?.clp_h_phrases
    }) || resolvedWarnings.some(w => /\b(H3\d{2}|P102|P264|P280|P305\+P351\+P338|EUH20[68]|Hasło ostrzegawcze)\b/i.test(String(w)));

    const nameLower = String(productName || '').toLowerCase();
    const postacLower = String(visionFeatures?.['Postać'] || '').toLowerCase();
    const isArticle = /\b(szczoteczk|toothbrush|ni[cć]\s+dentystyczn|floss|czyścik|gąbk|akcesori)\b/i.test(nameLower + ' ' + postacLower);
    const isDryPowder = /\b(talk|puder|proszek)\b/i.test(nameLower + ' ' + postacLower) && !resolvedIsChemical;
    const hasHypochlorite = /(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|EUH206)/i.test(
        `${nameLower} ${inci || ''} ${detergentComposition || ''} ${resolvedWarnings.join(' ')}`
    );

    let storageParagraph = '';
    if (isArticle) {
        storageParagraph = `<p>Przechowywać w <b>czystym, suchym i przewiewnym miejscu</b>, w sposób higieniczny, poza zasięgiem małych dzieci.</p>`;
    } else if (isDryPowder) {
        storageParagraph = `<p>Przechowywać w <b>suchym miejscu w temperaturze pokojowej</b>, w szczelnie zamkniętym fabrycznym opakowaniu producenta, chroniąc przed wilgocią i dostępem dzieci.</p>`;
    } else if (hasHypochlorite) {
        storageParagraph = `<p>Przechowywać wyłącznie w <b>szczelnie zamkniętym fabrycznym opakowaniu producenta, w pozycji pionowej</b>, w chłodnym, suchym i zacienionym miejscu, z dala od źródeł ciepła oraz bezpośredniego światła słonecznego (aby zachować stabilność podchlorynu sodu), w miejscu niedostępnym dla dzieci.</p>`;
    } else if (resolvedIsChemical) {
        storageParagraph = `<p>Przechowywać wyłącznie w <b>szczelnie zamkniętym fabrycznym opakowaniu producenta</b>, w chłodnym i suchym miejscu, z dala od źródeł ciepła oraz w miejscu niedostępnym dla dzieci.</p>`;
    } else {
        storageParagraph = `<p>Przechowywać w <b>temperaturze pokojowej (15–25°C)</b>, w szczelnie zamkniętym fabrycznym opakowaniu producenta, z dala od bezpośredniego działania promieni słonecznych i poza zasięgiem dzieci.</p>`;
    }

    const listItems = [];
    const labelTag = resolvedIsChemical
        ? '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> '
        : (isArticle ? '<li>⚠️ <b>Wytyczne bezpieczeństwa (GPSR):</b> ' : '<li>⚠️ <b>Środki ostrożności (GPSR):</b> ');

    const seenWarningCodes = new Set();
    const seenWarningBodies = new Set();

    for (const rawW of resolvedWarnings) {
        if (!rawW || typeof rawW !== 'string') continue;
        let cleanW = sanitizeHtmlClaimsAndStopwords(rawW.trim())
            .replace(/<\/?(?:li|b|strong)[^>]*>/gi, '')
            .replace(/^(?:➡️|⚠️|🛡️|\*|-)\s*/g, '')
            .replace(/^(?:Ostrzeżenie\s+CLP\/GPSR|Ostrzeżenie\s+CLP|Wytyczne\s+bezpieczeństwa\s*\(GPSR\)|Środki\s+ostrożności\s*\(GPSR\))\s*:?\s*/i, '')
            .replace(/^(?:Uwaga|Ostrzeżenie)\s*[–:-]\s*(?=(?:W\s+razie\s+konieczności|Chronić\s+przed\s+dziećmi|Uważnie\s+przeczytać|Dokładnie\s+umyć|Stosować\s+rękawice|P\d{3}|H\d{3}|EUH\d{3}))/i, '')
            .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3})\s*(?:[–:-]\s*|\s+)/i, '$1 – ')
            .trim();
        if (!cleanW) continue;

        // Odrzucenie urwanego członu "Zawiera: mieszaninę..." / "Zawiera – mieszaninę...", gdy w ostrzeżeniach jest już pełne EUH208
        if (/^Zawiera\s*[–:-]/i.test(cleanW) && resolvedWarnings.some(w => /EUH208/i.test(String(w)))) {
            continue;
        }

        // Kanonizacja gołych tekstów P101 / P102 / P103 bez kodu
        if (/^W\s+razie\s+konieczności\s+zasięgnięcia\s+porady\s+lekarza/i.test(cleanW)) {
            cleanW = 'P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.';
        } else if (/^Chronić\s+przed\s+dziećmi\.?$/i.test(cleanW)) {
            cleanW = 'P102 – Chronić przed dziećmi.';
        } else if (/^Uważnie\s+przeczytać\s+wszystkie\s+instrukcje/i.test(cleanW)) {
            cleanW = 'P103 – Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.';
        }

        const codeMatch = cleanW.match(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3})\b/i);
        if (codeMatch) {
            const codeKey = codeMatch[1].toUpperCase();
            if (seenWarningCodes.has(codeKey)) continue;
            seenWarningCodes.add(codeKey);
        }

        const bodyKey = cleanW
            .replace(/^(?:P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3}|Uwaga)\s*[–:-]\s*/i, '')
            .toLowerCase()
            .replace(/[^a-ząćęłńóśźż0-9]/g, '');
        if (bodyKey.length >= 10) {
            if (seenWarningBodies.has(bodyKey)) continue;
            seenWarningBodies.add(bodyKey);
        }

        listItems.push(`${labelTag}${cleanW}</li>`);
    }

    const hasClassifiedHazardInList = listItems.some(li => /\b(?:H314|H315|H318|H319|P301)\b/i.test(li));
    if (resolvedIsChemical && hasClassifiedHazardInList && !listItems.some(li => /Nie\s+połykać/i.test(li))) {
        listItems.push(`${labelTag}Nie połykać.</li>`);
    }

    if (euResponsiblePerson && (euResponsiblePerson.name || typeof euResponsiblePerson === 'string')) {
        let normalizedEu = euResponsiblePerson;
        if (typeof euResponsiblePerson === 'object' && /unilever\s+europe\s+b\.?v\.?/i.test(String(euResponsiblePerson.name || ''))) {
            normalizedEu = {
                name: 'Unilever Italia Mkt. Operations S.r.l.',
                address_eu: 'Via Paolo di Dono 3/A, 00142 Roma (RM), Włochy'
            };
        }
        const formattedEu = brandResponsibleService.formatForHtmlDescription(normalizedEu);
        if (formattedEu) {
            listItems.push(`<li>➡️ <b>Podmiot odpowiedzialny w UE:</b> ${formattedEu}</li>`);
        }
    }

    return `<h2>⚠️ Bezpieczeństwo stosowania i informacje GPSR</h2>${storageParagraph}<ul>${listItems.join('')}</ul>`;
}

/**
 * 8. DETERMINISTYCZNA NORMALIZACJA EMOJI I STRUKTURY NAGŁÓWKÓW/LIST (Zgodność z V7 `emoji_structure_check`)
 */
function normalizeEmojiAndStructure(htmlStr, sectionNum = 1) {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    const allowedSet = ['⭐', '❓', '⚙️', '✍️', '⚖️', '⚠️', '✅', '✔️', '☑️', '❌', '➡️', '♻️', '⚡'];
    const defaultHeadingEmoji = {
        1: '⭐',
        2: '❓',
        3: '⚙️',
        4: '✍️',
        5: '⚖️',
        6: '⚠️'
    }[sectionNum] || '⭐';

    const defaultLiEmoji = {
        1: '✔️',
        2: '✔️',
        3: '⚙️',
        4: '✍️',
        5: '➡️',
        6: '➡️'
    }[sectionNum] || '✔️';

    // Normalizacja pojedynczych znaków Unicode bez selektora wariacji \uFE0F (np. ✔ -> ✔️, ⚙ -> ⚙️, ✍ -> ✍️)
    let res = htmlStr
        .replace(/\u2714(?!\uFE0F)/g, '✔️')
        .replace(/\u2699(?!\uFE0F)/g, '⚙️')
        .replace(/\u270D(?!\uFE0F)/g, '✍️')
        .replace(/\u2696(?!\uFE0F)/g, '⚖️')
        .replace(/\u26A0(?!\uFE0F)/g, '⚠️')
        .replace(/\u27A1(?!\uFE0F)/g, '➡️')
        .replace(/\u267B(?!\uFE0F)/g, '♻️')
        .replace(/\u2611(?!\uFE0F)/g, '☑️')
        // Zamiana nieautoryzowanych emoji na dozwolone odpowiedniki z białej listy Allegro
        .replace(/⛔/g, '⚠️')
        .replace(/💧|🫧|🌊|🧴|🧽|🧹|🧺|🌸|🍋|🌿|✨|🛡️|💎|👑|🔥|😱|💥|😍|🚀|☘️?|☂️?/gu, () => {
            if (sectionNum === 4) return '✍️';
            if (sectionNum === 3) return '⚙️';
            if (sectionNum === 6) return '⚠️';
            return '✔️';
        });

    // Upewniamy się, że każdy <h1> i <h2> zaczyna się od dozwolonego emoji i nie zawiera <b>/<strong> wewnątrz nagłówka
    res = res.replace(/<(h[12])([^>]*)>([\s\S]*?)<\/\1>/gi, (full, tag, attrs, inner) => {
        let cleanInner = inner.replace(/<\/?(?:b|strong|em|i)[^>]*>/gi, '').trim();
        const startsWithAllowed = allowedSet.some(e => cleanInner.startsWith(e));
        if (!startsWithAllowed) {
            // Usuwamy ewentualny inny symbol z początku
            cleanInner = cleanInner.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?\s*/u, '').trim();
            cleanInner = `${defaultHeadingEmoji} ${cleanInner}`;
        }
        return `<${tag}${attrs}>${cleanInner}</${tag}>`;
    });

    // Upewniamy się, że każdy <li> zaczyna się od dozwolonego emoji (po ewentualnym komentarzu <!-- Applied -->)
    res = res.replace(/<li([^>]*)>((?:\s*<!--[\s\S]*?-->\s*)*)([\s\S]*?)<\/li>/gi, (full, attrs, comments, inner) => {
        let trimmed = inner.trim();
        // Jeśli LLM umieścił emoji wewnątrz otwierającego tagu <b> lub <strong> na początku <li> (np. <li><b>✔️ Tekst:</b>...), wysuwamy emoji przed tag
        trimmed = trimmed.replace(/^(<(?:b|strong)[^>]*>)\s*(⭐|❓|⚙️|✍️|⚖️|⚠️|✅|✔️|☑️|❌|➡️|♻️|⚡)\s*/i, '$2 $1');
        const firstEmoji = allowedSet.find(e => trimmed.startsWith(e));
        if (!firstEmoji) {
            trimmed = trimmed.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?\s*/u, '').trim();
            // Usuwamy również ewentualne osierocone emoji ze środka tekstu <li>
            trimmed = trimmed.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]\uFE0F?/gu, '');
            const plainInner = trimmed.replace(/<[^>]+>/g, '').trim();
            const resolvedLiEmoji = (sectionNum === 2 && ((/\?\s*$/.test(plainInner) && !/Odpowiedź:/i.test(plainInner)) || /Pytanie:/i.test(plainInner)))
                ? '❓'
                : defaultLiEmoji;
            trimmed = `${resolvedLiEmoji} ${trimmed}`;
        } else {
            // Usuwamy jakiekolwiek dodatkowe emoji ze środka tekstu <li> (wymóg V7 emoji_structure_check)
            const rest = trimmed.substring(firstEmoji.length).replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]\uFE0F?/gu, '').trimStart();
            trimmed = `${firstEmoji} ${rest}`;
        }
        return `<li${attrs}>${comments || ''}${trimmed}</li>`;
    });

    return res;
}

/**
 * 9. EKSTRAKCJA SCHEMA.ORG FAQPAGE (JSON-LD) Z SEKCJI 2 DLA SKLEPU WWW I AGENTÓW ZAKUPOWYCH AI (GEO/AEO)
 */
function extractFaqJsonLdFromSection2(section2Html = '') {
    if (!section2Html || typeof section2Html !== 'string') {
        return { mainEntity: [], jsonLdObject: null, scriptTag: '' };
    }

    const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const items = [];
    const liRegex = /<(?:li|p)\b[^>]*>([\s\S]*?)<\/(?:li|p)>/gi;
    let match;
    let pendingQuestion = null;

    while ((match = liRegex.exec(section2Html)) !== null) {
        const inner = match[1].replace(/<!--[\s\S]*?-->/g, '').trim();
        const qMatch = inner.match(/^❓\s*<(?:strong|b)>\s*Pytanie:\s*<\/(?:strong|b)>\s*([\s\S]*)$/i);
        if (qMatch) {
            pendingQuestion = stripTags(qMatch[1]);
            continue;
        }
        const aMatch = inner.match(/^✔️\s*<(?:strong|b)>\s*Odpowiedź:\s*<\/(?:strong|b)>\s*([\s\S]*)$/i);
        if (aMatch && pendingQuestion) {
            const answerText = stripTags(aMatch[1]);
            if (pendingQuestion && answerText) {
                items.push({
                    '@type': 'Question',
                    name: pendingQuestion,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: answerText
                    }
                });
            }
            pendingQuestion = null;
        }
    }

    if (items.length === 0) {
        return { mainEntity: [], jsonLdObject: null, scriptTag: '' };
    }

    const jsonLdObject = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items
    };

    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(jsonLdObject, null, 2)}\n</script>`;
    return {
        mainEntity: items,
        jsonLdObject,
        scriptTag
    };
}

module.exports = {
    loadMechanismsDb,
    cleanFeaturesForPrompt,
    detectHouseholdChemical,
    normalizeCapacityValue,
    sanitizeOfferTitle,
    sanitizeHtmlClaimsAndStopwords,
    buildDeterministicA2Result,
    buildDeterministicA5Result,
    tryBuildDeterministicSection3,
    learnFromAgent4Output,
    buildDeterministicSection5,
    buildDeterministicSection6,
    normalizeEmojiAndStructure,
    extractFaqJsonLdFromSection2
};
