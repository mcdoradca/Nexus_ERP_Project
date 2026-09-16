/**
 * ARCHITEKTURA SDS NEXUS ERP - PARSER TABEL I SKŁADNIKÓW CHEMICZNYCH (SEKCJA 3)
 * Odporny na wielostronicowe podziały PDF, artefakty nagłówkowe oraz specyfikację CLP Annex VI (w tym indeksy z literą X)
 */

const { SubstanceAST } = require('./sds.ast');
const { CANONICAL_CLP_CLASSES } = require('./sds.canonical.clp');

class SDSTableParser {
  /**
   * Oczyszcza surowy tekst sekcji 3 z powtarzających się nagłówków i stopek PDF
   */
  static cleanPdfArtifacts(text) {
    if (!text) return "";
    return text
      // Usunięcie nagłówków z datami, wersjami i nazwami firm
      .replace(/Dated\s+[0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4}[^\n]*/gi, '')
      .replace(/Printed\s+on\s+[^\n]*/gi, '')
      .replace(/Suarez\s+Company\s+S\.?r\.?l\.?[^\n]*/gi, '')
      .replace(/Page\s+n\.?\s*\d+\s*(?:of|\/)\s*\d+[^\n]*/gi, '')
      .replace(/Strona\s+\d+\s*(?:z|\/)\s*\d+[^\n]*/gi, '')
      .replace(/Pagina\s+\d+\s*(?:di|\/)\s*\d+[^\n]*/gi, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  /**
   * Normalizuje numery identyfikacyjne CAS, EC i INDEX
   */
  static normalizeIdentifiers(rawBlock) {
    // CAS: 2-7 cyfr, myślnik, 2 cyfry, myślnik, 1 cyfra
    const casMatch = rawBlock.match(/\b(?:CAS|C\.A\.S\.?)?\s*[:\.]?\s*(\d{2,7}-\d{2}-\d)\b/i);
    // EC / WE: 3 cyfry, myślnik, 3 cyfry, myślnik, 1 cyfra
    const ecMatch = rawBlock.match(/\b(?:EC|WE|EINECS|CE)\s*[:\.]?\s*(\d{3}-\d{3}-\d)\b/i);
    // INDEX wg CLP Załącznik VI: 3 cyfry, 3 cyfry, 2 cyfry, 1 cyfra lub litera X (modulo 11)
    const indexMatch = rawBlock.match(/\b(?:INDEX|Indeks|No\.?\s*Index)\s*[:\.]?\s*(\d{3}-\d{3}-\d{2}-[\dXx])\b/i);
    // REACH: 01-21... lub 01-00...
    const reachMatch = rawBlock.match(/\b(?:REACH\s*(?:Reg\.?|Nr\.?|No\.?)?[:\.]?\s*)?(01-\d{9,10}-\d{2}(?:-\w+)?)\b/i);

    return {
      cas: casMatch ? casMatch[1].trim() : null,
      ec: ecMatch ? ecMatch[1].trim() : null,
      index: indexMatch ? indexMatch[1].trim() : null,
      reach: reachMatch ? reachMatch[1].trim() : null
    };
  }

  /**
   * Ekstrahuje stężenie i zakresy procentowe
   */
  static extractConcentration(rawBlock) {
    const concMatch = rawBlock.match(/([0-9]+(?:[.,][0-9]+)?\s*(?:<=?|<)\s*x\s*(?:<=?|<)\s*[0-9]+(?:[.,][0-9]+)?\s*%|x\s*>=\s*[0-9]+(?:[.,][0-9]+)?\s*%|[0-9]+(?:[.,][0-9]+)?\s*-\s*[0-9]+(?:[.,][0-9]+)?\s*%|[0-9]+(?:[.,][0-9]+)?\s*-\s*<[0-9]+(?:[.,][0-9]+)?\s*%|[0-9]+(?:[.,][0-9]+)?\s*%\s*(?:<=?|<)\s*x\s*(?:<=?|<)\s*[0-9]+(?:[.,][0-9]+)?\s*%)/i);
    if (!concMatch) {
      const singleMatch = rawBlock.match(/([0-9]+(?:[.,][0-9]+)?\s*%)/);
      return {
        raw: singleMatch ? singleMatch[1].trim() : "",
        min: null,
        max: null,
        unit: "%"
      };
    }
    const raw = concMatch[1].trim();
    return {
      raw,
      min: null,
      max: null,
      unit: "%"
    };
  }

  /**
   * Ekstrahuje wartości ATE (Ostra Toksyczność Szacunkowa)
   * Zabezpieczone granicami słów \bATE\b, aby nie łapać końcówek nazw substancji (-ate)
   */
  static extractAte(rawBlock) {
    const ateList = [];
    // Wzorzec 1: ATE oral / dermal / inhalation
    const regex1 = /\bATE\s*(?:\([^)]*\)|Inhalation\s*vapours|droga\s*pokarmowa|na\s*skórę|inhalacyjnie)?\s*[:=]\s*(\d+(?:[.,]\d+)?\s*(?:mg\/kg|mg\/l|\b))/gi;
    let match;
    while ((match = regex1.exec(rawBlock)) !== null) {
      let rawVal = match[0].trim();
      // Normalizacja do polskiej terminologii urzędowej
      rawVal = rawVal
        .replace(/Inhalation\s*vapours:\s*(\d+)/i, 'ATE (inhalacyjnie, pary) = $1 mg/l')
        .replace(/Inhalation:\s*(\d+)/i, 'ATE (inhalacyjnie) = $1 mg/l')
        .replace(/Oral:\s*(\d+)/i, 'ATE (droga pokarmowa) = $1 mg/kg')
        .replace(/Dermal:\s*(\d+)/i, 'ATE (na skórę) = $1 mg/kg');
      if (!ateList.includes(rawVal)) {
        ateList.push(rawVal);
      }
    }
    return ateList;
  }
}

module.exports = {
  SDSTableParser
};
