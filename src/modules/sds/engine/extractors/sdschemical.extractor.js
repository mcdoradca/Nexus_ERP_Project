// Auto-extracted module: SDSChemicalExtractor
const fs = require('fs');
const path = require('path');

class SDSChemicalExtractor {
  static extractUnique(text, regex) {
    const matches = (text || "").match(regex) || [];
    return Array.from(new Set(matches.map(m => m.trim().toUpperCase())));
  }

  static isValidCas(casStr) {
    const parts = casStr.split('-');
    if (parts.length !== 3) return false;
    const checkDigit = parseInt(parts[2], 10);
    const base = (parts[0] + parts[1]).split('').reverse();
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (i + 1);
    }
    return (sum % 10) === checkDigit;
  }

  static extractCas(text) {
    const matches = this.extractUnique(text, /(?<![\d-])[1-9]\d{1,6}-\d{2}-\d(?![\d-])/g);
    return matches.filter(cas => this.isValidCas(cas));
  }
  static extractEc(text) { return this.extractUnique(text, /\b\d{3}-\d{3}-\d\b/g); }
  static extractUfi(text) { return this.extractUnique(text, /\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi)[0] || null; }
  static extractHCodes(text) { 
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(H\d{3}(?:[A-Za-z]{1,2}\b)?(?:\s*\+\s*H\d{3}(?:[A-Za-z]{1,2}\b)?)*)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => {
      if (OFFICIAL_CLP_H_PHRASES[m]) return m;
      const upper = m.toUpperCase();
      if (OFFICIAL_CLP_H_PHRASES[upper]) return upper;
      for (const k of Object.keys(OFFICIAL_CLP_H_PHRASES)) {
        if (k.toLowerCase() === m.toLowerCase()) return k;
      }
      return upper;
    })));
  }

  static extractPCodes(text) { 
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(P\d{3}(?:\s*\+\s*P\d{3})*)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => m.toUpperCase())));
  }

  static extractEuhCodes(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(EUH\d{3}(?:[A-Z](?![a-z]))?)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => m.toUpperCase())));
  }

  static extractGhsCodes(text) { return this.extractUnique(text, /\b(?:GHS0[1-9]|GHS[1-9])\b/gi); }

  static toAccusative(name) {
    if (!name) return "";
    let n = name.trim();
    // Odmiana przed nawiasem, np. "kumaryna (2H-chromen-2-on)" -> "kumarynę (2H-chromen-2-on)"
    const parenIdx = n.search(/[\(\[]/);
    if (parenIdx !== -1) {
      const mainPart = n.substring(0, parenIdx).trim();
      const restPart = n.substring(parenIdx);
      return `${this.toAccusative(mainPart)} ${restPart}`.trim();
    }
    if (/^masa\s+poreakcyjna/i.test(n)) {
      return n.replace(/^masa\s+poreakcyjna/i, 'masę poreakcyjną');
    }
    const directMap = {
      'kumaryna': 'kumarynę',
      'Kumaryna': 'kumarynę',
      'masa poreakcyjna': 'masę poreakcyjną',
      'Masa poreakcyjna': 'masę poreakcyjną'
    };
    if (directMap[n]) return directMap[n];
    if (n.endsWith('owa')) return n.slice(0, -3) + 'ową';
    if (n.endsWith('na')) return n.slice(0, -2) + 'ną';
    if (n.endsWith('ja')) return n.slice(0, -2) + 'ję';
    if (n.endsWith('ia')) return n.slice(0, -2) + 'ię';
    if (n.endsWith('a') && !n.endsWith('ka')) return n.slice(0, -1) + 'ę';
    return n;
  }

  static formatEuh208(text, resolvedSubstances = {}, components = [], hCodes = []) {
    // Zgodnie z art. 18 ust. 3 lit. b i art. 25 ust. 6 CLP:
    // Jeżeli mieszanina jest zaklasyfikowana jako uczulająca (H317 lub H334), zwrot EUH208 NIE MOŻE być stosowany!
    // Wszystkie substancje uczulające muszą znaleźć się w polu "Zawiera:".
    if (hCodes && hCodes.some(h => ['H317', 'H334'].includes(h))) {
      return null;
    }
    let rawSubstances = [];

    if (text) {
      const match = text.match(/EUH208\s*(?:Contains|Contiene|Zawiera|Innehåller)?[:\s]*([^.]+?)(?:\.\s*(?:May produce|Può provocare|Może powodować|Kan ge)|(?:\n\s*\n)|$)/is);
      if (match && match[1]) {
        let raw = match[1].replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        let parts = raw.split(/;\s*|\s*,\s*(?![^(]*\))/).map(s => s.trim()).filter(s => s && !/^(?:Contains|Contiene|Zawiera|May|Può|Może|substancj[aęie]|substance|sostanz[ae])/i.test(s));
        rawSubstances.push(...parts);
      }
    }

    // Reguła CLP Załącznik II pkt 2.8 dla mieszanin nieklasyfikowanych jako uczulające,
    // ale zawierających substancję uczulającą >= 0.1% (lub specyficzne SCL)
    if (components && Array.isArray(components)) {
      for (const comp of components) {
        const isSens = /(?:Skin\s*Sens|Resp\s*Sens|H317|H334)/i.test(comp.classification || '');
        if (isSens) {
          const concStr = comp.concentration || '';
          let maxConc = 0;
          const nums = [...concStr.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
          if (nums.length > 0) maxConc = Math.max(...nums);
          if (maxConc >= 0.1 || /≥\s*0[,.]1/i.test(concStr)) {
            const displayName = comp.name || comp.originalName;
            if (displayName && !rawSubstances.some(r => r.toLowerCase().includes(displayName.toLowerCase()) || displayName.toLowerCase().includes(r.toLowerCase()))) {
              rawSubstances.push(displayName);
            }
          }
        }
      }
    }

    if (rawSubstances.length === 0) return null;

    let mappedParts = rawSubstances.map(part => {
      let lower = part.toLowerCase().trim();
      const sortedAllergens = Object.entries(ALLERGEN_NAMES_PL).sort((a, b) => b[0].length - a[0].length);
      for (const [enName, plName] of sortedAllergens) {
        const enLower = enName.toLowerCase();
        if (lower === enLower) {
          return plName;
        }
        const wordRegex = new RegExp(`(^|[^a-z0-9])${enLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
        if (wordRegex.test(lower)) {
          return plName;
        }
      }
      for (const [cas, plName] of Object.entries(resolvedSubstances)) {
        if (lower.includes(cas) || (plName && lower.includes(plName.toLowerCase()))) {
          return plName;
        }
      }
      return part;
    });

    const uniqueParts = Array.from(new Set(mappedParts)).map(p => SDSChemicalExtractor.toAccusative(p));
    // Zgodnie z oficjalnym słownikiem CLP (załącznik III): "Zawiera [biernik]. Może powodować wystąpienie reakcji alergicznej."
    return `EUH208 Zawiera ${uniqueParts.join(', ')}. Może powodować wystąpienie reakcji alergicznej.`;
  }

  static inferGhsFromHCodes(hCodes) {
    let inferred = [];
    for (const h of hCodes) {
      const cleanH = h.split(":")[0].trim();
      if (H_TO_GHS_MAP[cleanH] && !inferred.includes(H_TO_GHS_MAP[cleanH])) {
        inferred.push(H_TO_GHS_MAP[cleanH]);
      }
    }
    return inferred.sort();
  }

  static extractDnelPnec(text, components = []) {
    if (!text) return { dnel: [], pnec: [], bySubstance: {} };
    let clean = SDSProcessorEngine.cleanPdfArtifacts(text)
      .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:[^\n\|]*?\|\s*)?(?:Suarez Company|SWEET HOME|BLK\d+)[^\n]*/gi, '')
      .replace(/DNEL\/PNEC available\s*;\s*NEA[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      .replace(/(\b(?:Skin|Oral|Inhalation)[^\n]*?)\s*(\([±\+]\)\s*trans[-—–])/gi, '$1\n$2');

    const parsePnecBlock = (raw) => {
      let lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      let plLines = [];
      for (let l of lines) {
        if (/^(?:Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Pagina|Pag\.|Strona|The full|Suarez)/i.test(l)) continue;
        if (/(?:bw\/d|mc\/dzień|\bOral\b|\bSkin\b|\bInhalation\b|Effects on)/i.test(l)) continue;
        let trans = l
          .replace(/Normal value in fresh water/gi, '- woda słodka:')
          .replace(/Normal value in marine water/gi, '- woda morska:')
          .replace(/Normal value for fresh water sediment/gi, '- osady słodkowodne:')
          .replace(/Normal value for marine water sediment/gi, '- osady morskie:')
          .replace(/Normal value for water, intermittent release/gi, '- woda (uwalnianie okresowe):')
          .replace(/Normal value of STP microorganisms/gi, '- mikroorganizmy w oczyszczalni ścieków (STP):')
          .replace(/Normal value for the food chain \(secondary poisoning\)/gi, '- łańcuch pokarmowy (zatrucie wtórne):')
          .replace(/Normal value for the terrestrial compartment/gi, '- środowisko glebowe (gleba):')
          .replace(/(\d+)\.(\d+)/g, '$1,$2');
        if (trans !== l || /\d+[.,]?\d*\s*mg\/(?:l|kg)/i.test(l)) {
          // Czyszczenie artefaktów separatorów tabeli (|)
          let cleanedLine = trans.replace(/\|\s*\|\s*/g, ' ').replace(/\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
          plLines.push(cleanedLine);
        }
      }
      return plLines;
    };

    const parseDnelBlock = (raw) => {
      let clean = raw.replace(/\r/g, '')
        .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]*/gi, '')
        .replace(/(?:^|\n)\s*(?:[^\n\|]*?\|\s*)?(?:Suarez Company|SWEET HOME|BLK\d+)[^\n]*/gi, '');
      let res = [];

      // 1. Droga pokarmowa (Oral)
      const oralMatch = clean.match(/Oral\s*([\s\S]*?)(?=Inhalation|Skin|Route|$)/i);
      if (oralMatch) {
        const oralNums = [...oralMatch[1].matchAll(/([\d.,]+)\s*mg\/kg/gi)].map(m => m[1].replace('.', ','));
        if (oralNums.length >= 2) {
          res.push(`- Droga pokarmowa (doustnie): Konsumenci: skutki ostre układowe: ${oralNums[0]} mg/kg mc/dzień; skutki przewlekłe układowe: ${oralNums[1]} mg/kg mc/dzień`);
        } else if (oralNums.length === 1) {
          res.push(`- Droga pokarmowa (doustnie): Konsumenci (skutki przewlekłe układowe): ${oralNums[0]} mg/kg mc/dzień`);
        }
      }

      // 2. Drogi oddechowe (Inhalation)
      const inhalMatch = clean.match(/Inhalation\s*([\s\S]*?)(?=Skin|Oral|$)/i);
      if (inhalMatch) {
        const nums = [...inhalMatch[1].matchAll(/([\d.,]+)\s*(?:mg\/m3|mg\/m³|ppm)/gi)].map(m => m[1].replace('.', ','));
        const hasAcuteWorker = /(?:Acute\s*local|ostre\s*miejscowe)[^\n]*?(?:1900|1920)/i.test(clean) || /(?:NDS\/NDSChPOL\s*1900|POL\s*1900)/i.test(clean);
        if (nums.length === 2) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/m³`);
          if (hasAcuteWorker || nums[1] === '950') {
            res.push(`  * Pracownicy: skutki przewlekłe układowe: ${nums[1]} mg/m³; skutki ostre miejscowe: 1900 mg/m³`);
          } else {
            res.push(`  * Pracownicy (skutki przewlekłe układowe): ${nums[1]} mg/m³`);
          }
        } else if (nums.length === 3) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/m³`);
          res.push(`  * Pracownicy: skutki przewlekłe układowe: ${nums[1]} mg/m³; skutki ostre miejscowe: ${nums[2]} mg/m³`);
        } else if (nums.length === 4) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: skutki ostre układowe: ${nums[0]} mg/m³; skutki przewlekłe układowe: ${nums[1]} mg/m³`);
          res.push(`  * Pracownicy: skutki ostre układowe: ${nums[2]} mg/m³; skutki przewlekłe układowe: ${nums[3]} mg/m³`);
        } else if (nums.length === 8) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: ostre miejscowe: ${nums[0]} mg/m³, ostre układowe: ${nums[1]} mg/m³, przewlekłe miejscowe: ${nums[2]} mg/m³, przewlekłe układowe: ${nums[3]} mg/m³`);
          res.push(`  * Pracownicy: ostre miejscowe: ${nums[4]} mg/m³, ostre układowe: ${nums[5]} mg/m³, przewlekłe miejscowe: ${nums[6]} mg/m³, przewlekłe układowe: ${nums[7]} mg/m³`);
        } else if (nums.length === 5) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: ostre miejscowe: ${nums[0]} mg/m³; przewlekłe miejscowe: ${nums[1]} mg/m³; przewlekłe układowe: ${nums[2]} mg/m³`);
          res.push(`  * Pracownicy: przewlekłe miejscowe: ${nums[3]} mg/m³; przewlekłe układowe: ${nums[4]} mg/m³`);
        } else if (nums.length > 0) {
          res.push(`- Drogi oddechowe (inhalacyjnie): ${nums.join(' / ')} mg/m³`);
        }
      }

      // 3. Na skórę (Skin)
      const skinMatch = clean.match(/Skin\s*([\s\S]*?)(?=Oral|Inhalation|Legend|8\.2|$)/i);
      if (skinMatch) {
        const skinText = skinMatch[1];
        const nums = [...skinText.matchAll(/([\d.,]+)\s*(?:mg\/kg)/gi)].map(m => m[1].replace('.', ','));
        if (nums.length >= 4) {
          res.push('- Na skórę:');
          res.push(`  * Konsumenci: skutki ostre układowe: ${nums[0]} mg/kg mc/dzień; skutki przewlekłe układowe: ${nums[1]} mg/kg mc/dzień`);
          res.push(`  * Pracownicy: skutki ostre układowe: ${nums[2]} mg/kg mc/dzień; skutki przewlekłe układowe: ${nums[3]} mg/kg mc/dzień`);
        } else if (nums.length === 2) {
          res.push('- Na skórę:');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/kg mc/dzień`);
          res.push(`  * Pracownicy (skutki przewlekłe układowe): ${nums[1]} mg/kg mc/dzień`);
        } else if (nums.length === 1) {
          res.push(`- Na skórę: Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/kg mc/dzień`);
        } else if (nums.length > 0) {
          res.push(`- Na skórę: ${nums.join(' / ')} mg/kg mc/dzień`);
        }
      }

      // Fallback jeśli specyficzne regexy nie dopasowały
      if (res.length === 0) {
        let lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let l of lines) {
          if (/^(?:Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Pagina|Pag\.|Strona|Effects on|Route of exposure|Acute local|Chronic systemic|Suarez)/i.test(l)) continue;
          let trans = l
            .replace(/\bOral\b/gi, '- Droga pokarmowa (doustnie):')
            .replace(/\bInhalation\b/gi, '- Drogi oddechowe (inhalacyjnie):')
            .replace(/\bSkin\b/gi, '- Na skórę:')
            .replace(/bw\/d/gi, 'mc/dzień')
            .replace(/(\d+)\.(\d+)/g, '$1,$2');
          if (/\d+[.,]?\d*\s*(?:mg\/kg|mg\/m3|mg\/l)/i.test(l) || trans.startsWith('-')) {
            res.push(trans);
          }
        }
      }
      return res;
    };

    let bySubstance = {};

    if (components && components.length > 0) {
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const searchNames = [comp.originalName, comp.name, comp.cas].filter(Boolean);
        let compDnel = [];
        let compPnec = [];

        for (const name of searchNames) {
          if (!name || name.length < 3) continue;
          const cleanName = name.replace(/\s*[-—–]\s*/g, '-').trim();
          const escaped = cleanName
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/\\\*/g, '\\*?')
            .replace(/\\\-/g, '[-—–\\s]*')
            .replace(/\s+/g, '\\s+');

          const otherPatterns = components.filter(c => c !== comp)
            .flatMap(c => [c.originalName, c.name, c.cas])
            .filter(n => n && n.length >= 4)
            .map(n => n.replace(/\s*[-—–]\s*/g, '-').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '\\*?').replace(/\\\-/g, '[-—–\\s]*').replace(/\s+/g, '\\s+'));

          const genericNextSub = `(?:^|\\n)\\s*[A-Za-z0-9\\s\\(\\)\\[\\]\\-–—\\.,\\*\\/]{3,120}?\\s*(?:\\||\\n)\\s*(?:Threshold Limit Value|Predicted no-effect concentration|Health\\s*-\\s*Derived no-effect)`;
          const endPat = otherPatterns.length > 0 
            ? `(?=(?:^|\\n)\\s*(?:${otherPatterns.join('|')})(?:\\b|[\\s\\|\\-\\)]|$))|(?=${genericNextSub})|(?:^|\\n)\\s*8\\.2\\b|$`
            : `(?=${genericNextSub})|(?:^|\\n)\\s*8\\.2\\b|$`;
          
          const regAll = new RegExp(`(?:^|\\n)\\s*${escaped}(?:\\b|[\\s\\|\\-\\)]|$)([\\s\\S]*?)(?:${endPat})`, 'gi');
          const matches = [...clean.matchAll(regAll)];
          
          for (const m of matches) {
            const blockText = m[1];
            if (/Predicted no-effect concentration\s*-\s*PNEC/i.test(blockText)) {
              const pnecMatches = [...blockText.matchAll(/Predicted no-effect concentration\s*-\s*PNEC([\s\S]*?)(?=Health\s*-\\s*Derived|Predicted no-effect|8\\.2|SECTION|$)/gi)];
              for (const pm of pnecMatches) {
                compPnec.push(...parsePnecBlock(pm[1]));
              }
            }
            if (/Health\s*-\s*Derived no-effect level/i.test(blockText)) {
              const dnelMatches = [...blockText.matchAll(/Health\s*-\s*Derived no-effect level\s*-\s*DNEL\s*\/\s*DMEL([\s\S]*?)(?=Predicted no-effect|Health\s*-\\s*Derived|8\\.2|SECTION|$)/gi)];
              for (const dm of dnelMatches) {
                compDnel.push(...parseDnelBlock(dm[1]));
              }
            }
          }
          if (compDnel.length > 0 || compPnec.length > 0) break;
        }

        if (compDnel.length > 0 || compPnec.length > 0) {
          const keyName = comp.name || comp.originalName || comp.cas;
          bySubstance[keyName] = {
            cas: comp.cas,
            dnel: Array.from(new Set(compDnel)),
            pnec: Array.from(new Set(compPnec))
          };
        }
      }
    }

    const pnecRaw = [...clean.matchAll(/Predicted no-effect concentration\s*-\s*PNEC([\s\S]*?)(?=Health\s*-\s*Derived|Predicted no-effect|SECTION|8\.2|$)/gi)];
    let pnecList = [];
    for (const m of pnecRaw) {
      pnecList.push(...parsePnecBlock(m[1]));
    }
    const dnelRaw = [...clean.matchAll(/Health\s*-\s*Derived no-effect level\s*-\s*DNEL\s*\/\s*DMEL([\s\S]*?)(?=Predicted no-effect|Health\s*-\\s*Derived|SECTION|8\.2|$)/gi)];
    let dnelList = [];
    for (const m of dnelRaw) {
      dnelList.push(...parseDnelBlock(m[1]));
    }
    return { dnel: dnelList, pnec: pnecList, bySubstance };
  }

  static resolvePlName(cas, rawName, resolvedSubstances = {}, ec = null) {
    if (ec && EC_TO_PL_MAP[ec]) {
      return EC_TO_PL_MAP[ec];
    }
    if (cas && CAS_TO_PL_MAP[cas]) {
      return CAS_TO_PL_MAP[cas];
    }
    if (rawName) {
      if (/reaction mass of 2-methylbutyl salicylate and pentyl salicylate/i.test(rawName)) {
        return "Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu";
      }
      if (/reaction mass of 1-\[\(1R\*?,6S\*?\)-2,2,6-trimethylcyclohexyl\]hexan-3-ol/i.test(rawName)) {
        return "Masa poreakcyjna 1-[(1R*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu i 1-[(1S*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu";
      }
      if (/\(4-tert-butylcyclohexyl\)\s*acetate/i.test(rawName)) {
        return "octan 4-tert-butylocykloheksylu";
      }
      if (/dipropylene glycol monomethyl ether/i.test(rawName)) {
        return "(2-metoksymetyloetoksy)propanol";
      }
      if (/2-ethyl-4-\(2,2,3-trimethyl-3-cyclopenten-1-yl\)-2-buten-1-ol/i.test(rawName)) {
        return "2-etylo-4-(2,2,3-trimetylocyklopent-3-en-1-ylo)but-2-en-1-ol";
      }
      if (/\(±\)\s*trans[—\-]\s*3,3-dimethyl-5-\(2,2,3-trimethyl-cyclopent-3-en-1-yl\)-pent-4-en-2-ol/i.test(rawName)) {
        return "(±) trans-3,3-dimetylo-5-(2,2,3-trimetylocyklopent-3-en-1-ylo)pent-4-en-2-ol";
      }
    }
    if (cas && NDSRegistry.isLoaded) {
      const ndsEntry = NDSRegistry.lookupByCas(cas);
      if (ndsEntry && ndsEntry.substance) {
        return ndsEntry.substance.toLowerCase();
      }
    }
    if (rawName) {
      const lowerRaw = rawName.toLowerCase().trim();
      const sortedAllergens = Object.entries(ALLERGEN_NAMES_PL).sort((a, b) => b[0].length - a[0].length);
      for (const [en, pl] of sortedAllergens) {
        const enLower = en.toLowerCase();
        if (lowerRaw === enLower) {
          return pl;
        }
        const wordRegex = new RegExp(`(^|[^a-z0-9])${enLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
        if (wordRegex.test(lowerRaw)) {
          return pl;
        }
      }
    }
    if (cas && resolvedSubstances[cas] && !resolvedSubstances[cas].startsWith("Substancja CAS")) {
      const resName = resolvedSubstances[cas];
      if (!/(?:aldehyde|benzene|acetate|cyclohexyl|oxide|chloride|acid|cresol)\b/i.test(resName)) {
        return resName;
      }
    }
    if (rawName) {
      let pol = rawName
        .replace(/\bethanol\b/gi, 'etanol')
        .replace(/\bmethanol\b/gi, 'metanol')
        .replace(/\bpropanol\b/gi, 'propanol')
        .replace(/\bacetone\b/gi, 'aceton')
        .replace(/\btoluene\b/gi, 'toluen')
        .replace(/\bxylene\b/gi, 'ksylen')
        .replace(/\bcoumarin\b/gi, 'kumaryna')
        .replace(/\banisaldehyde\b/gi, 'aldehyd anyżowy')
        .replace(/\b2,6-di-tert-butyl-p-cresol\b/gi, '2,6-di-tert-butylo-4-metylofenol (BHT)')
        .replace(/\b2H-CHROMEN-2-ONE\b/gi, 'kumaryna (2H-chromen-2-on)')
        .replace(/\b4-METHOXYBENZALDEHYDE\b/gi, 'aldehyd anyżowy (4-metoksybenzaldehyd)')
        .replace(/acetate\b/gi, 'octan')
        .replace(/acid\b/gi, 'kwas')
        .replace(/ether\b/gi, 'eter');

      if (/linalyl acetate/i.test(rawName)) return "octan linalilu";

      // Korekta hybryd językowych (np. "3,7-dimethylocta-1,6-dien-3-yl octan" -> "octan 3,7-dimetylookta-1,6-dien-3-ylu")
      if (pol.match(/([a-zA-Z0-9,\-()*]+(?:yl|il|en))\s+octan\b/i)) {
        pol = pol.replace(/([a-zA-Z0-9,\-()*]+(?:yl|il|en))\s+octan\b/gi, (match, prefix) => {
          return `octan ${prefix.replace(/dimethyl/g, 'dimetylo').replace(/ethyl/g, 'etylo').replace(/methyl/g, 'metylo').replace(/octa/g, 'okta')}u`;
        });
      }
      return pol;
    }
    return rawName || (cas ? `Substancja CAS: ${cas}` : "Składnik");
  }

  static findMatchingComponent(rawName, components = []) {
    if (!rawName || !Array.isArray(components) || components.length === 0) return null;
    const clean = rawName.trim().toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
    if (!clean) return null;

    // 1. Bezpośrednie dopasowanie leksykalne do originalName lub name
    for (const c of components) {
      const origClean = (c.originalName || '').trim().toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
      const nameClean = (c.name || '').trim().toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
      if (clean === origClean || clean === nameClean) {
        return c;
      }
    }

    // 2. Dopasowanie po synonimach chemicznych IUPAC / INCI i numerach CAS
    for (const c of components) {
      const cas = c.cas || '';
      // CAS 97-54-1: izoeugenol (bezwzględne odróżnienie od eugenolu)
      if (cas === '97-54-1' && clean.includes('isoeugenol')) return c;
      // CAS 97-53-0: eugenol
      if (cas === '97-53-0' && clean === 'eugenol') return c;
      // CAS 106-22-9: cytronellol / 3,7-dimethyloct-6-en-1-ol
      if (cas === '106-22-9' && (clean.includes('37dimethyloct6en1ol') || clean.includes('citronellol') || clean.includes('cytronellol'))) return c;
      // CAS 10339-55-6: (6E)-3,7-dimethylnona-1,6-dien-3-ol / ethyllinalool
      if (cas === '10339-55-6' && (clean.includes('37dimethylnona16dien3ol') || clean.includes('ethyllinalool') || clean.includes('etylolinalol'))) return c;
      // CAS 91-64-5: kumaryna / 2H-chromen-2-on
      if (cas === '91-64-5' && (clean.includes('2hchromen2one') || clean.includes('coumarin') || clean.includes('kumaryn'))) return c;
      // CAS 115-95-7: octan linalilu / linalyl acetate
      if (cas === '115-95-7' && (clean.includes('linalylacetate') || clean.includes('octanlinalilu'))) return c;
      // CAS 106-24-1: geraniol
      if (cas === '106-24-1' && clean.includes('geraniol')) return c;
      // CAS 64-17-5: etanol
      if (cas === '64-17-5' && (clean === 'etanol' || clean === 'ethanol')) return c;
    }

    return null;
  }

  static formatConcentration(concStr) {
    if (!concStr) return "—";
    let formatted = concStr
      .replace(/(\d+)\.(\d+)/g, '$1,$2')
      .replace(/([≥≤><=]|>=|<=)\s*/g, '$1 ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/%\s*-\s*/g, ' - ')
      .replace(/\s*%/g, ' %')
      .replace(/\s+/g, ' ')
      .trim();
    if (!formatted.includes('%') && formatted !== "—") {
      formatted += " %";
    }
    return formatted;
  }

  static parseLimsSection3(cleanText, resolvedSubstances = {}) {
    let text = SDSProcessorEngine.cleanPdfArtifacts(cleanText)
      .replace(/Page\s+n\.\s*of\s*\d+/gi, '')
      .replace(/\d{2}\/\d{2}\/\d{4}\s*Production Name[^\n]+/gi, '')
      .replace(/(?:[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company)[^\n]*[\s\S]{1,500}?\n\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/(?:^|\n)\s*(?:Revision nr\.?|Revisione n\.?|Wersja nr|Dated|Data|Printed on|Stampato il)\s*[:\.]?\s*[^\n]*/gi, '')
      .replace(/The full wording of hazard[\s\S]*$/gi, '');

    const matches = [...text.matchAll(/(?:^|\n)\s*INDEX\s+(\d{3}-\d{3}-\d{2}-[\dXx]|-)?\s*(\d+(?:[.,]\d+)?\s*[≤<=<]\s*x\s*[≤<=<]\s*\d+(?:[.,]\d+)?)/gi)];
    if (matches.length === 0) return null;

    const isClassLine = (l) => {
      return /^(?:Flam|Acute|Eye|Skin|Repr|Aquatic|Asp|STOT|Sens|Muta|Carc|H\d{3}|EUH\d{3}|Substance with a|Classification note|according to Annex|LD50|LC50|ATE\b|M\s*=|M-Chronic|M-Acute|≥|≤|[≤<=<,.\d\s]+x[≤<=<,.\d\s]*|mg\/l|mg\/kg|ppm|bw\/d|%\b|Irrit|Dam|Tox)/i.test(l) ||
             /:\s*≥/i.test(l) ||
             /\bH\d{3}\b/.test(l);
    };

    const components = [];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const indexNum = (m[1] && m[1].trim() !== '-') ? m[1].trim() : '—';
      let rawConc = m[2].trim();
      let conc = this.formatConcentration(rawConc);

      const prevBlockEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const blockStart = m.index;
      const preText = text.substring(prevBlockEnd, blockStart);

      const preLines = preText.split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^(?:Identification|Contains|3\.\d|Mixtures|Substances|EC\b|CAS\b|REACH\b|Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Suarez|First compilation|Information not relevant)/i.test(l));
      
      const nameLines = [];
      for (let j = preLines.length - 1; j >= 0; j--) {
        if (isClassLine(preLines[j])) break;
        nameLines.unshift(preLines[j]);
      }
      let rawName = nameLines.join(' ').replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
      if (i === 0) {
        rawName = rawName.replace(/^(?:SECTION\s*3[^\n]*|Composition[^\n]*|Miscele[^\n]*|Substances[^\n]*|Information not relevant[^\n]*)\s*/i, '').trim();
      }

      const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const blockBody = text.substring(m.index, nextStart);

      const casMatch = blockBody.match(/CAS\s*[:\.]?\s*(\d{2,7}-\d{2}-\d)/i);
      const curCas = casMatch ? casMatch[1] : '';

      const ecMatch = blockBody.match(/EC\s*[:\.]?\s*(\d{3}-\d{3}-\d)/i);
      const ecNumber = ecMatch ? ecMatch[1] : '—';

      const reachMatch = blockBody.match(/01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?/);
      let reachNumber = reachMatch ? reachMatch[0] : '—';

      const afterConcIdx = m.index + m[0].length;
      const firstLineEnd = text.indexOf('\n', afterConcIdx);
      let firstClassLine = text.substring(afterConcIdx, firstLineEnd !== -1 ? firstLineEnd : undefined).trim();

      const remainingLines = blockBody.split('\n').map(l => l.trim()).filter(Boolean);
      const classLines = [];
      if (firstClassLine) classLines.push(firstClassLine);

      for (let line of remainingLines) {
        let cleaned = line;
        cleaned = cleaned.replace(/^EC\s*[:\.]?\s*\d{3}-\d{3}-\d\s*/i, '');
        cleaned = cleaned.replace(/^INDEX\s*[:\.]?\s*[\d\-Xx]+\s*/i, '');
        cleaned = cleaned.replace(/^CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d\s*/i, '');
        cleaned = cleaned.replace(/^REACH\s*(?:Reg\.?)?\s*[:\.]?\s*[\w\-]+\s*/i, '');
        cleaned = cleaned.replace(/^[≤<=<,.\d\s]+x[≤<=<,.\d\s]*/i, '');
        cleaned = cleaned.trim();
        if (!cleaned || cleaned.toLowerCase() === rawName.toLowerCase()) continue;
        if (cleaned.includes(m[2])) continue;

        // Kontynuacja rozbitej linii z poprzedniego wiersza tabeli (np. "Classification note" + "according to Annex VI...: B", "ATE Inhalation" + "mists/powders: 0.501 mg/l")
        if (classLines.length > 0) {
          const lastIdx = classLines.length - 1;
          if (/Classification note(?:\s+according\s+to[^\n:]*)?$/i.test(classLines[lastIdx]) && /(?:according\s+to|Annex|Regulation|:\s*[A-Z0-9]|^[A-Z0-9]$)/i.test(cleaned)) {
            classLines[lastIdx] = `${classLines[lastIdx]} ${cleaned}`.replace(/\s+/g, ' ');
            continue;
          }
          if (/(?:ATE|Inhalation|dusts?|mists?|powders?|vapou?rs?)$/i.test(classLines[lastIdx]) && /(?:mists?|powders?|dusts?|vapou?rs?|[\d.,]+\s*mg)/i.test(cleaned)) {
            classLines[lastIdx] = `${classLines[lastIdx]} ${cleaned}`.replace(/\s+/g, ' ');
            continue;
          }
        }

        if (/(?:Flam|Acute|Eye|Skin|Repr|Aquatic|Asp|STOT|Sens|H\d{3}|\bATE\b|\bATE\s*[:=\(]|\bLD50\b|\bLC50\b|M\s*=|Specific|≥|≤|Substance with a|Classification note|according to Annex|mists?|powders?)/i.test(cleaned)) {
          if (!classLines.includes(cleaned)) {
            classLines.push(cleaned);
          }
        }
      }

      let classText = classLines.join('\n');
      classText = classText
        .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
        .replace(/Classification note[\s\S]*?:\s*([A-Z0-9]+)/gi, (match, note) => `Uwaga ${note} zgodnie z załącznikiem VI do rozporządzenia CLP`)
        .replace(/Classification note\s+([A-Z0-9]+)\b/gi, (match, note) => `Uwaga ${note} zgodnie z załącznikiem VI do rozporządzenia CLP`)
        .replace(/Classification note\s*$/gim, '')
        .replace(/Substance\s+with\s+a\s+community\s+workplace\s+exposure\s+limit[\.\s]*/gi, 'Substancja, dla której określono wspólnotowe najwyższe dopuszczalne stężenia w środowisku pracy.')
        .replace(/(?:ATE Oral|LD50 Oral)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/kg)?)/gi, (match, v) => `ATE (droga pokarmowa) = ${v.includes('mg/kg') ? v : v + ' mg/kg'}`)
        .replace(/(?:ATE Dermal|LD50 Dermal)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/kg)?)/gi, (match, v) => `ATE (na skórę) = ${v.includes('mg/kg') ? v : v + ' mg/kg'}`)
        .replace(/ATE Inhalation\s*(?:mists?\s*\/?\s*powders?|powders?\s*\/?\s*mists?|dusts?\s*\/?\s*mists?)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/l)?|\d+)/gi, (match, v) => `ATE (inhalacyjnie, pyły/mgły) = ${v.includes('mg/l') ? v : v + ' mg/l'}`)
        .replace(/ATE Inhalation(?:\s*vapours?|\s*vapors?)?\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/l)?|\d+)/gi, (match, v) => `ATE (inhalacyjnie, pary) = ${v.includes('mg/l') ? v : v + ' mg/l'}`)
        .replace(/ATE\s*Inhalation\s*vapou?rs?/gi, 'ATE (inhalacyjnie, pary)')
        .replace(/ATE\s*Inhalation\s*(?:mists?\/?powders?|powders?\/?mists?|dusts?\/?mists?)/gi, 'ATE (inhalacyjnie, pyły/mgły)')
        .replace(/ATE\s*Oral/gi, 'ATE (droga pokarmowa)')
        .replace(/ATE\s*Dermal/gi, 'ATE (na skórę)')
        .replace(/M\s*=\s*(\d+)/gi, 'M = $1')
        .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
        .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1')
        .replace(/<=/g, '≤')
        .replace(/>=/g, '≥')
        .replace(/(\d+)\.(\d+)\s*%/g, '$1,$2%');

      classText = mapHazardClass(classText);

      const plName = this.resolvePlName(curCas, rawName, resolvedSubstances, ecNumber);

      const idParts = [
        `Numer CAS: ${curCas || '—'}`,
        `Numer WE: ${ecNumber}`
      ];
      if (indexNum !== '—') idParts.push(`Numer indeksowy: ${indexNum}`);
      if (reachNumber !== '—') idParts.push(`Numer rejestracji REACH:\n${reachNumber}`);

      components.push({
        cas: curCas,
        name: plName,
        originalName: rawName,
        ec: ecNumber,
        index: indexNum,
        reach: reachNumber,
        identifiers: idParts.join('\n'),
        classification: classText,
        concentration: conc
      });
    }

    return components;
  }

  static parseSection3Components(contentIt, resolvedSubstances = {}) {
    if (!contentIt) return [];

    let cleanText = contentIt
      .replace(/Page\s+n\.\s*of\s*\d+/gi, '')
      .replace(/\d{2}\/\d{2}\/\d{4}\s*Production Name[^\n]+/gi, '')
      .replace(/Qty\s*Name\s*Ident\.\s*Numb\.\s*Classification\s*Registration\s*Number/gi, '');

    const isLimsFormat = /x\s*=\s*Conc\.\s*%/i.test(cleanText) || /INDEX\s+(?:[\d\-Xx]+)?\s*\d+(?:[.,]\d+)?\s*[≤<=<]\s*x/i.test(cleanText);
    if (isLimsFormat) {
      const limsComponents = this.parseLimsSection3(cleanText, resolvedSubstances);
      if (limsComponents && limsComponents.length > 0) {
        return limsComponents;
      }
    }

    // Łączenie stężeń rozbitych na linie przez łamanie wiersza (np. "≥0.00015%-\n<0.0015%" lub "0.1% -\n< 0.25%")
    cleanText = cleanText
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%?)\s*-\s*\n\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4)
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)\s*\n\s*-\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4)
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?)\s*-\s*\n\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4);

    const casMatches = [...cleanText.matchAll(/(?:CAS\s*[:\.]?\s*)?((?<![\d-])[1-9]\d{1,6}-\d{2}-\d(?![\d-]))/gi)]
      .filter(m => SDSChemicalExtractor.isValidCas(m[1]));
    if (casMatches.length === 0) return [];

    const concPattern = /(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%?(?:\s*-\s*(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%)|(?:[≥≤><~=]|>=|<=)\s*\d+(?:[.,]\d+)?\s*%/g;

    const components = [];

    for (let i = 0; i < casMatches.length; i++) {
      const curCas = casMatches[i][1];
      const casIdx = casMatches[i].index;

      // Wyznaczanie granic wiersza (do startu następnego CAS lub końca tekstu)
      let rowEnd = cleanText.length;
      if (i + 1 < casMatches.length) {
        rowEnd = casMatches[i + 1].index;
      }
      
      const preCasText = cleanText.substring(Math.max(0, casIdx - 250), casIdx);
      const concMatches = [...preCasText.matchAll(concPattern)];
      const lastConc = concMatches.length > 0 ? concMatches[concMatches.length - 1] : null;
      
      let rawConc = "—";
      let rawName = "";

      if (lastConc) {
        rawConc = lastConc[0].trim();
        rawName = preCasText.substring(lastConc.index + lastConc[0].length).trim();
      } else {
        const postCasText = cleanText.substring(casIdx + curCas.length, rowEnd);
        const postConcMatches = [...postCasText.matchAll(concPattern)];
        if (postConcMatches.length > 0) {
          rawConc = postConcMatches[0][0].trim();
        }
        const cleanPre = preCasText
          .replace(/^(?:[\s\S]*?(?:3\.\d|Miscele|Substances|Composition|Ingredients)[^\n]*\n)/i, '')
          .trim();
        const preLines = cleanPre.split('\n').map(l => l.trim()).filter(Boolean);
        rawName = preLines.length > 0 ? preLines.join(' ') : "";
      }

      const concentration = this.formatConcentration(rawConc);
      rawName = rawName.replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      const body = cleanText.substring(casIdx, rowEnd).trim();

      const ecMatch = body.match(/(?:EC|WE|EINECS)\s*[:\.]?\s*(\d{3}-\d{3}-\d)/i);
      const ecNumber = ecMatch ? ecMatch[1] : "—";

      const indexMatch = body.match(/(?:Index|Indeks)\s*[:\.]?\s*(\d{3}-\d{3}-\d{2}-[\dXx])/i);
      const indexNumber = indexMatch ? indexMatch[1] : "—";

      const reachMatch = body.match(/(?:01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?|01-\d+-\d+-\w+)/);
      const reachNumber = reachMatch ? reachMatch[0] : "—";

      let classText = body;
      classText = classText.replace(/CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d/gi, '');
      if (ecMatch) classText = classText.replace(ecMatch[0], '');
      if (indexMatch) classText = classText.replace(indexMatch[0], '');
      if (reachMatch) classText = classText.replace(reachMatch[0], '');

      // Normalizacja nagłówków SCL i współczynników M
      classText = classText
        .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
        .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
        .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1');

      // Inteligentna pętla normalizująca linie klasyfikacji i SCL bez niszczenia przedziałów stężeń
      const rawClassLines = classText.split('\n').map(l => l.trim()).filter(Boolean);
      const processedClassLines = [];
      let inSclBlock = false;

      for (let li = 0; li < rawClassLines.length; li++) {
        let curLine = rawClassLines[li];

        if (/Specyficzne stężenia graniczne/i.test(curLine)) {
          inSclBlock = true;
          processedClassLines.push("Specyficzne stężenia graniczne:");
          continue;
        }

        const isSclLine = inSclBlock || /(?:(?:^|[,\s])C\s*[≥≤><=]|[≥≤><=]?\s*\d+(?:[.,]\d+)?\s*%\s*[≤<=]\s*C|M\s*\((?:ostry|przewlekły)\)\s*=|ATE\b)/i.test(curLine);

        if (!isSclLine) {
          // Usuwamy wyłącznie śmieciowe resztki stężeń z sąsiednich wierszy tabeli (np. "≥0.00015%-" lub "<0.0015%"),
          // pod warunkiem że linia nie zawiera faktycznych klas zagrożenia ani kodów H
          if (/^(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%?\s*-?\s*$/i.test(curLine) ||
              (/^(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%/i.test(curLine) && !/(?:Skin|Eye|Acute|Aquatic|Sens|Flam|Resp|STOT|Asp|H\d{3}|EUH)/i.test(curLine))) {
            continue;
          }
        } else {
          inSclBlock = true;
          // Normalizacja typografii CLP: <= -> ≤, >= -> ≥, kropki dziesiętne na przecinki w liczbach procentowych
          curLine = curLine
            .replace(/<=/g, '≤')
            .replace(/>=/g, '≥')
            .replace(/(\d+)\.(\d+)\s*%/g, '$1,$2%');

          // Scalanie połamanych wierszy SCL: jeśli następna linia jest osieroconym kodem H (np. "H315", "H319"), łączymy z bieżącą regułą SCL
          if (li + 1 < rawClassLines.length) {
            const nextL = rawClassLines[li + 1].trim();
            if (/^(?:H\d{3}[a-zA-Z]?|EUH\d{3})(?:\s*,\s*(?:H\d{3}[a-zA-Z]?|EUH\d{3}))*$/i.test(nextL)) {
              curLine = `${curLine} ${nextL}`;
              li++; // pochłonięcie osieroconego kodu H
            }
          }
        }

        processedClassLines.push(curLine);
      }

      classText = processedClassLines.join('\n').trim();
      classText = mapHazardClass(classText);

      const plName = this.resolvePlName(curCas, rawName, resolvedSubstances);

      const idParts = [
        `Numer CAS: ${curCas}`,
        `Numer WE: ${ecNumber}`
      ];
      if (indexNumber !== "—") idParts.push(`Numer indeksowy: ${indexNumber}`);
      if (reachNumber !== "—") idParts.push(`Numer rejestracji REACH:\n${reachNumber}`);

      components.push({
        cas: curCas,
        name: plName,
        originalName: rawName,
        ec: ecNumber,
        index: indexNumber,
        reach: reachNumber,
        identifiers: idParts.join('\n'),
        classification: classText,
        concentration: concentration
      });
    }

    return components.map(c => CLPHarmonizedRegistry.enrichComponent(c));
  }
}

// ============================================================================
// 5. REST API ECHA / PUBCHEM
// ============================================================================

module.exports = { SDSChemicalExtractor };
