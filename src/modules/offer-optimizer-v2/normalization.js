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

module.exports = { normalizeIngredientName, extractIngredientsFromChunk, normalizeInciToLegalEnglish };
