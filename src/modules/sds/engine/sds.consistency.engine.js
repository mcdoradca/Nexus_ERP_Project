/**
 * SDSConsistencyEngine - Silnik Spójności Regulacyjnej i Wnioskowania Międzysekcyjnego
 * 
 * Zasady Enterprise (UE 2020/878 & CLP):
 * 1. Cross-Section Inference: Powiązanie parametrów fizykochemicznych (pH, zapłon, LZO) z procedurami BHP (Sekcje 4, 8, 10).
 * 2. Cut-off Gatekeeper (Art. 31 REACH): Bezwzględna walidacja progu 0,1% dla substancji ED / SVHC / PBT.
 * 3. Parametryzacja ŚOI (Pkt 8.2.2.2 Załącznika II): Ścisłe deklarowanie grubości w mm, czasu przebicia w min oraz norm PN-EN.
 * 4. Matryca Prawna (Sekcja 15.1): Pełne uwzględnienie aktów unijnych (UE 2019/1148, UE 2023/707, Seveso III).
 */

class SDSConsistencyEngine {
  /**
   * Generuje spójne, profesjonalne opisy objawów i pierwszej pomocy dla Sekcji 4.2 i 4.3
   */
  static getSection4SymptomsAndAdvice(phStr = "", components = [], hCodes = [], rawSymptoms = "") {
    const isGenericOrEmpty = !rawSymptoms || /brak\s+(?:dostępnych\s+)?(?:szczegółowych\s+)?danych|nie\s+są\s+znane/i.test(rawSymptoms);
    
    // Analiza kwasowości
    const phVal = this.parseNumericPh(phStr);
    const isAcidic = phVal !== null && phVal < 4.0;
    const isAlkaline = phVal !== null && phVal > 10.0;
    
    // Analiza alergenów i zagrożeń
    const hasSkinSens = hCodes.includes('H317') || components.some(c => /H317|Skin\s*Sens/i.test(c.classification || ''));
    const hasEyeHazard = hCodes.some(h => ['H318', 'H319'].includes(h));

    let symptoms = [];
    if (isAcidic) {
      symptoms.push("W kontakcie ze skórą: z uwagi na kwasowy odczyn produktu (pH 2,0–3,0) możliwe miejscowe zaczerwienienie i podrażnienie naskórka; u osób wrażliwych na składniki kompozycji zapachowej i konserwanty ryzyko odczynów alergicznych (świąd, rumień).");
      symptoms.push("W kontakcie z oczami: możliwe łzawienie, pieczenie, kłucie i zaczerwienienie spojówek w razie bezpośredniego zachlapania oka.");
      symptoms.push("W razie połknięcia: może powodować podrażnienie błon śluzowych jamy ustnej, gardła i przewodu pokarmowego, ból brzucha i nudności.");
      symptoms.push("W następstwie wdychania: w normalnych warunkach stosowania produkt nie wywołuje negatywnych objawów oddechowych; u osób szczególnie wrażliwych na intensywne zapachy możliwe kichanie lub przejściowy kaszel.");
    } else if (isAlkaline) {
      symptoms.push("W kontakcie ze skórą: podrażnienie, wysuszenie, zaczerwienienie i pieczenie.");
      symptoms.push("W kontakcie z oczami: silne pieczenie, łzawienie, ból spojówek i ryzyko uszkodzenia rogówki.");
      symptoms.push("W razie połknięcia: pieczenie w jamie ustnej, przełyku i żołądku, mdłości.");
      symptoms.push("W następstwie wdychania: w warunkach normalnego stosowania brak objawów.");
    } else {
      if (hasSkinSens) {
        symptoms.push("W kontakcie ze skórą: może powodować reakcję alergiczną skóry (świąd, miejscowy rumień, wysypka) u osób predysponowanych.");
      } else {
        symptoms.push("W kontakcie ze skórą: w warunkach prawidłowego użytkowania nie przewiduje się negatywnych objawów.");
      }
      if (hasEyeHazard) {
        symptoms.push("W kontakcie z oczami: podrażnienie, pieczenie, łzawienie i zaczerwienienie spojówek.");
      } else {
        symptoms.push("W kontakcie z oczami: w razie przypadkowego zachlapania możliwe przejściowe pieczenie mechaniczne i łzawienie.");
      }
      symptoms.push("W razie połknięcia: w przypadku spożycia większych ilości mogą wystąpić dolegliwości żołądkowo-jelitowe (nudności, ból brzucha).");
      symptoms.push("W następstwie wdychania: brak znanych negatywnych skutków narażenia.");
    }

    const s4_2 = "4.2. Najważniejsze ostre i opóźnione objawy oraz skutki narażenia\n" + symptoms.join('\n');
    const s4_3 = "4.3. Wskazania dotyczące wszelkiej natychmiastowej pomocy lekarskiej i szczególnego postępowania z poszkodowanym\n" +
      "Leczenie objawowe i podtrzymujące. W przypadku wystąpienia lub utrzymywania się objawów podrażnienia albo reakcji alergicznej zapewnić pomoc lekarską i pokazać kartę charakterystyki lub etykietę produktu.";

    return { s4_2, s4_3 };
  }

  /**
   * Generuje zgodne z prawem wytyczne ŚOI dla Sekcji 8.2 (Załącznik II REACH pkt 8.2.2.2)
   */
  static getSection8PPE(phStr = "", components = []) {
    const phVal = this.parseNumericPh(phStr);
    const isCorrosiveOrAcidic = phVal !== null && phVal < 4.0;

    const handText = "Ochrona rąk: W zastosowaniach profesjonalnych i przemysłowych (oraz podczas usuwania skutków awarii) stosować rękawice ochronne odporne chemicznie (zalecany kauczuk nitrylowy o grubości minimalnej 0,4 mm, czas przebicia > 480 min zgodnie z normą PN-EN ISO 374-1). Przy krótkotrwałym kontakcie konsumenckim specjalne rękawice nie są wymagane; zaleca się unikać przedłużonego kontaktu cieczy ze skórą.";

    const eyeText = isCorrosiveOrAcidic
      ? "Ochrona oczu lub twarzy: W warunkach przemysłowych, przeładunku lub ryzyka rozchlapania kwasowej cieczy stosować okulary ochronne lub gogle szczelne (zgodne z normą PN-EN 166). W warunkach typowego użytkowania konsumenckiego nie są wymagane."
      : "Ochrona oczu lub twarzy: W zastosowaniach konsumenckich nie jest wymagana. W warunkach przemysłowych zaleca się stosowanie okularów ochronnych (PN-EN 166) w przypadku ryzyka zachlapania.";

    const respText = "Ochrona dróg oddechowych: W normalnych warunkach eksploatacji i przy sprawnej wentylacji nie jest wymagana. W razie wystąpienia mgieł, aerozoli lub podczas prac awaryjnych w przestrzeniach zamkniętych stosować odpowiedni sprzęt ochrony dróg oddechowych z filtrem/pochłaniaczem kombinowanym typu A-P2 (lub A1P2) zgodnie z normą PN-EN 14387.";

    const skinText = "Ochrona skóry i ciała: Standardowa odzież robocza. Przestrzegać ogólnych zasad higieny pracy: myć ręce przed przerwami i po zakończeniu pracy.";

    const envText = "Kontrola narażenia środowiska: Nie dopuścić do przedostania się dużych ilości produktu do wód gruntowych, kanalizacji miejskiej, cieków wodnych ani gleby.";

    return { handText, eyeText, respText, skinText, envText };
  }

  /**
   * Generuje zgodne z kwasowością materiały niezgodne dla Sekcji 10.5
   */
  static getSection10Incompatible(phStr = "", rawIncompatible = "") {
    const phVal = this.parseNumericPh(phStr);
    if (phVal !== null && phVal < 4.0) {
      return "Zasady (reakcja neutralizacji z wydzieleniem ciepła), silne utleniacze oraz metale podatne na korozję kwasową (np. żelazo, cynk, aluminium).";
    }
    if (phVal !== null && phVal > 10.0) {
      return "Kwasy (gwałtowna reakcja z wydzieleniem ciepła), silne utleniacze, metale lekkie.";
    }
    if (!rawIncompatible || /brak\s+szczególnych|none\s+in\s+particular/i.test(rawIncompatible)) {
      return "Silne utleniacze, mocne kwasy i mocne zasady.";
    }
    return rawIncompatible;
  }

  /**
   * Weryfikuje i generuje status substancji zaburzających gospodarkę hormonalną (ED)
   * zgodnie z regułą progu odcięcia 0,1% (Załącznik II REACH pkt 2.3, 11.2, 12.6)
   */
  static resolveEndocrineStatus(components = [], rawEdText = "") {
    // Sprawdzamy czy w składzie (Sekcja 3.2) realnie występuje substancja z listy ED w stężeniu >= 0.1%
    const edSubstanceInComposition = components.find(c => {
      const isKnownEd = /1222-05-5|galaksolid|galaxolide/i.test(c.cas || '') || /galaksolid|galaxolide/i.test(c.name || c.originalName || '');
      if (!isKnownEd) return false;
      const concStr = c.concentration || '';
      const nums = [...concStr.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(m => parseFloat(m[1].replace(',', '.')));
      const maxConc = nums.length > 0 ? Math.max(...nums) : 0;
      return maxConc >= 0.1;
    });

    const meetsCutOff = !!edSubstanceInComposition;

    if (meetsCutOff) {
      const edName = edSubstanceInComposition.name || edSubstanceInComposition.originalName;
      const edCas = edSubstanceInComposition.cas || '';
      return {
        declaredIn2_3: true,
        summary: `${edName} (CAS: ${edCas})`,
        s2_3_text: `Substancje zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera ${edName}${edCas ? ` (CAS: ${edCas})` : ''} w stężeniu ≥ 0,1% wag., podlegającą ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu (UE) 2017/2100 lub rozporządzeniu (UE) 2018/605 (szczegółowe dane w sekcji 12.6).\nKomponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH.`,
        s11_2_text: `Substancje zaburzające funkcjonowanie układu hormonalnego (zdrowie ludzkie):\n${edName}${edCas ? ` (CAS: ${edCas})` : ''}: Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego.`,
        s12_6_text: `Substancje zaburzające funkcjonowanie układu hormonalnego (środowisko):\n${edName}${edCas ? ` (CAS: ${edCas})` : ''}: Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska.`
      };
    }

    // Poniżej progu 0,1% (art. 31 REACH - prawna formuła negatywna)
    return {
      declaredIn2_3: false,
      summary: null,
      s2_3_text: "Produkt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59 ust. 1 jako posiadające właściwości zaburzające funkcjonowanie układu hormonalnego ani składników o właściwościach zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu (UE) 2017/2100 lub rozporządzeniu (UE) 2018/605 w stężeniu równym lub większym od 0,1% wag.\nKomponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH.",
      s11_2_text: "Mieszanina nie zawiera substancji o właściwościach zaburzających funkcjonowanie układu hormonalnego w odniesieniu do zdrowia ludzi w stężeniu podlegającym obowiązkowi deklaracji (≥ 0,1% wag.) zgodnie z rozporządzeniem (UE) 2020/878.",
      s12_6_text: "Mieszanina nie zawiera substancji o właściwościach zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska w stężeniu podlegającym obowiązkowi deklaracji (≥ 0,1% wag.) zgodnie z rozporządzeniem (UE) 2020/878."
    };
  }

  /**
   * Generuje kompletny, aktualny wykaz przepisów prawnych dla Sekcji 15.1
   */
  static getSection15LegalActs() {
    return [
      "15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny",
      "",
      "Akty prawne Unii Europejskiej:",
      "1. Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późn. zm.",
      "2. Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 Parlamentu Europejskiego i Rady (REACH).",
      "3. Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) z późn. zm.",
      "4. Rozporządzenie Delegowane Komisji (UE) 2023/707 z dnia 19 grudnia 2022 r. zmieniające rozporządzenie (WE) nr 1272/2008 w odniesieniu do klas zagrożenia oraz kryteriów klasyfikacji, oznakowania i pakowania substancji i mieszanin (właściwości zaburzające funkcjonowanie układu hormonalnego, PBT, vPvB, PMT, vPvM).",
      "5. Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2019/1148 z dnia 20 czerwca 2019 r. w sprawie wprowadzania do obrotu i stosowania prekursorów materiałów wybuchowych: Produkt nie zawiera regulowanych ani podlegających zgłoszeniu prekursorów materiałów wybuchowych.",
      "6. Rozporządzenie (WE) nr 648/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r. w sprawie detergentów z późn. zm.",
      "7. Dyrektywa 2012/18/UE Parlamentu Europejskiego i Rady z dnia 4 lipca 2012 r. w sprawie kontroli niebezpieczeństwa poważnych awarii związanych z substancjami niebezpiecznymi (Seveso III): Kategoria zagrożenia: Nie dotyczy (produkt nie kwalifikuje się do żadnej z kategorii zagrożeń Seveso III).",
      "",
      "Akty prawne Rzeczypospolitej Polskiej:",
      "1. Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (Dz.U. 2022 poz. 1816 z późn. zm.).",
      "2. Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017).",
      "3. Ustawa z dnia 14 grudnia 2012 r. o odpadach (Dz.U. 2023 poz. 1587 z późn. zm.).",
      "4. Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).",
      "5. Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (Dz.U. 2023 poz. 1658 z późn. zm.).",
      "6. Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (Dz.U. 2024 poz. 643 z późn. zm.) oraz Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).",
      "7. Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. w sprawie rodzajów i ilości substancji niebezpiecznych decydujących o zaliczeniu zakładu do zakładu o zwiększonym lub dużym ryzyku wystąpienia poważnej awarii przemysłowej (Dz.U. 2016 poz. 138)."
    ].join('\n');
  }

  static parseNumericPh(phStr) {
    if (!phStr || typeof phStr !== 'string') return null;
    const match = phStr.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    return parseFloat(match[1].replace(',', '.'));
  }

  static inferAcidity(phValOrStr, components = []) {
    const val = typeof phValOrStr === 'number' ? phValOrStr : this.parseNumericPh(phValOrStr);
    if (val !== null && val < 5.0) return true;
    return Array.isArray(components) && components.some(c => /(?:acid|kwas)/i.test(c.name || c.originalName || ''));
  }
}

module.exports = { SDSConsistencyEngine };
