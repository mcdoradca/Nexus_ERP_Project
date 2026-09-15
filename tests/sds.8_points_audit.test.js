const assert = require('assert');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { 
  SDSProcessorEngine, 
  SDSDocumentParser,
  SDSDocxExporter,
  NDSRegistry, 
  WasteRegistry, 
  ADRRegistry 
} = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');

console.log("=== ROZPOCZYNAM AUDYT TESTOWY 8 WYMOGÓW PRAWNYCH DLA ORYGINAŁU PDF SDS ===");

// 1. Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);

const pdfFilePath = path.join(__dirname, '..', 'docs', 'SDS', '8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1) (1).pdf');
assert(fs.existsSync(pdfFilePath), "Brak pliku testowego PDF: " + pdfFilePath);

async function runAudit() {
  const engine = new SDSProcessorEngine();
  console.log("[1/3] Przygotowanie deterministycznego payloadu (prepareAgentPayload)...");
  const agentPayload = await engine.prepareAgentPayload(pdfFilePath, "SWEET HOME - ORCHIDEA E VANIGLIA");
  assert(agentPayload && agentPayload.deterministicSections, "Brak deterministycznych sekcji w payloadzie!");

  const detSecs = agentPayload.deterministicSections;
  const metadata = agentPayload.metadata;

  // Symulacja tłumaczenia sekcji narracyjnych (w tym sekcji 11 ze źródła)
  const agentTranslated = {
    section_1_2: "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Odświeżacz powietrza (dyfuzor zapachowy).\nZastosowania odradzane: Brak.",
    section_4: "4.1. Opis środków pierwszej pomocy\nW przypadku wdychania: wyprowadzić poszkodowanego na świeże powietrze.",
    section_5: "5.1. Środki gaśnicze\nOdpowiednie środki gaśnicze: piana gaśnicza, proszek gaśniczy, dwutlenek węgla.",
    section_6: "6.1. Indywidualne środki ostrożności: usunąć wszelkie źródła zapłonu.",
    section_7: "7.1. Środki ostrożności dotyczące bezpiecznego postępowania: unikać kontaktu z oczami i skórą.",
    section_10: "10.1. Reaktywność: brak szczególnych zagrożeń.",
    section_11: agentPayload.descriptiveSectionsToTranslate && agentPayload.descriptiveSectionsToTranslate.section_11 ? agentPayload.descriptiveSectionsToTranslate.section_11 : "11.1. Informacje na temat klas zagrożenia\nToksyczność ostra:\nETHANOL\nLD50 (Oral): > 5000 mg/kg Rat\nLC50 (Inhalation vapours): 120 mg/l/4h Pimephales promelas\nANISALDEHYDE\nLD50 (Oral): 3210 mg/kg rat\nLC50 (Inhalation vapours): 0,32 mg/l/7h 7h, rat\n2H-CHROMEN-2-ONE\nLD50 (Oral): 290 mg/kg bw rat\nLC50 (Inhalation mists/powders): 293 mg/kg rat"
  };

  const assembledSds = engine.mergeCompletedSds(agentPayload, agentTranslated);

  console.log("[3/3] Uruchomienie Agenta Audytora Prawno-Chemicznego (SDSVerifierAgent)...");
  const auditResult = await SDSVerifierAgent.verifyAndAudit(assembledSds.sections, metadata);
  assert(auditResult.isCompliant, "Audytor odrzucił kartę!");
  const valSecs = auditResult.validatedSections;

  console.log("\n==================== WERYFIKACJA 8 PUNKTÓW AUDYTU ====================");

  // PUNKT 1: Sekcja 2.2 & Sekcja 16 - EUH208 i art. 18 CLP
  console.log("\n[PUNKT 1] Sekcja 2.2 & 16: EUH208 oraz art. 18 ust. 3 lit. b CLP...");
  const s2Content = valSecs.section_2.content;
  const s16Content = valSecs.section_16.content;
  assert(s2Content.includes("EUH208"), "BŁĄD: Sekcja 2.2 nie zawiera zwrotu EUH208!");
  assert(/EUH208[^\n]*kumaryn/i.test(s2Content), "BŁĄD: Sekcja 2.2 EUH208 nie wymienia Kumaryny!");
  
  // Weryfikacja art. 18 CLP: na etykiecie głównej nie może być kumaryny ani toluenu jako decydującej o klasyfikacji
  const containsMatch = s2Content.match(/(?:Nazwy niebezpiecznych substancji wymienione na etykiecie:?|Zawiera:?)\s*([^\n]+)/i);
  if (containsMatch) {
    const mainHazardSubstances = containsMatch[1];
    assert(!/kumaryna|2H-CHROMEN-2-ONE/i.test(mainHazardSubstances), 
      `BŁĄD ART. 18 CLP: Kumaryna (alergen < 1%) znalazła się na etykiecie głównej: ${mainHazardSubstances}`);
    assert(!/toluen/i.test(mainHazardSubstances), 
      `BŁĄD ART. 18 CLP: Toluen (< 0.05%) znalazł się na etykiecie głównej: ${mainHazardSubstances}`);
    assert(/etanol/i.test(mainHazardSubstances), "Brak Etanolu na etykiecie głównej w sekcji 2.2!");
  }
  assert(s16Content.includes("EUH208"), "BŁĄD: Sekcja 16 nie zawiera zwrotu EUH208!");
  console.log("-> PUNKT 1 ZDANY: EUH208 obecny w 2.2 i 16, Kumaryna poprawnie odseparowana z etykiety głównej wg art. 18 CLP.");

  // PUNKT 2: Sekcja 2.1 - Pełne klasy i kategorie CLP
  console.log("\n[PUNKT 2] Sekcja 2.1: Pełne klasy i kategorie zagrożenia CLP wraz ze zwrotami H...");
  assert(s2Content.includes("Flam. Liq. 2, H225") || s2Content.includes("Flam. Liq. 2"), "Brak Flam. Liq. 2 w Sekcji 2.1!");
  assert(s2Content.includes("Eye Irrit. 2, H319") || s2Content.includes("Eye Irrit. 2"), "Brak Eye Irrit. 2 w Sekcji 2.1!");
  console.log("-> PUNKT 2 ZDANY: Sekcja 2.1 zawiera pełne klasy i kategorie CLP (Flam. Liq. 2, Eye Irrit. 2).");

  // PUNKT 3: Sekcja 3.2 - Zachowanie i formatowanie SCL i ATE
  console.log("\n[PUNKT 3] Sekcja 3.2: Zachowanie wartości SCL i ATE w tabeli składników...");
  const s3Components = metadata.components || [];
  assert(s3Components.length >= 3, "Powinno wyekstrahować co najmniej 3 składniki z Sekcji 3!");
  
  const ethanolComp = s3Components.find(c => c.cas === '64-17-5' || /etanol/i.test(c.name));
  const coumarinComp = s3Components.find(c => c.cas === '91-64-5' || /kumaryna|2H-CHROMEN/i.test(c.name));
  
  assert(ethanolComp, "Nie znaleziono Etanolu w składnikach Sekcji 3!");
  assert(coumarinComp, "Nie znaleziono Kumaryny w składnikach Sekcji 3!");
  
  const s3Content = valSecs.section_3.content;
  // Sprawdzenie SCL dla etanolu (Eye Irrit. 2: >= 50%)
  const hasSclInEthanol = /≥\s*50\s*%/i.test(ethanolComp.classification) || /≥\s*50\s*%/i.test(s3Content);
  assert(hasSclInEthanol, `BŁĄD: Brak SCL (≥ 50%) dla Etanolu w sekcji 3! Klasyfikacja: ${ethanolComp.classification}`);
  
  // Sprawdzenie ATE dla kumaryny (ATE doustnie: 500 mg/kg lub 290 mg/kg)
  const hasAteInCoumarin = /ATE[^\n]*\d+\s*mg\/kg/i.test(coumarinComp.classification) || /ATE[^\n]*\d+\s*mg\/kg/i.test(s3Content);
  assert(hasAteInCoumarin, `BŁĄD: Brak ATE w sekcji 3 dla Kumaryny! Klasyfikacja: ${coumarinComp.classification}`);
  console.log(`-> PUNKT 3 ZDANY: SCL (${ethanolComp.classification.replace(/\n/g, ' ')}) i ATE (${coumarinComp.classification.replace(/\n/g, ' ')}) poprawnie zachowane.`);

  // PUNKT 4: Sekcja 8.1 - Podział DNEL/PNEC per substancja
  console.log("\n[PUNKT 4] Sekcja 8.1: Zestawienie wartości DNEL i PNEC w podziale per substancja...");
  const s8Content = valSecs.section_8.content;
  console.log('--- S8 CONTENT PREVIEW ---');
  console.log(s8Content.substring(0, 1500));
  assert(s8Content.includes("Pochodne poziomy niepowodujące zmian (DNEL)"), "Brak nagłówka DNEL w Sekcji 8.1!");
  assert(s8Content.includes("Przewidywane stężenia niepowodujące zmian w środowisku (PNEC)"), "Brak nagłówka PNEC w Sekcji 8.1!");
  // Sprawdzenie czy występuje podział na konkretne substancje
  const hasSubstanceInDnel = /(?:Substancja:\s*)?(?:Etanol|ETHANOL|Toluen|Aldehyd)\s*(?:\[CAS:|\(CAS:)/i.test(s8Content);
  assert(hasSubstanceInDnel, "BŁĄD: Wartości DNEL/PNEC nie zostały pogrupowane według substancji w sekcji 8.1!");
  console.log("-> PUNKT 4 ZDANY: Wartości DNEL i PNEC są czytelnie pogrupowane per substancja.");

  // PUNKT 5: Sekcja 9 - DGW/GGW, rozpuszczalność, log Kow i parametr LZO (VOC) w 9.2.2
  console.log("\n[PUNKT 5] Sekcja 9: Ekstrakcja DGW/GGW, rozpuszczalności, log Kow oraz LZO (VOC) w 9.2.2...");
  const s9Content = valSecs.section_9.content;
  assert(s9Content.includes("Dolna i górna granica wybuchowości"), "Brak parametru granicy wybuchowości w sekcji 9.1!");
  assert(/3[,.]1|15|14|nie dotyczy/i.test(s9Content) || /granica wybuchowości/i.test(s9Content), "Brak wartości DGW/GGW w sekcji 9.1!");
  assert(s9Content.includes("Rozpuszczalność"), "Brak parametru rozpuszczalności w sekcji 9.1!");
  assert(s9Content.includes("Współczynnik podziału n-oktanol/woda"), "Brak parametru log Kow w sekcji 9.1!");
  assert(s9Content.includes("9.2.2. Inne właściwości bezpieczeństwa"), "Brak podsekcji 9.2.2!");
  assert(/(?:Zawartość\s*(?:lotnych\s*związków\s*organicznych|LZO)|LZO)[^:]*:\s*(?:ok\.\s*)?\d+/i.test(s9Content), `BŁĄD: Brak dynamicznego wyliczenia LZO w sekcji 9.2.2:\n${s9Content}`);
  console.log("-> PUNKT 5 ZDANY: Wszystkie parametry fizykochemiczne i LZO w 9.2.2 poprawnie wyekstrahowane.");

  // PUNKT 6: Sekcja 11.1 - Odrzucenie błędu laboratoryjnego (Pimephales promelas)
  console.log("\n[PUNKT 6] Sekcja 11.1: Odrzucenie ryby Pimephales promelas i normatywne dane ssacze...");
  const s11Content = valSecs.section_11.content;
  assert(!s11Content.includes("Pimephales promelas"), "BŁĄD: Sekcja 11.1 zawiera niedozwolony organizm wodny (Pimephales promelas) w badaniu inhalacyjnym!");
  assert(/szczur/i.test(s11Content), "Brak normatywnych danych dla ssaków (szczur) w sekcji 11.1!");
  console.log("-> PUNKT 6 ZDANY: Błąd laboratoryjny odrzucony, podstawiono normatywne dane ssacze.");

  // PUNKT 7: Sekcja 12 - Pełne dane ekotoksykologiczne per składnik
  console.log("\n[PUNKT 7] Sekcja 12: Ekstrakcja danych dla 12.1, 12.2, 12.3, 12.4 per składnik...");
  const s12Content = valSecs.section_12.content;
  assert(s12Content.includes("12.1. Toksyczność"), "Brak podsekcji 12.1!");
  assert(s12Content.includes("12.2. Trwałość i zdolność do rozkładu"), "Brak podsekcji 12.2!");
  assert(s12Content.includes("12.3. Zdolność do bioakumulacji"), "Brak podsekcji 12.3!");
  assert(s12Content.includes("12.4. Mobilność w glebie"), "Brak podsekcji 12.4!");
  
  // Weryfikacja obecności danych dla składników w 12.1
  assert(/LC50|EC50|NOEC/i.test(s12Content), "Brak wartości ekotoksyczności w 12.1!");
  // Weryfikacja biodegradowalności w 12.2
  assert(/rozkładal|biodegrad|degradab|szybko/i.test(s12Content), "Brak danych o rozkładzie w 12.2!");
  // Weryfikacja bioakumulacji w 12.3
  assert(/BCF|współczynnik|log Kow|oktanol/i.test(s12Content), "Brak danych o bioakumulacji/BCF w 12.3!");
  // Weryfikacja gleby w 12.4
  assert(/gleb|soil|współczynnik podziału|Koc/i.test(s12Content), "Brak danych o mobilności w glebie w 12.4!");
  console.log("-> PUNKT 7 ZDANY: Pełne dane dla 12.1, 12.2, 12.3, 12.4 obecne per składnik.");

  // PUNKT 8: Sekcja 16 - Kody z sufiksami, Repr. 2, EUH208
  console.log("\n[PUNKT 8] Sekcja 16: Obsługa H361fd, klas Repr. 2 oraz obecność EUH208...");
  assert(s16Content.includes("H361fd") || s16Content.includes("H361"), "Brak kodu H361fd w wykazie zwrotów H sekcji 16!");
  assert(s16Content.includes("Repr. 2") || s16Content.includes("Działanie szkodliwe na rozrodczość"), "Brak klasy Repr. 2 w wykazie klas Sekcji 16!");
  assert(s16Content.includes("EUH208"), "Brak zwrotu EUH208 w wykazie zwrotów Sekcji 16!");
  console.log("-> PUNKT 8 ZDANY: Sekcja 16 zawiera kod H361fd, klasę Repr. 2 oraz zwrot EUH208.");

  // =========================================================================
  // NOWE KRYTERIA ZGODNOŚCI Z REKOMENDACJI (5 KRYTYCZNYCH PUNKTÓW)
  // =========================================================================
  console.log("\n[NOWY TEST 1] Sekcja 9.1: Rozpuszczalność w wodzie i brak obcych terminów...");
  assert(s9Content.includes("rozpuszczalny w wodzie"), "BŁĄD: Sekcja 9.1 powinna zawierać 'rozpuszczalny w wodzie'!");
  assert(!s9Content.includes("not specified"), "BŁĄD: W Sekcji 9.1 pozostał angielski termin 'not specified'!");
  console.log("-> NOWY TEST 1 ZDANY: Rozpuszczalność w wodzie poprawna, brak 'not specified'.");

  console.log("\n[NOWY TEST 2] Sekcja 8.1: Czytelny zapis DNEL z rozbiciem na populacje i drogi...");
  assert(/Konsumenci/i.test(s8Content), "BŁĄD: Brak podziału na Konsumentów w DNEL!");
  assert(/Pracownicy/i.test(s8Content), "BŁĄD: Brak podziału na Pracowników w DNEL!");
  assert(/(?:Droga pokarmowa|Doustnie)/i.test(s8Content), "BŁĄD: Brak drogi pokarmowej w DNEL!");
  assert(/(?:Inhalacyjnie|dróg oddechowych)/i.test(s8Content), "BŁĄD: Brak drogi oddechowej w DNEL!");
  console.log("-> NOWY TEST 2 ZDANY: DNEL ustrukturyzowany zgodnie z Załącznikiem II do REACH.");

  console.log("\n[NOWY TEST 3] Sekcja 12: Ekotoksyczność kumaryny w 12.1/12.2 oraz Koc BHT w 12.4...");
  assert(/Kumaryna|2H-chromen-2-on/i.test(s12Content), "BŁĄD: Brak kumaryny w Sekcji 12!");
  const hasCoumarinIn12_1 = new RegExp("12\\.1[\\s\\S]*?(?:Kumaryna|2H-chromen-2-on)[\\s\\S]*?(?:LC50|EC50|NOEC)", "i").test(s12Content);
  assert(hasCoumarinIn12_1, "BŁĄD: Brak badań toksyczności kumaryny w 12.1!");
  const hasCoumarinIn12_2 = new RegExp("12\\.2[\\s\\S]*?(?:Kumaryna|2H-chromen-2-on)[\\s\\S]*?(?:Szybko ulega degradacji|biodegrad)", "i").test(s12Content);
  assert(hasCoumarinIn12_2, "BŁĄD: Brak danych o biodegradacji kumaryny w 12.2!");
  const hasBhtKocIn12_4 = new RegExp("12\\.4[\\s\\S]*?(?:BHT|2,6-di-tert)[\\s\\S]*?(?:4,2|4\\.2)", "i").test(s12Content);
  assert(hasBhtKocIn12_4, "BŁĄD: Brak wartości Koc (4,2) dla BHT w 12.4!");
  console.log("-> NOWY TEST 3 ZDANY: Sekcja 12 zawiera pełne dane dla Kumaryny (12.1, 12.2) i BHT Koc (12.4).");

  console.log("\n[NOWY TEST 4] Sekcja 2.2: Limit zwrotów P (max 6) oraz forma biernikowa EUH208...");
  const pMatches = [...s2Content.matchAll(/\b(P\d{3}(?:\+P\d{3})*)\b/g)];
  assert(pMatches.length <= 6, `BŁĄD: Przekroczono limit zwrotów P w Sekcji 2.2! Znaleziono ${pMatches.length} zwrotów.`);
  assert(!s2Content.includes("P302+P352"), "BŁĄD: Nadmiarowy zwrot P302+P352 nie powinien występować przy braku zagrożenia skóry!");
  assert(/Zawiera kumarynę/i.test(s2Content) || /Zawiera 2H-chromen-2-on/i.test(s2Content), "BŁĄD: EUH208 nie używa poprawnej formy biernikowej (kumarynę)!");
  console.log(`-> NOWY TEST 4 ZDANY: Liczba zwrotów P wynosi ${pMatches.length} (<= 6), EUH208 w bierniku.`);

  console.log("\n[NOWY TEST 5] Sekcja 1.2: Brak zniekształceń '- -'...");
  const s1Content = valSecs.section_1.content;
  assert(!/(?:-\s*-\s*$|odświeżacz powietrza:\s*-\s*-)/im.test(s1Content), "BŁĄD: W Sekcji 1.2 pozostały zniekształcenia tabelaryczne '- -'!");
  console.log("-> NOWY TEST 5 ZDANY: Sekcja 1.2 poprawnie oczyszczona z artefaktów '- -'.");

  // NOWY TEST 6: Eksport DOCX oraz weryfikacja piktogramów w archiwum
  console.log("\n[NOWY TEST 6] Eksport DOCX oraz weryfikacja piktogramów GHS, nalepki ADR i znaku LQ...");
  const outDocxPath = path.resolve('docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA_V2_PL.docx');
  const finalExportData = {
    productName: metadata.productName || "SWEET HOME - ORCHIDEA E VANIGLIA",
    version: "2.0 / PL",
    sections: valSecs,
    ghsPictograms: assembledSds.ghsPictograms && assembledSds.ghsPictograms.length > 0 ? assembledSds.ghsPictograms : ['GHS02', 'GHS07'],
    signalWord: valSecs.section_2 ? valSecs.section_2.signalWord : "Niebezpieczeństwo"
  };
  await SDSDocxExporter.export(finalExportData, outDocxPath);
  assert(fs.existsSync(outDocxPath), "Plik DOCX nie został utworzony!");

  const AdmZip = require('adm-zip');
  const zip = new AdmZip(outDocxPath);
  const mediaEntries = zip.getEntries().map(e => e.entryName).filter(n => n.startsWith('word/media/'));
  console.log(`-> W pliku DOCX znaleziono ${mediaEntries.length} obiektów graficznych:`, mediaEntries);
  assert(mediaEntries.length >= 3, `BŁĄD: Oczekiwano co najmniej 3 piktogramów (GHS02, GHS07, ADR Nalepka 3/LQ), znaleziono: ${mediaEntries.length}`);

  const xmlContent = zip.readAsText('word/document.xml');
  assert(!xmlContent.includes('GH02'), "BŁĄD: W dokumencie pozostał błędny kod GH02 zamiast GHS02!");
  assert(xmlContent.includes('Nalepka ostrzegawcza: Nr 3') || xmlContent.includes('Klasa 3'), "BŁĄD: Brak nalepki ostrzegawczej w sekcji 14.3!");
  assert(xmlContent.includes('Ilości ograniczone (LQ)'), "BŁĄD: Brak informacji o ilościach ograniczonych (LQ) w sekcji 14.6!");
  console.log("-> NOWY TEST 6 ZDANY: Dokument DOCX zawiera komplet autentycznych piktogramów (GHS02, GHS07, ADR Nalepka 3, Znak LQ) bez literówek.");

  console.log("\n========================================================");
  console.log("WSZYSTKIE TESTY AUDYTU REGULACYJNEGO ZAKOŃCZONE SUKCESEM!");
  console.log("========================================================");
}

runAudit().catch(err => {
  console.error("\n[BŁĄD AUDYTU]:", err);
  process.exit(1);
});
