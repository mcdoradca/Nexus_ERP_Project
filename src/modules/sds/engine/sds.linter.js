/**
 * ARCHITEKTURA SDS NEXUS ERP - RYGORYSTYCZNY LINTER PRAWNO-CHEMICZNY SANEPID / PIP
 * Niezależna bramka kontrolna weryfikująca zgodność karty z REACH (UE 2020/878) i CLP (WE 1272/2008)
 */

const { CANONICAL_TEST_ORGANISMS } = require('./sds.canonical.clp');

class SDSLinter {
  static lint(sdsData) {
    if (!sdsData) return { isValid: true, errors: [], warnings: [], fixesApplied: [] };
    const payload = sdsData.sections ? sdsData : { sections: sdsData };
    return this.auditAndLint(payload);
  }

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
    const s16 = typeof sections.section_16 === 'object' ? (sections.section_16.content || "") : (sections.section_16 || "");

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

      // Temperatura topnienia/krzepnięcia cieczy nie może być "nie dotyczy"
      const meltingMatch = s9.match(/Temperatura\s+topnienia(?:\/krzepnięcia)?\s*[:\.]?\s*([^\n\r]+)/i);
      if (meltingMatch) {
        const val = meltingMatch[1].trim();
        if (/nie\s+dotyczy/i.test(val)) {
          errors.push("[Sekcja 9.1] BŁĄD PRAWNY: Temperatura topnienia/krzepnięcia dla produktu płynnego została oznaczona jako 'Nie dotyczy'. Ciecz fizycznie zawsze posiada temperaturę krzepnięcia (wymagane: 'Brak danych' lub 'Nie oznaczono').");
        }
      }

      // Prężność pary cieczy nie może być "nie dotyczy"
      const vapourMatch = s9.match(/Prężność\s+pary\s*[:\.]?\s*([^\n\r]+)/i);
      if (vapourMatch) {
        const val = vapourMatch[1].trim();
        if (/nie\s+dotyczy/i.test(val)) {
          errors.push("[Sekcja 9.1] BŁĄD PRAWNY: Prężność pary dla produktu płynnego została oznaczona jako 'Nie dotyczy'. Ciecz fizycznie zawsze posiada prężność pary (wymagane: 'Brak danych' lub 'Nie oznaczono').");
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

    // ------------------------------------------------------------------------
    // REGUŁA 6: DROGA SKÓRNA W DNEL DLA SUBSTANCJI Z NOTACJĄ SKÓRA (SEKCJA 8.1)
    // ------------------------------------------------------------------------
    if (/67-56-1|metanol|methanol/i.test(s3)) {
      const methDnel = s8.match(/(?:metanol|methanol|67-56-1)[\s\S]*?(?=(?:substancja|etanol|toluen|aceton|galaxolide|2H-CHROMEN|\b[A-Z0-9_-]+ \[\b|8\.2|$))/i);
      if (methDnel && /Pochodne poziomy niepowodujące zmian/i.test(methDnel[0])) {
        if (!/Na\s+skórę/i.test(methDnel[0])) {
          errors.push("[Sekcja 8.1] BŁĄD AUDYTU: Metanol posiada klasyfikację Acute Tox. 3 (H311) oraz notację 'skóra', lecz w wykazie DNEL pominięto wartości dla drogi skórnej ('Na skórę:').");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 7: INTEGRALNOŚĆ EKOTOKSYCZNOŚCI - ZAKAZ PUSTYCH WSKAŹNIKÓW (SEKCJA 12.1)
    // ------------------------------------------------------------------------
    if (s12) {
      const emptyTestLines = s12.match(/^-\s*(?:LC50|EC50|NOEC|IC50)[^\n:]*:\s*$/gm);
      if (emptyTestLines && emptyTestLines.length > 0) {
        errors.push(`[Sekcja 12.1] BŁĄD STRUKTURALNY: Wykryto ${emptyTestLines.length} wierszy wskaźników badawczych bez wartości liczbowych (np. ucięte wartości testów ekotoksykologicznych).`);
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 8: SPÓJNOŚĆ ALERGENÓW (SEKCJA 4.2 vs SEKCJA 2.2 / 3.2)
    // ------------------------------------------------------------------------
    const s4 = typeof sections.section_4 === 'object' ? (sections.section_4.content || "") : (sections.section_4 || "");
    if (/EUH208/i.test(s2) && /zawiera/i.test(s4)) {
      // Jeśli w sekcji 2.2 wymieniono więcej niż jeden alergen, sekcja 4.2 nie może wymieniać tylko jednego
      const euhMatch = s2.match(/EUH208[^\n.]*/i);
      if (euhMatch) {
        const allergensInS2 = (euhMatch[0].match(/,/g) || []).length + 1;
        if (allergensInS2 >= 2 && !s4.includes(',') && !/patrz/i.test(s4)) {
          errors.push("[Sekcja 4.2] NIESPÓJNOŚĆ ALERGENÓW: Produkt zawiera wiele składników uczulających wykazanych w EUH208, a w Sekcji 4.2 wymieniono tylko pojedynczy składnik.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 9: ZAKAZ EUH208 DLA MIESZANIN ZAKLASYFIKOWANYCH JAKO H317 (CLP ART. 18(3)(B))
    // ------------------------------------------------------------------------
    if (/(?:H317|Skin\s*Sens)/i.test(s2)) {
      if (/EUH208/i.test(s2)) {
        errors.push("[Sekcja 2.2] BŁĄD CLP ART. 18(3)(b): Mieszanina jest zaklasyfikowana jako Skin Sens. (H317) - substancje uczulające muszą znaleźć się na etykiecie pod 'Zawiera:', a umieszczanie zwrotu EUH208 jest niezgodne z prawem.");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 10: ZAKAZ POZOSTAWIANIA NAGŁÓWKÓW STRON (RUNNING HEADERS) W TREŚCI
    // ------------------------------------------------------------------------
    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;
      const secVal = typeof sections[key] === 'object' ? (sections[key].content || "") : (sections[key] || "");
      if (/Suarez\s+Company/i.test(secVal) || /(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/.test(secVal)) {
        errors.push(`[Sekcja ${i}] ARTEFAKT PARSERA: Wykryto niesfiltrowany nagłówek/stopkę strony PDF w treści dokumentu.`);
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 11: OBECNOŚĆ ZWROTU P501 DLA MIESZANIN STWARZAJĄCYCH ZAGROŻENIE
    // ------------------------------------------------------------------------
    if (/(?:H317|H411|H412|H225|H226)/i.test(s2) && /Zwroty\s+wskazujące\s+środki\s+ostrożności/i.test(s2)) {
      if (!/P501/i.test(s2)) {
        errors.push("[Sekcja 2.2] BŁĄD BHP: Mieszanina stwarzająca zagrożenie nie zawiera obowiązkowego zwrotu P501 (Usuwanie).");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 12: BEZPIECZEŃSTWO PPOŻ - PIANA ALKOHOLOODPORNA DLA CIECZY POLARNYCH (SEKCJA 5.1)
    // ------------------------------------------------------------------------
    const s5 = typeof sections.section_5 === 'object' ? (sections.section_5.content || "") : (sections.section_5 || "");
    const isFlammableLiquid = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2);
    const hasPolarSolventsInS3 = /(?:etanol|ethanol|metanol|methanol|propanol|isopropanol|izopropanol|butanol|aceton|acetone|glycol|glikol|ether|octan|acetate|64-17-5|67-56-1|67-63-0|67-64-1)/i.test(s3);
    if (isFlammableLiquid && hasPolarSolventsInS3 && s5) {
      const suitableMatch = s5.match(/(?:Odpowiednie\s+środki\s+gaśnicze|Suitable\s+extinguishing\s+media|Suitable\s+extinguishing\s+equipment)\s*[:\.]?\s*([^\n]+(?:\n[^\n]+)?)/i);
      if (suitableMatch) {
        const suitableText = suitableMatch[1];
        if (/\bpian[a-zęóąśłżźćń]*\b/i.test(suitableText) && !/alkoholoodporn|AR-AFFF/i.test(suitableText)) {
          errors.push("[Sekcja 5.1] KRYTYCZNY BŁĄD PPOŻ (ZAGROŻENIE ŻYCIA STRAŻAKÓW): Produkt jest łatwopalną cieczą polarną (H225/H226), a jako środek gaśniczy wskazano standardową pianę. Wymagane bezwzględne wskazanie piany alkoholoodpornej (np. typu AR-AFFF), gdyż standardowa piana ulega natychmiastowemu rozpuszczeniu.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 13: INTEGRALNOŚĆ DANYCH EKOTOKSYKOLOGICZNYCH (SEKCJA 12.2)
    // ------------------------------------------------------------------------
    if (s12) {
      if (/(?:Rozpuszczalność\s+w\s+wodzie|Solubility\s+in\s+water)/i.test(s12)) {
        errors.push("[Sekcja 12.2] BŁĄD STRUKTURY DANYCH: Wykryto parametr fizykochemiczny 'Rozpuszczalność w wodzie' w Sekcji 12.2 (Trwałość i zdolność do rozkładu). Rozpuszczalność w wodzie należy wyłącznie do Sekcji 9.1.");
      }
      if (/^[\d><~]+[\s\d\-.,]*\s*mg\/l\s*:/m.test(s12)) {
        errors.push("[Sekcja 12.2] BŁĄD PARSERA: Wartość liczbowa/zakres stężeń został błędnie potraktowany jako nazwa substancji.");
      }
      if (/Dodatkowe informacje:\s*(?:geraniol|LINALYL ACETATE|galaxolide|ACETONE|2H-CHROMEN-2-ONE)\b/i.test(s12)) {
        errors.push("[Sekcja 12.2] PRZEMIESZANIE SUBSTANCJI: Nazwa składnika wyciekła do pola 'Dodatkowe informacje' innej substancji.");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 14: ZAKAZ POWIELANIA OBCYCH NORM KRAJOWYCH (TRGS 510 / WGK) W SEKCJI 7
    // ------------------------------------------------------------------------
    const s7 = typeof sections.section_7 === 'object' ? (sections.section_7.content || "") : (sections.section_7 || "");
    if (s7) {
      if (/(?:TRGS\s*510|Lagerklasse|Klasa\s+składowania\s*TRGS|Storage\s+class\s*TRGS)/i.test(s7)) {
        errors.push("[Sekcja 7.2] BŁĄD JURYSDYKCJI (BEZREFLEKSYJNA TRANSLACJA): Wykryto niemiecką normę techniczną TRGS 510 w polskiej karcie SDS. Wymagane usunięcie lub powołanie polskich przepisów ppoż. (Dz.U. 2010 nr 109 poz. 719).");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 15: ZAKAZ POWIELANIA OGRANICZEŃ DLA TUSZÓW DO TATUAŻU (POZ. 75 ZAŁĄCZNIKA XVII) DLA PRODUKTÓW NIETATUATORSKICH
    // Rozporządzenie Komisji (UE) 2020/2081 (Poz. 75 dotyczy wyłącznie mieszanin do celów wykonywania tatuażu)
    // ------------------------------------------------------------------------
    const s15 = typeof sections.section_15 === 'object' ? (sections.section_15.content || "") : (sections.section_15 || "");
    const isTattooProduct = /(?:tatu|tattoo|makijaż\s+permanentn|permanent\s+make-?up)/i.test(s1);
    if (s15 && !isTattooProduct) {
      if (/(?:pozycji\s*75|pozycja\s*75|tuszach\s+do\s+tatuażu)/i.test(s15)) {
        errors.push("[Sekcja 15.1] ABSURD PRAWNY: Wykryto ograniczenie z pozycji 75 załącznika XVII (tusze do tatuażu i makijaż permanentny) w produkcie, który nie jest tuszem do tatuażu. Ograniczenie z pozycji 75 dotyczy wyłącznie mieszanin do tatuażu.");
      }
    }
    // ------------------------------------------------------------------------
    // REGUŁA 16: ZAKAZ FIZYCZNIE NIEMOŻLIWYCH JEDNOSTEK TOKSYKOLOGICZNYCH W SEKCJI 11.1
    // Rozporządzenie (UE) 2020/878 Załącznik II; Wytyczne ECHA do CLP (OECD 403)
    // Stężenie w powietrzu (inhalacja) to mg/l, mg/m3 lub ppm. mg/kg to dawka (LD50 doustnie/skórnie).
    // ------------------------------------------------------------------------
    if (s11) {
      const s11Lines = s11.split('\n');
      for (const line of s11Lines) {
        const isLC50orInhalation = /(?:LC50|CL50|\binhalac|\binhalation|drogi\s*oddechowe)/i.test(line);
        const hasDoseUnit = /\b(?:mg\/kg|g\/kg|µg\/kg|ug\/kg)\b/i.test(line);
        const isLD50orOralDermal = /(?:LD50|DL50|\bdoustn|\bskórn|\boral|\bdermal)/i.test(line);

        if (isLC50orInhalation && hasDoseUnit && !isLD50orOralDermal) {
          errors.push(`[Sekcja 11.1] BŁĄD MERYTORYCZNY JEDNOSTEK TOKSYKOLOGICZNYCH: Wykryto parametr inhalacyjny z fizycznie niemożliwą jednostką dawki na masę ciała (${line.trim()}). Stężenie śmiertelne w powietrzu (inhalacja) musi być podawane w mg/l, mg/m³ lub ppm. Jednostka mg/kg dotyczy wyłącznie dawki doustnej/skórnej (LD50).`);
          break;
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 17: ZAKAZ GENERYCZNEGO ZAPYCHACZA EUH208 ("Zawiera substancję uczulającą")
    // Rozporządzenie CLP Załącznik III i art. 18 ust. 3 lit. b / art. 25 ust. 6
    // ------------------------------------------------------------------------
    if (s2 && /substancj[aęie]\s+uczulając[aąe]/i.test(s2)) {
      errors.push("[Sekcja 2.2] BŁĄD CLP: Wykryto generyczny zapychacz 'Zawiera substancję uczulającą' w Sekcji 2.2. Zgodnie z CLP należy podać konkretne nazwy alergenów w bierniku lub usunąć zwrot EUH208, jeśli mieszanina jest zaklasyfikowana jako Skin Sens. (H317).");
    }
    if (s16 && /EUH208[^\n]*substancj[aęie]\s+uczulając[aąe]/i.test(s16)) {
      errors.push("[Sekcja 16] BŁĄD CLP: Wykryto generyczny zapychacz 'Zawiera substancję uczulającą' dla EUH208 w Sekcji 16. Wymagane podanie konkretnych alergenów w bierniku (np. 'Zawiera kumarynę, geraniol...') lub oficjalnego wzorca ze zmienną [nazwa substancji uczulającej].");
    }

    // ------------------------------------------------------------------------
    // REGUŁA 18: OBOWIĄZEK WYKAZANIA ETANOLU NA ETYKIECIE PRZY KLASYFIKACJI H225/H319
    // Rozporządzenie CLP art. 18 ust. 3 lit. b (rozpuszczalnik bazowy w stężeniu dominującym >= 10%)
    // ------------------------------------------------------------------------
    const hasEthanolInS3 = /(?:etanol|ethanol|64-17-5)/i.test(s3) && /(?:[1-9]\d|\b[1-9]\d(?:\.\d+)?\s*%\b|\b7[4-8]\b)/.test(s3);
    const isFlammableOrEyeInS2 = /H225|H319|Flam\.\s*Liq\.\s*2|Eye\s*Irrit\.\s*2/i.test(s2);
    if (hasEthanolInS3 && isFlammableOrEyeInS2 && s2) {
      const labelSubstancesMatch = s2.match(/(?:Nazwy niebezpiecznych substancji wymienione na etykiecie|Substancje wymienione na etykiecie)[\s\S]*?(?=\n\n(?:Zwroty wskazujące rodzaj zagrożenia|$))/i);
      if (labelSubstancesMatch) {
        if (!/(?:etanol|ethanol)/i.test(labelSubstancesMatch[0])) {
          errors.push("[Sekcja 2.2] BŁĄD CLP ART. 18(3)(b): Brak etanolu w wykazie substancji decydujących o zagrożeniach mieszaniny (Nazwy niebezpiecznych substancji wymienione na etykiecie) przy obecności etanolu w stężeniu dominującym (≥ 10%) i klasyfikacji H225/H319.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 19: SPÓJNOŚĆ TOŻSAMOŚCI ALERGENÓW (IZOEUGENOL VS EUGENOL) I ZAKAZ KLONOWANIA SYNONIMÓW NA ETYKIECIE
    // Rozporządzenie CLP art. 18 ust. 3 lit. b
    // ------------------------------------------------------------------------
    if (s2) {
      const labelMatch = s2.match(/(?:Nazwy niebezpiecznych substancji wymienione na etykiecie|Substancje wymienione na etykiecie)[\s\S]*?(?=\n\n(?:Zwroty wskazujące rodzaj zagrożenia|$))/i);
      if (labelMatch) {
        const labelText = labelMatch[0];
        // 1. Fałszywy eugenol zamiast izoeugenolu
        const hasIsoInS3 = /(?:97-54-1|izoeugenol|isoeugenol)/i.test(s3);
        const hasEugenolInS3 = /(?:97-53-0|\beugenol\b)/i.test(s3) && !/izoeugenol|isoeugenol/i.test(s3.replace(/97-54-1[^\n]+/g, ''));
        if (/\beugenol\b/i.test(labelText) && !/\bizoeugenol\b/i.test(labelText) && hasIsoInS3 && !hasEugenolInS3) {
          errors.push("[Sekcja 2.2] KRYTYCZNY BŁĄD IDENTYFIKACJI CHEMICZNEJ (CLP art. 18 ust. 3): Na etykiecie wpisano fałszywy alergen 'eugenol', podczas gdy w składzie (Sekcja 3) znajduje się 'izoeugenol' (CAS: 97-54-1). Są to dwie odrębne substancje chemiczne.");
        }
        // 2. Klonowanie substancji: 3,7-DIMETHYLOCT-6-EN-1-OL oraz cytronellol
        if (/3,7-dimethyloct-6-en-1-ol/i.test(labelText) && /cytronellol/i.test(labelText)) {
          errors.push("[Sekcja 2.2] BŁĄD KLONOWANIA SUBSTANCJI (BRAK HARMONIZACJI NAZEWNICTWA): Zdublowano ten sam składnik (CAS: 106-22-9) pod nazwą chemiczną ('3,7-DIMETHYLOCT-6-EN-1-OL') oraz nazwą zwyczajową ('cytronellol').");
        }
        // 3. Klonowanie substancji: 3,7-DIMETHYLNONA-1,6-DIEN-3-OL pod dwiema postaciami
        if (/\b3,7-dimethylnona-1,6-dien-3-ol\b/i.test(labelText) && /\(6E\)-3,7-dimethylnona-1,6-dien-3-ol\b/i.test(labelText)) {
          errors.push("[Sekcja 2.2] BŁĄD KLONOWANIA SUBSTANCJI (BRAK HARMONIZACJI NAZEWNICTWA): Zdublowano ten sam składnik (CAS: 10339-55-6) pod dwiema różnymi postaciami zapisu chemicznego.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 20: ZAKAZ OBCOJĘZYCZNYCH WTRĄCEŃ (ang. ...) W SEKCJI 3 (ART. 31 UST. 5 REACH)
    // ------------------------------------------------------------------------
    if (s3 && /\(ang\.[^\)]*\)/i.test(s3)) {
      errors.push("[Sekcja 3] BŁĄD JĘZYKOWY (ART. 31 UST. 5 REACH): Wykryto anglojęzyczne wtrącenie '(ang. ...)' w wykazie składników Sekcji 3. Karta SDS w obrocie na terytorium RP musi być w całości w języku polskim.");
    }

    // ------------------------------------------------------------------------
    // REGUŁA 21: SPÓJNOŚĆ MATERIAŁÓW NIEZGODNYCH W SEKCJI 10.5 DLA PRODUKTÓW KWASOWYCH
    // ------------------------------------------------------------------------
    const s10 = typeof sections.section_10 === 'object' ? (sections.section_10.content || "") : (sections.section_10 || "");
    const phMatch = s9.match(/pH\s*[:\.]?\s*([0-9]+(?:[.,][0-9]+)?)/i);
    const phVal = phMatch ? parseFloat(phMatch[1].replace(',', '.')) : null;
    const isAcidic = (phVal !== null && phVal < 5) || /(?:kwas\s+(?:mrówkowy|octowy|solny|siarkowy|fosforowy|cytrynowy|mlekowy)|acid)/i.test(s3);
    if (isAcidic && s10) {
      if (/(?:brak szczególnych|nie są znane żadne szczególne|brak znanych|nie dotyczy)/i.test(s10) && !/(?:zasad|alkal|utleniacz|metal)/i.test(s10)) {
        errors.push("[Sekcja 10.5] NIESPÓJNOŚĆ CHEMICZNA: Produkt ma odczyn kwasowy (pH < 5 lub obecność kwasów), a w Sekcji 10.5 wskazano 'Brak szczególnych'. Kwas bezwzględnie wchodzi w reakcję z mocnymi zasadami, utleniaczami oraz metalami.");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 22: PRECYZJA PARAMETRÓW ŚRODKÓW OCHRONY INDYWIDUALNEJ (SEKCJA 8.2)
    // Rozporządzenie (UE) 2020/878 Załącznik II pkt 8.2
    // ------------------------------------------------------------------------
    const hasSkinOrEyeHazard = /(?:H314|H315|H317|H318|H319|Skin Corr|Eye Dam|Skin Irrit|Eye Irrit|Skin Sens)/i.test(s2);
    if (hasSkinOrEyeHazard && s8) {
      if (/(?:H314|H315|H317|Skin Corr|Skin Irrit|Skin Sens)/i.test(s2)) {
        if (/rękawic/i.test(s8) && !/374/i.test(s8)) {
          warnings.push("[Sekcja 8.2] ZALECENIE REACH: Wskazano ochronę rąk bez powołania zharmonizowanej normy technicznej PN-EN ISO 374-1.");
        }
      }
      if (/(?:H314|H318|H319|Eye Dam|Eye Irrit|Skin Corr)/i.test(s2)) {
        if (/ocz/i.test(s8) && !/166/i.test(s8)) {
          warnings.push("[Sekcja 8.2] ZALECENIE REACH: Wskazano ochronę oczu bez powołania normy PN-EN 166.");
        }
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 23: AKTUALNOŚĆ AKTÓW PRAWNYCH W SEKCJI 15.1 (UE 2019/1148, UE 2023/707)
    // ------------------------------------------------------------------------
    const s15All = typeof sections.section_15 === 'object' ? (sections.section_15.content || "") : (sections.section_15 || "");
    if (s15All) {
      if (!/2019\/1148/i.test(s15All)) {
        warnings.push("[Sekcja 15.1] BRAK ODNIESIENIA DO PREKURSORÓW: Brak powołania Rozporządzenia (UE) 2019/1148 w sprawie wprowadzania do obrotu i stosowania prekursorów materiałów wybuchowych.");
      }
      if (!/2023\/707/i.test(s15All)) {
        warnings.push("[Sekcja 15.1] BRAK ODNIESIENIA DO NOWYCH KLAS CLP: Brak powołania Rozporządzenia Delegowanego (UE) 2023/707 wprowadzającego nowe klasy zagrożeń (ED, PBT, vPvB, PMT, vPvM).");
      }
    }

    // ------------------------------------------------------------------------
    // REGUŁA 24: ZAKAZ ANGLOJĘZYCZNYCH FRAZ W SEKCJI 15 (Seveso III: None)
    // art. 17 Ustawy o substancjach chemicznych i ich mieszaninach
    // ------------------------------------------------------------------------
    if (s15All && /Kategoria\s+zagrożenia\s*[:\.]?\s*None\b/i.test(s15All)) {
      errors.push("[Sekcja 15.1] BŁĄD JĘZYKOWY (ART. 17 USTAWY): Wykryto anglojęzyczny wpis 'Kategoria zagrożenia: None' w podsekcji Seveso III. Karta sporządzana na rynek polski musi być w całości w języku polskim (wymagane: 'Kategoria zagrożenia: Brak (mieszanina nie spełnia kryteriów ilościowych ani jakościowych Dyrektywy Seveso III)').");
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
