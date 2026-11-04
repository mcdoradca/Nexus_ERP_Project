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
        'allegro_html', 'baselinker_html', 'style', 'css', 'svg', 'baner'
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

        const isInciKey = /(inci|skład|sklad|ingredients|composizione)/i.test(keyLower);
        if (!isInciKey && valStr.length > 500) {
            continue;
        }

        cleaned[rawKey] = isInciKey ? valStr : sanitizeHtmlClaimsAndStopwords(valStr);
    }
    return cleaned;
}

/**
 * 2. TARCZA PRAWNA: SANITYZACJA TYTUŁU OFERTY (BPR 528/2012, Claim Compliance 655/2013, Stop-words Allegro 2026)
 * Żaden z oferowanych produktów nie jest produktem biobójczym — eliminujemy wszelkie sugestie biobójczości z tytułów.
 */
function sanitizeOfferTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return rawTitle;
    let title = rawTitle.trim();

    // A. Eliminacja roszczeń biobójczych, antybakteryjnych, przeciwwirusowych i dezynfekujących (BPR 528/2012)
    title = title
        .replace(/\b(?:antybakteryjn(?:y|a|e|ym|ych|ego|ej)|przeciwbakteryjn(?:y|a|e|ym|ych)|bakteriobójcz(?:y|a|e)|antibatteric[oaie]|antibacterial)\b/gi, (m) => {
            if (/a$/i.test(m)) return 'Oczyszczająca';
            if (/e$/i.test(m)) return 'Oczyszczające';
            return 'Oczyszczający';
        })
        .replace(/\b(?:przeciwwirusow(?:y|a|e)|antywirusow(?:y|a|e)|wirusobójcz(?:y|a|e)|antiviral)\b/gi, (m) => {
            if (/a$/i.test(m)) return 'Higieniczna';
            if (/e$/i.test(m)) return 'Higieniczne';
            return 'Higieniczny';
        })
        .replace(/\b(?:biobójcz(?:y|a|e)|grzybobójcz(?:y|a|e)|pleśniobójcz(?:y|a|e)|przeciwgrzybicz(?:y|a|e))\b/gi, (m) => {
            if (/a$/i.test(m)) return 'Czyszcząca';
            if (/e$/i.test(m)) return 'Czyszczące';
            return 'Czyszczący';
        })
        .replace(/\b(?:dezynfekuj(?:ący|ąca|ące)|odkażaj(?:ący|ąca|ące)|sterylizuj(?:ący|ąca|ące)|igienizzante|disinfettante|sanitizing)\b/gi, (m) => {
            if (/a$/i.test(m)) return 'Higieniczna';
            if (/e$/i.test(m)) return 'Higieniczne';
            return 'Higieniczny';
        })
        .replace(/\b(?:dezynfekcj(?:a|i|ą|ę)|odkażani(?:e|a)|sterylizacj(?:a|i))\b/gi, 'Higieniczna Czystość');

    // B. Eliminacja roszczeń medycznych (WE 1223/2009 / 655/2013) z tytułu
    title = title
        .replace(/\b(?:lecznicz(?:y|a|e)|terapeutyczn(?:y|a|e)|uzdrawiaj(?:ący|ąca|ące))\b/gi, (m) => {
            if (/a$/i.test(m)) return 'Pielęgnująca';
            if (/e$/i.test(m)) return 'Pielęgnujące';
            return 'Pielęgnujący';
        })
        .replace(/\b(?:leczy|goi\s+rany|antybiotyk[a-ząćęłńóśźż]*|lekarstwo)\b/gi, 'Pielęgnacja');

    // C. Eliminacja słów zakazanych przez Regulamin Allegro 2026 (§A Stop-words) z tytułu
    title = title
        .replace(/\b(?:100%\s*)?(?:orygina[łl][a-ząćęłńóśźż]*|oryginaln[a-ząćęłńóśźż]*)\b/gi, '')
        .replace(/\b(?:gwarancj[a-ząćęłńóśźż]*|gwarantuj[a-ząćęłńóśźż]*|niezawodn[a-ząćęłńóśźż]*|cudown[a-ząćęłńóśźż]*|magiczn[a-ząćęłńóśźż]*)\b/gi, '')
        .replace(/\b(?:hit\s+cenowy|super\s+cena|niska\s+cena|cena\s+hurtowa|najniższa\s+cena|darmowa\s+dostawa|szybka\s+wysyłka|wysyłka\s+24h|kup\s+teraz|zamów\s+teraz|tylko\s+u\s+nas)\b/gi, '')
        .replace(/\b(?:bestseller[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|promocyjn[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|okazj[a-ząćęłńóśźż]*|okazyjn[a-ząćęłńóśźż]*|gratis[a-ząćęłńóśźż]*|rabat[a-ząćęłńóśźż]*|upust[a-ząćęłńóśźż]*|zniżk[a-ząćęłńóśźż]*|najtaniej|tanio|tani[a-ząćęłńóśźż]*|allegro|aukcj[a-ząćęłńóśźż]*|polecam[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|mega|super|hit)\b/gi, '');

    // Czyszczenie nadmiarowych spacji i wiszących myślników
    title = title
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s\-–—,:;!/|]+|[\s\-–—,:;!/|]+$/g, '')
        .trim();

    return title;
}

/**
 * 3. TARCZA PRAWNA DLA OPISÓW HTML: AUTOMATYCZNA TRANSLACJA ROSZCZEŃ BIOBÓJCZYCH (BPR 528/2012),
 *    MEDYCZNYCH (WE 1223/2009 / 655/2013) ORAZ STOP-WORDS ALLEGRO (§A)
 */
function sanitizeHtmlClaimsAndStopwords(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    let res = htmlStr;

    // --- KROK A: TARCZA ANTY-BIOBÓJCZA (Rozp. UE 528/2012 BPR & Ustawa o produktach biobójczych) ---
    res = res
        // Frazy złożone z procentami i drobnoustrojami
        .replace(/\b(?:zabija|usuwa|eliminuje|likwiduje|zwalcza|niszczy)\s+(?:do\s+|nawet\s+)?(?:99[.,]9%\s*)?(?:bakteri[eią]|wirusy|wirusów|zarazki|zarazków|drobnoustroje|drobnoustrojów|mikroby|mikrobów|grzyby|grzybów|pleśń|pleśni)\b/gi, 'skutecznie usuwa zanieczyszczenia i osady')
        .replace(/\b99[.,]9%\s*(?:bakterii|wirusów|zarazków|drobnoustrojów|mikrobów|grzybów|pleśni)\b/gi, 'codziennych zabrudzeń i osadów')
        // Przymiotniki i przysłówki biobójcze / antybakteryjne / przeciwwirusowe
        .replace(/\b(?:antybakteryjn|przeciwbakteryjn|bakteriobójcz)(y|a|e|ym|ych|ego|ej|ą|o)\b/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'higienicznie';
            return `higienicznie oczyszczając${s}`;
        })
        .replace(/\b(?:przeciwwirusow|antywirusow|wirusobójcz)(y|a|e|ym|ych|ego|ej|ą|o)\b/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'głęboko';
            return `głęboko oczyszczając${s}`;
        })
        .replace(/\b(?:biobójcz|grzybobójcz|pleśniobójcz|przeciwgrzybicz)(y|a|e|ym|ych|ego|ej|ą|o)\b/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'o') return 'intensywnie';
            return `intensywnie czyszcząc${s}`;
        })
        .replace(/\b(?:dezynfekuj|odkażaj|sterylizuj)(ący|ąca|ące|ącego|ącej|ącym|ących)\b/gi, (_, suffix) => {
            return `higienicznie czyszcząc${suffix.slice(2).toLowerCase()}`;
        })
        .replace(/\b(?:dezynfekuje|odkaża|sterylizuje)\b/gi, 'zapewnia higieniczną czystość')
        .replace(/\b(?:dezynfekują|odkażają|sterylizują)\b/gi, 'zapewniają higieniczną czystość')
        .replace(/\b(?:dezynfekować|odkażać|sterylizować)\b/gi, 'higienicznie oczyszczać')
        .replace(/\b(?:dezynfekcj|odkażani|sterylizacj)(a|i|ę|ą|e|u|em)\b/gi, (_, suffix) => {
            const s = suffix.toLowerCase();
            if (s === 'i' || s === 'a') return 'higienicznej czystości';
            if (s === 'ą' || s === 'em') return 'higienicznym oczyszczaniem';
            return 'higieniczną czystość';
        })
        .replace(/\b(?:antibatteric[oaie]|igienizzant[ei]|disinfettant[ei])\b/gi, 'higienicznie oczyszczający');

    // --- KROK B: TARCZA ANTY-MEDYCZNA (Rozp. WE 1223/2009 i 655/2013) ---
    res = res
        .replace(/\blikwiduje\s+(?:łuszczycę|egzemę|trądzik|azs)\b/gi, 'pielęgnuje skórę wymagającą i skłonną do podrażnień')
        .replace(/\bregeneruje\s+tkanki\s+chorobowe\b/gi, 'wspiera naturalną odnowę naskórka')
        .replace(/\bzapobiega\s+chorobom\b/gi, 'wspiera utrzymanie dobrej kondycji skóry')
        .replace(/\bgoi\s+rany\b/gi, 'wspomaga regenerację naskórka')
        .replace(/\b(?:wyleczy[a-ząćęłńóśźż]*|uzdrawia[a-ząćęłńóśźż]*|lecz(?:y|ą|yć|ący|ąca|ące|enie|niczy|nicza|nicze))\b/gi, 'pielęgnuje i koi')
        .replace(/\bterapi(a|i|ę|ą)\b/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'i') return 'kuracji pielęgnacyjnej';
            if (low === 'ę') return 'kurację pielęgnacyjną';
            if (low === 'ą') return 'kuracją pielęgnacyjną';
            return 'kuracja pielęgnacyjna';
        })
        .replace(/\b(?:lekarstw[a-ząćęłńóśźż]*|antybiotyk[a-ząćęłńóśźż]*|diagnozuj[a-ząćęłńóśźż]*)\b/gi, 'preparat pielęgnacyjny');

    // --- KROK C: TARCZA STOP-WORDS ALLEGRO 2026 & UOKiK OVERPROMISING (§A) ---
    res = res
        // Oryginalny / oryginał -> fabryczny / producenta
        .replace(/\bw\s+oryginalnym\s+opakowaniu\b/gi, 'w fabrycznym opakowaniu producenta')
        .replace(/\boryginaln(e|ego|ym|ych)\s+opakowani(e|a|u|ach)\b/gi, 'fabryczne opakowanie producenta')
        .replace(/\b(?:gwarancj[a-ząćęłńóśźż]*\s+oryginalnoś[ćc][a-ząćęłńóśźż]*|oryginalnoś[ćc][a-ząćęłńóśźż]*)\b/gi, 'autentyczność receptury')
        .replace(/\boryginaln(y|a|e|ym|ych|ego|ej|ą)\b/gi, (_, s) => `fabryczn${s.toLowerCase()}`)
        .replace(/\borygina[łl][a-ząćęłńóśźż]*\b/gi, 'produkt fabryczny')
        // Gwarancje i obietnice pewnościowe
        .replace(/\bgwarancj[a-ząćęłńóśźż]*\s+(?:najniższej\s+ceny|jakoś[ćc]i|satysfakcji|zwrotu)\b/gi, 'wysoki standard wykonania')
        .replace(/\bgwarantuj(e|ą|emy)\b/gi, (_, s) => (s.toLowerCase() === 'ą' ? 'zapewniają' : 'zapewnia'))
        .replace(/\bgwarantuj(ący|ąca|ące|ącego|ącej|ącym|ących)\b/gi, (_, s) => `zapewniając${s.slice(2).toLowerCase()}`)
        .replace(/\bgwarancj(a|i|ę|ą)\b/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'ą') return 'podstawą';
            if (low === 'ę') return 'pewność';
            return 'wyznacznik';
        })
        .replace(/\b(?:w\s+100%\s+udowodnion[a-ząćęłńóśźż]*|100%\s+udowodnion[a-ząćęłńóśźż]*|udowodnion[a-ząćęłńóśźż]*\s+skutecznoś[ćc])\b/gi, 'potwierdzone działanie użytkowe')
        .replace(/\b(?:pewnoś[ćc]\s+działania|pewnoś[ćc]\s+zakupu|100%\s+pewnoś[ćc]i)\b/gi, 'przewidywalny efekt użytkowy')
        .replace(/\b(?:cudown|magiczn|niezawodn)(y|a|e|ym|ych|ego|ej|ą|ie)\b/gi, (_, s) => {
            const low = s.toLowerCase();
            if (low === 'ie') return 'skutecznie';
            return `skuteczn${low}`;
        })
        // Promocje, ceny, CTA
        .replace(/\b(?:najniższa\s+cena|nisk[a-ząćęłńóśźż]*\s+cen[a-ząćęłńóśźż]*|super\s+cen[a-ząćęłńóśźż]*|cen[a-ząćęłńóśźż]*\s+hurtow[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*\s+dostaw[a-ząćęłńóśźż]*|za\s+darmo|kup\s+teraz|kupuj\s+teraz|zamów\s+teraz|dodaj\s+do\s+koszyka|tylko\s+u\s+nas|sprawdź\s+to|szybka\s+wysyłka|wysyłk[a-ząćęłńóśźż]*\s+24h|hit[a-ząćęłńóśźż]*\s+cenow[a-ząćęłńóśźż]*|lepsze\s+niż|w\s+stylu)\b/gi, 'wysoka wydajność')
        .replace(/\b(?:gratis[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*|najtaniej|tanio|tani[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|promocyjn[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|bestseller[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|rabat[a-ząćęłńóśźż]*|upust[a-ząćęłńóśźż]*|zniżk[a-ząćęłńóśźż]*|kliknij|allegro|aukcj[a-ząćęłńóśźż]*|odpowiednik|zamiennik)\b/gi, 'produkt')
        .replace(/\b(?:okazj[a-ząćęłńóśźż]*|okazyjn[a-ząćęłńóśźż]*|prezent[a-ząćęłńóśźż]*|hit[a-ząćęłńóśźż]*)\b/gi, 'wybór')
        .replace(/\bpolecam(y)?\b/gi, 'zaleca się')
        .replace(/\b(?:mega|super)\b/gi, 'wysoce');

    // Higiena językowa i interpunkcyjna
    res = res
        .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
        .replace(/::+/g, ':')
        .replace(/\s{2,}/g, ' ');

    return res;
}

/**
 * 4. DETERMINISTYCZNY GENERATOR A2 (Zastępuje puste / halucynujące wywołanie Agenta 2 — 0 tokenów!)
 */
function buildDeterministicA2Result({ isChemical = false, productName = '', visionFeatures = {}, inci = '' } = {}) {
    const nameLower = String(productName || '').toLowerCase();
    const inciLower = String(inci || '').toLowerCase();
    const minorFlaws = [];

    if (isChemical) {
        if (/(prani|płyn do prania|żel do prania|proszek|kapsułk)/i.test(nameLower)) {
            if (!/(wełny|jedwabiu|delikatn)/i.test(nameLower)) {
                minorFlaws.push('Formuła o odczynie alkalicznym nie jest przeznaczona do prania naturalnej wełny i jedwabiu');
            }
            if (/(optical brightener|fluorescent brightener|rozjaśniacz|biel)/i.test(inciLower + ' ' + nameLower)) {
                minorFlaws.push('Ze względu na zawartość rozjaśniaczy optycznych produkt nie jest zalecany do prania czarnych i ciemnych tkanin');
            }
        } else if (/(odkamien|kwaśn|łazien|wc|sanit|citric acid|lactic acid)/i.test(nameLower + ' ' + inciLower)) {
            minorFlaws.push('Formuła odkamieniająca nie nadaje się do powierzchni kwasowrażliwych, takich jak marmur, trawertyn, wapień czy niezabezpieczone aluminium');
        } else {
            minorFlaws.push('Skoncentrowana formuła wymaga przestrzegania zalecanego dozowania i dokładnego spłukania wodą przy kontakcie z delikatnymi powierzchniami');
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
 * 4b. DETERMINISTYCZNY GENERATOR A5 (Tarcza GPSR/CLP + Ziarna FAQ AEO — oszczędza ~7 500 tokenów Węzła 5)
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
    visionFeatures = {},
    inci = ''
} = {}) {
    const resolvedGpsrWarnings = (Array.isArray(gpsrWarnings) && gpsrWarnings.length > 0)
        ? gpsrWarnings
        : (Array.isArray(gpsrBaseline?.warnings) ? gpsrBaseline.warnings : []);
    const resolvedMinorFlaws = (Array.isArray(minorFlaws) && minorFlaws.length > 0)
        ? minorFlaws
        : (Array.isArray(a2Result?.social_proof_matrix?.authentic_minor_flaws) ? a2Result.social_proof_matrix.authentic_minor_flaws : []);
    const cleanName = sanitizeOfferTitle(productName || 'Produkt');
    const cleanBrand = sanitizeHtmlClaimsAndStopwords(brand || 'producenta');
    const nameLower = cleanName.toLowerCase();
    const inciLower = String(inci || '').toLowerCase();

    const postac = visionFeatures?.['Postać'] || (isChemical ? 'płyn' : 'kosmetyk');
    const dozownik = visionFeatures?.['Dozownik'] && !/^brak$/i.test(visionFeatures['Dozownik']) ? visionFeatures['Dozownik'] : null;
    const wydajnosc = visionFeatures?.['Wydajność'] || null;
    const zapach = visionFeatures?.['Zapach'] || null;
    const hero = visionFeatures?.['Składniki wiodące (Front)'] || null;
    const przeznaczenie = visionFeatures?.['Przeznaczenie (Front)'] || null;
    const capStr = capacity || visionFeatures?.['Pojemność / Waga'] || '';

    const questions = [];
    const answers = [];

    if (isChemical) {
        const isLaundry = /(prani|płyn do prania|żel do prania|proszek|kapsułk|płukania)/i.test(nameLower);
        if (isLaundry) {
            questions.push(`Do jakich tkanin przeznaczony jest ${cleanName}?`);
            const hasFwa = /(optical brightener|fluorescent brightener|rozjaśniacz)/i.test(inciLower);
            if (hasFwa) {
                answers.push(`${cleanName} marki ${cleanBrand} jest przeznaczony do prania białych i jasnych tkanin bawełnianych, lnianych oraz syntetycznych. Ze względu na odczyn alkaliczny i obecność rozjaśniaczy optycznych nie należy stosować go do naturalnej wełny, jedwabiu ani tkanin czarnych.`);
            } else {
                answers.push(`${cleanName} marki ${cleanBrand} skutecznie pierze tkaniny bawełniane, lniane i mieszane w szerokim zakresie temperatur. Nie należy stosować go do prania naturalnej wełny oraz jedwabiu, które wymagają specjalistycznych środków o neutralnym pH.`);
            }

            questions.push(`Jak dozować ${cleanName}, aby uzyskać optymalną skuteczność prania?`);
            answers.push(`Produkt w postaci skoncentrowanej (${postac}${capStr ? ', ' + capStr : ''}) należy dozować do szuflady pralki lub bezpośrednio do bębna zgodnie z tabelą na opakowaniu, uwzględniając stopień zabrudzenia bielizny oraz twardość wody.${wydajnosc ? ' Opakowanie wystarcza średnio na ' + wydajnosc + '.' : ''}`);

            questions.push(`Czy ${cleanName} całkowicie wypłukuje się z włókien tkanin?`);
            answers.push(`Tak, zastosowany układ niejonowych i anionowych środków powierzchniowo czynnych łatwo rozpuszcza się w wodzie, dzięki czemu ${cleanName} wypłukuje się z tkanin bez pozostawiania białych zacieków i sztywności włókien.`);
        } else {
            questions.push(`Do jakich powierzchni można bezpiecznie stosować ${cleanName}?`);
            if (/(odkamien|kwaśn|łazien|wc|citric acid|lactic acid)/i.test(nameLower + ' ' + inciLower)) {
                answers.push(`${cleanName} marki ${cleanBrand} doskonale sprawdza się na ceramice sanitarnej, glazurze, stali nierdzewnej, chromowanej armaturze i szkle. Nie należy stosować go na powierzchniach wrażliwych na kwasy, takich jak marmur, wapień czy kamień naturalny.`);
            } else {
                answers.push(`${cleanName} marki ${cleanBrand} jest przeznaczony do zmywalnych powierzchni domowych${przeznaczenie ? ' (' + przeznaczenie + ')' : ''}, zapewniając dokładne usunięcie tłuszczu oraz osadów bez pozostawiania smug.`);
            }

            questions.push(`Jak prawidłowo aplikować ${cleanName}, aby uniknąć smug i zacieków?`);
            answers.push(`Nanieś niewielką ilość preparatu (${postac}${dozownik ? ', opakowanie: ' + dozownik : ''}) bezpośrednio na czyszczoną powierzchnię lub wilgotną ściereczkę, przetrzyj zabrudzone miejsce, a następnie spłucz czystą wodą lub wytrzyj do sucha.`);

            questions.push(`Co odpowiada za skuteczność czyszczącą produktu ${cleanName}?`);
            answers.push(`Za szybkie odrywanie brudu w ${cleanName} odpowiadają aktywne środki powierzchniowo czynne${hero ? ' wzbogacone o ' + hero : ''}, które emulgują tłuszcz i ułatwiają jego spłukanie wodą${zapach ? ', pozostawiając świeży zapach (' + zapach + ')' : ''}.`);
        }
    } else if (/(szczoteczk|toothbrush)/i.test(nameLower)) {
        const twardosc = visionFeatures?.['Twardość włosia'] || 'odpowiednio dobrana';
        questions.push(`Dla kogo przeznaczona jest ${cleanName} i jaką ma twardość włosia?`);
        answers.push(`${cleanName} marki ${cleanBrand} posiada włosie o twardości: ${twardosc}, co pozwala na dokładne oczyszczanie powierzchni szkliwa oraz przestrzeni przydziąsłowych podczas codziennego szczotkowania.`);

        questions.push(`Jak często należy wymieniać szczoteczkę ${cleanName} na nową?`);
        answers.push(`Zgodnie z zaleceniami higienicznymi szczoteczkę ${cleanName} należy wymieniać co 2–3 miesiące, a także po przebytej infekcji jamy ustnej lub w momencie zauważalnego odkształcenia włókien.`);

        questions.push(`Jak dbać o higienę szczoteczki ${cleanName} po każdym myciu zębów?`);
        answers.push(`Po każdym użyciu główkę szczoteczki należy dokładnie opłukać pod strumieniem bieżącej wody i odstawić w pozycji pionowej (główką do góry) w suchym, przewiewnym miejscu.`);
    } else {
        questions.push(`Jakie korzyści pielęgnacyjne zapewnia regularne stosowanie produktu ${cleanName}?`);
        answers.push(`${cleanName} marki ${cleanBrand} skutecznie oczyszcza i pielęgnuje${przeznaczenie ? ' (' + przeznaczenie + ')' : ''}, wykorzystując zbilansowaną bazę surowcową${hero ? ' oraz składniki wiodące takie jak ' + hero : ''}, aby wspierać miękkość i komfort naskórka bez efektu przesuszenia.`);

        questions.push(`Czy ${cleanName} nadaje się do codziennego stosowania?`);
        answers.push(`Tak, formuła o dopracowanej konsystencji (${postac}${capStr ? ', pojemność ' + capStr : ''}) została opracowana z myślą o codziennej rutynie higieniczno-pielęgnacyjnej, łatwo się rozprowadza i szybko spłukuje wodą.`);

        questions.push(`Jak dozować i aplikować ${cleanName}, aby w pełni wykorzystać wydajność opakowania?`);
        answers.push(`Niewielką porcję produktu (${dozownik ? 'wygodny ' + dozownik : 'odpowiednią do potrzeb'}) nanieś na zwilżoną skórę lub włosy, delikatnie wmasuj do uzyskania aksamitnej emulsji${zapach ? ' o profilu zapachowym: ' + zapach : ''}, a następnie dokładnie spłucz letnią wodą.`);
    }

    return {
        sanitization_status: 'PASSED_CLEAN',
        mandatory_safety_warnings: resolvedGpsrWarnings,
        preserved_minor_flaws_for_pratfall: resolvedMinorFlaws,
        safe_aeo_questions: questions,
        safe_aeo_answers: answers
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
    visionFeatures = {},
    clpWarnings = []
} = {}) {
    const db = loadMechanismsDb();
    const rawSource = [inci, detergentComposition].filter(Boolean).join(', ');
    if (!rawSource || rawSource.trim().length === 0) {
        return { canSkipA4: false };
    }

    const categoryType = isChemical ? 'HOUSEHOLD_CHEMISTRY' : 'COSMETICS_BEAUTY';
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
            const htmlBullet = isChemical
                ? (hit.entry.chemical_html || hit.entry.cosmetic_html)
                : (hit.entry.cosmetic_html || hit.entry.chemical_html);
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
            const htmlBullet = isChemical
                ? (hit.entry.chemical_html || hit.entry.cosmetic_html)
                : (hit.entry.cosmetic_html || hit.entry.chemical_html);
            if (htmlBullet && matchedBenefits.length < 7) {
                matchedBenefits.push(htmlBullet);
            }
        }
    }

    // KROK 3: Dopasowujemy synergie na podstawie wykrytych ról fizykochemicznych
    const detectedSynergies = [];
    for (const syn of db.synergies || []) {
        if (Array.isArray(syn.required_roles) && syn.required_roles.every(r => matchedRoles.has(r))) {
            const synHtml = isChemical ? (syn.chemical_html || syn.cosmetic_html) : (syn.cosmetic_html || syn.chemical_html);
            if (synHtml && detectedSynergies.length < 3) {
                detectedSynergies.push(synHtml);
            }
        }
    }

    // Jeśli nie mamy ani jednej synergii z par ról, dodajemy uniwersalną synergię formuły przy >= 3 składnikach
    if (detectedSynergies.length === 0 && matchedBenefits.length >= 3) {
        if (isChemical) {
            detectedSynergies.push('<li>⚡ <b>Synergia Skutecznego Czyszczenia i Ochrony Powierzchni:</b> współdziałanie bazy myjącej z układami pomocniczymi <b>przyspiesza rozpuszczanie zabrudzeń i ułatwia spłukiwanie bez pozostawiania osadu</b>.</li>');
        } else {
            detectedSynergies.push('<li>⚡ <b>Synergia Oczyszczająco-Pielęgnująca:</b> zbilansowane połączenie bazy myjącej lub nośnikowej ze składnikami kondycjonującymi <b>zapewnia skuteczne działanie przy zachowaniu komfortu i miękkości naskórka</b>.</li>');
        }
    }

    // Warunek bezpieczeństwa: pomijamy LLM Agenta 4 wyłącznie wtedy, gdy rozpoznaliśmy min. 3 składniki
    // i żaden składnik wiodący z frontu opakowania (Agent 0) nie został pominięty.
    const minRequiredMatches = Math.min(3, rawItems.length);
    if (matchedBenefits.length < minRequiredMatches || unmatchedFrontHero) {
        return { canSkipA4: false };
    }

    const heading = isChemical
        ? `<h2>⚙️ Skład chemiczny i mechanizm działania aktywnej formuły</h2>`
        : `<h2>⚙️ Składniki aktywne i mechanizm działania formuły</h2>`;

    const introP = isChemical
        ? `<p>Receptura produktu opiera się na <b>celowanym doborze związków powierzchniowo czynnych i składników funkcyjnych</b>, w której każdy element odpowiada za konkretny etap rozbijania i wypłukiwania zabrudzeń:</p>`
        : `<p>Formuła kosmetyku łączy <b>składniki oczyszczające, nawilżające oraz kondycjonujące</b>, które współpracują ze sobą dla zachowania równowagi hydrolipidowej i wysokiego komfortu aplikacji:</p>`;

    const inciFooter = inci
        ? `<p><b>Skład INCI:</b> ${sanitizeHtmlClaimsAndStopwords(inci)}</p>`
        : (detergentComposition ? `<p><b>Skład (zgodnie z Rozp. WE 648/2004):</b> ${sanitizeHtmlClaimsAndStopwords(detergentComposition)}</p>` : '');

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
    isMedicalDevice = false
} = {}) {
    const cleanTitle = sanitizeOfferTitle(productName || '');
    const items = [];

    const addParam = (label, val) => {
        if (!val || typeof val !== 'string') return;
        const trimmed = sanitizeHtmlClaimsAndStopwords(val.trim());
        if (!trimmed || /^(null|undefined|brak|brak danych|n\/a|-)$/i.test(trimmed)) return;
        items.push(`<li>➡️ <b>${label}:</b> ${trimmed}</li>`);
    };

    const resolvedBrand = brand || features?.['Marka'] || features?.['Brand'] || '';
    const resolvedManufacturer = manufacturer || features?.['Producent'] || '';
    const resolvedLine = line || features?.['Linia'] || '';
    const resolvedPostac = visionFeatures?.['Postać'] || features?.['Postać'] || features?.['Postac'] || features?.['Forma'] || '';
    const resolvedCapacity = capacity || visionFeatures?.['Pojemność / Waga'] || visionFeatures?.['Pojemność'] || visionFeatures?.['Waga'] || features?.['Pojemność'] || features?.['Waga'] || '';
    const resolvedDozownik = visionFeatures?.['Dozownik'] || features?.['Dozownik'] || features?.['Opakowanie'] || '';
    const resolvedWydajnosc = visionFeatures?.['Wydajność'] || features?.['Wydajność'] || features?.['Liczba prań'] || '';
    const resolvedTwardosc = visionFeatures?.['Twardość włosia'] || features?.['Twardość włosia'] || '';
    const resolvedZapach = visionFeatures?.['Zapach'] || features?.['Zapach'] || features?.['Nuta zapachowa'] || '';
    const resolvedHero = visionFeatures?.['Składniki wiodące (Front)'] || '';
    const resolvedPrzeznaczenie = visionFeatures?.['Przeznaczenie (Front)'] || features?.['Przeznaczenie'] || features?.['Zastosowanie'] || '';
    const resolvedWyrozniki = visionFeatures?.['Wyróżniki (Etykieta Front)'] || '';
    const resolvedCountry = countryOfOrigin || features?.['Kraj pochodzenia'] || features?.['Kraj produkcji'] || '';

    const isUnscentedArticle = /\b(szczoteczk|toothbrush|ni[cć]\s+dentystyczn|gąbk|pęset|maszynk)\b/i.test(cleanTitle + ' ' + resolvedPostac);

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
    if (resolvedWydajnosc) {
        addParam('Wydajność deklarowana', resolvedWydajnosc);
    }
    if (resolvedWyrozniki) {
        addParam('Cechy dodatkowe', resolvedWyrozniki);
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
    mandatoryWarnings = [],
    mandatorySafetyWarnings = [],
    euResponsiblePerson = null,
    visionFeatures = {}
} = {}) {
    const resolvedWarnings = (Array.isArray(mandatoryWarnings) && mandatoryWarnings.length > 0)
        ? mandatoryWarnings
        : (Array.isArray(mandatorySafetyWarnings) ? mandatorySafetyWarnings : []);
    const nameLower = String(productName || '').toLowerCase();
    const postacLower = String(visionFeatures?.['Postać'] || '').toLowerCase();
    const isArticle = /\b(szczoteczk|toothbrush|ni[cć]\s+dentystyczn|floss|czyścik|gąbk|akcesori)\b/i.test(nameLower + ' ' + postacLower);
    const isDryPowder = /\b(talk|puder|proszek)\b/i.test(nameLower + ' ' + postacLower) && !isChemical;

    let storageParagraph = '';
    if (isArticle) {
        storageParagraph = `<p>Przechowywać w <b>czystym, suchym i przewiewnym miejscu</b>, w sposób higieniczny, poza zasięgiem małych dzieci.</p>`;
    } else if (isDryPowder) {
        storageParagraph = `<p>Przechowywać w <b>suchym miejscu w temperaturze pokojowej</b>, w szczelnie zamkniętym fabrycznym opakowaniu producenta, chroniąc przed wilgocią i dostępem dzieci.</p>`;
    } else if (isChemical) {
        storageParagraph = `<p>Przechowywać wyłącznie w <b>szczelnie zamkniętym fabrycznym opakowaniu producenta</b>, w chłodnym i suchym miejscu, z dala od źródeł ciepła oraz w miejscu niedostępnym dla dzieci.</p>`;
    } else {
        storageParagraph = `<p>Przechowywać w <b>temperaturze pokojowej (15–25°C)</b>, w szczelnie zamkniętym fabrycznym opakowaniu producenta, z dala od bezpośredniego działania promieni słonecznych i poza zasięgiem dzieci.</p>`;
    }

    const listItems = [];
    const labelTag = isChemical
        ? '<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> '
        : (isArticle ? '<li>⚠️ <b>Wytyczne bezpieczeństwa (GPSR):</b> ' : '<li>⚠️ <b>Środki ostrożności (GPSR):</b> ');

    for (const rawW of resolvedWarnings) {
        if (!rawW || typeof rawW !== 'string') continue;
        let cleanW = sanitizeHtmlClaimsAndStopwords(rawW.trim())
            .replace(/<\/?(?:li|b|strong)[^>]*>/gi, '')
            .replace(/^(?:➡️|⚠️|🛡️|\*|-)\s*/g, '')
            .replace(/^(?:Ostrzeżenie\s+CLP\/GPSR|Ostrzeżenie\s+CLP|Wytyczne\s+bezpieczeństwa\s*\(GPSR\)|Środki\s+ostrożności\s*\(GPSR\))\s*:?\s*/i, '')
            .trim();
        if (!cleanW) continue;
        listItems.push(`${labelTag}${cleanW}</li>`);
    }

    if (euResponsiblePerson && (euResponsiblePerson.name || typeof euResponsiblePerson === 'string')) {
        const formattedEu = brandResponsibleService.formatForHtmlDescription(euResponsiblePerson);
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

    // Zamiana nieautoryzowanych emoji na dozwolone odpowiedniki z białej listy Allegro
    let res = htmlStr
        .replace(/💧|🫧|🌊|🧴|🧽|🧹|🧺|🌸|🍋|🌿|✨|🛡️|💎|👑|🔥|😱|💥|😍|🚀|☘️?|☂️?/gu, (match) => {
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
            cleanInner = cleanInner.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim();
            cleanInner = `${defaultHeadingEmoji} ${cleanInner}`;
        }
        return `<${tag}${attrs}>${cleanInner}</${tag}>`;
    });

    // Upewniamy się, że każdy <li> zaczyna się od dozwolonego emoji (po ewentualnym komentarzu <!-- Applied -->)
    res = res.replace(/<li([^>]*)>(\s*(?:<!--[\s\S]*?-->\s*)*)([\s\S]*?)<\/li>/gi, (full, attrs, comments, inner) => {
        let trimmed = inner.trim();
        const firstEmoji = allowedSet.find(e => trimmed.startsWith(e));
        if (!firstEmoji) {
            trimmed = trimmed.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim();
            trimmed = `${defaultLiEmoji} ${trimmed}`;
        } else {
            // Usuwamy jakiekolwiek dodatkowe emoji ze środka tekstu <li> (wymóg V7 emoji_structure_check)
            const rest = trimmed.substring(firstEmoji.length).replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');
            trimmed = `${firstEmoji}${rest}`;
        }
        return `<li${attrs}>${comments || ''}${trimmed}</li>`;
    });

    return res;
}

module.exports = {
    loadMechanismsDb,
    cleanFeaturesForPrompt,
    sanitizeOfferTitle,
    sanitizeHtmlClaimsAndStopwords,
    buildDeterministicA2Result,
    buildDeterministicA5Result,
    tryBuildDeterministicSection3,
    learnFromAgent4Output,
    buildDeterministicSection5,
    buildDeterministicSection6,
    normalizeEmojiAndStructure
};
