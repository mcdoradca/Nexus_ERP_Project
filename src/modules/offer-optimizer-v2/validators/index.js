const crypto = require('crypto');

// V1
function ean_checksum(gtin) {
    if (!gtin) return { valid: false, error: 'CRITICAL_INPUT_ERROR', details: 'Empty GTIN' };
    const str = String(gtin).trim();
    if (!/^\d{8}$|^\d{13}$|^\d{14}$/.test(str)) {
        return { valid: false, error: 'CRITICAL_INPUT_ERROR', details: 'Invalid EAN length' };
    }
    const digits = str.split('').map(Number);
    const checkDigit = digits.pop();
    let sum = 0;
    digits.reverse().forEach((d, i) => {
        sum += d * (i % 2 === 0 ? 3 : 1);
    });
    const calculatedCheck = (10 - (sum % 10)) % 10;
    if (checkDigit !== calculatedCheck) {
        return { valid: false, error: 'CRITICAL_INPUT_ERROR', details: 'Checksum mismatch' };
    }
    return { valid: true };
}

// V2
function route_chemical(pim) {
    if (!pim) return { is_chemical: false, reasons: [] };
    const reasons = [];
    const cat = (pim.category || '').toLowerCase();
    
    if (cat.includes('chemia') || cat.includes('chemical') || cat.includes('biobójcz') || cat.includes('biocid')) {
        reasons.push('Category chemical/biocidal');
    }
    if (pim.sds_required === true || String(pim.sds_required).toLowerCase() === 'true') {
        reasons.push('SDS required');
    }
    if (pim.raw_ingredients_inci && String(pim.raw_ingredients_inci).trim() !== '') {
        reasons.push('Has INCI ingredients');
    }
    if (pim.clp_signal_word && String(pim.clp_signal_word).trim() !== '') {
        reasons.push('Has CLP signal word');
    }
    
    return { is_chemical: reasons.length > 0, reasons };
}

// V3 — Słowa i frazy zakazane przez Regulamin Allegro (Stan na 2026 r.) + UOKiK Overpromising
function scan_stopwords(html) {
    if (!html) return [];
    const stopwords = [
        // Gwarancje, oświadczenia pewnościowe i autentyczność (najdłuższe frazy najpierw)
        'gwarancj[aeiłąę]* najniższej ceny', 'gwarancj[aeiłąę]* jakoś[ćc]i', 'gwarancj[aeiłąę]* satysfakcji', 'gwarancj[aeiłąę]* zwrotu',
        'gwarancj[aeiłąę]*', 'gwarantuj[a-z]*',
        'udowodnion[a-z]* skutecznoś[ćc]', 'w 100% udowodnion[a-z]*', '100% udowodnion[a-z]*',
        'pewnoś[ćc] działania', 'pewnoś[ćc] zakupu', '100% pewnoś[ćc]i',
        'cudown[a-z]*', 'magiczn[a-z]*', 'niezawodn[a-z]*',
        'oryginalnoś[ćc][a-z]*', 'oryginaln[a-z]*', 'orygina[łl][a-z]*',

        // Promocje, ceny, rabaty
        'najniższa cena', 'nisk[a-z]* cen[a-z]*', 'super cen[a-z]*', 'cen[a-z]* hurtow[a-z]*',
        'gratis[a-z]*', 'darmow[a-z]* dostaw[a-z]*', 'darmow[a-z]*', 'za darmo',
        'tanio', 'tani[a-z]*', 'najtaniej',
        'promocj[aeiłąę]*', 'promocyjn[a-z]*', 'wyprzeda[żz][a-z]*',
        'hit[a-z]* cenow[a-z]*', 'hit[a-z]*',
        'prezent[a-z]*', 'okazj[aeiłąę]*', 'okazyjn[a-z]*',
        'bestseller[a-z]*', 'nowoś[ćc][a-z]*',
        'mega', 'super', 'rabat[a-z]*', 'upust[a-z]*', 'zniżk[aeiłąę]*',

        // CTA, platformowe i manipulacyjne
        'kup teraz', 'kupuj teraz', 'zamów teraz', 'kliknij', 'dodaj do koszyka',
        'polecam[a-z]*', 'sprawdź to', 'tylko u nas',
        'allegro', 'aukcj[aeiłąę]*', 'wysyłk[a-z]* 24h', 'szybka wysyłka',
        'w stylu', 'odpowiednik', 'zamiennik', 'lepsze niż'
    ];
    const pattern = new RegExp(`(^|[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(${stopwords.join('|')})(?=[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|$)`, 'gi');
    const hits = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        hits.push({ word: match[2], index: match.index + match[1].length });
    }
    return hits;
}

// V4
function scan_medical_claims_lexical(html) {
    if (!html) return [];
    const claims = [
        'lecz[yć]*', 'wyleczy[a-z]*', 'uzdrawia[a-z]*', 'terapi[aeiłąę]*', 'lekarstw[a-z]*', 
        'diagnozuj[a-z]*', 'antybiotyk[a-z]*', 'goi rany', 'zapobiega chorobom', 
        'likwiduje (łuszczycę|egzemę|trądzik|azs)', 'regeneruje tkanki chorobowe'
    ];
    const pattern = new RegExp(`(^|[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(${claims.join('|')})(?=[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|$)`, 'gi');
    const hits = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        hits.push({ word: match[2], index: match.index + match[1].length });
    }
    return hits;
}

// V5
function validate_html_whitelist(html) {
    if (!html) return { valid: true, errors: [] };
    const errors = [];
    
    const tagRegex = /<\/?([a-z0-9]+)[^>]*>/gi;
    let match;
    const allowed = ['h1', 'h2', 'p', 'ul', 'ol', 'li', 'strong', 'em'];
    while ((match = tagRegex.exec(html)) !== null) {
        const tag = match[1].toLowerCase();
        if (!allowed.includes(tag)) {
            errors.push(`Disallowed tag: <${tag}>`);
        }
    }
    
    if (/<\s*br\s*\/?>/i.test(html)) errors.push('Contains <br> tag');
    if (/<\s*b\s*>/i.test(html)) errors.push('Contains <b> tag');
    if (/<\s*i\s*>/i.test(html)) errors.push('Contains <i> tag');
    if (/<\s*h[12][^>]*>[\s\S]*?<\s*strong\s*>[\s\S]*?<\s*\/\s*h[12]\s*>/i.test(html)) {
        errors.push('Contains <strong> inside heading');
    }
    if (html.includes('"') || html.includes('„') || html.includes('”')) {
        errors.push('Contains invalid quotes (use apostrophe)');
    }
    if (/<\s*a\b[^>]*>/i.test(html)) errors.push('Contains links');
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(html)) errors.push('Contains email');
    if (/\b(?:https?|ftp):\/\//.test(html)) errors.push('Contains URL');
    if (/\+48[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}/.test(html)) errors.push('Contains phone number');
    
    return { valid: errors.length === 0, errors };
}

// V6
function diff_numeric(html, pim) {
    if (!html || !pim) return { valid: true, mismatches: [] };
    
    const extractNumbers = (text) => {
        const numRegex = /\b(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|%|pH|EAN|szt\.|cm)?\b/gi;
        const nums = [];
        let m;
        while ((m = numRegex.exec(text)) !== null) {
            nums.push({ 
                val: parseFloat(m[1].replace(',', '.')), 
                raw: m[1],
                unit: m[2] ? m[2].toLowerCase() : null 
            });
        }
        return nums;
    };
    
    const pimText = JSON.stringify(pim);
    const htmlNums = extractNumbers(html);
    const pimNums = extractNumbers(pimText);
    
    const mismatches = [];
    htmlNums.forEach(hNum => {
        const found = pimNums.find(pNum => pNum.val === hNum.val && pNum.unit === hNum.unit);
        if (!found) {
            mismatches.push(hNum);
        }
    });
    
    if (mismatches.length > 0) {
        return { valid: false, error: 'HALLUCINATION_DATA_MISMATCH', mismatches };
    }
    return { valid: true };
}

// V7
function emoji_structure_check(html) {
    if (!html) return { valid: true, errors: [] };
    const errors = [];
    
    const banned = ['🔥', '😱', '💥', '😍', '🚀'];
    for (const b of banned) {
        if (html.includes(b)) errors.push(`Banned emoji: ${b}`);
    }
    
    const allowedSet = [
        '⭐','❓','⚙️','✍️','⚖️','⚠️','✅','✔️','☑️','❌','➡️','♻️','⚡','☘','☂️'
    ];
    
    const tagRegex = /<([hl][12i])>(.*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const text = match[2].trim();
        const firstCharEmoji = allowedSet.find(e => text.startsWith(e));
        if (!firstCharEmoji) {
            errors.push(`Element <${match[1]}> does not start with an allowed emoji`);
        } else {
            const rest = text.substring(firstCharEmoji.length).trim();
            // Checking if another emoji is present (naively check common emoji blocks)
            // Some UI symbols block + Emoticons block + Misc Symbols + Dingbats + Transport
            const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
            if (emojiRegex.test(rest)) {
                errors.push(`Emoji in the middle of text in <${match[1]}>`);
            }
        }
    }
    
    // Sekcja 2 (FAQ SEO/GEO): kanoniczny wzorzec par to ❓ Pytanie: / ✔️ Odpowiedź:
    // (pełna walidacja par — V12 aeo_faq_check)
    if (/<(b|strong)>\s*Problem\s*:?\s*<\/\1>/i.test(html)) {
        errors.push('Forbidden Problem label (use ❓ Pytanie:)');
    }
    if (/❌\s*<(b|strong)>\s*Pytanie:/.test(html)) {
        errors.push('Invalid ❌ Pytanie pattern (use ❓ Pytanie:)');
    }

    return { valid: errors.length === 0, errors };
}

const LILIAL_REGEX = /\b(butylphenyl[\s-]*methylpropional|lilial|p[\s-]*bmhca|2-\(4-tert-butylbenzyl\)propionaldehyde)\b/i;

function hasBannedLilial(str) {
    if (!str || typeof str !== 'string') return false;
    return LILIAL_REGEX.test(str);
}

// V8
function gate_ingredients(inci_list) {
    if (!inci_list || !Array.isArray(inci_list)) return { status: 'OK' };
    
    const gate1 = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)',
        'butylphenyl methylpropional', 'lilial', 'p-bmhca', '2-(4-tert-butylbenzyl)propionaldehyde'
    ];
    const gate2 = [
        'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
    ];
    
    const canon = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Przebieg A: Po pozycjach
    for (let i = 0; i < inci_list.length; i++) {
        const item = String(inci_list[i]);
        const canonPos = canon(item);
        
        for (const gate of gate1) {
            const canonWpis = canon(gate);
            if (canonPos === canonWpis || (canonWpis.length >= 8 && canonPos.includes(canonWpis))) {
                return { status: 'BANNED_SUBSTANCE_DETECTED', substance: item };
            }
        }
        for (const gate of gate2) {
            const canonWpis = canon(gate);
            if (canonPos === canonWpis || (canonWpis.length >= 8 && canonPos.includes(canonWpis))) {
                return { status: 'INGREDIENT_NOT_COSMETIC', substance: item };
            }
        }
    }
    
    // Przebieg B: Po całym sklejonym składzie, dla wpisów mających przecinek w nazwie
    const fullInciCanon = canon(inci_list.join(','));
    for (const gate of gate1) {
        if (gate.includes(',')) {
            const canonWpis = canon(gate);
            if (fullInciCanon.includes(canonWpis)) {
                return { status: 'BANNED_SUBSTANCE_DETECTED', substance: gate };
            }
        }
    }
    for (const gate of gate2) {
        if (gate.includes(',')) {
            const canonWpis = canon(gate);
            if (fullInciCanon.includes(canonWpis)) {
                return { status: 'INGREDIENT_NOT_COSMETIC', substance: gate };
            }
        }
    }
    
    return { status: 'OK' };
}

// V9
function c2pa_check(file) {
    return { status: 'C2PA_CHECK_UNAVAILABLE', severity: 'WARNING' };
}

// V10
function freeze_sections(s3, s5, s6) {
    const hash = (data) => crypto.createHash('sha256').update(Buffer.from(data || '', 'utf8')).digest('hex');
    return {
        s3: hash(s3),
        s5: hash(s5),
        s6: hash(s6)
    };
}

function verify_frozen(s3, s5, s6, hashes) {
    const current = freeze_sections(s3, s5, s6);
    const mismatch = [];
    if (current.s3 !== hashes.s3) mismatch.push('s3');
    if (current.s5 !== hashes.s5) mismatch.push('s5');
    if (current.s6 !== hashes.s6) mismatch.push('s6');
    
    if (mismatch.length > 0) return { valid: false, error: 'BLOCKED_CRITICAL', mismatch };
    return { valid: true };
}
// V11
function validate_eu_responsible_person(eu) {
    if (!eu) return { valid: false, error: 'MALFORMED_EU_RESPONSIBLE_PERSON', errors: ['Missing object'] };
    const errors = [];
    
    // Name validation
    if (!eu.name || typeof eu.name !== 'string' || eu.name.trim() === '' || eu.name.length > 200) errors.push('Name empty or exceeds 200 chars');
    if (eu.name) {
        if (eu.name.includes('\n')) errors.push('Name contains newline');
        if (eu.name.includes('@')) errors.push('Name contains @');
        if (eu.name.includes('http')) errors.push('Name contains http');
        if (/\b\d{2}-\d{3}\b/.test(eu.name) || /\b\d{5}\b/.test(eu.name)) errors.push('Name contains postal code');
    }
    
    // Address validation
    if (!eu.address_eu || typeof eu.address_eu !== 'string' || eu.address_eu.trim() === '' || eu.address_eu.length > 250) errors.push('Address empty or exceeds 250 chars');
    if (eu.address_eu) {
        if (eu.address_eu.includes('\n')) errors.push('Address contains newline');
        if (eu.address_eu.includes('@')) errors.push('Address contains @');
        if (eu.address_eu.includes('http')) errors.push('Address contains http');
        if (!/\d/.test(eu.address_eu)) errors.push('Address must contain at least one digit');
    }
    
    // Contact validation
    if (!eu.contact || typeof eu.contact !== 'string' || eu.contact.trim() === '' || eu.contact.length > 250) errors.push('Contact empty or exceeds 250 chars');
    if (eu.contact) {
        const contactLower = eu.contact.toLowerCase();
        if (!contactLower.includes('@') && !contactLower.includes('http') && !contactLower.includes('www.')) errors.push('Contact must contain @, http or www');
    }
    
    return { valid: errors.length === 0, errors };
}

// V12 — Sekcja 2: FAQ SEO/GEO (magnes na wyszukiwarki i agentów AI)
// Kanoniczny wzorzec par (SOT 01 §4, emoji z białej listy Allegro):
// <li>❓ <b>Pytanie:</b> …?</li><li>✔️ <b>Odpowiedź:</b> …</li>

// Deterministyczna normalizacja etykiet i emoji par (idempotentna).
// Naprawia wyłącznie formę etykiet — NIE zamienia twierdzeń w pytania (to egzekwuje aeo_faq_check).
function normalize_aeo_faq_labels(html) {
    if (!html || typeof html !== 'string') return html;
    let res = html;

    // 1. Etykiety pytań: Problem / Question → Pytanie (dwukropek wewnątrz tagu, ewentualny zewnętrzny usuwany)
    res = res.replace(/(<(strong|b)>\s*)(?:Problem|Question|Pytanie)\s*:?\s*(<\/\2>)(\s*:)?/gi, '$1Pytanie:$3');
    // 2. Etykiety odpowiedzi: Answer / Rozwiązanie → Odpowiedź
    res = res.replace(/(<(strong|b)>\s*)(?:Answer|Rozwiązanie|Odpowiedź)\s*:?\s*(<\/\2>)(\s*:)?/gi, '$1Odpowiedź:$3');
    // 3. Emoji przed etykietą pytania → ❓ (obsługa <li>/<p> i komentarzy <!-- Applied -->)
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:❌|🔴|❓|❔)?\s*(<(strong|b)>Pytanie:<\/\3>)/g, '$1❓ $2');
    // 4. Emoji przed etykietą odpowiedzi → ✔️
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:✔️|✔|🟢|💡|✅|☑️)?\s*(<(strong|b)>Odpowiedź:<\/\3>)/g, '$1✔️ $2');

    return res;
}

// Walidacja struktury FAQ: naprzemienne pary Pytanie→Odpowiedź, pytanie zakończone '?',
// niepusta odpowiedź, zakaz etykiet Problem/Rozwiązanie/Answer.
function aeo_faq_check(html) {
    if (!html || typeof html !== 'string' || html.trim() === '') {
        return { valid: false, errors: ['Empty section 2'], pairs: 0 };
    }
    const errors = [];
    const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    if (/<(strong|b)>\s*(?:Problem|Rozwiązanie|Answer)\s*:?\s*<\/\1>/i.test(html)) {
        errors.push('Forbidden label (Problem/Rozwiązanie/Answer)');
    }

    const sequence = [];
    const itemRegex = /<(li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
        const inner = match[2].replace(/<!--[\s\S]*?-->/g, '').trim();
        const q = inner.match(/^❓\s*<(strong|b)>Pytanie:<\/\1>\s*([\s\S]*)$/);
        if (q) {
            sequence.push({ type: 'Q', text: stripTags(q[2]) });
            continue;
        }
        const a = inner.match(/^✔️\s*<(strong|b)>Odpowiedź:<\/\1>\s*([\s\S]*)$/);
        if (a) {
            sequence.push({ type: 'A', text: stripTags(a[2]) });
        }
    }

    const questions = sequence.filter(s => s.type === 'Q');
    const answers = sequence.filter(s => s.type === 'A');

    if (questions.length === 0) errors.push('No ❓ Pytanie: items');
    if (questions.length !== answers.length) {
        errors.push(`Unpaired Q/A (${questions.length}/${answers.length})`);
    }
    for (let i = 0; i < sequence.length; i++) {
        const expected = i % 2 === 0 ? 'Q' : 'A';
        if (sequence[i].type !== expected) {
            errors.push(`Broken Q/A order at item ${i + 1}`);
            break;
        }
    }
    questions.forEach((q, i) => {
        if (!/\?\s*$/.test(q.text)) errors.push(`Question ${i + 1} is not a question (missing '?')`);
    });
    answers.forEach((a, i) => {
        if (a.text.length === 0) errors.push(`Answer ${i + 1} is empty`);
    });

    return { valid: errors.length === 0, errors, pairs: Math.min(questions.length, answers.length) };
}

function validate_section5_compliance(html, options = {}) {
    if (!html || typeof html !== 'string') return { valid: true, errors: [] };
    const errors = [];

    const isMedicalDevice = options.is_medical_device === true ||
                            options.medical_device === true ||
                            /\b(?:wyr[oó]b\s+medyczny|medical\s+device)\b/i.test(JSON.stringify(options));

    if (!isMedicalDevice) {
        if (/<li[^>]*>[\s\S]*?Certyfikat(?:y)?[\s\S]*?\bCE\b[\s\S]*?<\/li>/i.test(html)) {
            errors.push('Contains illegal CE marking for non-medical cosmetic or chemical product');
        }
    }

    const isAnhydrousOrArticle = /\b(puder|pudru|talk|talku|proszek|proszku|shadow|cie[nń]|cienie|puder mineralny|szczoteczk|artyku[lł]|ni[cć] dentystyczn|olej\b|olejek\b)\b/i.test(JSON.stringify(options) + ' ' + html);

    if (isAnhydrousOrArticle) {
        if (/<li[^>]*>[\s\S]*?pH:?[\s\S]*?<\/li>/i.test(html)) {
            errors.push('Contains pH claim for anhydrous product or article (physicochemical impossibility)');
        }
    } else {
        if (/<li[^>]*>[\s\S]*?pH:?[\s\S]*?(?:zbilansowane|neutralne|fizjologiczne|odpowiednie|w[lł]a[sś]ciwe|optymalne|brak danych|null)[\s\S]*?<\/li>/i.test(html)) {
            errors.push('Contains non-numeric marketing pH claim');
        }
    }

    return { valid: errors.length === 0, errors };
}

function validate_section6_compliance(html, options = {}) {
    if (!html || typeof html !== 'string') return { valid: true, errors: [] };
    const errors = [];

    // 1. ZAKAZ ZBITKÓW KODÓW P (np. P305+P351+P338 + P337+P313 w jednej linii)
    const gluedPRegex = /P\d{3}(?:\+P\d{3})*\s*\+\s*P\d{3}/i;
    if (gluedPRegex.test(html)) {
        errors.push('Contains glued multi-procedure P-codes with plus operator (must be separated into distinct <li> items)');
    }

    // 2. ZAKAZ HYBRYDY Ostrzeżenie CLP/GPSR:
    if (/CLP\/GPSR/i.test(html)) {
        errors.push('Contains illegal hybrid label CLP/GPSR (must be CLP for chemicals, GPSR for cosmetics/articles)');
    }

    // 3. Weryfikacja wymogu P280 dla H319/H318
    const hasEyeIrritation = options.has_eye_irritation === true ||
                            (Array.isArray(options.h_phrases) && options.h_phrases.some(h => /H319|H318/i.test(h)));
    if (hasEyeIrritation && !html.includes('P280')) {
        errors.push('Missing mandatory P280 eye protection statement for H319/H318 classification');
    }

    // 4. Weryfikacja EUH208 przy obecności alergenów w chemii
    if (options.has_sensitizers === true && !html.includes('EUH208') && options.is_chemical === true) {
        errors.push('Missing mandatory EUH208 allergen statement for chemical mixture with sensitizers');
    }

    return { valid: errors.length === 0, errors };
}

function validate_section3_ingredients_closed_world(html, allowedIngredients = []) {
    if (!html || typeof html !== 'string') return { valid: true, errors: [] };
    const errors = [];

    const allowedLower = (allowedIngredients || []).map(i => String(i).toLowerCase().trim()).filter(Boolean);
    if (allowedLower.length === 0) {
        return { valid: true, errors: [] };
    }

    // Wyciągamy nagłówki/nazwy składników z punktów <li> w sekcji 3
    const itemRegex = /<li[^>]*>\s*(?:⚙️|⚡)?\s*<b>\s*(?:Składnik:?\s*)?([^:<]+?)\s*:\s*<\/b>/gi;
    let match;
    const knownPreservativesAndActives = [
        'phenoxyethanol', 'fenoksyetanol', 'parabens', 'parabeny', 'dmdm hydantoin',
        'triclosan', 'triklosan', 'chlorhexidine', 'chlorheksydyna', 'bht', 'bha'
    ];

    while ((match = itemRegex.exec(html)) !== null) {
        const ingredientClaim = match[1].toLowerCase().trim();
        for (const chem of knownPreservativesAndActives) {
            if (ingredientClaim.includes(chem)) {
                const isAllowed = allowedLower.some(allowed => allowed.includes(chem));
                if (!isAllowed) {
                    errors.push(`UNAUTHORIZED_HALLUCINATED_INGREDIENT: ${match[1]} (not present in product documentation)`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

module.exports = {
    ean_checksum,
    route_chemical,
    scan_stopwords,
    scan_medical_claims_lexical,
    validate_html_whitelist,
    diff_numeric,
    emoji_structure_check,
    gate_ingredients,
    c2pa_check,
    freeze_sections,
    verify_frozen,
    validate_eu_responsible_person,
    normalize_aeo_faq_labels,
    aeo_faq_check,
    hasBannedLilial,
    validate_section5_compliance,
    validate_section6_compliance,
    validate_section3_ingredients_closed_world
};
