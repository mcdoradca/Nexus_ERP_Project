/**
 * ARCHITEKTURA SDS NEXUS ERP - RYGORYSTYCZNY LINTER PRAWNO-CHEMICZNY SANEPID / PIP
 * Niezależna bramka kontrolna weryfikująca zgodność karty z REACH (UE 2020/878) i CLP (WE 1272/2008)
 */

const { CANONICAL_TEST_ORGANISMS } = require('./sds.canonical.clp');

class SDSLinter {
  /**
   * Przeprowadza kompletny audyt zgodności wygenerowanych sekcji SDS
   * @param {Object} sdsData - Obiekt reprezentujący zmontowaną kartę SDS
   * @returns {Object} { isValid: boolean, errors: Array<string>, warnings: Array<string>, fixesApplied: Array<string> }
   */
  static auditAndLint(sdsData) {
    const errors = [];
    const warnings = [];
    const fixesApplied = [];

    const sections = sdsData.sections || {};
    const s1 = typeof sections.section_1 === 'object' ? (sections.section_1.content || "") : (sections.section_1 || "");
    const s2 = typeof sections.section_2 === 'object' ? (sections.section_2.content || "") : (sections.section_2 || "");
    const s3 = typeof sections.section_3 === 'object' ? (sections.section_3.content || "") : (sections.section_3 || "");
    const s8 = typeof sections.section_8 === 'object' ? (sections.section_8.content || "") : (sections.section_8 || "");
    const s9 = typeof sections.section_9 === 'object' ? (sections.section_9.content || "") : (sections.section_9 || "");
    const s11 = typeof sections.section_11 === 'object' ? (sections.section_11.content || "") : (sections.section_11 || "");
    const s12 = typeof sections.section_12 === 'object' ? (sections.section_12.content || "") : (sections.section_12 || "");
    const s14 = typeof sections.section_14 === 'object' ? (sections.section_14.content || "") : (sections.section_14 || "");

    // ------------------------------------------------------------------------
    // REGUŁA 1: ZAKAZ OBCOJĘZYCZNYCH FRAZ W TEKŚCIE (CZYSTOŚĆ JĘZYKOWA RP)
    // ------------------------------------------------------------------------
    const FORBIDDEN_FOREIGN_STRINGS = [
      { regex: /\bNo data available\b/gi, pl: "Brak dostępnych danych" },
      { regex: /\bNot classified\b/gi, pl: "Nie sklasyfikowano" },
      { regex: /\bDoes not meet the criteria for classification\b/gi, pl: "W oparciu o dostępne dane, kryteria klasyfikacji nie są spełnione" },
      { regex: /\bSkin irritation\b/gi, pl: "działanie drażniące na skórę" },
      { regex: /\bEye irritation\b/gi, pl: "działanie drażniące na oczy" },
      { regex: /\bSkin sensitisation\b/gi, pl: "działanie uczulające na skórę" },
      { regex: /\bAspiration hazard\b/gi, pl: "zagrożenie spowodowane aspiracją" },
      { regex: /\bAuto-ignition temperature\b/gi, pl: "Temperatura samozapłonu" },
      { regex: /\bDecomposition temperature\b/gi, pl: "Temperatura rozkładu" },
      { regex: /\bPartition coefficient\b/gi, pl: "Współczynnik podziału" }
    ];

    Object.entries(sections).forEach(([secKey, secVal]) => {
      const content = typeof secVal === 'object' ? (secVal.content || "") : (secVal || "");
      FORBIDDEN_FOREIGN_STRINGS.forEach(rule => {
        if (rule.regex.test(content)) {
          warnings.push(`[${secKey}] Wykryto nieprzetłumaczoną frazę obcojęzyczną pasującą do ${rule.regex}.`);
        }
      });
    });

    // ------------------------------------------------------------------------
    // REGUŁA 2: SEKCJA 9.1 - LOGIKA FIZYKOCHEMICZNA DLA CIECZY (UE 2020/878)
    // ------------------------------------------------------------------------
    const isLiquid = /ciecz|liquid|płyn|liquido/i.test(s9) || /ciecz|płyn/i.test(s2);
    if (isLiquid) {
      // Lepkość cieczy nie może być "nie dotyczy"
      const viscosityMatch = s9.match(/Lepkość(?:\s+kinematyczna|\s+dynamiczna)?\s*[:\.]?\s*([^\n\r]+)/i);
      if (viscosityMatch) {
        const val = viscosityMatch[1].trim();
        if (/nie\s+dotyczy/i.test(val)) {
          errors.push("[Sekcja 9.1] BŁĄD PRAWNY: Lepkość dla produktu płynnego została oznaczona jako 'Nie dotyczy'. Płyn fizycznie zawsze posiada lepkość (wymagane: wartość liczbowa, 'Brak danych' lub 'Nie oznaczono').");
        }
      }

      // Gęstość cieczy nie może być "nie dotyczy"
      const densityMatch = s9.match(/Gęstość(?:\s+lub\s+gęstość\s+względna)?\s*[:\.]?\s*([^\n\r]+)/i);
      if (densityMatch) {
        const val = densityMatch[1].trim();
        if (/nie\s+dotyczy/i.test(val)) {
          errors.push("[Sekcja 9.1] BŁĄD PRAWNY: Gęstość dla produktu płynnego została oznaczona jako 'Nie dotyczy'. Płyn fizycznie zawsze posiada gęstość.");
        }
      }

      // Charakterystyka cząstek dla cieczy powinna być "Nie dotyczy (produkt płynny)"
      const particleMatch = s9.match(/Charakterystyka\s+cząstek\s*[:\.]?\s*([^\n\r]+)/i);
      if (particleMatch) {
        const val = particleMatch[1].trim();
        if (!/nie\s+dotyczy/i.test(val)) {
          warnings.push("[Sekcja 9.1] Charakterystyka cząstek dla cieczy powinna jednoznacznie wskazywać 'Nie dotyczy (produkt płynny)'.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 3: INTEGRALNOŚĆ EKOLOGICZNA I BIOLOGICZNA (ZAKAZ ZAMIANY GATUNKÓW)
    // ------------------------------------------------------------------------
    if (/Pimephales\s+promelas/i.test(s11)) {
      errors.push("[Sekcja 11] BŁĄD TOKSYKOLOGICZNY: Ryba słodkowodna (Pimephales promelas) została umieszczona w sekcji toksykologii ssaków lub przypisana szczurowi.");
    }

    // ------------------------------------------------------------------------
    // REGUŁA 4: POKRYCIE NORM NDS DLA SUBSTANCJI Z SEKCJI 3 (DZ.U. 2018 POZ. 1286)
    // ------------------------------------------------------------------------
    // Jeśli w sekcji 3 występuje metanol (CAS 67-56-1), w sekcji 8 musi być limit NDS
    if (/67-56-1/i.test(s3) || /Metanol|Methanol/i.test(s3)) {
      if (!/67-56-1/i.test(s8) && !/Metanol/i.test(s8)) {
        errors.push("[Sekcja 8.1] BŁĄD SANEPID: Metanol obecny w Sekcji 3 nie posiada przypisanych polskich norm NDS/NDSCh w Sekcji 8.1.");
      }
    }
    // Jeśli w sekcji 3 występuje etanol (CAS 64-17-5), w sekcji 8 musi być limit NDS
    if (/64-17-5/i.test(s3) || /Etanol|Ethanol/i.test(s3)) {
      if (!/64-17-5/i.test(s8) && !/Etanol/i.test(s8)) {
        errors.push("[Sekcja 8.1] BŁĄD SANEPID: Etanol obecny w Sekcji 3 nie posiada przypisanych polskich norm NDS w Sekcji 8.1.");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 5: SEKCJA 14.6 - ILOŚCI OGRANICZONE (LQ) BEZ OSIEROCOŃ
    // ------------------------------------------------------------------------
    if (/Ilości\s+ograniczone\s*\(LQ\)[^\n]*\b(\d+)\s*\n\s*(L|lt|kg|ml)\b/i.test(s14)) {
      errors.push("[Sekcja 14.6] BŁĄD TYPOGRAFICZNY: Wykryto osieroconą jednostkę ilości ograniczonej (LQ) pod wartością liczbową.");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fixesApplied
    };
  }
}

module.exports = {
  SDSLinter
};
