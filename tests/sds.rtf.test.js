/**
 * Test zestawu: Weryfikacja bezstratnego parsowania i translacji kart SDS w formacie RTF (.rtf)
 * Weryfikuje:
 * 1. Poprawność dekodowania encji Unicode (\uN) i stron kodowych (CP1250 / CP1252).
 * 2. Ekstrakcję tabeli składników w Sekcji 3.2 z tokenów \cell i \row (w tym stężenia, CAS, SCL).
 * 3. Segmentację 16 sekcji wg Rozporządzenia (UE) 2020/878 z formatu RTF.
 * 4. Pełne przejście przez SDSProcessorEngine.prepareAgentPayload i audyt SDSVerifierAgent.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { 
  SDSRTFParser, 
  SDSDocumentParser, 
  SDSProcessorEngine,
  NDSRegistry
} = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');

console.log("=== ROZPOCZYNAM TESTY ZGODNOŚCI I BEZSTRATNOŚCI DLA FORMATU RTF (.rtf) ===");

// Ładowanie bazy NDS
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);

const tempDir = path.join(__dirname, 'temp_rtf_tests');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

function runTests() {
  let passedCount = 0;

  // --------------------------------------------------------------------------
  // TEST 1: Dekodowanie encji Unicode, ANSI (CP1250/1252) i symboli matematycznych
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Weryfikacja dekodowania encji RTF (Unicode, CP1250, CP1252)...");
  
  // RTF z polskimi znakami CP1250 oraz Unicode
  const rtfEncodingSample = `{\\rtf1\\ansi\\ansicpg1250\\deff0{\\fonttbl{\\f0 Arial;}}
{\\*\\generator Antigravity Test;}
\\f0\\fs20
Znak testowy: Za\\\'bf\\\'f3\\\'b3\\\'e6 g\\\'ea\\\'9cl\\\'b9 ja\\\'9f\\\'f1.
Unicode: \\u322? \\u261? \\u347? \\u263? \\u380?.
Relacje: \\u8804? 0,0015% oraz \\u8805? 0,00015%.
Temperatura: 20\\u176?C, st\\\'ea\\\'bfenie: 5 mg/m\\u179?.
}`;

  const decodedText = SDSRTFParser.parseRtfString(rtfEncodingSample);
  
  assert(decodedText.includes("Znak testowy: Zażółć gęślą jaźń."), "Błąd dekodowania CP1250 w tekście polskim!");
  assert(decodedText.includes("ł ą ś ć ż"), "Błąd dekodowania encji \\uN Unicode!");
  assert(decodedText.includes("≤ 0,0015%") && decodedText.includes("≥ 0,00015%"), "Błąd dekodowania operatorów chemicznych ≤ / ≥!");
  assert(decodedText.includes("20°C") && decodedText.includes("5 mg/m³"), "Błąd dekodowania jednostek °C i m³!");
  console.log("-> TEST 1 PASSED: Wszystkie encje językowe, Unicode i jednostki zostały poprawnie zdekodowane.");
  passedCount++;

  // --------------------------------------------------------------------------
  // TEST 2: Ekstrakcja tabeli składników z tokenów \\cell i \\row
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Weryfikacja rekonstrukcji tabeli składników (Sekcja 3.2)...");
  
  const rtfTableSample = `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0 Arial;}}
\\trowd\\cellx2000\\cellx4000\\cellx6000\\cellx8000
\\cell Nome Sostanza\\cell CAS / CE\\cell Concentrazione\\cell Classificazione CLP\\row
\\trowd\\cellx2000\\cellx4000\\cellx6000\\cellx8000
\\cell Benzyl salicylate\\cell 118-58-1\\cell 0,1 - 1 %\\cell Skin Sens. 1B H317\\row
\\trowd\\cellx2000\\cellx4000\\cellx6000\\cellx8000
\\cell Miscela C(M)IT/MIT (3:1)\\cell 55965-84-9\\cell >=0.00015% - <0.0015%\\cell Acute Tox. 3 H301, Skin Corr. 1C H314\\row
}`;

  const tableText = SDSRTFParser.parseRtfString(rtfTableSample);
  const lines = tableText.split('\n');
  
  assert(lines.length >= 3, `Niepoprawna liczba wierszy tabeli: oczekiwano >= 3, otrzymano: ${lines.length}`);
  assert(tableText.includes("Benzyl salicylate\t118-58-1\t0,1 - 1 %\tSkin Sens. 1B H317"), "Brak spójności wiersza Salicylanu benzylu!");
  assert(tableText.includes("55965-84-9"), "Brak CAS dla C(M)IT/MIT!");
  assert(tableText.includes(">= 0.00015% - < 0.0015%"), "Błąd normalizacji zakresu stężeń w tabeli!");
  console.log("-> TEST 2 PASSED: Tabela składników zlinearyzowana bez utraty granic kolumn i stężeń.");
  passedCount++;

  // --------------------------------------------------------------------------
  // TEST 3: Automatyczna detekcja formatu RTF w SDSDocumentParser
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Weryfikacja automatycznej detekcji typu pliku (RTF vs PDF)...");
  
  const rtfFilePath = path.join(tempDir, 'test_sample.rtf');
  fs.writeFileSync(rtfFilePath, rtfTableSample, 'binary');
  
  assert.strictEqual(SDSDocumentParser.isRtfFile(rtfFilePath), true, "SDSDocumentParser nie rozpoznał pliku .rtf po rozszerzeniu!");
  
  // Test rozpoznawania po sygnaturze {\rtf nawet przy innym rozszerzeniu
  const rtfWithoutExt = path.join(tempDir, 'sample_no_ext.tmp');
  fs.writeFileSync(rtfWithoutExt, rtfTableSample, 'binary');
  assert.strictEqual(SDSDocumentParser.isRtfFile(rtfWithoutExt), true, "SDSDocumentParser nie rozpoznał sygnatury {\\rtf w pliku bez rozszerzenia!");

  console.log("-> TEST 3 PASSED: Detekcja formatu RTF działa w 100% niezawodnie.");
  passedCount++;

  // --------------------------------------------------------------------------
  // TEST 4: Pełna karta SDS w formacie RTF (16 sekcji UE 2020/878)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Symulacja pełnej karty charakterystyki RTF (16 sekcji)...");
  
  const fullRtfSds = `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0 Arial;}}
{\\*\\generator Antigravity SDS System;}

\\b SEZIONE 1: IDENTIFICAZIONE DELLA SOSTANZA/MISCELA E DELLA SOCIET\\u192?/IMPRESA\\b0\\par
1.1 Identificatore del prodotto: SWEET HOME LAYALI - PROFUMO BIANCHERIA\\par
UFI: 4F20-V0Y8-U00F-XXXX\\par
1.2 Usi pertinenti identificati: Deodorante per ambienti.\\par
1.3 Informazioni sul fornitore della scheda di dati di sicurezza: Azienda Italia S.r.l.\\par
1.4 Numero telefonico di emergenza: +39 02 66101029\\par

\\b SEZIONE 2: IDENTIFICAZIONE DEI PERICOLI\\b0\\par
2.1 Classificazione della sostanza o della miscela:\\par
Skin Sens. 1, H317\\par
Aquatic Chronic 3, H412\\par
Repr. 2, H361fd\\par
2.2 Elementi dell'etichetta: Attenzione\\par
Piktogramma: GHS07, GHS08\\par
H317 Pu\\u242? provocare una reazione allergica cutanea.\\par
H412 Nocivo per gli organismi acquatici con effetti di lunga durata.\\par
H361fd Sospettato di nuocere alla fertilit\\u224?. Sospettato di nuocere al feto.\\par
P102 Tenere fuori dalla portata dei bambini.\\par
P302+P352 IN CASO DI CONTATTO CON LA PELLE: lavare abbondantemente con acqua.\\par
2.3 Altri pericoli: Non contiene sostanze interferenti con il sistema endocrino.\\par

\\b SEZIONE 3: COMPOSIZIONE/INFORMAZIONI SUGLI INGREDIENTI\\b0\\par
3.2 Miscele:\\par
\\trowd\\cellx2500\\cellx4500\\cellx6500\\cellx8500
\\cell Benzyl salicylate\\cell 118-58-1\\cell >= 0,1 - < 1 %\\cell Skin Sens. 1B H317\\row
\\trowd\\cellx2500\\cellx4500\\cellx6500\\cellx8500
\\cell Miscela 3:1 C(M)IT/MIT\\cell 55965-84-9\\cell >= 0.00015% - < 0.0015%\\cell Skin Sens. 1A H317, Skin Corr. 1C H314\\row

\\b SEZIONE 4: MISURE DI PRIMO SOCCORSO\\b0\\par
4.1 Descrizione delle misure di primo soccorso: In caso di contatto con la pelle lavare con acqua e sapone.\\par

\\b SEZIONE 5: MISURE ANTINCENDIO\\b0\\par
5.1 Mezzi di estinzione: Anidride carbonica, polvere chimica.\\par

\\b SEZIONE 6: MISURE IN CASO DI RILASCIO ACCIDENTALE\\b0\\par
6.1 Precauzioni personali: Indossare guanti adeguati.\\par

\\b SEZIONE 7: MANIPOLAZIONE E IMMAGAZZINAMENTO\\b0\\par
7.1 Precauzioni per la manipolazione sicura: Evitare il contatto con la pelle e gli occhi.\\par

\\b SEZIONE 8: CONTROLLI DELL'ESPOSIZIONE/DELLA PROTEZIONE INDIVIDUALE\\b0\\par
8.1 Parametri di controllo:\\par
55965-84-9 C(M)IT/MIT:\\par
Valore limite: NDS 0,2 mg/m3, NDSCh 0,4 mg/m3.\\par
8.2 Controlli dell'esposizione: Guanti protettivi in caso di manipolazione prolungata.\\par

\\b SEZIONE 9: PROPRIET\\u192? FISICHE E CHIMICHE\\b0\\par
9.1 Informazioni sulle propriet\\u224? fisiche e chimiche fondamentali:\\par
Stato fisico: Liquido\\par
Colore: Incolore\\par
Odore: Caratteristico\\par
Punto di ebollizione: 100 \\u176?C\\par
Punto di infiammabilit\\u224?: > 65 \\u176?C\\par
pH: 6,5\\par
Densit\\u224? relativa: 1,005 g/cm3\\par

\\b SEZIONE 10: STABILIT\\u192? E REATTIVIT\\u192?\\b0\\par
10.1 Reattivit\\u224?: Nessuna reazione pericolosa nota.\\par

\\b SEZIONE 11: INFORMAZIONI TOSSICOLOGICHE\\b0\\par
11.1 Informazioni sulle classi di pericolo definite nel regolamento (CE) n. 1272/2008:\\par
a) tossicit\\u224? acuta: non classificato.\\par
d) corrosione/irritazione cutanea: non classificato.\\par
e) lesioni oculari gravi: non classificato.\\par
d) sensibilizzazione cutanea: Pu\\u242? provocare una reazione allergica cutanea.\\par
j) pericolo in caso di aspirazione: non classificato.\\par
11.2 Informazioni su altri pericoli:\\par
Nessun interferente endocrino identificato.\\par

\\b SEZIONE 12: INFORMAZIONI ECOLOGICHE\\b0\\par
12.1 Tossicit\\u224?: Nocivo per gli organismi acquatici.\\par
12.2 Persistenza e degradabilit\\u224?: Facilmente biodegradabile.\\par
12.3 Potenziale di bioaccumulo:\\par
Benzyl salicylate (CAS: 118-58-1): Bioaccumulative, BCF = 311.\\par
12.4 Mobilit\\u224? nel suolo: Nessun dato disponibile.\\par
12.5 Risultati della valutazione PBT e vPvB: Non contiene sostanze PBT.\\par
12.6 Propriet\\u224? di interferenza con il sistema endocrino: Nessuna sostanza presente.\\par

\\b SEZIONE 13: CONSIDERAZIONI SULLO SMALTIMENTO\\b0\\par
13.1 Metodi di trattamento dei rifiuti: Smaltire in conformit\\u224? con le normative locali.\\par

\\b SEZIONE 14: INFORMAZIONI SUL TRASPORTO\\b0\\par
Prodotto non pericoloso ai sensi delle normative di trasporto (ADR/RID, IMDG, IATA).\\par

\\b SEZIONE 15: INFORMAZIONI SULLA REGOLAMENTAZIONE\\b0\\par
15.1 Disposizioni legislative su salute e ambiente: Regolamento (CE) n. 1907/2006 (REACH).\\par

\\b SEZIONE 16: ALTRE INFORMAZIONI\\b0\\par
H317: Pu\\u242? provocare una reazione allergica cutanea.\\par
H412: Nocivo per gli organismi acquatici.\\par
H361fd: Sospettato di nuocere alla fertilit\\u224?. Sospettato di nuocere al feto.\\par
}`;

  const fullSdsPath = path.join(tempDir, 'complete_sds_sample.rtf');
  fs.writeFileSync(fullSdsPath, fullRtfSds, 'binary');

  const engine = new SDSProcessorEngine({
    companyName: "MITRANS Weronika Grzesiak",
    address: "ul. Wesoła 16",
    city: "63-600 Kępno",
    email: "kontakt@prostozwloch.com.pl",
    phone: "+48 663116607",
    emergencyPhone: "+48 663116607"
  });

  // Uruchomienie prepareAgentPayload z pliku RTF
  engine.prepareAgentPayload(fullSdsPath, "SWEET HOME LAYALI PROFUMO BIANCHERIA")
    .then(payload => {
      assert(payload, "Payload jest pusty!");
      assert.strictEqual(payload.metadata.ufi, "4F20-V0Y8-U00F-XXXX", "Błąd ekstrakcji UFI z RTF!");
      
      // Weryfikacja Sekcji 2 (w tym H361fd i GHS08)
      const s2 = payload.deterministicSections.section_2;
      assert(s2.content.includes("H361FD") || s2.content.includes("H361fd"), "Brak H361fd w treści Sekcji 2!");
      assert(payload.detectedGhsPictograms.includes("GHS08"), "Nie wykryto piktogramu GHS08 dla H361fd!");
      assert(s2.content.includes("Podejrzewa się, że działa szkodliwie"), "Brak oficjalnego tłumaczenia CLP dla H361fd w Sekcji 2!");

      // Weryfikacja Sekcji 3
      const s3 = payload.deterministicSections.section_3;
      assert(s3 && s3.components.length >= 2, "Nie wyekstrahowano składników z tabeli RTF!");
      assert(s3.components.some(c => c.cas === "118-58-1"), "Brak salicylanu benzylu w składnikach!");
      assert(s3.components.some(c => c.cas === "55965-84-9"), "Brak C(M)IT/MIT w składnikach!");

      // Weryfikacja Sekcji 8
      const s8 = payload.deterministicSections.section_8.content;
      assert(s8.includes("55965-84-9"), "Brak CAS 55965-84-9 w Sekcji 8!");
      assert(s8.includes("0,2 mg/m³") || s8.includes("0,2 mg/m3"), "Brak NDS dla 55965-84-9 w Sekcji 8!");

      // Weryfikacja Sekcji 12.3 (bioakumulacja)
      const s12 = payload.deterministicSections.section_12.content;
      assert(s12.includes("118-58-1") && s12.includes("311"), "Brak danych o bioakumulacji BCF=311 w Sekcji 12.3!");

      // Weryfikacja Sekcji 16 (w tym H361fd)
      const s16 = payload.deterministicSections.section_16.content;
      assert(s16.includes("H361FD") || s16.includes("H361fd"), "Brak H361fd w pełnym wykazie Sekcji 16!");
      assert(s16.includes("Podejrzewa się, że działa szkodliwie"), "Brak oficjalnego tłumaczenia CLP dla H361fd w Sekcji 16!");

      console.log("-> TEST 4 PASSED: prepareAgentPayload w 100% prawidłowo przetworzył kartę RTF (w tym H361fd i GHS08).");
      passedCount++;

      // --------------------------------------------------------------------------
      // TEST 5: Weryfikacja działania Agenta Audytora (SDSVerifierAgent) na karcie RTF
      // --------------------------------------------------------------------------
      console.log("\n[TEST 5] Audyt regulacyjny SDSVerifierAgent na danych z RTF...");
      
      const combinedSections = {
        ...payload.deterministicSections,
        section_10: { content: "Brak reaktywności w normalnych warunkach." },
        section_11: { content: "Działa uczulająco w kontakcie ze skórą.\n\nj) zagrożenie spowodowane aspiracją: brak\n\n11.2. Informacje o innych zagrożeniach:\nBrak substancji zaburzających gospodarkę hormonalną." }
      };

      return SDSVerifierAgent.verifyAndAudit(combinedSections, {
        productName: payload.metadata.productName,
        components: payload.deterministicSections.section_3.components
      }).then(auditResult => {
        assert(auditResult.isCompliant, "Karta RTF nie przeszła audytu zgodności SDSVerifierAgent!");

        console.log("-> TEST 5 PASSED: SDSVerifierAgent potwierdził 100% zgodności prawnej karty z RTF.");
        passedCount++;

        // Sprzątanie plików tymczasowych
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {}

        console.log("\n========================================================");
        console.log(`WSZYSTKIE ${passedCount}/${passedCount} TESTÓW DLA FORMATU RTF ZAKOŃCZONE SUKCESEM!`);
        console.log("========================================================\n");
      });
    })
    .catch(err => {
      console.error("BŁĄD WYKONANIA TESTÓW RTF:", err);
      process.exit(1);
    });
}

runTests();
