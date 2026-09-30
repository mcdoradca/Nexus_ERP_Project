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

        // Alkohole lotne / łatwopalne
        this.volatileAlcohols = ['alcohol denat.', 'isopropyl alcohol', 'alcohol', 'ethanol'];
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

        if (!inci || typeof inci !== 'string' || inci.trim().length === 0) {
            // Domyślne ostrzeżenie ogólne dla produktów bez podanego składu
            warnings.push("Produkt przeznaczony wyłącznie do użytku zewnętrznego zgodnie z przeznaczeniem.");
            warnings.push("Przechowywać w suchym miejscu, w temperaturze pokojowej, z dala od dzieci.");
            return { detected_risks: ['GENERAL_FALLBACK'], warnings };
        }

        const cleanInci = inci.toLowerCase();
        const ingredientsList = cleanInci.split(/[,;\n]+/).map(i => i.trim()).filter(Boolean);

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
        const hasSurfactants = this.surfactants.some(s => cleanInci.includes(s));
        if (hasSurfactants || cleanInci.includes('soap') || cleanInci.includes('mydło') || cleanInci.includes('szampon')) {
            detectedRisks.push('EYE_IRRITANT_SURFACTANT');
            warnings.push("W przypadku dostania się produktu do oczu natychmiast przepłukać je obficie czystą, letnią wodą.");
        }

        // 5. Sprawdzenie alkoholi łatwopalnych / lotnych
        const hasVolatileAlcohol = this.volatileAlcohols.some(alc => cleanInci.includes(alc));
        if (hasVolatileAlcohol) {
            detectedRisks.push('VOLATILE_ALCOHOL');
            warnings.push("Produkt zawiera alkohol. Przechowywać z dala od otwartego ognia i bezpośrednich źródeł ciepła.");
        }

        // 6. Produkty chemii gospodarczej / detergenty (powiązanie z SDS CLP P-phrases)
        if (isChemical) {
            detectedRisks.push('HOUSEHOLD_CHEMICAL');
            if (this.euphracPhrases && this.euphracPhrases.pPhrases) {
                // P102: Chronić przed dziećmi
                if (this.euphracPhrases.pPhrases['P102']) {
                    warnings.push(`P102: ${this.euphracPhrases.pPhrases['P102']}`);
                }
                // P305+P351+P338: W przypadku dostania się do oczu
                if (this.euphracPhrases.pPhrases['P305+P351+P338']) {
                    warnings.push(`P305+P351+P338: ${this.euphracPhrases.pPhrases['P305+P351+P338']}`);
                }
            } else {
                warnings.push("P102: Chronić przed dziećmi.");
                warnings.push("W razie połknięcia lub kontaktu z oczami niezwłocznie zasięgnąć porady lekarza i pokazać opakowanie lub etykietę.");
            }
        }

        // 7. Podstawowe zasady ogólne GPSR (External use & storage)
        if (!isChemical) {
            warnings.push("Tylko do użytku zewnętrznego. Nie stosować na podrażnioną lub uszkodzoną skórę.");
            warnings.push("Przechowywać w temperaturze pokojowej (15–25°C), w oryginalnym opakowaniu, w miejscu niedostępnym dla małych dzieci.");
        }

        // Ograniczamy do max 4 najważniejszych, konkretnych ostrzeżeń (zwięzłość dla konsumenta)
        const dedupedWarnings = [...new Set(warnings)].slice(0, 4);

        return {
            detected_risks: detectedRisks,
            warnings: dedupedWarnings
        };
    }
}

module.exports = new GpsrSafetyService();
