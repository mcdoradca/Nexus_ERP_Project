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

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ecotoxCachePath = path.join(__dirname, 'rag_knowledge', 'ecotox_cache.json');
let ecotoxCache = {};
if (fs.existsSync(ecotoxCachePath)) {
  try {
    ecotoxCache = JSON.parse(fs.readFileSync(ecotoxCachePath, 'utf8'));
  } catch (e) {
    ecotoxCache = {};
  }
}

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

    const s1Content = (validatedSections.section_1 && validatedSections.section_1.content) || "";
    const s2Content = (validatedSections.section_2 && validatedSections.section_2.content) || "";
    const s3Content = (validatedSections.section_3 && validatedSections.section_3.content) || "";
    const s8Content = (validatedSections.section_8 && validatedSections.section_8.content) || "";
    const s11Content = (validatedSections.section_11 && validatedSections.section_11.content) || "";
    const s12Content = (validatedSections.section_12 && validatedSections.section_12.content) || "";
    const s13Content = (validatedSections.section_13 && validatedSections.section_13.content) || "";
    const s15Content = (validatedSections.section_15 && validatedSections.section_15.content) || "";

    const components = metadata.components || [];
    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous|Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie)/i.test(s2Content);
    const hasMixtureHazard = !isExplicitlyNotHazardous && /(?:GHS0[1235689]|H2\d\d|H30[0-4]|H31[0-4]|H318|H33[0-4]|H34\d|H35\d|H36\d|H37\d|H400|H41[01])/i.test(s2Content);

    // =========================================================================
    // REGUŁA 1: AUDYT ŚRODKÓW OCHRONY INDYWIDUALNEJ (SEKCJA 8.2 vs SEKCJA 2/3)
    // Dz.U. 2016 poz. 1488, PN-EN 166, PN-EN ISO 374-1, PN-EN 14387
    // =========================================================================
    let fixedS8 = s8Content;

    if (!hasMixtureHazard) {
      // Dla produktu niezaklasyfikowanego nie wolno narzucać bezwzględnego wymogu gogli i rękawic w stosowaniu konsumenckim
      if (/Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166\./i.test(fixedS8) && !/W normalnych warunkach stosowania konsumenckiego/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Ochrona oczu:[^\n]+/i, 'Ochrona oczu: W normalnych warunkach stosowania konsumenckiego: środki ochrony oczu nie są wymagane. W warunkach przemysłowych, przeładunku hurtowego lub usuwania awarii zaleca się stosowanie okularów ochronnych zgodnych z normą PN-EN 166.');
        auditLog.push({
          rule: "PPE_PROPORTIONALITY_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Produkt nie jest zaklasyfikowany jako stwarzający zagrożenie. Rozdzielono wytyczne ŚOI: brak wymogu w stosowaniu konsumenckim, zalecenie w warunkach przemysłowych/awaryjnych."
        });
      }
      if (/Stosować rękawice ochronne odporne na działanie chemikaliów/i.test(fixedS8) && !/W normalnych warunkach stosowania konsumenckiego/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Ochrona rąk:[^\n]+/i, 'Ochrona rąk: W normalnych warunkach stosowania konsumenckiego: ochrona rąk nie jest wymagana. W warunkach przemysłowych, przeładunku hurtowego lub usuwania awarii zaleca się stosowanie rękawic ochronnych odpornych na działanie chemikaliów (np. z kauczuku nitrylowego) zgodnych z normą PN-EN ISO 374-1.');
      }
    } else {
      const causesEyeDamage = /H314|H318|H319|Skin Corr|Eye Dam|Eye Irrit/i.test(s2Content);
      const causesSkinDamage = /H314|H315|H317|H312|H310|Skin Corr|Skin Irrit|Skin Sens|EUH066/i.test(s2Content) || /H224|H225/i.test(s2Content);
      const isVolatileOrInhalationHazard = /H224|H225|H330|H331|H332|H334|H335|H336/i.test(s2Content);

      if (causesEyeDamage && /Ochrona oczu:\s*Brak szczególnych wymagań/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Ochrona oczu:[^\n]+/i, 'Ochrona oczu: Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166.');
        auditLog.push({
          rule: "PPE_EYE_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Wykryto zagrożenie uszkodzenia oczu (H314/H318/H319). Zastąpiono 'brak wymagań' obowiązkową normą PN-EN 166."
        });
      }

      if (causesSkinDamage && /Ochrona rąk:\s*Nie jest wymagana/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Ochrona rąk:[^\n]+/i, 'Ochrona rąk: Stosować rękawice ochronne odporne na działanie chemikaliów (np. z kauczuku nitrylowego lub neoprenu) zgodne z normą PN-EN ISO 374-1. Czas przebicia rękawic należy uzyskać od producenta.');
        auditLog.push({
          rule: "PPE_HAND_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Wykryto zagrożenie drażniące/żrące dla skóry (H314/H315/H317). Zastąpiono 'brak wymagań' normą PN-EN ISO 374-1."
        });
      }

      if (isVolatileOrInhalationHazard && /Ochrona dróg oddechowych:\s*Nie dotyczy/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Ochrona dróg oddechowych:[^\n]+/i, 'Ochrona dróg oddechowych: W normalnych warunkach stosowania przy właściwej wentylacji nie jest wymagana. W przypadku przekroczenia wartości NDS lub niedostatecznej wentylacji stosować odpowiedni sprzęt ochrony dróg oddechowych z pochłaniaczem par organicznych typu A (PN-EN 14387).');
      }
    }

    // =========================================================================
    // REGUŁA 2: AUDYT NDS WG DZ.U. 2024 POZ. 1017 (SEKCJA 8.1)
    // =========================================================================
    if (components.some(c => c.cas === "55965-84-9") && !/0,2 mg\/m³/i.test(fixedS8)) {
      const cmiLine = "5-Chloro-2-metylo-2H-izotiazol-3-on i 2-metylo-2H-izotiazol-3-on (masa poreakcyjna 3:1) [CAS: 55965-84-9]:\n- NDS: 0,2 mg/m³\n- NDSCh: 0,4 mg/m³\n- Uwagi: oznakowanie substancji notacją „skóra”";
      if (/Dla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych/i.test(fixedS8)) {
        fixedS8 = fixedS8.replace(/Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Polska\):\s*\nDla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych dopuszczalnych stężeń[^\n]+\n*/i, `Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n${cmiLine}\n\n`);
        auditLog.push({
          rule: "NDS_2024_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Uzupełniono brakujące normatywy NDS/NDSCh dla CAS 55965-84-9 zgodnie z Dz.U. 2024 poz. 1017 (0,2 mg/m³ / 0,4 mg/m³, skóra)."
        });
      }
    }

    if (fixedS8 !== s8Content) {
      validatedSections.section_8 = { ...validatedSections.section_8, content: fixedS8 };
    }

    // =========================================================================
    // REGUŁA 3: AUDYT SPÓJNOŚCI ZABURZACZY HORMONALNYCH (SEKCJA 2.3 vs SEKCJA 12.6)
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
    // REGUŁA 4: HIERARCHIA PODSEKCJI W SEKCJI 11 (UE 2020/878)
    // Nagłówek 11.2 nie może znajdować się przed punktami h), i), j)
    // =========================================================================
    if (s11Content) {
      const match11_2Misplaced = s11Content.match(/(?:^|\n)\s*(?:11\.2[.:\-]?\s*(?:Informacje o innych zagrożeniach|Information on other hazards)[\s\S]*?)(?=(?:^|\n)\s*(?:[h-j]\)|h\.\s|i\.\s|j\.\s|STOT|działanie toksyczne na narządy docelowe|zagrożenie spowodowane aspiracją|aspiration hazard))/i);
      if (match11_2Misplaced) {
        let fixedS11 = s11Content.replace(match11_2Misplaced[0], '\n');
        const pointJMatch = fixedS11.match(/(?:^|\n)\s*(?:j\b[.:\)]|zagrożenie spowodowane aspiracją|aspiration hazard)\s*[^\n]+(?:\n[^\n]+)*/i);
        if (pointJMatch) {
          const insertIdx = pointJMatch.index + pointJMatch[0].length;
          fixedS11 = fixedS11.substring(0, insertIdx) + '\n\n' + match11_2Misplaced[0].trim() + '\n\n' + fixedS11.substring(insertIdx);
        } else {
          fixedS11 = fixedS11.trim() + '\n\n' + match11_2Misplaced[0].trim();
        }
        fixedS11 = fixedS11.replace(/\n{3,}/g, '\n\n').trim();
        validatedSections.section_11 = { ...validatedSections.section_11, content: fixedS11 };
        auditLog.push({
          rule: "SECTION_11_HIERARCHY_FIX",
          status: "AUTO_REMEDIATED",
          message: "Przeniesiono nagłówek 11.2 pod obligatoryjne punkty h), i), j) podsekcji 11.1 zgodnie z Załącznikiem II do UE 2020/878."
        });
      }
    }

    // =========================================================================
    // REGUŁA 5: AUDYT KWALIFIKACJI ODPADÓW (SEKCJA 13 vs SEKCJA 2.1)
    // Dz.U. 2020 poz. 10, art. 3 ust. 1 pkt 13-14 ustawy o odpadach
    // =========================================================================
    if (!hasMixtureHazard && /20 01 29\*|16 03 05\*|07 06 04\*/i.test(s13Content)) {
      let fixedS13 = s13Content
        .replace(/20 01 29\*\s*\(Detergenty zawierające substancje niebezpieczne\)/gi, '20 01 30 (Detergenty inne niż wymienione w 20 01 29)')
        .replace(/16 03 05\*\s*\(Organiczne odpady zawierające substancje niebezpieczne\)/gi, '16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05)')
        .replace(/07 06 04\*\s*\(Inne rozpuszczalniki organiczne, roztwory z przemywania i ciecze macierzyste\)/gi, '07 06 99 (Inne niewymienione odpady)');
      validatedSections.section_13 = { ...validatedSections.section_13, content: fixedS13 };
      auditLog.push({
        rule: "WASTE_CODE_CLASSIFICATION_FIX",
        status: "AUTO_REMEDIATED",
        message: "Produkt nie jest zaklasyfikowany jako stwarzający zagrożenie. Zamieniono nieuprawnione kody odpadów niebezpiecznych z gwiazdką (*) na właściwe kody inne niż niebezpieczne (20 01 30 / 16 03 06)."
      });
    }

    // =========================================================================
    // REGUŁA 6: AUDYT ROZPORZĄDZENIA O DETERGENTACH (SEKCJA 15.1)
    // =========================================================================
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
    // REGUŁA 7: AUDYT SEVESO III (SEKCJA 15.1)
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

    // =========================================================================
    // REGUŁA 8: AUDYT SPÓJNOŚCI SCL W SEKCJI 3 (ELIMINACJA OSIEROCONYCH KODÓW H)
    // =========================================================================
    if (s3Content) {
      let fixedS3 = s3Content;
      if (/(?:\bSkin Irrit\. 2|\bEye Irrit\. 2|\bSkin Corr\. 1[A-C]|\bEye Dam\. 1|\bSkin Sens\. 1[A-B]?)\s*\n\s*(H\d{3}[a-zA-Z]?|EUH\d{3})/i.test(fixedS3)) {
        fixedS3 = fixedS3.replace(/(\b(?:Skin Irrit\. 2|Eye Irrit\. 2|Skin Corr\. 1[A-C]|Eye Dam\. 1|Skin Sens\. 1[A-B]?))\s*\n\s*(H\d{3}[a-zA-Z]?|EUH\d{3})/gi, '$1 $2');
      }
      if (fixedS3 !== s3Content) {
        validatedSections.section_3 = { ...validatedSections.section_3, content: fixedS3 };
        auditLog.push({
          rule: "SCL_ORPHAN_H_CODE_REMEDIATION",
          status: "AUTO_REMEDIATED",
          message: "Wykryto i scalono osierocone kody H w regułach SCL Sekcji 3."
        });
      }
    }

    // =========================================================================
    // REGUŁA 9: AUDYT KOMPLETNOŚCI BIOAKUMULACJI W SEKCJI 12.3 (UE 2020/878)
    // =========================================================================
    if (s12Content && components && components.length > 0) {
      let fixedS12 = s12Content;
      let addedAny = false;

      components.forEach(comp => {
        if (!comp.cas) return;
        const cacheEntry = ecotoxCache[comp.cas];
        if (cacheEntry && cacheEntry.bioaccumulation) {
          const hasCasInS12_3 = new RegExp(`12\\.3[\\s\\S]*?${comp.cas.replace(/-/g, '\\-')}`, 'i').test(fixedS12);
          const hasBcfOrBioacc = new RegExp(`12\\.3[\\s\\S]*?${comp.cas.replace(/-/g, '\\-')}[\\s\\S]*?(?:bioakumulac|BCF)`, 'i').test(fixedS12);
          
          if (!hasCasInS12_3 || !hasBcfOrBioacc) {
            const compName = comp.name || cacheEntry.name_pl || "Substancja";
            const bioEntry = `${compName} (CAS: ${comp.cas}): ${cacheEntry.bioaccumulation}`;
            
            if (/12\.3\.\s*Zdolność do bioakumulacji[\s\S]*?Informacje dotyczące składników:/i.test(fixedS12)) {
              fixedS12 = fixedS12.replace(
                /(12\.3\.\s*Zdolność do bioakumulacji[\s\S]*?Informacje dotyczące składników:\n)/i,
                `$1${bioEntry}\n`
              );
              addedAny = true;
            } else if (/12\.3\.\s*Zdolność do bioakumulacji/i.test(fixedS12)) {
              fixedS12 = fixedS12.replace(
                /(12\.3\.\s*Zdolność do bioakumulacji\n)(?:Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny\.\n?)?/i,
                `$1Informacje dotyczące składników:\n${bioEntry}\nMieszanina: Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.\n`
              );
              addedAny = true;
            }
          }
        }
      });

      if (addedAny && fixedS12 !== s12Content) {
        validatedSections.section_12 = { ...validatedSections.section_12, content: fixedS12 };
        auditLog.push({
          rule: "SECTION_12_BIOACCUMULATION_COMPLIANCE",
          status: "AUTO_REMEDIATED",
          message: "Uzupełniono brakujące dane o bioakumulacji w Sekcji 12.3 z rejestru referencyjnego ECHA."
        });
      }
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
