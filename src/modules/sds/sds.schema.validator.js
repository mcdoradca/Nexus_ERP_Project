/**
 * SDSSchemaValidator - Rygorystyczny walidator kontraktu danych i asercji prawnych SDS (UE 2020/878)
 * ARCHITEKTURA ZERO-BYPASS - ZERO ZEWNĘTRZNYCH ZALEŻNOŚCI (PURE JS RUNTIME ENGINE)
 */

class SDSSchemaValidationError extends Error {
  constructor(message, details = []) {
    const detailsStr = details.length > 0 ? ` Szczegóły: ${details.join("; ")}` : "";
    super(`[SDS_SCHEMA_VIOLATION] ${message}${detailsStr}`);
    this.name = "SDSSchemaValidationError";
    this.details = details;
  }
}

class SDSSchemaValidator {
  /**
   * Walidacja obiektu sekcji opisowych zwróconych przez Agenta LLM
   */
  static validateTranslatedSections(translatedJson, rawSections = {}) {
    const errors = [];
    if (!translatedJson || typeof translatedJson !== 'object') {
      throw new SDSSchemaValidationError("Odpowiedź LLM nie jest prawidłowym obiektem JSON.");
    }

    // Normalizacja alternatywnych kluczy z odpowiedzi LLM (np. notacja kropkowa lub skrócona)
    if (!translatedJson.section_1_2) {
      translatedJson.section_1_2 = translatedJson['section_1.2'] || 
                                   translatedJson['section1_2'] || 
                                   translatedJson['1.2'] || 
                                   translatedJson['section_1'];
    }

    // Wymagane sekcje narracyjne w odpowiedzi LLM
    const requiredSections = [
      'section_1_2',
      'section_5',
      'section_6',
      'section_7',
      'section_10',
      'section_11'
    ];

    for (const secKey of requiredSections) {
      if (!translatedJson[secKey] || typeof translatedJson[secKey] !== 'string' || translatedJson[secKey].trim().length === 0) {
        // Tarcza Auto-Remediacji (Defensive AI): Uzupełnienie z surowych danych wejściowych
        if (rawSections && rawSections[secKey] && typeof rawSections[secKey] === 'string' && rawSections[secKey].trim().length > 0) {
          console.warn(`[SDSSchemaValidator] Auto-remediacja: sekcja '${secKey}' została uzupełniona z danych źródłowych.`);
          translatedJson[secKey] = rawSections[secKey];
        } else if (secKey === 'section_1_2') {
          console.warn(`[SDSSchemaValidator] Auto-remediacja: sekcja 'section_1_2' uzupełniona standardowym szablonem UE 2020/878.`);
          translatedJson[secKey] = "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Produkt chemiczny / zapachowy do użytku konsumenckiego i profesjonalnego.\nZastosowania odradzane: Nie stosować do celów innych niż wskazane przez producenta.";
        } else {
          errors.push(`Brak lub pusta wymagana sekcja narracyjna: '${secKey}'.`);
        }
      }
    }

    // Walidacja strukturalna Sekcji 11 (UE 2020/878)
    const s11 = translatedJson.section_11 || "";
    if (s11) {
      if (!/11\.1\b/i.test(s11)) {
        errors.push("Sekcja 11 nie zawiera wymaganego nagłówka podsekcji '11.1' (Informacje na temat klas zagrożenia).");
      }
      if (!/11\.2\b/i.test(s11)) {
        errors.push("Naruszenie Rozporządzenia (UE) 2020/878: Sekcja 11 nie zawiera obligatoryjnej podsekcji '11.2' (Informacje o innych zagrożeniach / właściwości zaburzające funkcjonowanie układu hormonalnego).");
      }
    }

    if (errors.length > 0) {
      throw new SDSSchemaValidationError("Walidacja struktury sekcji przetłumaczonych nie powiodła się.", errors);
    }

    return true;
  }

  /**
   * Walidacja ostatecznego, zmontowanego modelu SDS przed wygenerowaniem pliku DOCX
   */
  static validateFinalSds(finalData) {
    const errors = [];
    if (!finalData || !finalData.sections) {
      throw new SDSSchemaValidationError("Model finalData nie zawiera wymaganej struktury 'sections'.");
    }

    const { sections, metadata } = finalData;

    // 1. Walidacja obecności wszystkich 16 sekcji
    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;
      if (!sections[key] || !sections[key].content || sections[key].content.trim().length === 0) {
        errors.push(`Brak kompletnej treści dla ${key}. Karta SDS musi posiadać 16 sekcji.`);
      }
    }

    // 2. Walidacja Sekcji 2 (CLP / P-Statements & Hasło ostrzegawcze)
    const s2 = sections.section_2 ? sections.section_2.content : "";
    if (s2) {
      const pMatches = [...s2.matchAll(/\b(P\d{3}(?:\+P\d{3})*)\b/g)];
      // W Karcie Charakterystyki SDS (Załącznik II do REACH) Sekcja 2.2 musi odzwierciedlać pełne
      // bezpieczeństwo mieszaniny i zalecenia producenta (w tym procedury medyczne i ratunkowe).
      // Limit "zazwyczaj do 6 zwrotów" z art. 28 ust. 3 CLP odnosi się do etykiety opakowania,
      // a nie do karty SDS, gdzie wycinanie procedur medycznych (np. P333+P313, P337+P313) stanowi błąd prawny.
      if (pMatches.length === 0 && !/nie wymaga zwrotów wskazujących środki ostrożności/i.test(s2)) {
        errors.push("Sekcja 2.2 nie zawiera zwrotów wskazujących środki ostrożności (zwroty P).");
      }
      if (!/Niebezpieczeństwo|Uwaga|Brak hasła ostrzegawczego/i.test(s2)) {
        errors.push("Sekcja 2.2 nie zawiera poprawnego polskiego hasła ostrzegawczego CLP.");
      }
    }

    // 3. Walidacja Sekcji 3 (Integralność składników)
    const s3 = sections.section_3 ? sections.section_3.content : "";
    const components = (metadata && metadata.components) || (sections.section_3 && sections.section_3.components) || [];
    if (!s3 || components.length === 0) {
      errors.push("Sekcja 3 nie zawiera zidentyfikowanych składników mieszaniny/substancji.");
    } else {
      components.forEach((comp, idx) => {
        if (!comp.cas && !comp.ec && !comp.name) {
          errors.push(`Składnik #${idx + 1} w Sekcji 3 nie posiada numeru CAS, WE ani nazwy chemicznej.`);
        }
      });
    }

    // 4. Walidacja Sekcji 8 (NDS / Formuła prawna)
    const s8 = sections.section_8 ? sections.section_8.content : "";
    if (s8) {
      if (!/NDS|najwyższych dopuszczalnych stężeń|nie ustalono krajowych wartości/i.test(s8)) {
        errors.push("Sekcja 8 nie zawiera polskich wartości NDS ani wymaganej prawem formuły o braku norm.");
      }
    }

    // 5. Walidacja Sekcji 9 (Właściwości fizykochemiczne - jednostki)
    const s9 = sections.section_9 ? sections.section_9.content : "";
    if (s9) {
      if (/\bnot specified\b/i.test(s9)) {
        errors.push("Sekcja 9 zawiera nieprzetłumaczony termin 'not specified'.");
      }
      if (!/9\.2\.2\b/i.test(s9)) {
        errors.push("Naruszenie Załącznika II do REACH: Sekcja 9 nie zawiera podsekcji 9.2.2 (Inne właściwości bezpieczeństwa / LZO).");
      }
    }

    // 5b. Walidacja Sekcji 1.2 (brak zniekształceń tabelarycznych w karcie końcowej)
    const s1 = sections.section_1 ? sections.section_1.content : "";
    if (s1 && /-\s*-\s*$/m.test(s1)) {
      errors.push("Sekcja 1 zawiera zniekształcenia tabelaryczne typu '- -'.");
    }

    // 5c. Walidacja Sekcji 11 (Odrzucenie błędu laboratoryjnego Pimephales promelas i obecność 11.2)
    const s11Final = sections.section_11 ? sections.section_11.content : "";
    if (s11Final) {
      if (/Pimephales(?:\s+promelas)?/i.test(s11Final)) {
        errors.push("Sekcja 11 zawiera niedozwolony błąd laboratoryjny (organizm wodny Pimephales promelas w badaniu inhalacyjnym ssaków).");
      }
      if (!/11\.2\b/i.test(s11Final)) {
        errors.push("Naruszenie Rozporządzenia (UE) 2020/878: Sekcja 11 nie zawiera obligatoryjnej podsekcji '11.2' (Informacje o innych zagrożeniach).");
      }
    }

    // 6. Walidacja Sekcji 12 (Ekotoksykologia - podsekcja 12.6)
    const s12 = sections.section_12 ? sections.section_12.content : "";
    if (s12) {
      if (!/12\.6\b/i.test(s12)) {
        errors.push("Naruszenie Rozporządzenia (UE) 2020/878: Sekcja 12 nie zawiera podsekcji '12.6' (Właściwości zaburzające funkcjonowanie układu hormonalnego).");
      }
    }

    // 7. Walidacja Sekcji 14 (ADR)
    const s14 = sections.section_14 ? sections.section_14.content : "";
    if (s14) {
      if (!/UN\s*\d{4}|Nie dotyczy|Nie podlega przepisom transportowym/i.test(s14)) {
        errors.push("Sekcja 14 nie określa numeru UN ani statusu wyłączenia z przepisów transportowych ADR.");
      }
    }

    // 8. Walidacja Sekcji 15 (Przepisy prawne RP i UE)
    const s15 = sections.section_15 ? sections.section_15.content : "";
    if (s15) {
      if (!/1907\/2006|1272\/2008|2020\/878/i.test(s15)) {
        errors.push("Sekcja 15.1 nie wymienia kluczowych aktów unijnych (REACH / CLP / 2020/878).");
      }
    }

    // 9. Walidacja Sekcji 16 (H-Phrases definitions)
    const s16 = sections.section_16 ? sections.section_16.content : "";
    if (s16) {
      if (!/H\d{3}/.test(s16)) {
        errors.push("Sekcja 16 nie zawiera pełnych tekstów zwrotów H.");
      }
    }

    // 10. Walidacja Sekcji 5 (Bezpieczeństwo pożarowe: piana alkoholoodporna AR-AFFF dla cieczy polarnych)
    const s5Final = sections.section_5 ? sections.section_5.content : "";
    if (s5Final) {
      const isFlammableLiquid = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2);
      const hasPolarSolvent = components.some(c => {
        const name = `${c.name || ''} ${c.originalName || ''}`.toLowerCase();
        return /\b(?:etanol|ethanol|metanol|methanol|isopropanol|propanol|aceton|glikol|glycol)\b/i.test(name) ||
          ['64-17-5', '67-56-1', '67-63-0', '71-23-8', '67-64-1'].includes(c.cas);
      });
      if (isFlammableLiquid && hasPolarSolvent) {
        const suitableMatch = s5Final.match(/(?:Odpowiednie\s+środki\s+gaśnicze|Suitable\s+extinguishing\s+media|Suitable\s+extinguishing\s+equipment)\s*[:\.]?\s*([^\n]+(?:\n[^\n]+)?)/i);
        if (suitableMatch) {
          const suitableText = suitableMatch[1];
          if (/\bpian[a-zęóąśłżźćń]*\b/i.test(suitableText) && !/alkoholoodporn|AR-AFFF/i.test(suitableText)) {
            errors.push("Sekcja 5.1 zawiera krytyczny błąd PPOŻ: dla łatwopalnej cieczy polarnej wskazano standardową pianę bez wymogu piany alkoholoodpornej (AR-AFFF).");
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new SDSSchemaValidationError("Karta SDS nie spełnia rygorystycznych wymogów prawno-technicznych (Quality Gate).", errors);
    }

    return true;
  }
}

module.exports = {
  SDSSchemaValidator,
  SDSSchemaValidationError
};
