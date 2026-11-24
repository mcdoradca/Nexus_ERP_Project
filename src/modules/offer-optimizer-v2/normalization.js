const cheerio = require('cheerio');
const {
    FRAGRANCE_ALLERGEN_MOLECULES,
    FILLER_OR_PRESERVATIVE_HEADINGS_REGEX
} = require('./services/label-truth.helpers');

/**
 * Normalizuje nazwę składnika (INCI) do spójnego formatu używanego w entryName.
 * Funkcja idempotentna. Używana podczas ingestu oraz w lookupie GATE-3.
 */
function normalizeIngredientName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Usuwa znaki diakrytyczne
        .replace(/[\(\)\[\]]/g, '') // Usuwa nawiasy
        .replace(/-/g, ' ')         // Zamienia myślniki na spacje
        .replace(/\s+/g, ' ')       // Redukcja wielokrotnych spacji do jednej
        .trim();
}

const gate1 = [
    'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)',
    'butylphenyl methylpropional', 'lilial', 'p-bmhca', '2-(4-tert-butylbenzyl)propionaldehyde'
];
const gate2 = [
    'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
];
const bannedGates = new Set([...gate1, ...gate2].map(normalizeIngredientName));

/**
 * Wyciąga listę nazw z danego chunku markdown.
 * 
 * @param {string} chunk - Tekst chunku
 * @param {string} sotModule - Z którego pliku/modułu pochodzi chunk
 * @returns {string[]} Tablica unikalnych i znormalizowanych nazw
 */
function extractIngredientsFromChunk(chunk, sotModule) {
    let aliases = [];

    if (sotModule === 'SOT_06') {
        // SOT_06: Grupy, nazwy w backtickach. Np. `Benzoyl Peroxide`
        const regex = /`([^`]+)`/g;
        let match;
        while ((match = regex.exec(chunk)) !== null) {
            aliases.push(match[1]);
        }
    } else if (sotModule === 'INCI_DICT') {
        const regex = /\*\*(.+?)\*\*/g;
        let match;
        while ((match = regex.exec(chunk)) !== null) {
            const content = match[1];
            // Oddzielenie części w nawiasach jeśli występuje
            const parenMatch = content.match(/^(.*?)\s*\((.*?)\)$/);
            if (parenMatch) {
                aliases.push(parenMatch[1]);
                aliases.push(parenMatch[2]);
            } else {
                aliases.push(content);
            }
        }
    } else if (sotModule === 'SOT_10' || sotModule === 'SOT_07' || sotModule === 'SOT_05') {
        // SOT_10 / 07 / 05: Linie z ukośnikami często zawierają nazwy, ale pomijamy nagłówki []
        const lines = chunk.split('\n');
        for (let line of lines) {
            if (line.startsWith('[')) continue;
            // jeśli linia ma listę (np 1. lub *)
            line = line.replace(/^[\d\.\*\-\s]+/, '');
            if (line.trim().length === 0) continue;
            
            // Szukamy części przed myślnikiem jako potencjalnych nazw (częsty format "Nazwa / Nazwa - opis")
            const mainPart = line.split('-')[0].split('–')[0];
            const parts = mainPart.split('/');
            for (let p of parts) {
                const trimmed = p.trim();
                const parenMatch = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
                if (parenMatch) {
                    aliases.push(parenMatch[1]);
                    aliases.push(parenMatch[2]);
                } else {
                    aliases.push(trimmed);
                }
            }
        }
    }

    // Normalizacja i deduplikacja
    let normalized = aliases
        .map(n => n.trim())
        .filter(n => {
            if (n.includes(':')) return false;
            if (n.endsWith('.')) return false;
            
            const lower = n.toLowerCase();
            if (lower.includes('jako ')) return false;
            if (lower.includes('często')) return false;
            if (lower.includes('funkcja')) return false;
            if (lower.includes('kategoria')) return false;
            if (lower.includes('mechanizm')) return false;
            if (lower.includes('kryterium')) return false;
            if (lower.includes('związki polimerowe')) return false;
            
            // Odrzucenie skrótów jako samodzielnych wpisów indeksowych (aliasów)
            if (['ipa', 'coco', 'apg'].includes(lower)) return false;

            // Odrzucenie statusów typu uppercase
            if (/^[A-Z0-9_]{3,}$/.test(n)) return false;
            // Odrzucenie procentów i limitów
            if (/\d+[,.]?\d*\s*%/.test(n)) return false;
            return true;
        })
        .map(normalizeIngredientName)
        .filter(n => {
            if (n.length < 4) return false;
            if (n.split(/\s+/).length > 6) return false;
            // Twardy bezpiecznik przeciw wyciekom GATE-1 i GATE-2
            if (bannedGates.has(n)) return false;
            return true;
        });
    return [...new Set(normalized)];
}

/**
 * Standaryzuje skład INCI oraz deklarację składu detergentów (Rozp. WE 648/2004 / 1223/2009)
 * na kanoniczną, oficjalną nomenklaturę angielską INCI / IUPAC bez dodawania ani ucinania składników (1:1 ABC -> ABC).
 */
function normalizeInciToLegalEnglish(rawInci) {
    if (!rawInci || typeof rawInci !== 'string') return rawInci;
    let res = rawInci.trim();
    if (!res) return res;

    const LB = '(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])';
    const RB = '(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])';

    // 1. Zachowanie oficjalnego terminu angielskiego INCI i usunięcie dublujących dopowiedzeń w nawiasach typu "(wodorotlenek sodu)"
    res = res
        .replace(new RegExp(`${LB}kompozycj[ae]\\s+zapachow[ae]\\s*\\(\\s*(Parfum|Fragrance|Profumo|Perfume)\\s*\\)`, 'gi'), 'Parfum')
        .replace(new RegExp(`${LB}(Sodium\\s+Hydroxide)\\s*\\(\\s*wodorotlenek\\s+sodu\\s*\\)`, 'gi'), '$1')
        .replace(new RegExp(`${LB}(Sodium\\s+Hypochlorite)\\s*\\(\\s*podchloryn\\s+sodu\\s*\\)`, 'gi'), '$1')
        .replace(new RegExp(`${LB}(Alcohols,\\s*C12-14,\\s*ethoxylated,\\s*sulfates,\\s*sodium\\s+salts)\\s*\\([^)]*etoksylowane[^)]*\\)`, 'gi'), '$1');

    // 2. Mapowanie grup WE 648/2004 oraz najczęstszych nazw chemicznych z PL/IT/DE/FR -> oficjalny angielski INCI / WE 648
    const translations = [
        [`(?:anionow[ey]\\s+(?:środki|związki|substancje)\\s+powierzchniowo\\s+czynne|tensioattivi\\s+anionici|anionische\\s+tenside|agents\\s+de\\s+surface\\s+anioniques)`, 'Anionic surfactants'],
        [`(?:niejonow[ey]\\s+(?:środki|związki|substancje)\\s+powierzchniowo\\s+czynne|tensioattivi\\s+non\\s+ionici|nichtionische\\s+tenside|agents\\s+de\\s+surface\\s+non\\s+ioniques)`, 'Non-ionic surfactants'],
        [`(?:amfoteryczn[ey]\\s+(?:środki|związki|substancje)\\s+powierzchniowo\\s+czynne|tensioattivi\\s+anfoteri|amphotere\\s+tenside|agents\\s+de\\s+surface\\s+amphotères)`, 'Amphoteric surfactants'],
        [`(?:kationow[ey]\\s+(?:środki|związki|substancje)\\s+powierzchniowo\\s+czynne|tensioattivi\\s+cationici|kationische\\s+tenside)`, 'Cationic surfactants'],
        [`(?:(?:środki|związki)\\s+wybielając[ey]\\s+na\\s+bazie\\s+chloru|sbiancanti\\s+a\\s+base\\s+di\\s+cloro)`, 'Chlorine-based bleaching agents'],
        [`(?:(?:środki|związki)\\s+wybielając[ey]\\s+na\\s+bazie\\s+tlenu|sbiancanti\\s+a\\s+base\\s+di\\s+ossigeno)`, 'Oxygen-based bleaching agents'],
        [`(?:rozjaśniacze\\s+optyczne|sbiancanti\\s+ottici)`, 'Optical brighteners'],
        [`(?:polikarboksylany|policarbossilati)`, 'Polycarboxylates'],
        [`(?:fosfoniany|fosfonati)`, 'Phosphonates'],
        [`(?:tlenki\\s+aminy|tlenek\\s+aminy)`, 'Amine oxides'],
        [`(?:zeolity|zeoliti)`, 'Zeolites'],
        [`(?:krzemian\\s+sodu)`, 'Sodium Silicate'],
        [`(?:krzemiany|silicati)`, 'Silicates'],
        [`(?:enzymy|enzimi)`, 'Enzymes'],
        [`(?:środki\\s+konserwujące|konserwanty|conservanti?|konservierungsstoffe)`, 'Preservatives'],
        [`(?:kompozycj[aei]\\s+zapachow[aei]+|substancje\\s+zapachowe|aromaty|profumo|profumi|duftstoffe)`, 'Parfum'],
        [`(?:barwniki|coloranti)`, 'Colorants'],
        [`(?:mydło|mydła|sapone|seife)`, 'Soap'],
        [`(?:benzizotiazolinon|benzisothiazolinon[ea]?)`, 'Benzisothiazolinone'],
        [`(?:metylochloroizotiazolinon|methylchloroisothiazolinon[ea]?)`, 'Methylchloroisothiazolinone'],
        [`(?:metyloizotiazolinon|methylisothiazolinon[ea]?)`, 'Methylisothiazolinone'],
        [`(?:zawieraj[ąa]?|contiene|contengono|enthält|contient)\\s*:?`, 'Contains:'],
        [`(?:siarczan\\s+sodowo[-\\s]+lauretowy|laurylosiarczan\\s+sodu|laureth\\s+siarczan\\s+sodu)`, 'Sodium Laureth Sulfate'],
        [`(?:kokamidopropylobetaina|betaina\\s+kokamidopropylowa)`, 'Cocamidopropyl Betaine'],
        [`(?:fenoksyetanol)`, 'Phenoxyethanol'],
        [`(?:etyloheksylogliceryna)`, 'Ethylhexylglycerin'],
        [`(?:pantenol|prowitamina\\s+b5)`, 'Panthenol'],
        [`(?:alantoina)`, 'Allantoin'],
        [`(?:niacynamid|witamina\\s+b3)`, 'Niacinamide'],
        [`(?:tokoferol|witamina\\s+e)`, 'Tocopherol'],
        [`(?:chlorek\\s+benzalkoniowy)`, 'Benzalkonium Chloride'],
        [`(?:wodorotlenek\\s+sodu|idrossido\\s+di\\s+sodio|natriumhydroxid)`, 'Sodium Hydroxide'],
        [`(?:wodorotlenek\\s+potasu|idrossido\\s+di\\s+potassio|kaliumhydroxid)`, 'Potassium Hydroxide'],
        [`(?:podchloryn\\s+sodu|ipoclorito\\s+di\\s+sodio|natriumhypochlorit)`, 'Sodium Hypochlorite'],
        [`(?:alkohole\\s+C12-14,\\s*etoksylowane,\\s*siarczanowane,\\s*sole\\s+sodowe|alcoli,?\\s*C12-14,?\\s*etossilati,?\\s*solfati,?\\s*sali\\s+di\\s+sodio)`, 'Alcohols, C12-14, ethoxylated, sulfates, sodium salts'],
        [`(?:kwas\\s+cytrynowy|acido\\s+citrico|citronensäure)`, 'Citric Acid'],
        [`(?:kwas\\s+mlekowy|acido\\s+lattico)`, 'Lactic Acid'],
        [`(?:kwas\\s+salicylowy|acido\\s+salicilico)`, 'Salicylic Acid'],
        [`(?:kwas\\s+glikolowy|acido\\s+glicolico)`, 'Glycolic Acid'],
        [`(?:kwas\\s+octowy|acido\\s+acetico)`, 'Acetic Acid'],
        [`(?:woda\\s+oczyszczona|woda|acqua)`, 'Aqua'],
        [`(?:gliceryna|glicerina)`, 'Glycerin'],
        [`(?:chlorek\\s+sodu|cloruro\\s+di\\s+sodio)`, 'Sodium Chloride'],
        [`(?:węglan\\s+sodu|carbonato\\s+di\\s+sodio)`, 'Sodium Carbonate'],
        [`(?:wodorowęglan\\s+sodu|bicarbonato\\s+di\\s+sodio)`, 'Sodium Bicarbonate']
    ];

    for (const [pat, replacement] of translations) {
        const re = pat.endsWith(':?')
            ? new RegExp(`${LB}${pat}`, 'gi')
            : new RegExp(`${LB}${pat}${RB}`, 'gi');
        res = res.replace(re, replacement);
    }

    return res.replace(/Contains:\s*:/gi, 'Contains:').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Sprawdza, czy czysty tekst samodzielnego akapitu to surowa stopka z pełnym składem INCI / WE 648/2004.
 */
function isRawInciFooterText(plainText) {
    const clean = String(plainText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return false;

    if (/^(?:pełny\s+)?(?:skład(?:\s*\(\s*(?:zgodnie\s+z\s+rozp\.[^)]*|inci)\s*\)|\s+inci|\s*\/\s*inci)|składniki\s*(?:\(\s*inci\s*\)|inci)|ingredients\s*(?:\(\s*inci\s*\))?)\s*:/i.test(clean)) {
        return true;
    }

    const matchPlainSklad = clean.match(/^skład\s*:\s*(.+)$/i);
    if (matchPlainSklad) {
        const rest = matchPlainSklad[1].trim();
        if (rest.includes(',') || /\b(?:aqua|parfum|glycerin|sodium|surfactants|środki\s+powierzchniowo)\b/i.test(rest)) {
            return true;
        }
    }

    return false;
}

/**
 * Usuwa z HTML Sekcji 3 (Moduł 3) końcowy akapit z pełną surową listą składników INCI / WE 648/2004,
 * pozostawiając opisy mechanizmów działania kluczowych składników (⚙️) oraz synergii (⚡).
 */
function stripRawInciFooterFromSection3(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    const raw = htmlStr.trim();
    if (!raw) return htmlStr;

    const $ = cheerio.load(raw, null, false);
    let removedFooter = false;

    $('p').each((_, el) => {
        const $el = $(el);
        if ($el.closest('li').length > 0) return;

        const text = $el.text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (isRawInciFooterText(text)) {
            $el.remove();
            removedFooter = true;
            return;
        }

        const innerHtml = $el.html() || '';
        const brSplit = innerHtml.split(/<br\s*\/?>|\r?\n/i);
        if (brSplit.length > 1) {
            const cutIdx = brSplit.findIndex(part => {
                const partText = cheerio.load(part, null, false).text();
                return isRawInciFooterText(partText);
            });
            if (cutIdx !== -1) {
                const kept = brSplit.slice(0, cutIdx).join('<br>').replace(/(?:<br\s*\/?>|\s)+$/i, '').trim();
                if (kept) {
                    $el.html(kept);
                } else {
                    $el.remove();
                }
                removedFooter = true;
            }
        }
    });

    if (removedFooter) {
        // Usuwa osierocone puste akapity na końcu pozostałe po wycięciu stopki INCI
        const rootNodes = $.root().children().toArray();
        for (let i = rootNodes.length - 1; i >= 0; i--) {
            const $node = $(rootNodes[i]);
            if (rootNodes[i].type === 'tag' && rootNodes[i].name === 'p') {
                const nodeText = $node.text().replace(/\u00a0/g, ' ').trim();
                if (!nodeText && $node.find('img').length === 0) {
                    $node.remove();
                    continue;
                }
            }
            break;
        }
    }

    return $.root().html().trim();
}

/**
 * Usuwa z HTML Sekcji 3 (Moduł 3) punkty o wodzie/soli/konserwantach/barwnikach oraz czyści
 * straszaki o alergenach i wymogach detergentowych WE 648/2004 z opisu Parfum.
 * Jeśli usunięcie wyczyściłoby wszystkie elementy <li>, zachowuje oryginał do wyłapania przez walidatory/audytorów.
 */
function stripMarketingScareAndFillerBulletsFromSection3(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return htmlStr;
    const raw = htmlStr.trim();
    if (!raw) return htmlStr;

    const $ = cheerio.load(raw, null, false);
    const allLis = $('li').toArray();
    if (allLis.length === 0) {
        return raw;
    }

    const allergenGroupRx = new RegExp(`\\b(?:${FRAGRANCE_ALLERGEN_MOLECULES.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
    let keptLis = 0;

    for (const li of allLis) {
        const $li = $(li);
        const liText = $li.text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const headingText = $li.find('b, strong').first().text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        if (headingText && FILLER_OR_PRESERVATIVE_HEADINGS_REGEX.test(headingText)) {
            $li.remove();
            continue;
        }

        const isFragranceItem = /\b(?:parfum|kompozycj[aęi]\s+zapachow|zapach(?:ow)?)\b/i.test(`${headingText} ${liText}`);
        const hasPreservativeScare = /(?:stabilizator\s+mikrobiologiczny|układ\s+konserwujący|przed\s+(?:rozwojem\s+)?(?:bakterii|grzybów|drobnoustrojów|zepsuciem)|benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol)/i.test(liText);
        if (hasPreservativeScare) {
            $li.remove();
            continue;
        }

        if (!isFragranceItem && /(?<!\bbez\s+)(?<!nie\s+zawiera\s+)(?<!woln[aey]\s+od\s+)\balergen[a-ząćęłńóśźż]*|wymog[a-ząćęłńóśźż]*\s+detergentow|648\/2004|1223\/2009/i.test(liText)) {
            $li.remove();
            continue;
        }

        if (isFragranceItem) {
            let liHtml = $li.html() || '';
            const cleanedLiHtml = liHtml
                .replace(/\(\s*(?:(?:w\s+tym|zawiera|m\.?in\.?)\s+)?alergen[a-ząćęłńóśźż]*\s*:?[^)]*\)/gi, '')
                .replace(/\s*(?:,|\boraz\b|\bi\b)?\s*(?:a\s+obecne\s+składniki\s+zapachowe\s+są\s+)?ujawnion[aeyą]\s+zgodnie\s+z\s+(?:wymogami\s+detergentowymi|rozp\.?\s*(?:WE\s*)?648\/2004)\.?/gi, '.')
                .replace(/,?\s*a?\s*wymienione\s+alergeny\s+zapachowe\s+są\s+obowiązkowo\s+ujawniane[^.<]*\.?/gi, '.')
                .replace(/\s*(?:\(|,)?\s*(?:oraz|i)\s+alergen[a-ząćęłńóśźż]*(?:\s+zapachow[a-ząćęłńóśźż]*)?(?:\s*(?:m\.?in\.?|np\.?))?[^):<]*(\)|(?=<\/(?:b|strong)>))/gi, '$1')
                .replace(/\s*(?:oraz|i)\s+alergen[a-ząćęłńóśźż]*\s+zapachow[a-ząćęłńóśźż]*\s+(?:[A-Z][A-Za-z-]+\s*){1,4}(?=:)/g, '')
                .replace(allergenGroupRx, '')
                .replace(/:\s*(?:[,;.\s-]+)+(?=<\/(?:b|strong)>)/g, ':')
                .replace(/\(\s*[,;.\s-]+\s*\)/g, '')
                .replace(/\(\s*\)/g, '')
                .replace(/\s+:/g, ':')
                .replace(/\s*\.\s*\./g, '.')
                .replace(/,\s*\./g, '.')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (cleanedLiHtml !== liHtml) {
                const postCleanText = cheerio.load(`<li>${cleanedLiHtml}</li>`, null, false)('li').text().trim();
                const stillTainted = /(?<!\bbez\s+)\balergen[a-ząćęłńóśźż]*|wymog[a-ząćęłńóśźż]*\s+detergentow|648\/2004/i.test(postCleanText) || allergenGroupRx.test(postCleanText);
                allergenGroupRx.lastIndex = 0;
                if (!stillTainted) {
                    $li.html(cleanedLiHtml);
                } else {
                    $li.remove();
                    continue;
                }
            }
        }

        keptLis++;
    }

    if (keptLis === 0) {
        return raw;
    }

    return $.root().html().trim();
}

module.exports = {
    normalizeIngredientName,
    extractIngredientsFromChunk,
    normalizeInciToLegalEnglish,
    isRawInciFooterText,
    stripRawInciFooterFromSection3,
    stripMarketingScareAndFillerBulletsFromSection3
};
