// Auto-extracted module: PolishLegalTemplates
const fs = require('fs');
const path = require('path');

class PolishLegalTemplates {
  static getSection1_3(companyConfig = {}) {
    const compName = companyConfig.companyName || "ITALLUX Sp. z o.o.";
    const compAddress = companyConfig.address || "ul. Wesoła 16";
    const compCity = companyConfig.city ? `${companyConfig.postalCode ? companyConfig.postalCode + " " : ""}${companyConfig.city}` : "63-600 Kępno";
    const compWebsite = companyConfig.website || "www.prostozwloch.com.pl";
    const compEmail = companyConfig.email || "kontakt@prostozwloch.com.pl";
    const compPhone = companyConfig.phone || companyConfig.emergencyPhone || "+48 663116607";

    return (
      "1.3. Dane dotyczące dostawcy karty charakterystyki\n" +
      `Firma: ${compName}\n` +
      `Adres: ${compAddress}, ${compCity}\n` +
      `Strona www: ${compWebsite}\n` +
      `E-mail: ${compEmail}\n` +
      `Telefon: ${compPhone}`
    );
  }

  static getSection1_4(ufiCode) {
    const ufiStr = ufiCode ? `UFI: ${ufiCode}\n` : "";
    return (
      `${ufiStr}` +
      "1.4. Numer telefonu alarmowego\n" +
      "112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)"
    );
  }

  static getSection2_3(edSubstanceInfo = null) {
    if (edSubstanceInfo) {
      return (
        "2.3. Inne zagrożenia\n" +
        `Substancje zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera ${edSubstanceInfo} podlegającą ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska zgodnie z kryteriami określonymi w rozporządzeniu (UE) 2017/2100 lub rozporządzeniu (UE) 2018/605 (szczegółowe dane w sekcji 12.6).\n` +
        "Komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH."
      );
    }
    return (
      "2.3. Inne zagrożenia\n" +
      "Produkt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59 ust. 1 jako posiadające właściwości zaburzające funkcjonowanie układu hormonalnego ani składników o właściwościach zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu 2017/2100/UE lub rozporządzeniu 2018/605/UE w stężeniu równym lub większym od 0,1 %.\n" +
      "Komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH."
    );
  }

  static getSection13(isHazardous = false, productText = "") {
    const category = WasteRegistry.getCategoryForProduct(productText) || {
      industrial_hazardous: "16 03 05* (Organiczne odpady zawierające substancje niebezpieczne)",
      industrial_non_hazardous: "16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05)",
      consumer_hazardous: "20 01 29* (Detergenty zawierające substancje niebezpieczne) lub 20 01 27*",
      consumer_non_hazardous: "20 01 30 lub 20 01 28"
    };

    const productWasteCode = isHazardous ? category.industrial_hazardous : category.industrial_non_hazardous;
    const consumerWasteCode = isHazardous ? category.consumer_hazardous : category.consumer_non_hazardous;

    return (
      "SEKCJA 13: Postępowanie z odpadami\n\n" +
      "13.1. Metody unieszkodliwiania odpadów\n" +
      "Zalecenia dotyczące produktu i pozostałości:\n" +
      "Odzyskać, jeśli to możliwe. Nie wprowadzać do kanalizacji, wód powierzchniowych, gruntowych ani gleby. Pozostałości produktu oraz odpady należy poddać odzyskowi lub unieszkodliwianiu w uprawnionych instalacjach (np. spalarniach termicznych lub wyspecjalizowanych zakładach utylizacji odpadów) posiadających stosowne zezwolenia na prowadzenie gospodarki odpadami zgodnie z obowiązującymi przepisami.\n\n" +
      "Zalecenia dotyczące odpadów opakowaniowych:\n" +
      "Całkowicie opróżnione opakowania poddać procesowi odzysku lub recyklingu materiałowego w ramach selektywnej zbiórki odpadów. Opakowania zanieczyszczone pozostałościami produktu traktować zgodnie z ich stopniem skażenia – w przypadku substancji niebezpiecznych likwidować jak sam produkt u uprawnionego odbiorcy odpadów.\n\n" +
      "Klasyfikacja i kody odpadów (Katalog Odpadów Dz.U. 2020 poz. 10):\n" +
      `- Odpady z produktu (dla zastosowań profesjonalnych / przemysłowych): ${productWasteCode}.\n` +
      `- Odpady z produktu (dla konsumentów / odpady komunalne): ${consumerWasteCode}.\n` +
      "- Odpady opakowaniowe: 15 01 02 (Opakowania z tworzyw sztucznych) [w przypadku opakowań zanieczyszczonych substancjami niebezpiecznymi: 15 01 10*].\n" +
      "Uwaga: Podane kody odpadów mają charakter zalecany. Szczegółowy i ostateczny kod odpadu musi zostać nadany bezpośrednio przez wytwórcę odpadu, w oparciu o miejsce, branżę i specyfikę jego powstawania (BDO).\n\n" +
      "Krajowe i unijne akty prawne dotyczące gospodarki odpadami:\n" +
      "- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).\n" +
      "- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).\n" +
      "- Dyrektywa Parlamentu Europejskiego i Rady 2008/98/WE z dnia 19 listopada 2008 r. w sprawie odpadów oraz uchylająca niektóre dyrektywy."
    );
  }

  static getSection15(svhcInfo = "", restrictionsInfo = "", isDetergent = false, isHighlyFlammable = false, isAquaticToxic = false, sevesoCategory = "") {
    const svhcText = svhcInfo || "Mieszanina nie zawiera substancji z listy kandydackiej SVHC podlegających procedurze udzielania zezwoleń (REACH załącznik XIV) w stężeniu ≥ 0,1% wag.";
    let restrText = restrictionsInfo || "Mieszanina nie podlega ograniczeniom na mocy załącznika XVII do rozporządzenia REACH.";
    if (!restrText.startsWith("\n") && !restrText.startsWith(" ")) {
      restrText = " " + restrText;
    }

    let detergentLawLine = "";
    if (isDetergent) {
      detergentLawLine = "- Rozporządzenie (WE) nr 648/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r. w sprawie detergentów z późniejszymi zmianami.\n";
    }

    let sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n  * Kategoria zagrożenia: Brak (mieszanina nie spełnia kryteriów ilościowych ani jakościowych Dyrektywy Seveso III).\n";
    if (sevesoCategory === "P5c" || (!sevesoCategory && isHighlyFlammable)) {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5c CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 5 000 t; Zakład o Dużym Ryzyku (ZDR) – 50 000 t.\n";
    } else if (sevesoCategory === "P5a") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5a CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 10 t; Zakład o Dużym Ryzyku (ZDR) – 50 t.\n";
    } else if (sevesoCategory === "P5b") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5b CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 50 t; Zakład o Dużym Ryzyku (ZDR) – 200 t.\n";
    } else if (sevesoCategory === "E1" || (!sevesoCategory && isAquaticToxic)) {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: E1 ZAGROŻENIA DLA ŚRODOWISKA.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 100 t; Zakład o Dużym Ryzyku (ZDR) – 200 t.\n";
    } else if (sevesoCategory === "E2") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: E2 ZAGROŻENIA DLA ŚRODOWISKA.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 200 t; Zakład o Dużym Ryzyku (ZDR) – 500 t.\n";
    } else if (sevesoCategory && !/^(?:none|brak|nie dotyczy|nessuna)$/i.test(sevesoCategory.trim())) {
      sevesoLine = `- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n  * Kategoria zagrożenia: ${sevesoCategory}.\n`;
    } else {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n  * Kategoria zagrożenia: Brak (mieszanina nie spełnia kryteriów ilościowych ani jakościowych Dyrektywy Seveso III).\n";
    }

    return (
      "SEKCJA 15: Informacje dotyczące przepisów prawnych\n\n" +
      "15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny\n\n" +
      "Prawodawstwo Unii Europejskiej:\n" +
      "- Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późniejszymi zmianami.\n" +
      "- Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 (wymogi dotyczące sporządzania kart charakterystyki).\n" +
      "- Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) z późniejszymi zmianami (kolejne ATP).\n" +
      "- Rozporządzenie Delegowane Komisji (UE) 2023/707 z dnia 19 grudnia 2022 r. zmieniające rozporządzenie (WE) nr 1272/2008 w odniesieniu do klas zagrożenia oraz kryteriów klasyfikacji, oznakowania i pakowania substancji i mieszanin (właściwości zaburzające funkcjonowanie układu hormonalnego ED, PBT, vPvB, PMT, vPvM).\n" +
      "- Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2019/1148 z dnia 20 czerwca 2019 r. w sprawie wprowadzania do obrotu i stosowania prekursorów materiałów wybuchowych: Nie dotyczy (żaden ze składników nie znajduje się w załączniku I ani II).\n" +
      detergentLawLine +
      `- Substancje wzbudzające szczególnie duże obawy (SVHC – REACH załącznik XIV): ${svhcText}\n` +
      `- Ograniczenia dotyczące produkcji, wprowadzania do obrotu i stosowania niektórych niebezpiecznych substancji (REACH załącznik XVII): ${restrText}\n` +
      sevesoLine +
      "- Rozporządzenie Parlamentu Europejskiego i Rady (UE) nr 649/2012 z dnia 4 lipca 2012 r. dotyczące wywozu i przywozu niebezpiecznych chemikaliów (PIC): Nie dotyczy.\n\n" +
      "Prawodawstwo Rzeczypospolitej Polskiej:\n" +
      "- Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (t.j. Dz.U. 2022 poz. 1816 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm.).\n" +
      "- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).\n" +
      "- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).\n" +
      "- Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (t.j. Dz.U. 2024 poz. 643 z późn. zm.) wraz z oświadczeniami rządowymi w sprawie Umowy europejskiej dotyczącej międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).\n" +
      "- Rozporządzenie Ministra Zdrowia z dnia 30 grudnia 2004 r. w sprawie bezpieczeństwa i higieny pracy związanej z występowaniem w miejscu pracy czynników chemicznych (t.j. Dz.U. 2016 poz. 1488).\n" +
      "- Rozporządzenie Ministra Zdrowia z dnia 2 lutego 2011 r. w sprawie badań i pomiarów czynników szkodliwych dla zdrowia w środowisku pracy (t.j. Dz.U. 2023 poz. 419).\n" +
      "- Ustawa z dnia 26 czerwca 1974 r. – Kodeks pracy (t.j. Dz.U. 2023 poz. 1465 z późn. zm.).\n\n" +
      "15.2. Ocena bezpieczeństwa chemicznego\n" +
      "Dla mieszaniny nie dokonano oceny bezpieczeństwa chemicznego (dla mieszanin nie jest ona wymagana zgodnie z art. 14 rozporządzenia REACH)."
    );
  }
}


// ============================================================================
// 7. GENERATOR PNG (Zero Native Dependencies)
// ============================================================================

module.exports = { PolishLegalTemplates };
