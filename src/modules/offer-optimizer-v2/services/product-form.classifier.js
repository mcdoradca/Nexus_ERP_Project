/**
 * Współdzielony, deterministyczny klasyfikator formy fizycznej i właściwości fizykochemicznych wyrobu.
 * Eliminuje powielone regexy między orkiestratorem, silnikiem deterministycznym, FAQ i walidatorami,
 * zapobiegając fałszywym klasyfikacjom (np. mydło w płynie o zapachu „talk” jako sypki puder,
 * żel z „olejem migdałowym” jako bezwodny olej czy stałe tabletki chlorowe jako płynny podchloryn).
 */

function stripHtmlSimple(str = '') {
    return String(str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveFeatureValue(features = {}, keys = []) {
    if (!features || typeof features !== 'object') return '';
    const map = new Map(
        Object.entries(features).map(([k, v]) => [String(k).toLowerCase().trim(), v])
    );
    for (const key of keys) {
        const val = map.get(String(key).toLowerCase().trim());
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
        }
    }
    return '';
}

const ARTICLE_REGEX = /\b(szczoteczk[a-ząćęłńóśźż]*|toothbrush|ni[cć]\s+dentystyczn[a-ząćęłńóśźż]*|floss|czyścik[a-ząćęłńóśźż]*|gąbk[a-ząćęłńóśźż]*|pęset[a-ząćęłńóśźż]*|maszynk[a-ząćęłńóśźż]*|artyku[lł]\s+(?:higieniczn|stał)[a-ząćęłńóśźż]*)\b/i;

const REFILL_REGEX = /\b(zapas|refill|ricarica|uzupełnieni[ea]|doypack|wkład\s+uzupełniający)\b/i;

const AQUEOUS_FORM_REGEX = /\b(mydł[ao]\s+w\s+płynie|w\s+płynie|płyn(?:y|u|em|ów)?\b|w\s+żelu|żel(?:u|em|e|ów)?\b|w\s+sprayu|spray(?:u|em|e)?\b|aerozol(?:u|em)?|mgiełk[aęi]|piank[aęi]|w\s+piance|mleczk[ao]|szampon(?:y|u|em)?|balsam(?:y|u|em)?|krem(?:y|u|em)?|tonik(?:u|iem)?|hydrolat|emulsj[aęi]|płyn\s+do\s+kąpieli|żel\s+pod\s+prysznic|bagnodoccia|docciaschiuma|bagnoschiuma|sapone\s+liquido|odżywk[aęi]|mask[aęi]\s+do\s+włosów|w\s+mleczku|chusteczk[ai]\s+nawilżan[ea])\b/i;

const TABLET_CAPSULE_BAR_REGEX = /\b(tabletk[aieą]|w\s+tabletkach|kapsułk[aieą]|kapsułki|caps\b|tabs\b|kostk[aieą]|w\s+kostce|krąż(?:ek|ki)|zawieszk[aieą])\b/i;

const POWDER_FORM_REGEX = /\b(w\s+proszku|proszek|proszku|puder\s+mineralny|puder\s+sypki|puder\s+prasowany|puder\s+do\s+ciała|puder\s+dla\s+dzieci|suchy\s+puder|talk\s+w\s+proszku|talk\s+kosmetyczny|cie[nń]\s+do\s+powiek|cienie\s+do\s+powiek|granulk[ai]|granulat|w\s+granulkach)\b/i;

const PURE_POWDER_NAME_START_REGEX = /^\s*(?:czysty\s+|suchy\s+)?(?:talk|puder|proszek)\b|\b(?:borotalco\s+polvere|talco\s+in\s+polvere|puder\s+sypki|puder\s+mineralny)\b/i;

const PURE_OIL_REGEX = /(?:^\s*(?:czysty\s+|100%\s*)?olej(?:ek)?\b|\bolej(?:ek)?\s+(?:do\s+(?:ciała|twarzy|włosów|masażu)|bezwodny|kosmetyczny|arganowy\s+100%)\b)/i;

/**
 * Klasyfikuje fizyczną postać i reżim wodny/bezwodny produktu na podstawie potwierdzonych metadanych i nazwy.
 * @param {Object} [input]
 * @returns {Object} Wynik klasyfikacji formy fizycznej produktu.
 */
function classifyProductPhysicalForm(input = {}) {
    const features = (input.features && typeof input.features === 'object') ? input.features : {};
    const visionFeatures = (input.visionFeatures && typeof input.visionFeatures === 'object') ? input.visionFeatures : {};

    const name = String(input.productName || input.name || features['Nazwa'] || '').trim();
    const category = String(input.category || features['Kategoria'] || '').trim();
    const postac = String(
        input.postac ||
        resolveFeatureValue(features, ['Postać', 'Postac', 'Forma']) ||
        resolveFeatureValue(visionFeatures, ['Postać']) ||
        ''
    ).trim();
    const dozownik = String(
        input.dozownik ||
        resolveFeatureValue(features, ['Dozownik']) ||
        resolveFeatureValue(visionFeatures, ['Dozownik']) ||
        ''
    ).trim();
    const packaging = String(
        input.packaging ||
        resolveFeatureValue(features, ['Opakowanie produktu', 'Opakowanie']) ||
        resolveFeatureValue(visionFeatures, ['Opakowanie (Front)', 'Opakowanie (Etykieta)']) ||
        ''
    ).trim();
    const inci = String(
        input.inci ||
        resolveFeatureValue(features, ['Skład/INCI', 'INCI', 'Skład']) ||
        ''
    ).trim();
    const detergentComposition = String(input.detergentComposition || '').trim();
    const rawText = stripHtmlSimple(input.rawText || '');

    const structuralSurface = `${name} ${postac}`.trim();
    const allContext = `${structuralSurface} ${category} ${dozownik} ${packaging} ${rawText}`.trim();
    const postacLower = postac.toLowerCase();
    const nameLower = name.toLowerCase();
    const chemLower = `${name} ${inci} ${detergentComposition} ${rawText}`.toLowerCase();

    const isRefill = REFILL_REGEX.test(`${name} ${packaging} ${dozownik} ${resolveFeatureValue(features, ['Cechy dodatkowe'])}`);
    const isArticle = ARTICLE_REGEX.test(`${structuralSurface} ${category}`);

    const hasExplicitPowderPostac = /\b(proszek|puder|talk|granulki)\b/i.test(postacLower);
    const hasExplicitTabletPostac = TABLET_CAPSULE_BAR_REGEX.test(postacLower);
    const hasExplicitLiquidPostac = AQUEOUS_FORM_REGEX.test(postacLower);
    const hasExplicitOilPostac = /^(?:olej|olejek|w olejku)$/i.test(postacLower);

    const hasAqueousInci = !isArticle &&
        !hasExplicitPowderPostac &&
        !hasExplicitTabletPostac &&
        /\b(?:aqua|water)\b/i.test(`${inci} ${detergentComposition}`);

    const hasAqueousSignal = Boolean(
        !isArticle &&
        (hasExplicitLiquidPostac || AQUEOUS_FORM_REGEX.test(name) || hasAqueousInci)
    );

    const isTabletOrCapsule = Boolean(
        !isArticle &&
        !hasExplicitLiquidPostac &&
        (hasExplicitTabletPostac || TABLET_CAPSULE_BAR_REGEX.test(name))
    );

    // Wykluczenie false-positive dla słowa "talk" w zapachu mydła/żelu lub "proszek" poza suchym produktem:
    // produkt w płynie/żelu/szamponie/kremie lub zawierający Aqua NIGDY nie jest suchym pudrem bezwodnym!
    const hasPowderSignalInContext =
        hasExplicitPowderPostac ||
        POWDER_FORM_REGEX.test(allContext) ||
        PURE_POWDER_NAME_START_REGEX.test(nameLower);

    const isDryPowder = Boolean(
        !isArticle &&
        !isTabletOrCapsule &&
        !hasAqueousSignal &&
        hasPowderSignalInContext
    );

    const hasPureOilSignal = hasExplicitOilPostac || PURE_OIL_REGEX.test(nameLower) ||
        (/\bczysty\s+olej\b/i.test(rawText) && !hasAqueousSignal);
    const isAnhydrousOil = Boolean(
        !isArticle &&
        !isTabletOrCapsule &&
        !isDryPowder &&
        !hasAqueousSignal &&
        hasPureOilSignal
    );

    const isAnhydrousOrArticle = Boolean(isArticle || isDryPowder || isAnhydrousOil);

    const hasChlorineKeywords = /(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|EUH206|troclosene|dichloroisocyanurate|trichloroisocyanuric|calcium\s+hypochlorite|aktywny\s+chlor|z\s+chlorem|chlorine|wybielając)/i.test(chemLower);
    const hasSolidChlorineDonor = /(troclosene|dichloroisocyanurate|trichloroisocyanuric|calcium\s+hypochlorite)/i.test(chemLower);

    const isSolidChlorine = Boolean(
        (isTabletOrCapsule || isDryPowder) && hasChlorineKeywords
    );
    const isLiquidHypochlorite = Boolean(
        !isArticle &&
        !isTabletOrCapsule &&
        !isDryPowder &&
        !hasSolidChlorineDonor &&
        /(sodium\s+hypochlorite|podchloryn\s+sodu|candeggin|EUH206)/i.test(chemLower)
    );

    // Rozstrzygnięcie kanonicznej postaci do komunikacji i FAQ (priorytet: zatwierdzone postac -> nazwa -> dozownik)
    let form = 'unknown';
    let formAccusativePl = 'ten preparat';

    const formSource = `${postac} ${name}`.toLowerCase();
    if (isArticle) {
        form = 'article';
        formAccusativePl = 'ten produkt';
    } else if (isAnhydrousOil) {
        form = 'oil_anhydrous';
        formAccusativePl = 'ten olejek';
    } else if (/\btablet(?:k[aię]|ek)|tabs\b/i.test(formSource)) {
        form = 'tablet';
        formAccusativePl = 'tabletki';
    } else if (/\bkapsuł(?:k[aię]|ek)|caps\b/i.test(formSource)) {
        form = 'capsule';
        formAccusativePl = 'kapsułki';
    } else if (/\bkost(?:k[aię]|ce)\b/i.test(formSource)) {
        form = 'bar';
        formAccusativePl = 'kostkę';
    } else if (/\bchusteczk/i.test(formSource)) {
        form = 'wipes';
        formAccusativePl = 'chusteczki';
    } else if (isDryPowder || /\bgranul/i.test(formSource)) {
        form = 'powder';
        formAccusativePl = /\b(talk|puder)\b/i.test(formSource) ? 'puder' : 'proszek';
    } else if (/\bspray\b|\bwsprayu\b|\bw\s+sprayu\b/i.test(formSource) || /\batomizer|\bspray\b/i.test(dozownik.toLowerCase())) {
        form = 'spray';
        formAccusativePl = 'spray';
    } else if (/\bpiank|\bw\s+piance\b/i.test(formSource)) {
        form = 'foam';
        formAccusativePl = 'piankę';
    } else if (/\bmleczk/i.test(formSource)) {
        form = 'cream_milk';
        formAccusativePl = 'mleczko';
    } else if (/\bżel|\bw\s+żelu\b/i.test(formSource)) {
        form = 'gel';
        formAccusativePl = 'żel';
    } else if (/\bkrem/i.test(formSource)) {
        form = 'cream_milk';
        formAccusativePl = 'krem';
    } else if (/\bpłyn|\bw\s+płynie\b|\bmydło\s+w\s+płynie\b/i.test(formSource) || hasAqueousSignal) {
        form = 'liquid';
        formAccusativePl = 'płyn';
    }

    return {
        form,
        formAccusativePl,
        isArticle,
        isRefill,
        hasAqueousSignal,
        isTabletOrCapsule,
        isDryPowder,
        isAnhydrousOil,
        isAnhydrousOrArticle,
        isSolidChlorine,
        isLiquidHypochlorite
    };
}

module.exports = {
    classifyProductPhysicalForm
};
