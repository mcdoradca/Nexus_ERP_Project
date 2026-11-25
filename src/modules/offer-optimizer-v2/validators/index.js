const crypto = require('crypto');
const cheerio = require('cheerio');
const { isRawInciFooterText } = require('../normalization');
const { classifyProductPhysicalForm } = require('../services/product-form.classifier');
const { scanStrictStopwords, scanAllegroComplianceRisks, getHighlightSemanticCluster } = require('../services/allegro-compliance.policy');
const {
    isNoRinseFormula,
    hasDeclaredOdorNeutralizer,
    detectRawCatalogNameLeak,
    FRAGRANCE_ALLERGEN_MOLECULES,
    FILLER_OR_PRESERVATIVE_HEADINGS_REGEX,
    isFabricSoftenerProduct,
    isGenericCategoryWordNotLine,
    resolveLabelPhysicalForm,
    validateDosageYieldMath
} = require('../services/label-truth.helpers');
const gpsrSafetyService = require('../services/gpsr.safety.service');

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

// V3 — Słowa i frazy zakazane przez Regulamin Allegro (Stan na 2026 r.) + UOKiK Overpromising (delegowane do SSOT allegro-compliance.policy)
function scan_stopwords(html) {
    return scanStrictStopwords(html);
}

// V3b — Pełny skaner ryzyk niejawnych i botowych Allegro 2026 (rankingi, obce marki, hype XXL, technologie, 2. osoba, greenwashing, obce slogany)
function scan_allegro_implicit_risks(html, options = {}) {
    return scanAllegroComplianceRisks(html, options);
}

// V4 — Roszczenia medyczne (WE 1223/2009, 655/2013) oraz nieautoryzowane roszczenia biobójcze (BPR 528/2012)
function scan_biocidal_claims_lexical(html) {
    if (!html) return [];
    const biocidalClaims = [
        'antybakteryjn[a-ząćęłńóśźż]*', 'przeciwbakteryjn[a-ząćęłńóśźż]*',
        'przeciwwirusow[a-ząćęłńóśźż]*', 'antywirusow[a-ząćęłńóśźż]*',
        'biobójcz[a-ząćęłńóśźż]*', 'bakteriobójcz[a-ząćęłńóśźż]*', 'wirusobójcz[a-ząćęłńóśźż]*',
        'grzybobójcz[a-ząćęłńóśźż]*', 'pleśniobójcz[a-ząćęłńóśźż]*', 'przeciwgrzybicz[a-ząćęłńóśźż]*',
        'dezynfekuj[a-ząćęłńóśźż]*', 'dezynfekcj[a-ząćęłńóśźż]*',
        'odkażaj[a-ząćęłńóśźż]*', 'odkaża[a-ząćęłńóśźż]*', 'sterylizuj[a-ząćęłńóśźż]*',
        'antibatteric[oaie]', 'igienizzant[ei]', 'disinfettant[ei]',
        '(?:zabija|usuwa|eliminuje|likwiduje|zwalcza)\\s+(?:do\\s+)?(?:99[.,]9%\\s*)?(?:bakteri[eią]|wirusy|wirusów|zarazki|zarazków|drobnoustroje|drobnoustrojów|mikroby|mikrobów|pleśń|grzyby)',
        '99[.,]9%\\s*(?:bakterii|wirusów|zarazków|drobnoustrojów|mikrobów)'
    ];
    const pattern = new RegExp(`(^|[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(${biocidalClaims.join('|')})(?=[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|$)`, 'gi');
    const hits = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        hits.push({ word: match[2], index: match.index + match[1].length });
    }
    return hits;
}

function scan_medical_claims_lexical(html) {
    if (!html) return [];
    const claims = [
        'lecz[yć]*', 'wyleczy[a-z]*', 'uzdrawia[a-z]*', 'terapi[aeiłąę]*', 'lekarstw[a-z]*', 
        'diagnozuj[a-z]*', 'antybiotyk[a-z]*', 'goi rany', 'zapobiega chorobom', 
        'likwiduje (łuszczycę|egzemę|trądzik|azs)', 'regeneruje tkanki chorobowe',
        'antybakteryjn[a-ząćęłńóśźż]*', 'przeciwbakteryjn[a-ząćęłńóśźż]*',
        'przeciwwirusow[a-ząćęłńóśźż]*', 'antywirusow[a-ząćęłńóśźż]*',
        'biobójcz[a-ząćęłńóśźż]*', 'bakteriobójcz[a-ząćęłńóśźż]*', 'wirusobójcz[a-ząćęłńóśźż]*',
        'grzybobójcz[a-ząćęłńóśźż]*', 'pleśniobójcz[a-ząćęłńóśźż]*', 'przeciwgrzybicz[a-ząćęłńóśźż]*',
        'dezynfekuj[a-ząćęłńóśźż]*', 'dezynfekcj[a-ząćęłńóśźż]*',
        'odkażaj[a-ząćęłńóśźż]*', 'odkaża[a-ząćęłńóśźż]*', 'sterylizuj[a-ząćęłńóśźż]*',
        'antibatteric[oaie]', 'igienizzant[ei]', 'disinfettant[ei]',
        '(?:zabija|usuwa|eliminuje|likwiduje|zwalcza)\\s+(?:do\\s+)?(?:99[.,]9%\\s*)?(?:bakteri[eią]|wirusy|wirusów|zarazki|zarazków|drobnoustroje|drobnoustrojów|mikroby|mikrobów|pleśń|grzyby)',
        '99[.,]9%\\s*(?:bakterii|wirusów|zarazków|drobnoustrojów|mikrobów)'
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
    
    const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
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
            const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
            if (emojiRegex.test(rest)) {
                errors.push(`Emoji in the middle of text in <${match[1]}>`);
            }
        }
    }
    
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
    
    if (!eu.name || typeof eu.name !== 'string' || eu.name.trim() === '' || eu.name.length > 200) errors.push('Name empty or exceeds 200 chars');
    if (eu.name) {
        if (eu.name.includes('\n')) errors.push('Name contains newline');
        if (eu.name.includes('@')) errors.push('Name contains @');
        if (eu.name.includes('http')) errors.push('Name contains http');
        if (/\b\d{2}-\d{3}\b/.test(eu.name) || /\b\d{5}\b/.test(eu.name)) errors.push('Name contains postal code');
    }
    
    if (!eu.address_eu || typeof eu.address_eu !== 'string' || eu.address_eu.trim() === '' || eu.address_eu.length > 250) errors.push('Address empty or exceeds 250 chars');
    if (eu.address_eu) {
        if (eu.address_eu.includes('\n')) errors.push('Address contains newline');
        if (eu.address_eu.includes('@')) errors.push('Address contains @');
        if (eu.address_eu.includes('http')) errors.push('Address contains http');
        if (!/\d/.test(eu.address_eu)) errors.push('Address must contain at least one digit');
    }
    
    // Pole contact jest opcjonalne (zgodnie z zakazem umieszczania danych kontaktowych/domen na Allegro)
    if (eu.contact && typeof eu.contact === 'string' && eu.contact.trim() !== '') {
        if (eu.contact.length > 250) errors.push('Contact exceeds 250 chars');
        const contactLower = eu.contact.toLowerCase();
        if (!contactLower.includes('@') && !contactLower.includes('http') && !contactLower.includes('www.')) errors.push('Contact must contain @, http or www');
    }
    
    return { valid: errors.length === 0, errors };
}

// V12 — Sekcja 2: FAQ SEO/GEO (magnes na wyszukiwarki i agentów AI)
function normalize_aeo_faq_labels(html) {
    if (!html || typeof html !== 'string') return html;
    let res = html.replace(/<(strong|b)>\s*(?:Problem|Question|Pytanie|Q)\s*(?:\d+\s*)?:\s*([^<]+)<\/\1>/gi, '<$1>Pytanie:</$1> <$1>$2</$1>');
    res = res.replace(/<(strong|b)>\s*(?:Answer|Rozwiązanie|Odpowiedź|A)\s*(?:\d+\s*)?:\s*([^<]+)<\/\1>/gi, '<$1>Odpowiedź:</$1> <$1>$2</$1>');

    res = res.replace(/(<(strong|b)>\s*)(?:Problem|Question|Pytanie|Q)\s*(?:\d+\s*)?:?\s*(<\/\2>)(\s*:)?/gi, '$1Pytanie:$3');
    res = res.replace(/(<(strong|b)>\s*)(?:Answer|Rozwiązanie|Odpowiedź|A)\s*(?:\d+\s*)?:?\s*(<\/\2>)(\s*:)?/gi, '$1Odpowiedź:$3');
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:❌|🔴|❓|❔|✔️|✔|✅|☑️|➡️|⭐)?\s*(?:Problem|Question|Pytanie)\s*(?:\d+\s*)?:\s*/gi, '$1❓ <b>Pytanie:</b> ');
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:✔️|✔|🟢|💡|✅|☑️|➡️|⭐)?\s*(?:Answer|Rozwiązanie|Odpowiedź)\s*(?:\d+\s*)?:\s*/gi, '$1✔️ <b>Odpowiedź:</b> ');
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:❌|🔴|❓|❔|✔️|✔|✅|☑️|➡️|⭐)?\s*(<(strong|b)>Pytanie:<\/\3>)/g, '$1❓ $2');
    res = res.replace(/(<(?:li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)(?:✔️|✔|🟢|💡|✅|☑️|➡️|⭐)?\s*(<(strong|b)>Odpowiedź:<\/\3>)/g, '$1✔️ $2');

    res = res.replace(/(<(li|p)\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*)([\s\S]*?)(<\/\2>)/gi, (full, openTag, tagName, inner, closeTag) => {
        const trimmed = inner.trim();
        if (!trimmed) return full;
        if (/^❓\s*<(?:strong|b)>Pytanie:<\/(?:strong|b)>/i.test(trimmed)) return full;
        if (/^✔️\s*<(?:strong|b)>Odpowiedź:<\/(?:strong|b)>/i.test(trimmed)) return full;

        if (/^❓\s*/.test(trimmed)) {
            const rest = trimmed.replace(/^❓\s*/, '');
            return `${openTag}❓ <b>Pytanie:</b> ${rest}${closeTag}`;
        }

        const plainText = trimmed.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();
        if (/\?\s*$/.test(plainText) && !/Odpowiedź:/i.test(plainText)) {
            const rest = trimmed.replace(/^(?:✔️|✔|✅|☑️|➡️|⭐|❓|❔|❌|🔴)\s*/u, '');
            return `${openTag}❓ <b>Pytanie:</b> ${rest}${closeTag}`;
        }

        if (/^✔️\s*/.test(trimmed) && !/\?\s*$/.test(plainText) && !/Pytanie:/i.test(plainText) && plainText.length > 0) {
            const rest = trimmed.replace(/^✔️\s*/, '');
            return `${openTag}✔️ <b>Odpowiedź:</b> ${rest}${closeTag}`;
        }

        return full;
    });

    return res;
}

function aeo_faq_check(html) {
    if (!html || typeof html !== 'string' || html.trim() === '') {
        return { valid: false, errors: ['Empty section 2'], pairs: 0 };
    }
    const errors = [];
    const stripTags = (s) => s.replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

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

    const formCheck = classifyProductPhysicalForm({
        productName: options.product_name || options.name || options.productName,
        category: options.category,
        postac: options.postac || options.features?.['Postać'] || options.features?.postac,
        inci: options.inci || options.features?.['Skład/INCI'] || options.features?.INCI,
        features: options.features,
        rawText: html
    });
    const isAnhydrousOrArticle = formCheck.isAnhydrousOrArticle;

    if (isAnhydrousOrArticle) {
        if (/<li[^>]*>[\s\S]*?pH:?[\s\S]*?<\/li>/i.test(html)) {
            errors.push('Contains pH claim for anhydrous product or article (physicochemical impossibility)');
        }
    } else {
        if (/<li[^>]*>[\s\S]*?pH:?[\s\S]*?(?:zbilansowane|neutralne|fizjologiczne|odpowiednie|w[lł]a[sś]ciwe|optymalne|brak danych|null)[\s\S]*?<\/li>/i.test(html)) {
            errors.push('Contains non-numeric marketing pH claim');
        }
    }

    if (options.require_manufacturer && options.manufacturer) {
        const hasProducer = /<li[^>]*>[\s\S]*?Producent:?[\s\S]*?<\/li>/i.test(html);
        if (!hasProducer) {
            errors.push(`Missing manufacturer (${options.manufacturer}) in technical specifications Section 5`);
        }
    }

    const s5Risks = scanAllegroComplianceRisks(html, {
        sectionType: 'section5',
        brand: options.brand,
        productName: options.product_name || options.name || options.productName
    });
    for (const r of s5Risks) {
        errors.push(`[Sekcja 5 Marketing/Allegro] Niedozwolone lub ryzykowne sformułowanie w specyfikacji technicznej: "${r.word}" (${r.label})`);
    }

    const plainS5 = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn\s*[\/+-]?\s*żel|żel\s*[\/+-]?\s*płyn)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(plainS5)) {
        errors.push('[Sekcja 5 Specyfikacja] Niedozwolona hybrydowa postać "płyn żel" / "żel płyn" — użyj jednej zweryfikowanej postaci z etykiety.');
    }

    const s5VisionFeats = options.vision_features || options.visionFeatures || {};
    const s5Features = options.features || {};
    const s5LabelForm = resolveLabelPhysicalForm({
        visionFeatures: s5VisionFeats,
        features: s5Features,
        officialLabelName: options.official_label_name || s5VisionFeats['Nazwa produktu (Etykieta Front)'] || s5VisionFeats['Nazwa produktu (Kontretykieta)'] || s5Features['Nazwa produktu (Etykieta Front)'] || '',
        rawProductName: options.product_name || options.name || options.productName || ''
    });

    const isSoftenerS5 = isFabricSoftenerProduct({
        productName: options.product_name || options.name || options.productName || '',
        category: options.category || s5Features['Kategoria'] || '',
        visionFeatures: s5VisionFeats,
        features: s5Features
    });
    if (isSoftenerS5 && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:prać\s+w\s+pralce|prani[eu]\s+w\s+pralce|prać\s+ręcznie|prani[eu]\s+ręczn[eym]+|płakanie|płukannie)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(plainS5)) {
        errors.push('[Sekcja 5 Specyfikacja – Płyn do płukania] Wykryto błędne określenie "prać w pralce" / "pranie" lub literówkę ("płakanie") zamiast "płukanie".');
    }

    try {
        const $s5 = cheerio.load(html);
        $s5('li').each((_, el) => {
            const itemText = $s5(el).text().replace(/\s+/g, ' ').replace(/^[\W_➡️•✔️✅]+/u, '').trim();
            const colonIdx = itemText.indexOf(':');
            if (colonIdx <= 0) return;
            const key = itemText.slice(0, colonIdx).trim();
            const val = itemText.slice(colonIdx + 1).trim();
            if (!val) return;

            if (/^linia\s+produktowa$/i.test(key) && isGenericCategoryWordNotLine(val)) {
                errors.push(`[Sekcja 5 Specyfikacja] Generyczne słowo kategorii "${val}" nie może występować jako "Linia produktowa".`);
            }

            if (/^posta[cć]\s+fizyczna$/i.test(key) && s5LabelForm.isVerifiedFromLabel && s5LabelForm.canonicalForm) {
                const vLow = val.toLowerCase();
                let formMismatch = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn\s*[\/+-]?\s*żel|żel\s*[\/+-]?\s*płyn)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(vLow);
                if (!formMismatch && s5LabelForm.canonicalForm === 'płyn' && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|zel|w\s+żelu|proszek|w\s+proszku|tabletki|kapsułki|kostka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(vLow) && !/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])płyn/i.test(vLow)) {
                    formMismatch = true;
                } else if (!formMismatch && s5LabelForm.canonicalForm === 'żel' && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:proszek|w\s+proszku|tabletki|kapsułki|kostka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(vLow)) {
                    formMismatch = true;
                } else if (!formMismatch && s5LabelForm.canonicalForm === 'proszek' && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn|w\s+płynie|żel|w\s+żelu|spray|w\s+sprayu)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(vLow)) {
                    formMismatch = true;
                } else if (!formMismatch && s5LabelForm.canonicalForm === 'w sprayu' && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|w\s+żelu|proszek|w\s+proszku|tabletki|kapsułki|kostka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(vLow)) {
                    formMismatch = true;
                }
                if (formMismatch) {
                    errors.push(`[Sekcja 5 Specyfikacja] Niezgodna postać fizyczna "${val}" względem etykiety produktu ("${s5LabelForm.canonicalForm}").`);
                }
            }

            if (/^(?:właściwości\s+i\s+wyróżniki|cechy\s+dodatkowe)$/i.test(key)) {
                const parts = val.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
                const seenClusters = new Map();
                for (const part of parts) {
                    const cluster = getHighlightSemanticCluster(part);
                    if (cluster) {
                        if (seenClusters.has(cluster)) {
                            errors.push(`[Sekcja 5 Specyfikacja] Semantyczny duplikat w "${key}" (klaster ${cluster}): "${part}" powiela "${seenClusters.get(cluster)}".`);
                        } else {
                            seenClusters.set(cluster, part);
                        }
                    }
                }
            }
        });
    } catch {
        // fallback na wypadek nietypowego HTML
    }

    return { valid: errors.length === 0, errors };
}

function validate_section6_compliance(html, options = {}) {
    if (!html || typeof html !== 'string') return { valid: true, errors: [] };
    const errors = [];

    if (/P301\s*–\s*W\s+PRZYPADKU\s+POŁKNIĘCIA:\s*<\/li>/i.test(html) ||
        /P305\s*–\s*W\s+PRZYPADKU\s+DOSTANIA\s+SIĘ\s+DO\s+OCZU:\s*<\/li>/i.test(html) ||
        /P337\s*–\s*W\s+przypadku\s+utrzymywania\s+się\s+działania\s+drażniącego\s+na\s+oczy:\s*<\/li>/i.test(html)) {
        errors.push('Contains severed incomplete P-code conditional triggers (must use full compound CLP formulas: P301+P312, P305+P351+P338, P337+P313)');
    }

    if (options.is_chemical && /<(?:b|strong)>\s*Ostrzeżenie\s+CLP:\s*<\/(?:b|strong)>/i.test(html)) {
        errors.push("Missing '/GPSR' in label tag: must use unified Allegro ecosystem tag '<b>Ostrzeżenie CLP/GPSR:</b>'");
    }

    if (options.is_chemical && /Hasło\s+ostrzegawcze:\s*(?:UWAGA|NIEBEZPIECZEŃSTWO)/i.test(html)) {
        errors.push("Signal word label must use dash delimiter: 'Hasło ostrzegawcze – UWAGA' (or NIEBEZPIECZEŃSTWO) instead of colon");
    }
    if (/W\s+PRZYPADKU\s+(?:POŁKNIĘCIA|DOSTANIA\s+SIĘ\s+DO\s+OCZU|KONTAKTU\s+ZE\s+SKÓRĄ)\s*[–-]/i.test(html) || /W\s+przypadku\s+utrzymywania\s+się\s+działania\s+drażniącego\s+na\s+oczy\s*[–-]/i.test(html)) {
        errors.push('CLP conditional trigger header must end with a statutory colon (:), not a dash');
    }

    const hasEyeIrritation = options.has_eye_irritation === true ||
                            (Array.isArray(options.h_phrases) && options.h_phrases.some(h => /H319|H318/i.test(h)));
    if (false && hasEyeIrritation && !html.includes('P280')) {
        errors.push('Missing mandatory P280 eye protection statement for H319/H318 classification');
    }

    if (hasEyeIrritation && !html.includes('P264')) {
        errors.push('Missing mandatory P264 hand washing statement for H319/H318 classification');
    }

    if (options.has_sensitizers === true && !html.includes('EUH208') && options.is_chemical === true) {
        errors.push('Missing mandatory EUH208 allergen statement for chemical mixture with sensitizers');
    }

    if (/\bKONTATKT?U\b/i.test(html)) {
        errors.push('Orthographic typo in CLP phrase ("KONTATKU" instead of "STYCZNOŚCI" / "KONTAKTU")');
    }

    // Wykrywanie urwanych fragmentów procedur CLP oraz surowych nazw składników / list alergenów z INCI wklejonych jako osobne ostrzeżenia <li>
    const liMatches = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    for (const li of liMatches) {
        const plain = li
            .replace(/<\/?[a-zA-Z][^>]*>/g, '')
            .replace(/^(?:➡️|⚠️|🛡️|\*|-)\s*/g, '')
            .replace(/^(?:Ostrzeżenie\s+CLP\/GPSR|Ostrzeżenie\s+CLP|Wytyczne\s+bezpieczeństwa\s*\(GPSR\)|Środki\s+ostrożności\s*\(GPSR\))\s*:?\s*/i, '')
            .trim();
        if (!/^(?:P\d{3}|H\d{3}|EUH\d{3}|Hasło\s+ostrzegawcze)/i.test(plain)) {
            if (/^(?:Spłukać\s+skórę\s+pod\s+strumieniem\s+wody|NIE\s+wywoływać\s+wymiotów|Może\s+(?:uwalniać|wydzielać)\s+niebezpieczne\s+gazy|Natychmiast\s+zdjąć\s+całą\s+zanieczyszczoną\s+odzież)\b/i.test(plain)) {
                errors.push(`Severed/duplicated CLP fragment as standalone item: "${plain}"`);
            }
            if ((/\balkohol[ei]\s+C\d{1,2}[-–]\d{1,2}\b/i.test(plain) && /(?:etoksylowan|siarczanowan|sole\s+sodow)/i.test(plain)) ||
                /^(?:Skład(?:\s+INCI)?|INCI|Zawiera)\s*[:–-]/i.test(plain) ||
                /^Produkt\s+zawiera\s+(?:kompozycję\s+zapachową|składniki\s+kompozycji\s+zapachowej|substancje\s+zapachowe)\b[^\n]*\balergen/i.test(plain)) {
                errors.push(`Raw chemical ingredient leaked as safety warning: "${plain}"`);
            }
        }
    }

    if (/\bH314\b/i.test(html) && /\bP301\+P312\b/i.test(html)) {
        errors.push('Corrosive H314 product must use P301+P330+P331 instead of mild P301+P312');
    }
    if (/\bP303\+P361\+P353\b/i.test(html) && /\bP302\+P352\b/i.test(html)) {
        errors.push('Duplicate skin-contact procedure: P302+P352 must not appear alongside P303+P361+P353');
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

    const itemRegex = /<li[^>]*>\s*(?:⚙️|⚡)?\s*<(?:b|strong)>\s*(?:Składnik:?\s*)?([^:<]+?)\s*:\s*<\/(?:b|strong)>/gi;
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

/**
 * V10 — Walidator logiki domenowej, spójności pomieszczeń, bezpieczeństwa materiałowego (chlor/armatura/tkaniny)
 * oraz Medical Whitelisting (P302+P352 STYCZNOŚCI ZE SKÓRĄ) i anty-spamowania FAQ.
 */
function validate_domain_and_chemical_logic(sectionsObj = {}, context = {}) {
    const errors = [];
    const s1 = String(sectionsObj.section_1_html || '');
    const s2 = String(sectionsObj.section_2_html || '');
    const s3 = String(sectionsObj.section_3_html || '');
    const s4 = String(sectionsObj.section_4_html || '');
    const s5 = String(sectionsObj.section_5_html || '');
    const s6 = String(sectionsObj.section_6_html || '');
    const allHtml = `${s1}\n${s2}\n${s3}\n${s4}\n${s6}`;

    const prodName = String(context.productName || '').toLowerCase();
    const inci = String(context.inci || '').toLowerCase();
    const detComp = String(context.detergentComposition || '').toLowerCase();
    const isChlorineBleach = /(?:sodium\s+hypochlorite|podchloryn\s+sodu|candeggina|aktywn[a-ząćęłńóśźż]*\s+wybielacz|chlorine\s+bleach|z\s+chlorem)/i.test(`${prodName} ${inci} ${detComp}`);
    const isBathroomDedicated = /(?:do\s+łazienek|do\s+łazienki|łazienkow[a-ząćęłńóśźż]*|do\s+toalet|do\s+wc|sanitarn[a-ząćęłńóśźż]*)/i.test(prodName) &&
        !/(?:kuchni|kuchenn|uniwersaln)/i.test(prodName);

    // 1. Ryzyko zniszczenia mienia: chlor / podchloryn sodu rekomendowany do armatury
    if (isChlorineBleach) {
        if (/(?:gładkoś[ćc]\s+armatury|pielęgnuj[a-ząćęłńóśźż]*\s+armatur|czyszczeni[ea]\s+armatury|do\s+armatury\s+i\s+płytek|bezpieczn[a-ząćęłńóśźż]*\s+dla\s+armatury)/i.test(`${s1} ${s2} ${s4}`)) {
            errors.push('[Ryzyko zniszczenia mienia] Preparat z podchlorynem sodu (chlorem) nie może być rekomendowany do czyszczenia armatury (powoduje korozję i czernienie chromu/mosiądzu).');
        }
        if (/tkanin[ay]\s+kolorow[ea]/i.test(allHtml)) {
            errors.push('[Nieprecyzyjne wykluczenie tkanin] Wybielacz żelowy z NaOH/NaOCl niszczy wszelkie włókna tekstylne – wykluczenie musi dotyczyć wszelkich tkanin i tekstyliów, nie tylko "tkanin kolorowych".');
        }
    }

    // 2. Kalki maszynowe z odświeżaczy / płynów do płukania (np. "na tkaninach" w chemii twardych powierzchni)
    if (context.isChemical && !/(?:prani|płukani|tkanin|odplamiacz|wybielacz\s+do\s+tkanin)/i.test(prodName)) {
        if (/pozostawia\s+we\s+wnętrzu\s+lub\s+na\s+tkaninach/i.test(allHtml)) {
            errors.push('[Kalka maszynowa] Niedopuszczalny zwrot "na tkaninach" przy opisie Parfum w preparacie do twardych powierzchni.');
        }
        if (/(?:czyszczenia\s+lub\s+prania|lub\s+prania|albo\s+prania)/i.test(allHtml)) {
            errors.push('[Kalka pralnicza] Niedopuszczalny zwrot z prania ("lub prania") w preparacie nieprzeznaczonym do tkanin/prania.');
        }
    }

    // 3. Mieszanie kuchni z łazienką w produkcie dedykowanym wyłącznie do łazienek/toalet
    if (isBathroomDedicated) {
        if (/(?:w\s+kuchni|osady\s+kuchenne|tłuszczu\s+kuchennego|przypalon[a-ząćęłńóśźż]*\s+tłuszcz|z\s+kawy\s+i\s+herbaty)/i.test(`${s1} ${s2} ${s3} ${s4}`)) {
            errors.push('[Niespójność domenowa] Produkt dedykowany do łazienek zawiera wklejki z odtłuszczacza kuchennego (kuchnia / przypalony tłuszcz / plamy z kawy i herbaty).');
        }
    }

    // 4. Błędy gramatyczne fleksji zapachów
    if (/o\s+zapachu\s+świeży\b/i.test(allHtml)) {
        errors.push('[Błąd gramatyczny] Kalka językowa "o zapachu świeży" (wymagane: "o świeżym zapachu").');
    }
    if (/w\s+wariancie\s+zapachowym\s+[a-ząćęłńóśźż]+y(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml)) {
        errors.push('[Błąd gramatyczny] Kalka "w wariancie zapachowym [przymiotnik]" (wymagane: "o zapachu [przymiotnik odmieniony]" np. "o zapachu cytrynowym").');
    }

    // 5. Medical Whitelisting w P302+P352 / P303 ("W PRZYPADKU KONTAKTU/KONTATKU ZE SKÓRĄ" -> "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ")
    if (/W\s+PRZYPADKU\s+(?:KONTAKTU|KONTATKU)\s+ZE\s+SKÓRĄ/i.test(s6)) {
        errors.push('[Medical Whitelisting CLP] W Sekcji 6 użyto zakazanego słowa "KONTAKTU/KONTATKU ZE SKÓRĄ" zamiast "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ".');
    }

    // 6. Obowiązkowe ostrzeżenie "Nie połykać." w sklasyfikowanej chemii gospodarczej (z poszanowaniem łagodnych produktów z etykietą 1:1 bez klasyfikacji CLP H3xx)
    const rawLabelW = String(context.pimWarnings || '').trim();
    const isMildUnclassifiedWithExplicitLabel = Boolean(
        rawLabelW.length >= 10 &&
        !/(?:\bH3\d{2}\b|\bP301\b|uwaga|niebezpieczeństwo|attenzion|pericol|danger|warning|nie\s+połykać|non\s+ingerire|do\s+not\s+swallow|połknięc)/i.test(`${rawLabelW} ${s6}`)
    );
    if (context.isChemical && !isMildUnclassifiedWithExplicitLabel && s6 && !/nie\s+połykać/i.test(s6)) {
        errors.push('[Brak ostrzeżenia BHP] W Sekcji 6 brakuje obowiązkowego ostrzeżenia "Nie połykać.".');
    }

    // 7. Halucynacja alergenów zapachowych w Sekcji 3
    if (/(?:Limonene|Linalool|Hexyl Cinnamal)/i.test(s3) && !/(?:limonene|linalool|hexyl\s+cinnamal)/i.test(`${inci} ${detComp}`)) {
        errors.push('[Halucynacja składników] W Sekcji 3 wymieniono niesprawdzone alergeny (Limonene, Linalool lub Hexyl Cinnamal), których brak w oficjalnym składzie INCI/detergentu.');
    }

    // 8. Kalka pralnicza / zmywarkowa (temperatury 20–30°C, grzałka pralki, sebum, szarzenie tkanin) w chemii do powierzchni
    if (context.isChemical && !/(?:prani|płukani|tkanin|odplamiacz|wybielacz\s+do\s+tkanin|zmywark)/i.test(prodName)) {
        if (/20[–-]30\s*°?\s*c/i.test(allHtml) || /w\s+niskich\s+temperaturach\s*\(od/i.test(allHtml)) {
            errors.push('[Kalka pralnicza] Niedopuszczalny zwrot o praniu/zmywaniu w niskich temperaturach (20–30°C) w preparacie czyszczącym do powierzchni.');
        }
        if (/grzałk[aę]\s+pralki|szarzeni[u|e]\s+tkanin/i.test(allHtml)) {
            errors.push('[Kalka pralnicza] Wzmianka o grzałce pralki lub szarzeniu tkanin w preparacie do powierzchni.');
        }
        if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])sebum(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml) && !/kosmetyk|twarz|skór|ciał/i.test(prodName)) {
            errors.push('[Kalka pralnicza/kosmetyczna] Zwrot o usuwaniu sebum w chemii czyszczącej twarde powierzchnie.');
        }
    }

    // 9. Twarda polityka antykontaktowa Allegro (zakaz e-maili, domen i linków www)
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(allHtml);
    const hasHttp = /https?:\/\/[^\s<>"']+/i.test(allHtml);
    const hasWww = /\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(allHtml);
    const hasDomain = /(?<![a-zA-Z0-9@])[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|it|pl|eu|de|fr|org|net|nl)(?:\/[^\s<>"']*)?(?![a-zA-Z0-9])/i.test(allHtml);
    if (hasEmail || hasHttp || hasWww || hasDomain) {
        errors.push('[Polityka Allegro] Opis HTML zawiera niedozwolone dane kontaktowe, adresy e-mail, linki lub domeny www.');
    }

    // 10. Wyodrębniony blok WYKLUCZENIE ZASTOSOWANIA w Sekcji 4 dla odkamieniaczy i wybielaczy
    const isDescalerOrBleach = /(?:anticalcare|odkamieniacz|odwapniacz|usuwanie\s+kamienia|przeciw\s+kamieniowi|con\s+aceto|z\s+octem|candeggina|wybielacz)/i.test(`${prodName} ${inci} ${detComp}`);
    if (isDescalerOrBleach && s4 && !/WYKLUCZENIE\s+ZASTOSOWANIA/i.test(s4)) {
        errors.push('[Zaszyte wykluczenie materiałowe] Dla odkamieniacza / wybielacza Sekcja 4 musi zawierać wyodrębniony blok "<p>⚠️ <b>WYKLUCZENIE ZASTOSOWANIA:</b> ...</p>".');
    }

    // 11. Kalka kuchenna (przypalenia / garnki / piekarniki) w chemii sanitarnej lub przeciwgrzybiczej
    if (/(?:usuwa\s+przypalenia|przypalon[a-ząćęłńóśźż]*\s+(?:tłuszcz|garnk|piekarnik)|do\s+przypaleń)/i.test(allHtml) && (isBathroomDedicated || /(?:muffa|pleśn[a-ząćęłńóśźż]*|grzyb[a-ząćęłńóśźż]*|sanitarn[a-ząćęłńóśźż]*)/i.test(prodName))) {
        errors.push('[Kalka kuchenna] Zwrot o usuwaniu przypaleń lub czyszczeniu garnków/piekarnika w preparacie sanitarnym / przeciwgrzybiczym.');
    }

    // 12. Błąd procedury BHP przeciwpleśniowej (zakaz ścierania na sucho przed aplikacją chemii)
    const isAntifungalOrMold = /(?:muffa|pleśń|pleśni|grzyb|antygrzybi)/i.test(`${prodName} ${allHtml}`);
    if (isAntifungalOrMold && /(?:usuń\s+(?:z\s+niego\s+)?powierzchowne\s+zanieczyszczenia|zetrzyj\s+powierzchniowy\s+nalot|zetrzyj\s+pleśń\s+na\s+sucho)/i.test(s4)) {
        errors.push('[Zagrożenie biologiczne BHP] Kategoryczny zakaz zalecania mechanicznego ścierania lub usuwania nalotów pleśni na sucho przed użyciem chemii (powoduje niebezpieczne pylenie toksycznych zarodników).');
    }

    // 13. Absurd technologiczny: preparat żrący / z chlorem / grzybobójczy jako "codzienne porządki"
    if (isChlorineBleach || isAntifungalOrMold) {
        if (/(?:codziennych\s+porządków|regularnych\s+porządków|do\s+codziennego\s+sprzątania)/i.test(`${s1} ${s2}`)) {
            errors.push('[Błędny reżim stosowania] Silnie żrący/zasadowy preparat z chlorem lub przeciwgrzybiczy nie może być określany jako środek do "codziennych/regularnych porządków" (jest to preparat do doraźnej interwencji).');
        }
    }

    // 14. Zakaz nieautoryzowanego symbolu ⛔ na Allegro
    if (allHtml.includes('⛔')) {
        errors.push('[Niedozwolony symbol Allegro] W opisie użyto ikony ⛔, która jest zabroniona na Allegro (wymagane użycie ⚠️).');
    }

    // 15. Błąd pojęciowo-technologiczny: płyn do płukania tkanin (ammorbidente) to nie detergent piorący
    const isPureFabricSoftener = isFabricSoftenerProduct({
        productName: prodName,
        category: context.features?.['Kategoria'] || '',
        visionFeatures: context.visionFeatures || {},
        features: context.features || {}
    }) || (
        /(?:płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin)/i.test(`${prodName} ${allHtml}`) &&
        !/(?:płyn[a-ząćęłńóśźż]*\s+do\s+prania|żel[a-ząćęłńóśźż]*\s+do\s+prania|prosz[a-ząćęłńóśźż]*\s+do\s+prania|kapsułk[a-ząćęłńóśźż]*\s+do\s+prania|2w1|2\s*in\s*1|detersivo)/i.test(prodName)
    );

    if (isPureFabricSoftener) {
        const softenerAuditHtml = `${allHtml}\n${s5}`;
        if (
            /(?<![0-9a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])\d+\s*pra[nń](?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml) ||
            /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])cykl[a-ząćęłńóśźż]*\s+prania(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml) ||
            /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])po\s+każdym\s+praniu(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml) ||
            /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])środ(?:ek|ka|kiem)\s+piorąc/i.test(allHtml) ||
            /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:prać\s+w\s+pralce|prani[eu]\s+w\s+pralce|prać\s+ręcznie|prani[eu]\s+ręczn[eym]+|płakanie|płukannie)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(softenerAuditHtml)
        ) {
            errors.push('[Błąd pojęciowo-technologiczny] Płyn do płukania tkanin (ammorbidente) nie jest detergentem piorącym. Używaj wyłącznie terminologii "płukanie" / "cykle płukania" (ZAKAZ "prać w pralce", "pranie ręczne", "w praniach").');
        }
    }

    // 16. Zakaz halucynacji przemysłowego ŚOI (maski przeciwpyłowe/gazowe, gogle, okulary ochronne) w chemii domowej spoza etykiety
    const pimLabelText = `${context.pimWarnings || ''} ${context.pimUsage || ''}`;
    const labelExplicitlyRequiresMaskOrGoggles = /(?:mask[ęięa]\s+ochronn|półmask|respirator|gogl[ei]\s+ochronn|okular[yów]\s+ochronn|ochronę\s+oczu\s*\/\s*ochronę\s+twarzy)/i.test(pimLabelText);
    if (!labelExplicitlyRequiresMaskOrGoggles && /(?:mask[ęięa]\s+ochronn|półmask|respirator|gogl[ei]\s+ochronn|okular[yów]\s+ochronn|ochronę\s+oczu\s*\/\s*ochronę\s+twarzy)/i.test(allHtml)) {
        errors.push('[Halucynacja BHP / Nadmiarowa ochrona] W opisie chemii domowej pojawił się nieuzasadniony wymóg zakładania maski ochronnej, gogli lub okularów ochronnych spoza etykiety produktu (wymagane wyłącznie rękawice ochronne i wietrzenie pomieszczenia, chyba że etykieta stanowi inaczej).');
    }

    // 17. Bezwzględny obowiązek rękawic ochronnych przy środkach żrących, silnie zasadowych/kwasowych, wybielaczach, do piekarników lub gdy wymaga tego etykieta
    const requiresGlovesByFormulaOrLabel = Boolean(context.requiresProtectiveGloves) ||
        /(?:sodium\s+hydroxide|potassium\s+hydroxide|wodorotlenek\s+sodu|wodorotlenek\s+potasu|sodium\s+hypochlorite|podchloryn\s+sodu|candeggina|wybielacz|kwas\s+solny|hydrochloric\s+acid|kwas\s+fosforowy|phosphoric\s+acid|kwas\s+amidosulfonowy|sulfamic\s+acid|\bH314\b|\bH315\b|piekarnik|komink|grill|przypale[ńn]|muffa|pleś[ńn]|żrąc|rękawic|guanti)/i.test(`${prodName} ${inci} ${detComp} ${pimLabelText}`);

    if (requiresGlovesByFormulaOrLabel) {
        if (s6 && !/rękawic/i.test(s6)) {
            errors.push('[Brak wymogu rękawic ochronnych w Sekcji 6] Dla środka żrącego / drażniącego skórę / silnej chemii gospodarczej lub zgodnie z etykietą, Sekcja 6 (BHP/CLP) musi bezwzględnie zawierać wymóg: "P280 – Stosować rękawice ochronne.".');
        }
        if (s4 && !/rękawic/i.test(s4)) {
            errors.push('[Brak wymogu rękawic ochronnych w Sekcji 4] Dla środka żrącego / drażniącego skórę / silnej chemii gospodarczej lub zgodnie z etykietą, instrukcja użycia w Sekcji 4 musi informować o konieczności założenia rękawic ochronnych.');
        }
    }

    // 18. Izolacja produktów WC przed kalką z płynów do fug i pleśni
    const isToiletWcProduct = /(?:żel\s+do\s+wc|płyn\s+do\s+wc|kostk[ai]\s+do\s+wc|wc\s+gel|do\s+toalet|muszl[ia]\s+toaletow)/i.test(prodName) &&
        !/(?:pleś[ńn]|muffa|do\s+fug|odgrzybiacz)/i.test(prodName);
    if (isToiletWcProduct && /(?:\bw\s+fugach\b|ciemne\s+naloty\s+w\s+fugach|wannach,\s*umywalkach\s+oraz\s+fugach)/i.test(`${s1} ${s2} ${s3} ${s4}`)) {
        errors.push('[Kalka międzykategorialna WC vs Fugi] Produkt do WC / muszli toaletowej nie może zawierać wtrętów o czyszczeniu fug (kalka z preparatu na pleśń).');
    }

    // 19. Błąd logiczno-chemiczny: zasadowy wybielacz chlorowy (bez kwasu) nie rozpuszcza kamienia ani zacieków mineralnych
    const hasDescalingAcid = /(?:citric\s+acid|kwas\s+cytrynowy|sulfamic|amidosulfonow|formic|mrówkow|phosphoric|fosforow|hydrochloric|solny|lactic|mlekow|acetic|octow|anticalcare|odkamieniacz|odwapniacz)/i.test(`${prodName} ${inci} ${detComp}`);
    if (isChlorineBleach && !hasDescalingAcid && /(?:usuwa|rozpuszcza|rozbija|eliminuje|likwiduje)\s+[^.<]{0,40}(?:kamie[ńn]\b|zacieki\s+mineralne|osady\s+mineralne|osady\s+wapienne)/i.test(`${s1} ${s2} ${s3} ${s4}`)) {
        errors.push('[Błąd logiczno-chemiczny] Zasadowy wybielacz chlorowy (NaOCl + NaOH) bez kwasu nie rozpuszcza kamienia wapiennego ani zacieków mineralnych (utlenia wyłącznie przebarwienia i osady organiczne).');
    }

    // 20. Błąd gramatyczny ("wykonana w częściowo")
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])w\s+częściowo(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i.test(allHtml)) {
        errors.push('[Błąd gramatyczny] Niedopuszczalna fraza "w częściowo" (wymagane: "częściowo" lub "w części").');
    }

    // 21. Kontrola czystości i nierozerwalności CLP w Sekcji 6 (urwane procedury, surowe składniki, H314 vs P301+P312)
    if (s6) {
        const s6Check = validate_section6_compliance(s6, { is_chemical: Boolean(context.isChemical) });
        for (const s6Err of s6Check.errors) {
            if (/(?:KONTATKU|Severed\/duplicated|Raw chemical ingredient|Corrosive H314|Duplicate skin-contact)/.test(s6Err)) {
                errors.push(`[Błąd struktury CLP Sekcji 6] ${s6Err}`);
            }
        }
    }

    // 22. Uniwersalna kontrola pseudonauki ("dwufazowe" dla jednorodnych formulacji) oraz kalki "z kamienia i mydła" poza chemią kwasowo-łazienkową
    const isBiphasicProduct = /dwufazow|bifasic|biphase|2-faz/i.test(`${prodName} ${JSON.stringify(context.visionFeatures || {})}`);
    if (!isBiphasicProduct && /dwufazow[a-ząćęłńóśźż]*\s+odtłuszczani/i.test(allHtml)) {
        errors.push('[Błąd fizykochemii] Pseudonaukowe określenie "dwufazowe odtłuszczanie" dla jednorodnego roztworu jednofazowego.');
    }
    const isBathroomOrDescaler = /(?:łazienk|lazienk|sanitar|odkamien|anticalcare|armatur|prysznic|kabin|wanna|umywalk|bagno|citric\s+acid|lactic\s+acid|sulfamic\s+acid|formic\s+acid|phosphoric\s+acid|acetic\s+acid|kwas\s+)/i.test(`${prodName} ${inci} ${detComp}`);
    if (!isBathroomOrDescaler && /osad[a-ząćęłńóśźż]*\s+z\s+kamienia\s+i\s+mydła/i.test(`${s1} ${s2} ${s3} ${s4}`)) {
        errors.push('[Kalka łazienkowa] Wzmianka o "osadach z kamienia i mydła" w produkcie niebędącym kwasowym środkiem do łazienki lub odkamieniaczem.');
    }

    // 23. Zakaz doklejania surowej stopki pełnego składu INCI / WE 648/2004 na dole Sekcji 3
    if (s3) {
        const $s3 = cheerio.load(s3, null, false);
        let hasRawInciFooterInS3 = false;
        $s3('p').each((_, el) => {
            const $el = $s3(el);
            if ($el.closest('li').length > 0) return;
            if (isRawInciFooterText($el.text())) {
                hasRawInciFooterInS3 = true;
            }
        });
        if (hasRawInciFooterInS3) {
            errors.push('[Nadmiarowa stopka INCI w Sekcji 3] W Sekcji 3 (Moduł 3) niedozwolona jest surowa stopka pełnego składu "Skład INCI: ..." / "Skład (zgodnie z Rozp. WE 648/2004): ...". Pełny skład należy wyłącznie do Karty Technicznej PIM i parametrów Allegro.');
        }
    }

    const extractCheckChunks = (htmlStr) => {
        if (!htmlStr) return [];
        const $doc = cheerio.load(htmlStr, null, false);
        const rawBlocks = [];
        $doc('li, p').each((_, el) => {
            const $el = $doc(el);
            if (el.tagName === 'p' && $el.closest('li').length > 0) return;
            const txt = $el.text().replace(/\s+/g, ' ').trim();
            if (txt) rawBlocks.push(txt);
        });
        if (rawBlocks.length === 0) {
            const plain = String(htmlStr).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            if (plain) rawBlocks.push(plain);
        }
        const sentences = [];
        for (const blk of rawBlocks) {
            for (const part of blk.split(/(?<=[.!?])\s+/)) {
                const p = part.trim();
                if (p) sentences.push(p);
            }
        }
        return { rawBlocks, sentences };
    };

    const noRinseNegationRe = /(?:bez\s+(?:konieczności\s+)?spłukiwania|nie\s+wymaga\s+spłukiwania|bez\s+spłukiwania)/i;
    const activeSurfaceRinseRe = /\b(?:dokładnie\s+spłucz(?:\s+(?:powierzchnię|ceramikę|armaturę|kabinę|wannę|umywalkę|całość))?(?:\s+(?:czystą\s+)?wodą)?|spłucz\s+(?:powierzchnię|ceramikę|armaturę|kabinę|wannę|umywalkę|całość)\s*(?:czystą\s+)?wodą|należy\s+(?:następnie\s+)?spłukać\s+(?:powierzchnię|całość|czystą\s+wodą|wodą)|wymaga\s+(?:dokładnego\s+)?spłukania(?:\s+wodą)?|obficie\s+spłucz\s+(?:powierzchnię|całość)?\s*wodą)\b/i;
    const bodyRinseOnlyRe = /\b(?:spłucz|umyj)\s+(?:ręce|dłonie|oczy|skórę)\b/i;

    // 24. Formuła bez spłukiwania (SENZA RISCIACQUO) — zakaz nakazu spłukiwania powierzchni i obowiązkowy wyróżnik w Sekcji 5
    const isNoRinse = context.isNoRinse === true || isNoRinseFormula({
        productName: context.productName,
        visionFeatures: context.visionFeatures,
        features: context.features
    });
    if (isNoRinse) {
        const s2Chunks = extractCheckChunks(s2);
        const s4Chunks = extractCheckChunks(s4);
        const rinseConflictChunk = [...(s2Chunks.sentences || []), ...(s4Chunks.sentences || [])].find(chunk =>
            activeSurfaceRinseRe.test(chunk) &&
            !noRinseNegationRe.test(chunk) &&
            !(bodyRinseOnlyRe.test(chunk) && !/(?:powierzchn|ceramik|armatur|wann|umywalk|kabin)/i.test(chunk))
        );
        if (rinseConflictChunk) {
            errors.push(`[Sprzeczność z etykietą – Bez spłukiwania] Etykieta deklaruje formułę bez spłukiwania (Senza Risciacquo), natomiast w opisie (FAQ/Sposób użycia) pojawia się nakaz spłukiwania wodą: "${rinseConflictChunk.slice(0, 140)}".`);
        }
        if (s5 && !/bez\s+spłukiwania/i.test(s5)) {
            errors.push('[Brak wyróżnika Bez spłukiwania w Sekcji 5] Dla produktu z deklaracją bez spłukiwania (Senza Risciacquo) pole "Właściwości i wyróżniki" w Sekcji 5 musi zawierać "Bez spłukiwania".');
        }
    }

    // 25. Wewnętrzna sprzeczność FAQ (s2) vs Sposób użycia (s4) w kwestii spłukiwania
    if (s2 && s4 && noRinseNegationRe.test(s2)) {
        const s4Chunks = extractCheckChunks(s4);
        const s4RinseConflict = (s4Chunks.sentences || []).find(chunk =>
            activeSurfaceRinseRe.test(chunk) &&
            !noRinseNegationRe.test(chunk) &&
            !(bodyRinseOnlyRe.test(chunk) && !/(?:powierzchn|ceramik|armatur|wann|umywalk|kabin)/i.test(chunk))
        );
        if (s4RinseConflict) {
            errors.push(`[Sprzeczność wewnętrzna FAQ vs Sposób użycia] Sekcja 2 (FAQ) wskazuje na użycie bez spłukiwania, podczas gdy Sekcja 4 (Sposób użycia) nakazuje spłukiwanie wodą: "${s4RinseConflict.slice(0, 140)}".`);
        }
    }

    // 26. Fałsz chemiczny: Parfum ani alergeny zapachowe (Hexyl Cinnamal, Linalool itp.) nie neutralizują chemicznie woni
    const hasNeutralizer = hasDeclaredOdorNeutralizer({
        productName: context.productName,
        inci: context.inci,
        detergentComposition: context.detergentComposition,
        visionFeatures: context.visionFeatures,
        features: context.features
    });
    if (!hasNeutralizer) {
        const fragranceEntityRe = /\b(?:parfum|kompozycj[aęi]\s+zapachow|hexyl\s+cinnamal|linalool|limonene|citronellol|geraniol|coumarin|alergen\w*\s+zapachow)/i;
        const odorNeutralizeRe = /\bneutralizuj[a-ząćęłńóśźż]*\s+(?:[a-ząćęłńóśźż]+\s+){0,2}(?:wo[ńn][a-ząćęłńóśźż]*|zapach[a-ząćęłńóśźż]*)\b/i;
        for (const secHtml of [s1, s2, s3]) {
            const { rawBlocks } = extractCheckChunks(secHtml);
            for (const blk of (rawBlocks || [])) {
                if (fragranceEntityRe.test(blk) && odorNeutralizeRe.test(blk)) {
                    errors.push(`[Fałsz chemiczny – Parfum/Alergen] Kompozycja zapachowa (Parfum) ani alergen zapachowy (np. Hexyl Cinnamal) nie neutralizują chemicznie woni — nadają wyłącznie zapach (brak deklaracji pochłaniacza/neutralizatora zapachów na etykiecie). Fragment: "${blk.slice(0, 140)}".`);
                    break;
                }
            }
        }
    }

    // 27. Wyciek surowej nazwy ERP / literówki z katalogu zamiast oficjalnej nazwy z etykiety
    const rawProdName = String(context.rawProductName || '').trim();
    const canonProdName = String(context.canonicalProductName || '').trim();
    const rawCatalogLeak = detectRawCatalogNameLeak(`${s1}\n${s2}\n${s4}\n${s5}`, rawProdName, canonProdName);
    if (rawCatalogLeak) {
        errors.push(`[Wyciek surowej nazwy ERP / literówka z katalogu] (${rawCatalogLeak}) — w treści pozostała zniekształcona nazwa katalogowa z ERP zamiast oficjalnej nazwy z etykiety "${canonProdName}".`);
    }

    // 28. Zgodność CLP w Sekcji 6: zadeklarowane na kontretykiecie piktogramy GHS0x muszą być obecne w s6
    const declaredClpPictos = Array.isArray(context.clpPictograms)
        ? context.clpPictograms
        : gpsrSafetyService.resolveClpPictogramsList(null, { ...(context.features || {}), ...(context.visionFeatures || {}) });
    if (s6 && Array.isArray(declaredClpPictos) && declaredClpPictos.length > 0) {
        const s6Upper = s6.toUpperCase();
        for (const code of declaredClpPictos) {
            const normalizedCode = String(code || '').trim().toUpperCase();
            if (/^GHS0[1-9]$/.test(normalizedCode) && !s6Upper.includes(normalizedCode)) {
                errors.push(`[Brak piktogramu CLP ${normalizedCode} w Sekcji 6] Kontretykieta zawiera piktogram zagrożenia ${normalizedCode}, którego brakuje w Sekcji 6 (GPSR/CLP).`);
            }
        }
    }

    // 29. Separacja Marketing vs Prawo i zakaz słów-straszaków / konserwantów w treści marketingowej (s1–s4, sTips — §K)
    // UWAGA: Sekcja 6 (Bezpieczeństwo CLP/GPSR/EUH208) celowo NIE podlega temu skanowaniu!
    const sTips = String(sectionsObj.section_tips_html || '');
    const marketingHtmlList = [
        { name: 'Sekcja 1', html: s1 },
        { name: 'Sekcja 2 FAQ', html: s2 },
        { name: 'Sekcja 3', html: s3 },
        { name: 'Sekcja 4', html: s4 },
        { name: 'Sekcja Porady', html: sTips }
    ];
    const scareWordPatterns = [
        { re: /(?<![a-ząćęłńóśźż])alergen[a-ząćęłńóśźż]*(?![a-ząćęłńóśźż])/i, label: 'słowo-straszak "alergen"' },
        { re: /(?<![a-ząćęłńóśźż])reakcj[aęiy]\s+alergiczn[a-ząćęłńóśźż]*(?![a-ząćęłńóśźż])/i, label: 'fraza "reakcja alergiczna"' },
        { re: /(?<![a-ząćęłńóśźż])może\s+powodować\s+(?:wystąpienie\s+)?(?:reakcj|uczuleni)/i, label: 'ostrzeżenie o uczuleniu' },
        { re: /\bEUH\s*208\b/i, label: 'zwrot CLP EUH208 poza Sekcją 6' },
        { re: /(?<![a-ząćęłńóśźż])wymog(?:i|ami|ów|om)?\s+detergentow[a-ząćęłńóśźż]*(?![a-ząćęłńóśźż])/i, label: 'formułka prawna "wymogi detergentowe"' },
        { re: /(?<![a-ząćęłńóśźż])(?:zgodnie\s+z\s+)?(?:rozp\.|rozporządzeniem)\s*(?:\(?\s*WE\s*\)?\s*)?(?:nr\s*)?648\s*\/\s*2004\b/i, label: 'powołanie na Rozp. WE 648/2004' },
        { re: /(?<![a-ząćęłńóśźż])ujawnion[aeyą]\s+zgodnie\s+z(?![a-ząćęłńóśźż])/i, label: 'biurokratyczna formuła "ujawnione zgodnie z"' },
        { re: /\b(?:benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol|dmdm\s+hydantoin|isothiazolinon[ey]?|sodium\s+pyrithione)\b/i, label: 'nazwa technicznego konserwantu (BIT/MIT itp.)' },
        { re: /(?<![a-ząćęłńóśźż])(?:stabilizator(?:em|y)?\s+mikrobiologiczn[a-ząćęłńóśźż]*|układ(?:em|u)?\s+konserwując[a-ząćęłńóśźż]*|konserwant(?:em|y|ów)?\s+(?:formulacj|formuł|produkt)|środ(?:ek|ki|ków)\s+konserwując[a-ząćęłńóśźż]*|konserwacj[aęiy]\s+produktu)(?![a-ząćęłńóśźż])/i, label: 'terminologia konserwująca w opisie marketingowym' },
        { re: /(?<![a-ząćęłńóśźż])przed\s+rozwojem\s+(?:bakterii|grzybów|drobnoustrojów|mikroorganizmów)(?![a-ząćęłńóśźż])/i, label: 'straszenie rozwojem bakterii/grzybów' },
        { re: /(?<![a-ząćęłńóśźż])chroni(?:ć)?\s+(?:płyn|produkt|formułę|żel|środek)\s+przed\s+(?:zepsuciem|namnażaniem|bakteriami)(?![a-ząćęłńóśźż])/i, label: 'straszenie zepsuciem produktu' }
    ];
    for (const secEntry of marketingHtmlList) {
        if (!secEntry.html) continue;
        const plain = secEntry.html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
        const plainNoNegations = plain.replace(/(?<![a-ząćęłńóśźż])(?:bez|woln[aeyoą]\s+od|nie\s+zawiera(?:ją)?)\s+(?:dodatku\s+)?(?:alergen[óo]w|konserwant[óo]w|barwnik[óo]w|substancji\s+zapachowych)(?![a-ząćęłńóśźż])/gi, '');
        for (const pat of scareWordPatterns) {
            const match = plainNoNegations.match(pat.re);
            if (match) {
                errors.push(`[Słowo-straszak / Prawny żargon w marketingu – ${secEntry.name}] Wykryto niedozwolony zwrot (${pat.label}): "${match[0]}". Takie sformułowania obniżają konwersję i należą wyłącznie do danych prawnych/PIM/Sekcji 6, nigdy do opisu sprzedażowego.`);
                break;
            }
        }
    }

    // 30. Zakaz cząsteczek alergenów zapachowych oraz kafelków wypełniaczy/wody/soli/konserwantów w Sekcji 3 (s3 — §K)
    if (s3) {
        try {
            const $s3 = cheerio.load(s3);
            const allergenRe = new RegExp(`\\b(?:${FRAGRANCE_ALLERGEN_MOLECULES.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
            $s3('li').each((_, el) => {
                const fullText = $s3(el).text().replace(/\s+/g, ' ').trim();
                const boldHeading = $s3(el).find('b, strong').first().text().replace(/\s+/g, ' ').trim();
                const colonIdx = fullText.indexOf(':');
                const colonHeading = colonIdx > 0 && colonIdx <= 65 ? fullText.slice(0, colonIdx).replace(/^[\W_⚙️⚡•✅]+/u, '').trim() : '';
                const candidateHeading = (boldHeading || colonHeading).replace(/^(?:⚙️|⚡|✅|✔️|➡️)\s*/u, '').trim();
                if (candidateHeading && FILLER_OR_PRESERVATIVE_HEADINGS_REGEX.test(candidateHeading)) {
                    errors.push(`[Wypełniacz / Konserwant w Sekcji 3] Kafelek "${candidateHeading}" opisuje wodę, sól, barwnik lub konserwant zamiast składnika budującego realną korzyść dla klienta.`);
                }
                const allergenHit = fullText.match(allergenRe);
                if (allergenHit) {
                    errors.push(`[Cząsteczka alergenu zapachowego w Sekcji 3] Wykryto cząsteczkę zapachową "${allergenHit[0]}" w treści marketingowej. Cząsteczki alergenów należą wyłącznie do pełnego INCI w PIM i kontretykiety, nie do Sekcji 3.`);
                }
            });
        } catch {
            // fallback na wypadek nietypowego HTML
        }
    }

    // 31. Jakość copywritingu, gramatyka, szablony FAQ oraz kontekstowość płynów do płukania (§K)
    const isSoftenerCtx = isFabricSoftenerProduct({
        productName: context.productName || '',
        category: context.features?.['Kategoria'] || '',
        visionFeatures: context.visionFeatures || {},
        features: context.features || {}
    });
    for (const secEntry of marketingHtmlList) {
        if (!secEntry.html) continue;
        if (/(?<![a-ząćęłńóśźż])(?:rozpuszczalnik(?:iem)?\s+nośnikow[a-ząćęłńóśźż]*|regulator(?:em)?\s+lepkości|modyfikator(?:em)?\s+reologii|baza\s+nośnikow[aą]|celowan(?:ego|y|ym)\s+dobor(?:u|ze)\s+związków\s+powierzchniowo\s+czynnych)(?![a-ząćęłńóśźż])/i.test(secEntry.html)) {
            errors.push(`[Żargon laboratoryjny – ${secEntry.name}] Unikaj sztucznych sformułowań technologicznych ("rozpuszczalnik nośnikowy", "regulator lepkości", "celowany dobór związków"). Opisuj realną korzyść użytkową prostym językiem.`);
        }
        if (/\bpodczas\s+(?:sprzątaniu|praniu|płukaniu|czyszczeniu|zmywaniu|prasowaniu|myciu\s+naczyniach)\b/i.test(secEntry.html)) {
            errors.push(`[Błąd gramatyczny – ${secEntry.name}] Niepoprawna odmiana po słowie "podczas" (np. "podczas sprzątaniu" zamiast "podczas sprzątania").`);
        }
        if (/<(?:p|li|h[1-4]|div)[^>]*>(?:\s*<[^>]+>)*\s*fabryczn[aeyoą](?![a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ])/.test(secEntry.html)) {
            errors.push(`[Błąd wielkości litery – ${secEntry.name}] Zdanie/blok zaczyna się od małej litery "fabryczny..." zamiast wielkiej litery.`);
        }
    }
    if (s2 && /\(\s*o\s+zapachu\s+[^)]{2,50}\)/i.test(s2)) {
        errors.push('[Szablonowe FAQ w Sekcji 2] Wykryto robotyczną wstawkę w nawiasie "(o zapachu ...)" w pytaniu/odpowiedzi FAQ. Sformułuj naturalne zdanie po polsku.');
    }
    if (isSoftenerCtx && s3) {
        const s3Plain = s3.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (/(?<![a-ząćęłńóśźż])(?:rozbijani[aeu]\s+zabrudzeń|usuwani[aeu]\s+(?:tłuszczu|brudu|plam|osadów\s+mineralnych|kamienia)|odspajani[aeu]\s+zabrudzeń|etap\s+czyszczenia|skuteczność\s+czyszczenia|czyszczącej\s+powierzchnie)(?![a-ząćęłńóśźż])/i.test(s3Plain)) {
            errors.push('[Błąd domenowy Sekcji 3 – Płyn do płukania] Płyn/koncentrat do płukania tkanin nie służy do "rozbijania zabrudzeń" ani "etapu czyszczenia". Skup się wyłącznie na miękkości włókien, łatwości prasowania i zapachu.');
        }
    }

    // 32. Spójność postaci fizycznej etykiety z opisem i Sekcją 5 (zakaz "płyn żel" / "żel" na płynie Detersivo)
    const labelFormCheck = resolveLabelPhysicalForm({
        visionFeatures: context.visionFeatures || {},
        features: context.features || {},
        officialLabelName: context.canonicalProductName || prodName,
        rawProductName: context.rawProductName || prodName
    });
    if (labelFormCheck.isVerifiedFromLabel && labelFormCheck.canonicalForm) {
        const combinedFormAuditHtml = `${s1} ${s2} ${s4} ${s5}`.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn\s*[\/+-]?\s*żel|żel\s*[\/+-]?\s*płyn)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(combinedFormAuditHtml)) {
            errors.push(`[Niespójność postaci fizycznej z etykietą] Wykryto sprzeczną zbitkę "płyn żel" — etykieta definiuje postać produktu jako "${labelFormCheck.canonicalForm}".`);
        } else if (labelFormCheck.canonicalForm === 'płyn' && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:postać(?:\s+fizyczna)?\s*:\s*żel|dozować\s+żel|żel\s+do\s+prania|piorący\s+żel)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(combinedFormAuditHtml)) {
            errors.push('[Niespójność postaci fizycznej z etykietą] Etykieta określa produkt jako płyn (Detersivo / Ammorbidente bez "Gel"), a opis lub specyfikacja używa błędnej postaci "żel".');
        }
    }

    // 33. Walidacja matematyki dozowania w Sekcji 4 względem pojemności i deklarowanej wydajności
    const capForMath = context.capacity || context.visionFeatures?.['Pojemność / Waga'] || context.visionFeatures?.['Pojemność'] || context.features?.['Pojemność / Waga'] || context.features?.['Pojemność'] || prodName;
    const yieldForMath = context.yield || context.visionFeatures?.['Wydajność'] || context.features?.['Wydajność'] || context.features?.['Liczba prań'] || '';
    const capMatchForMath = String(capForMath || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|l)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i);
    const yieldMatchForMath = String(yieldForMath || '').match(/(\d+)\s*(?:pra[ńn]|cykl[iaów]*\s*płukania|płuka[ńn]|płuk\.?|wash(?:es)?|lavaggi)/i);
    if (s4 && capMatchForMath && yieldMatchForMath) {
        const s4Plain = s4.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const dosageAudit = validateDosageYieldMath({
            capacityText: `${capMatchForMath[1]} ${capMatchForMath[2]}`,
            yieldText: `${yieldMatchForMath[1]} prań`,
            usageText: s4Plain
        });
        if (!dosageAudit.valid) {
            errors.push(`[Błąd matematyki dozowania vs wydajność w Sekcji 4] ${dosageAudit.reason} Zweryfikuj tabelę dozowania na kontretykiecie.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Walidator UX Allegro 2026 (nowy zwijany widok oferty Above-the-Fold dla Sekcji 1).
 * Sprawdza, czy pierwszy moduł opisu jest zwięzły i czytelny jeszcze przed kliknięciem "Rozwiń opis".
 */
function validate_section1_above_the_fold(html) {
    if (!html || typeof html !== 'string' || !html.trim()) {
        return { valid: false, warnings: ['Pusta Sekcja 1 opisu'], leadLength: 0, bulletCount: 0 };
    }
    const $ = cheerio.load(html, null, false);
    const warnings = [];
    const headingText = $('h1, h2').first().text().trim();
    if (!headingText) {
        warnings.push('Sekcja 1 nie zawiera nagłówka <h1> lub <h2>.');
    } else if (!headingText.startsWith('⭐')) {
        warnings.push('Nagłówek Sekcji 1 powinien zaczynać się od kotwicy ⭐.');
    }

    const firstParagraph = $('p').first();
    const firstParagraphHtml = firstParagraph.html() || '';
    const leadPlain = firstParagraph.text().replace(/\s+/g, ' ').trim();
    const leadLength = leadPlain.length;
    if (leadLength === 0) {
        warnings.push('Sekcja 1 nie zawiera otwierającego akapitu <p> widocznego przed rozwinięciem opisu.');
    } else if (leadLength > 280) {
        warnings.push(`Pierwszy akapit Sekcji 1 ma ${leadLength} zn. (> 280 zn.) — w nowym zwijanym widoku Allegro nad zgięciem powinien mieścić się zwięzły konkret (≤ 220 zn.).`);
    }
    if (leadLength > 0 && !/<(?:b|strong)\b/i.test(firstParagraphHtml)) {
        warnings.push('Pierwszy akapit Sekcji 1 nie zawiera pogrubień <b> dla kluczowych korzyści.');
    }

    const bullets = $('ul > li, ol > li');
    const bulletCount = bullets.length;
    if (bulletCount === 0) {
        warnings.push('Sekcja 1 nie zawiera wypunktowania najważniejszych korzyści przed „Rozwiń opis”.');
    } else if (bulletCount > 6) {
        warnings.push(`Sekcja 1 zawiera zbyt wiele punktów (${bulletCount} > 6) — zalecane 3–4 zwięzłe punkty Above-the-Fold.`);
    }

    if (/\b(?:wysyłk[a-ząćęłńóśźż]*|kurier[a-ząćęłńóśźż]*|dostaw[a-ząćęłńóśźż]*\s+w\s+\d+|w\s+24\s*h|magazyn(?:ie|u)|jesteśmy\s+(?:bezpośrednim\s+)?importerem|zapraszamy\s+na\s+inne\s+aukcje|faktura\s+vat)\b/i.test(html) ||
        scan_stopwords(html).length > 0 ||
        scanAllegroComplianceRisks(html, { sectionType: 'description' }).length > 0) {
        warnings.push('Sekcja 1 zawiera niedozwolone obietnice logistyczne, dane o sprzedającym, slogany marketingowe lub stop-words (§A / Załącznik nr 2 Allegro).');
    }

    return {
        valid: warnings.length === 0,
        warnings,
        leadLength,
        bulletCount
    };
}

module.exports = {
    ean_checksum,
    route_chemical,
    scan_stopwords,
    scan_allegro_implicit_risks,
    scan_medical_claims_lexical,
    scan_biocidal_claims_lexical,
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
    validate_section3_ingredients_closed_world,
    validate_domain_and_chemical_logic,
    validate_section1_above_the_fold
};
