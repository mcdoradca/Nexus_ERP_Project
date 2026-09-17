const fs = require('fs');
const path = require('path');

/**
 * CLPHarmonizedRegistry - Rejestr zharmonizowanych parametrów prawno-chemicznych CLP (Załącznik VI)
 * Zapewnia automatyczne wzbogacanie składników o urzędowe wartości ATE, SCL i M-Factor
 * zgodnie z wymogami Załącznika II do REACH (Rozporządzenie Komisji UE 2020/878 pkt 3.2.2 lit. e).
 */
class CLPHarmonizedRegistry {
  static substancesByCas = new Map();
  static substancesByIndex = new Map();
  static isLoaded = false;

  static loadRegistry(filePath = null) {
    if (this.isLoaded) return;
    const targetPath = filePath || path.join(__dirname, '..', 'rag_knowledge', 'clp_annex_vi_harmonized.json');
    if (!fs.existsSync(targetPath)) {
      console.warn(`[CLPHarmonizedRegistry] Plik bazy nie istnieje: ${targetPath}`);
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      if (Array.isArray(data.substances)) {
        for (const sub of data.substances) {
          if (sub.cas) this.substancesByCas.set(sub.cas.trim(), sub);
          if (sub.index) this.substancesByIndex.set(sub.index.trim(), sub);
        }
      }
      this.isLoaded = true;
    } catch (err) {
      console.error(`[CLPHarmonizedRegistry] Błąd ładowania rejestru CLP: ${err.message}`);
    }
  }

  static getEntry(casOrIndex) {
    if (!casOrIndex) return null;
    const clean = casOrIndex.trim();
    return this.substancesByCas.get(clean) || this.substancesByIndex.get(clean) || null;
  }

  /**
   * Automatycznie uzupełnia i harmonizuje klasyfikację składnika zgodnie z CLP Załącznik VI
   * @param {object} comp Obiekt składnika (name, cas, ec, index, classification)
   * @returns {object} Zaktualizowany składnik ze zharmonizowanymi parametrami
   */
  static enrichComponent(comp) {
    if (!comp) return comp;
    this.loadRegistry();

    let classification = comp.classification || '';

    // 1. Standaryzacja i translacja etykiet CLP
    classification = classification
      .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
      .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
      .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1')
      .replace(/Classification note according to Annex VI to the CLP Regulation:\s*([A-Za-z0-9]+)/gi, 'Uwaga $1 (zgodnie z załącznikiem VI do rozporządzenia CLP)')
      .replace(/Classification note\s*[:\.]?\s*([A-Za-z0-9]+)/gi, 'Uwaga $1')
      .replace(/Substance with a community workplace exposure limit\.?/gi, 'Substancja, dla której określono wspólnotowe najwyższe dopuszczalne stężenia w środowisku pracy.');

    // 2. Automatyczne uzupełnienie brakujących ATE dla substancji z Acute Tox.
    const hasAcuteTox = /(?:Acute Tox\.\s*[1-4]|H30[0-2]|H31[0-2]|H33[0-2])/i.test(classification);
    const hasExistingAte = /ATE\s*\(/i.test(classification);

    const entry = (comp.cas && this.getEntry(comp.cas)) || (comp.index && this.getEntry(comp.index));

    if (hasAcuteTox && entry && entry.ate) {
      const missingAteList = [];
      if (entry.ate.oral && !/ATE\s*\(\s*droga pokarmowa\s*\)/i.test(classification)) {
        missingAteList.push(`ATE (droga pokarmowa) = ${entry.ate.oral}`);
      }
      if (entry.ate.dermal && !/ATE\s*\(\s*na skórę\s*\)/i.test(classification)) {
        missingAteList.push(`ATE (na skórę) = ${entry.ate.dermal}`);
      }
      if (entry.ate.inhalation_mists && !/ATE\s*\(\s*inhalacyjnie[,\s]*pyły\/mgły\s*\)/i.test(classification)) {
        missingAteList.push(`ATE (inhalacyjnie, pyły/mgły) = ${entry.ate.inhalation_mists}`);
      }
      if (entry.ate.inhalation_vapours && !/ATE\s*\(\s*inhalacyjnie[,\s]*pary\s*\)/i.test(classification)) {
        missingAteList.push(`ATE (inhalacyjnie, pary) = ${entry.ate.inhalation_vapours}`);
      }

      if (missingAteList.length > 0) {
        classification = classification.trim() + (classification ? ', ' : '') + missingAteList.join(', ');
      }
    }

    // 3. Uzupełnienie M-Factor jeśli substancja ma w CLP a w tekście brakuje
    if (entry) {
      if (entry.m_acute && !/M\s*\(ostry\)|M-Acute/i.test(classification)) {
        classification += `, M (ostry) = ${entry.m_acute}`;
      }
      if (entry.m_chronic && !/M\s*\(przewlekły\)|M-Chronic/i.test(classification)) {
        classification += `, M (przewlekły) = ${entry.m_chronic}`;
      }
    }

    comp.classification = classification.trim();
    return comp;
  }
}

module.exports = { CLPHarmonizedRegistry };
