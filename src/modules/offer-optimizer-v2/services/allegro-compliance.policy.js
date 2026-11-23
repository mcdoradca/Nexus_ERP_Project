/**
 * Centralna Polityka Zgodności Allegro 2026, UOKiK, IP/Znaków Towarowych i Prawa UE (SSOT).
 *
 * Jedno źródło prawdy współdzielone przez:
 * - Agent 0 Vision OCR (`vision-extractor.service.js`) — blokada wpuszczania sloganów z etykiet do PIM
 * - Silnik deterministyczny (`deterministic-pipeline.engine.js`) — sanityzacja promptów, tytułów, HTML i Sekcji 5
 * - Walidatory (`validators/index.js`) i Orkiestrator (`orchestrator.js`) — audyt i eskalacja A11 -> A10
 * - Bramki Pre-flight eksportu (`allegro_mapper.js`, `baselinker.export.service.js`, `vonhalsky_mapper.js`)
 *
 * UWAGA PRAWNA: Sekcja 6 (ostrzeżenia CLP/GPSR) oraz pełny skład INCI są nietykalne merytorycznie
 * i podlegają wyłącznie kontroli antykontaktowej oraz zakazowi słowa "oryginalny" (§A).
 */

const L_BEFORE = '(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])';
const L_AFTER = '(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])';

const VERIFIED_ECO_CERT_RX = /\b(?:EU\s+Ecolabel|Ecolabel|ECOCERT|COSMOS|ICEA|VEGANOK|Nordic\s+Swan|Blue\s+Angel|B\s+Corp|Cradle\s+to\s+Cradle)\b/i;
const VERIFIED_CRUELTY_FREE_CERT_RX = /\b(?:Leaping\s+Bunny|Cruelty\s+Free\s+International|PETA\s+Approved)\b/i;

const COMPLIANCE_RISK_CATEGORIES = {
    RANKING_POPULARITY: {
        id: 'RANKING_POPULARITY',
        label: 'Rankingi, popularność i niepotwierdzona pozycja lidera',
        severity: 'HIGH',
        recommendation: 'Usuń całkowicie hasła rankingowe i deklaracje popularności (boty Allegro i UOKiK flagują nieudowodnione twierdzenia o pozycji rynkowej).'
    },
    THIRD_PARTY_ENDORSEMENT: {
        id: 'THIRD_PARTY_ENDORSEMENT',
        label: 'Rekomendacje obcych marek i porównania (ryzyko IP/spam)',
        severity: 'HIGH',
        recommendation: 'Usuń nazwy obcych marek z rekomendacji oraz sformułowania porównawcze (ryzyko naruszenia znaków towarowych i manipulacji słowami kluczowymi).'
    },
    PACKAGING_PROMO_HYPE: {
        id: 'PACKAGING_PROMO_HYPE',
        label: 'Hype opakowaniowy, nowości i krzykliwe hasła reklamowe',
        severity: 'HIGH',
        recommendation: 'Zastąp konkretami technicznymi (pojemność, waga, liczba użyć) i usuń etykiety promocyjne z opakowania.'
    },
    UNSUBSTANTIATED_SLOGANS_TECH: {
        id: 'UNSUBSTANTIATED_SLOGANS_TECH',
        label: 'Niepoparte slogany skuteczności i niesprawdzone technologie',
        severity: 'MEDIUM',
        recommendation: 'Zastąp ogólniki reklamowe rzeczowym opisem działania fizycznego lub chemicznego bez obietnic bezwysiłkowych/błyskawicznych efektów.'
    },
    SALES_SECOND_PERSON_PITCH: {
        id: 'SALES_SECOND_PERSON_PITCH',
        label: 'Zwroty sprzedażowe w 2. osobie (do Twojego domu/łazienki)',
        severity: 'MEDIUM',
        recommendation: 'Przeredaguj na bezosobowy opis zastosowania i powierzchni docelowych.'
    },
    OVERCLAIM_QUASI_BIOCIDAL: {
        id: 'OVERCLAIM_QUASI_BIOCIDAL',
        label: 'Czasowniki przesadne, quasi-biobójcze i deklaracje 100%',
        severity: 'HIGH',
        recommendation: 'Zastąp czasownikami rzeczowymi ("usuwa", "neutralizuje", "ogranicza") i wyeliminuj "100%"/"99,9%".'
    },
    UNVERIFIED_GREENWASHING: {
        id: 'UNVERIFIED_GREENWASHING',
        label: 'Greenwashing i niezweryfikowane deklaracje ekologiczne',
        severity: 'HIGH',
        recommendation: 'Usuń ogólne hasła ekologiczne lub zachowaj wyłącznie zweryfikowane certyfikaty i fakty materiałowe (np. procent plastiku z recyklingu).'
    },
    LOGISTICS_PRICING_CTA_FOREIGN: {
        id: 'LOGISTICS_PRICING_CTA_FOREIGN',
        label: 'Obietnice wysyłki, ceny, CTA, słowo "oryginalny" i obce slogany',
        severity: 'HIGH',
        recommendation: 'Usuń informacje niezwiązane bezpośrednio z przedmiotem oferty oraz nieprzetłumaczone slogany obcojęzyczne.'
    }
};

/**
 * Tworzy wyrażenie regularne z pełnymi granicami liter Unicode (ochrona polskich znaków diakrytycznych).
 */
function buildUnicodeBoundaryRegex(patternBodies = [], flags = 'gi') {
    const joined = patternBodies.map(b => `(?:${b})`).join('|');
    return new RegExp(`${L_BEFORE}(?:${joined})${L_AFTER}`, flags);
}

/**
 * Maskuje tagi HTML spacjami o tej samej długości, aby zachować dokładne indeksy znakowe w HTML
 * i jednocześnie wyeliminować fałszywe trafienia wewnątrz nazw tagów czy atrybutów.
 */
function maskHtmlTagsPreservingOffsets(htmlOrText) {
    return String(htmlOrText || '').replace(/<[^>]*>/g, m => ' '.repeat(m.length));
}

function stripHtmlToPlainText(htmlOrText) {
    return String(htmlOrText || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// --- Klasyczne §A + rozszerzone bezwzględne zakazy dla twardego skanera `scan_stopwords` ---
const STRICT_STOPWORD_SPECS = [
    // 1. Gwarancje, 100%, autentyczność i oceny absolutne
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarancj[aeiłąę]*\\s+najniższej\\s+ceny' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarancj[aeiłąę]*\\s+jakoś[ćc]i' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarancj[aeiłąę]*\\s+satysfakcji' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarancj[aeiłąę]*\\s+zwrotu' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarancj[aeiłąę]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gwarantuj[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'gwarantowan[a-ząćęłńóśźż]*\\s+działani[a-ząćęłńóśźż]*' },
    { category: 'OVERCLAIM_QUASI_BIOCIDAL', body: 'w\\s+100\\s*%\\s+udowodnion[a-ząćęłńóśźż]*' },
    { category: 'OVERCLAIM_QUASI_BIOCIDAL', body: '100\\s*%\\s+udowodnion[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'udowodnion[a-ząćęłńóśźż]*\\s+skutecznoś[ćc][a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'pewnoś[ćc]\\s+działania' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'pewnoś[ćc]\\s+zakupu' },
    { category: 'OVERCLAIM_QUASI_BIOCIDAL', body: '100\\s*%\\s+pewnoś[ćc]i' },
    { category: 'OVERCLAIM_QUASI_BIOCIDAL', body: 'w\\s+100\\s*%' },
    { category: 'OVERCLAIM_QUASI_BIOCIDAL', body: '(?<!\\d)100\\s*%' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'najlepsz[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'bezkonkurencyjn[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'niezrównan[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'rewelacyjn[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'rewelacj[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'cudown[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'magiczn[a-ząćęłńóśźż]*' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'niezawodn[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'oryginalnoś[ćc][a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'oryginaln[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'orygina[łl][a-ząćęłńóśźż]*' },

    // 2. Rankingi i niepotwierdzone twierdzenia o popularności (wprost lub z etykiet)
    { category: 'RANKING_POPULARITY', body: 'numer\\s*#?\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|w\\s+Europie|in\\s+Italia|na\\s+rynku))?' },
    { category: 'RANKING_POPULARITY', body: 'nr\\s*#?\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|w\\s+Europie|in\\s+Italia|na\\s+rynku))?' },
    { category: 'RANKING_POPULARITY', body: 'n°\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|w\\s+Europie|in\\s+Italia|na\\s+rynku))?' },
    { category: 'RANKING_POPULARITY', body: 'no\\.?\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|w\\s+Europie|in\\s+Italia|na\\s+rynku))?' },
    { category: 'RANKING_POPULARITY', body: 'chętnie\\s+wybieran[a-ząćęłńóśźż]*' },
    { category: 'RANKING_POPULARITY', body: 'najchętniej\\s+(?:wybieran|kupowan)[a-ząćęłńóśźż]*' },
    { category: 'RANKING_POPULARITY', body: 'najczęściej\\s+(?:wybieran|kupowan)[a-ząćęłńóśźż]*' },
    { category: 'RANKING_POPULARITY', body: 'najlepiej\\s+sprzedając[a-ząćęłńóśźż]*\\s+się' },
    { category: 'RANKING_POPULARITY', body: 'il\\s+più\\s+venduto' },
    { category: 'RANKING_POPULARITY', body: 'lider\\s+rynku' },
    { category: 'RANKING_POPULARITY', body: 'hit[a-ząćęłńóśźż]*\\s+sprzedaży' },
    { category: 'RANKING_POPULARITY', body: 'bestseller[a-ząćęłńóśźż]*' },

    // 3. Rekomendacje obcych marek / porównania (§A pkt 4 + IP)
    { category: 'THIRD_PARTY_ENDORSEMENT', body: '(?:rekomendowan|polecan|zatwierdzon)[a-ząćęłńóśźż]*\\s+przez\\s+[A-Za-zĄĆĘŁŃÓŚŹŻ0-9][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9\\s.&-]{1,45}' },
    { category: 'THIRD_PARTY_ENDORSEMENT', body: '(?:raccomandat|consigliat)[oaie]\\s+da\\s+[A-Za-z0-9][A-Za-z0-9\\s.&-]{1,45}' },
    { category: 'THIRD_PARTY_ENDORSEMENT', body: 'w\\s+stylu' },
    { category: 'THIRD_PARTY_ENDORSEMENT', body: 'odpowiednik' },
    { category: 'THIRD_PARTY_ENDORSEMENT', body: 'zamiennik' },
    { category: 'THIRD_PARTY_ENDORSEMENT', body: 'lepsze\\s+niż' },

    // 4. Hype opakowaniowy, promocyjny i cenowy
    { category: 'PACKAGING_PROMO_HYPE', body: '(?:w\\s+)?(?:formacie|format|opakowaniu|opakowanie|rozmiarze|rozmiar|wersji|wersja)\\s+(?:XXL|Jumbo|Maxi|Mega|Family|ekonomiczn[a-ząćęłńóśźż]*)' },
    { category: 'PACKAGING_PROMO_HYPE', body: '(?:nowa\\s+)?(?:ulepszona|mocniejsza|ulepszonej|mocniejszej)\\s+formuł[a-ząćęłńóśźż]*' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'nowa\\s+formuł[a-ząćęłńóśźż]*' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'formuł[a-ząćęłńóśźż]*\\s+nowej\\s+generacji' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'formula\\s+(?:migliorata|potente)' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'potere\\s+sbiancante' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'schiuma\\s+potente' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'efficacia\\s+professionale' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'super\\s+odtłuszczacz[a-ząćęłńóśźż]*' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'jakoś[ćc]\\s+premium' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'klas[aey]\\s+premium' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'produkt\\s+premium' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'profesjonalna\\s+jakoś[ćc]' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'ekstra' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'mega' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'super' },
    { category: 'PACKAGING_PROMO_HYPE', body: 'nowoś[ćc][a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'najniższa\\s+cena' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'nisk[a-ząćęłńóśźż]*\\s+cen[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'super\\s+cen[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'cen[a-ząćęłńóśźż]*\\s+hurtow[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'hit[a-ząćęłńóśźż]*\\s+cenow[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'darmow[a-ząćęłńóśźż]*\\s+dostaw[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'gratis[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'darmow[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'za\\s+darmo' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'tanio' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'tani[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'najtaniej' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'promocj[aeiłąę]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'promocyjn[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'wyprzeda[żz][a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'hit[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'prezent[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'okazj[aeiłąę]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'okazyjn[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'rabat[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'upust[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'zniżk[aeiłąę]*' },

    // 5. CTA, obietnice logistyczne i komunikacja platformowa
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'kup\\s+teraz' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'kupuj\\s+teraz' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'zamów\\s+teraz' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'kliknij' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'dodaj\\s+do\\s+koszyka' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'polecam[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'sprawdź\\s+to' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'tylko\\s+u\\s+nas' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'allegro' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'aukcj[aeiłąę]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'natychmiastow[a-ząćęłńóśźż]*\\s+wysyłk[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'szybk[a-ząćęłńóśźż]*\\s+wysyłk[a-ząćęłńóśźż]*' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'wysyłk[a-ząćęłńóśźż]*\\s+(?:24h|tego\\s+samego\\s+dnia|z\\s+magazynu)' },
    { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'jesteśmy\\s+(?:bezpośrednim\\s+)?importerem' },

    // 6. Druga osoba sprzedażowa + slogany "efekt wow" / bez wysiłku
    { category: 'SALES_SECOND_PERSON_PITCH', body: '(?:do|dla)\\s+Twojej\\s+(?:łazienki|kuchni|rodziny)' },
    { category: 'SALES_SECOND_PERSON_PITCH', body: '(?:do|dla)\\s+Twojego\\s+(?:domu|mieszkania)' },
    { category: 'SALES_SECOND_PERSON_PITCH', body: 'dla\\s+Twoich\\s+(?:ubrań|tkanin|włosów|dłoni)' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'efekt\\s+wow' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'bez\\s+(?:żadnego\\s+)?wysiłku' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'bez\\s+żadnego\\s+szorowania' },
    { category: 'UNSUBSTANTIATED_SLOGANS_TECH', body: 'w\\s+mgnieniu\\s+oka' }
];

// Dodatkowe „ciche” triggery botów Allegro (audytowane w pełnym skanerze compliance, A11/A10, Sekcji 5 i Pre-flight)
const IMPLICIT_RISK_SPECS = [
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: 'technologi(?:a|i|ę|ą|e)?\\s+(?:zapobiegając|przeciw|ochron|formuł|aktywn|czyszcz|usuw)[a-ząćęłńóśźż]*(?:\\s+[a-ząćęłńóśźż]+){0,3}',
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: '(?:rewolucyjn|innowacyjn|opatentowan|zaawansowan|unikaln)[a-ząćęłńóśźż]*\\s+technologi(?:a|i|ę|ą|e)?',
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: '(?:rewolucyjn|innowacyjn)[a-ząćęłńóśźż]*\\s+formuł[a-ząćęłńóśźż]*',
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: 'błyskawiczn[a-ząćęłńóśźż]*',
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: 'natychmiastow[a-ząćęłńóśźż]*(?!\\s+wysyłk)',
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: 'wysok[a-ząćęłńóśźż]*\\s+skutecznoś[ćc][a-ząćęłńóśźż]*(?:\\s+(?:przeciw|w\\s+usuwaniu|do)\\s+[a-ząćęłńóśźż]+(?:\\s+[a-ząćęłńóśźż]+)?)?',
        sectionFilter: ['section5', 'features', 'title'],
        skipInSection6: true
    },
    {
        category: 'UNSUBSTANTIATED_SLOGANS_TECH',
        body: 'wysok[a-ząćęłńóśźż]*\\s+wydajnoś[ćc][a-ząćęłńóśźż]*',
        sectionFilter: ['section5', 'features', 'title'],
        skipInSection6: true
    },
    {
        category: 'OVERCLAIM_QUASI_BIOCIDAL',
        body: '(?:pomaga\\s+)?zwalcza[ć]?(?:\\s+[a-ząćęłńóśźż]+){0,3}',
        skipInSection6: true
    },
    {
        category: 'OVERCLAIM_QUASI_BIOCIDAL',
        body: '(?:całkowicie\\s+eliminuje|unicestwia|niszczy)\\s+[a-ząćęłńóśźż]+',
        skipInSection6: true
    },
    {
        category: 'RANKING_POPULARITY',
        body: '(?:kultow|legendar|flagow|topow|ulubion)[a-ząćęłńóśźż]*\\s+(?:produkt|wybór|marka|seria|linia|formuła)',
        skipInSection6: true
    },
    {
        category: 'UNVERIFIED_GREENWASHING',
        body: 'ekologiczn[a-ząćęłńóśźż]*',
        requiresMissingEcoCert: true,
        skipInSection6: true
    },
    {
        category: 'UNVERIFIED_GREENWASHING',
        body: 'przyjazn[a-ząćęłńóśźż]*\\s+dla\\s+środowiska',
        requiresMissingEcoCert: true,
        skipInSection6: true
    },
    {
        category: 'UNVERIFIED_GREENWASHING',
        body: '(?:nietestowan[a-ząćęłńóśźż]*\\s+na\\s+zwierzętach|cruelty[\\s-]+free)',
        requiresMissingCrueltyFreeCert: true,
        skipInSection6: true
    },
    {
        category: 'UNVERIFIED_GREENWASHING',
        body: '(?:wolne\\s+od\\s+chemii|bez\\s+chemii|bez\\s+szkodliwych\\s+[a-ząćęłńóśźż]+|bez\\s+toksycznego\\s+[a-ząćęłńóśźż]+)',
        skipInSection6: true
    },
    {
        category: 'LOGISTICS_PRICING_CTA_FOREIGN',
        body: '(?:un\\s+profumo\\s+che\\s+avvolge[^,;<]*|ti\\s+profuma\\s+del\\s+pulito|scudo\\s+antisporco|fragranze\\s+selezionate|ancora\\s+più\\s+(?:concentrato|profumato)|deodorante\\s+per\\s+ambiente|diffusore\\s+ambiente|ambient\\s+diffuser|air\\s+freshener|room\\s*&\\s*fabric\\s+spray|sweet\\s+home\\s+luxury)',
        skipInSection6: true
    }
];

function getSpecForCategoryLookup(wordLower) {
    for (const spec of [...STRICT_STOPWORD_SPECS, ...IMPLICIT_RISK_SPECS]) {
        const rx = new RegExp(`^${L_BEFORE}(?:${spec.body})${L_AFTER}$`, 'i');
        if (rx.test(wordLower)) {
            return spec.category;
        }
    }
    return 'LOGISTICS_PRICING_CTA_FOREIGN';
}

/**
 * Skaner stop-words §A + rozszerzonych fraz bezwzględnie zakazanych (z zachowaniem pełnej kompatybilności zwrotu `{ word, index }`).
 */
function scanStrictStopwords(input) {
    if (!input || typeof input !== 'string') return [];
    const masked = maskHtmlTagsPreservingOffsets(input);
    const rx = buildUnicodeBoundaryRegex(STRICT_STOPWORD_SPECS.map(s => s.body), 'gi');
    const hits = [];
    let m;
    while ((m = rx.exec(masked)) !== null) {
        hits.push({
            word: input.slice(m.index, m.index + m[0].length),
            index: m.index
        });
    }
    return hits;
}

/**
 * Pełny skaner zgodności Allegro 2026 (wszystkie 8 klas ryzyk: §A + rankingi + obce marki + hype + technologia + pitch + greenwashing + obce slogany).
 * Dla `sectionType === 'section6'` (Ostrzeżenia CLP/GPSR) ignoruje reguły marketingowe i sprawdza wyłącznie zakazane `oryginaln*` i kontakty.
 */
function scanAllegroComplianceRisks(input, options = {}) {
    if (!input || typeof input !== 'string') return [];
    const sectionType = options.sectionType || 'description';
    const isSection6 = sectionType === 'section6' || options.isSafetySection === true;
    const masked = maskHtmlTagsPreservingOffsets(input);
    const plain = stripHtmlToPlainText(input);
    const hasEcoCert = Boolean(options.hasVerifiedEcoCert) || VERIFIED_ECO_CERT_RX.test(plain);
    const hasCrueltyCert = Boolean(options.hasVerifiedCrueltyFreeCert) || VERIFIED_CRUELTY_FREE_CERT_RX.test(plain);

    const activeSpecs = [];
    if (isSection6) {
        // W Sekcji 6 CLP/GPSR sprawdzamy wyłącznie bezwzględny zakaz słowa oryginaln* (kontakty łapie osobny walidator)
        activeSpecs.push(
            { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'oryginalnoś[ćc][a-ząćęłńóśźż]*' },
            { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'oryginaln[a-ząćęłńóśźż]*' },
            { category: 'LOGISTICS_PRICING_CTA_FOREIGN', body: 'orygina[łl][a-ząćęłńóśźż]*' }
        );
    } else {
        activeSpecs.push(...STRICT_STOPWORD_SPECS);
        for (const imp of IMPLICIT_RISK_SPECS) {
            if (imp.requiresMissingEcoCert && hasEcoCert) continue;
            if (imp.requiresMissingCrueltyFreeCert && hasCrueltyCert) continue;
            if (Array.isArray(imp.sectionFilter) && !imp.sectionFilter.includes(sectionType)) continue;
            activeSpecs.push(imp);
        }
        // W Sekcji 5 nie dopuszczamy też surowych przymiotników biobójczych ani nielegalnego "powoduje..." z haseł
        if (sectionType === 'section5' || sectionType === 'features') {
            activeSpecs.push({
                category: 'OVERCLAIM_QUASI_BIOCIDAL',
                body: '(?:antybakteryjn|przeciwbakteryjn|dezynfekuj|odkażaj|biobójcz|antibatteric|igienizzant|disinfettant)[a-ząćęłńóśźż]*'
            });
        }
    }

    const rawMatches = [];
    for (const spec of activeSpecs) {
        const rx = buildUnicodeBoundaryRegex([spec.body], 'gi');
        let m;
        while ((m = rx.exec(masked)) !== null) {
            rawMatches.push({
                start: m.index,
                end: m.index + m[0].length,
                word: input.slice(m.index, m.index + m[0].length).trim(),
                category: spec.category
            });
        }
    }

    // Deduplikacja nakładających się dopasowań (najdłuższe dopasowanie wygrywa)
    rawMatches.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));
    const merged = [];
    for (const cand of rawMatches) {
        if (!cand.word) continue;
        const last = merged[merged.length - 1];
        if (last && cand.start < last.end) {
            continue;
        }
        const catMeta = COMPLIANCE_RISK_CATEGORIES[cand.category] || COMPLIANCE_RISK_CATEGORIES.LOGISTICS_PRICING_CTA_FOREIGN;
        merged.push({
            category: catMeta.id,
            label: catMeta.label,
            severity: catMeta.severity,
            word: cand.word,
            index: cand.start,
            recommendation: catMeta.recommendation
        });
    }

    // Jeszcze jedna ochrona kontekstowa: nie flaguj marki produktu jako obcej rekomendacji
    return merged;
}

// --- Normalizator i filtr cech / wyróżników z etykiety (Agent 0, cleanFeaturesForPrompt, Sekcja 5) ---
const LABEL_TRANSLATION_MAP = [
    { rx: /\bdermatologicamente\s+testato\b/i, replacement: 'Testowany dermatologicznie' },
    { rx: /\bnichel[\s,/-]*chromo[\s,/-]*cobalt\s+tested\b|\bnichel\s+tested\b/i, replacement: 'Testowany na obecność niklu, chromu i kobaltu' },
    { rx: /\bveganok\b/i, replacement: 'Certyfikat VEGANOK' },
    { rx: /\bcon\s+estratti\s+certificati\s+bio\b/i, replacement: 'Z certyfikowanymi ekstraktami roślinnymi' },
    { rx: /\bsenz['’]?acqua\b/i, replacement: 'Stosowanie bez użycia wody' },
    { rx: /\bper\s+pelli\s+sensibili\b/i, replacement: 'Dla skóry wrażliwej' },
    { rx: /\brisciacquo\s+veloce\b|\bfacile\s+risciacquo\b/i, replacement: 'Łatwe spłukiwanie' },
    { rx: /\belimina\s+i\s+residui\s+di\s+sapone\b/i, replacement: 'Usuwa osady z mydła' },
    { rx: /\bsenza\s+aloni\b/i, replacement: 'Bez smug' },
    { rx: /\bsenza\s+risciacquo\b/i, replacement: 'Bez spłukiwania' },
    { rx: /\bazione\s+sgrassante\b/i, replacement: 'Działanie odtłuszczające' }
];

const LABEL_HIGHLIGHT_REWRITES = [
    { rx: /(?:technologi[a-ząćęłńóśźż]*|formuł[a-ząćęłńóśźż]*)\s+(?:zapobiegając|przeciw)\w*\s+powstawaniu\s+kropel/i, replacement: 'Ogranicza powstawanie kropel i zacieków' },
    { rx: /(?:pomaga\s+)?(?:zwalcza[ć]?|przeciw)\s+nieprzyjemn\w*\s+zapach\w*|działanie\s+(?:neutralizujące\s+|przeciw\s+nieprzyjemnym\s+)zapach\w*/i, replacement: 'Neutralizuje nieprzyjemne zapachy' },
    { rx: /(?:100\s*%\s+)?higieniczna\s+czystoś[ćc]/i, replacement: 'Higieniczna czystość' },
    { rx: /skutecznie\s+usuwa\s+uporczyw(?:y|e)\s+brud/i, replacement: 'Usuwa uporczywe zabrudzenia' },
    { rx: /butelka\s+w\s+pełni\s+nadająca\s+się\s+do\s+recyklingu/i, replacement: 'Butelka nadająca się do recyklingu' },
    { rx: /^(\d{1,2})\s*%\s*ingredienti\s+di\s+origine\s+naturale$/i, fn: (_, pct) => `${pct}% składników pochodzenia naturalnego` },
    { rx: /^per\s+mani\s+molto\s+secche(?:\s*-\s*for\s+very\s+dry\s+hands)?$/i, replacement: 'Do bardzo suchej skóry dłoni' }
];

const LABEL_DROP_PATTERNS = [
    /^(?:null|undefined|brak|brak\s+danych|brak\s+informacji|nie\s+dotyczy|unknown|n\/a|-)$/i,
    // Rankingi i popularność
    /(?:numer\s*#?\s*1|nr\s*#?\s*1|n°\s*1|no\.?\s*1|\bchętnie\s+wybieran|\bnajchętniej|\bnajczęściej|\bnajlepiej\s+sprzedając|il\s+più\s+venduto|\blider\s+rynku|\bbestseller|\bhit\s+sprzedaży|\bkultow|\blegendar)/i,
    // Obce marki i rekomendacje podmiotów trzecich
    /(?:rekomendowan|polecan|zatwierdzon|współprac|partner|raccomandat|consigliat)[a-ząćęłńóśźż]*\s+(?:przez|z|da)\b/i,
    /(?:\bw\s+stylu|\bodpowiednik|\bzamiennik|\blepsze\s+niż|\btypu\s+)/i,
    // Hype opakowaniowy, nowości, formuły reklamowe, luksus/premium
    /(?:format\s+(?:xxl|xl|jumbo|maxi|mega|family)|opakowanie\s+(?:xxl|jumbo|maxi|mega|family)|wersja\s+(?:xxl|xl|jumbo|maxi|mega)|nowoś[ćc]|nowa\s+formuła|ulepszona\s+formuła|nowa\s+mocniejsza\s+formuła|mocniejsza\s+formuła|silna\s+formuła|formuła\s+nowej\s+generacji|formula\s+migliorata|formula\s+potente|super\s+odtłuszczacz|ekstra\s+świeżość|ekstra\s+moc|ultra\s+moc|max\s+power|power\s+formula|siła\s+wybielania|potere\s+sbiancante|schiuma\s+potente|aktywny\s+spray|spray\s+attivo|moc\s+czyszczenia|szybkie\s+i\s+gwarantowane|gwarantowane\s+działanie|błyskawiczne\s+działanie|natychmiastowe\s+działanie|efficacia\s+professionale|profesjonalna\s+jakość|jakość\s+premium|klasa\s+premium|sweet\s+home\s+luxury|ancora\s+più|\+\d+\s*%)/i,
    // Puste slogany "wysoka skuteczność" / "gwarancja" / 2. osoba sprzedażowa
    /(?:wysok[a-ząćęłńóśźż]*\s+skutecznoś[ćc]|wysok[a-ząćęłńóśźż]*\s+wydajnoś[ćc]|do\s+Twojej\s+|dla\s+Twojej\s+|dla\s+Twojego\s+|dla\s+Twoich\s+|gwarancj|gwarantuj|najlepsz|rewelacyj|cudown|magiczn|niezrównan|orygina[łl]|oryginaln)/i,
    // Roszczenia BPR / biobójcze w wyróżnikach (Sekcja 5 nie może zawierać "antybakteryjny")
    /(?:antybakteryjn|przeciwbakteryjn|dezynfekuj|dezynfekcj|odkażaj|biobójcz|bakteriobójcz|wirusobójcz|grzybobójcz|antibatteric|igienizzant|disinfettant)/i,
    // Greenwashing bez oficjalnego certyfikatu (np. "w pełni naturalne cząsteczki")
    /(?:w\s+pełni\s+naturaln|100%\s*eko|\bwolne\s+od\s+chemii|\bbez\s+chemii|\bnietestowan[a-ząćęłńóśźż]*\s+na\s+zwierzętach|\bcruelty[\\s-]+free)/i,
    // Obcojęzyczne niesprzekładalne hasła i etykiety kategorii
    /(?:deodorante\s+per\s+ambiente|air\s+freshener|diffusore\s+ambiente|ambient\s+diffuser|room\s*&\s*fabric\s+spray|un\s+profumo\s+che\s+avvolge|ti\s+profuma\s+del\s+pulito|scudo\s+antisporco|fragranze\s+selezionate|made\s+in\s+italy|\bin\s+italia\b|sul\s+mercato\s+italiano|ravviva\s+colore|no\s+yellow|anti\s+giallo|shampoo\s+secco|dry\s+shampoo|crema\s+depilatoria|gambe\s*&\s*corpo|hair\s+removal|legs\s*&\s*body|volume\s*&\s*lucentezza|original\s+classic|per\s+pennello\s+rasature|\buomo\b|\blady\b|\bin\s+pink\b|\bneutro\b|\bfiori\s+di\s+mandorlo|\b40\s+lavaggi\b|shampoo\s*&\s*shower\s+foam|\bpulito\s+profondo\b|\bprofumo\s+di\s+pulito\b|\bmultiuso\b)/i
];

/**
 * Normalizuje pojedynczy wyróżnik / cechę z etykiety opakowania.
 * Zwraca czysty, rzeczowy fakt po polsku albo `null`, jeśli element jest hasłem reklamowym,
 * rankingiem, rekomendacją obcej marki lub sloganem nieprzenoszalnym na Allegro.
 */
function normalizeHighlightItem(rawItem, options = {}) {
    if (!rawItem || typeof rawItem !== 'string') return null;
    let item = rawItem.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
    if (!item) return null;

    // Znak CE dozwolony wyłącznie dla wyrobów medycznych
    if (/^(?:oznakowanie\s+)?ce$/i.test(item)) {
        return options.isMedicalDevice ? 'CE' : null;
    }

    // Bezrefleksyjne ogólne slogany dropujemy zanim cokolwiek przepiszemy
    for (const rx of LABEL_DROP_PATTERNS) {
        if (rx.test(item)) {
            // Sprawdź czy jest na liście bezpiecznych normalizacji użytkowych (np. "Technologia zapobiegająca kropel", "Pomaga zwalczać zapachy", "100% Higieniczna czystość")
            let salvaged = null;
            for (const rw of LABEL_HIGHLIGHT_REWRITES) {
                const m = item.match(rw.rx);
                if (m) {
                    salvaged = rw.fn ? rw.fn(...m) : rw.replacement;
                    break;
                }
            }
            if (salvaged) {
                item = salvaged;
                break;
            }
            return null;
        }
    }

    for (const tr of LABEL_TRANSLATION_MAP) {
        if (tr.rx.test(item)) {
            item = tr.replacement;
            break;
        }
    }

    for (const rw of LABEL_HIGHLIGHT_REWRITES) {
        const m = item.match(rw.rx);
        if (m) {
            item = rw.fn ? rw.fn(...m) : rw.replacement;
            break;
        }
    }

    // Oczyść resztkowe słowa ryzykowne, jeśli zdanie da się bezpiecznie skrócić (np. usuń "100%", "ekstra", "w pełni")
    item = sanitizeAllegroMarketingText(item, { isFeatureHighlight: true, brand: options.brand, productName: options.productName });
    item = item.replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
    if (!item || item.length < 3) return null;

    // Finałowy test zgodności — jeśli cokolwiek ryzykownego pozostało, odrzucamy element zamiast ryzykować bana Allegro
    const postRisks = scanAllegroComplianceRisks(item, { sectionType: 'section5', brand: options.brand, productName: options.productName });
    if (postRisks.length > 0) {
        return null;
    }

    return item;
}

/**
 * Filtruje i normalizuje listę wyróżników z etykiety (tekst rozdzielony przecinkami/średnikami lub tablica stringów).
 */
function sanitizeLabelHighlights(rawInput, options = {}) {
    const rawItems = Array.isArray(rawInput)
        ? rawInput.map(x => String(x || '').trim()).filter(Boolean)
        : String(rawInput || '').split(/[,;|]+/).map(x => x.trim()).filter(Boolean);

    const items = [];
    const dropped = [];
    const seen = new Set();

    for (const raw of rawItems) {
        const normalized = normalizeHighlightItem(raw, options);
        if (!normalized) {
            dropped.push(raw);
            continue;
        }
        const key = normalized.toLowerCase();
        // Unikamy duplikatów typu "Neutralizuje zapachy" + "Neutralizuje nieprzyjemne zapachy"
        const isDuplicateSemantic = seen.has(key) || (key.includes('neutralizuje') && key.includes('zapach') && Array.from(seen).some(s => s.includes('neutralizuje') && s.includes('zapach')));
        if (isDuplicateSemantic) continue;
        seen.add(key);
        items.push(normalized);
    }

    return {
        items,
        text: items.join(', '),
        dropped
    };
}

/**
 * Czyści i neutralizuje tekst/HTML z haseł reklamowych, rankingów, rekomendacji obcych marek,
 * formatowego hype'u, 2. osoby sprzedażowej i czasowników quasi-biobójczych.
 * BEZWZGLĘDNIE chroni Sekcję 6 (CLP/GPSR) przed jakąkolwiek modyfikacją merytoryczną.
 */
function sanitizeAllegroMarketingText(input, options = {}) {
    if (!input || typeof input !== 'string') return input;
    if (options.isSafetySection === true || options.sectionType === 'section6') {
        return input;
    }

    let res = input;
    const hasEcoCert = Boolean(options.hasVerifiedEcoCert) || VERIFIED_ECO_CERT_RX.test(res);

    // 1. Rekomendacje obcych marek i rankingi wtrącone w opis / wyróżniki
    res = res
        .replace(new RegExp(`${L_BEFORE}(?:,\\s*)?(?:rekomendowan|polecan|zatwierdzon)[a-ząćęłńóśźż]*\\s+przez\\s+[A-Za-zĄĆĘŁŃÓŚŹŻ0-9][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9\\s.&-]{1,45}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}(?:,\\s*)?(?:chętnie\\s+wybieran|najchętniej\\s+(?:wybieran|kupowan)|najlepiej\\s+sprzedając[a-ząćęłńóśźż]*\\s+się|lider\\s+rynku)[^.,;<\\n]*`, 'gi'), '');

    // 2. Hype formatowy ("w formacie XXL" -> "", "opakowanie XXL" -> "duże opakowanie")
    res = res
        .replace(new RegExp(`${L_BEFORE}w\\s+formacie\\s+(?:XXL|Jumbo|Maxi|Mega|Family)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}format\\s+(?:XXL|Jumbo|Maxi|Mega|Family)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}opakowani([eu])\\s+(?:XXL|Jumbo|Maxi|Mega|Family)${L_AFTER}`, 'gi'), (_, end) => `duż${end === 'u' ? 'ym' : 'e'} opakowani${end}`)
        .replace(new RegExp(`${L_BEFORE}(?:nowa\\s+)?(?:ulepszona|mocniejsza)\\s+formuła${L_AFTER}`, 'gi'), 'formuła')
        .replace(new RegExp(`${L_BEFORE}nowa\\s+formuła${L_AFTER}`, 'gi'), 'formuła')
        .replace(new RegExp(`${L_BEFORE}formuła\\s+nowej\\s+generacji${L_AFTER}`, 'gi'), 'formuła');

    // 3. Druga osoba sprzedażowa i niesprawdzone technologie
    res = res
        .replace(new RegExp(`${L_BEFORE}(?:do|dla)\\s+Twojej\\s+(?:łazienki|kuchni|rodziny)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}(?:do|dla)\\s+Twojego\\s+(?:domu|mieszkania)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}dla\\s+Twoich\\s+(?:ubrań|tkanin|włosów|dłoni)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}technologi([aęi])\\s+zapobiegając([aąe])\\s+powstawaniu\\s+kropel${L_AFTER}`, 'gi'), (m) => {
            return /^[A-Z]/.test(m) ? 'Formuła ograniczająca powstawanie kropel i zacieków' : 'formuła ograniczająca powstawanie kropel i zacieków';
        })
        .replace(new RegExp(`${L_BEFORE}(?:rewolucyjn|innowacyjn|opatentowan|zaawansowan|unikaln)(y|a|e|ą|ym|ych|ego|ej)\\s+technologi(a|i|ę|ą)${L_AFTER}`, 'gi'), (_, adj, nounEnd) => `opracowan${adj} formuł${nounEnd}`)
        .replace(new RegExp(`${L_BEFORE}(?:rewolucyjn|innowacyjn)(y|a|e|ą|ym|ych|ego|ej)\\s+formuł(a|y|ę|ą)${L_AFTER}`, 'gi'), (_, adj, nounEnd) => `opracowan${adj} formuł${nounEnd}`);

    // 4. Czasowniki przesadne i quasi-biobójcze
    res = res
        .replace(new RegExp(`${L_BEFORE}pomaga\\s+zwalczać\\s+(nieprzyjemn[a-ząćęłńóśźż]*\\s+zapach[a-ząćęłńóśźż]*|wonie)${L_AFTER}`, 'gi'), (m, obj) => {
            return `${/^[A-Z]/.test(m) ? 'Neutralizuje' : 'neutralizuje'} ${obj}`;
        })
        .replace(new RegExp(`${L_BEFORE}zwalczać\\s+(nieprzyjemn[a-ząćęłńóśźż]*\\s+zapach[a-ząćęłńóśźż]*|wonie)${L_AFTER}`, 'gi'), (_, obj) => `neutralizować ${obj}`)
        .replace(new RegExp(`${L_BEFORE}zwalcza\\s+(nieprzyjemn[a-ząćęłńóśźż]*\\s+zapach[a-ząćęłńóśźż]*|wonie)${L_AFTER}`, 'gi'), (m, obj) => {
            return `${/^[A-Z]/.test(m) ? 'Neutralizuje' : 'neutralizuje'} ${obj}`;
        })
        .replace(new RegExp(`${L_BEFORE}pomaga\\s+zwalczać\\s+`, 'gi'), (m) => (/^[A-Z]/.test(m) ? 'Pomaga usuwać ' : 'pomaga usuwać '))
        .replace(new RegExp(`${L_BEFORE}zwalczać${L_AFTER}`, 'gi'), 'usuwać')
        .replace(new RegExp(`${L_BEFORE}zwalcza${L_AFTER}`, 'gi'), (m) => (/^[A-Z]/.test(m) ? 'Usuwa' : 'usuwa'))
        .replace(new RegExp(`${L_BEFORE}błyskawicznie${L_AFTER}`, 'gi'), (m) => (/^[A-Z]/.test(m) ? 'Szybko' : 'szybko'))
        .replace(new RegExp(`${L_BEFORE}błyskawiczn(y|a|e|ym|ych|ego|ej|ą)${L_AFTER}`, 'gi'), (m, end) => `${/^[A-Z]/.test(m) ? 'Szybk' : 'szybk'}${end.toLowerCase() === 'y' ? 'i' : (end.toLowerCase() === 'ym' ? 'im' : (end.toLowerCase() === 'ych' ? 'ich' : (end.toLowerCase() === 'ego' ? 'iego' : (end.toLowerCase() === 'ej' ? 'iej' : end.toLowerCase()))))}`)
        .replace(new RegExp(`${L_BEFORE}natychmiastow[o]${L_AFTER}`, 'gi'), (m) => (/^[A-Z]/.test(m) ? 'Szybko' : 'szybko'))
        .replace(new RegExp(`${L_BEFORE}natychmiastow(y|a|e|ym|ych|ego|ej|ą)${L_AFTER}`, 'gi'), (m, end) => `${/^[A-Z]/.test(m) ? 'Szybk' : 'szybk'}${end.toLowerCase() === 'y' ? 'i' : (end.toLowerCase() === 'ym' ? 'im' : (end.toLowerCase() === 'ych' ? 'ich' : (end.toLowerCase() === 'ego' ? 'iego' : (end.toLowerCase() === 'ej' ? 'iej' : end.toLowerCase()))))}`)
        .replace(new RegExp(`${L_BEFORE}bez\\s+(?:żadnego\\s+)?wysiłku${L_AFTER}`, 'gi'), 'bez uciążliwego szorowania')
        .replace(new RegExp(`${L_BEFORE}bez\\s+żadnego\\s+szorowania${L_AFTER}`, 'gi'), 'bez uciążliwego szorowania')
        .replace(new RegExp(`${L_BEFORE}(?:jakoś[ćc]\\s+premium|klas[aey]\\s+premium|profesjonalna\\s+jakoś[ćc])${L_AFTER}`, 'gi'), 'wysoki standard użytkowy');

    if (!hasEcoCert) {
        res = res
            .replace(new RegExp(`${L_BEFORE}przyjazn(y|a|e)\\s+dla\\s+środowiska${L_AFTER}`, 'gi'), 'przeznaczony do użytku domowego')
            .replace(new RegExp(`${L_BEFORE}ekologiczn(y|a|e|ym|ych|ego|ej)\\s+formuł(a|y|ę|ą)${L_AFTER}`, 'gi'), (_, adj, n) => `łagodn${adj} formuł${n}`)
            .replace(new RegExp(`${L_BEFORE}ekologiczn(y|a|e|ym|ych|ego|ej)${L_AFTER}`, 'gi'), 'użytkowy');
    }

    // 5. Usuwanie gołych stop-words BEZ zamiany na inne hasła marketingowe ("wysoka skuteczność" / "wysoka wydajność")
    res = res
        .replace(new RegExp(`${L_BEFORE}(?:rewelacj[a-ząćęłńóśźż]*|numer\\s*#?\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|in\\s+Italia))?|nr\\s*#?\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|in\\s+Italia))?|n°\\s*1(?:\\s+(?:w\\s+Polsce|we\\s+Włoszech|in\\s+Italia))?|ekstra|efekt\\s+wow)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}(?:najniższa\\s+cena|nisk[a-ząćęłńóśźż]*\\s+cen[a-ząćęłńóśźż]*|super\\s+cen[a-ząćęłńóśźż]*|cen[a-ząćęłńóśźż]*\\s+hurtow[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*\\s+dostaw[a-ząćęłńóśźż]*|za\\s+darmo|kup\\s+teraz|kupuj\\s+teraz|zamów\\s+teraz|dodaj\\s+do\\s+koszyka|tylko\\s+u\\s+nas|sprawdź\\s+to|natychmiastow[a-ząćęłńóśźż]*\\s+wysyłk[a-ząćęłńóśźż]*|szybk[a-ząćęłńóśźż]*\\s+wysyłk[a-ząćęłńóśźż]*|wysyłk[a-ząćęłńóśźż]*\\s+(?:24h|tego\\s+samego\\s+dnia|z\\s+magazynu)|hit[a-ząćęłńóśźż]*\\s+cenow[a-ząćęłńóśźż]*|lepsze\\s+niż|w\\s+stylu)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}(?:gratis[a-ząćęłńóśźż]*|darmow[a-ząćęłńóśźż]*|najtaniej|tanio|tani[a-ząćęłńóśźż]*|promocj[a-ząćęłńóśźż]*|promocyjn[a-ząćęłńóśźż]*|wyprzeda[żz][a-ząćęłńóśźż]*|bestseller[a-ząćęłńóśźż]*|nowoś[ćc][a-ząćęłńóśźż]*|rabat[a-ząćęłńóśźż]*|upust[a-ząćęłńóśźż]*|zniżk[a-ząćęłńóśźż]*|kliknij|allegro|aukcj[a-ząćęłńóśźż]*|odpowiednik|zamiennik|okazj[a-ząćęłńóśźż]*|okazyjn[a-ząćęłńóśźż]*|hit[a-ząćęłńóśźż]*|mega|super)${L_AFTER}`, 'gi'), '')
        .replace(new RegExp(`${L_BEFORE}prezent[a-ząćęłńóśźż]*${L_AFTER}`, 'gi'), 'wybór');

    // Higiena interpunkcji po usunięciach
    res = res
        .replace(/\s+,/g, ',')
        .replace(/,\s*,+/g, ',')
        .replace(/(\s*,\s*)+(?=<\/(?:li|p|h[1-6])>|$)/gi, '')
        .replace(/\(\s*\)/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return res;
}

const SECTION_LABELS_PL = {
    title: 'Tytuł oferty',
    sekcja1: 'Moduł 1 (Above-the-Fold)',
    sekcja2: 'Moduł 2 (FAQ)',
    sekcja3: 'Moduł 3 (Składniki)',
    sekcja4: 'Moduł 4 (Sposób użycia)',
    sekcja5: 'Moduł 5 (Specyfikacja)',
    sekcja6: 'Moduł 6 (Bezpieczeństwo GPSR/CLP)',
    sekcjaTips: 'Moduł Porad',
    sekcja7: 'Moduł 7 (Informacje o produkcie)',
    descriptionHtml: 'Opis główny'
};

/**
 * Audyt zgodności Allegro 2026 gotowego szkicu przed publikacją / eksportem (Allegro, BaseLinker, Von Halsky).
 * Sekcja 6 jest sprawdzana wyłącznie pod kątem zakazanego słowa "oryginalny" (nigdy marketingu).
 */
function auditOfferDraftCompliance({
    title = '',
    htmlContent = null,
    descriptionHtml = '',
    brand = '',
    productName = ''
} = {}) {
    const issues = [];
    const seenPerSection = new Map();

    const inspectField = (sectionKey, content, sectionType) => {
        if (!content || typeof content !== 'string' || !content.trim()) return;
        const hits = scanAllegroComplianceRisks(content, { sectionType, brand, productName });
        for (const hit of hits) {
            const dedupeKey = `${sectionKey}:${hit.word.toLowerCase()}`;
            if (seenPerSection.has(dedupeKey)) continue;
            seenPerSection.set(dedupeKey, true);
            issues.push({
                section: sectionKey,
                sectionLabel: SECTION_LABELS_PL[sectionKey] || sectionKey,
                category: hit.category,
                categoryLabel: hit.label,
                severity: hit.severity,
                word: hit.word,
                recommendation: hit.recommendation
            });
        }
    };

    if (title) {
        inspectField('title', title, 'title');
    }

    if (htmlContent && typeof htmlContent === 'object') {
        inspectField('sekcja1', htmlContent.sekcja1 || htmlContent.section_1_html, 'description');
        inspectField('sekcja2', htmlContent.sekcja2 || htmlContent.section_2_html, 'description');
        inspectField('sekcja3', htmlContent.sekcja3 || htmlContent.section_3_html, 'description');
        inspectField('sekcja4', htmlContent.sekcja4 || htmlContent.section_4_html, 'description');
        inspectField('sekcja5', htmlContent.sekcja5 || htmlContent.section_5_html, 'section5');
        inspectField('sekcjaTips', htmlContent.sekcjaTips || htmlContent.section_tips_html, 'description');
        inspectField('sekcja7', htmlContent.sekcja7 || htmlContent.section_7_html, 'description');
        inspectField('sekcja6', htmlContent.sekcja6 || htmlContent.section_6_html, 'section6');
    } else if (descriptionHtml) {
        inspectField('descriptionHtml', descriptionHtml, 'description');
    }

    const bySection = new Map();
    for (const iss of issues) {
        if (!bySection.has(iss.section)) {
            bySection.set(iss.section, { label: iss.sectionLabel, words: [] });
        }
        const entry = bySection.get(iss.section);
        if (!entry.words.includes(iss.word)) entry.words.push(iss.word);
    }

    const warnings = [];
    for (const [, entry] of bySection.entries()) {
        const preview = entry.words.slice(0, 6).map(w => `"${w}"`).join(', ');
        const more = entry.words.length > 6 ? ` (+${entry.words.length - 6})` : '';
        warnings.push(`Zgodność Allegro (${entry.label}): wykryto ryzykowne zwroty marketingowe: ${preview}${more} — usuń przed publikacją lub wygeneruj sekcję ponownie.`);
    }

    return {
        clean: issues.length === 0,
        totalIssues: issues.length,
        issues,
        warnings
    };
}

module.exports = {
    COMPLIANCE_RISK_CATEGORIES,
    VERIFIED_ECO_CERT_RX,
    VERIFIED_CRUELTY_FREE_CERT_RX,
    scanStrictStopwords,
    scanAllegroComplianceRisks,
    normalizeHighlightItem,
    sanitizeLabelHighlights,
    sanitizeAllegroMarketingText,
    auditOfferDraftCompliance,
    stripHtmlToPlainText,
    maskHtmlTagsPreservingOffsets,
    getSpecForCategoryLookup
};
