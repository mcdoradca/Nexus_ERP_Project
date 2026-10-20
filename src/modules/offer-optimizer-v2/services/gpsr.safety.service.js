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

    splitCombinedPPhrases(input) {
        if (!input) return [];
        const rawList = Array.isArray(input) ? input : [input];
        const result = [];

        for (const item of rawList) {
            if (!item || typeof item !== 'string') continue;
            let str = item.trim();

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
                            } else if (cleanCode === 'P280') {
                                text = "Stosować ochronę oczu / ochronę twarzy.";
                            } else if (cleanCode === 'P102') {
                                text = "Chronić przed dziećmi.";
                            }
                        }
                        if (text) {
                            text = text.replace(/^[:\s–-]+/, '').trim().replace(/\bDO OCZÓW\b/gi, 'DO OCZU');
                            result.push(`${cleanCode} – ${text}`);
                        } else {
                            result.push(cleanCode);
                        }
                    }
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
    generateGpsrWarnings({ inci, productName = '', isChemical = false, compliance = null, hPhrases = [], pPhrases = [], features = {} } = {}) {
        const warnings = [];
        const detectedRisks = [];

        const prodNameLower = String(productName || '').toLowerCase();
        const isLaundryCapsules = /(kapsułk|kapsulk|capsule|pod[s]?)/i.test(prodNameLower) && 
                                  /(prani|laundry|wash|detergent|tkanin)/i.test(prodNameLower);
        const isLaundryDetergent = /(płyn do prania|zel do prania|żel do prania|proszek do prania|laundry|odplamiacz|płyn do płukania)/i.test(prodNameLower);
        const isAerosol = /(aerozol|spray|aerosol|atomizer|odświeżacz powietrza|odswiezacz powietrza)/i.test(prodNameLower) ||
                          features?.['Postać'] === 'Spray' || features?.['Postać'] === 'Aerozol' ||
                          features?.['Postac'] === 'Spray' || features?.['Postac'] === 'Aerozol';
        const isActualChemical = Boolean(
            isChemical ||
            isLaundryCapsules ||
            isLaundryDetergent ||
            isAerosol ||
            /(chemia|detergent|odkamien|zmywark|czyszcz|płyn do wc|udrożniacz)/i.test(prodNameLower) ||
            compliance?.clp_signal_word ||
            (compliance?.clp_h_phrases && compliance.clp_h_phrases.length > 0)
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

        if (!inci || typeof inci !== 'string' || inci.trim().length === 0) {
            // Domyślne ostrzeżenie ogólne dla produktów bez podanego składu
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
                warnings.push("P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.");
                warnings.push("P102 – Chronić przed dziećmi.");
                if (isAerosol || isLaundryDetergent) {
                    warnings.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
                }
                warnings.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
                return { detected_risks: ['HOUSEHOLD_CHEMICAL'], warnings };
            }
            warnings.push("Produkt przeznaczony wyłącznie do użytku zewnętrznego zgodnie z przeznaczeniem.");
            warnings.push("Przechowywać w suchym miejscu, w temperaturze pokojowej, z dala od dzieci.");
            return { detected_risks: ['GENERAL_FALLBACK'], warnings };
        }

        const cleanInci = inci.toLowerCase();
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

        const hasEyeIrritation = combinedHPhrases.some(h => /H319|H318/i.test(h));

        const isClassifiedChemical = Boolean(
            hasEyeIrritation ||
            isLaundryDetergent ||
            isLaundryCapsules ||
            isAerosol ||
            compliance?.clp_signal_word ||
            (compliance?.clp_h_phrases && compliance.clp_h_phrases.length > 0)
        );

        // --- OBSŁUGA CHEMII GOSPODARCZEJ I DETERGENTÓW (REŻIM CLP 1272/2008 & REŻIM DETERGENTOWY 648/2004) ---
        if (isActualChemical) {
            detectedRisks.push('HOUSEHOLD_CHEMICAL');

            // 1. Hasło ostrzegawcze (DANGER / WARNING wg CLP)
            if (isClassifiedChemical) {
                const signalWord = compliance?.clp_signal_word || 'UWAGA';
                warnings.push(`Hasło ostrzegawcze: ${signalWord}`);
            }

            // 2. Zwroty wskazujące rodzaj zagrożenia (H-phrases)
            if (isClassifiedChemical) {
                detectedRisks.push('EYE_IRRITATION_H319');
                if (combinedHPhrases.length > 0) {
                    for (const h of combinedHPhrases) {
                        warnings.push(h);
                    }
                } else {
                    warnings.push("H319 – Działa drażniąco na oczy.");
                }
            }

            // 3. P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę
            warnings.push("P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.");

            // 4. P102 – Chronić przed dziećmi (Obowiązkowy dla mieszanin konsumenckich)
            warnings.push("P102 – Chronić przed dziećmi.");

            // 5. P280 – Stosować ochronę oczu / ochronę twarzy (Wymagany przy H319/H318)
            if (isClassifiedChemical) {
                warnings.push("P280 – Stosować ochronę oczu / ochronę twarzy.");
            }

            // 6. P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ / lekarzem
            if (isClassifiedChemical || isLaundryCapsules) {
                warnings.push("P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem.");
            }

            // 7. P305+P351+P338 – Faza 1: Płukanie oczu wodą
            warnings.push("P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");

            // 8. P337+P313 – Faza 2: Pomoc lekarska w razie utrzymywania się podrażnienia oczu
            if (isClassifiedChemical) {
                warnings.push("P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.");
            }

            // 9. EUH208 – Informacja uzupełniająca o zagrożeniach (Art. 25 ust. 6 CLP, Rozp. 2023/1545)
            // Zgodnie z prawem unijnym wymieniamy WSZYSTKIE zidentyfikowane substancje uczulające (BEZ UCINANIA)
            if (allFoundSensitizers.length > 0) {
                detectedRisks.push('EUH208_SENSITIZER');
                const formattedSensitizers = allFoundSensitizers.map(s => this.formatSubstanceName(s)).join(', ');
                warnings.push(`EUH208 – Zawiera ${formattedSensitizers}. Może powodować wystąpienie reakcji alergicznej.`);
            }

            // 6. Dołączenie ewentualnych pozostałych zwrotów P ze specyfikacji/SDS (zdekomponowanych)
            for (const p of splitPPhrases) {
                if (!warnings.some(w => w.includes(p.substring(0, 4)))) {
                    warnings.push(p);
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

        // Standaryzacja językowa i interpunkcyjna
        const sanitizedWarnings = warnings.map(w => {
            return w
                .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*|EUH\d{3}):\s*/i, '$1 – ');
        });

        // Deduplikacja bez sztucznego obcinania - pełna lista prawna
        const dedupedWarnings = [...new Set(sanitizedWarnings)];

        return {
            detected_risks: detectedRisks,
            warnings: dedupedWarnings
        };
    }
}

module.exports = new GpsrSafetyService();
