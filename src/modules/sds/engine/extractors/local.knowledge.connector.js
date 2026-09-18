const fs = require('fs');
const path = require('path');

/**
 * LocalKnowledgeConnector - Autentyczny silnik RAG (Single Source of Truth)
 * Udostępnia Agentom i systemowi bezpośredni dostęp do bazy NDS (Dz.U. 2018 / Dz.U. 2024),
 * katalogu odpadów (Dz.U. 2020 poz. 10), rejestru zharmonizowanego CLP Załącznik VI (ATP 1-22),
 * przepisów ADR oraz oficjalnych norm PN-EN i aktów prawnych UE i RP.
 */
class LocalKnowledgeConnector {
    constructor() {
        this.ragDir = path.join(__dirname, '../../rag_knowledge');
        this.docsDir = path.join(__dirname, '../../../../../docs/SDS');

        this.ndsDb = null;
        this.wasteDb = null;
        this.clpDb = null;
        this.adrDb = null;

        this._loadRegistries();
    }

    _loadRegistries() {
        // 1. Ładowanie rejestru NDS
        const ndsFile = path.join(this.ragDir, 'nds_database_2018.json');
        if (fs.existsSync(ndsFile)) {
            try {
                this.ndsDb = JSON.parse(fs.readFileSync(ndsFile, 'utf8'));
            } catch (err) {
                console.error('[LocalKnowledgeConnector] Błąd ładowania nds_database_2018.json:', err.message);
            }
        }

        // 2. Ładowanie rejestru odpadów
        const wasteFile = path.join(this.ragDir, 'waste_codes_pl.json');
        if (fs.existsSync(wasteFile)) {
            try {
                this.wasteDb = JSON.parse(fs.readFileSync(wasteFile, 'utf8'));
            } catch (err) {
                console.error('[LocalKnowledgeConnector] Błąd ładowania waste_codes_pl.json:', err.message);
            }
        }

        // 3. Ładowanie rejestru zharmonizowanego CLP (Annex VI)
        const clpFile = path.join(this.ragDir, 'clp_annex_vi_harmonized.json');
        if (fs.existsSync(clpFile)) {
            try {
                this.clpDb = JSON.parse(fs.readFileSync(clpFile, 'utf8'));
            } catch (err) {
                console.error('[LocalKnowledgeConnector] Błąd ładowania clp_annex_vi_harmonized.json:', err.message);
            }
        }

        // 4. Ładowanie bazy transportowej ADR
        const adrFile = path.join(this.ragDir, 'adr_transport_pl.json');
        if (fs.existsSync(adrFile)) {
            try {
                this.adrDb = JSON.parse(fs.readFileSync(adrFile, 'utf8'));
            } catch (err) {
                console.error('[LocalKnowledgeConnector] Błąd ładowania adr_transport_pl.json:', err.message);
            }
        }
    }

    /**
     * Synchroniczne wyszukiwanie NDS (dla procesorów synchronicznych np. enrichWithPolishRegulations)
     */
    lookupPolishNDSSync(query) {
        if (!query) return { found: false };
        const cleanQuery = String(query).trim().toLowerCase();

        if (this.ndsDb) {
            for (const [cas, data] of Object.entries(this.ndsDb)) {
                if (cas.toLowerCase() === cleanQuery || (data.substance && data.substance.toLowerCase() === cleanQuery)) {
                    return {
                        found: true,
                        source: "Rozporządzenie MRPiPS z dnia 12 czerwca 2018 r. (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017)",
                        cas: cas,
                        substance: data.substance,
                        NDS: data.NDS || "brak",
                        NDSCh: data.NDSCh || "brak",
                        NDSP: data.NDSP || "brak",
                        uwagi: data.uwagi || "brak"
                    };
                }
            }
        }
        return { found: false };
    }

    /**
     * Wyszukuje urzędowe polskie limity NDS (Najwyższe Dopuszczalne Stężenia) po numerze CAS lub nazwie.
     * Źródło: Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017.
     */
    async lookupPolishNDS(query) {
        return this.lookupPolishNDSSync(query);
    }

    /**
     * Wyszukuje zharmonizowaną klasyfikację, SCL, ATE oraz współczynniki M w Załączniku VI do CLP (ATP 1-22).
     */
    async lookupHarmonizedCLP(query) {
        if (!query) return { found: false, message: "Brak zapytania o CLP." };
        const cleanQuery = String(query).trim().toLowerCase();

        if (this.clpDb && Array.isArray(this.clpDb.substances)) {
            const found = this.clpDb.substances.find(s => 
                (s.cas && s.cas.toLowerCase() === cleanQuery) ||
                (s.ec && s.ec.toLowerCase() === cleanQuery) ||
                (s.name_pl && s.name_pl.toLowerCase().includes(cleanQuery)) ||
                (s.name_en && s.name_en.toLowerCase().includes(cleanQuery))
            );

            if (found) {
                return {
                    found: true,
                    source: "Załącznik VI do Rozporządzenia (WE) nr 1272/2008 (CLP) z uwzględnieniem ATP 1-22",
                    cas: found.cas,
                    name_pl: found.name_pl,
                    ate: found.ate || null,
                    scl: found.scl || null,
                    m_acute: found.m_acute || null,
                    m_chronic: found.m_chronic || null
                };
            }
        }

        return {
            found: false,
            query: query,
            message: "Brak zharmonizowanego wpisu w Załączniku VI do CLP (substancja podlega samoklasyfikacji przez producenta)."
        };
    }

    /**
     * Pobiera oficjalną klasyfikację i 6-cyfrowe kody odpadów (Dz.U. 2020 poz. 10).
     */
    async lookupWasteCode(keywords = "", isHazardous = false) {
        const queryStr = String(keywords || '').toLowerCase();
        let matchedCategory = null;

        if (this.wasteDb && this.wasteDb.categories) {
            for (const [catKey, catData] of Object.entries(this.wasteDb.categories)) {
                if (catData.keywords && Array.isArray(catData.keywords)) {
                    if (catData.keywords.some(k => queryStr.includes(k.toLowerCase()))) {
                        matchedCategory = catData;
                        break;
                    }
                }
            }
            if (!matchedCategory) {
                matchedCategory = this.wasteDb.categories.detergents_and_cleaning || this.wasteDb.categories.general_chemical;
            }
        }

        const consumerCode = isHazardous 
            ? (matchedCategory?.consumer_hazardous || "20 01 29* (Detergenty zawierające substancje niebezpieczne)")
            : (matchedCategory?.consumer_non_hazardous || "20 01 30 (Detergenty inne niż wymienione w 20 01 29)");

        const industrialCode = isHazardous
            ? (matchedCategory?.industrial_hazardous || "16 03 05* (Organiczne odpady zawierające substancje niebezpieczne) lub 07 06 04*")
            : (matchedCategory?.industrial_non_hazardous || "16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05) lub 07 06 99");

        const packagingCodes = isHazardous
            ? "15 01 10* (Opakowania zawierające pozostałości substancji niebezpiecznych lub nimi skażone)"
            : "15 01 02 (Opakowania z tworzyw sztucznych)";

        return {
            source: "Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10)",
            acts: [
                "Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.)",
                "Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10)",
                "Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.)"
            ],
            consumer_code: consumerCode,
            industrial_code: industrialCode,
            packaging_code: packagingCodes,
            recommendation: "Odzyskać lub poddać recyklingowi, jeśli to możliwe. Likwidację powierzać wyłącznie podmiotom wpisanym do rejestru BDO."
        };
    }

    /**
     * Wyszukuje dane transportowe ADR dla podanego numeru UN.
     */
    async lookupADR(unQuery) {
        const cleanUn = String(unQuery || '').toUpperCase().replace(/^UN\s*/, '').trim();
        if (this.adrDb && Array.isArray(this.adrDb.entries)) {
            const entry = this.adrDb.entries.find(e => e.un_number === cleanUn || e.un_number === `UN ${cleanUn}`);
            if (entry) {
                return {
                    found: true,
                    unNumber: `UN ${cleanUn}`,
                    properShippingName: entry.proper_shipping_name_pl,
                    class: entry.class,
                    packingGroup: entry.packing_group,
                    tunnelCode: entry.tunnel_code,
                    lq: entry.limited_quantity,
                    source: "Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR)"
                };
            }
        }

        return {
            found: false,
            unNumber: unQuery,
            message: "Nie zidentyfikowano specyficznego wpisu UN w lokalnej bazie ADR."
        };
    }

    /**
     * Zwraca precyzyjne, urzędowe wytyczne BHP, PPOŻ i procedury środowiskowe.
     */
    async querySafetySOP(topic) {
        const t = String(topic || '').toLowerCase();

        if (t.includes('sorbent') || t.includes('uwolnienie') || t.includes('rozlewisko') || t.includes('wyciek')) {
            return {
                source: "Procedury Awaryjne - Ochrona Środowiska (Sekcja 6)",
                instruction: "CAŁKOWITY ZAKAZ stosowania trocin, torfu lub innych palnych materiałów organicznych. Rozlewisko należy zebrać za pomocą niepalnych materiałów pochłaniających (piasek, ziemia okrzemkowa, wermikulit). Zanieczyszczony materiał umieścić w zamykanych pojemnikach na odpady."
            };
        }

        if (t.includes('pożar') || t.includes('gaśnicz') || t.includes('piana') || t.includes('paliw')) {
            return {
                source: "Bezpieczeństwo Pożarowe - Środki Gaśnicze (Sekcja 5)",
                instruction: "Dla produktów zawierających rozpuszczalniki polarne (alkohole) należy stosować pianę alkoholoodporną (np. typu AR-AFFF), ditlenek węgla (CO2) lub proszek gaśniczy. ZAKAZANE jest stosowanie zwartego strumienia wody oraz standardowej piany proteinowej (ulega zniszczeniu na alkoholu). Sprzęt strażacki zgodny z PN-EN 469, PN-EN 659, PN-EN 137."
            };
        }

        if (t.includes('magazyn') || t.includes('przechowyw') || t.includes('elektrostat')) {
            return {
                source: "Warunki Magazynowania - Rozporządzenie MSWiA (Dz.U. 2010 nr 109 poz. 719)",
                instruction: "Magazynować w chłodnym, suchym, dobrze wentylowanym pomieszczeniu. Zabezpieczyć przed źródłami zapłonu i wyładowaniami elektrostatycznymi (uziemienie). Stosować nienasiąkliwe posadzki chemoodporne i wanny wychwytowe. CAŁKOWITY ZAKAZ POWIELANIA NIEMIECKICH NORM TRGS 510 ORAZ WGK."
            };
        }

        return {
            source: "Zasady Bezpieczeństwa Pracy z Chemikaliami",
            instruction: "Stosować dobrą praktykę higieny przemysłowej. Nie jeść, nie pić i nie palić podczas pracy. Po zakończeniu pracy dokładnie umyć ręce."
        };
    }

    /**
     * Zwraca oficjalne normy PN-EN / ISO dla Środków Ochrony Indywidualnej (ŚOI).
     */
    async lookupPpeNorms(category = "") {
        const cat = String(category).toLowerCase();
        return {
            source: "Normy PN-EN / ISO dla ŚOI (Sekcja 8.2)",
            rules: {
                consumer: "W normalnych warunkach stosowania konsumenckiego środki ochrony indywidualnej nie są wymagane.",
                industrial: {
                    eyes: "Okulary ochronne lub gogle zgodne z PN-EN 166 w razie ryzyka rozbryzgu.",
                    hands: "Rękawice chemoodporne z kauczuku nitrylowego (grubość min. 0,4 mm, czas przebicia > 480 min) zgodne z PN-EN ISO 374-1.",
                    respiratory: "W przypadku niedostatecznej wentylacji lub przekroczenia NDS stosować maskę z pochłaniaczem typu A-P2 zgodną z PN-EN 14387.",
                    environment: "Zabezpieczyć przed przedostaniem się do kanalizacji i wód powierzchniowych. Pole nie może mieć wartości 'Nie dotyczy'."
                }
            }
        };
    }

    /**
     * Zwraca urzędowy, skonsolidowany wykaz aktów prawnych dla Sekcji 15.1 (Polska i UE).
     * CAŁKOWITY ZAKAZ obecności norm TRGS 510, WGK oraz Ograniczenia 75 (dla produktów nietatuatorskich).
     */
    lookupLegalActs(context = {}) {
        const isTattooProduct = Boolean(context.isTattooProduct);
        const isFlammable = Boolean(context.isFlammable);

        let restrictions = "Żadna z substancji nie podlega ograniczeniom na mocy Załącznika XVII do rozporządzenia REACH.";
        if (isTattooProduct) {
            restrictions = "Ograniczenie 75 (substancje w mieszaninach do celów wykonywania tatuażu i makijażu permanentnego).";
        } else if (isFlammable) {
            restrictions = "Pozycja 3 (niebezpieczne substancje lub mieszaniny ciekłe) oraz Pozycja 40 (substancje zaklasyfikowane jako łatwopalne).";
        }

        return `Prawodawstwo Unii Europejskiej:
- Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późniejszymi zmianami.
- Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 (wymogi dotyczące sporządzania kart charakterystyki).
- Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) wraz ze wszystkimi adaptacjami do postępu technicznego (ATP 1-22).
- Rozporządzenie Komisji (UE) nr 758/2013 z dnia 10 sierpnia 2013 r. (sprostowanie załącznika VI do rozporządzenia CLP).
- Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2019/1148 z dnia 20 czerwca 2019 r. w sprawie wprowadzania do obrotu i stosowania prekursorów materiałów wybuchowych.
- Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE z dnia 4 lipca 2012 r. w sprawie kontroli zagrożeń poważnymi awariami związanymi z substancjami niebezpiecznymi (Seveso III): Kategoria zagrożenia: Brak (mieszanina nie spełnia kryteriów kwalifikacyjnych).
- Substancje wzbudzające szczególnie duże obawy (Lista Kandydacka SVHC, art. 59 rozporządzenia REACH): Mieszanina nie zawiera substancji z Listy Kandydackiej w stężeniu ≥ 0,1% wag.
- Substancje podlegające procedurze zezwoleń (Załącznik XIV do rozporządzenia REACH): Żaden ze składników mieszaniny nie podlega obowiązkowi uzyskania zezwolenia.
- Ograniczenia dotyczące produkcji, wprowadzania do obrotu i stosowania (Załącznik XVII do rozporządzenia REACH): ${restrictions}

Prawodawstwo Rzeczypospolitej Polskiej:
- Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (t.j. Dz.U. 2022 poz. 1816 z późn. zm.).
- Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017).
- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).
- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).
- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).
- Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (t.j. Dz.U. 2024 poz. 643 z późn. zm.) oraz Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).
- Rozporządzenie Ministra Spraw Wewnętrznych i Administracji z dnia 7 czerwca 2010 r. w sprawie ochrony przeciwpożarowej budynków, innych obiektów budowlanych i terenów (Dz.U. 2010 nr 109 poz. 719 z późn. zm.).`;
    }

    /**
     * Generuje kanoniczną, urzędową stopkę Sekcji 16 (literatura, szkolenia, rewizja 1.0 PL, klauzula prawna).
     * Single Source of Truth zgodny z wymogami ITALLUX Sp. z o.o. oraz Rozporządzeniem (UE) 2020/878.
     */
    getSection16LegalFooter(metadata = {}) {
        const rawDate = metadata?.compilationDate || metadata?.revisionDate || metadata?.date || '';
        let datePart = "";
        if (rawDate && !/brak|nie dotyczy|undefined|null/i.test(String(rawDate).trim())) {
            const cleanDate = String(rawDate).replace(/^z\s*dnia\s*/i, '').trim();
            if (cleanDate) {
                datePart = ` z dnia ${cleanDate}${cleanDate.endsWith('r.') || cleanDate.endsWith('r') ? '' : ' r.'}`;
            }
        }

        return `Główne źródła literatury i danych:
- Karty charakterystyki substancji składowych udostępnione przez producentów i dostawców surowców.
- Baza danych Europejskiej Agencji Chemikaliów (ECHA): https://echa.europa.eu/
- Baza danych PubChem National Library of Medicine: https://pubchem.ncbi.nlm.nih.gov/
- Obowiązujące unijne i krajowe akty prawne (REACH, CLP, Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587).

Zalecenia i wskazówki szkoleniowe dla pracowników:
Przed przystąpieniem do pracy z produktem należy zapoznać się z treścią niniejszej karty charakterystyki oraz przepisami BHP obowiązującymi na stanowisku pracy. Pracownicy mający kontakt z produktem powinni zostać przeszkoleni w zakresie prawidłowego i bezpiecznego obchodzenia się z chemikaliami oraz postępowania w sytuacjach awaryjnych.

Informacje o zmianach i aktualizacji:
Niniejsza karta charakterystyki (wersja 1.0 PL) stanowi wydanie pierwsze w języku polskim, opracowane na podstawie karty charakterystyki SDS producenta${datePart ? datePart : "."}
Aktualizacja została sporządzona i dostosowana zgodnie z wymogami Rozporządzenia Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniającego załącznik II do rozporządzenia (WE) nr 1907/2006 (REACH) oraz przepisami prawa Rzeczypospolitej Polskiej.
Główne zmiany wprowadzone w bieżącej wersji obejmują:
- Sekcja 1.3: Aktualizacja danych dostawcy karty w Rzeczypospolitej Polskiej na ITALLUX Sp. z o.o. (ul. Wesoła 16, 63-600 Kępno, www.prostozwloch.com.pl).
- Sekcja 8.1: Weryfikacja i implementacja krajowych norm higienicznych w środowisku pracy (NDS, NDSCh) na podstawie Rozporządzenia MRPiPS (Dz.U. 2018 poz. 1286 z późn. zm.).
- Sekcja 11.2 i 12.6: Wdrożenie obligatoryjnych podsekcji dotyczących właściwości zaburzających funkcjonowanie układu hormonalnego.
- Sekcja 13: Aktualizacja klasyfikacji i 6-cyfrowych kodów odpadów zgodnie z ustawą o odpadach i Dz.U. 2020 poz. 10.
- Sekcja 14: Weryfikacja i zharmonizowanie warunków przewozu zgodnie z Umową ADR.

Klauzula prawna i ochrona praw autorskich:
Niniejsze autorskie opracowanie tłumaczenia, formatowania oraz adaptacji regulacyjnej do prawa polskiego stanowi własność intelektualną firmy ITALLUX Sp. z o.o.. Kopiowanie i wykorzystywanie całości lub fragmentów w celach komercyjnych przez podmioty trzecie bez uprzedniej zgody właściciela jest zabronione. Dozwolone jest wykorzystanie dokumentu przez odbiorców w łańcuchu dostaw do celów bezpieczeństwa pracy i ochrony zdrowia.
Informacje zawarte w niniejszej karcie wynikają z aktualnego stanu wiedzy producenta i dystrybutora i odnoszą się wyłącznie do opisanego produktu. Użytkownik ponosi odpowiedzialność za stworzenie bezpiecznych warunków pracy oraz spełnienie wymagań prawnych związanych z jego zastosowaniem.`;
    }
}

module.exports = { LocalKnowledgeConnector };
