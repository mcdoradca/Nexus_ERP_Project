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

// V3
function scan_stopwords(html) {
    if (!html) return [];
    const stopwords = [
        'gratis', 'tanio', 'tani[a-z]*', 'promocj[aeiłąę]*', 'hit', 'prezent', 'okazj[aeiłąę]*', 
        'najtaniej', 'wyprzeda[żz][a-z]*', 'mega', 'super', 'gwarancj[aeiłąę]* najniższej ceny',
        'gwarancj[aeiłąę]*', 'gwarantuj[a-z]*', 'udowodniona skuteczność', 'cudown[a-z]*', 'magiczn[a-z]*',
        'w 100% udowodnione', 'pewność działania'
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
    const allowed = ['h1', 'h2', 'p', 'ul', 'ol', 'li', 'b'];
    while ((match = tagRegex.exec(html)) !== null) {
        const tag = match[1].toLowerCase();
        if (!allowed.includes(tag)) {
            errors.push(`Disallowed tag: <${tag}>`);
        }
    }
    
    if (/<\s*br\s*\/?>/i.test(html)) errors.push('Contains <br> tag');
    if (/<\s*strong\s*>/i.test(html)) errors.push('Contains <strong> tag');
    if (/<\s*h[12][^>]*>[\s\S]*?<\s*b\s*>[\s\S]*?<\s*\/\s*h[12]\s*>/i.test(html)) {
        errors.push('Contains <b> inside heading');
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
        '🌟','❓','⚙️','📝','📊','⚠️','✅','✔️','🛡️','🏅','🏆','🔬','🌱','🌿','♻️','💧','➡️','🔴','🟢','⚡','💆‍♀️','🏷️'
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
    
    if (html.includes('🔴') && !/🔴\s*<b>Problem:<\/b>/.test(html)) {
        errors.push('Invalid 🔴 Problem pattern');
    }
    if (html.includes('🟢') && !/🟢\s*<b>Answer:<\/b>/.test(html)) {
        errors.push('Invalid 🟢 Answer pattern');
    }

    return { valid: errors.length === 0, errors };
}

// V8
function gate_ingredients(inci_list) {
    if (!inci_list || !Array.isArray(inci_list)) return { status: 'OK' };
    
    const gate1 = [
        'perboric acid', 'tpo', 'n,n-dimethyl-p-toluidine', '4-mbc', 'bp-2', 'bp-5'
    ];
    const gate2 = [
        'ketoconazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin'
    ];
    
    const lowerList = inci_list.map(i => String(i).toLowerCase().trim());
    
    for (const item of lowerList) {
        if (gate1.includes(item)) return { status: 'BANNED_SUBSTANCE_DETECTED', substance: item };
        if (gate2.includes(item)) return { status: 'INGREDIENT_NOT_COSMETIC', substance: item };
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
    verify_frozen
};
