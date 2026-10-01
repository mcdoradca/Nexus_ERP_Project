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
            'evernia prunastri', 'evernia furfuracea', 'oak moss', 'tree moss'
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

    /**
     * Analizuje skład INCI i generuje bazowe ostrzeżenia bezpieczeństwa GPSR.
     * @param {Object} params
     * @param {string} params.inci - Skład INCI (rozdzielony przecinkami)
     * @param {string} [params.productName] - Nazwa produktu
     * @param {boolean} [params.isChemical] - Czy to produkt chemii gospodarczej / detergent
     * @returns {Object} { detected_risks: string[], warnings: string[] }
     */
    generateGpsrWarnings({ inci, productName = '', isChemical = false }) {
        const warnings = [];
        const detectedRisks = [];

        const prodNameLower = String(productName || '').toLowerCase();
        const isLaundryCapsules = /(kapsułk|kapsulk|capsule|pod[s]?)/i.test(prodNameLower) && 
                                  /(prani|laundry|wash|detergent|tkanin)/i.test(prodNameLower);
        const isLaundryDetergent = /(płyn do prania|zel do prania|żel do prania|proszek do prania|laundry)/i.test(prodNameLower);
        const isWaterBasedCleanser = isChemical || /(mydło|soap|szampon|shampoo|żel|zel|balsam|krem|cream|lotion|emulsja|płyn|plyn)/i.test(prodNameLower);

        if (!inci || typeof inci !== 'string' || inci.trim().length === 0) {
            // Domyślne ostrzeżenie ogólne dla produktów bez podanego składu
            if (isLaundryCapsules) {
                warnings.push("P102 – Chronić przed dziećmi.");
                warnings.push("Nie połykać. W razie połknięcia skontaktować się z lekarzem.");
                warnings.push("Stosować suchymi dłońmi. Nie przekłuwać i nie rozcinać kapsułek.");
                warnings.push("P305+P351+P338 – W przypadku dostania się do oczu ostrożnie płukać wodą przez kilka minut.");
                return { detected_risks: ['LAUNDRY_CAPSULES_SAFETY'], warnings };
            }
            warnings.push("Produkt przeznaczony wyłącznie do użytku zewnętrznego zgodnie z przeznaczeniem.");
            warnings.push("Przechowywać w suchym miejscu, w temperaturze pokojowej, z dala od dzieci.");
            return { detected_risks: ['GENERAL_FALLBACK'], warnings };
        }

        const cleanInci = inci.toLowerCase();
        const ingredientsList = cleanInci.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);

        // --- MODUŁ SPECJALNY: KAPSUŁKI DO PRANIA (Rozp. UE 1297/2014 & A.I.S.E.) ---
        if (isLaundryCapsules) {
            detectedRisks.push('LAUNDRY_CAPSULES_SAFETY');
            warnings.push("P102 – Chronić przed dziećmi.");
            warnings.push("Nie połykać. W razie połknięcia natychmiast skontaktować się z ośrodkiem zatruć lub lekarzem.");
            warnings.push("Stosować suchymi dłońmi. Nie przekłuwać, nie rozrywać i nie rozcinać kapsułki. Szczelnie zamykać opakowanie po użyciu.");
            warnings.push("P305+P351+P338 – W przypadku dostania się do oczu: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.");
            
            // Sprawdzenie alergenów zapachowych dla kapsułek (np. Linalool)
            const foundAllergens = this.fragranceAllergens.filter(allergen => 
                ingredientsList.some(ing => ing.includes(allergen))
            );
            if (foundAllergens.length > 0) {
                const sampleAllergens = foundAllergens.slice(0, 2).map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ');
                warnings.push(`Zawiera substancje zapachowe mogące powodować reakcję alergiczną (${sampleAllergens}).`);
            }

            const sanitizedCapsuleWarnings = warnings.map(w => 
                w.replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                 .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*):\s*/i, '$1 – ')
            );

            return {
                detected_risks: detectedRisks,
                warnings: [...new Set(sanitizedCapsuleWarnings)].slice(0, 4)
            };
        }

        // 1. Sprawdzenie alergenów zapachowych (Rozp. 2023/1545)
        const foundAllergens = this.fragranceAllergens.filter(allergen => 
            ingredientsList.some(ing => ing.includes(allergen))
        );
        if (foundAllergens.length > 0) {
            detectedRisks.push('FRAGRANCE_ALLERGENS');
            const sampleAllergens = foundAllergens.slice(0, 3).map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ');
            warnings.push(`Produkt zawiera kompozycję zapachową z potencjalnymi alergenami (${sampleAllergens}). W przypadku wystąpienia podrażnienia lub reakcji uczuleniowej przerwać stosowanie.`);
        }

        // 2. Sprawdzenie retinoidów (Rozp. 2024/996)
        const hasRetinoids = this.retinoids.some(r => cleanInci.includes(r));
        if (hasRetinoids) {
            detectedRisks.push('RETINOIDS');
            warnings.push("Zawiera witaminę A (retinoidy). Przed użyciem należy uwzględnić jej dzienne pobranie z innych źródeł. Nie stosować na uszkodzoną skórę i unikać ekspozycji na słońce.");
        }

        // 3. Sprawdzenie kwasów (AHA / BHA / PHA)
        const hasAcids = this.acids.some(a => cleanInci.includes(a));
        if (hasAcids) {
            detectedRisks.push('PEELING_ACIDS');
            warnings.push("Zawiera hydroksykwasy. Unikać bezpośredniego kontaktu z oczami i błonami śluzowymi. W ciągu dnia zaleca się stosowanie ochrony przeciwsłonecznej (SPF).");
        }

        // 4. Sprawdzenie surfaktantów / produktów myjących
        // Unikamy duplikacji: jeśli to chemia gospodarcza / kapsułki, zwrot P305 w sekcji 6 zastąpi ogólne zdanie
        const hasSurfactants = this.surfactants.some(s => cleanInci.includes(s));
        if (hasSurfactants || cleanInci.includes('soap') || cleanInci.includes('mydło') || cleanInci.includes('szampon')) {
            detectedRisks.push('EYE_IRRITANT_SURFACTANT');
            if (!isChemical && !isLaundryCapsules) {
                warnings.push("W przypadku dostania się produktu do oczu natychmiast przepłukać je obficie czystą, letnią wodą.");
            }
        }

        // 5. Sprawdzenie alkoholi łatwopalnych / rozpuszczalników lotnych (FIZYKOCHEMIA I LOGIKA KATEGORII)
        // Bezwzględny zakaz oznaczania kapsułek do prania, detergentów piorących i produktów wodnych jako łatwopalne
        const isNotFlammableCategory = isLaundryCapsules || isLaundryDetergent || (isWaterBasedCleanser && !/(aerozol|spray|perfum|woda toaletowa|zmywacz)/i.test(prodNameLower));
        
        if (!isNotFlammableCategory) {
            // Weryfikacja czy w składzie występuje realny rozpuszczalnik łatwopalny, a nie polimer PVA czy alkohole tłuszczowe
            const hasFlammableSolvent = this.flammableSolvents.some(solv => {
                return ingredientsList.some(ing => {
                    // Wykluczenie niepalnych alkoholi (np. polyvinyl alcohol, cetearyl alcohol)
                    if (this.nonFlammableAlcohols.some(nonFlam => ing.includes(nonFlam))) return false;
                    return ing === solv || ing.includes(solv);
                });
            });

            if (hasFlammableSolvent) {
                detectedRisks.push('VOLATILE_ALCOHOL');
                warnings.push("Produkt zawiera substancje łatwopalne. Przechowywać z dala od otwartego ognia, iskier i bezpośrednich źródeł ciepła.");
            }
        }

        // 6. Produkty chemii gospodarczej / detergenty (powiązanie z SDS CLP P-phrases)
        if (isChemical) {
            detectedRisks.push('HOUSEHOLD_CHEMICAL');
            if (this.euphracPhrases && this.euphracPhrases.pPhrases) {
                // P102 – Chronić przed dziećmi
                if (this.euphracPhrases.pPhrases['P102']) {
                    const p102Text = String(this.euphracPhrases.pPhrases['P102']).replace(/^[:\s–-]+/, '').trim();
                    warnings.push(`P102 – ${p102Text}`);
                }
                // P305+P351+P338 – W przypadku dostania się do oczu
                if (this.euphracPhrases.pPhrases['P305+P351+P338']) {
                    let p305Text = String(this.euphracPhrases.pPhrases['P305+P351+P338']).replace(/^[:\s–-]+/, '').trim();
                    p305Text = p305Text.replace(/\bDO OCZÓW\b/gi, 'DO OCZU');
                    warnings.push(`P305+P351+P338 – ${p305Text}`);
                }
            } else {
                warnings.push("P102 – Chronić przed dziećmi.");
                warnings.push("W razie połknięcia lub kontaktu z oczami niezwłocznie zasięgnąć porady lekarza i pokazać opakowanie lub etykietę.");
            }
        }

        // 7. Podstawowe zasady ogólne GPSR (External use & storage)
        if (!isChemical && !isLaundryCapsules) {
            warnings.push("Tylko do użytku zewnętrznego. Nie stosować na podrażnioną lub uszkodzoną skórę.");
            warnings.push("Przechowywać w temperaturze pokojowej (15–25°C), w oryginalnym opakowaniu, w miejscu niedostępnym dla małych dzieci.");
        }

        // Standaryzacja językowa i interpunkcyjna: usunięcie form archaicznych oraz ujednolicenie prefiksów zwrotów
        const sanitizedWarnings = warnings.map(w => {
            return w
                .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                .replace(/^(P\d{3}(?:\+P\d{3})*|H\d{3}(?:\+H\d{3})*):\s*/i, '$1 – ');
        });

        // Ograniczamy do max 4 najważniejszych, konkretnych ostrzeżeń (zwięzłość dla konsumenta)
        const dedupedWarnings = [...new Set(sanitizedWarnings)].slice(0, 4);

        return {
            detected_risks: detectedRisks,
            warnings: dedupedWarnings
        };
    }
}

module.exports = new GpsrSafetyService();
