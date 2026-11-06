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
        'gwarancj[aeiłąę]*', 'gwarantuj[a-ząćęłńóśźż]*',
        'udowodnion[a-ząćęłńóśźż]* skutecznoś[ćc]', 'w 100% udowodnion[a-ząćęłńóśźż]*', '100% udowodnion[a-ząćęłńóśźż]*',
        'pewnoś[ćc] działania', 'pewnoś[ćc] zakupu', '100% pewnoś[ćc]i',
        'w\\s+100\\s*%', '(?<!\\d)100\\s*%', 'najlepsz[a-ząćęłńóśźż]*', 'bezkonkurencyjn[a-ząćęłńóśźż]*', 'niezrównan[a-ząćęłńóśźż]*', 'rewelacyjn[a-ząćęłńóśźż]*', 'rewelacj[a-ząćęłńóśźż]*', 'numer\\s+1', 'nr\\s+1', 'ekstra', 'cudown[a-ząćęłńóśźż]*', 'magiczn[a-ząćęłńóśźż]*', 'niezawodn[a-ząćęłńóśźż]*',
        'oryginalnoś[ćc][a-ząćęłńóśźż]*', 'oryginaln[a-ząćęłńóśźż]*', 'orygina[łl][a-ząćęłńóśźż]*',

        // Promocje, ceny, rabaty
        'najniższa cena', 'nisk[a-ząćęłńóśźż]* cen[a-ząćęłńóśźż]*', 'super cen[a-ząćęłńóśźż]*', 'cen[a-ząćęłńóśźż]* hurtow[a-ząćęłńóśźż]*',
        'gratis[a-ząćęłńóśźż]*', 'darmow[a-ząćęłńóśźż]* dostaw[a-ząćęłńóśźż]*', 'darmow[a-ząćęłńóśźż]*', 'za darmo',
        'tanio', 'tani[a-ząćęłńóśźż]*', 'najtaniej',
        'promocj[aeiłąę]*', 'promocyjn[a-ząćęłńóśźż]*', 'wyprzeda[żz][a-ząćęłńóśźż]*',
        'hit[a-ząćęłńóśźż]* cenow[a-ząćęłńóśźż]*', 'hit[a-ząćęłńóśźż]*',
        'prezent[a-ząćęłńóśźż]*', 'okazj[aeiłąę]*', 'okazyjn[a-ząćęłńóśźż]*',
        'bestseller[a-ząćęłńóśźż]*', 'nowoś[ćc][a-ząćęłńóśźż]*',
        'mega', 'super', 'rabat[a-ząćęłńóśźż]*', 'upust[a-ząćęłńóśźż]*', 'zniżk[aeiłąę]*',

        // CTA, platformowe i manipulacyjne
        'kup teraz', 'kupuj teraz', 'zamów teraz', 'kliknij', 'dodaj do koszyka',
        'polecam[a-ząćęłńóśźż]*', 'sprawdź to', 'tylko u nas',
        'allegro', 'aukcj[aeiłąę]*', 'wysyłk[a-ząćęłńóśźż]* 24h', 'szybka wysyłka',
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
    
    if (!eu.contact || typeof eu.contact !== 'string' || eu.contact.trim() === '' || eu.contact.length > 250) errors.push('Contact empty or exceeds 250 chars');
    if (eu.contact) {
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

        const plainText = trimmed.replace(/<[^>]+>/g, '').trim();
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

    if (options.require_manufacturer && options.manufacturer) {
        const hasProducer = /<li[^>]*>[\s\S]*?Producent:?[\s\S]*?<\/li>/i.test(html);
        if (!hasProducer) {
            errors.push(`Missing manufacturer (${options.manufacturer}) in technical specifications Section 5`);
        }
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
    }

    // 3. Mieszanie kuchni z łazienką w produkcie dedykowanym wyłącznie do łazienek/toalet
    if (isBathroomDedicated) {
        if (/(?:w\s+kuchni|osady\s+kuchenne|tłuszczu\s+kuchennego|przypalon[a-ząćęłńóśźż]*\s+tłuszcz|z\s+kawy\s+i\s+herbaty)/i.test(`${s1} ${s2} ${s3} ${s4}`)) {
            errors.push('[Niespójność domenowa] Produkt dedykowany do łazienek zawiera wklejki z odtłuszczacza kuchennego (kuchnia / przypalony tłuszcz / plamy z kawy i herbaty).');
        }
    }

    // 4. Błąd gramatyczny "o zapachu świeży"
    if (/o\s+zapachu\s+świeży\b/i.test(allHtml)) {
        errors.push('[Błąd gramatyczny] Kalka językowa "o zapachu świeży" (wymagane: "o świeżym zapachu").');
    }

    // 5. Medical Whitelisting w P302+P352 ("W PRZYPADKU KONTAKTU ZE SKÓRĄ" -> "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ")
    if (/W\s+PRZYPADKU\s+KONTAKTU\s+ZE\s+SKÓRĄ/i.test(s6)) {
        errors.push('[Medical Whitelisting CLP] W kodzie P302+P352 użyto zakazanego słowa "KONTAKTU ZE SKÓRĄ" zamiast "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ".');
    }

    // 6. Obowiązkowe ostrzeżenie "Nie połykać." w chemii gospodarczej
    if (context.isChemical && s6 && !/nie\s+połykać/i.test(s6)) {
        errors.push('[Brak ostrzeżenia BHP] W Sekcji 6 brakuje obowiązkowego ostrzeżenia "Nie połykać.".');
    }

    return { valid: errors.length === 0, errors };
}

module.exports = {
    ean_checksum,
    route_chemical,
    scan_stopwords,
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
    validate_domain_and_chemical_logic
};
