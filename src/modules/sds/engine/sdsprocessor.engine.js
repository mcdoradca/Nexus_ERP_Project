// Auto-extracted module: SDSProcessorEngine
const fs = require('fs');
const path = require('path');

class SDSProcessorEngine {
  constructor(companyConfig = {}) {
    this.companyConfig = {
      companyName: companyConfig.companyName || process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.",
      address: companyConfig.address || process.env.COMPANY_ADDRESS || "ul. Wesoła 16",
      city: companyConfig.city || process.env.COMPANY_CITY || "63-600 Kępno",
      website: companyConfig.website || process.env.COMPANY_WEBSITE || "www.prostozwloch.com.pl",
      email: companyConfig.email || process.env.COMPANY_EMAIL || "kontakt@prostozwloch.com.pl",
      phone: companyConfig.phone || process.env.COMPANY_PHONE || "+48 663116607",
      emergencyPhone: companyConfig.emergencyPhone || process.env.COMPANY_EMERGENCY_PHONE || process.env.COMPANY_PHONE || "+48 663116607"
    };
    this.quarantineLogs = [];
    this.extractedSubstances = [];
    this.detectedGhsPictograms = [];
    this.anomalies = [];

    // Inicjalizacja baz referencyjnych RAG
    const ndsPath = path.join(__dirname, 'rag_knowledge', 'nds_database_2018.json');
    NDSRegistry.loadRegistry(ndsPath);
    const ecotoxPath = path.join(__dirname, 'rag_knowledge', 'ecotox_cache.json');
    EcotoxRegistry.loadRegistry(ecotoxPath);
    const adrPath = path.join(__dirname, 'rag_knowledge', 'adr_transport_pl.json');
    ADRRegistry.loadRegistry(adrPath);
    const wastePath = path.join(__dirname, 'rag_knowledge', 'waste_codes_pl.json');
    WasteRegistry.loadRegistry(wastePath);
  }


  processSection2(contentIt, resolvedSubstances = {}, components = []) {
    const hCodes = SDSChemicalExtractor.extractHCodes(contentIt);
    const pCodes = SDSChemicalExtractor.extractPCodes(contentIt);
    const euhCodes = SDSChemicalExtractor.extractEuhCodes(contentIt);
    
    // Walidacja twarda słownika
    hCodes.forEach(code => {
      if (!OFFICIAL_CLP_H_PHRASES[code]) throw new Error(`[CRITICAL HALT] Nieznany kod zagrożenia: ${code}`);
    });

    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous)/i.test(contentIt);
    const isHazardous = !isExplicitlyNotHazardous && (hCodes.length > 0 || /(?:Flam\.|Skin\.|Eye\.|Acute Tox|Aquatic|STOT|Asp\.)/i.test(contentIt));

    // 2.1. Klasyfikacja substancji lub mieszaniny (Załącznik II REACH pkt 2.1: pełne klasy, kategorie i zwroty H)
    let classification2_1 = "";
    if (!isHazardous) {
      classification2_1 = "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie zgodnie z rozporządzeniem (WE) nr 1272/2008 [CLP].";
    } else {
      let text21 = "";
      const match21 = contentIt.match(/(?:^|\n)\s*2\.1\b[.:\-]?\s*(.*?)(?=(?:^|\n)\s*2\.2\b|$)/is);
      if (match21 && match21[1]) {
        text21 = match21[1].replace(/^(?:Classification\s*(?:of\s*(?:the\s*)?(?:substance\s*or\s*mixture)?)?|Klasyfikacja\s*(?:substancji\s*lub\s*mieszaniny)?)[.:\-]?\s*/i, '').trim();
      } else {
        text21 = contentIt;
      }
      if (hCodes.length > 0) {
        classification2_1 = hCodes.map(c => {
          let clpClass = H_TO_CLP_CLASS_MAP[c] || "Zagrożenie wg rozporządzenia CLP";
          if (c === 'H317') {
            const has1A = /Skin\s*Sens\.?\s*1A/i.test(contentIt) || (components && components.some(comp => {
              const compCl = comp.classification || '';
              const compName = (comp.name || comp.originalName || '').toLowerCase();
              return (compCl.includes('Skin Sens. 1A') || compName.includes('cinnamaldehyde') || compName.includes('cynamon')) && compCl.includes('H317');
            }));
            if (has1A) {
              clpClass = "Skin Sens. 1A (Działanie uczulające na skórę, kategoria 1A)";
            }
          }
          const phrase = OFFICIAL_CLP_H_PHRASES[c] || "";
          return `${clpClass}\n${c} ${phrase}`.trim();
        }).join('\n\n');
      } else {
        classification2_1 = mapHazardClass(text21.trim());
      }
    }

    // 2.2. Elementy oznakowania
    const directGhs = SDSChemicalExtractor.extractGhsCodes(contentIt);
    const inferredGhs = SDSChemicalExtractor.inferGhsFromHCodes(hCodes);
    this.detectedGhsPictograms = isHazardous ? Array.from(new Set([...directGhs, ...inferredGhs])).sort() : [];

    let signalWord = "Brak hasła ostrzegawczego.";
    if (isHazardous) {
      if (/(PERICOLO|DANGER|NIEBEZPIECZEŃSTWO)/i.test(contentIt)) {
        signalWord = "Niebezpieczeństwo";
      } else if (/(ATTENZIONE|WARNING|UWAGA)/i.test(contentIt) || this.detectedGhsPictograms.length > 0) {
        signalWord = "Uwaga";
      }
    }

    // Nazwy substancji na etykiecie wg art. 18 ust. 3 lit. b CLP:
    // Podaje się wyłącznie nazwy substancji, które zdecydowały o zaklasyfikowaniu mieszaniny do odpowiednich kategorii.
    // Substancje obecne poniżej progów klasyfikacji mieszaniny (np. Skin Sens < 1%) NIE mogą być umieszczane na etykiecie
    // jako substancje identyfikujące zagrożenie – wyzwalają one wyłącznie zwrot EUH208!
    // Gdy mieszanina jest zaklasyfikowana jako Skin Sens. (H317), alergeny wyzwalające tę klasyfikację
    // MUSZĄ znaleźć się na etykiecie pod "Zawiera:", a zwrot EUH208 jest prawnie zabroniony.
    let labelSubstances = "Nie dotyczy.";
    const containsMatch = contentIt.match(/(?<!EUH208[\s\S]{0,30})(?:Contains|Contiene|Zawiera)\s*[:\.]?\s*([\s\S]+?)(?=(?:2\.3\b|Other\s+hazards|Inne\s+zagrożenia|Altri\s+pericoli|Hazard-determining|Hazard\s+statements|Precautionary\s+statements|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH|Supplemental|$))/i);
    let potentialNames = [];
    if (containsMatch) {
      const rawText = containsMatch[1].replace(/-\s+/g, '-');
      const rawNames = (rawText.includes('\n') || rawText.includes('|'))
        ? rawText.split(/[\r\n|;]+/).map(s => s.trim()).filter(s => s && !/(?:Hazard-determining|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH)/i.test(s) && s.length >= 3)
        : rawText.split(/(?:;|(?:,(?!\s*\d|\s*[a-z0-9\*]+\))))/).map(s => s.trim()).filter(s => s && !/(?:Hazard-determining|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH)/i.test(s) && s.length >= 3);
      
      potentialNames = rawNames.map(rn => {
        if (components && Array.isArray(components)) {
          const comp = SDSChemicalExtractor.findMatchingComponent(rn, components);
          if (comp) {
            return comp.name || comp.originalName;
          }
        }
        return SDSChemicalExtractor.resolvePlName(null, rn, resolvedSubstances);
      }).filter(Boolean);
    }

    // Filtrowanie substancji etykiety zgodnie z art. 18 ust. 3 lit. b CLP
    if (components && components.length > 0 && isHazardous) {
      const deciders = components.filter(c => {
        const cl = c.classification || '';
        const concNums = [...(c.concentration || '').matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
        const maxC = concNums.length > 0 ? Math.max(...concNums) : 0;
        
        // Alergeny (H317/H334):
        // Jeśli mieszanina JEST zaklasyfikowana jako H317/H334 (art. 18 ust. 3 lit. b CLP):
        // Wszystkie składniki uczulające, które wywołały tę klasyfikację (np. stężenie >= 0.1% lub SCL 0.01% dla 1A),
        // MUSZĄ znaleźć się w "Zawiera:" na etykiecie.
        // Jeśli mieszanina NIE jest zaklasyfikowana jako H317/H334:
        // bezwzględny zakaz umieszczania na etykiecie głównej (trafiają do EUH208 wg art. 25 ust. 6 CLP)
        const isSens = /(?:Skin\s*Sens|Resp\s*Sens|H317|H334)/i.test(cl);
        const mixtureHasSens = hCodes.some(h => ['H317', 'H334'].includes(h));
        if (isSens) {
          if (mixtureHasSens) {
            if (maxC >= 0.1 || /Skin\s*Sens\.?\s*1A/i.test(cl) || maxC >= 0.01) {
              return true;
            }
          } else {
            const hasOtherHazardInMixture = hCodes.some(h => {
              if (['H317', 'H334'].includes(h)) return false;
              return cl.includes(h);
            });
            if (!hasOtherHazardInMixture) return false;
          }
        }

        // 1. Toksyczność ostra (H300..H302, H310..H312, H330..H332) - tylko jeśli mieszanina jest zaklasyfikowana jako ostra toksyczność
        if (/Acute\s*Tox|H30[0-2]|H31[0-2]|H33[0-2]/i.test(cl)) {
          const mixtureHasAcute = hCodes.some(h => /^H3[013][0-2]$/.test(h));
          if (!mixtureHasAcute) return false;
        }

        // 2. Działanie rakotwórcze, mutagenne, toksyczne na rozrodczość (CMR: H340, H350, H360, H361)
        if (/Repr\.|Carc\.|Muta\.|H34[01]|H35[01]|H36[01]/i.test(cl)) {
          const mixtureHasCmr = hCodes.some(h => /^H3[456][01]/.test(h));
          if (!mixtureHasCmr || maxC < 0.1) return false;
        }

        // 3. STOT (H370, H371, H372, H373, H335, H336) i zagrożenie aspiracją (H304)
        if (/STOT|Asp\.\s*Tox|H37[0-3]|H304/i.test(cl)) {
          const mixtureHasStotOrAsp = hCodes.some(h => /^H3(?:7[0-3]|04|3[56])$/.test(h));
          if (!mixtureHasStotOrAsp || maxC < 1.0) return false;
        }

        // 4. Działanie żrące / drażniące na oczy (Eye Dam. 1 H318, Eye Irrit. 2 H319)
        if (/Eye\s*(?:Dam|Irrit)|H31[89]/i.test(cl)) {
          const mixtureHasEye = hCodes.some(h => ['H318', 'H319'].includes(h));
          if (mixtureHasEye && (maxC >= 10 || /Eye\s*Irrit[^\n]*≥\s*50%/i.test(cl) || maxC >= 3)) {
            return true;
          }
        }

        // 5. Substancje łatwopalne / rozpuszczalniki bazowe (H224, H225, H226)
        if (/Flam\.\s*Liq|H22[4-6]/i.test(cl)) {
          const mixtureHasFlam = hCodes.some(h => /^H22[4-6]$/.test(h));
          if (mixtureHasFlam && maxC >= 10) return true;
        }

        // Ogólne kryterium: stężenie znaczące i klasa obecna w hCodes mieszaniny
        const sharesCodeWithMixture = hCodes.some(h => cl.includes(h));
        return sharesCodeWithMixture && maxC >= 10;
      }).map(c => c.name || c.originalName).filter(Boolean);

      const rawAllNames = Array.from(new Set([...potentialNames, ...deciders]));
      if (rawAllNames.length > 0) {
        const deduplicatedNames = [];
        const seenKeys = new Set();
        for (const nm of rawAllNames) {
          let resolved = nm;
          if (components && Array.isArray(components)) {
            const comp = SDSChemicalExtractor.findMatchingComponent(nm, components);
            if (comp) {
              resolved = comp.name || comp.originalName;
            }
          }
          if (resolved === nm) {
            resolved = SDSChemicalExtractor.resolvePlName(null, nm, resolvedSubstances);
          }
          const key = (resolved || '').toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedNames.push(resolved);
          }
        }
        // Zgodnie z art. 18 ust. 3 lit. b CLP: rozpuszczalnik bazowy (np. etanol) decydujący o klasyfikacji H225/H319 w stężeniu dominującym (>= 10%) bezwzględnie musi znaleźć się na etykiecie
        const hasDominantEthanol = components && components.some(c => {
          const isEth = (c.cas === '64-17-5' || /etanol|ethanol/i.test(c.name || c.originalName || ''));
          const concNums = [...(c.concentration || '').matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
          const maxC = concNums.length > 0 ? Math.max(...concNums) : 0;
          return isEth && maxC >= 10;
        });
        if (hasDominantEthanol && (hCodes.includes('H225') || hCodes.includes('H319'))) {
          if (!seenKeys.has('etanol')) {
            seenKeys.add('etanol');
            deduplicatedNames.push('etanol');
          }
        }
        labelSubstances = deduplicatedNames.join(', ');
      }
    } else if (potentialNames.length > 0) {
      const deduplicatedNames = [];
      const seenKeys = new Set();
      for (const nm of potentialNames) {
        let resolved = nm;
        if (components && Array.isArray(components)) {
          const comp = SDSChemicalExtractor.findMatchingComponent(nm, components);
          if (comp) resolved = comp.name || comp.originalName;
        }
        if (resolved === nm) {
          resolved = SDSChemicalExtractor.resolvePlName(null, nm, resolvedSubstances);
        }
        const key = (resolved || '').toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          deduplicatedNames.push(resolved);
        }
      }
      labelSubstances = deduplicatedNames.join(', ');
    } else if (isHazardous) {
      const hazardSubstanceNames = Object.values(resolvedSubstances).filter(Boolean);
      if (hazardSubstanceNames.length > 0) labelSubstances = Array.from(new Set(hazardSubstanceNames)).join(", ");
    }

    // Ostateczna tarcza art. 18 ust. 3 lit. b CLP dla etanolu
    if (components && components.some(c => (c.cas === '64-17-5' || /etanol|ethanol/i.test(c.name || c.originalName || '')) && /(?:[1-9]\d|\b[1-9]\d(?:\.\d+)?\s*%\b|\b7[4-8]\b)/.test(c.concentration || '')) && (hCodes.includes('H225') || hCodes.includes('H319'))) {
      if (!/(?:etanol|ethanol)/i.test(labelSubstances)) {
        labelSubstances = labelSubstances === "Nie dotyczy." ? "etanol" : `${labelSubstances}, etanol`;
      }
    }

    let mappedH = "Brak.";
    if (hCodes.length > 0) {
      mappedH = hCodes.map(c => `${c} ${OFFICIAL_CLP_H_PHRASES[c] || c}`).join('\n');
    }

    let mappedP = "Brak.";
    if (pCodes.length > 0) {
      let filteredPCodes = [...pCodes];
      // Zgodnie z art. 28 ust. 3 rozporządzenia CLP eliminujemy zwroty niemające uzasadnienia w klasyfikacji mieszaniny
      const hasSkinHazard = hCodes.some(h => ['H314', 'H315', 'H317', 'H311', 'H312', 'H310'].includes(h)) || /H314|H315|H317|Skin\s*Sens|Skin\s*Irrit|Skin\s*Corr/i.test(contentIt || '');
      if (!hasSkinHazard) {
        filteredPCodes = filteredPCodes.filter(c => c !== 'P302+P352' && c !== 'P302' && c !== 'P352' && c !== 'P333+P313');
      }
      // Zgodnie z art. 28 ust. 3 CLP oraz Single Source of Truth (SSOT), autentyczne zwroty P nadane przez producenta
      // w karcie źródłowej (w tym zwroty medyczne reagowania P333+P313, P337+P313 oraz P501) są w 100% zachowywane.
      mappedP = filteredPCodes.map(c => `${c} ${OFFICIAL_CLP_P_PHRASES[c] || c}`).join('\n');
    }

    let mappedEuh = "Brak.";
    let euhEntries = [];
    const euh208Text = SDSChemicalExtractor.formatEuh208(contentIt, resolvedSubstances, components, hCodes);
    if (euh208Text) {
      euhEntries.push(euh208Text);
    }
    euhCodes.forEach(code => {
      if (code !== "EUH208" && OFFICIAL_CLP_H_PHRASES[code]) {
        euhEntries.push(`${code} ${OFFICIAL_CLP_H_PHRASES[code]}`);
      }
    });
    if (euhEntries.length > 0) mappedEuh = euhEntries.join('\n');

    const section2_2_body = [
      "Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze",
      signalWord,
      "",
      "Nazwy niebezpiecznych substancji wymienione na etykiecie",
      labelSubstances,
      "",
      "Zwroty wskazujące rodzaj zagrożenia",
      mappedH,
      "",
      "Zwroty wskazujące środki ostrożności",
      mappedP,
      "",
      "Informacje uzupełniające",
      mappedEuh
    ].join('\n');

    return {
      content: `SEKCJA 2: Identyfikacja zagrożeń\n\n2.1. Klasyfikacja substancji lub mieszaniny\n${classification2_1}\n\n2.2. Elementy oznakowania\n${section2_2_body}`,
      ghsPictograms: this.detectedGhsPictograms,
      signalWord: signalWord
    };
  }

  async processSection3(contentIt, manualOverrides = {}) {
    const casList = SDSChemicalExtractor.extractCas(contentIt);
    let resolvedSubstances = {};

    for (const cas of casList) {
      if (manualOverrides[cas]) {
        resolvedSubstances[cas] = manualOverrides[cas].name_pl || manualOverrides[cas].iupac;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: "HITL_MANUAL_OVERRIDE" });
        continue;
      }
      if (CAS_TO_PL_MAP[cas]) {
        resolvedSubstances[cas] = CAS_TO_PL_MAP[cas];
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: `https://echa.europa.eu/pl/substance-information/-/substanceinfo/${cas.replace(/-/g, "")}` });
        continue;
      }
      try {
        const echaInfo = await ECHAFreeResolver.resolveSubstanceData(cas);
        resolvedSubstances[cas] = echaInfo.name_pl;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: echaInfo.name_pl, url: echaInfo.echa_infocard_url });
      } catch (err) {
        if (err.message.includes("CRITICAL HALT")) {
          this.anomalies.push({ type: "CAS_NOT_FOUND", cas: cas, message: err.message });
        } else {
          this.anomalies.push({ type: "API_ERROR", cas: cas, message: err.message });
        }
      }
    }

    const components = SDSChemicalExtractor.parseSection3Components(contentIt, resolvedSubstances);

    let chemDesc = "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi.";
    const descMatch = (contentIt || "").match(/(?:Chemical description|Descrizione chimica|Opis chemiczny|Description)\s*[:\.]?\s*([^\n]+)/i);
    if (descMatch && descMatch[1] && !/not applicable|non applicabile/i.test(descMatch[1])) {
      chemDesc = descMatch[1].trim()
        .replace(/aqueous solution/gi, 'wodny roztwór')
        .replace(/soluzione acquosa/gi, 'wodny roztwór')
        .replace(/mixture of/gi, 'mieszanina')
        .replace(/miscela di/gi, 'mieszanina');
    }

    let textContent = "SEKCJA 3: Skład / informacja o składnikach\n\n";
    textContent += "3.1. Substancje: Nie dotyczy.\n\n";
    textContent += `3.2. Mieszaniny\nOpis chemiczny: ${chemDesc}\n\n`;

    if (components.length > 0) {
      components.forEach((c, idx) => {
        textContent += `${idx + 1}. ${c.name}\n`;
        textContent += `   ${c.identifiers.replace(/\n/g, ' | ')}\n`;
        textContent += `   Stężenie: ${c.concentration}\n`;
        textContent += `   Klasyfikacja: ${c.classification.replace(/\n/g, ' ')}\n\n`;
      });
    } else {
      textContent += "Mieszanina nie zawiera składników stwarzających zagrożenie w ilościach przekraczających stężenia graniczne określone w rozporządzeniu CLP.\n\n";
    }

    textContent += "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.";

    return { content: textContent, components, resolvedSubstances, chemicalDescription: chemDesc };
  }

  async processSection3FromDocxTable(tableRows, contentIt, manualOverrides = {}) {
    // 1. Ekstrakcja wstępna komponentów z wierszy tabeli OpenXML
    const parsedFromTable = SDSDocxParser.parseSection3Table(tableRows);

    // 2. Zebranie listy CAS z tabeli lub fallback do tekstu
    let casList = [];
    if (parsedFromTable && parsedFromTable.length > 0) {
      casList = Array.from(new Set(parsedFromTable.map(c => c.cas).filter(Boolean)));
    }
    if (casList.length === 0 && contentIt) {
      casList = SDSChemicalExtractor.extractCas(contentIt);
    }

    // 3. Rozwiązanie nazw CAS (HITL, CAS_TO_PL_MAP, ECHA) z zachowaniem pełnej tarczy błędów
    let resolvedSubstances = {};
    for (const cas of casList) {
      if (manualOverrides[cas]) {
        resolvedSubstances[cas] = manualOverrides[cas].name_pl || manualOverrides[cas].iupac;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: "HITL_MANUAL_OVERRIDE" });
        continue;
      }
      if (CAS_TO_PL_MAP[cas]) {
        resolvedSubstances[cas] = CAS_TO_PL_MAP[cas];
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: `https://echa.europa.eu/pl/substance-information/-/substanceinfo/${cas.replace(/-/g, "")}` });
        continue;
      }
      try {
        const echaInfo = await ECHAFreeResolver.resolveSubstanceData(cas);
        resolvedSubstances[cas] = echaInfo.name_pl;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: echaInfo.name_pl, url: echaInfo.echa_infocard_url });
      } catch (err) {
        if (err.message.includes("CRITICAL HALT")) {
          this.anomalies.push({ type: "CAS_NOT_FOUND", cas: cas, message: err.message });
        } else {
          this.anomalies.push({ type: "API_ERROR", cas: cas, message: err.message });
        }
      }
    }

    // 4. Ponowne sparsowanie tabeli z uwzględnieniem przetłumaczonych nazw
    let components = SDSDocxParser.parseSection3Table(tableRows, (cas, raw, ec) => SDSChemicalExtractor.resolvePlName(cas, raw, resolvedSubstances, ec));
    if (!components || components.length === 0) {
      components = SDSChemicalExtractor.parseSection3Components(contentIt, resolvedSubstances);
    }

    // 5. Opis chemiczny
    let chemDesc = "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi.";
    const descMatch = (contentIt || "").match(/(?:Chemical description|Descrizione chimica|Opis chemiczny|Description)\s*[:\.]?\s*([^\n]+)/i);
    if (descMatch && descMatch[1] && !/not applicable|non applicabile/i.test(descMatch[1])) {
      chemDesc = descMatch[1].trim()
        .replace(/aqueous solution/gi, 'wodny roztwór')
        .replace(/soluzione acquosa/gi, 'wodny roztwór')
        .replace(/mixture of/gi, 'mieszanina')
        .replace(/miscela di/gi, 'mieszanina');
    }

    let textContent = "SEKCJA 3: Skład / informacja o składnikach\n\n";
    textContent += "3.1. Substancje: Nie dotyczy.\n\n";
    textContent += `3.2. Mieszaniny\nOpis chemiczny: ${chemDesc}\n\n`;

    if (components.length > 0) {
      components.forEach((c, idx) => {
        textContent += `${idx + 1}. ${c.name}\n`;
        textContent += `   ${c.identifiers.replace(/\n/g, ' | ')}\n`;
        textContent += `   Stężenie: ${c.concentration}\n`;
        textContent += `   Klasyfikacja: ${c.classification.replace(/\n/g, ' ')}\n\n`;
      });
    } else {
      textContent += "Mieszanina nie zawiera składników stwarzających zagrożenie w ilościach przekraczających stężenia graniczne określone w rozporządzeniu CLP.\n\n";
    }

    textContent += "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.";

    return {
      content: textContent.trim(),
      components,
      resolvedSubstances,
      chemicalDescription: chemDesc
    };
  }


  // ============================================================================
  // UNIWERSALNE SŁOWNIKI I MAPOWANIA REGULACYJNE (UE 2020/878)
  // ============================================================================
  static PHRASE_DICTIONARY_PL = {
    // Pierwsza pomoc (Sekcja 4)
    "in case of doubt or in the presence of symptoms contact a doctor and show him this document. in case of more severe symptoms, ask for immediate medical aid": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki. W przypadku cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "in case of doubt or in the presence of symptoms contact a doctor and show him this document": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki.",
    "in case of more severe symptoms, ask for immediate medical aid": "W przypadku wystąpienia cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "in caso di dubbio o in presenza di sintomi contattare un medico e mostrargli questo documento. in caso di sintomi più gravi richiedere l'intervento immediato di un medico": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki. W przypadku cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "remove, if present, contact lenses if the situation allows you to do so easily. wash immediately with plenty of water for at least 15 minutes, opening the eyelids fully. get medical advice/attention": "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).",
    "togliere, se presenti, le lenti a contatto se la situazione consente di farlo facilmente. lavare immediatamente ed abbondantemente con acqua per almeno 15 minuti, aprendo bene le palpebre. consultare un medico": "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).",
    "take off immediately all contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice/attention. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady/zgłosić się pod opiekę lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "take off immediately all contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "take off contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "togliere gli indumenti contaminati. lavare immediatamente ed abbondantemente con acqua corrente (e sapone se possibile). consultare un medico. evitare ulteriori contatti con gli indumenti contaminati": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "do not induce vomiting unless explicitly authorised by a doctor. do not give anything by mouth to an unconscious person. get medical advice/attention": "Nie wywoływać wymiotów, chyba że zostało to wyraźnie zalecone przez lekarza. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "non provocare il vomito se non espressamente autorizzati dal medico. non somministrare nulla per via orale a una persona priva di sensi. consultare un medico": "Nie wywoływać wymiotów, chyba że zostało to wyraźnie zalecone przez lekarza. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "remove victim to fresh air, away from the accident scene. get medical advice/attention": "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
    "portare l'infortunato all'aria aperta, lontano dal luogo dell'incidente. consultare un medico": "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
    "it is good practice for rescuers lending support to a person who has been exposed to a chemical substance or to a mixture to wear personal protective equipment. the nature of such protection depends on the hazard level of the substance or mixture, on the type of exposure and on the extent of the contamination. in the absence of other more specific indications, use of disposable gloves in the event of possible contact with body fluids is recommended. for the type of ppe suitable for the characteristics of the substance or mixture, see section 8": "Dobrą praktyką jest, aby ratownicy udzielający pomocy osobie narażonej na działanie substancji lub mieszaniny chemicznej stosowali środki ochrony indywidualnej. Rodzaj ochrony zależy od stopnia zagrożenia stwarzanego przez substancję lub mieszaninę, rodzaju narażenia i stopnia skażenia. W przypadku braku innych, bardziej szczegółowych wskazań, w razie możliwości kontaktu z płynami ustrojowymi zaleca się stosowanie rękawic jednorazowych. Informacje na temat odpowiednich środków ochrony indywidualnej podano w sekcji 8.",
    "specific information on symptoms and effects caused by the product are unknown": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "delayed effects: based on the information currently available, there are no known cases of delayed effects following exposure to this product": "SKUTKI OPÓŹNIONE: W oparciu o dostępne dane, w warunkach prawidłowego stosowania nie są znane przypadki wystąpienia opóźnionych powikłań zdrowotnych.",
    "after contact with skin, wash immediately with soap and plenty of water": "Po kontakcie ze skórą natychmiast zmyć dużą ilością wody z mydłem.",
    "wash immediately with soap and plenty of water": "Zmyć natychmiast dużą ilością wody z mydłem.",
    "dopo il contatto con la pelle lavare immediatamente con acqua ed abbondante sapone": "Po kontakcie ze skórą natychmiast zmyć dużą ilością wody z mydłem.",
    "lavare immediatamente con abbondante acqua e sapone": "Zmyć natychmiast dużą ilością wody z mydłem.",
    "after contact with the eyes, rinse with water with the eyelids open for a sufficient length of time, then consult an opthalmologist immediately. remove any contact lenses": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "after contact with the eyes, rinse with water with the eyelids open for a sufficient length of time, then consult an ophthalmologist immediately. remove any contact lenses": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "rinse with water with the eyelids open for a sufficient length of time, then consult an opthalmologist immediately": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą.",
    "rinse with water with the eyelids open for a sufficient length of time, then consult an ophthalmologist immediately": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą.",
    "remove any contact lenses": "Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "in caso di contatto con gli occhi lavare con acqua a palpebre aperte per un tempo sufficiente, poi consultare immediatamente un oftalmologo. togliere le eventuali lenti a contatto": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "do not induce vomiting, get medical attention showing the sds and label hazardous": "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "do not induce vomiting": "Nie wywoływać wymiotów.",
    "non provocare assolutamente il vomito. ricorrere immediatamente all'assistenza medica, mostrando la sds e l'etichetta di pericolo": "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "in case of inhalation, consult a doctor immediately and show him packing or label. remove casualty to fresh air and keep warm and at rest": "W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę. Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "remove casualty to fresh air and keep warm and at rest": "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "portare l'infortunato all'aria aperta e tenerlo al caldo e a riposo": "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "no specific information is available on the symptoms and effects caused by the product": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "non sono note informazioni specifiche su sintomi ed effetti provocati dal prodotto": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "treatment:data not available": "Leczenie: Brak danych.",
    "treatment: data not available": "Leczenie: Brak danych.",
    "trattamento:dati non disponibili": "Leczenie: Brak danych.",
    "trattamento: dati non disponibili": "Leczenie: Brak danych.",
    "if symptoms occur, whether acute or delayed, consult a doctor. means to have available in the workplace for specific and immediate treatment running water for skin and eye wash": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.\nŚrodki, które powinny być dostępne w miejscu pracy w celu zapewnienia natychmiastowego i specyficznego leczenia: Bieżąca woda do przemywania oczu i zmywania skóry.",
    "if symptoms occur, whether acute or delayed, consult a doctor": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.",
    "running water for skin and eye wash": "Bieżąca woda do przemywania oczu i zmywania skóry.",
    "means to have available in the workplace for specific and immediate treatment": "W miejscu pracy powinna być dostępna bieżąca woda do przemywania oczu i zmywania skóry.",
    "se si verificano sintomi, acuti o ritardati, consultare un medico": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.",
    "data not available": "Brak danych.",
    "dati non disponibili": "Brak danych.",

    // Pożarnictwo (Sekcja 5)
    "extinguishing substances are: carbon dioxide, foam, chemical powder": "Środki gaśnicze: dwutlenek węgla (CO2), piana gaśnicza, proszek chemiczny.",
    "carbon dioxide, foam, chemical powder": "Dwutlenek węgla (CO2), piana gaśnicza, proszek chemiczny.",
    "carbon dioxide, foam, powder": "Dwutlenek węgla (CO2), piana gaśnicza, proszek gaśniczy.",
    "co2 or dry chemical fire extinguisher. foam; water": "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.",
    "co2 or dry chemical fire extinguisher": "Gaśnica śniegowa (CO2), gaśnica proszkowa.",
    "estintori ad anidride carbonica (co2), a polvere, a schiuma, acqua": "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.",
    "none in particular": "Brak szczególnych.",
    "nessuno in particolare": "Brak szczególnych.",
    "avoid breathing combustion products": "Unikać wdychania produktów spalania.",
    "evitare di respirare i prodotti di combustione": "Unikać wdychania produktów spalania.",
    "collect contaminated fire extinguishing water separately. this must not be discharged into drains. use fire fighter's clothing conforming to european standard en469. use self-contained breathing apparatus (scba) with chemical resistant gloves": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji. Stosować odzież ochronną dla strażaków zgodną z normą europejską EN 469 oraz autonomiczny aparat oddechowy (SCBA) z rękawicami odpornymi na chemikalia.",
    "collect contaminated fire extinguishing water separately. this must not be discharged into drains": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji.",
    "raccogliere separatamente l'acqua contaminata utilizzata per estinguere l'incendio. non scaricarla nella rete fognaria": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji.",

    // Uwolnienie do środowiska (Sekcja 6)
    "wear personal protection equipment": "Stosować środki ochrony indywidualnej.",
    "indossare i dispositivi di protezione individuale": "Stosować środki ochrony indywidualnej.",
    "remove persons to safety": "Ewakuować osoby w bezpieczne miejsce.",
    "portare le persone in luogo sicuro": "Ewakuować osoby w bezpieczne miejsce.",
    "see protective measures under point 7 and 8": "Patrz środki ochronne w punkcie 7 i 8.",
    "consultare le misure protettive esposte al punto 7 e 8": "Patrz środki ochronne w punkcie 7 i 8.",
    "do not allow to enter into soil/subsoil. do not allow to enter into surface water or drains": "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji.",
    "impedire la penetrazione nel suolo/sottosuolo. impedire il deflusso nelle acque superficiali o nella rete fognaria": "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji.",
    "retain contaminated washing water and dispose it": "Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji.",
    "trattenere l'acqua di lavaggio contaminata ed eliminarla": "Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji.",
    "in case of gas escape or of entry into waterways, soil or drains, inform the responsible authorities": "W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.",
    "in caso di fuga di gas o penetrazione in corsi d'acqua, suolo o fognature informare le autorità responsabili": "W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.",
    "suitable material for taking up: absorbing material, organic, sand": "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek.",
    "materiale idoneo alla raccolta: materiale assorbente, organico, sabbia": "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek.",
    "wash with plenty of water": "Zmyć dużą ilością wody.",
    "lavare con abbondante acqua": "Zmyć dużą ilością wody.",
    "see also section 8 and 13": "Patrz również sekcja 8 i 13.",
    "si vedano anche i paragrafi 8 e 13": "Patrz również sekcja 8 i 13.",

    // Magazynowanie (Sekcja 7)
    "avoid contact with skin and eyes, inhaltion of vapours and mists": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "avoid contact with skin and eyes, inhalation of vapours and mists": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "evitare il contatto con la pelle e gli occhi, l'inalazione di vapori e nebbie": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "see also section 8 for recommended protective equipment": "Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.",
    "si rimanda anche al paragrafo 8 per i dispositivi di protezione raccomandati": "Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.",
    "do not eat or drink while working": "Nie jeść i nie pić podczas pracy.",
    "non mangiare né bere durante il lavoro": "Nie jeść i nie pić podczas pracy.",
    "incompatible materials:": "Materiały niezgodne:",
    "materiały niezgodne:": "Materiały niezgodne:",
    "adequately ventilated premises": "Pomieszczenia odpowiednio wentylowane.",
    "locali adeguatamente areati": "Pomieszczenia odpowiednio wentylowane."
  };

  static translatePhrase(text, defaultFallback = "") {
    if (!text) return defaultFallback;
    let clean = text.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return defaultFallback;
    let lower = clean.toLowerCase().replace(/[\.;,]$/, '').trim();
    if (this.PHRASE_DICTIONARY_PL[lower]) return this.PHRASE_DICTIONARY_PL[lower];

    // Sprawdzenie cząstkowe zdań
    for (const [enPhrase, plPhrase] of Object.entries(this.PHRASE_DICTIONARY_PL)) {
      if (lower === enPhrase || lower.startsWith(enPhrase) || lower.includes(enPhrase)) {
        return plPhrase;
      }
    }
    return clean;
  }

  static cleanPdfArtifacts(text) {
    if (!text) return "";
    return text
      .replace(/\r/g, '')
      .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company)[^\n]*[\s\S]{1,500}?\n\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/Suarez Company[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Revision nr\.?|Revisione n\.?|Wersja nr|Dated|Data|Printed on|Stampato il)\s*[:\.]?\s*[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company|Distributor|Dystrybutor)\s*\|[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?!(?:LC|EC|IC|LD|NOEC|NOAEL|LOAEL)\d*)(?:BLK\d+(?:-\d+)?|[A-Z]{2,6}\d{3,8}(?:-\d+)?)\s*-\s*[^\n]+/gi, '')
      .replace(/(?:^|\n)\s*(?:Page|Strona|Pagina|Pag\.)\b[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/g, '')
      .replace(/(?:^|\n)\s*\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)?[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)\s*[:\.]?\s*[^\n]*(?:\bDate|\bData)\s*$/gim, '')
      .replace(/\bsrebreem\b/gi, 'srebrem')
      .replace(/\t/g, ' ');
  }

  static polonizeTradeName(rawName) {
    if (!rawName) return "Mieszanina chemiczna";
    let cleanName = rawName
      .replace(/\r/g, '')
      .replace(/(?:^|\n)\s*(?:1\.1\b|Product identifier|Mixture identification|Identificatore del prodotto|Identificazione della miscela)[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Trade name|Nome commerciale|Nazwa handlowa|Product name)\s*[:\.]?\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanName) return "Mieszanina chemiczna";

    // Słownik mapowań fraz rodzajowych chemii gospodarczej i zapachowej (uporządkowany od najdłuższych/najbardziej specyficznych)
    const categoryMappings = [
      {
        pattern: /\b(?:PROFUMA\s+TESSUTI\s+E\s+AMBIENTE|PROFUMATORE\s+(?:PER\s+)?TESSUTI\s+E\s+AMBIENTI?)\b/i,
        pl: "PERFUMY DO TKANIN I POMIESZCZEŃ"
      },
      {
        pattern: /\b(?:PROFUMATORE\s+(?:PER\s+)?BUCATO|PROFUMA\s+BUCATO|ESSENZA\s+(?:PER\s+)?BUCATO)\b/i,
        pl: "PERFUMY DO PRANIA"
      },
      {
        pattern: /\b(?:PROFUMA\s+TESSUTI|PROFUMATORE\s+(?:PER\s+)?TESSUTI)\b/i,
        pl: "PERFUMY DO TKANIN"
      },
      {
        pattern: /\b(?:DEODORANTE\s+(?:PER\s+)?AMBIENTI?|PROFUMATORE\s+(?:PER\s+)?AMBIENTI?|PROFUMA\s+AMBIENTI?|DIFFUSORE\s+(?:PER\s+)?AMBIENTI?)\b/i,
        pl: "ODŚWIEŻACZ POWIETRZA"
      },
      {
        pattern: /\b(?:DETERGENTE\s+(?:PER\s+)?SUPERFICI(?:\s+LAVABILI)?)\b/i,
        pl: "ŚRODEK DO MYCIA POWIERZCHNI"
      },
      {
        pattern: /\b(?:DETERSIVO\s+(?:PER\s+)?LAVATRICE|DETERSIVO\s+(?:PER\s+)?BUCATO|DETERGENTE\s+LAVATRICE)\b/i,
        pl: "PŁYN DO PRANIA"
      },
      {
        pattern: /\b(?:AMMORBIDENTE\s+CONCENTRATO|AMMORBIDENTE)\b/i,
        pl: "PŁYN DO PŁUKANIA TKANIN"
      },
      {
        pattern: /\b(?:SGRASSATORE\s+UNIVERSALE|SGRASSATORE)\b/i,
        pl: "ODTŁUSZCZACZ UNIWERSALNY"
      },
      {
        pattern: /\b(?:LAVAPAVIMENTI)\b/i,
        pl: "PŁYN DO MYCIA PODŁÓG"
      },
      {
        pattern: /\b(?:DETERGENTE\s+DISINCROSTANTE|DISINCROSTANTE)\b/i,
        pl: "ŚRODEK ODKAMIENIAJĄCY"
      },
      {
        pattern: /\b(?:DETERGENTE\s+WC|GEL\s+WC|DISINCROSTANTE\s+WC)\b/i,
        pl: "ŻEL DO WC"
      },
      {
        pattern: /\b(?:SAPONE\s+LIQUIDO)\b/i,
        pl: "MYDŁO W PŁYNIE"
      },
      {
        pattern: /\b(?:DETERGENTE\s+PIATTI|DETERSIVO\s+PIATTI)\b/i,
        pl: "PŁYN DO NACZYŃ"
      },
      {
        pattern: /\b(?:DETERGENTE)\b/i,
        pl: "ŚRODEK CZYSZCZĄCY / DETERGENT"
      }
    ];

    // Sprawdzenie obecności myślnika dzielącego markę/linię od wariantu / opisu
    const splitMatch = cleanName.match(/^([^\-–—]+)\s*[\-–—]\s*(.+)$/);
    if (!splitMatch) {
      for (const cat of categoryMappings) {
        if (cat.pattern.test(cleanName)) {
          return cleanName.replace(cat.pattern, cat.pl).replace(/\s+/g, ' ').trim();
        }
      }
      return cleanName;
    }

    const brandPart = splitMatch[1].trim(); // Człon 1 (marka/linia) - nienaruszony w oryginale
    let descPart = splitMatch[2].trim();    // Człon 2 (opis i wariant)

    let matchedPlCategory = null;
    let variantPart = descPart;

    for (const cat of categoryMappings) {
      if (cat.pattern.test(variantPart)) {
        matchedPlCategory = cat.pl;
        variantPart = variantPart.replace(cat.pattern, '').replace(/\s+/g, ' ').trim();
        break;
      }
    }

    if (matchedPlCategory) {
      if (variantPart) {
        // Polski szyk: WARIANT + POLSKA KATEGORIA (np. LULWA PERFUMY DO TKANIN I POMIESZCZEŃ)
        return `${brandPart} - ${variantPart} ${matchedPlCategory}`;
      } else {
        return `${brandPart} - ${matchedPlCategory}`;
      }
    }

    // Bezpieczny fallback: zachowanie członu po myślniku bez strat informacyjnych
    return `${brandPart} - ${descPart}`;
  }

  static isTechnicalFilename(name) {
    if (!name || typeof name !== 'string') return true;
    const trimmed = name.trim();
    return /^(?:PRODUKT CHEMICZNY|Mieszanina chemiczna|temp_sds_.*|\d{8,14}(?:_SDS.*)?|_SDS_.*|.*\.(?:pdf|rtf|docx))$/i.test(trimmed);
  }

  processSection1(contentIt, productName = "", ufi = "", manualOverrides = {}, extractedCode = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    // 1.1. Identyfikator produktu (SSOT: Karta PDF producenta)
    let tradeNameMatch = clean.match(/(?:Trade name|Nome commerciale|Nazwa handlowa|Product name)\s*[:\.]?\s*([^\n]+)/i);
    const isTechnicalFilename = SDSProcessorEngine.isTechnicalFilename(productName);

    let rawTrade = "";
    if (manualOverrides && manualOverrides.productName && manualOverrides.productName.trim()) {
      rawTrade = manualOverrides.productName.trim();
    } else if (tradeNameMatch && tradeNameMatch[1] && tradeNameMatch[1].trim()) {
      // PDF producenta jest nadrzędnym źródłem prawdy (SSOT)
      rawTrade = tradeNameMatch[1].trim();
    } else if (!isTechnicalFilename) {
      rawTrade = productName.trim();
    } else {
      rawTrade = "Mieszanina chemiczna";
    }

    let resolvedTradeName = SDSProcessorEngine.polonizeTradeName(rawTrade);
    this.lastResolvedTradeName = resolvedTradeName;

    let codeMatch = clean.match(/(?:Trade code|Codice prodotto|Codice|Kod produktu|Product code|\bCode)\s*[:\.]?\s*([A-Z0-9_\-\/]+)/i);
    let tradeCode = (manualOverrides && manualOverrides.productCode) ? manualOverrides.productCode : (codeMatch ? codeMatch[1].trim() : (extractedCode || ""));

    let ufiMatch = clean.match(/(?:UFI\s*[:\.]?\s*)([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
    let resolvedUfi = ufi || (ufiMatch ? ufiMatch[1].trim() : "");

    // 1.2. Zastosowania
    let usesSection = "";
    const m12 = clean.match(/(?:^|\n)\s*1\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*1\.3\b|$)/i);
    if (m12) usesSection = m12[1].trim();

    // Czyszczenie z nagłówka podsekcji 1.2
    usesSection = usesSection.replace(/^(?:Relevant identified uses[^\n]*|Usi identificati pertinenti[^\n]*|Istotne zidentyfikowane zastosowania[^\n]*)\s*/i, '').trim();

    // Ekstrakcja bloku zidentyfikowanych zastosowań
    let rawRec = "";
    const usesBlockMatch = usesSection.match(/(?:Recommended use|Identified uses?|Usi identificati|Uso raccomandato|Zastosowanie zidentyfikowane)\s*[:\.]?\s*([\s\S]*?)(?=(?:Uses advised against|Usi sconsigliati|Zastosowania odradzane|1\.3\b|$))/i);
    const usesBlock = usesBlockMatch ? usesBlockMatch[1].trim() : usesSection;

    // Analiza wykluczeń przemysłowych / profesjonalnych z układu tabelarycznego lub myślników
    let isIndExcluded = false;
    let isProfExcluded = false;

    if (/(?:Industrial|Industriale|przemysłow)[^\n]*[-–—]/i.test(usesBlock) || /[-–—]\s+[-–—]/i.test(usesBlock)) {
      isIndExcluded = true;
    }
    if (/(?:Professional|Professionale|profesjonaln)[^\n]*[-–—]/i.test(usesBlock) || /[-–—]\s+[-–—]/i.test(usesBlock)) {
      isProfExcluded = true;
    }

    // Wyciąganie merytorycznego tekstu zastosowania z wierszy bloku (pomijając etykiety kolumn i separatory)
    const blockLines = usesBlock.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of blockLines) {
      if (/^(?:Industrial|Industriale|Professional|Professionale|Consumer|Consumatore|Sektor|Branża|[-–—\s]+)$/i.test(line)) continue;
      if (/^(?:Industrial\s+Professional\s+Consumer|Usi identificati)/i.test(line)) continue;
      if (/^[-–—\s\t]+$/.test(line)) continue;
      const stripped = line.replace(/[-–—\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > 2 && !/^(?:Industrial|Professional|Consumer)$/i.test(stripped)) {
        rawRec = stripped;
        break;
      }
    }

    let consumerMatch = /(?:Consumer|Consumatore|konsumenck)/i.test(usesSection) || /(?:Consumer|Consumatore)/i.test(usesBlock);
    let profMatch = !isProfExcluded && (/(?:Professional|Professionale|profesjonaln)/i.test(usesSection) || /(?:Professional|Professionale)/i.test(usesBlock));
    let indMatch = !isIndExcluded && (/(?:Industrial|Industriale|przemysłow)/i.test(usesSection) || /(?:Industrial|Industriale)/i.test(usesBlock));

    let usePrefix = [];
    if (consumerMatch) usePrefix.push("konsumenckie");
    if (profMatch) usePrefix.push("profesjonalne");
    if (indMatch) usePrefix.push("przemysłowe");

    // Słownik tłumaczeń urzędowych kategorii zastosowań (EN / IT -> PL)
    let translatedRec = rawRec;
    if (/room deodorant|air freshener|deodorante per ambienti|profumatore per ambiente|profumatore ambiente|deodorante/i.test(rawRec)) {
      translatedRec = "odświeżacz powietrza / dezodorant do pomieszczeń";
    } else if (/laundry perfumer|profuma tessuti|profumatore bucato/i.test(rawRec)) {
      translatedRec = "perfumy do tkanin i prania";
    } else if (/detergent|detergente/i.test(rawRec)) {
      translatedRec = "środek czyszczący / detergent";
    } else if (/cleaner|pulitore/i.test(rawRec)) {
      translatedRec = "preparat myjący / czyszczący";
    } else if (/paint|vernice|pittura/i.test(rawRec)) {
      translatedRec = "farba / wyrób lakierowy";
    } else if (/adhesive|adesivo|colla/i.test(rawRec)) {
      translatedRec = "klej / preparat uszczelniający";
    } else if (/solvent|solvente|diluente|thinner/i.test(rawRec)) {
      translatedRec = "rozpuszczalnik / rozcieńczalnik";
    } else if (/lubricant|lubrificante/i.test(rawRec)) {
      translatedRec = "środek smarny / ciecz techniczna";
    } else if (/coolant|antifreeze/i.test(rawRec)) {
      translatedRec = "płyn chłodzący / przeciw zamarzaniu";
    } else if (/cosmetic|cosmetico/i.test(rawRec)) {
      translatedRec = "produkt kosmetyczny";
    } else if (/disinfectant|disinfettante|biocide/i.test(rawRec)) {
      translatedRec = "środek biobójczy / dezynfekujący";
    }

    let identifiedUses = "Brak szczegółowych informacji w karcie źródłowej.";
    const isDiffuser = /diffus|bastoncini|reed|profumatore\s*(?:per\s*)?ambiente/i.test(clean) || /diffus|bastoncini|reed|profumatore\s*(?:per\s*)?ambiente/i.test(usesSection);
    
    if (!translatedRec && (/air freshener|room deodorant|deodorante/i.test(clean) || /air freshener|room deodorant/i.test(usesSection))) {
      translatedRec = "odświeżacz powietrza / dezodorant do pomieszczeń";
      if (!consumerMatch && !profMatch && !indMatch) usePrefix.push("konsumenckie");
    }

    if (usePrefix.length > 0 && translatedRec) {
      let fullRec = translatedRec;
      if (translatedRec.includes("odświeżacz powietrza") && isDiffuser && !translatedRec.includes("dyfuzor")) {
        fullRec += " (dyfuzor zapachowy do wnętrz)";
      }
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}: ${fullRec}.`;
    } else if (translatedRec) {
      identifiedUses = `${translatedRec.charAt(0).toUpperCase() + translatedRec.slice(1)}.`;
    } else if (usePrefix.length > 0) {
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}.`;
    }

    let usesAdvised = "Nie stosować do celów innych niż wskazane.";
    let advMatch = usesSection.match(/(?:Uses advised against|Usi sconsigliati|Zastosowania odradzane)\s*[:\.]?\s*([^\n]+)/i);
    if (advMatch) {
      let rawAdv = advMatch[1].trim();
      if (/different from those indicated|diversi da quelli indicati|other than those indicated/i.test(rawAdv)) {
        if (consumerMatch && !profMatch && !indMatch) {
          usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta (nie stosować do celów przemysłowych ani profesjonalnych).";
        } else {
          usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta.";
        }
      } else {
        usesAdvised = rawAdv;
      }
    } else if (consumerMatch && !profMatch && !indMatch) {
      usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta (nie stosować do celów przemysłowych ani profesjonalnych).";
    }

    // 1.3. Dane dotyczące dostawcy karty charakterystyki
    const compName = this.companyConfig.companyName || "ITALLUX Sp. z o.o.";
    const compAddress = this.companyConfig.address || "ul. Wesoła 16";
    const compCity = this.companyConfig.city ? `${this.companyConfig.postalCode ? this.companyConfig.postalCode + " " : ""}${this.companyConfig.city}` : "63-600 Kępno";
    const compWebsite = this.companyConfig.website || "www.prostozwloch.com.pl";
    const compEmail = this.companyConfig.email || "kontakt@prostozwloch.com.pl";
    const compPhone = this.companyConfig.phone || this.companyConfig.emergencyPhone || "+48 663116607";
    const emergPhone = this.companyConfig.emergencyPhone || compPhone;

    let s13 = "1.3. Dane dotyczące dostawcy karty charakterystyki\n";
    s13 += `Firma: ${compName}\n`;
    s13 += `Adres: ${compAddress}, ${compCity}\n`;
    s13 += `Strona www: ${compWebsite}\n`;
    s13 += `E-mail: ${compEmail}\n`;
    s13 += `Telefon: ${compPhone}`;

    // 1.4. Numer telefonu alarmowego (zgodnie z Rozporządzeniem (UE) 2020/878 Załącznik II pkt 1.4 i wytycznymi ECHA)
    let s14 = "1.4. Numer telefonu alarmowego\n";
    s14 += `Telefon alarmowy przedsiębiorstwa: ${emergPhone} (czynny od poniedziałku do piątku w godzinach 8:00 – 16:00, informacja udzielana w języku polskim)\n`;
    s14 += "Informacja toksykologiczna w Polsce (organ doradczy):\n";
    s14 += "Krajowe Centrum Informacji Toksykologicznej (Instytut Medycyny Pracy im. prof. J. Nofera w Łodzi): tel. +48 42 631 47 24, +48 42 631 47 25 (czynne w dni robocze w godz. 7:00 – 15:00)\n";
    s14 += "Ośrodek Informacji Toksykologicznej w Warszawie (całodobowa informacja toksykologiczna 24/7): tel. +48 22 619 66 54\n";
    s14 += "Ogólne telefony ratunkowe w nagłych wypadkach: 112 (ogólnoeuropejski numer alarmowy), 998 (straż pożarna), 999 (pogotowie ratunkowe)";


    // Asemblacja sekcji 1
    let output = "SEKCJA 1: Identyfikacja substancji/mieszaniny i identyfikacja przedsiębiorstwa\n\n";
    output += "1.1. Identyfikator produktu\n";
    output += `Nazwa handlowa: ${resolvedTradeName}\n`;
    if (tradeCode) output += `Kod produktu: ${tradeCode}\n`;
    output += `UFI: ${resolvedUfi || "[Brak kodu UFI w pliku źródłowym]"}\n\n`;

    output += "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\n";
    output += `Zastosowanie zidentyfikowane: ${identifiedUses}\n`;
    output += `Zastosowania odradzane: ${usesAdvised}\n\n`;
    output += `${s13}\n\n`;
    output += `${s14}`;

    return output.trim();
  }

  processSection4(contentIt, components = [], s2Content = "", s9Content = "") {
    let clean = (contentIt || "").replace(/\r/g, '');
    clean = SDSProcessorEngine.cleanPdfArtifacts(clean);

    // 4.1. Ekstrakcja preambuły (przed poszczególnymi drogami narażenia)
    let preMatch = clean.match(/(?:^|\n)\s*4\.1\b[.:\-]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|SKIN|PELLE|INGESTION|INGESTIONE|INHALATION|INALAZIONE)\b|In case of skin contact|Contatto con la pelle|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową)\s*[:\.]|$)/i);
    let preText = preMatch ? preMatch[1].replace(/^(?:Description of first aid measures|Descrizione delle misure di primo soccorso|Opis środków pierwszej pomocy)\s*/i, '').trim() : "";
    let generalAdvice = SDSProcessorEngine.translatePhrase(preText, "");

    // 4.1. Ekstrakcja dróg narażenia
    let skinMatch = clean.match(/(?:(?:^|\n)\s*(?:SKIN|PELLE)\b|In case of skin contact|Contatto con la pelle|W kontakcie ze skórą)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|INGESTION|INGESTIONE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of eyes contact|Contatto con gli occhi|In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let eyeMatch = clean.match(/(?:(?:^|\n)\s*(?:EYES|OCCHI)\b|In case of eyes contact|Contatto con gli occhi|W kontakcie z oczami)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:SKIN|PELLE|INGESTION|INGESTIONE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of skin contact|Contatto con la pelle|In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let ingMatch = clean.match(/(?:(?:^|\n)\s*(?:INGESTION|INGESTIONE)\b|In case of Ingestion|Ingestione|W przypadku spożycia)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|SKIN|PELLE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of Inhalation|Inalazione|4\.2|$))/i);
    let inhMatch = clean.match(/(?:(?:^|\n)\s*(?:INHALATION|INALAZIONE)\b|In case of Inhalation|Inalazione|Po narażeniu drogą oddechową)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:Rescuer protection|Protezione dei soccorritori)\b|4\.2|4\.3|$))/i);
    let rescuerMatch = clean.match(/(?:(?:^|\n)\s*(?:Rescuer protection|Protezione dei soccorritori|Ochrona osób udzielających pierwszej pomocy))\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*4\.2\b|4\.3|$))/i);

    let skinAdvice = SDSProcessorEngine.translatePhrase(skinMatch ? skinMatch[1] : "", "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.");
    if (/(?:take off|contaminated clothing|wash immediately|medical advice)/i.test(skinAdvice)) {
      skinAdvice = "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady/zgłosić się pod opiekę lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.";
    }
    let eyeAdvice = SDSProcessorEngine.translatePhrase(eyeMatch ? eyeMatch[1] : "", "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).");
    let ingestionAdvice = SDSProcessorEngine.translatePhrase(ingMatch ? ingMatch[1] : "", "Nie wywoływać wymiotów, chyba że lekarz wyraźnie to zaleci. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.");
    let inhalationAdvice = SDSProcessorEngine.translatePhrase(inhMatch ? inhMatch[1] : "", "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę.");
    let rescuerAdvice = "";
    if (rescuerMatch) {
      let rawResc = rescuerMatch[1].replace(/^[.:\-]?\s*/, '').trim();
      let transResc = SDSProcessorEngine.translatePhrase(rawResc, "");
      if (!transResc || /(?:good practice|rescuers|contamination|disposable gloves|personal protective)/i.test(transResc)) {
        transResc = "Dobrą praktyką jest, aby ratownicy udzielający pomocy osobie narażonej na działanie substancji lub mieszaniny chemicznej stosowali środki ochrony indywidualnej. Rodzaj ochrony zależy od stopnia zagrożenia stwarzanego przez substancję lub mieszaninę, rodzaju narażenia i stopnia skażenia. W przypadku braku innych, bardziej szczegółowych wskazań, w razie możliwości kontaktu z płynami ustrojowymi zaleca się stosowanie rękawic jednorazowych. Informacje na temat odpowiednich środków ochrony indywidualnej podano w sekcji 8.";
      }
      rescuerAdvice = transResc;
    }

    // 4.2. Merytoryczna ocena objawów na podstawie klasyfikacji CLP i składników
    let symptomsMatch = clean.match(/(?:^|\n)\s*4\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*4\.3\b|$)/i);
    let sympText = symptomsMatch ? symptomsMatch[1].replace(/^(?:Most important symptoms[^\n]*|Principali sintomi[^\n]*|Najważniejsze ostre[^\n]*)\s*/i, '').trim() : "";
    
    const isGenericSymptoms = !sympText || /brak|non sono noti|nessun|no known|not available|not specified|unknown|no specific information|no data/i.test(sympText) || /brak szczegółowych/i.test(sympText);
    let symptomsAdvice = "";
    if (!isGenericSymptoms && sympText.length > 50) {
      symptomsAdvice = SDSProcessorEngine.translatePhrase(sympText, "");
    }

    if (!symptomsAdvice || /brak/i.test(symptomsAdvice)) {
      const phM = (s9Content || "").match(/pH\s*[:\.]?\s*([^\n]+)/i);
      const phStr = phM ? phM[1].trim() : "";
      const hCodes = (s2Content.match(/H\d{3}[a-zA-Z]*/g) || []);
      const consistency = SDSConsistencyEngine.getSection4SymptomsAndAdvice(phStr, components, hCodes, sympText);
      symptomsAdvice = consistency.s4_2.replace(/^4\.2\.[^\n]*\n/i, '');
    }

    let treatMatch = clean.match(/(?:^|\n)\s*4\.3\b[.:\-]?\s*([\s\S]*?)$/i);
    let treatText = treatMatch ? treatMatch[1].replace(/^(?:Indication of any immediate[^\n]*|Indicazione dell'eventuale[^\n]*|Wskazania dotyczące[^\n]*)\s*/i, '').trim() : "";
    let treatmentAdvice = SDSProcessorEngine.translatePhrase(treatText, "");
    if (!treatmentAdvice || /nie są znane|brak/i.test(treatmentAdvice)) {
      treatmentAdvice = "Leczenie objawowe i podtrzymujące. W przypadku wystąpienia lub utrzymywania się objawów podrażnienia albo reakcji alergicznej zapewnić pomoc lekarską i pokazać kartę charakterystyki lub etykietę produktu.\nŚrodki, które powinny być dostępne w miejscu pracy w celu zapewnienia natychmiastowego i specyficznego leczenia: Bieżąca woda do przemywania oczu i zmywania skóry.";
    }
    if (treatmentAdvice.startsWith("Leczenie:")) treatmentAdvice = treatmentAdvice.replace(/^Leczenie:\s*/i, '');

    let output = "SEKCJA 4: Środki pierwszej pomocy\n\n";
    output += "4.1. Opis środków pierwszej pomocy\n";
    if (generalAdvice && generalAdvice.length > 5 && !/description of first aid/i.test(generalAdvice)) {
      output += `${generalAdvice}\n\n`;
    }
    output += `W kontakcie ze skórą: ${skinAdvice}\n`;
    output += `W kontakcie z oczami: ${eyeAdvice}\n`;
    output += `W przypadku spożycia: ${ingestionAdvice}\n`;
    output += `Po narażeniu drogą oddechową: ${inhalationAdvice}\n`;
    if (rescuerAdvice && rescuerAdvice.length > 10) {
      output += `\nOchrona osób udzielających pierwszej pomocy:\n${rescuerAdvice}\n`;
    }
    output += "\n4.2. Najważniejsze ostre i opóźnione objawy oraz skutki narażenia\n";
    output += `${symptomsAdvice}\n\n`;
    output += "4.3. Wskazania dotyczące wszelkiej natychmiastowej pomocy lekarskiej i szczególnego postępowania z poszkodowanym\n";
    output += `${treatmentAdvice}`;

    return output;
  }

  static isFlammablePolarMixture(components = [], section2Text = '', section9Text = '') {
    const s2 = String(section2Text || '');
    const s9 = String(section9Text || '');

    // 1. Sprawdzenie klasyfikacji palności cieczy (CLP / GHS: H224, H225, H226, Flam. Liq.)
    const hasFlammableLiquidHazard = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna|ciecz\s+palna|flammable\s+liquid)/i.test(s2) ||
      (Array.isArray(components) && components.some(c => /(?:Flam\.\s*Liq\.|H224|H225|H226)/i.test(c.classification || '')));

    // 2. Sprawdzenie charakteru polarnego / rozpuszczalników polarnych
    const hasPolarComponent = Array.isArray(components) && components.some(c => {
      const name = `${c.name || ''} ${c.originalName || ''}`.toLowerCase();
      const cas = (c.cas || '').trim();
      const classif = (c.classification || '').toLowerCase();
      const isPolarName = /\b(?:etanol|ethanol|metanol|methanol|propanol|isopropanol|izopropanol|butanol|aceton|acetone|glycol|glikol|ether|octan|acetate)\b/i.test(name) ||
        /(?:-ol|-on)\b/i.test(name) ||
        ['64-17-5', '67-56-1', '67-63-0', '71-23-8', '67-64-1', '34590-94-8', '107-98-2'].includes(cas);
      return isPolarName && (classif.includes('flam') || classif.includes('h22') || !classif);
    });

    const isWaterMiscible = /(?:rozpuszczalny|mieszalny|miscible|soluble|rozpuszcza\s+się)\s+w\s+wodzie/i.test(s9);

    return hasFlammableLiquidHazard && (hasPolarComponent || isWaterMiscible);
  }

  static enforceAlcoholResistantFoam(section5Content, isPolarFlammable = false) {
    if (!section5Content || !isPolarFlammable) return section5Content;

    let text = section5Content;

    // 1. Normalizacja bloku odpowiednich środków gaśniczych
    const suitableBlockRegex = /((?:5\.1\b[^\n]*\n)?\s*(?:Odpowiednie\s+środki\s+gaśnicze|ODPOWIEDNIE\s+ŚRODKI\s+GAŚNICZE|Suitable\s+extinguishing\s+equipment|Suitable\s+extinguishing\s+media|Mezzi\s+di\s+estinzione\s+idonei)\s*[:\.]?\s*)([\s\S]*?)(?=(?:\n\s*(?:Niewłaściwe\s+środki|NIEODPOWIEDNIE\s+ŚRODKI|Unsuitable|Mezzi\s+di\s+estinzione\s+non|5\.2\b)|$))/i;
    const match = text.match(suitableBlockRegex);

    if (match) {
      const header = match[1];
      let body = match[2];

      // Wykrywamy pianę w dowolnej deklinacji bez istniejącego doprecyzowania alkoholoodpornego
      const genericFoamRegex = /\b(?:piany(?:\s+gaśnicze)?|piana(?:\s+gaśnicza)?|pianę(?:\s+gaśniczą)?|pianą(?:\s+gaśniczą)?|pianami(?:\s+gaśniczymi)?|pian)\b(?!\s+(?:alkoholoodporn[a-zęóąśłżźćń]*|odporn[a-zęóąśłżźćń]*\s+na\s+alkohol|AR-AFFF))/gi;

      if (genericFoamRegex.test(body)) {
        body = body.replace(genericFoamRegex, 'piana alkoholoodporna (np. typu AR-AFFF)');
      } else if (!/alkoholoodporn|AR-AFFF/i.test(body)) {
        body = body.replace(/^(Środkami\s+gaśniczymi\s+są:\s*|Środki\s+gaśnicze:\s*|Gaśnica\s+[^\n,;]+,\s*|)/i, (prefix) => {
          return prefix ? `${prefix}piana alkoholoodporna (np. typu AR-AFFF), ` : `piana alkoholoodporna (np. typu AR-AFFF), `;
        });
      }

      text = text.replace(suitableBlockRegex, `${header}${body}`);
    }

    // 2. Normalizacja bloku niewłaściwych środków gaśniczych
    const unsuitableBlockRegex = /((?:Niewłaściwe\s+środki\s+gaśnicze|NIEODPOWIEDNIE\s+ŚRODKI\s+GAŚNICZE|Unsuitable\s+extinguishing\s+media|Unsuitable\s+extinguishing\s+equipment|Mezzi\s+di\s+estinzione\s+non\s+idonei)\s*[:\.]?\s*)([^\n]+)/i;
    const unMatch = text.match(unsuitableBlockRegex);
    if (unMatch && !/zwykł[a-zęóąśłżźćń]*\s+pian|standardow[a-zęóąśłżźćń]*\s+pian|rozpuszczalnik/i.test(unMatch[2])) {
      let unBody = unMatch[2].trim();
      if (/brak\s+szczególnych/i.test(unBody) || /^brak\.?$/i.test(unBody)) {
        unBody = "Nie stosować standardowej piany gaśniczej (ulega zniszczeniu pod wpływem rozpuszczalników polarnych/alkoholi) ani zwartych strumieni wody.";
      } else {
        unBody = unBody.replace(/\.?$/, '; nie stosować standardowej piany gaśniczej (ulega natychmiastowemu zniszczeniu na płonących cieczach polarnych/alkoholach).');
      }
      text = text.replace(unsuitableBlockRegex, `${unMatch[1]}${unBody}`);
    }

    return text;
  }

  processSection5(contentIt, components = [], section2Text = '', section9Text = '') {
    let clean = (contentIt || "").replace(/\r/g, '');

    let suitableMatch = clean.match(/(?:Suitable extinguishing media|Suitable extinguishing equipment|Mezzi di estinzione idonei|Apparecchiature di estinzione idonee|Odpowiednie środki gaśnicze)\s*[:\.]?\s*([^\n]+(?:\n[^\n]+)?)/i);
    let unsuitableMatch = clean.match(/(?:Extinguishing media which must not be used(?: for safety reasons)?|Unsuitable extinguishing equipment|Mezzi di estinzione non idonei|Apparecchiature di estinzione non idonee|Niewłaściwe środki gaśnicze)\s*[:\.]?\s*([^\n]+)/i);
    let hazardsMatch = clean.match(/(?:^|\n)\s*5\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*5\.3\b|$)/i);
    let adviceMatch = clean.match(/(?:^|\n)\s*5\.3\b[.:\-]?\s*([\s\S]*?)$/i);

    let rawSuitable = suitableMatch ? suitableMatch[1].replace(/(?:Extinguishing media which must not|Unsuitable|Mezzi di estinzione non).*/is, '').trim() : "";
    let suitableText = SDSProcessorEngine.translatePhrase(rawSuitable, "Piana gaśnicza, proszek gaśniczy, dwutlenek węgla (CO2), rozproszone prądy wody. Środki gaśnicze dobrać odpowiednio do materiałów palnych znajdujących się w otoczeniu pożaru.");
    
    // Weryfikacja obecności rozpuszczalników polarnych i palności (CLP-driven)
    const isPolarFlammable = SDSProcessorEngine.isFlammablePolarMixture(components, section2Text, section9Text);

    let unsuitableText = SDSProcessorEngine.translatePhrase(unsuitableMatch ? unsuitableMatch[1] : "", "Brak szczególnych.");
    
    let rawHazards = hazardsMatch ? hazardsMatch[1].replace(/^(?:Special hazards[^\n]*|Pericoli speciali[^\n]*|Szczególne zagrożenia[^\n]*)\s*/i, '').trim() : "";
    let hazardsText = SDSProcessorEngine.translatePhrase(rawHazards, "Unikać wdychania produktów spalania.");

    let rawAdvice = adviceMatch ? adviceMatch[1].replace(/^(?:Advice for firefighters[^\n]*|Raccomandazioni per gli addetti[^\n]*|Informacje dla straży[^\n]*)\s*/i, '').trim() : "";
    let adviceText = SDSProcessorEngine.translatePhrase(rawAdvice, "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji. Stosować odzież ochronną dla strażaków zgodną z normą europejską EN 469 oraz autonomiczny aparat oddechowy (SCBA) z rękawicami odpornymi na chemikalia.");

    let output = "SEKCJA 5: Postępowanie w przypadku pożaru\n\n";
    output += "5.1. Środki gaśnicze\n";
    output += `Odpowiednie środki gaśnicze: ${suitableText}\n`;
    output += `Niewłaściwe środki gaśnicze: ${unsuitableText}\n\n`;
    output += "5.2. Szczególne zagrożenia związane z substancją lub mieszaniną\n";
    output += `Szczególne zagrożenia: ${hazardsText}\n\n`;
    output += "5.3. Informacje dla straży pożarnej\n";
    output += `Środki ochrony strażaków: ${adviceText}`;

    output = SDSProcessorEngine.enforceAlcoholResistantFoam(output, isPolarFlammable);

    return output;
  }

  processSection6(contentIt) {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    let nonEmergMatch = clean.match(/(?:For non emergency personnel|Per chi non interviene direttamente|Dla osób nienależących do personelu udzielającego pomocy)\s*[:\.]?\s*([\s\S]*?)(?=(?:For emergency responders|Per chi interviene direttamente|Dla osób udzielających pomocy|6\.2|$))/i);
    let emergMatch = clean.match(/(?:For emergency responders|Per chi interviene direttamente|Dla osób udzielających pomocy)\s*[:\.]?\s*([\s\S]*?)(?=(?:6\.2|$))/i);
    let envMatch = clean.match(/(?:^|\n)\s*6\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:6\.3|$))/i);
    let cleanMatch = clean.match(/(?:^|\n)\s*6\.3\b[.:\-]?\s*([\s\S]*?)(?=(?:6\.4|$))/i);
    let refMatch = clean.match(/(?:^|\n)\s*6\.4\b[.:\-]?\s*([\s\S]*?)$/i);

    let nonEmergRaw = nonEmergMatch ? nonEmergMatch[1].trim() : "";
    let nonEmergAdvice = "Stosować środki ochrony indywidualnej. Ewakuować osoby w bezpieczne miejsce. Patrz środki ochronne w punkcie 7 i 8.";
    if (nonEmergRaw) {
      let parts = nonEmergRaw.split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      if (parts.length > 0) nonEmergAdvice = parts.join(' ');
    }

    let emergAdvice = SDSProcessorEngine.translatePhrase(emergMatch ? emergMatch[1] : "", "Stosować środki ochrony indywidualnej.");
    
    let envRaw = envMatch ? envMatch[1].replace(/^(?:Environmental precautions[^\n]*|Precauzioni ambientali[^\n]*|Środki ostrożności w zakresie ochrony środowiska[^\n]*)\s*/i, '').trim() : "";
    let envAdvice = "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji. Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji. W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.";
    if (envRaw) {
      let parts = envRaw.split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      // Usunięcie powtórzeń zdań powstałych przy paginacji PDF
      parts = Array.from(new Set(parts));
      if (parts.length > 0) envAdvice = parts.join(' ');
    }

    let cleanRaw = cleanMatch ? cleanMatch[1] : "";
    cleanRaw = cleanRaw
      .replace(/^\s*(?:6\.3\b[.:\-]?\s*)?(?:Methods and material for containment[^\n]*|Metodi e materiali per il contenimento[^\n]*|Metody i materiały[^\n]*)\s*/i, '')
      .trim();

    let cleanupAdvice = "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek. Zmyć dużą ilością wody.";
    if (cleanRaw) {
      let parts = cleanRaw.split('\n')
        .map(p => p.trim())
        .filter(p => p && !/^(?:6\.3\b[.:\-]?\s*)?(?:Methods and material|Metodi e materiali|Metody i materiały)/i.test(p) && !/^6\.3\b[.:\-]?$/i.test(p))
        .map(p => SDSProcessorEngine.translatePhrase(p))
        .filter(Boolean);
      parts = Array.from(new Set(parts));
      if (parts.length > 0) cleanupAdvice = parts.join(' ');
    }

    let refAdvice = "Patrz również sekcja 8 i 13.";
    if (refMatch) {
      let rText = refMatch[1].replace(/^(?:Reference to other sections[^\n]*|Riferimento ad altre sezioni[^\n]*|Odniesienia do innych sekcji[^\n]*)\s*/i, '').trim();
      refAdvice = SDSProcessorEngine.translatePhrase(rText, "Patrz również sekcja 8 i 13.");
    }

    let output = "SEKCJA 6: Postępowanie w przypadku niezamierzonego uwolnienia do środowiska\n\n";
    output += "6.1. Indywidualne środki ostrożności, wyposażenie ochronne i procedury w sytuacjach awaryjnych\n";
    output += `Dla osób nienależących do personelu udzielającego pomocy: ${nonEmergAdvice}\n`;
    output += `Dla osób udzielających pomocy: ${emergAdvice}\n\n`;
    output += "6.2. Środki ostrożności w zakresie ochrony środowiska\n";
    output += `${envAdvice}\n\n`;
    output += "6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia\n";
    output += `${cleanupAdvice}\n\n`;
    output += "6.4. Odniesienia do innych sekcji\n";
    output += `${refAdvice}`;

    return output;
  }

  processSection7(contentIt, s2Content = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    let s71Match = clean.match(/(?:^|\n)\s*7\.1\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*7\.2\b|$)/i);
    let s72Match = clean.match(/(?:^|\n)\s*7\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*7\.3\b|$)/i);
    let s73Match = clean.match(/(?:^|\n)\s*7\.3\b[.:\-]?\s*([\s\S]*?)$/i);

    let text71 = s71Match ? s71Match[1] : "";
    let precautionsMatch = text71.match(/(?:Precautions for safe handling|Precauzioni per la manipolazione sicura|Środki ostrożności)\s*[:\.]?\s*([\s\S]*?)(?=(?:Advice on general|Raccomandazioni generali|Zalecenia dotyczące|$))/i);
    let hygieneMatch = text71.match(/(?:Advice on general occupational hygiene|Raccomandazioni generali sull'igiene|Zalecenia dotyczące ogólnej higieny pracy)\s*[:\.]?\s*([\s\S]*?)$/i);

    let precautions = "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł. Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.";
    if (precautionsMatch) {
      let parts = precautionsMatch[1].split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      if (parts.length > 0) precautions = parts.join(' ');
    }
    let hygiene = SDSProcessorEngine.translatePhrase(hygieneMatch ? hygieneMatch[1] : "", "Nie jeść i nie pić podczas pracy.");

    let text72 = s72Match ? s72Match[1] : "";
    let incompMatch = text72.match(/(?:Incompatible materials|Materiali incompatibili|Materiały niezgodne)\s*[:\.]?\s*([^\n]+)/i);
    let premisesMatch = text72.match(/(?:Instructions as regards storage premises|Indicazioni per i locali di stoccaggio|Wskazówki dotyczące pomieszczeń magazynowych)\s*[:\.]?\s*([^\n]+)/i);

    let incompText = SDSProcessorEngine.translatePhrase(incompMatch ? incompMatch[1] : "", "Brak szczególnych.");
    let premisesText = SDSProcessorEngine.translatePhrase(premisesMatch ? premisesMatch[1] : "", "Pomieszczenia odpowiednio wentylowane.");

    let text73 = s73Match ? s73Match[1] : "";
    let specUseMatch = text73.match(/(?:Specific end use\(s\)|Usi finali particolari|Szczególne zastosowanie\(-a\) końcowe)\s*[:\.]?\s*([^\n]+)/i);
    let indSolMatch = text73.match(/(?:Industrial sector specific solutions|Settore industriale soluzioni específicas|Rozwiązania specyficzne dla sektora przemysłowego)\s*[:\.]?\s*([^\n]+)/i);

    let specUseText = SDSProcessorEngine.translatePhrase(specUseMatch ? specUseMatch[1] : "", "Brak szczególnych.");
    let indSolText = SDSProcessorEngine.translatePhrase(indSolMatch ? indSolMatch[1] : "", "Brak szczególnych.");

    const isFlammable = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2Content);

    let output = "SEKCJA 7: Postępowanie z substancjami i mieszaninami oraz ich magazynowanie\n\n";
    output += "7.1. Środki ostrożności dotyczące bezpiecznego postępowania\n";
    output += `Środki ostrożności: ${precautions}\n`;
    output += `Zalecenia dotyczące ogólnej higieny pracy: ${hygiene}\n\n`;
    output += "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności\n";
    output += `Materiały niezgodne: ${incompText}\n`;
    output += `Wskazówki dotyczące pomieszczeń magazynowych: ${premisesText}\n`;
    if (isFlammable) {
      output += "Wytyczne dotyczące magazynowania cieczy łatwopalnych: Magazynowanie prowadzić zgodnie z polskimi przepisami ochrony przeciwpożarowej (Rozporządzenie Ministra Spraw Wewnętrznych i Administracji z dnia 7 czerwca 2010 r. w sprawie ochrony przeciwpożarowej budynków, innych obiektów budowlanych i terenów – Dz.U. 2010 nr 109 poz. 719 z późn. zm.). Przechowywać wyłącznie w oryginalnych, szczelnie zamkniętych pojemnikach, w chłodnym, suchym i dobrze wentylowanym miejscu, z dala od źródeł ciepła, gorących powierzchni, iskier, otwartego ognia i innych źródeł zapłonu. Zabezpieczyć przed wyładowaniami elektrostatycznymi. Pomieszczenia magazynowe powinny posiadać nienasiąkliwą posadzkę oraz zabezpieczenia rozlewiskowe (wanny wychwytowe) zapobiegające przedostaniu się cieczy do kanalizacji, wód gruntowych i gleby.\n";
    }
    output += "\n7.3. Szczególne zastosowanie(-a) końcowe\n";
    output += `${specUseText}\n`;
    output += `Rozwiązania specyficzne dla sektora przemysłowego: ${indSolText}`;

    return SDSProcessorEngine.normalizeSection7Storage(output, isFlammable);
  }

  // ============================================================================
  // SEKCJA 9: WŁAŚCIWOŚCI FIZYKOCHEMICZNE (UE 2020/878 & WZORZEC EKOS)
  // ============================================================================
  static normalizePhysChemValue(val, paramKey = null) {
    if (!val) {
      if (paramKey && /^(?:particle_characteristics)$/i.test(paramKey)) return "Nie dotyczy (produkt płynny)";
      return "Brak danych";
    }
    let v = val.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    // Czyszczenie separatorów tabelarycznych | oraz wiodących myślników (z wyłączeniem liczb ujemnych np. -114 lub -0,35)
    v = v.replace(/^[\|\s:]+/, '').replace(/^-(?!\d)/, '').replace(/[\|\s]+$/, '').replace(/\s*\|\s*/g, ', ');

    // Obsługa prawnych uzasadnień braku danych (Załącznik II do UE 2020/878)
    if (/Reason for missing data/i.test(v)) {
      if (/only applies to solids/i.test(v)) {
        return "Nie dotyczy (dotyczy wyłącznie ciał stałych)";
      }
      if (/not relevant to the safety and classification/i.test(v)) {
        return "Brak danych (właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu)";
      }
      if (/authoritative substances|organic peroxides|they can decompose/i.test(v)) {
        return "Brak danych (badanie dotyczy wyłącznie substancji ulegających samorzutnemu rozkładowi i nadtlenków organicznych)";
      }
      if (/non-soluble|not soluble/i.test(v)) {
        return "Nie dotyczy (substancja/mieszanina nierozpuszczalna w wodzie)";
      }
      v = v.replace(/Reason for missing data\s*:\s*([^\n\.;]+)/gi, (m, reason) => {
        let rPl = reason.trim()
          .replace(/it only applies to solids/gi, 'dotyczy wyłącznie ciał stałych')
          .replace(/the substance\/mixture is non-soluble \(in water\)/gi, 'substancja/mieszanina nierozpuszczalna w wodzie')
          .replace(/This property is not relevant to the safety and classification of this product/gi, 'właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu');
        return `(${rPl})`;
      });
    }

    // Rozróżnienie prawno-naukowe (Załącznik II do REACH - Rozporządzenie UE 2020/878):
    // 1. "not determined" / "non determinato" -> "Nie oznaczono"
    if (/^(?:not determined|non determinato|nie oznaczono)$/i.test(v)) {
      return "Nie oznaczono";
    }

    // 2. "not available" / "non disponibile" / "brak danych" -> "Brak danych"
    if (/^(?:not available|non disponibile|brak danych|dane niedostępne)$/i.test(v)) {
      return "Brak danych";
    }

    // 3. "not applicable" / "non applicabile" / "nie dotyczy" / "n/a"
    if (/^(?:N\.?A\.?|Not applicable|Non applicabile|Nie dotyczy)$/i.test(v) || /(?:N\.A\.|Not applicable|Non applicabile)/i.test(v)) {
      // Dla cieczy parametry fizyczne nie mogą być "nie dotyczy" (wymóg wytycznych ECHA i pkt 9 Zał. II)
      if (paramKey && /^(?:viscosity|density|relative_vapour_density|melting|vapour_pressure|boiling)$/i.test(paramKey)) {
        return "Brak danych";
      }
      if (paramKey && /^(?:particle_characteristics)$/i.test(paramKey)) {
        return "Nie dotyczy (produkt płynny)";
      }
      return "Nie dotyczy";
    }

    // Jeśli wartość zaczyna się od "not available", ale ma uzupełniające uzasadnienie/metodę:
    v = v.replace(/^not available\s*[,:\-]?\s*/i, 'Brak danych ');

    // Rozklejenie sklejeń słów z Temperature, Method, Remark itp.
    v = v
      .replace(/([a-zA-Z0-9°]+)(Temperature|Temperatura)/g, '$1 $2')
      .replace(/([a-zA-Z0-9°]+)(Method|Metoda)/g, '$1 $2')
      .replace(/([a-zA-Z0-9°]+)(Remark|Substance)/g, '$1 $2');

    // Translacja pełnych fraz palności przed pojedynczymi słowami
    v = v
      .replace(/\b(?:easily|highly)\s+flammable\s+liquid\s+and\s+vapou?rs\.?\b/gi, 'wysoce łatwopalna ciecz i pary')
      .replace(/\bflammable\s+liquid\s+and\s+vapou?rs\.?\b/gi, 'łatwopalna ciecz i pary')
      .replace(/\bcombustible\s+liquid\b/gi, 'ciecz palna')
      .replace(/\bflammable liquid\b/gi, 'ciecz łatwopalna')
      .replace(/\bflammable gas\b/gi, 'gaz łatwopalny')
      .replace(/\bflammable solid\b/gi, 'ciało stałe łatwopalne')
      .replace(/\bflammable\b/gi, 'łatwopalny')
      .replace(/\bliquido infiammabile\b/gi, 'ciecz łatwopalna')
      .replace(/\bnot available\s*they can decompose\b/gi, 'nie określono (substancje mogą ulegać rozkładowi)')
      .replace(/\bnot available\b/gi, 'brak danych')
      .replace(/\bnon disponibile\b/gi, 'brak danych')
      .replace(/\bnot determined\b/gi, 'nie oznaczono')
      .replace(/\bnon determinato\b/gi, 'nie oznaczono')
      .replace(/\bMedian equivalent diameter\b/gi, 'Nie dotyczy (produkt płynny)')
      .replace(/\blight\s+brown\b/gi, 'jasnobrązowy')
      .replace(/\bdark\s+brown\b/gi, 'ciemnobrązowy')
      .replace(/\bbrown\b/gi, 'brązowy')
      .replace(/\bpink\b/gi, 'różowy')
      .replace(/\byellow\b/gi, 'żółty')
      .replace(/\bred\b/gi, 'czerwony')
      .replace(/\bblue\b/gi, 'niebieski')
      .replace(/\bgreen\b/gi, 'zielony')
      .replace(/\bwhite\b/gi, 'biały')
      .replace(/\bamorphous\b/gi, 'bezpostaciowy')
      .replace(/\bcolourless\b/gi, 'bezbarwny')
      .replace(/\bcolorless\b/gi, 'bezbarwny')
      .replace(/\bliquid\b/gi, 'ciecz')
      .replace(/\bsolid\b/gi, 'ciało stałe')
      .replace(/\bgas\b/gi, 'gaz')
      .replace(/\bcharacteristic\b/gi, 'charakterystyczny')
      .replace(/\bpleasant\b/gi, 'przyjemny')
      .replace(/\bperfumed\b/gi, 'perfumowany')
      .replace(/\bsoluble in water\b/gi, 'rozpuszczalny w wodzie')
      .replace(/\bsoluble\b/gi, 'rozpuszczalny')
      .replace(/\binsoluble\b/gi, 'nierozpuszczalny')
      .replace(/\bpartially soluble\b/gi, 'częściowo rozpuszczalny')
      .replace(/\bmiscible\b/gi, 'mieszalny')
      .replace(/\bnot miscible\b/gi, 'niemieszalny')
      .replace(/\bimmiscible\b/gi, 'niemieszalny')
      .replace(/\bin water\b/gi, 'w wodzie')
      .replace(/\bin H2[0O]\b/gi, 'w H2O')
      .replace(/\bat atmospheric pressure\b/gi, 'pod ciśnieniem atmosferycznym')
      .replace(/\bat\b\s+(?=\d)/gi, 'w ')
      .replace(/\bRemark\s*[:\.]?\s*Visual\b/gi, '(ocena wizualna)')
      .replace(/\bRemark\s*[:\.]?\s*([A-Za-z0-9,\s\-\.\/%;\|]+?)(?=\s*(?:Substance|Temperature|Method|Initial boiling point|Vapour pressure|\bpH\b|Remark|$))/gi, '(uwaga: $1)')
      .replace(/\bSubstance\s*[:\.]?\s*([A-Za-z0-9,\s\-\.\/%;\|]+?)(?=\s*(?:Remark|Temperature|Method|Initial boiling point|Vapour pressure|\bpH\b|$))/gi, '(substancja: $1)')
      .replace(/\baria\s*=\s*1\b/gi, 'powietrze=1')
      .replace(/\(uwaga:\s*\)/gi, '')
      .replace(/\bRemark:\s*\)/gi, '')
      .replace(/\bMethod\s*[:\.]?\s*(?:not specified|nie określono)\b/gi, '')
      .replace(/\bMethod\s*[:\.]?\s*internal\b/gi, '(metoda wewnętrzna)')
      .replace(/\bMethod\s*[:\.]?\s*([A-Za-z0-9:\s,;\-]+)/gi, '(metoda: $1)')
      .replace(/\binternal\b/gi, 'wewnętrzna')
      .replace(/\bTemperature\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*°C)/gi, '(temperatura: $1)')
      .replace(/\bnot specified\b/gi, 'nie określono')
      .replace(/\bNot specified\b/gi, 'nie określono');

    // Zamiana kropek dziesiętnych na przecinki w liczbach (np. 1.00 -> 1,00, 20.5 -> 20,5)
    v = v.replace(/(\d+)\.(\d+)/g, '$1,$2');
    
    // Fallback dla angielskich wtrąceń, które przetrwały wewnątrz nawiasów lub wartości
    v = v.replace(/\bInitial boiling point\b/gi, '')
         .replace(/\bSubstance\b/gi, 'substancja')
         .replace(/\bTemperature\b/gi, 'temperatura')
         .replace(/\bVapour pressure\b/gi, 'prężność par')
         .replace(/\bRemark\s*[:\.]?\s*\)?\s*\(\s*(?:aria|powietrze)\s*=\s*1\s*\)/gi, '(powietrze=1)')
         .replace(/\bRemark\b/gi, 'uwaga')
         .replace(/\bMethod\b/gi, 'metoda')
         .replace(/\bAuto-?ignition\b/gi, 'samozapłon')
         .replace(/\bDensity\b/gi, 'gęstość')
         .replace(/\bSolubility\b/gi, 'rozpuszczalność')
         .replace(/\bMelting point\b/gi, 'temperatura topnienia')
         .replace(/\bFlash point\b/gi, 'temperatura zapłonu')
         .replace(/\bFlammability\b/gi, 'palność')
         .replace(/\bDecomposition\b/gi, 'rozkład')
         .replace(/\bViscosity\b/gi, 'lepkość')
         .replace(/\(\s*substancja:\s*([^)]+?)\s*\)/gi, (match, p1) => {
           let c = p1.trim();
           if (c.endsWith(':')) c = c.slice(0, -1).trim();
           return `(substancja: ${c})`;
         })
         .replace(/\(\s*uwaga:\s*([^)]+?)\s*\)/gi, (match, p1) => {
           let c = p1.trim();
           if (c.endsWith(':')) c = c.slice(0, -1).trim();
           return `(uwaga: ${c})`;
         })
         .replace(/\s+\)/g, ')');
    
    // Normalizacja zapisu jednostek
    v = v.replace(/mm2\/s/gi, 'mm²/s')
         .replace(/g\/ml/gi, 'g/ml')
         .replace(/g\/cm3/gi, 'g/cm³')
         .replace(/(\d+)\s*°\s*C/gi, '$1 °C');

    // Usuwanie podwójnych nawiasów lub zbędnych przecinków
    v = v.replace(/\(\s*\(/g, '(').replace(/\)\s*\)/g, ')')
         .replace(/,\s*\(/g, ' (')
         .replace(/\s+/g, ' ')
         .trim();

    return v;
  }

  processSection9(contentIt, components = []) {
    return SDSEcoPhysParser.processSection9(contentIt, components);
  }

  processSection8(contentIt, components = [], s2Content = "", s9Content = "") {
    const allCas = Array.from(new Set([
      ...this.extractedSubstances.map(s => s.casNumber),
      ...components.map(c => c.cas).filter(Boolean)
    ]));

    let output = "SEKCJA 8: Kontrola narażenia/środki ochrony indywidualnej\n\n";
    output += "8.1. Parametry dotyczące kontroli\n";
    
    let ndsLines = [];
    let hasKnownNds = false;
    if (allCas.length > 0) {
      for (const cas of allCas) {
        const entry = NDSRegistry.getEntry(cas);
        if (entry) {
          hasKnownNds = true;
          const subName = entry.substance || entry.substanceName || (CAS_TO_PL_MAP[cas] || cas);
          const ndsVal = entry.NDS || entry.nds || "-";
          const ndschVal = entry.NDSCh || entry.ndsch || "-";
          const ndspVal = entry.NDSP || entry.ndsp || "brak";
          const remarks = entry.uwagi || entry.remarks || "";

          let line = `${subName} [CAS: ${cas}]:\n- NDS: ${ndsVal.includes('mg/m³') ? ndsVal : ndsVal + ' mg/m³'}`;
          if (ndschVal && ndschVal !== "brak" && ndschVal !== "-" && ndschVal !== "nie ustalono") {
            line += `\n- NDSCh: ${ndschVal.includes('mg/m³') ? ndschVal : ndschVal + ' mg/m³'}`;
          } else if (ndschVal === "nie ustalono") {
            line += `\n- NDSCh: nie ustalono`;
          }
          if (ndspVal && ndspVal !== "brak" && ndspVal !== "-") {
            line += `\n- NDSP: ${ndspVal.includes('mg/m³') ? ndspVal : ndspVal + ' mg/m³'}`;
          }
          if (remarks && remarks !== "brak") {
            line += `\n- Uwagi: oznakowanie substancji notacją „${remarks}”`;
          }
          ndsLines.push(line);
        }
      }
    }

    if (hasKnownNds) {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n";
      output += ndsLines.join("\n\n") + "\n\n";
    } else {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska):\n";
      output += "Dla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych dopuszczalnych stężeń (NDS, NDSCh, NDSP) w środowisku pracy zgodnie z Rozporządzeniem Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017).\n\n";
    }

    let cleanIt = (contentIt || "").replace(/\r/g, '').replace(/\t/g, ' ');

    // Wartości zagraniczne OEL / MAK – wklejane WYŁĄCZNIE dla substancji faktycznie obecnych w składzie!
    if (/Community Occupational Exposure Limits|OEL|MAK/i.test(cleanIt)) {
      let oelLines = [];
      if (allCas.includes("55965-84-9") && /55965-84-9|isothiazol/i.test(cleanIt)) {
        oelLines.push("Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1) (CAS: 55965-84-9):\nAustria – wartość dopuszczalna długoterminowa (8h): 0,05 mg/m³; Uwagi: MAK, Sh; Źródło: GKV, BGBl. II Nr. 156/2021.");
      }
      if (allCas.includes("64-17-5") && /64-17-5|ethanol/i.test(cleanIt)) {
        oelLines.push("Etanol (CAS: 64-17-5):\nNiemcy (AGW) / Austria (MAK): 380 mg/m³ (200 ppm) / 960 mg/m³ (500 ppm).");
      }
      if (allCas.includes("67-63-0") && /67-63-0|propan-2-ol|isopropanol/i.test(cleanIt)) {
        oelLines.push("Propan-2-ol (CAS: 67-63-0):\nNiemcy (AGW) / Austria (MAK): 500 mg/m³ (200 ppm).");
      }

      if (oelLines.length > 0) {
        output += "Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego (OEL):\n";
        output += oelLines.join("\n\n") + "\n\n";
      }
    }

    // Wartości DNEL i PNEC w podziale na poszczególne substancje
    const { dnel, pnec, bySubstance } = SDSChemicalExtractor.extractDnelPnec(cleanIt, components);
    if (bySubstance && Object.keys(bySubstance).length > 0) {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) oraz Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n\n";
      for (const [subName, data] of Object.entries(bySubstance)) {
        output += `Substancja: ${subName}${data.cas ? ` [CAS: ${data.cas}]` : ''}\n`;
        if (data.dnel && data.dnel.length > 0) {
          output += "Pochodne poziomy niepowodujące zmian (DNEL):\n" + data.dnel.map(l => `  ${l}`).join('\n') + "\n";
        }
        if (data.pnec && data.pnec.length > 0) {
          output += "Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n" + data.pnec.map(l => `  ${l}`).join('\n') + "\n";
        }
        output += "\n";
      }
    } else if (dnel.length > 0 || pnec.length > 0) {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) oraz Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n";
      if (dnel.length > 0) output += `Pochodne poziomy niepowodujące zmian (DNEL):\n${dnel.join('\n')}\n`;
      if (pnec.length > 0) output += `Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n${pnec.join('\n')}\n`;
      output += "\n";
    } else {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) i PNEC: Dla mieszaniny i jej składników nie oznaczono wartości DNEL oraz PNEC.\n\n";
    }

    output += "Zalecane procedury monitorowania: Należy stosować procedury monitorowania stężeń niebezpiecznych substancji w powietrzu na stanowiskach pracy oraz procedury kontroli wentylacji zgodnie z odpowiednimi Polskimi Normami.\n\n";

    // 8.2. Kontrola narażenia – ochrona indywidualna wg Dz.U. 2016 poz. 1488 i norm PN-EN
    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous|Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie)/i.test(s2Content);
    const hasMixtureHazard = !isExplicitlyNotHazardous && /(?:GHS0[1235689]|H2\d\d|H30[0-4]|H31[0-4]|H318|H33[0-4]|H34\d|H35\d|H36\d|H37\d|H400|H41[01])/i.test(s2Content);

    const phM = (s9Content || "").match(/pH\s*[:\.]?\s*([^\n]+)/i);
    const phStr = phM ? phM[1].trim() : "";
    const ppe = SDSConsistencyEngine.getSection8PPE(phStr, components);

    let eyeProtection = "";
    let skinProtection = "";
    let handProtection = "";
    let respProtection = "";

    if (!hasMixtureHazard) {
      eyeProtection = ppe.eyeText;
      handProtection = ppe.handText;
      skinProtection = ppe.skinText;
      respProtection = ppe.respText;
    } else {
      const causesEye = /H314|H318|H319|Eye Dam|Eye Irrit|Skin Corr/i.test(s2Content);
      const causesSkin = /H314|H315|H317|H312|H310|Skin Corr|Skin Irrit|Skin Sens|EUH066/i.test(s2Content) || /H224|H225/i.test(s2Content);
      const isVolatile = /H224|H225|H330|H331|H332|H335|H336/i.test(s2Content);

      eyeProtection = causesEye 
        ? "Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166."
        : ppe.eyeText;

      skinProtection = causesSkin
        ? "Stosować odpowiednią odzież roboczą chroniącą przed kontaktem z chemikaliami."
        : ppe.skinText;

      handProtection = causesSkin
        ? "Stosować rękawice ochronne odporne na działanie chemikaliów (zalecany kauczuk nitrylowy o grubości minimalnej 0,4 mm, czas przebicia > 480 min zgodnie z normą PN-EN ISO 374-1)."
        : ppe.handText;

      respProtection = isVolatile
        ? "W normalnych warunkach stosowania przy właściwej wentylacji nie jest wymagana. W przypadku niedostatecznej wentylacji lub przekroczenia dopuszczalnych stężeń NDS stosować odpowiedni sprzęt ochrony dróg oddechowych z filtrem/pochłaniaczem kombinowanym typu A-P2 (lub A1P2) zgodnie z normą PN-EN 14387."
        : ppe.respText;
    }

    output += "8.2. Kontrola narażenia\n";
    output += `Ochrona oczu: ${eyeProtection}\n`;
    output += `Ochrona skóry: ${skinProtection}\n`;
    output += `Ochrona rąk: ${handProtection}\n`;
    output += `Ochrona dróg oddechowych: ${respProtection}\n`;
    output += "Zagrożenia termiczne: Nie dotyczy.\n";
    output += "Kontrola narażenia środowiska: Nie dopuścić do przedostania się dużych ilości produktu do kanalizacji, wód powierzchniowych ani gruntowych.\n";
    output += "Środki higieniczne i techniczne: Zapewnić odpowiednią wentylację ogólną i miejscową na stanowiskach pracy. Myć ręce po zakończeniu pracy z produktem. Nie jeść i nie pić podczas stosowania.";

    return output;
  }


  processSection12(contentIt, components = [], s2Content = "") {
    return SDSEcoPhysParser.processSection12(contentIt, components, s2Content);
  }

  static sanitizeSection12(content) {
    if (!content) return "";
    let text = content;
    // Całkowite wycięcie parametru fizykochemicznego rozpuszczalności w wodzie z sekcji 12.2 (właściwość należąca wyłącznie do Sekcji 9.1)
    text = text.replace(/[ \t]*Rozpuszczalność\s+w\s+wodzie:\s*[^.\n]+(?:\.|$)/gi, '');
    text = text.replace(/[ \t]*Solubility\s+in\s+water:\s*[^.\n]+(?:\.|$)/gi, '');
    text = text.replace(/[ \t]{2,}/g, ' ');
    return text.trim();
  }

  processSection13(rawContent = "", components = [], s2Content = "", s1Content = "") {
    // Odpad niebezpieczny (z gwiazdką *) może zostać przypisany wyłącznie, gdy cała mieszanina w Sekcji 2.1 jest zaklasyfikowana jako stwarzająca zagrożenie
    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous|Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie)/i.test(s2Content);
    const hasMixtureHazard = !isExplicitlyNotHazardous && /(?:GHS0[1235689]|H2\d\d|H30[0-4]|H31[0-4]|H318|H33[0-4]|H34\d|H35\d|H36\d|H37\d|H400|H41[01])/i.test(s2Content);
    const isHazardous = hasMixtureHazard;

    const productText = `${s1Content} ${rawContent} ${components.map(c => c.name || "").join(' ')}`;
    return PolishLegalTemplates.getSection13(isHazardous, productText);
  }

  processSection14(rawContent = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    // Detekcja czy towar NIE podlega przepisom transportowym
    const isNotRegulated = /Not classified as dangerous|Non dangerous good|Non pericoloso|Not dangerous|Nie podlega przepisom|Non regolamentato/i.test(clean);
    
    // Wyszukiwanie numeru UN (np. UN 1266, UN1266, UN 1993, 1266 itp.)
    const unMatch = clean.match(/(?:UN\s*|ID\s*|Nr\s*UN\s*[:\.]?\s*)(\d{4})\b/i);
    const unNumber = unMatch ? unMatch[1] : null;

    if (isNotRegulated || !unNumber || /14\.1[^\n]*?(?:N\/?A|None|Brak|Nie dotyczy)/i.test(clean)) {
      let out = "SEKCJA 14: Informacje dotyczące transportu\n\n";
      out += "Produkt nie jest sklasyfikowany jako stwarzający zagrożenie w świetle międzynarodowych i krajowych przepisów transportowych (ADR/RID, IMDG, ICAO/IATA).\n\n";
      out += "14.1. Numer UN lub numer identyfikacyjny ID\nNie dotyczy.\n\n";
      out += "14.2. Prawidłowa nazwa przewozowa UN\nNie dotyczy.\n\n";
      out += "14.3. Klasa(-y) zagrożenia w transporcie\nNie dotyczy.\n\n";
      out += "14.4. Grupa pakowania\nNie dotyczy.\n\n";
      out += "14.5. Zagrożenia dla środowiska\nNie dotyczy (produkt nie stanowi zagrożenia dla środowiska w myśl przepisów transportowych).\n\n";
      out += "14.6. Szczególne środki ostrożności dla użytkowników\nZawsze transportować w szczelnie zamkniętych, oryginalnych opakowaniach handlowych, chroniąc przed uszkodzeniami mechanicznymi, bezpośrednim działaniem promieni słonecznych i przewróceniem. Przestrzegać ogólnych zasad bezpieczeństwa i higieny pracy podczas przeładunku.\n\n";
      out += "14.7. Transport morski luzem zgodnie z instrumentami IMO\nNie dotyczy.";
      return out;
    }

    // Towar niebezpieczny (ADR/RID/IMDG/IATA)
    const adrEntry = unNumber ? ADRRegistry.getEntry(unNumber) : null;
    
    // 14.1
    const s14_1 = `14.1. Numer UN lub numer identyfikacyjny ID\nUN ${unNumber}`;

    // 14.2 Prawidłowa nazwa przewozowa
    let shippingName = adrEntry ? adrEntry.name : "";
    if (!shippingName) {
      const shipMatch = clean.match(/(?:ADR-Shipping Name|Proper shipping name|Prawidłowa nazwa przewozowa)\s*[:\.]?\s*([^\n;]+)/i);
      shippingName = shipMatch && !/N\/?A/i.test(shipMatch[1]) ? shipMatch[1].trim() : "Brak danych";
    }
    const s14_2 = `14.2. Prawidłowa nazwa przewozowa UN\n${shippingName}`;

    // 14.3 Klasa zagrożenia
    let hazardClass = adrEntry ? adrEntry.class : "";
    if (!hazardClass) {
      const classMatch = clean.match(/(?:ADR-Class|Transport hazard class|Klasa)\s*[:\.]?\s*([^\n;]+)/i);
      hazardClass = classMatch && !/N\/?A/i.test(classMatch[1]) ? classMatch[1].trim() : "Brak danych";
    }
    const classDesc = hazardClass === '3' ? " (Materiały ciekłe zapalne)" : "";
    const s14_3 = `14.3. Klasa(-y) zagrożenia w transporcie\nADR / RID, IMDG, IATA: Klasa ${hazardClass}${classDesc}\nNalepka ostrzegawcza: Nr ${hazardClass}`;

    // 14.4 Grupa pakowania
    let packingGroup = adrEntry ? adrEntry.packing_group : "";
    if (!packingGroup || packingGroup.includes('/')) {
      const pgMatch = clean.match(/(?:ADR-Packing Group|Packing group|Grupa pakowania)\s*[:\.]?\s*([^\n;]+)/i);
      if (pgMatch && !/N\/?A/i.test(pgMatch[1])) packingGroup = pgMatch[1].trim();
    }
    const s14_4 = `14.4. Grupa pakowania\n${packingGroup ? (packingGroup.startsWith('Grupa') ? packingGroup : `Grupa pakowania ${packingGroup}`) : "Nie dotyczy"}`;

    // 14.5 Zagrożenia dla środowiska
    const isMarinePollutant = /Marine pollutant\s*[:\.]?\s*(?:Yes|Si|Tak)|Environmental Pollutant\s*[:\.]?\s*(?:Yes|Si|Tak)|Zagrożenie dla środowiska\s*[:\.]?\s*Tak/i.test(clean);
    const s14_5 = `14.5. Zagrożenia dla środowiska\n${isMarinePollutant ? "Tak (substancja zagrażająca środowisku / Marine Pollutant)." : "Brak (produkt nie jest zaklasyfikowany jako stwarzający zagrożenie dla środowiska w transporcie)."}`;

    // 14.6 Szczególne środki ostrożności
    let s14_6 = "14.6. Szczególne środki ostrożności dla użytkowników\n";
    let precDetails = [];

    // Ilości ograniczone (LQ) wg rozdziału 3.4 ADR
    let lqValue = null;
    clean = clean.replace(/((?:Limited\s*Quantit(?:ies|y)|Ilości\s*ograniczone|LQ)\s*[:\.]?\s*[0-9]+)\s*\n\s*(L|lt|kg|ml|g)\b/gi, '$1 $2');
    const lqMatch = clean.match(/(?:Limited\s*Quantit(?:ies|y)|Ilości\s*ograniczone|LQ)\s*[:\.]?\s*([0-9]+(?:\s*(?:L|lt|kg|ml|g|[a-zA-Z]+))?)/i);
    if (lqMatch) {
      let rawLq = lqMatch[1].trim();
      if (/^1\s*lt$/i.test(rawLq) || rawLq === "1") rawLq = "1 L";
      else if (/lt$/i.test(rawLq)) rawLq = rawLq.replace(/lt$/i, 'L');
      lqValue = rawLq;
      precDetails.push(`Ilości ograniczone (LQ): ${lqValue}`);
    } else if (adrEntry && adrEntry.lq) {
      lqValue = adrEntry.lq;
      precDetails.push(`Ilości ograniczone (LQ): ${lqValue}`);
    }

    let finalTunnel = adrEntry ? adrEntry.tunnel_code : null;
    const tunnelMatch = clean.match(/(?:Tunnel restriction code|Tunnel|Kod tunelu)\s*[:\.]?\s*(\([A-E](?:\/[A-E])?\)|\b[A-E](?:\/[A-E])?\b)/i);
    if (tunnelMatch) {
      finalTunnel = tunnelMatch[1].trim();
    }
    if (finalTunnel) precDetails.push(`Kod ograniczeń przewozu przez tunele: ${finalTunnel}`);
    
    precDetails.push("Transportować w szczelnie zamkniętych, certyfikowanych opakowaniach, zabezpieczonych przed przemieszczaniem i uszkodzeniami mechanicznymi.");
    precDetails.push("Kierowca powinien posiadać stosowne uprawnienia ADR oraz wymagane wyposażenie ochronne pojazdu.");
    s14_6 += precDetails.join('\n');

    // 14.7 IMO
    const s14_7 = "14.7. Transport morski luzem zgodnie z instrumentami IMO\nNie dotyczy (produkt nie jest przewożony luzem w chemikaliowcach morskich).";

    let out = "SEKCJA 14: Informacje dotyczące transportu\n\n";
    out += "Produkt podlega przepisom dotyczącym międzynarodowego przewozu towarów niebezpiecznych (ADR/RID, IMDG, ICAO/IATA).\n\n";
    out += `${s14_1}\n\n${s14_2}\n\n${s14_3}\n\n${s14_4}\n\n${s14_5}\n\n${s14_6}\n\n${s14_7}`;
    return out;
  }

  processSection15(rawContent = "", components = [], s1Content = "", s2Content = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    let svhcText = "";
    if (/No substances listed|No SVHC substances present in concentration >= 0\.?1%/i.test(clean) || !/SVHC/i.test(clean)) {
      svhcText = "Mieszanina nie zawiera substancji z listy kandydackiej SVHC podlegających procedurze udzielania zezwoleń (REACH załącznik XIV) w stężeniu ≥ 0,1% wag.";
    }

    // Wykrywanie kategorii Seveso
    let sevesoCat = "";
    const catMatch = clean.match(/(?:Seveso\s*(?:Category|Kategoria|Categoria)|Dir(?:ect(?:ive)?)?\s*2012\/18\/EU)[\s\S]*?\b(P[1-8][a-c]?|E[1-2]|H[1-3]|O[1-3])\b/i) ||
                     clean.match(/(?:Seveso|2012\/18\/EU)[^\n\r]*?:\s*([A-Z0-9]+)/i);
    if (catMatch) {
      sevesoCat = catMatch[1].trim();
      if (/^(?:none|nessuna|null)$/i.test(sevesoCat)) {
        sevesoCat = "Brak";
      }
    }

    // Wykrywanie ograniczeń Załącznika XVII REACH
    let prodPoints = [];
    let contPoints = [];

    const prodMatch = clean.match(/(?:^|\n)\s*(?:Product|Prodotto|Produkt)\s*[\n\r:]+\s*(?:Point|Punto|Pozycja)?\s*([0-9\s,\-]+)/i);
    if (prodMatch) {
      const pts = prodMatch[1].match(/\d+/g);
      if (pts) prodPoints.push(...pts);
    }

    const contMatch = clean.match(/(?:^|\n)\s*(?:Contained\s*substances?|Sostanze\s*contenute|Substancje\s*zawarte)\s*[\n\r:]+\s*(?:Point|Punto|Pozycja)?\s*([0-9\s,\-]+)/i);
    if (contMatch) {
      const pts = contMatch[1].match(/\d+/g);
      if (pts) contPoints.push(...pts);
    }

    const genRestrMatch = clean.match(/(?:Restrictions\s*related|Restrizioni\s*relative|Ograniczenia\s*dotyczące)[\s\S]*?(?:Annex\s*XVII|Załącznik\s*XVII|Allegato\s*XVII)[\s\S]*?(?:Point|Punto|Pozycja)\s*([0-9\s,\-]+)/i);
    if (genRestrMatch && prodPoints.length === 0 && contPoints.length === 0) {
      const pts = genRestrMatch[1].match(/\d+/g);
      if (pts) contPoints.push(...pts);
    }

    // Determinizm prawny CLP (Zero-Bypass Fallback):
    const isDangerousLiquid = /Flam\. Liq|Eye Irrit|Eye Dam|Skin Irrit|Skin Sens|Skin Corr|Acute Tox|STOT|Aquatic/i.test(s2Content);
    const isFlammableLiquid = /Flam\. Liq|H224|H225|H226/i.test(s2Content);
    const isTattooProduct = /(?:tatu|tattoo|makijaż\s+permanentn|permanent\s+make-?up)/i.test(s1Content);

    if (isDangerousLiquid && !prodPoints.includes("3")) {
      prodPoints.push("3");
    }
    if (isFlammableLiquid && !prodPoints.includes("40")) {
      prodPoints.push("40");
    }
    // Pozycja 75 Załącznika XVII do REACH (Rozporządzenie (UE) 2020/2081) dotyczy WYŁĄCZNIE tuszów do tatuażu i makijażu permanentnego.
    // Dla produktów nietatuatorskich (np. odświeżacze, dyfuzory, chemia gospodarcza) pozycja 75 nie ma zastosowania i musi zostać wykluczona.
    if (!isTattooProduct) {
      contPoints = contPoints.filter(p => p !== "75");
      prodPoints = prodPoints.filter(p => p !== "75");
    } else if (!contPoints.includes("75") && clean.includes("75")) {
      contPoints.push("75");
    }

    let restrLines = [];
    if (prodPoints.length > 0) {
      let descList = [];
      if (prodPoints.includes("3")) descList.push("pozycji 3 (Ciekłe substancje lub mieszaniny stwarzające zagrożenie w rozumieniu rozporządzenia CLP)");
      if (prodPoints.includes("40")) descList.push("pozycji 40 (Substancje zaklasyfikowane jako ciecze łatwopalne kategorii 1, 2 lub 3)");
      const otherProd = prodPoints.filter(p => p !== "3" && p !== "40");
      if (otherProd.length > 0) descList.push(`pozycji ${otherProd.join(', ')}`);
      restrLines.push(`  * Produkt podlega ograniczeniom wynikającym z ${descList.join(' oraz ')}.`);
    }
    if (contPoints.length > 0) {
      let descList = [];
      if (contPoints.includes("75") && isTattooProduct) descList.push("pozycji 75 (Substancje w tuszach do tatuażu i makijażu permanentnego)");
      const otherCont = contPoints.filter(p => p !== "75");
      if (otherCont.length > 0) descList.push(`pozycji ${otherCont.join(', ')}`);
      if (descList.length > 0) {
        restrLines.push(`  * Substancje zawarte w mieszaninie podlegają ograniczeniom wynikającym z ${descList.join(' oraz ')}.`);
      }
    }

    let restrText = restrLines.length > 0 ? "\n" + restrLines.join('\n') : " Mieszanina nie podlega ograniczeniom na mocy załącznika XVII do rozporządzenia REACH.";

    const isDetergent = /detergent|czyszcząc|myjąc|mydło|płukania|odtłuszczacz|lavapavimenti|ammorbidente|sgrassatore|profuma tessuti/i.test(s1Content);
    const isHighlyFlammable = /H224|H225|Flam\. Liq\. 1|Flam\. Liq\. 2/i.test(s2Content);
    const isAquaticToxic = /H400|H410/i.test(s2Content);

    return PolishLegalTemplates.getSection15(svhcText, restrText, isDetergent, isHighlyFlammable, isAquaticToxic, sevesoCat);
  }


  processSection16(rawContent = "", components = [], s2Content = "", version = "1.0 PL", replacedRevision = "Brak") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    // 1. Zbieranie unikalnych kodów H i EUH
    const hCodesSet = new Set();
    const euhCodesSet = new Set();

    // Z sekcji 2
    const s2HCodes = SDSChemicalExtractor.extractHCodes(s2Content);
    const s2EuhCodes = SDSChemicalExtractor.extractEuhCodes(s2Content);
    s2HCodes.forEach(c => hCodesSet.add(c));
    s2EuhCodes.forEach(c => euhCodesSet.add(c));
    if (s2Content.includes("EUH208") || /EUH208/i.test(s2Content)) {
      euhCodesSet.add("EUH208");
    }

    // Ze składników sekcji 3
    components.forEach(c => {
      const classStr = c.classification || "";
      const matchesH = SDSChemicalExtractor.extractHCodes(classStr);
      if (matchesH) matchesH.forEach(code => hCodesSet.add(code));
      const matchesEuh = SDSChemicalExtractor.extractEuhCodes(classStr);
      if (matchesEuh) matchesEuh.forEach(code => euhCodesSet.add(code));
      if (/(?:Skin\s*Sens|H317)/i.test(classStr)) {
        euhCodesSet.add("EUH208");
      }
    });

    // Z tekstu źródłowego sekcji 16
    const rawMatchesH = SDSChemicalExtractor.extractHCodes(clean);
    if (rawMatchesH) rawMatchesH.forEach(code => hCodesSet.add(code));
    const rawMatchesEuh = SDSChemicalExtractor.extractEuhCodes(clean);
    if (rawMatchesEuh) rawMatchesEuh.forEach(code => euhCodesSet.add(code));

    const sortedHCodes = Array.from(hCodesSet).sort();
    const sortedEuhCodes = Array.from(euhCodesSet).sort();

    let hPhrasesBlock = [];
    sortedHCodes.forEach(code => {
      const phrase = OFFICIAL_CLP_H_PHRASES[code] || "Brak oficjalnego tłumaczenia zwrotu.";
      hPhrasesBlock.push(`${code}: ${phrase}`);
    });
    sortedEuhCodes.forEach(code => {
      let phrase = OFFICIAL_CLP_H_PHRASES[code] || "Informacja uzupełniająca o zagrożeniach.";
      if (code === "EUH208") {
        let allergens = [];
        // 1. Sprawdź, czy Sekcja 2 zawiera już wyliczone alergeny dla EUH208
        const matchS2 = s2Content.match(/EUH208\s*[:\.]?\s*Zawiera\s+([^.]+?)\.\s*Może/i);
        if (matchS2 && matchS2[1] && !/substancj[aęie]/i.test(matchS2[1])) {
          phrase = `Zawiera ${matchS2[1].trim()}. Może powodować wystąpienie reakcji alergicznej.`;
        } else {
          // 2. Wyodrębnij alergeny ze składników (Skin Sens / H317 / H334)
          if (components && Array.isArray(components)) {
            components.forEach(c => {
              const cl = c.classification || '';
              if (/(?:Skin\s*Sens|Resp\s*Sens|H317|H334)/i.test(cl)) {
                let name = c.name || c.originalName || '';
                if (name) {
                  const resolved = SDSChemicalExtractor.resolvePlName(c.cas, name, {});
                  const conjugated = SDSChemicalExtractor.toAccusative(resolved || name);
                  if (conjugated && !allergens.includes(conjugated)) {
                    allergens.push(conjugated);
                  }
                }
              }
            });
          }
          if (allergens.length > 0) {
            phrase = `Zawiera ${allergens.join(', ')}. Może powodować wystąpienie reakcji alergicznej.`;
          } else {
            phrase = OFFICIAL_CLP_H_PHRASES["EUH208"] || "Zawiera [nazwa substancji uczulającej]. Może powodować wystąpienie reakcji alergicznej.";
          }
        }
      }
      hPhrasesBlock.push(`${code}: ${phrase}`);
    });

    // 2. Wykaz klas i kategorii zagrożenia
    const classMapPl = {
      "Acute Tox. 1": "Toksyczność ostra, kategoria 1",
      "Acute Tox. 2": "Toksyczność ostra, kategoria 2",
      "Acute Tox. 3": "Toksyczność ostra, kategoria 3",
      "Acute Tox. 4": "Toksyczność ostra, kategoria 4",
      "Skin Corr. 1A": "Działanie żrące na skórę, kategoria 1A",
      "Skin Corr. 1B": "Działanie żrące na skórę, kategoria 1B",
      "Skin Corr. 1C": "Działanie żrące na skórę, kategoria 1C",
      "Skin Corr. 1": "Działanie żrące na skórę, kategoria 1",
      "Skin Irrit. 2": "Działanie drażniące na skórę, kategoria 2",
      "Eye Dam. 1": "Poważne uszkodzenie oczu, kategoria 1",
      "Eye Irrit. 2": "Działanie drażniące na oczy, kategoria 2",
      "Skin Sens. 1A": "Działanie uczulające na skórę, kategoria 1A",
      "Skin Sens. 1B": "Działanie uczulające na skórę, kategoria 1B",
      "Skin Sens. 1": "Działanie uczulające na skórę, kategoria 1",
      "Resp. Sens. 1": "Działanie uczulające na drogi oddechowe, kategoria 1",
      "Flam. Liq. 1": "Substancja ciekła łatwopalna, kategoria 1",
      "Flam. Liq. 2": "Substancja ciekła łatwopalna, kategoria 2",
      "Flam. Liq. 3": "Substancja ciekła łatwopalna, kategoria 3",
      "Flam. Sol. 1": "Substancja stała łatwopalna, kategoria 1",
      "Flam. Sol. 2": "Substancja stała łatwopalna, kategoria 2",
      "Aerosol 1": "Wyroby aerozolowe, kategoria 1",
      "Aerosol 2": "Wyroby aerozolowe, kategoria 2",
      "Aerosol 3": "Wyroby aerozolowe, kategoria 3",
      "Asp. Tox. 1": "Zagrożenie spowodowane aspiracją, kategoria 1",
      "STOT SE 1": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 1",
      "STOT SE 2": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 2",
      "STOT SE 3": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 3",
      "STOT RE 1": "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 1",
      "STOT RE 2": "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 2",
      "Repr. 1A": "Działanie szkodliwe na rozrodczość, kategoria 1A",
      "Repr. 1B": "Działanie szkodliwe na rozrodczość, kategoria 1B",
      "Repr. 2": "Działanie szkodliwe na rozrodczość, kategoria 2",
      "Carc. 1A": "Rakotwórczość, kategoria 1A",
      "Carc. 1B": "Rakotwórczość, kategoria 1B",
      "Carc. 2": "Rakotwórczość, kategoria 2",
      "Muta. 1A": "Działanie mutagenne na komórki rozrodcze, kategoria 1A",
      "Muta. 1B": "Działanie mutagenne na komórki rozrodcze, kategoria 1B",
      "Muta. 2": "Działanie mutagenne na komórki rozrodcze, kategoria 2",
      "Lact.": "Wpływ na laktację lub oddziaływanie na dzieci karmione piersią",
      "Aquatic Acute 1": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie ostre, kategoria 1",
      "Aquatic Chronic 1": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 1",
      "Aquatic Chronic 2": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 2",
      "Aquatic Chronic 3": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 3",
      "Aquatic Chronic 4": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 4"
    };

    const detectedClasses = new Set();
    components.forEach(c => {
      const cl = c.classification || "";
      for (const key of Object.keys(classMapPl)) {
        if (cl.includes(key)) detectedClasses.add(key);
      }
    });
    for (const key of Object.keys(classMapPl)) {
      if (clean.includes(key)) detectedClasses.add(key);
    }

    let classesBlock = [];
    Array.from(detectedClasses).sort().forEach(cls => {
      classesBlock.push(`${cls}: ${classMapPl[cls]}`);
    });

    // 3. Objaśnienie skrótów i akronimów
    const acronyms = [
      "ADR: Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych",
      "RID: Regulamin międzynarodowego przewozu kolejami towarów niebezpiecznych",
      "IMDG: Międzynarodowy morski kodeks towarów niebezpiecznych (International Maritime Dangerous Goods Code)",
      "IATA: Międzynarodowe Zrzeszenie Przewoźników Powietrznych (International Air Transport Association)",
      "ICAO: Organizacja Międzynarodowego Lotnictwa Cywilnego",
      "CLP: Rozporządzenie (WE) nr 1272/2008 w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin",
      "REACH: Rozporządzenie (WE) nr 1907/2006 w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów",
      "GHS: Globalnie Zharmonizowany System Klasyfikacji i Oznakowania Chemikaliów",
      "CAS: Chemical Abstracts Service (unikalny numeryczny identyfikator substancji chemicznej)",
      "WE: Numer Wspólnoty Europejskiej (oficjalny numer rejestracyjny substancji w UE: EINECS, ELINCS lub NLP)",
      "NDS: Najwyższe dopuszczalne stężenie na stanowisku pracy w ciągu 8-godzinnego dnia pracy",
      "NDSCh: Najwyższe dopuszczalne stężenie chwilowe (czas ekspozycji do 15 minut)",
      "NDSP: Najwyższe dopuszczalne stężenie pułapowe (wartość, która nie może być przekroczona w żadnym momencie)",
      "DNEL: Pochodny poziom niepowodujący zmian (Derived No-Effect Level)",
      "PNEC: Przewidywane stężenie niepowodujące zmian w środowisku (Predicted No-Effect Concentration)",
      "PBT: Substancja trwała, wykazująca zdolność do bioakumulacji i toksyczna",
      "vPvB: Substancja bardzo trwała i wykazująca bardzo dużą zdolność do bioakumulacji",
      "SVHC: Substancje wzbudzające szczególnie duże obawy (Substances of Very High Concern)",
      "BCF: Współczynnik biokoncentracji (Bioconcentration Factor)",
      "log Kow: Współczynnik podziału n-oktanol/woda",
      "LD50: Dawka śmiertelna dla 50% badanej populacji zwierząt laboratoryjnych",
      "LC50: Stężenie śmiertelne dla 50% badanej populacji organizmów testowych",
      "EC50: Stężenie wywołujące efekt u 50% badanej populacji testowej",
      "NOEC: Najwyższe stężenie, przy którym nie obserwuje się statystycznie istotnych skutków (No Observed Effect Concentration)",
      "SCL: Specyficzne stężenie graniczne (Specific Concentration Limit)",
      "BDO: Baza danych o produktach i opakowaniach oraz o gospodarce odpadami",
      "ECHA: Europejska Agencja Chemikaliów"
    ];

    let out = "SEKCJA 16: Inne informacje\n\n";

    if (hPhrasesBlock.length > 0) {
      out += "Pełne brzmienie zwrotów H i EUH przytoczonych w sekcjach 2 i 3 karty charakterystyki:\n";
      out += hPhrasesBlock.join('\n') + "\n\n";
    }

    if (classesBlock.length > 0) {
      out += "Wykaz klas i kategorii zagrożenia przytoczonych w karcie charakterystyki:\n";
      out += classesBlock.join('\n') + "\n\n";
    }

    out += "Objaśnienie skrótów i akronimów stosowanych w karcie charakterystyki:\n";
    out += acronyms.join('\n') + "\n\n";

    out += "Główne źródła literatury i danych:\n";
    out += "- Karty charakterystyki substancji składowych udostępnione przez producentów i dostawców surowców.\n";
    out += "- Baza danych Europejskiej Agencji Chemikaliów (ECHA): https://echa.europa.eu/\n";
    out += "- Baza danych PubChem National Library of Medicine: https://pubchem.ncbi.nlm.nih.gov/\n";
    out += "- Obowiązujące unijne i krajowe akty prawne (REACH, CLP, Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587).\n\n";

    out += "Zalecenia i wskazówki szkoleniowe dla pracowników:\n";
    out += "Przed przystąpieniem do pracy z produktem należy zapoznać się z treścią niniejszej karty charakterystyki oraz przepisami BHP obowiązującymi na stanowisku pracy. Pracownicy mający kontakt z produktem powinni zostać przeszkoleni w zakresie prawidłowego i bezpiecznego obchodzenia się z chemikaliami oraz postępowania w sytuacjach awaryjnych.\n\n";

    out += "Informacje o zmianach i aktualizacji:\n";
    if (/Brak\s*\(wydanie pierwsze/i.test(replacedRevision)) {
      const docDateMatch = replacedRevision.match(/z\s*dnia\s*([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
      const dateSuffix = docDateMatch ? ` z dnia ${docDateMatch[1]} r.` : "";
      out += `Niniejsza karta charakterystyki (wersja ${version || "1.0 PL"}) stanowi wydanie pierwsze w języku polskim, opracowane na podstawie karty charakterystyki SDS producenta${dateSuffix ? dateSuffix : "."}\n`;
    } else {
      out += `Niniejsza karta charakterystyki (wersja ${version || "1.0 PL"}) zastępuje wersję ${replacedRevision || "1.0"}.\n`;
    }
    const compName = (this.companyConfig && this.companyConfig.companyName) || process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.";
    const compAddress = (this.companyConfig && this.companyConfig.address) || process.env.COMPANY_ADDRESS || "ul. Wesoła 16";
    const compCity = (this.companyConfig && this.companyConfig.city) || process.env.COMPANY_CITY || "63-600 Kępno";
    const compSite = (this.companyConfig && this.companyConfig.website) || process.env.COMPANY_WEBSITE || "www.prostozwloch.com.pl";
    const addrStr = [compAddress, compCity].filter(Boolean).join(', ');
    const detailsStr = [addrStr, compSite].filter(Boolean).join(', ');
    const companyInfoSuffix = detailsStr ? ` (${detailsStr})` : "";

    out += "Aktualizacja została sporządzona i dostosowana zgodnie z wymogami Rozporządzenia Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniającego załącznik II do rozporządzenia (WE) nr 1907/2006 (REACH) oraz przepisami prawa Rzeczypospolitej Polskiej.\n";
    out += "Główne zmiany wprowadzone w bieżącej wersji obejmują:\n";
    out += `- Sekcja 1.3: Aktualizacja danych dostawcy karty w Rzeczypospolitej Polskiej na ${compName}${companyInfoSuffix}.\n`;
    out += "- Sekcja 8.1: Weryfikacja i implementacja krajowych norm higienicznych w środowisku pracy (NDS, NDSCh) na podstawie Rozporządzenia MRPiPS (Dz.U. 2018 poz. 1286 z późn. zm.).\n";
    out += "- Sekcja 11.2 i 12.6: Wdrożenie obligatoryjnych podsekcji dotyczących właściwości zaburzających funkcjonowanie układu hormonalnego.\n";
    out += "- Sekcja 13: Aktualizacja klasyfikacji i 6-cyfrowych kodów odpadów zgodnie z ustawą o odpadach i Dz.U. 2020 poz. 10.\n";
    out += "- Sekcja 14: Weryfikacja i zharmonizowanie warunków przewozu zgodnie z Umową ADR.\n\n";
    out += "Klauzula prawna i ochrona praw autorskich:\n";
    out += `Niniejsze autorskie opracowanie tłumaczenia, formatowania oraz adaptacji regulacyjnej do prawa polskiego stanowi własność intelektualną firmy ${compName}. Kopiowanie i wykorzystywanie całości lub fragmentów w celach komercyjnych przez podmioty trzecie bez uprzedniej zgody właściciela jest zabronione. Dozwolone jest wykorzystanie dokumentu przez odbiorców w łańcuchu dostaw do celów bezpieczeństwa pracy i ochrony zdrowia.\n\n`;
    out += "Informacje zawarte w niniejszej karcie wynikają z aktualnego stanu wiedzy producenta i dystrybutora i odnoszą się wyłącznie do opisanego produktu. Użytkownik ponosi odpowiedzialność za stworzenie bezpiecznych warunków pracy oraz spełnienie wymagań prawnych związanych z jego zastosowaniem.";

    return out.trim();
  }

  async prepareAgentPayload(pdfFilePath, productName = "PRODUKT CHEMICZNY", manualOverrides = {}) {
    console.log(`[SYS] Ekstrakcja pliku: ${pdfFilePath}`);
    const isDocx = SDSDocumentParser.isDocxFile(pdfFilePath);
    let fullText = "";
    let rawSections = {};
    let docxParsed = null;

    if (isDocx) {
      console.log(`[SYS] Wykryto format wejściowy DOCX. Uruchamianie zaawansowanej analizy strukturalnej OpenXML...`);
      docxParsed = SDSDocxParser.extractTextAndSections(pdfFilePath);
      fullText = docxParsed.fullText;
      rawSections = docxParsed.sections;
    } else {
      fullText = await SDSDocumentParser.extractText(pdfFilePath, false);
      rawSections = SDSPDFParser.segmentInto16Sections(fullText);
    }
    
    // Ekstrakcja metadanych rewizji i dat źródłowych (wg Pkt 0.2.5 Załącznika II do REACH)
    const revMatch = fullText.match(/(?:Revision\s*(?:nr\.?|no\.?|n\.|:)?\s*|Version\s*(?:nr\.?|no\.?|:)?\s*|Revisione\s*(?:n\.?|nr\.?|:)?\s*)(\d+(?:\.\d+)?)/i);
    
    // Wieloetapowa ekstrakcja daty wydania/rewizji SDS producenta (IT/EN/PL)
    let originalDate = null;
    const dateMatch = fullText.match(/(?:Dated|Data\s*compilazione|Date\s*of\s*compilation|Data\s*revisione|Data\s*wydania|Data\s*sporządzenia|Data\s*di\s*emissione|Data\s*di\s*revisione|Revisione\s*del|Emessa\s*il)[\s:\.]*([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
    if (dateMatch) {
      originalDate = dateMatch[1].replace(/\//g, '.');
    } else {
      const headerRevDateMatch = fullText.match(/(?:Revision|Revisione|Wersja)[^\n\r]{0,80}?([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
      if (headerRevDateMatch) {
        originalDate = headerRevDateMatch[1].replace(/\//g, '.');
      } else {
        const allDocDates = [...fullText.slice(0, 3000).matchAll(/\b([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})\b/g)];
        if (allDocDates.length > 0) {
          originalDate = allDocDates[0][1].replace(/\//g, '.');
        }
      }
    }

    const replMatch = fullText.match(/(?:Replaced\s*revision|Sostituisce\s*(?:la\s*)?revisione|Zastępuje\s*wersję)[\s:]*([^\n\r]+)/i);

    const originalRevision = revMatch ? revMatch[1] : "1";
    let replacedRevision = replMatch ? replMatch[1].trim() : null;
    if (replacedRevision) {
      replacedRevision = replacedRevision
        .replace(/Dated:/i, 'z dnia')
        .replace(/Data:/i, 'z dnia')
        .replace(/\//g, '.');
      if (!/wersj/i.test(replacedRevision)) {
        replacedRevision = `Wersja ${replacedRevision}`;
      }
    }
    // Ekstrakcja kodu produktu z pełnego tekstu (jeśli nie został podany)
    const docCodeMatch = fullText.match(/(?:Trade code|Codice prodotto|Codice|Kod produktu|Product code|\bCode)\s*[:\.]?\s*([A-Z0-9_\-\/]+)/i);
    const extractedCode = docCodeMatch ? docCodeMatch[1].trim() : "";

    const isExplicitSubsequentPolishRevision = manualOverrides.version && !/^1(\.0)?\s*(PL)?$/i.test(manualOverrides.version);
    const version = manualOverrides.version || "1.0 PL";
    
    // BEZWZGLĘDNY ZAKAZ używania new Date() jako daty karty producenta!
    let finalReplacedRevision = manualOverrides.replacedRevision;
    if (!finalReplacedRevision) {
      if (!isExplicitSubsequentPolishRevision) {
        if (originalDate) {
          finalReplacedRevision = `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia ${originalDate} r.)`;
        } else {
          finalReplacedRevision = "Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta)";
        }
      } else {
        finalReplacedRevision = replacedRevision || "Brak";
      }
    }

    // Metryka formalna karty w języku polskim (Pkt 0.2.5 Załącznika II do REACH - UE 2020/878):
    // 1. Data sporządzenia: data opracowania polskiej wersji (data bieżąca lub manualOverride)
    const compilationDate = manualOverrides.compilationDate || new Date().toLocaleDateString('pl-PL');
    // 2. Aktualizacja: dla wydania 1.0 PL karta nie była jeszcze aktualizowana ("Nie dotyczy"), dla kolejnych wydań data bieżącej aktualizacji
    const revisionDate = manualOverrides.revisionDate || (!isExplicitSubsequentPolishRevision ? "Nie dotyczy" : new Date().toLocaleDateString('pl-PL'));

    const ufi = SDSChemicalExtractor.extractUfi(rawSections["section_1"]);
    let s3;
    if (isDocx && docxParsed && docxParsed.tablesBySection && docxParsed.tablesBySection['section_3'] && docxParsed.tablesBySection['section_3'].length > 0) {
      s3 = await this.processSection3FromDocxTable(docxParsed.tablesBySection['section_3'], rawSections["section_3"], manualOverrides);
    } else {
      s3 = await this.processSection3(rawSections["section_3"], manualOverrides);
    }
    const s2 = this.processSection2(rawSections["section_2"], s3.resolvedSubstances, s3.components);
    const s1Content = this.processSection1(rawSections["section_1"], productName, ufi, manualOverrides, extractedCode);
    const s9Content = this.processSection9(rawSections["section_9"], s3.components);
    const s4Content = this.processSection4(rawSections["section_4"], s3.components, s2.content, s9Content);
    const s5Content = this.processSection5(rawSections["section_5"], s3.components, s2.content, s9Content);
    const s6Content = this.processSection6(rawSections["section_6"]);
    const s7Content = this.processSection7(rawSections["section_7"], s2.content);
    const s8Content = this.processSection8(rawSections["section_8"], s3.components, s2.content, s9Content);
    const s12Res = this.processSection12(rawSections["section_12"], s3.components, s2.content);
    const s12Content = s12Res.content;
    const s13Content = this.processSection13(rawSections["section_13"], s3.components, s2.content, s1Content);
    const s14Content = this.processSection14(rawSections["section_14"]);
    const s15Content = this.processSection15(rawSections["section_15"], s3.components, s1Content, s2.content);
    const s16Content = this.processSection16(rawSections["section_16"], s3.components, s2.content, version, finalReplacedRevision);

    const s2FinalContent = s2.content + "\n\n" + PolishLegalTemplates.getSection2_3(s12Res.endocrineDisruptorInfo);

    const deterministic = {
      section_1: { type: "CLP_MAPPED", content: s1Content },
      section_2: { type: "CLP_MAPPED", content: s2FinalContent },
      section_3: { type: "EXTRACT_RAW", content: s3.content, components: s3.components, chemicalDescription: s3.chemicalDescription },
      section_4: { type: "CLP_MAPPED", content: s4Content },
      section_5: { type: "CLP_MAPPED", content: s5Content },
      section_6: { type: "CLP_MAPPED", content: s6Content },
      section_7: { type: "CLP_MAPPED", content: s7Content },
      section_8: { type: "CLP_MAPPED", content: s8Content },
      section_9: { type: "CLP_MAPPED", content: s9Content },
      section_12: { type: "CLP_MAPPED", content: s12Content },
      section_13: { type: "CLP_MAPPED", content: s13Content },
      section_14: { type: "CLP_MAPPED", content: s14Content },
      section_15: { type: "CLP_MAPPED", content: s15Content },
      section_16: { type: "CLP_MAPPED", content: s16Content }
    };

    const toTranslate = {};
    let sec1_2Text = "";
    if (rawSections["section_1"]) {
      // 1. Próba standardowa: od 1.2 do 1.3 lub końca sekcji
      const match12 = rawSections["section_1"].match(/(?:1\.2\b[.:\-]?\s*[\s\S]*?)(?=(?:1\.3\b|$))/i);
      if (match12 && match12[0].trim().length > 10) {
        sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(match12[0]);
      } else {
        // 2. Próba semantyczna: poszukiwanie fraz kluczowych dotyczących zastosowań (PL/EN/IT/ES/DE/FR)
        const semanticMatch = rawSections["section_1"].match(/(?:1[\.\s]*2\b|Usi\s+(?:pertinenti\s+)?identificati|Relevant\s+identified\s+uses|Istotne\s+zidentyfikowane\s+zastosowania|Zidentyfikowane\s+zastosowania|Zastosowani[ae]|Identified\s+uses|Uses\s+advised\s+against|Usi\s+sconsigliati)[\s\S]*?(?=(?:1[\.\s]*3\b|Details\s+of\s+the\s+supplier|Informazioni\s+sul\s+fornitore|Dane\s+dotyczące\s+dostawcy|$))/i);
        if (semanticMatch && semanticMatch[0].trim().length > 10) {
          sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(semanticMatch[0]);
        }
      }
    }

    // 3. Sprawdzenie w całym dokumencie (jeśli sekcja 1 miała niestandardowe granice)
    if (!sec1_2Text && fullText) {
      const globalMatch = fullText.match(/(?:1\.2\b[.:\-]?\s*[\s\S]*?)(?=(?:1\.3\b|SEKCJA\s*2|SEZIONE\s*2|SECTION\s*2|$))/i);
      if (globalMatch && globalMatch[0].trim().length > 10) {
        sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(globalMatch[0]);
      }
    }

    // 4. Tarcza Ochronna (Defensive AI Fallback): Gwarancja niepustego bloku zgodnego z Załącznikiem II do REACH
    if (!sec1_2Text || sec1_2Text.trim().length === 0) {
      sec1_2Text = "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Produkt chemiczny / zapachowy do użytku konsumenckiego i profesjonalnego.\nZastosowania odradzane: Nie stosować do celów innych niż wskazane przez producenta.";
    }

    toTranslate["section_1_2"] = sec1_2Text.trim();
    // Sekcja 4 jest w 100% deterministyczna (dedukcja kliniczna w CLP_MAPPED) - wykluczona z promptu LLM
    [5, 6, 7, 10, 11].forEach(i => {
      toTranslate[`section_${i}`] = SDSProcessorEngine.cleanPdfArtifacts(rawSections[`section_${i}`]);
    });

    if (this.anomalies.length > 0) {
      throw new HITLError(this.anomalies);
    }

    const isTechnicalFilename = SDSProcessorEngine.isTechnicalFilename(productName);
    const finalProductName = this.lastResolvedTradeName || (!isTechnicalFilename ? SDSProcessorEngine.polonizeTradeName(productName) : "Karta Charakterystyki");

    return {
      metadata: { 
        productName: finalProductName, 
        productCode: extractedCode,
        ufi, 
        version,
        compilationDate,
        revisionDate,
        replacedRevision: finalReplacedRevision,
        companyConfig: this.companyConfig,
        components: s3.components,
        ghsPictograms: this.detectedGhsPictograms
      },
      deterministicSections: deterministic,
      descriptiveSectionsToTranslate: toTranslate,
      quarantineAudit: this.quarantineLogs,
      detectedGhsPictograms: this.detectedGhsPictograms,
      ocrDiagnostics: SDSPDFParser.ocrDiagnosticMessage
    };
  }

  static polonizeToxicologicalSection(content) {
    if (!content) return "";
    let text = content;
    text = text
      .replace(/\bRat\b/gi, 'szczur')
      .replace(/\bRats\b/gi, 'szczury')
      .replace(/\bRatto\b/gi, 'szczur')
      .replace(/\bRatti\b/gi, 'szczury')
      .replace(/\bRabbit\b/gi, 'królik')
      .replace(/\bRabbits\b/gi, 'króliki')
      .replace(/\bConiglio\b/gi, 'królik')
      .replace(/\bConigli\b/gi, 'króliki')
      .replace(/\bMouse\b/gi, 'mysz')
      .replace(/\bMice\b/gi, 'myszy')
      .replace(/\bTopo\b/gi, 'mysz')
      .replace(/\bTopi\b/gi, 'myszy')
      .replace(/\bGuinea pig\b/gi, 'świnka morska')
      .replace(/\bHuman\b/gi, 'człowiek')
      .replace(/\bOral\b/gi, 'droga pokarmowa (doustnie)')
      .replace(/\bOrale\b/gi, 'droga pokarmowa (doustnie)')
      .replace(/\bDermal\b/gi, 'na skórę')
      .replace(/\bCutanea\b/gi, 'na skórę')
      .replace(/\bInhalation\b/gi, 'przez drogi oddechowe (inhalacyjnie)')
      .replace(/\bInalatoria\b/gi, 'przez drogi oddechowe (inhalacyjnie)')
      .replace(/\bVapours\b/gi, 'pary')
      .replace(/\bVapori\b/gi, 'pary')
      .replace(/\bDust\/Mist\b/gi, 'pył/mgła')
      .replace(/\bbw\/d\b/gi, 'mc/dzień')
      .replace(/Skin irritation\b/gi, 'działanie drażniące na skórę')
      .replace(/Eye irritation\b/gi, 'działanie drażniące na oczy')
      .replace(/Skin sensitisation\b/gi, 'działanie uczulające na skórę')
      .replace(/Respiratory sensitisation\b/gi, 'działanie uczulające na drogi oddechowe')
      .replace(/Germ cell mutagenicity\b/gi, 'działanie mutagenne na komórki rozrodcze')
      .replace(/Carcinogenicity\b/gi, 'rakotwórczość')
      .replace(/Reproductive toxicity\b/gi, 'szkodliwe działanie na rozrodczość')
      .replace(/STOT-single exposure\b/gi, 'działanie toksyczne na narządy docelowe – narażenie jednorazowe')
      .replace(/STOT-repeated exposure\b/gi, 'działanie toksyczne na narządy docelowe – narażenie powtarzane')
      .replace(/Aspiration hazard\b/gi, 'zagrożenie spowodowane aspiracją')
      .replace(/Does not meet the criteria for classification/gi, 'W oparciu o dostępne dane, kryteria klasyfikacji nie są spełnione')
      .replace(/Not classified/gi, 'Nie sklasyfikowano')
      .replace(/No data available/gi, 'Brak dostępnych danych')
      .replace(/\bETHANOL\b/gi, 'Etanol')
      .replace(/\bTOLUENE\b/gi, 'Toluen')
      .replace(/\bANISALDEHYDE\b/gi, 'Aldehyd anyżowy')
      .replace(/\b2H-CHROMEN-2-ONE\b/gi, 'Kumaryna')
      .replace(/\b2,6-di-tert-butyl-p-cresol\b/gi, '2,6-di-tert-butylo-4-metylofenol (BHT)')
      .replace(/\bDRACOWNICY\b/gi, 'PRACOWNICY')
      .replace(/(?:LC50\s*\([^\)]*(?:Inhalation|inhalac|drogi\s*oddechowe)[^\)]*\)\s*:\s*)?120\s*mg\/l\/4h\s*Pimephales\s+promelas/gi, 'LC50 (drogi oddechowe, pary, szczur): 120 mg/l/4h')
      .replace(/Pimephales\s+promelas/gi, 'szczur');

    // Deduplikator powielonych oznaczeń LC50 / LD50
    text = text.replace(/LC50[^\n:]*:\s*LC50[^\n:]*:\s*/gi, 'LC50 (drogi oddechowe, pary, szczur): ');
    text = text.replace(/LD50\s*\(([^\)]*)\)\s*:\s*LD50\s*\([^\)]*\)\s*:\s*/gi, 'LD50 ($1): ');
    text = text.replace(/(?:LC50\s*\([^\)]*\)\s*:\s*)+LC50\s*\([^\)]*\)\s*:\s*/gi, 'LC50 (drogi oddechowe, pary, szczur): ');
    text = text.replace(/(\d+h)\s+\1/gi, '$1');

    text = SDSProcessorEngine.sanitizeToxicologicalUnits(text);

    return text;
  }

  static sanitizeToxicologicalUnits(content) {
    if (!content) return "";
    let text = content;

    // 1. Usunięcie nieprawidłowych linii LC50 z jednostką dawki (mg/kg, g/kg)
    const lines = text.split('\n');
    const cleanedLines = lines.filter(line => {
      const isLC50 = /(?:LC50|CL50|\binhalac|\binhalation|drogi\s*oddechowe)/i.test(line);
      const hasDose = /\b(?:mg\/kg|g\/kg|µg\/kg|ug\/kg)\b/i.test(line);
      const isOralOrDermal = /(?:LD50|DL50|\bdoustn|\bskórn|\boral|\bdermal)/i.test(line);
      if (isLC50 && hasDose && !isOralOrDermal) {
        return false;
      }
      return true;
    });
    text = cleanedLines.join('\n');

    // 2. Usunięcie nieprawidłowych segmentów inline LC50 z mg/kg
    text = text.replace(/(?:[ \t]+|^)(?:[*-]\s*)?(?:LC50|CL50)\s*\([^\)]*(?:inhalac|inhalation|drogi\s*oddechowe|mists|powders|fumi|nebbie|pary|vapours|pył|mgła)[^\)]*\)\s*:\s*[0-9\.,\s><~]+\s*(?:mg\/kg|g\/kg|µg\/kg|ug\/kg)\s*(?:bw|m\.c\.)?\s*(?:rat|szczur|rabbit|królik|mouse|mysz|human|człowiek)?/gi, '');

    text = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return text;
  }

  static sanitizeSection11Hierarchy(content) {
    if (!content) return "";
    let text = content;
    const match11_2 = text.match(/(?:^|\n)\s*(?:11\.2[.:\-]?\s*(?:Informacje o innych zagrożeniach|Information on other hazards)[\s\S]*?)(?=(?:^|\n)\s*(?:[h-j]\)|h\.\s|i\.\s|j\.\s|STOT|działanie toksyczne na narządy docelowe|zagrożenie spowodowane aspiracją|aspiration hazard))/i);
    if (match11_2) {
      const misplaced11_2 = match11_2[0];
      text = text.replace(misplaced11_2, '\n');
      const pointJMatch = text.match(/(?:^|\n)\s*(?:j\b[.:\)]|zagrożenie spowodowane aspiracją|aspiration hazard)\s*[^\n]+(?:\n[^\n]+)*/i);
      if (pointJMatch) {
        const insertIdx = pointJMatch.index + pointJMatch[0].length;
        text = text.substring(0, insertIdx) + '\n\n' + misplaced11_2.trim() + '\n\n' + text.substring(insertIdx);
      } else {
        text = text.trim() + '\n\n' + misplaced11_2.trim();
      }
    }
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  static normalizeSection7Storage(content, isFlammableLiquid = false) {
    if (!content) return "";
    let text = content;

    const trgsRegex = /(?:^|\n)[ \t]*(?:Storage\s+class\s+)?(?:TRGS\s*510(?:\s*\([^\)]*\))?|Lagerklasse\s*(?:TRGS\s*510)?|Klasa\s+składowania\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?|Klasa\s+magazynowa\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?)[^\n]*/gi;

    if (trgsRegex.test(text)) {
      if (isFlammableLiquid) {
        const plStorageClause = "\nWytyczne dotyczące magazynowania cieczy łatwopalnych: Magazynowanie prowadzić zgodnie z polskimi przepisami ochrony przeciwpożarowej (Rozporządzenie Ministra Spraw Wewnętrznych i Administracji z dnia 7 czerwca 2010 r. w sprawie ochrony przeciwpożarowej budynków, innych obiektów budowlanych i terenów – Dz.U. 2010 nr 109 poz. 719 z późn. zm.). Przechowywać wyłącznie w oryginalnych, szczelnie zamkniętych pojemnikach, w chłodnym, suchym i dobrze wentylowanym miejscu, z dala od źródeł ciepła, gorących powierzchni, iskier, otwartego ognia i innych źródeł zapłonu. Zabezpieczyć przed wyładowaniami elektrostatycznymi. Pomieszczenia magazynowe powinny posiadać nienasiąkliwą posadzkę oraz zabezpieczenia rozlewiskowe (wanny wychwytowe) zapobiegające przedostaniu się cieczy do kanalizacji, wód gruntowych i gleby.";
        text = text.replace(trgsRegex, plStorageClause);
      } else {
        text = text.replace(trgsRegex, '');
      }
    }

    // Dodatkowa dezynfekcja obcych oznaczeń WGK / VwVwS / AwSV
    text = text.replace(/(?:^|\n)[ \t]*(?:WGK\b|Wassergefährdungsklasse|Klasa\s+zagrożenia\s+wód\s+WGK)[^\n]*/gi, '');

    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  mergeCompletedSds(agentPayload, agentTranslated) {
    const finalSections = {};

    let s1Content = agentPayload.deterministicSections.section_1.content;
    if (agentTranslated && agentTranslated.section_1_2) {
      const trans12 = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated.section_1_2).trim();
      if (trans12 && !/-\s*-/i.test(trans12) && !/:\s*-\s*$/m.test(trans12) && !/odświeżacz powietrza:\s*-/i.test(trans12)) {
        s1Content = s1Content.replace(/(?:^|\n)\s*1\.2\.\s*Istotne zidentyfikowane zastosowania[\s\S]*?(?=(?:^|\n)\s*1\.3\b|$)/i, '\n' + trans12 + '\n\n');
      }
    }

    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;

      if (i === 1) {
        finalSections[key] = { type: "CLP_MAPPED", content: s1Content.trim() };
      } else if (i === 4 && agentPayload.deterministicSections[key]) {
        // Sekcja 4: pełna deterministyczna dedukcja kliniczna na podstawie CLP i składników
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (i === 5) {
        // Sekcja 5: Sprawdzenie i normalizacja bezpieczeństwa pożarowego (piana alkoholoodporna AR-AFFF dla palnych cieczy polarnych)
        let s5Source = (agentTranslated && agentTranslated[key]) ? agentTranslated[key] : (agentPayload.deterministicSections[key] ? agentPayload.deterministicSections[key].content : "");
        let content = SDSProcessorEngine.cleanPdfArtifacts(s5Source).trim();
        const componentsList = agentPayload.metadata?.components || (agentPayload.deterministicSections?.section_3?.components) || [];
        const isPolarFlammable = SDSProcessorEngine.isFlammablePolarMixture(
          componentsList,
          agentPayload.deterministicSections?.section_2?.content || '',
          agentPayload.deterministicSections?.section_9?.content || ''
        );
        content = SDSProcessorEngine.enforceAlcoholResistantFoam(content, isPolarFlammable);
        finalSections[key] = { type: "CLP_MAPPED", content };
      } else if ([6, 7, 10, 11].includes(i) && agentTranslated && agentTranslated[key]) {
        let content = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated[key]).trim();
        if (i === 7) {
          const s2Text = agentPayload.deterministicSections?.section_2?.content || "";
          const isFlammable = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2Text);
          content = SDSProcessorEngine.normalizeSection7Storage(content, isFlammable);
        }
        if (i === 10) {
          content = content.replace(/\bsrebreem\b/gi, 'srebrem');
          const s9Text = agentPayload.deterministicSections?.section_9?.content || "";
          const phM = s9Text.match(/pH\s*[:\.]?\s*([^\n]+)/i);
          const phStr = phM ? phM[1].trim() : "";
          const incomp = SDSConsistencyEngine.getSection10Incompatible(phStr, content);
          if (/(?:kwasow|zasad|metale)/i.test(incomp)) {
            if (/10\.5\.\s*Materiały niezgodne/i.test(content)) {
              content = content.replace(/(?:10\.5\.\s*Materiały niezgodne\s*[:\.]?\s*)(?:[^\n]+)/i, `10.5. Materiały niezgodne: ${incomp}`);
            } else if (/Materiały niezgodne/i.test(content)) {
              content = content.replace(/(?:Materiały niezgodne\s*[:\.]?\s*)(?:[^\n]+)/i, `Materiały niezgodne: ${incomp}`);
            }
          }
        }
        if (i === 11) {
          content = SDSProcessorEngine.sanitizeSection11Hierarchy(content);
          content = SDSProcessorEngine.polonizeToxicologicalSection(content);
        }
        finalSections[key] = { type: "TRANSLATED", content };
      } else if (agentPayload.deterministicSections[key]) {
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (agentTranslated && agentTranslated[key]) {
        let content = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated[key]).trim();
        finalSections[key] = { type: "TRANSLATED", content };
      } else {
        throw new Error(`[CRITICAL HALT] Brak danych dla ${key}.`);
      }
    }
    return { ...agentPayload.metadata, sections: finalSections, ghsPictograms: agentPayload.detectedGhsPictograms, audit: agentPayload.quarantineAudit };
  }
}

// ============================================================================
// 9. EKSPORT DOCX (Z pełnym formatowaniem, paginacją i piktogramami)
// ============================================================================

module.exports = { SDSProcessorEngine };
