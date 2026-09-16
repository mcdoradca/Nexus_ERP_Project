/**
 * ARCHITEKTURA SDS NEXUS ERP - MODEL OBIEKTOWY DOKUMENTU (AST / IR)
 * Silnie typowana reprezentacja danych karty charakterystyki
 * Zgodność: Rozporządzenie REACH (UE 2020/878 Załącznik II), CLP (WE 1272/2008)
 */

class SubstanceAST {
  constructor(init = {}) {
    this.rawName = init.rawName || "";
    this.namePl = init.namePl || init.rawName || "";
    this.cas = init.cas || null;
    this.ec = init.ec || null;
    this.index = init.index || null;
    this.reach = init.reach || null;
    this.concentration = {
      raw: init.concentration?.raw || "",
      min: typeof init.concentration?.min === 'number' ? init.concentration.min : null,
      max: typeof init.concentration?.max === 'number' ? init.concentration.max : null,
      unit: init.concentration?.unit || "%"
    };
    this.classifications = Array.isArray(init.classifications) ? [...init.classifications] : [];
    this.scl = Array.isArray(init.scl) ? [...init.scl] : [];
    this.ate = Array.isArray(init.ate) ? [...init.ate] : [];
    this.mFactor = init.mFactor || null;
    this.nds = init.nds || null; // { nds, ndsch, ndsp, skora }
    this.ecotox = init.ecotox || null;
  }

  isValid() {
    return Boolean(this.namePl && (this.cas || this.ec || this.index));
  }

  toJSON() {
    return {
      rawName: this.rawName,
      namePl: this.namePl,
      cas: this.cas,
      ec: this.ec,
      index: this.index,
      reach: this.reach,
      concentration: this.concentration,
      classifications: this.classifications,
      scl: this.scl,
      ate: this.ate,
      mFactor: this.mFactor,
      nds: this.nds,
      ecotox: this.ecotox
    };
  }
}

class SDSDocumentAST {
  constructor(init = {}) {
    this.metadata = {
      productName: init.metadata?.productName || "PRODUKT CHEMICZNY",
      tradeCode: init.metadata?.tradeCode || "",
      ufi: init.metadata?.ufi || null,
      compilationDate: init.metadata?.compilationDate || new Date().toLocaleDateString('pl-PL'),
      revisionDate: init.metadata?.revisionDate || "Nie dotyczy",
      version: init.metadata?.version || "1.0 PL",
      replacedRevision: init.metadata?.replacedRevision || "Brak",
      companyConfig: init.metadata?.companyConfig || {}
    };

    this.substances = Array.isArray(init.substances)
      ? init.substances.map(s => s instanceof SubstanceAST ? s : new SubstanceAST(s))
      : [];

    this.ghs = {
      signalWord: init.ghs?.signalWord || "BRAK",
      pictograms: Array.isArray(init.ghs?.pictograms) ? [...init.ghs.pictograms] : [],
      hPhrases: Array.isArray(init.ghs?.hPhrases) ? [...init.ghs.hPhrases] : [],
      pPhrases: Array.isArray(init.ghs?.pPhrases) ? [...init.ghs.pPhrases] : [],
      euhPhrases: Array.isArray(init.ghs?.euhPhrases) ? [...init.ghs.euhPhrases] : []
    };

    this.adr = {
      isRegulated: init.adr?.isRegulated ?? false,
      unNumber: init.adr?.unNumber || null,
      properShippingName: init.adr?.properShippingName || null,
      class: init.adr?.class || null,
      packingGroup: init.adr?.packingGroup || null,
      limitedQuantity: init.adr?.limitedQuantity || null,
      environmentalHazards: init.adr?.environmentalHazards || "NIE"
    };

    this.sections = {};
    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;
      this.sections[key] = {
        title: init.sections?.[key]?.title || "",
        content: init.sections?.[key]?.content || "",
        isComplete: Boolean(init.sections?.[key]?.content)
      };
    }
  }

  addSubstance(substance) {
    if (substance instanceof SubstanceAST) {
      this.substances.push(substance);
    } else {
      this.substances.push(new SubstanceAST(substance));
    }
  }

  setSectionContent(sectionNumber, content, title = "") {
    const key = `section_${sectionNumber}`;
    this.sections[key] = {
      title: title || this.sections[key]?.title || "",
      content: (content || "").trim(),
      isComplete: Boolean(content && content.trim().length > 0)
    };
  }

  getSectionContent(sectionNumber) {
    return this.sections[`section_${sectionNumber}`]?.content || "";
  }
}

module.exports = {
  SubstanceAST,
  SDSDocumentAST
};
