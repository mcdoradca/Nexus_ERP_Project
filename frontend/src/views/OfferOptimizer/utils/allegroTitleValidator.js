export const MAX_ALLEGRO_TITLE_LEN = 75;
export const MIN_ALLEGRO_TITLE_LEN = 12;
export const OPTIMAL_MIN_ALLEGRO_TITLE_LEN = 55;

const BANNED_CLIENT_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:okazj[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|gratis[a-ząćęłńóśźż]*|tanio|najtaniej|najlepsz[a-ząćęłńóśźż]*|gwarancj[a-ząćęłńóśźż]*|orygina[łl][a-ząćęłńóśźż]*|oryginaln[a-ząćęłńóśźż]*|bestseller[a-ząćęłńóśźż]*|rewelacj[a-ząćęłńóśźż]*|polecam[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|antybakteryjn[a-ząćęłńóśźż]*|dezynfekuj[a-ząćęłńóśźż]*|bakteriobójcz[a-ząćęłńóśźż]*|wysyłka\s*\d*h?|100\s*%|super|mega|hit)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/gi;
const SPECIAL_CHARS_RX = /[!@#$%^&*(){}<>|~`"'♥★☆€]/;
const LOGISTICS_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:faktura|vat|odbiór\s+osobisty|kurier|paczkomat)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i;
const CONTACT_RX = /(https?:\/\/|www\.|@\w+\.)/i;
const ERP_TYPO_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:expres|candegina)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i;
const TRAILING_CAP_RX = /\s+(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|szt\.?|kaps\.?))$/i;
const CONNECTORS = new Set(['i', 'z', 'w', 'o', 'do', 'na', 'po', 'od', 'ze', 'dla', 'oraz', 'lub', 'bez', 'pod', 'nad']);

export function normalizePolishStemClient(word = '') {
    const clean = String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!clean || clean.length < 4 || /^\d+$/.test(clean)) return '';
    if (/^(?:ml|kg|szt|kaps|cm|mm|ph)$/.test(clean)) return '';
    if (/^(?:płyn|płyni|plyn)/.test(clean)) return 'płyn';
    if (/^(?:spray|sprayu)/.test(clean)) return 'spray';
    if (/^(?:łazien|lazien)/.test(clean)) return 'łazien';
    if (/^(?:prań|prani)/.test(clean)) return 'prani';
    if (/^(?:płuka|pluka)/.test(clean)) return 'płuka';
    if (/^(?:czysz|czyszc)/.test(clean)) return 'czysz';
    return clean.slice(0, 5);
}

export function validateAllegroTitleClient(rawTitle = '') {
    const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    const length = [...title].length;
    const words = title ? title.split(/\s+/).filter(Boolean) : [];
    const errors = [];
    const warnings = [];

    if (!title) {
        return { valid: false, seoOptimal: false, length: 0, wordCount: 0, errors: ['Wpisz tytuł oferty Allegro.'], warnings: [] };
    }
    if (length > MAX_ALLEGRO_TITLE_LEN) {
        errors.push(`Przekroczono twardy limit Allegro o ${length - MAX_ALLEGRO_TITLE_LEN} zn. (${length}/${MAX_ALLEGRO_TITLE_LEN}).`);
    }
    if (length < MIN_ALLEGRO_TITLE_LEN) {
        errors.push(`Tytuł jest za krótki — minimum ${MIN_ALLEGRO_TITLE_LEN} znaków (brakuje ${MIN_ALLEGRO_TITLE_LEN - length}).`);
    } else if (length < OPTIMAL_MIN_ALLEGRO_TITLE_LEN) {
        warnings.push(`Zbyt krótki pod SEO / Allegro Ads (${length} zn.) — celuj w 58–74 znaki z frazami klientów.`);
    }
    if (words.length < 3) {
        errors.push(`Wymagane minimum 3 wyrazy (obecnie: ${words.length}).`);
    }
    if (SPECIAL_CHARS_RX.test(title)) {
        errors.push('Usuń niedozwolone znaki specjalne / ozdobniki.');
    }
    if (CONTACT_RX.test(title)) {
        errors.push('Usuń linki oraz dane kontaktowe.');
    }
    if (LOGISTICS_RX.test(title)) {
        errors.push('Usuń informacje o dostawie, fakturze lub kurierze.');
    }
    if (ERP_TYPO_RX.test(title)) {
        errors.push('Popraw literówkę katalogową ("expres" / "candegina").');
    }

    const bannedHits = [...new Set((title.match(BANNED_CLIENT_RX) || []).map(w => w.trim()))];
    if (bannedHits.length > 0) {
        errors.push(`Słowa zakazane (§A/BPR): ${bannedHits.join(', ')}.`);
    }

    const capsWords = words.filter(w => {
        const letters = w.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
        return letters.length > 3 && letters === letters.toUpperCase();
    });
    if (capsWords.length > 1) {
        warnings.push(`Unikaj CAPS LOCKA (${capsWords.join(', ')}).`);
    }

    const seenStems = new Set();
    const dupWords = new Set();
    for (const w of words) {
        const plain = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (!plain || plain.length < 4 || CONNECTORS.has(plain)) continue;
        const stem = normalizePolishStemClient(plain);
        if (stem && seenStems.has(stem)) dupWords.add(w);
        if (stem) seenStems.add(stem);
    }
    if (dupWords.size > 0) {
        warnings.push(`Powtórzone rdzenie słów osłabiają Trafność: ${[...dupWords].join(', ')}.`);
    }

    const valid = errors.length === 0;
    const seoOptimal = valid && length >= OPTIMAL_MIN_ALLEGRO_TITLE_LEN && length <= MAX_ALLEGRO_TITLE_LEN && warnings.length === 0;
    return { valid, seoOptimal, length, wordCount: words.length, errors, warnings };
}

/**
 * Skraca tytuł do ≤75 znaków bez rozcinania wyrazów w połowie, zachowując jednostkę/pojemność na końcu.
 */
export function smartTrimTitleTo75(rawTitle = '') {
    let title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    if ([...title].length <= MAX_ALLEGRO_TITLE_LEN) return title;

    title = title.replace(/\bexpres\b/gi, 'Express').replace(/\bcandegina\b/gi, 'Candeggina');
    if (/\bbagno\b/i.test(title) && /\bdo\s+łazien(?:ki|ek)\b/i.test(title)) {
        title = title.replace(/\s*\bdo\s+łazien(?:ki|ek)\b/gi, '').replace(/\s+/g, ' ').trim();
    }
    if ([...title].length <= MAX_ALLEGRO_TITLE_LEN) return title;

    const compactions = [
        [/\bw\s+sprayu\b/gi, 'spray'],
        [/\bdo\s+czyszczenia\b/gi, 'do'],
        [/\bdo\s+mycia\b/gi, 'do'],
        [/\bpowierzchni\b/gi, ''],
        [/\bzmywalnych\b/gi, '']
    ];
    for (const [rx, repl] of compactions) {
        if ([...title].length <= MAX_ALLEGRO_TITLE_LEN) break;
        title = title.replace(rx, repl).replace(/\s+/g, ' ').trim();
    }
    if ([...title].length <= MAX_ALLEGRO_TITLE_LEN) return title;

    const capMatch = title.match(TRAILING_CAP_RX);
    const trailingCap = capMatch ? capMatch[1].trim() : '';
    const words = (capMatch ? title.slice(0, capMatch.index).trim() : title).split(/\s+/).filter(Boolean);

    const buildOut = (wList, cap) => {
        const cleanW = [...wList];
        while (cleanW.length > 2 && CONNECTORS.has(cleanW[cleanW.length - 1].toLowerCase())) {
            cleanW.pop();
        }
        return cap ? `${cleanW.join(' ')} ${cap}`.trim() : cleanW.join(' ');
    };

    while (words.length > 2 && [...buildOut(words, trailingCap)].length > MAX_ALLEGRO_TITLE_LEN) {
        words.pop();
    }

    let res = buildOut(words, trailingCap);
    if ([...res].length > MAX_ALLEGRO_TITLE_LEN && trailingCap) {
        const compactCap = trailingCap.replace(/\s+/g, '');
        if ([...buildOut(words, compactCap)].length <= MAX_ALLEGRO_TITLE_LEN) {
            res = buildOut(words, compactCap);
        }
    }
    return [...res].length <= MAX_ALLEGRO_TITLE_LEN
        ? res
        : res.split(/\s+/).reduce((acc, w) => {
            const nxt = acc ? `${acc} ${w}` : w;
            return [...nxt].length <= MAX_ALLEGRO_TITLE_LEN ? nxt : acc;
        }, '');
}
