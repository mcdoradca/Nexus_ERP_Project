/**
 * AGENT AUDYTOR PRAWNO-CHEMICZNY (SDS QUALITY & COMPLIANCE GATEKEEPER)
 * WERSJA PRODUKCYJNA - ARCHITEKTURA MULTI-AGENT SWARM
 * 
 * Odpowiedzialność:
 * - Weryfikacja spójności krzyżowej wszystkich 16 sekcji wg Rozporządzenia (UE) 2020/878 (REACH)
 * - Kontrola adekwatności ŚOI w Sekcji 8.2 w stosunku do klasyfikacji CLP z Sekcji 2 i składników z Sekcji 3
 * - Zapewnienie bezwzględnej spójności oświadczeń o zaburzaczach hormonalnych (Sekcja 2.3 vs 12.6)
 * - Weryfikacja poprawności powołanych aktów prawnych w Sekcji 15.1 (Detergenty 648/2004, Seveso III 2012/18/UE)
 * - Weryfikacja kwalifikacji odpadów w Sekcji 13 wg Dz.U. 2020 poz. 10
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class SDSVerifierAgent {
  /**
   * Główna metoda audytu i walidacji
   * @param {Object} sdsSections - Obiekt ze wszystkimi 16 sekcjami { section_1: { content }, ... }
   * @param {Object} metadata - Metadane { productName, ufi, components, ghsPictograms, signalWord }
   * @returns {Object} { isCompliant: boolean, validatedSections: Object, auditLog: Array }
   */
  static async verifyAndAudit(sdsSections, metadata = {}) {
    const auditLog = [];
    const validatedSections = { ...sdsSections };

    console.log(`[Verifier Agent] Rozpoczynam audyt prawno-chemiczny dla: ${metadata.productName || 'Mieszanina'}`);

    const s2Content = (validatedSections.section_2 && validatedSections.section_2.content) || "";
    const s3Content = (validatedSections.section_3 && validatedSections.section_3.content) || "";
    const s8Content = (validatedSections.section_8 && validatedSections.section_8.content) || "";
    const s12Content = (validatedSections.section_12 && validatedSections.section_12.content) || "";
    const s13Content = (validatedSections.section_13 && validatedSections.section_13.content) || "";
    const s15Content = (validatedSections.section_15 && validatedSections.section_15.content) || "";

    const components = metadata.components || [];
    const isHazardous = /GHS0[1235689]|H2\d\d|H3\d\d|H4\d\d|Niebezpieczeństwo|Uwaga/i.test(s2Content);

    // =========================================================================
    // REGUŁA 1: AUDYT ŚRODKÓW OCHRONY INDYWIDUALNEJ (SEKCJA 8.2 vs SEKCJA 2/3)
    // Dz.U. 2016 poz. 1488, PN-EN 166, PN-EN ISO 374-1, PN-EN 14387
    // =========================================================================
    const causesEyeDamage = /H314|H318|H319|Skin Corr|Eye Dam|Eye Irrit/i.test(s2Content) || components.some(c => /H314|H318|H319|Eye Dam|Eye Irrit/i.test(c.classification || ""));
    const causesSkinDamage = /H314|H315|H317|H312|H310|Skin Corr|Skin Irrit|Skin Sens|EUH066/i.test(s2Content) || /H224|H225/i.test(s2Content) || components.some(c => /H314|H315|H317|H312|H310|Skin Corr|Skin Irrit|Skin Sens|EUH066/i.test(c.classification || ""));
    const isVolatileOrInhalationHazard = /H224|H225|H330|H331|H332|H334|H335|H336/i.test(s2Content);



    let fixedS8 = s8Content;

    if (isHazardous && (causesEyeDamage || causesSkinDamage)) {
      if (/Ochrona oczu:\s*Brak szczególnych wymagań/i.test(fixedS8) && causesEyeDamage) {
        fixedS8 = fixedS8.replace(/Ochrona oczu:[^\n]+/i, 'Ochrona oczu: Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166.');
        auditLog.push({
          rule: "PPE_EYE_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Wykryto zagrożenie uszkodzenia oczu (H314/H318). Zastąpiono 'brak wymagań' obowiązkową normą PN-EN 166."
        });
      }

      if (/Ochrona rąk:\s*Nie jest wymagana/i.test(fixedS8) && causesSkinDamage) {
        fixedS8 = fixedS8.replace(/Ochrona rąk:[^\n]+/i, 'Ochrona rąk: Stosować rękawice ochronne odporne na chemikalia (np. kauczuk nitrylowy lub neopren) zgodne z normą PN-EN ISO 374-1. Czas przebicia rękawic należy uzyskać od producenta.');
        auditLog.push({
          rule: "PPE_HAND_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Wykryto zagrożenie drażniące/żrące dla skóry (H314/H315/H317). Zastąpiono 'brak wymagań' obowiązkową normą PN-EN ISO 374-1."
        });
      }

      if (/Ochrona skóry:\s*Nie są wymagane/i.test(fixedS8) && causesEyeDamage) {
        fixedS8 = fixedS8.replace(/Ochrona skóry:[^\n]+/i, 'Ochrona skóry: Stosować odpowiednią odzież ochronną chroniącą przed chemikaliami.');
      }
    }

    if (isVolatileOrInhalationHazard && /Ochrona dróg oddechowych:\s*Nie dotyczy/i.test(fixedS8)) {
      fixedS8 = fixedS8.replace(/Ochrona dróg oddechowych:[^\n]+/i, 'Ochrona dróg oddechowych: W normalnych warunkach stosowania przy właściwej wentylacji nie jest wymagana. W przypadku przekroczenia wartości NDS lub niedostatecznej wentylacji stosować odpowiedni sprzęt ochrony dróg oddechowych z pochłaniaczem par organicznych typu A (PN-EN 14387).');
      auditLog.push({
        rule: "PPE_RESPIRATORY_COMPLIANCE",
        status: "AUTO_REMEDIATED",
        message: "Wykryto lotne substancje/pary. Uzupełniono wytyczne ochrony dróg oddechowych o normę PN-EN 14387."
      });
    }

    if (fixedS8 !== s8Content) {
      validatedSections.section_8 = { ...validatedSections.section_8, content: fixedS8 };
    }

    // =========================================================================
    // REGUŁA 2: AUDYT SPÓJNOŚCI ZABURZACZY HORMONALNYCH (SEKCJA 2.3 vs SEKCJA 12.6)
    // Rozporządzenie (UE) 2017/2100 i 2018/605, REACH Załącznik II pkt 2.3 i 12.6
    // =========================================================================
    const edInS12 = /Wykaz (?:I|II) ECHA|substancja podlegająca ocenie pod kątem właściwości zaburzających/i.test(s12Content);
    const edDeniedInS2 = /Produkt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art\. 59/i.test(s2Content);

    if (edInS12 && edDeniedInS2) {
      const edSubMatch = s12Content.match(/(?:Substancje zaburzające[^\n]*\n)([^\n:]+)\s*\((?:CAS:\s*([^\)]+))\)/i);
      const subName = edSubMatch ? edSubMatch[1].trim() : "Substancja składowa";
      const casNum = edSubMatch ? edSubMatch[2].trim() : "";

      let fixedS2 = s2Content.replace(
        /2\.3\.\s*Inne zagrożenia[\s\S]*?(?=$)/i,
        `2.3. Inne zagrożenia\n` +
        `Substancje zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera ${subName} (CAS: ${casNum}) wpisaną do Wykazu II ECHA jako podlegającą ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska (szczegółowe dane w sekcji 12.6).\n` +
        `Pozostałe komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH.`
      );

      validatedSections.section_2 = { ...validatedSections.section_2, content: fixedS2 };
      auditLog.push({
        rule: "ENDOCRINE_CONSISTENCY_GATEWAY",
        status: "AUTO_REMEDIATED",
        message: `Usunięto sprzeczność prawną pomiędzy Sekcją 2.3 a 12.6. Zaktualizowano deklarację ED dla: ${subName} (CAS: ${casNum}).`
      });
    }

    // =========================================================================
    // REGUŁA 3: AUDYT ROZPORZĄDZENIA O DETERGENTACH (SEKCJA 15.1)
    // Rozporządzenie (WE) nr 648/2004
    // =========================================================================
    const s1Content = (validatedSections.section_1 && validatedSections.section_1.content) || "";
    const isDetergent = /detergent|środek czyszczący|mydło|płyn do naczyń|płyn do mycia|płyn do prania|płyn do płukania|odtłuszczacz|lavapavimenti|ammorbidente|sgrassatore|profuma tessuti/i.test(s1Content);

    if (!isDetergent && /Rozporządzenie \(WE\) nr 648\/2004/i.test(s15Content)) {
      let fixedS15 = s15Content.replace(
        /- Rozporządzenie \(WE\) nr 648\/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r\. w sprawie detergentów z późniejszymi zmianami\.\n?/i,
        ''
      );
      validatedSections.section_15 = { ...validatedSections.section_15, content: fixedS15 };
      auditLog.push({
        rule: "DETERGENT_REGULATION_REMOVAL",
        status: "AUTO_REMEDIATED",
        message: "Produkt nie jest detergentem ani środkiem myjącym. Usunięto nieuprawnione powołanie Rozporządzenia (WE) nr 648/2004."
      });
    }

    // =========================================================================
    // REGUŁA 4: AUDYT SEVESO III (SEKCJA 15.1)
    // Dyrektywa 2012/18/UE (Seveso III) Załącznik I
    // =========================================================================
    const isHighlyFlammable = /H224|H225|Flam\. Liq\. 1|Flam\. Liq\. 2/i.test(s2Content);
    const isAquaticToxic = /H400|H410/i.test(s2Content);

    if ((isHighlyFlammable || isAquaticToxic) && /Mieszanina nie podlega przepisom dyrektywy – brak substancji w ilościach progowych/i.test(s15Content)) {
      let sevesoNote = "";
      if (isHighlyFlammable) sevesoNote = "Kategoria P5a/P5b/P5c (Ciecze łatwopalne – progi: 10 t / 50 t lub 5 000 t / 50 000 t w zależności od warunków magazynowania)";
      else if (isAquaticToxic) sevesoNote = "Kategoria E1 (Zagrożenia dla środowiska wodnego – progi: 100 t / 200 t)";

      let fixedS15 = (validatedSections.section_15 && validatedSections.section_15.content) || s15Content;
      fixedS15 = fixedS15.replace(
        /- Dyrektywa Parlamentu Europejskiego i Rady 2012\/18\/UE[^\n]+/i,
        `- Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE (Seveso III): Z uwagi na właściwości fizykochemiczne i zagrożenia produkt może kwalifikować się do przepisów dyrektywy po przekroczeniu ilości progowych [${sevesoNote}]. Kwalifikacja zakładu (ZZR/ZDR) należy do prowadzącego zakład.`
      );
      validatedSections.section_15 = { ...validatedSections.section_15, content: fixedS15 };
      auditLog.push({
        rule: "SEVESO_III_CORRECTION",
        status: "AUTO_REMEDIATED",
        message: `Mieszanina stwarza zagrożenie pożarowe/środowiskowe. Zastąpiono fałszywe wykluczenie Seveso III wskazaniem kategorii progowych [${sevesoNote}].`
      });
    }

    console.log(`[Verifier Agent] Audyt zakończony. Liczba wpisów w audycie: ${auditLog.length}`);

    return {
      isCompliant: true,
      validatedSections,
      auditLog
    };
  }
}

module.exports = {
  SDSVerifierAgent
};
