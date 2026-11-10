const fs = require('fs');
const path = require('path');

/**
 * GpsrSafetyService
 * Konektor wiedzy SDS ↔ EAN Pipeline dla bezpieczeństwa GPSR / CLP.
 * Na podstawie składu INCI / składników produktu wyprowadza deterministyczne,
 * zgodne z prawem UE (Rozp. 1223/2009, Omnibus VIII, CLP, dyrektywa GPSR 2023/988)
 * bazowe ostrzeżenia bezpieczeństwa.
 */
class GpsrSafetyService {
    constructor() {
        this.ragDir = path.join(__dirname, '../../sds/rag_knowledge');
        this.euphracPhrases = null;
        this.echaPhrases = null;
        this._loadSdsKnowledge();

        // 26 + rozszerzone alergeny zapachowe (Rozp. 2023/1545)
        this.fragranceAllergens = [
            'linalool', 'limonene', 'citronellol', 'geraniol', 'citral', 'coumarin',
            'eugenol', 'isoeugenol', 'cinnamal', 'cinnamyl alcohol', 'benzyl alcohol',
            'benzyl salicylate', 'benzyl benzoate', 'benzyl cinnamate', 'farnesol',
            'hexyl cinnamal', 'hydroxycitronellal', 'alpha-isomethyl ionone',
            'amyl cinnamal', 'amylcinnamyl alcohol', 'anise alcohol', 'butylphenyl methylpropional',
            'evernia prunastri', 'evernia furfuracea', 'oak moss', 'tree moss',
            'amyl salicylate', 'hexyl salicylate', 'tetramethyl acetyloctahydronaphthalenes',
            'otne', 'acetyl cedrene', 'menthol', 'camphor', 'terpineol', 'terpinolene',
            'beta-caryophyllene', 'pinene'
        ];

        // Konserwanty i substancje o silnym potencjale uczulającym podlegające pod EUH208 (Rozp. CLP Załącznik II pkt 2.8)
        this.sensitizingPreservatives = [
            'benzisothiazolinone', 'methylisothiazolinone', 'methylchloroisothiazolinone',
            'octylisothiazolinone', 'glutaral', 'iodopropynyl butylcarbamate', 'bronopol',
            '2-bromo-2-nitropropane-1,3-diol', 'diazolidinyl urea', 'imidazolidinyl urea'
        ];

        // Retinoidy pod nadzorem Rozp. 2024/996
        this.retinoids = ['retinol', 'retinyl palmitate', 'retinyl acetate', 'retinal', 'retinoid'];

        // Kwasy złuszczające / peelingujące (AHA / BHA / PHA)
        this.acids = [
            'salicylic acid', 'glycolic acid', 'lactic acid', 'mandelic acid',
            'malic acid', 'tartaric acid', 'lactobionic acid', 'gluconolactone'
        ];

        // Silne surfaktanty i detergenty (potencjał drażniący oczy)
        this.surfactants = [
            'sodium laureth sulfate', 'sodium lauryl sulfate', 'ammonium lauryl sulfate',
            'sodium coco-sulfate', 'cocamidopropyl betaine', 'disodium laureth sulfosuccinate'
        ];

        // Alkohole tłuszczowe i polimery, które NIE SĄ łatwopalne (emulgatory, folie PVA, woski)
        this.nonFlammableAlcohols = [
            'polyvinyl alcohol', 'cetyl alcohol', 'cetearyl alcohol', 'stearyl alcohol',
            'behenyl alcohol', 'myristyl alcohol', 'lauryl alcohol', 'benzyl alcohol',
            'c12-13 pareth', 'c12-14 pareth', 'c12-15 pareth', 'oleyl alcohol', 'arachidyl alcohol'
        ];

        // Wybitnie łatwopalne rozpuszczalniki i gazy nośne
        this.flammableSolvents = [
            'alcohol denat.', 'isopropyl alcohol', 'butane', 'isobutane', 'propane',
            'acetone', 'ethyl acetate'
        ];
    }

    _loadSdsKnowledge() {
        try {
            const euphracPath = path.join(this.ragDir, 'euphrac_ssot.json');
            if (fs.existsSync(euphracPath)) {
                this.euphracPhrases = JSON.parse(fs.readFileSync(euphracPath, 'utf8'));
            }
            const echaPath = path.join(this.ragDir, 'echa_phrases_pl.json');
            if (fs.existsSync(echaPath)) {
                this.echaPhrases = JSON.parse(fs.readFileSync(echaPath, 'utf8'));
            }
        } catch (err) {
            console.warn('[GpsrSafetyService] Ostrzeżenie ładowania bazy RAG SDS:', err.message);
        }
    }

    formatSubstanceName(rawName) {
        if (!rawName) return '';
        const lower = String(rawName).trim().toLowerCase();
        const specialMap = {
            'hexyl cinnamal': 'Hexyl Cinnamal',
            'coumarin': 'Coumarin',
            'linalool': 'Linalool',
            'limonene': 'Limonene',
            'citronellol': 'Citronellol',
            'geraniol': 'Geraniol',
            'citral': 'Citral',
            'eugenol': 'Eugenol',
            'benzyl salicylate': 'Benzyl Salicylate',
            'amyl salicylate': 'Amyl Salicylate',
            'hexyl salicylate': 'Hexyl Salicylate',
            'otne': 'Tetramethyl Acetyloctahydronaphthalenes (OTNE)',
            'tetramethyl acetyloctahydronaphthalenes': 'Tetramethyl Acetyloctahydronaphthalenes (OTNE)',
            'benzisothiazolinone': 'Benzisothiazolinone',
            'methylisothiazolinone': 'Methylisothiazolinone',
            'methylchloroisothiazolinone': 'Methylchloroisothiazolinone',
            'octylisothiazolinone': 'Octylisothiazolinone',
            'iodopropynyl butylcarbamate': 'Iodopropynyl Butylcarbamate',
            'bronopol': 'Bronopol',
            'glutaral': 'Glutaral'
        };
        if (specialMap[lower]) return specialMap[lower];
        return lower.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    /**
     * Wspólny normalizator zwrotów CLP: usuwa literówki (KONTATKU, DO OCZÓW),
     * wymusza Medical Whitelisting (STYCZNOŚCI ZE SKÓRĄ) oraz kanoniczną interpunkcję kodów P/H/EUH.
     */
    normalizeClpPhraseText(rawStr) {
        if (!rawStr || typeof rawStr !== 'string') return '';
        return rawStr
            .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
            .replace(/\bKONTATKT?U\b/gi, 'KONTAKTU')
            .replace(/W\s+PRZYPADKU\s+(?:KONTAKTU|KONTATKU)\s+ZE\s+SKÓRĄ/gi, 'W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ')
            .replace(/^(?:Uwaga|Ostrzeżenie(?:\s+CLP(?:\/GPSR)?)?)\s*[–:-]\s*/i, '')
            .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3})\s*(?:[–:-]\s*|\s+)/i, '$1 – ')
            .replace(/(W\s+PRZYPADKU\s+(?:POŁKNIĘCIA|DOSTANIA\s+SIĘ\s+DO\s+OCZU|STYCZNOŚCI\s+ZE\s+SKÓRĄ)(?:\s*\([^)]+\))?)\s*[–-]\s*/gi, '$1: ')
            .replace(/(W\s+przypadku\s+utrzymywania\s+się\s+działania\s+drażniącego\s+na\s+oczy)\s*[–-]\s*/gi, '$1: ')
            .trim();
    }

    /**
     * Wykrywa urwane zdania wieloczłonowych procedur CLP (np. P303, P301+P330+P331, EUH206)
     * oraz surowe nazwy substancji z listy składników ("Zawiera: ..."), które nie mogą występować jako osobne ostrzeżenia.
     */
    isOrphanClpOrRawIngredientFragment(rawStr) {
        if (!rawStr || typeof rawStr !== 'string') return true;
        const clean = this.normalizeClpPhraseText(rawStr)
            .replace(/<\/?[a-zA-Z][^>]*>/g, '')
            .replace(/^(?:➡️|⚠️|🛡️|\*|-)\s*/g, '')
            .trim();
        if (!clean || clean.length < 4) return true;

        // Jeżeli wpis zaczyna się od kodu CLP/H/EUH, nie jest urwanym fragmentem bez kodu
        if (/^(?:P\d{3}|H\d{3}|EUH\d{3}|Hasło\s+ostrzegawcze)\b/i.test(clean)) {
            return false;
        }

        // Urwane fragmenty z wielozdaniowych zwrotów P303, P301+P330+P331, P305+P351+P338, EUH206
        if (/^(?:Spłukać\s+skórę\s+pod\s+strumieniem\s+wody|Natychmiast\s+zdjąć\s+całą\s+zanieczyszczoną\s+odzież|NIE\s+wywoływać\s+wymiotów|Wypłukać\s+usta|Wyjąć\s+soczewki\s+kontaktowe|Nadal\s+płukać|Ostrożnie\s+płukać\s+wodą|W\s+przypadku\s+złego\s+samopoczucia\s+skontaktować\s+się|Może\s+(?:uwalniać|wydzielać)\s+niebezpieczne\s+gazy|Nie\s+stosować\s+razem\s+z\s+innymi\s+produktami|Umyć\s+dużą\s+ilością\s+wody)\b/i.test(clean)) {
            return true;
        }

        // Surowe nazwy składników chemicznych oraz deklaracje składu CLP/detergentowe z etykiety (nie blokuje ostrzeżeń kosmetycznych typu "Zawiera witaminę A / hydroksykwasy")
        if (/^(?:Zawiera|Contains|Contiene|Skład(?:\s+chemiczny)?|Composizione(?:\s+chimica)?|Chemical\s+composition)\s*[:–-]/i.test(clean) ||
            /^(?:Zawiera|Contains|Contiene)\s+(?:wodorotlenek|podchloryn|alkohol[ei]\s+C\d+|fosfonian|środki\s+wybielające|surfaktant|sodium\s+hydroxide|sodium\s+hypochlorite|alcoli)\b/i.test(clean)) {
            return true;
        }
        if (/^(?:alkohol[ei]\s+C\d+|etoksylowan[a-ząćęłńóśźż]*|siarczanowan[a-ząćęłńóśźż]*|sole\s+sodowe|wodorotlenek\s+sodu|podchloryn\s+sodu|fosfoniany|środki\s+wybielające|anionowe\s+środki|amfoteryczne\s+środki|niejonowe\s+środki|kompozycja\s+zapachowa|centro\s+antiveleni|emergency\s+number|ośrodek\s+zatruć)\b/i.test(clean)) {
            return true;
        }
        if (/\balkohol[ei]\s+C\d{1,2}[-–]\d{1,2}\b/i.test(clean) && /(?:etoksylowan|siarczanowan|sole\s+sodow)/i.test(clean)) {
            return true;
        }

        return false;
    }

    splitCombinedPPhrases(input) {
        if (!input) return [];
        const rawList = Array.isArray(input) ? input : [input];
        const result = [];

        // Flagi obecności procedur kombinowanych
        let handledSwallowing = false;
        let handledCorrosiveSwallowing = false;
        let handledEyesWash = false;
        let handledEyesDoctor = false;
        let handledSkin = false;
        let handledCorrosiveSkin = false;

        const hasCorrosiveInput = rawList.some(item => /\b(?:P301\+P330\+P331|P330|P331|P303\+P361\+P353|P303|P361|P353)\b/i.test(String(item || '')));

        for (const item of rawList) {
            if (!item || typeof item !== 'string') continue;
            let str = this.normalizeClpPhraseText(item.trim());

            // Rozpoznawanie sklejonych procedur medycznych np. "P305+P351+P338 + P337+P313" lub "P305+P351+P338 / P337+P313"
            const multiGroupRegex = /(P\d{3}(?:\+P\d{3})*)\s*(?:\+|\/|\band\b|\boraz\b)\s*(P\d{3}(?:\+P\d{3})*)/i;
            if (multiGroupRegex.test(str)) {
                const matches = str.match(/P\d{3}(?:\+P\d{3})*/gi);
                if (matches && matches.length > 1) {
                    for (const code of matches) {
                        const cleanCode = code.toUpperCase().trim();
                        let text = this.euphracPhrases?.pPhrases?.[cleanCode];
                        if (!text) {
                            if (cleanCode === 'P305+P351+P338') {
                                text = "W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.";
                            } else if (cleanCode === 'P337+P313') {
                                text = "W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.";
                            } else if (cleanCode === 'P301+P330+P331') {
                                text = "W PRZYPADKU POŁKNIĘCIA: wypłukać usta. NIE wywoływać wymiotów.";
                            } else if (cleanCode === 'P301+P312') {
                                text = "W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.";
                            } else if (cleanCode === 'P303+P361+P353') {
                                text = "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody lub prysznicem.";
                            } else if (cleanCode === 'P302+P352') {
                                text = "W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Umyć dużą ilością wody.";
                            } else if (cleanCode === 'P280') {
                                text = "Stosować rękawice ochronne.";
                            } else if (cleanCode === 'P264') {
                                text = "Dokładnie umyć ręce po użyciu.";
                            } else if (cleanCode === 'P101') {
                                text = "W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.";
                            } else if (cleanCode === 'P102') {
                                text = "Chronić przed dziećmi.";
                            }
                        }
                        if (text) {
                            text = this.normalizeClpPhraseText(text.replace(/^[:\s–-]+/, '').trim());
                            result.push(`${cleanCode} – ${text}`);
                        } else {
                            result.push(cleanCode);
                        }
                    }
                    continue;
                }
            }

            // Odrzucenie osieroconych nagłówków okolicznościowych i scalanie w formuły kombinowane CLP
            const cleanItemCode = str.split(/[\s–-]/)[0].toUpperCase();
            if (cleanItemCode === 'P301+P330+P331' || cleanItemCode === 'P330' || cleanItemCode === 'P331' || (hasCorrosiveInput && cleanItemCode === 'P301')) {
                if (!handledCorrosiveSwallowing) {
                    handledCorrosiveSwallowing = true;
                    handledSwallowing = true;
                    result.push("P301+P330+P331 – W PRZYPADKU POŁKNIĘCIA: wypłukać usta. NIE wywoływać wymiotów.");
                }
                continue;
            }
            if (cleanItemCode === 'P301' || cleanItemCode === 'P312') {
                if (!handledSwallowing && !handledCorrosiveSwallowing) {
                    handledSwallowing = true;
                    result.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
                }
                continue;
            }
            if (cleanItemCode === 'P305' || cleanItemCode === 'P351' || cleanItemCode === 'P338') {
                if (!handledEyesWash) {
                    handledEyesWash = true;
                    result.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
                }
                continue;
            }
            if (cleanItemCode === 'P337' || cleanItemCode === 'P313') {
                if (!handledEyesDoctor) {
                    handledEyesDoctor = true;
                    result.push("P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.");
                }
                continue;
            }
            if (cleanItemCode === 'P303+P361+P353' || cleanItemCode === 'P303' || cleanItemCode === 'P361' || cleanItemCode === 'P353') {
                if (!handledCorrosiveSkin) {
                    handledCorrosiveSkin = true;
                    handledSkin = true;
                    result.push("P303+P361+P353 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody lub prysznicem.");
                }
                continue;
            }
            if (cleanItemCode === 'P302' || cleanItemCode === 'P352') {
                if (!handledSkin && !handledCorrosiveSkin) {
                    handledSkin = true;
                    result.push("P302+P352 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Umyć dużą ilością wody.");
                }
                continue;
            }

            // Jeśli to sam kod (np. P264, P280, P210), pobierz opis z SSOT jeśli brak treści
            if (/^P\d{3}$/i.test(cleanItemCode) && str === cleanItemCode) {
                let text = this.euphracPhrases?.pPhrases?.[cleanItemCode];
                if (text) {
                    text = this.normalizeClpPhraseText(text.replace(/^[:\s–-]+/, '').trim());
                    result.push(`${cleanItemCode} – ${text}`);
                    continue;
                }
            }

            result.push(str);
        }
        return result;
    }

    /**
     * Analizuje skład INCI i generuje bazowe ostrzeżenia bezpieczeństwa GPSR / CLP.
     * @param {Object} params
     * @param {string} params.inci - Skład INCI (rozdzielony przecinkami)
     * @param {string} [params.productName] - Nazwa produktu
     * @param {boolean} [params.isChemical] - Czy to produkt chemii gospodarczej / detergent
     * @param {Object} [params.compliance] - Dane zgodności z PIM/OSINT (clp_signal_word, clp_h_phrases, clp_p_phrases)
     * @param {string[]} [params.hPhrases] - Zwroty H z karty SDS lub PIM
     * @param {string[]} [params.pPhrases] - Zwroty P z karty SDS lub PIM
     * @param {Object} [params.features] - Cechy produktu z PIM/BaseLinker
     * @returns {Object} { detected_risks: string[], warnings: string[] }
     */
    generateGpsrWarnings({ inci, productName = '', isChemical = false, compliance = null, hPhrases = [], pPhrases = [], features = {}, pimWarnings = '', pimUsage = '' } = {}) {
        const warnings = [];
        const detectedRisks = [];

        const prodNameLower = String(productName || '').toLowerCase();
        const featuresStr = JSON.stringify(features || {}).toLowerCase();
        const rawInciLower = String(inci || '').toLowerCase();
        const rawPimWarnings = String(
            pimWarnings ||
            features?.['Ostrzeżenia'] ||
            features?.['Ostrzezenia'] ||
            features?.['Uwagi dotyczące bezpieczeństwa'] ||
            features?.['Informacje o bezpieczeństwie'] ||
            ''
        ).trim();
        const rawPimUsage = String(
            pimUsage ||
            features?.['Sposób użycia'] ||
            features?.['Sposob uzycia'] ||
            features?.['Instrukcja użycia'] ||
            features?.['Dozowanie'] ||
            ''
        ).trim();
        const labelSafetyLower = `${rawPimWarnings} ${rawPimUsage}`.toLowerCase();
        const combinedContextLower = `${prodNameLower} ${featuresStr} ${rawInciLower} ${labelSafetyLower}`;

        const isLaundryCapsules = /(kapsułk|kapsulk|capsule|pod[s]?)/i.test(prodNameLower) && 
                                  /(prani|laundry|wash|detergent|tkanin)/i.test(prodNameLower);
        const isLaundryDetergent = /(płyn do prania|plyn do prania|zel do prania|żel do prania|proszek do prania|laundry|odplamiacz|płyn do płukania|plyn do plukania|lavatrice|bucato|ammorbidente|smacchiatore)/i.test(prodNameLower);
        const isAerosol = /(aerozol|spray|aerosol|atomizer|odświeżacz powietrza|odswiezacz powietrza)/i.test(prodNameLower) ||
                          /\b(spray|aerozol|atomizer)\b/i.test(String(features?.['Postać'] || features?.['Postac'] || features?.['Dozownik'] || ''));
        const hasHypochlorite = /(sodium\s+hypochlorite|podchloryn\s+sodu|calcium\s+hypochlorite|candeggin[ao]|candegin[ao]|związki\s+wybielające\s+na\s+bazie\s+chloru|chlorine[\s-]*based\s+bleaching)/i.test(combinedContextLower) ||
                                (/\b(wybielacz|bleach)\b/i.test(prodNameLower + ' ' + featuresStr) && !/(tlenow|oxygen|pasta do zębów|zęb)/i.test(combinedContextLower));
        const hasCausticOrCorrosiveAgent = Boolean(
            hasHypochlorite ||
            /(?:sodium\s+hydroxide|potassium\s+hydroxide|wodorotlenek\s+sodu|wodorotlenek\s+potasu|idrossido\s+di\s+sodio|idrossido\s+di\s+potassio|sodium\s+metasilicate|krzemian\s+sodu|sulfamic\s+acid|kwas\s+sulfaminowy|hydrochloric\s+acid|kwas\s+solny|phosphoric\s+acid|kwas\s+fosforowy|formic\s+acid|kwas\s+mrówkowy|oxalic\s+acid|kwas\s+szczawiowy|monoethanolamine|ethanolamine|etanolamina|udrożniacz|udrozniacz|kret\b|do\s+piekarnik|do\s+grilla|do\s+komink|odgrzybiacz|pleśn|plesn|muffa)/i.test(`${rawInciLower} ${prodNameLower} ${labelSafetyLower}`)
        );
        const hasExplicitGlovesOnLabel = /(?:rękawic|rekawic|guanti|gloves|schutzhandschuhe)/i.test(labelSafetyLower);
        const hasChemicalInciMarkers = /(sodium\s+hypochlorite|podchloryn\s+sodu|sodium\s+c14-17\s+alkyl\s+sec\s+sulfonate|sodium\s+dodecylbenzenesulfonate|alkylbenzene\s+sulfonate|sodium\s+silicate|sodium\s+metasilicate|krzemian\s+sodu|phosphonates|fosfoniany|polycarboxylates|polikarboksylany|zeolites|zeolity|optical\s+brightener|fluorescent\s+brightener|rozjaśniacze\s+optyczne|sodium\s+percarbonate|nadwęglan\s+sodu|\btaed\b|sulfamic\s+acid|formic\s+acid|anionowe\s+środki\s+powierzchniowo\s+czynne|niejonowe\s+środki\s+powierzchniowo\s+czynne)/i.test(rawInciLower);
        const hasHouseholdNameOrPurpose = /(chemia|detergent|odkamien|zmywark|czyszcz|myjący|myjacy|płyn do wc|plyn do wc|żel do wc|kostka do wc|udrożniacz|udrozniacz|środek wielofunkcyjny|srodek wielofunkcyjny|środek czyszczący|srodek czyszczacy|środek do czyszczenia|preparat czyszczący|płyn uniwersalny|plyn uniwersalny|mleczko do czyszczenia|odtłuszczacz|odtluszczacz|do kuchni|do łazien|do lazien|do podłóg|do podlog|do szyb|do mebli|do dywan|do naczyń|do naczyn|do piekarnik|do grilla|do kabin|do fug|czyszczenie powierzchni|zmywalnych powierzchni|candeggin|sgrassatore|multiuso|anticalcare|pavimenti|lavastoviglie)/i.test(prodNameLower + ' ' + String(features?.['Przeznaczenie (Front)'] || features?.['Przeznaczenie'] || features?.['Kategoria'] || ''));

        const isActualChemical = Boolean(
            isChemical ||
            isLaundryCapsules ||
            isLaundryDetergent ||
            isAerosol ||
            hasHypochlorite ||
            hasCausticOrCorrosiveAgent ||
            hasChemicalInciMarkers ||
            hasHouseholdNameOrPurpose ||
            compliance?.clp_signal_word ||
            (compliance?.clp_h_phrases && compliance.clp_h_phrases.length > 0) ||
            /\b(H3\d{2}|P102|P264|P280|P305|EUH20[68])\b/i.test(rawPimWarnings)
        );

        const isWaterBasedCleanser = isActualChemical || /(mydło|soap|szampon|shampoo|żel|zel|balsam|krem|cream|lotion|emulsja|płyn|plyn)/i.test(prodNameLower);
        const isToothbrush = /(szczoteczk|toothbrush)/i.test(prodNameLower) &&
                             !/(pasta do zębów|pasta do zebow|toothpaste)/i.test(prodNameLower);
        const isDentalFloss = /(nić|nic|floss|wykałaczk|dental|czyścik|czyscik)/i.test(prodNameLower) &&
                              !/(szczoteczk|toothbrush|pasta do zębów|pasta do zebow|toothpaste)/i.test(prodNameLower);

        // --- MODUŁ DEDYKOWANY: SZCZOTECZKI MANUALNE DO ZĘBÓW (PN-EN ISO 20126, GPSR UE 2023/988) ---
        if (isToothbrush) {
            detectedRisks.push('TOOTHBRUSH_SAFETY');
            warnings.push("Produkt przeznaczony wyłącznie do higieny jamy ustnej. Nie gryźć i nie połykać elementów szczoteczki.");
            warnings.push("Zaleca się wymianę szczoteczki na nową co 2–3 miesiące, po przebytych infekcjach lub w przypadku widocznego zużycia włókien.");
            warnings.push("Dzieci poniżej 6 roku życia powinny szczotkować zęby pod nadzorem osoby dorosłej w celu wyrobienia właściwej techniki mycia.");
            warnings.push("Po użyciu dokładnie opłukać główkę szczoteczki pod bieżącą wodą i przechowywać w pozycji pionowej, główką do góry, w czystym i suchym miejscu.");
            return {
                detected_risks: detectedRisks,
                warnings: warnings
            };
        }

        // --- MODUŁ DEDYKOWANY: NICI DENTYSTYCZNE I AKCESORIA MIĘDZYZĘBOWE (PN-EN ISO 28158, GPSR UE 2023/988) ---
        if (isDentalFloss) {
            detectedRisks.push('DENTAL_FLOSS_SAFETY');
            detectedRisks.push('ORAL_CARE_ACCESSORY');
            warnings.push("Produkt przeznaczony wyłącznie do higieny przestrzeni międzyzębowych. Nie połykać.");
            warnings.push("Przechowywać w miejscu niedostępnym dla małych dzieci. Ryzyko zadławienia i zaplątania.");
            warnings.push("Dzieci poniżej 10 roku życia powinny używać produktu pod nadzorem osoby dorosłej.");
            warnings.push("Wprowadzać nić delikatnie, aby uniknąć mechanicznego podrażnienia dziąseł.");
            return {
                detected_risks: detectedRisks,
                warnings: warnings
            };
        }

        if ((!inci || typeof inci !== 'string' || inci.trim().length === 0) && !rawPimWarnings) {
            // Domyślne ostrzeżenie ogólne dla produktów bez podanego składu i bez wpisanych ostrzeżeń w PIM
            if (isLaundryCapsules) {
                warnings.push("P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.");
                warnings.push("P102 – Chronić przed dziećmi.");
                warnings.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
                warnings.push("Nie połykać. W razie połknięcia skontaktować się z lekarzem.");
                warnings.push("Stosować suchymi dłońmi. Nie przekłuwać i nie rozcinać kapsułek.");
                warnings.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
                return { detected_risks: ['LAUNDRY_CAPSULES_SAFETY'], warnings };
            }
            if (isActualChemical || isAerosol) {
                const fallbackRisks = ['HOUSEHOLD_CHEMICAL'];
                warnings.push("P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.");
                warnings.push("P102 – Chronić przed dziećmi.");
                warnings.push("P264 – Dokładnie umyć ręce po użyciu.");
                if (hasCausticOrCorrosiveAgent || hasExplicitGlovesOnLabel) {
                    fallbackRisks.push('PROTECTIVE_GLOVES_REQUIRED');
                    warnings.push("P280 – Stosować rękawice ochronne.");
                    warnings.push("P302+P352 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Umyć dużą ilością wody.");
                }
                if (isAerosol || isLaundryDetergent || hasCausticOrCorrosiveAgent) {
                    warnings.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
                }
                warnings.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
                return { detected_risks: fallbackRisks, warnings };
            }
            warnings.push("Produkt przeznaczony wyłącznie do użytku zewnętrznego zgodnie z przeznaczeniem.");
            warnings.push("Przechowywać w suchym miejscu, w temperaturze pokojowej, z dala od dzieci.");
            return { detected_risks: ['GENERAL_FALLBACK'], warnings };
        }

        const cleanInci = String(inci || '').toLowerCase();
        const ingredientsList = cleanInci.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);

        // Wykrywanie substancji uczulających (zarówno alergenów zapachowych jak i konserwantów)
        const foundFragranceAllergens = this.fragranceAllergens.filter(allergen => 
            ingredientsList.some(ing => ing.includes(allergen))
        );
        const foundPreservatives = this.sensitizingPreservatives.filter(preservative =>
            ingredientsList.some(ing => ing.includes(preservative))
        );
        const allFoundSensitizers = [...new Set([...foundFragranceAllergens, ...foundPreservatives])];

        // Konsolidacja zwrotów H i P z parametrów i compliance
        const combinedHPhrases = [
            ...(Array.isArray(hPhrases) ? hPhrases : []),
            ...(Array.isArray(compliance?.clp_h_phrases) ? compliance.clp_h_phrases : [])
        ];
        const rawPPhrases = [
            ...(Array.isArray(pPhrases) ? pPhrases : []),
            ...(Array.isArray(compliance?.clp_p_phrases) ? compliance.clp_p_phrases : [])
        ];
        const splitPPhrases = this.splitCombinedPPhrases(rawPPhrases);

        const hasEyeIrritation = combinedHPhrases.some(h => /H319|H318|H314/i.test(h)) || /\b(H319|H318|H314)\b/i.test(rawPimWarnings);
        const hasSkinIrritationOrCorrosion = combinedHPhrases.some(h => /H314|H315/i.test(h)) || /\b(H314|H315)\b/i.test(rawPimWarnings);
        const hasSevereCorrosionH314OrH318 = combinedHPhrases.some(h => /H314|H318/i.test(h)) || /\b(H314|H318)\b/i.test(rawPimWarnings) || /(?:ochron[ęy]\s+oczu|okulary\s+ochronne|gogle\s+ochronne)/i.test(rawPimWarnings);
        const requiresProtectiveGloves = Boolean(
            hasExplicitGlovesOnLabel ||
            hasSkinIrritationOrCorrosion ||
            hasCausticOrCorrosiveAgent
        );
        const hasSevereChemicalIrritant = Boolean(
            hasHypochlorite ||
            hasCausticOrCorrosiveAgent ||
            /(sodium\s+hydroxide|potassium\s+hydroxide|wodorotlenek\s+sodu|sodium\s+silicate|sodium\s+metasilicate|krzemian\s+sodu|sodium\s+c14-17\s+alkyl\s+sec\s+sulfonate|sodium\s+dodecylbenzenesulfonate|alkylbenzene\s+sulfonate|sodium\s+carbonate|sulfamic\s+acid|formic\s+acid|phosphoric\s+acid|hydrochloric\s+acid|sodium\s+percarbonate|nadwęglan\s+sodu|mleczko\s+do\s+czyszczenia|środek\s+wielofunkcyjny|srodek\s+wielofunkcyjny|środek\s+czyszczący|srodek\s+czyszczacy|odkamieniacz|udrożniacz|odtłuszczacz|sgrassatore|anticalcare|płyn\s+do\s+wc|żel\s+do\s+wc)/i.test(`${cleanInci} ${prodNameLower}`)
        );

        const isGlassOrMildSurfaceSpray = Boolean(
            /(?:do\s+szyb|do\s+szkła|do\s+luster|płyn\s+do\s+szyb|vetri|glass\s+cleaner|cristalli|specchi)/i.test(prodNameLower) &&
            !hasSevereChemicalIrritant &&
            !hasHypochlorite &&
            !isLaundryDetergent &&
            !isLaundryCapsules
        );

        const labelExplicitlyDeclaresHazard = Boolean(
            /(?:\bH314\b|\bH315\b|\bH318\b|\bH319\b|\bH225\b|\bH226\b|\bH290\b|\bP264\b|\bP280\b|\bP305\b|\bP337\b|drażniąc[a-ząćęłńóśźż]*\s+na\s+(?:oczy|skórę)|uszkodzeni[ea]\s+oczu|oparzeni[ea]\s+skóry|irritazione\s+oculare|provoca\s+grave|causes\s+serious\s+eye|causes\s+skin\s+irritation|niebezpieczeństwo|pericolo|danger|hasło\s+ostrzegawcze\s*[–:-]\s*(?:uwaga|niebezpieczeństwo))/i.test(
                `${rawPimWarnings} ${combinedHPhrases.join(' ')} ${splitPPhrases.join(' ')} ${compliance?.clp_signal_word || ''}`
            )
        );

        // Jeżeli posiadamy odczyt z tylnej etykiety (rawPimWarnings) lub jest to łagodny płyn do szyb/luster,
        // który na etykiecie posiada wyłącznie zwroty ostrożności P101/P102/P103 i EUH208 (bez H319/H315/H314 i bez piktogramu),
        // NIE WOLNO fabrykować klasyfikacji H319, hasła UWAGA ani procedur P264/P305/P337!
        const isMildUnclassifiedChemical = Boolean(
            !labelExplicitlyDeclaresHazard &&
            !hasSevereChemicalIrritant &&
            !hasHypochlorite &&
            !isLaundryDetergent &&
            !isLaundryCapsules &&
            !isAerosol &&
            (Boolean(rawPimWarnings && rawPimWarnings.length >= 10) || isGlassOrMildSurfaceSpray)
        );

        const isClassifiedChemical = Boolean(
            !isMildUnclassifiedChemical && (
                hasEyeIrritation ||
                hasSkinIrritationOrCorrosion ||
                hasHypochlorite ||
                hasSevereChemicalIrritant ||
                isLaundryDetergent ||
                isLaundryCapsules ||
                isAerosol ||
                labelExplicitlyDeclaresHazard ||
                (compliance?.clp_h_phrases && compliance.clp_h_phrases.length > 0)
            )
        );

        // --- OBSŁUGA CHEMII GOSPODARCZEJ I DETERGENTÓW (REŻIM CLP 1272/2008 & REŻIM DETERGENTOWY 648/2004) ---
        if (isActualChemical) {
            detectedRisks.push('HOUSEHOLD_CHEMICAL');
            if (hasHypochlorite) {
                detectedRisks.push('CHLORINE_BLEACH_EUH206');
            }
            if (requiresProtectiveGloves) {
                detectedRisks.push('PROTECTIVE_GLOVES_REQUIRED');
            }

            // 1. Hasło ostrzegawcze (DANGER / WARNING wg CLP) - format z myślnikiem wg standardu Allegro
            if (isClassifiedChemical) {
                let signalWord = compliance?.clp_signal_word || 'UWAGA';
                if (/niebezpieczeństwo|pericolo|danger|\bH314\b|\bH318\b/i.test(`${signalWord} ${rawPimWarnings} ${combinedHPhrases.join(' ')}`)) {
                    signalWord = 'NIEBEZPIECZEŃSTWO';
                } else {
                    signalWord = 'UWAGA';
                }
                warnings.push(`Hasło ostrzegawcze – ${signalWord}`);
            }

            // 2. Zwroty wskazujące rodzaj zagrożenia (H-phrases)
            if (isClassifiedChemical) {
                detectedRisks.push('EYE_IRRITATION_H319');
                if (combinedHPhrases.length > 0) {
                    for (const h of combinedHPhrases) {
                        warnings.push(h);
                    }
                    if (requiresProtectiveGloves && !combinedHPhrases.some(h => /H314|H315/i.test(h)) && (hasHypochlorite || hasCausticOrCorrosiveAgent)) {
                        warnings.push("H315 – Działa drażniąco na skórę.");
                    }
                } else {
                    if (/\bH314\b/i.test(rawPimWarnings)) {
                        warnings.push("H314 – Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.");
                    } else {
                        if (hasHypochlorite || requiresProtectiveGloves) {
                            warnings.push("H315 – Działa drażniąco na skórę.");
                        }
                        if (/\bH318\b/i.test(rawPimWarnings)) {
                            warnings.push("H318 – Powoduje poważne uszkodzenie oczu.");
                        } else {
                            warnings.push("H319 – Działa drażniąco na oczy.");
                        }
                    }
                }
            }

            // 3. P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę
            warnings.push("P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.");

            // 4. P102 – Chronić przed dziećmi (Obowiązkowy dla mieszanin konsumenckich)
            warnings.push("P102 – Chronić przed dziećmi.");

            // 4a. Ostrzeżenie prewencyjne "Nie połykać." w grupie prewencyjnej (przed procedurami ratunkowymi P3xx)
            if ((isClassifiedChemical || /nie\s+połykać|non\s+ingerire|do\s+not\s+swallow/i.test(rawPimWarnings)) && !isLaundryCapsules) {
                warnings.push("Nie połykać.");
            }

            // 4b. P103 – Uważnie przeczytać wszystkie instrukcje i zastosować się do nich (jeśli występuje na etykiecie lub dla łagodnych sprayów z P103)
            if (/(?:\bP103\b|uważnie\s+przeczytać\s+wszystkie\s+instrukcje|leggere\s+attentamente\s+e\s+seguire|read\s+carefully\s+and\s+follow)/i.test(`${rawPimWarnings} ${splitPPhrases.join(' ')}`) || isMildUnclassifiedChemical) {
                warnings.push("P103 – Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.");
            }

            // 5. P264 – Dokładnie umyć ręce po użyciu
            if (isClassifiedChemical) {
                warnings.push("P264 – Dokładnie umyć ręce po użyciu.");
            }

            // 5b. P280 – Stosować rękawice ochronne (dla H314/H318 z ochroną oczu, dla pozostałych same rękawice ochronne)
            if (requiresProtectiveGloves) {
                if (hasSevereCorrosionH314OrH318) {
                    warnings.push("P280 – Stosować rękawice ochronne i ochronę oczu.");
                } else {
                    warnings.push("P280 – Stosować rękawice ochronne.");
                }
            }

            const hasCorrosiveH314 = Boolean(
                combinedHPhrases.some(h => /\bH314\b/i.test(h)) ||
                /\b(?:H314|P301\+P330\+P331|P303\+P361\+P353|P331)\b|\bNIE\s+wywoływać\s+wymiotów/i.test(`${rawPimWarnings} ${splitPPhrases.join(' ')}`)
            );

            // 6. Procedura po połknięciu: dla żrących H314 kanoniczne P301+P330+P331 (bez wywoływania wymiotów), dla pozostałych P301+P312
            if (hasCorrosiveH314 && !isLaundryCapsules) {
                warnings.push("P301+P330+P331 – W PRZYPADKU POŁKNIĘCIA: wypłukać usta. NIE wywoływać wymiotów.");
            } else if (isClassifiedChemical || isLaundryCapsules || /\bP301\b|połknięci/i.test(rawPimWarnings)) {
                warnings.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
            }

            // 7b. Procedura kontaktu ze skórą: dla żrących H314 / etykiet z P303 kanoniczne P303+P361+P353, dla pozostałych P302+P352
            if (hasCorrosiveH314 || /\bP303\b/i.test(`${rawPimWarnings} ${splitPPhrases.join(' ')}`)) {
                warnings.push("P303+P361+P353 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody lub prysznicem.");
            } else if (hasHypochlorite || requiresProtectiveGloves) {
                warnings.push("P302+P352 – W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ: Umyć dużą ilością wody.");
            }

            // 8. P305+P351+P338 – Faza 1: Płukanie oczu wodą
            if (isClassifiedChemical || /\bP305\b|dostania\s+się\s+do\s+oczu/i.test(rawPimWarnings)) {
                warnings.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
            }

            // 9. P337+P313 – Faza 2: Pomoc lekarska w razie utrzymywania się podrażnienia oczu (dla H314 tylko jeśli nie koliduje z etykietą lub z P305)
            if (isClassifiedChemical || /\bP337\b/i.test(rawPimWarnings)) {
                warnings.push("P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.");
            }

            // 9b. EUH206 – Obowiązkowe ostrzeżenie dla mieszanin zawierających aktywny chlor / podchloryn sodu (Załącznik II CLP pkt 2.6)
            if (hasHypochlorite) {
                warnings.push("EUH206 – Uwaga! Nie stosować razem z innymi produktami. Może wydzielać niebezpieczne gazy (chlor).");
            }

            // 10. EUH208 – Informacja uzupełniająca o zagrożeniach (Art. 25 ust. 6 CLP, Rozp. 2023/1545)
            // Zgodnie z prawem unijnym wymieniamy WSZYSTKIE zidentyfikowane substancje uczulające (BEZ UCINANIA)
            if (allFoundSensitizers.length > 0) {
                detectedRisks.push('EUH208_SENSITIZER');
                const formattedSensitizers = allFoundSensitizers.map(s => this.formatSubstanceName(s)).join(', ');
                warnings.push(`EUH208 – Zawiera ${formattedSensitizers}. Może powodować wystąpienie reakcji alergicznej.`);
            }

            // 11. Dołączenie ewentualnych pozostałych zwrotów P ze specyfikacji/SDS (skonsolidowanych, z twardą deduplikacją po kodzie i treści)
            for (const rawP of splitPPhrases) {
                const p = this.normalizeClpPhraseText(String(rawP || ''));
                if (!p || this.isOrphanClpOrRawIngredientFragment(p)) continue;
                const codeOnly = p.split(/[\s–-]/)[0].toUpperCase();
                if (/^(P101|P102|P103|P264|P301|P301\+P312|P301\+P330\+P331|P312|P330|P331|P302|P302\+P352|P352|P303|P303\+P361\+P353|P361|P353|P305|P305\+P351\+P338|P351|P338|P337|P337\+P313|P313|P280|H314|H315|H318|H319|EUH206|EUH208)$/.test(codeOnly)) {
                    if (codeOnly === 'P103' && !warnings.some(w => /\bP103\b/i.test(w))) {
                        warnings.push("P103 – Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.");
                    }
                    continue;
                }
                if (/(?:pokazać pojemnik lub etykietę|chronić przed dziećmi|uważnie przeczytać wszystkie instrukcje|dokładnie umyć ręce|nie połykać|dostania się do oczu|styczności ze skórą|kontaktu ze skórą|działa drażniąco na oczy|reakcji alergicznej|izotiazol|isothiazol|niebezpieczne gazy|wywoływać wymiotów)/i.test(p)) {
                    continue;
                }
                if (!warnings.some(w => w.includes(codeOnly))) {
                    warnings.push(p);
                }
            }

            // 11b. Wstrzyknięcie specyficznych ostrzeżeń odczytanych bezpośrednio z tylnej etykiety opakowania (features['Ostrzeżenia'])
            // Dzielimy wyłącznie po znakach nowej linii lub granicach kodów CLP/sekcji (NIGDY po kropce wewnątrz zdań CLP!)
            if (rawPimWarnings) {
                const labelClauses = rawPimWarnings
                    .split(/(?:\r?\n|(?=\s+(?:Hasło\s+ostrzegawcze|P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3}|Zawiera\b|Contains\b|Contiene\b|Skład\b|Composizione\b)\b))/i)
                    .map(s => s.replace(/\s+(?:Zawiera|Contains|Contiene|Skład(?:\s+chemiczny)?|Composizione(?:\s+chimica)?)\b[\s\S]*$/i, '').trim())
                    .map(s => this.normalizeClpPhraseText(s))
                    .filter(s => s.length >= 6);
                for (const clause of labelClauses) {
                    if (this.isOrphanClpOrRawIngredientFragment(clause)) {
                        continue;
                    }
                    const normalizedClause = clause.endsWith('.') ? clause : `${clause}.`;
                    // Pomijamy zdania już pokryte przez standardowe kody P/H/EUH
                    if (/^(?:Hasło\s+ostrzegawcze|UWAGA\.?|NIEBEZPIECZEŃSTWO\.?|PERICOLO\.?|DANGER\.?|P101|P102|P103|P264|P280|P301|P302|P303|P305|P337|H314|H315|H318|H319|EUH206|EUH208)/i.test(normalizedClause)) {
                        continue;
                    }
                    if (/(?:chronić przed dziećmi|uważnie przeczytać wszystkie instrukcje|zastosować się do nich|dokładnie umyć ręce|nie połykać|dostania się do oczu|styczności ze skórą|kontaktu ze skórą|działa drażniąco na oczy|działa drażniąco na skórę|stosować rękawice ochronne|pokazać pojemnik lub etykietę|reakcji alergicznej|reazione allergica|allergic reaction|izotiazol|isothiazol|niebezpieczne gazy|wywoływać wymiotów)/i.test(normalizedClause)) {
                        continue;
                    }
                    const clauseCodeMatch = normalizedClause.match(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3})\b/i);
                    if (clauseCodeMatch && warnings.some(w => w.toUpperCase().startsWith(clauseCodeMatch[1].toUpperCase()))) {
                        continue;
                    }
                    if (!warnings.some(w => w.toLowerCase().includes(clause.toLowerCase().substring(0, Math.min(25, clause.length))))) {
                        warnings.push(normalizedClause);
                    }
                }
            }

            // Dodatkowe wytyczne dla kapsułek do prania (A.I.S.E. / Rozp. 1297/2014)
            if (isLaundryCapsules) {
                detectedRisks.push('LAUNDRY_CAPSULES_SAFETY');
                warnings.push("Nie połykać. W razie połknięcia natychmiast skontaktować się z ośrodkiem zatruć lub lekarzem.");
                warnings.push("Stosować suchymi dłońmi. Nie przekłuwać, nie rozrywać i nie rozcinać kapsułki. Szczelnie zamykać opakowanie po użyciu.");
            }
        } else {
            // --- OBSŁUGA KOSMETYKÓW I PRODUKTÓW PIELĘGNACYJNYCH (Rozporządzenie 1223/2009 & GPSR) ---
            // 1. Alergeny w kosmetykach: informacja GPSR (bez zwrotu CLP EUH208)
            if (foundFragranceAllergens.length > 0) {
                detectedRisks.push('FRAGRANCE_ALLERGENS');
                const sampleAllergens = foundFragranceAllergens.map(a => this.formatSubstanceName(a)).join(', ');
                warnings.push(`Produkt zawiera kompozycję zapachową z potencjalnymi alergenami (${sampleAllergens}). W przypadku wystąpienia podrażnienia lub reakcji uczuleniowej przerwać stosowanie.`);
            }

            // 2. Retinoidy (Rozp. 2024/996)
            const hasRetinoids = this.retinoids.some(r => cleanInci.includes(r));
            if (hasRetinoids) {
                detectedRisks.push('RETINOIDS');
                warnings.push("Zawiera witaminę A (retinoidy). Przed użyciem należy uwzględnić jej dzienne pobranie z innych źródeł. Nie stosować na uszkodzoną skórę i unikać ekspozycji na słońce.");
            }

            // 3. Kwasy (AHA / BHA / PHA)
            const hasAcids = this.acids.some(a => cleanInci.includes(a));
            if (hasAcids) {
                detectedRisks.push('PEELING_ACIDS');
                warnings.push("Zawiera hydroksykwasy. Unikać bezpośredniego kontaktu z oczami i błonami śluzowymi. W ciągu dnia zaleca się stosowanie ochrony przeciwsłonecznej (SPF).");
            }

            // 4. Surfaktanty myjące (oczy)
            const hasSurfactants = this.surfactants.some(s => cleanInci.includes(s));
            if (hasSurfactants || cleanInci.includes('soap') || cleanInci.includes('mydło') || cleanInci.includes('szampon')) {
                detectedRisks.push('EYE_IRRITANT_SURFACTANT');
                warnings.push("W przypadku dostania się produktu do oczu natychmiast przepłukać je obficie czystą, letnią wodą.");
            }

            // 5. Alkohole łatwopalne
            const isNotFlammableCategory = isWaterBasedCleanser && !/(aerozol|spray|perfum|woda toaletowa|zmywacz)/i.test(prodNameLower);
            if (!isNotFlammableCategory) {
                const hasFlammableSolvent = this.flammableSolvents.some(solv => {
                    return ingredientsList.some(ing => {
                        if (this.nonFlammableAlcohols.some(nonFlam => ing.includes(nonFlam))) return false;
                        return ing === solv || ing.includes(solv);
                    });
                });
                if (hasFlammableSolvent) {
                    detectedRisks.push('VOLATILE_ALCOHOL');
                    warnings.push("Produkt zawiera substancje łatwopalne. Przechowywać z dala od otwartego ognia, iskier i bezpośrednich źródeł ciepła.");
                }
            }

            // 6. Ogólne zasady GPSR dla kosmetyków
            warnings.push("Tylko do użytku zewnętrznego. Nie stosować na podrażnioną lub uszkodzoną skórę.");
            warnings.push("Przechowywać w temperaturze pokojowej (15–25°C), w szczelnie zamkniętym opakowaniu, w miejscu niedostępnym dla małych dzieci.");
        }

        // Standaryzacja językowa i interpunkcyjna (w tym korekta literówek KONTATKU oraz Medical Whitelisting STYCZNOŚCI ZE SKÓRĄ)
        const sanitizedWarnings = warnings
            .map(w => this.normalizeClpPhraseText(w))
            .filter(w => Boolean(w) && !this.isOrphanClpOrRawIngredientFragment(w));

        // Deduplikacja bez sztucznego obcinania - pełna lista prawna
        const dedupedWarnings = [...new Set(sanitizedWarnings)];

        return {
            detected_risks: detectedRisks,
            warnings: dedupedWarnings
        };
    }
}

module.exports = new GpsrSafetyService();
