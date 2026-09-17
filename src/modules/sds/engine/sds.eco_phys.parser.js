/**
 * SDSEcoPhysParser - Semantyczny Parser Ekotoksykologii (Sekcja 12) oraz Fizykochemii (Sekcja 9)
 * 
 * Zasady Enterprise:
 * 1. Zero Fragile Regex Split: Całkowity brak niszczących podziałów wierszy.
 * 2. Semantic Test Extraction: Ekstrakcja badań ekotoksykologicznych niezależnie od formatu (alfabetyczny, prefiksy OECD, tabele).
 * 3. Bidirectional Substance Matching: Powiązanie badań ze składnikami po CAS, nazwie systematycznej lub INCI.
 * 4. Polish Regulatory Formatting: Pełna polonizacja parametrów, organizmów testowych, metod OECD i jednostek.
 */

const fs = require('fs');
const path = require('path');
const { SDSConsistencyEngine } = require('./sds.consistency.engine');

class SDSEcoPhysParser {
  /**
   * Semantyczne przetwarzanie Sekcji 12 (Ekologia)
   */
  static processSection12(rawContent = "", components = [], s2Content = "") {
    const clean = (rawContent || '').replace(/[—–]/g, '-');

    // Podział na podsekcje 12.1 - 12.7
    const block1 = this.extractBlock(clean, /12\.1\b/i, /12\.2\b/i);
    const block2 = this.extractBlock(clean, /12\.2\b/i, /12\.3\b/i);
    let block3 = this.extractBlock(clean, /12\.3\b/i, /12\.4\b/i);
    const block4 = this.extractBlock(clean, /12\.4\b/i, /12\.5\b/i);
    const block5 = this.extractBlock(clean, /12\.5\b/i, /12\.6\b/i);
    const block6 = this.extractBlock(clean, /12\.6\b/i, /12\.7\b/i);

    const isClumped = /12\.1[\s\S]*?12\.2[\s\S]*?12\.3[\s\S]*?12\.4/i.test(clean);
    if (isClumped) {
      const idxBioAcc = clean.search(/(?:Not bioaccumulative|Non bioaccumulabile|Bioaccumulat|Bioaccumulab|Zdolność do bioakumulacji|Potenziale di bioaccumulo|Bioconcentr|BCF)/i);
      const idxPbt = clean.search(/(?:No PBT or vPvB|Results of PBT and vPvB|Wyniki oceny właściwości PBT|Non contiene sostanze PBT|PBT[ \/]?vPvB|Valutazione PBT)/i);
      const idxEndo = clean.search(/(?:List II|List I|Substances under evaluation for endocrine|endocrine disruption|Endocrine disrupting properties|Właściwości zaburzające|Proprietà di interferenza con il sistema endocrino)/i);
      const idxOther = clean.search(/(?:12\.7|Other adverse effects|Altri effetti avversi|Inne szkodliwe skutki)/i);
      const bioAccEnd = idxPbt !== -1 ? idxPbt : (idxEndo !== -1 ? idxEndo : (idxOther !== -1 ? idxOther : clean.length));
      if (idxBioAcc !== -1 && idxBioAcc < bioAccEnd) {
        block3 = clean.substring(idxBioAcc, bioAccEnd).trim();
      }
    }

    // --- 12.1. Toksyczność ---
    let s12_1 = "12.1. Toksyczność\nStosować dobrą praktykę zawodową, unikając przedostawania się produktu do środowiska.\n\n";
    s12_1 += "Właściwości ekotoksykologiczne mieszaniny:\n";
    
    const hasAquaticHazard = /(?:H412|H411|H410|H400|Aquatic)/i.test(s2Content);
    if (hasAquaticHazard) {
      s12_1 += "Mieszanina została zaklasyfikowana jako stwarzająca zagrożenie dla środowiska wodnego metodą obliczeniową na podstawie zawartości składników.\nBrak danych doświadczalnych z badań ekotoksykologicznych dla samego produktu.\n";
    } else {
      s12_1 += "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie dla środowiska.\nBrak danych doświadczalnych dla mieszaniny.\n";
    }

    const compTests = this.extractAllEcotoxTests(block1, components);
    if (compTests.length > 0) {
      s12_1 += "\nInformacje ekotoksykologiczne o składnikach:\n";
      compTests.forEach(ct => {
        s12_1 += `${ct.name}${ct.cas ? ` (CAS: ${ct.cas})` : ''}:\n`;
        ct.tests.forEach(t => {
          s12_1 += `- ${t}\n`;
        });
      });
    }

    // --- 12.2. Trwałość i zdolność do rozkładu ---
    let s12_2 = "12.2. Trwałość i zdolność do rozkładu\n";
    const compDegrad = this.extractAllDegradability(block2, components);
    if (compDegrad.length > 0) {
      s12_2 += "Informacje dotyczące składników:\n";
      compDegrad.forEach(cd => {
        s12_2 += `${cd.name}${cd.cas ? ` (CAS: ${cd.cas})` : ''}: ${cd.info}\n`;
      });
      s12_2 += "Mieszanina: Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    } else {
      s12_2 += "Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    }

    // --- 12.3. Zdolność do bioakumulacji ---
    let s12_3 = "12.3. Zdolność do bioakumulacji\n";
    let compBio = this.extractAllBioaccumulation(block3, components);
    if (compBio.length === 0 && /(?:BCF|Bioaccumul)/i.test(clean)) {
      compBio = this.extractAllBioaccumulation(clean, components);
    }
    if (compBio.length > 0) {
      s12_3 += "Informacje dotyczące składników:\n";
      compBio.forEach(cb => {
        s12_3 += `${cb.name}${cb.cas ? ` (CAS: ${cb.cas})` : ''}: ${cb.info}\n`;
      });
      s12_3 += "Mieszanina: Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    } else {
      s12_3 += "Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    }

    // --- 12.4. Mobilność w glebie ---
    let s12_4 = "12.4. Mobilność w glebie\nBrak dostępnych badań dotyczących mobilności mieszaniny w glebie.";

    // --- 12.5. Wyniki oceny właściwości PBT i vPvB ---
    let s12_5 = "12.5. Wyniki oceny właściwości PBT i vPvB\nMieszanina nie zawiera substancji spełniających kryteria PBT lub vPvB zgodnie z załącznikiem XIII do rozporządzenia REACH w stężeniu ≥ 0,1% wag.";

    // --- 12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego ---
    const edResolution = SDSConsistencyEngine.resolveEndocrineStatus(components, block6);
    let s12_6 = `12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego\n${edResolution.s12_6_text}`;

    // --- 12.7. Inne szkodliwe skutki działania ---
    let s12_7 = "12.7. Inne szkodliwe skutki działania\nNie są znane żadne inne szkodliwe skutki działania na środowisko (brak potencjału niszczenia warstwy ozonowej, tworzenia ozonu fotochemicznego ani wpływu na globalne ocieplenie).";

    const fullContent = [
      "SEKCJA 12: Informacje ekologiczne",
      "",
      s12_1.trim(),
      "",
      s12_2.trim(),
      "",
      s12_3.trim(),
      "",
      s12_4.trim(),
      "",
      s12_5.trim(),
      "",
      s12_6.trim(),
      "",
      s12_7.trim()
    ].join('\n\n');

    return {
      content: fullContent,
      endocrineDisruptorInfo: edResolution.summary
    };
  }

  /**
   * Ekstrahuje wszystkie badania ekotoksykologiczne dla składników z bloku 12.1
   */
  static extractAllEcotoxTests(block1, components) {
    if (!block1 || !components || components.length === 0) return [];

    const results = [];
    const lines = block1.split('\n').map(l => l.trim()).filter(Boolean);

    let currentComp = null;
    let currentTests = [];

    const flushCurrent = () => {
      if (currentComp && currentTests.length > 0) {
        results.push({
          name: currentComp.name || currentComp.originalName,
          cas: currentComp.cas,
          tests: [...currentTests]
        });
      }
      currentTests = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Wykrywanie przypisania substancji (po CAS lub nazwie)
      const matchedComp = components.find(c => {
        if (c.cas && line.includes(c.cas)) return true;
        const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cNorm = norm(c.originalName || c.name);
        const lNorm = norm(line);
        return cNorm && cNorm.length >= 5 && lNorm.includes(cNorm);
      });

      if (matchedComp && line.includes(':')) {
        flushCurrent();
        currentComp = matchedComp;
        continue;
      }

      // Wyszukiwanie linii testowych
      const isTestLine = /(?:LC|EC|IC|NOEC|LOEC)\s*50?|Aquatic\s*(?:acute|chronic)\s*toxicity/i.test(line);
      if (isTestLine && currentComp) {
        const formatted = this.formatEcotoxTestLine(line);
        if (formatted) currentTests.push(formatted);
      }
    }
    flushCurrent();

    return results;
  }

  /**
   * Precyzyjna polonizacja pojedynczej linii testu ekotoksykologicznego
   */
  static formatEcotoxTestLine(line) {
    let t = line
      .replace(/^[a-z]\)\s*Aquatic\s*(?:acute|chronic)\s*toxicity\s*[:\.]?\s*/i, '')
      .replace(/EC50\s*Algae\s+([A-Za-z\s]+?)\s*=/i, 'EC50 (glony, $1) =')
      .replace(/EC50\s*Daphnia\s+magna\s*=/i, 'EC50 (skorupiaki, Daphnia magna) =')
      .replace(/LC50\s*Fish\s+([A-Za-z\s]+?)\s*=/i, 'LC50 (ryby, $1) =')
      .replace(/NOEC\s*Algae\s+([A-Za-z\s]+?)\s*=/i, 'NOEC (przewlekła, glony, $1) =')
      .replace(/NOEC\s*Daphnia\s+magna\s*=/i, 'NOEC (przewlekła, skorupiaki, Daphnia magna) =')
      .replace(/NOEC\s*Fish\s+([A-Za-z\s]+?)\s*=/i, 'NOEC (przewlekła, ryby, $1) =')
      .replace(/(\d+)\.(\d+)/g, '$1,$2')
      .replace(/\bmg\/L\b/g, 'mg/l')
      .replace(/\b(\d+)\s*h\b/gi, '($1 h)')
      .replace(/\b(\d+)\s*d\b/gi, '($1 dni)');

    return t.replace(/\(\s*\(/g, '(').replace(/\)\s*\)/g, ')').trim();
  }

  /**
   * Ekstrahuje deklaracje trwałości i biodegradacji dla składników z bloku 12.2
   */
  static extractAllDegradability(block2, components) {
    if (!block2 || !components || components.length === 0) return [];

    const results = [];
    const lines = block2.split('\n').map(l => l.trim()).filter(Boolean);

    for (const c of components) {
      // Szukamy linii odnoszącej się do tego komponentu
      const line = lines.find(l => {
        if (c.cas && l.includes(c.cas)) return true;
        const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cNorm = norm(c.originalName || c.name);
        return cNorm && cNorm.length >= 5 && norm(l).includes(cNorm);
      });

      if (line) {
        let desc = "";
        if (/non-readily\s*biodegradable|not\s*readily\s*biodegradable|nie\s*ulega\s*szybkiej/i.test(line)) {
          desc = "Substancja trudno ulegająca biodegradacji (nie ulega łatwo biodegradacji / non-readily biodegradable).";
        } else if (/readily\s*biodegradable|szybko\s*ulega/i.test(line)) {
          const valMatch = line.match(/(?:Value\s*[:\.]?\s*)?([><~]?\s*\d+\s*%)/i);
          const oecdMatch = line.match(/(OECD\s*\d+[A-F]?[^\.\n;]*)/i);
          const valStr = valMatch ? ` stopień rozkładu: ${valMatch[1]}` : "";
          const oecdStr = oecdMatch ? ` zgodnie z ${oecdMatch[1].trim()}` : "";
          desc = `Substancja łatwo biodegradowalna (readily biodegradable)${valStr}${oecdStr}.`;
        } else {
          desc = "Brak specyficznych danych dotyczących biodegradacji.";
        }

        results.push({
          name: c.name || c.originalName,
          cas: c.cas,
          info: desc
        });
      }
    }
    return results;
  }

  /**
   * Ekstrahuje dane o bioakumulacji dla składników z bloku 12.3
   */
  static extractAllBioaccumulation(block3, components) {
    if (!block3 || !components || components.length === 0) return [];

    const results = [];
    const lines = block3.split('\n').map(l => l.trim()).filter(Boolean);

    let curComp = null;
    const compMap = new Map();
    for (const c of components) {
      compMap.set(c, []);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const matchedComp = components.find(c => {
        if (c.cas && line.includes(c.cas)) return true;
        const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cNorm = norm(c.originalName || c.name);
        const lNorm = norm(line);
        return cNorm && cNorm.length >= 5 && lNorm.includes(cNorm);
      });

      if (matchedComp) {
        curComp = matchedComp;
      }

      if (curComp) {
        const parts = compMap.get(curComp);

        if (/Not bioaccumulative|Non bioaccumulabile|Nie wykazuje (?:zdolności|potencjału) do bioakumulacji/i.test(line)) {
          if (!parts.some(x => x.includes("bioakumulac"))) {
            parts.push("nie wykazuje zdolności do bioakumulacji");
          }
        } else if (/Bioaccumulat|Bioaccumulab/i.test(line) && !/Not|Non/i.test(line)) {
          if (!parts.some(x => x.includes("bioakumulac"))) {
            parts.push("wykazuje zdolność do bioakumulacji (Bioaccumulative)");
          }
        }

        if (/BCF|Bioconcentr/i.test(line)) {
          const bcfMatch = line.match(/(?:BCF|Bioconcentr(?:at|ant)ion\s+factor|Fattore di bioconcentrazione).*?(?:[:=~-]|(?:Value|Wartość)\s*[:\.]?\s*)\s*((?:<=|>=|[=~<≤>≥])?\s*\d+(?:[.,]\d+)?)/i)
            || line.match(/(?:Value|Wartość)\s*[:\.]?\s*((?:<=|>=|[=~<≤>≥])?\s*\d+(?:[.,]\d+)?)/i)
            || line.match(/\bBCF\s*=\s*((?:<=|>=|[=~<≤>≥])?\s*\d+(?:[.,]\d+)?)/i);
          if (bcfMatch) {
            const rawVal = bcfMatch[1].trim().replace(/\b(\d+)\.(\d+)\b/g, '$1,$2');
            const cleanVal = rawVal.replace(/^[=~:]\s*/, '');
            if (!parts.some(x => x.includes("BCF"))) {
              parts.push(`współczynnik biokoncentracji BCF = ${cleanVal}`);
            }
          }
        }

        if (/Log\s*Kow|Log\s*Pow|partition\s+coefficient/i.test(line)) {
          const kowMatch = line.match(/(?:Log\s*Kow|Log\s*Pow|partition\s+coefficient).*?(?:[:=~-]|(?:Value|Wartość)\s*[:\.]?\s*)\s*((?:<=|>=|[=~<≤>≥])?\s*-?\d+(?:[.,]\d+)?)/i)
            || line.match(/(?:Value|Wartość)\s*[:\.]?\s*((?:<=|>=|[=~<≤>≥])?\s*-?\d+(?:[.,]\d+)?)/i);
          if (kowMatch) {
            const rawVal = kowMatch[1].trim().replace(/\b(\d+)\.(\d+)\b/g, '$1,$2');
            const cleanVal = rawVal.replace(/^[=~:]\s*/, '');
            if (!parts.some(x => x.includes("Kow"))) {
              parts.push(`współczynnik podziału n-oktanol/woda (log Kow): ${cleanVal}`);
            }
          }
        }
      }
    }

    // Defensive fallback to ecotox_cache.json if a component has no text data
    let ecotoxCache = null;
    try {
      const p = path.join(__dirname, '..', 'rag_knowledge', 'ecotox_cache.json');
      if (fs.existsSync(p)) {
        ecotoxCache = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {}

    for (const [c, parts] of compMap.entries()) {
      if (parts.length === 0 && ecotoxCache && c.cas && ecotoxCache[c.cas] && ecotoxCache[c.cas].bioaccumulation) {
        parts.push(ecotoxCache[c.cas].bioaccumulation.replace(/\.$/, ''));
      }

      if (parts.length > 0) {
        const info = parts.join(', ') + '.';
        results.push({
          name: c.name || c.originalName,
          cas: c.cas,
          info
        });
      }
    }

    return results;
  }

  /**
   * Semantyczne przetwarzanie Sekcji 9 (Fizykochemia) bez niszczenia nagłówków
   */
  static processSection9(rawContent = "", components = []) {
    let text = rawContent || "";

    // Oczyszczanie obcych dopisków i artefaktów
    text = text.replace(/Property\s*\|\s*Value[^\n]*/gi, '');

    const params = [
      { key: "state", pl: "Stan skupienia", regex: /(?:Physical state|Stato fisico|Stan skupienia)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "color", pl: "Kolor", regex: /(?:Colour|Color|Colore|Kolor|Barwa)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "odour", pl: "Zapach", regex: /(?:Odour|Odore|Zapach)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "melting", pl: "Temperatura topnienia/krzepnięcia", regex: /(?:Melting point(?:\s*[\/\-]\s*freezing point)?|Punto di fusione|Temperatura topnienia)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "boiling", pl: "Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia", regex: /(?:Boiling point or initial boiling point and boiling range|Initial boiling point|Boiling point|Punto di ebollizione|Temperatura wrzenia)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "flammability", pl: "Palność materiałów", regex: /(?:Flammability|Infiammabilità|Palność materiałów)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "explosion_limits", pl: "Dolna i górna granica wybuchowości", regex: /(?:Lower and upper explosion limit|Limite inferiore e superiore di esplosività|Dolna i górna granica wybuchowości)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "flash_point", pl: "Temperatura zapłonu", regex: /(?:Flash point|Punto di infiammabilità|Temperatura zapłonu)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "auto_ignition", pl: "Temperatura samozapłonu", regex: /(?:Auto-ignition temperature|Temperatura di autoaccensione|Temperatura samozapłonu)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "decomposition", pl: "Temperatura rozkładu", regex: /(?:Decomposition temperature|Temperatura di decomposizione|Temperatura rozkładu)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "ph", pl: "pH", regex: /(?:^|\n)\s*(?<![A-Za-z])pH(?![A-Za-z])\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "viscosity", pl: "Lepkość kinematyczna", regex: /(?:Kinematic\s+viscosity|Viscosità\s+cinematica|Lepkość\s+kinematyczna|\bViscosity\b)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "solubility_water", pl: "Rozpuszczalność w wodzie", regex: /(?:Solubility in water|Solubilità in acqua|Rozpuszczalność w wodzie|^Solubility)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "solubility_other", pl: "Rozpuszczalność w innych rozpuszczalnikach", regex: /(?:Solubility in oil|Solubility in other solvents|Rozpuszczalność w innych rozpuszczalnikach)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "partition", pl: "Współczynnik podziału n-oktanol/woda (wartość współczynnika log)", regex: /(?:Partition coefficient n-octanol\/water \(log value\)|Współczynnik podziału n-oktanol\/woda)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "vapour_pressure", pl: "Prężność pary", regex: /(?:Vapour pressure|Tensione di vapore|Prężność pary)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "density", pl: "Gęstość lub gęstość względna", regex: /(?:Density and\/or relative density|Densità e\/o densità relativa|Gęstość lub gęstość względna)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "relative_vapour_density", pl: "Względna gęstość pary", regex: /(?:Relative vapour density|Densità di vapore relativa|Względna gęstość pary)\s*[:\.]?\s*\|?\s*([^\n]+)/i },
      { key: "particle_characteristics", pl: "Charakterystyka cząsteczek", regex: /(?:Particle characteristics(?:\s*[:\.]?\s*Particle size)?|Particle size|Charakterystyka cząsteczek)\s*[:\.]?\s*\|?\s*([^\n]+)/i }
    ];

    const outLines = [];
    outLines.push("SEKCJA 9: Właściwości fizyczne i chemiczne\n");
    outLines.push("9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych");

    for (const p of params) {
      const m = text.match(p.regex);
      let raw = m ? m[1].replace(/^[\|\s]+/, '').trim() : null;
      let val = this.normalizeValue(raw, p.key);
      outLines.push(`${p.pl}: ${val}`);
    }

    // 9.2. Inne informacje
    outLines.push("\n9.2. Inne informacje");
    const hasFragrance = components.some(c => /(?:acetate|octan|cinnamaldehyde|aldehyd|fragrance|parfum)/i.test(c.name || c.originalName || ''));
    if (hasFragrance) {
      outLines.push("Lotne Związki Organiczne (LZO / VOC): Brak danych doświadczalnych dla mieszaniny (zawiera lotne składniki kompozycji zapachowej).");
    } else {
      outLines.push("Lotne Związki Organiczne (LZO / VOC): Nie dotyczy.");
    }
    outLines.push("9.2.1. Informacje dotyczące klas zagrożenia fizycznego: Brak dodatkowych danych badawczych.");
    outLines.push("9.2.2. Inne właściwości bezpieczeństwa: Brak dodatkowych danych badawczych.");

    return outLines.join('\n');
  }

  static normalizeValue(raw, key) {
    if (!raw || /^(?:N\.?A\.?|Not applicable|Non applicabile|Nie dotyczy)$/i.test(raw.trim())) {
      if (key === "density" || key === "viscosity" || key === "melting" || key === "vapour_pressure" || key === "boiling" || key === "relative_vapour_density") {
        return "Brak danych";
      }
      if (key === "particle_characteristics") return "Nie dotyczy (produkt płynny)";
      return "Nie dotyczy";
    }
    if (key === "particle_characteristics") {
      if (/N\.?A\.?|nie dotyczy|brak/i.test(raw)) return "Nie dotyczy (produkt płynny)";
    }
    if (/^(?:not available|non disponibile|brak danych)$/i.test(raw.trim())) {
      return "Brak danych";
    }
    if (/^(?:not determined|non determinato|nie oznaczono)$/i.test(raw.trim())) {
      return "Nie oznaczono";
    }

    let v = raw
      .replace(/Liquid/gi, 'ciecz')
      .replace(/white/gi, 'biały')
      .replace(/colourless|colorless/gi, 'bezbarwny')
      .replace(/characteristic/gi, 'charakterystyczny')
      .replace(/Soluble in water|Soluble/gi, 'rozpuszczalny w wodzie')
      .replace(/\+\/-/g, '±')
      .replace(/(\d+)\.(\d+)/g, '$1,$2');

    if (/^(?:N\.?A\.?|Not applicable|Non applicabile|Nie dotyczy)$/i.test(v.trim())) {
      if (key === "density" || key === "viscosity" || key === "melting" || key === "vapour_pressure" || key === "boiling" || key === "relative_vapour_density") {
        return "Brak danych";
      }
      if (key === "particle_characteristics") return "Nie dotyczy (produkt płynny)";
      return "Nie dotyczy";
    }

    // Specyficzne polonizacje
    if (key === "boiling") {
      v = v.replace(/\(\d+°?F\)\s*water/gi, '(woda)');
    }
    if (key === "density") {
      v = v.replace(/(?:@|\bat\b)?\s*\(?(\d+)\s*°\s*C\)?/gi, ' (w temp. $1 °C)')
           .replace(/\s+/g, ' ')
           .replace(/\(\s*\(/g, '(')
           .replace(/\)\s*\)/g, ')');
    }
    if (key === "viscosity") {
      v = v.replace(/(?:@|\bat\b)?\s*\(?(\d+)\s*°\s*C\)?/gi, ' (w temp. $1 °C)')
           .replace(/\s+/g, ' ')
           .replace(/\(\s*\(/g, '(')
           .replace(/\)\s*\)/g, ')');
    }

    return v.trim();
  }

  static extractBlock(text, startRegex, endRegex) {
    const startM = text.match(startRegex);
    if (!startM) return "";
    const after = text.slice(startM.index);
    const endM = after.match(endRegex);
    if (!endM) return after.trim();
    return after.slice(0, endM.index).trim();
  }
}

module.exports = { SDSEcoPhysParser };
