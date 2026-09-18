// Auto-extracted module: SDSDocxExporter
const fs = require('fs');
const path = require('path');

class SDSDocxExporter {
  static async export(sdsData, outPath) {
    if (!docx) throw new Error("Brak biblioteki docx.");
    const { Document, Packer, Paragraph, TextRun, AlignmentType, ShadingType, Header, Footer, PageNumber, ImageRun, BorderStyle, Table, TableRow, TableCell, WidthType } = docx;

    const sectionsBody = [];
    
    const versionStr = sdsData.version || (sdsData.metadata && sdsData.metadata.version) || "1.0 PL";
    const isFirstEdition = !sdsData.version || /^1(\.0)?\s*(PL)?$/i.test(versionStr);
    const compilationDate = sdsData.compilationDate || (sdsData.metadata && sdsData.metadata.compilationDate) || new Date().toLocaleDateString('pl-PL');
    const revisionDate = sdsData.revisionDate || (sdsData.metadata && sdsData.metadata.revisionDate) || (isFirstEdition ? "Nie dotyczy" : new Date().toLocaleDateString('pl-PL'));
    const replacedRevision = sdsData.replacedRevision || (sdsData.metadata && sdsData.metadata.replacedRevision) || "Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta)";
    const distName = (sdsData.companyConfig && sdsData.companyConfig.companyName) ||
                     (sdsData.metadata && sdsData.metadata.companyConfig && sdsData.metadata.companyConfig.companyName) ||
                     process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.";

    // 1. Tytuł Główny
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `KARTA CHARAKTERYSTYKI`, bold: true, size: 36, font: "Arial" })],
      spacing: { before: 100, after: 80 }
    }));

    // 2. Podstawa Prawna wg Rozporządzenia (UE) 2020/878
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ 
        text: `[Sporządzona zgodnie z Rozporządzeniem (WE) nr 1907/2006 (REACH), zmienionym Rozporządzeniem Komisji (UE) 2020/878]`, 
        size: 16, 
        italics: true, 
        color: "444444", 
        font: "Arial" 
      })],
      spacing: { after: 200 }
    }));

    // 3. Oficjalny Blok Metadanych Dat i Wersji (Zgodnie z Pkt 0.2.5 Załącznika II do REACH)
    const metaBorder = {
      top: { style: BorderStyle.SINGLE, size: 6, color: "00A651" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "00A651" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" }
    };

    const metadataTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: metaBorder,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: "F9FAFB" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Data sporządzenia: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: compilationDate, size: 18, font: "Arial" })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Aktualizacja: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: revisionDate, size: 18, font: "Arial" })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: "F9FAFB" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Wersja: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: versionStr, size: 18, font: "Arial" })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Zastępuje wersję: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: replacedRevision, size: 18, font: "Arial" })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });
    sectionsBody.push(metadataTable);
    sectionsBody.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    const CANONICAL_SECTION_TITLES = {
      1: "SEKCJA 1: IDENTYFIKACJA SUBSTANCJI/MIESZANINY I IDENTYFIKACJA PRZEDSIĘBIORSTWA",
      2: "SEKCJA 2: IDENTYFIKACJA ZAGROŻEŃ",
      3: "SEKCJA 3: SKŁAD / INFORMACJA O SKŁADNIKACH",
      4: "SEKCJA 4: ŚRODKI PIERWSZEJ POMOCY",
      5: "SEKCJA 5: POSTĘPOWANIE W PRZYPADKU POŻARU",
      6: "SEKCJA 6: POSTĘPOWANIE W PRZYPADKU NIEZAMIERZONEGO UWOLNIENIA DO ŚRODOWISKA",
      7: "SEKCJA 7: POSTĘPOWANIE Z SUBSTANCJAMI I MIESZANINAMI ORAZ ICH MAGAZYNOWANIE",
      8: "SEKCJA 8: KONTROLA NARAŻENIA/ŚRODKI OCHRONY INDYWIDUALNEJ",
      9: "SEKCJA 9: WŁAŚCIWOŚCI FIZYCZNE I CHEMICZNE",
      10: "SEKCJA 10: STABILNOŚĆ I REAKTYWNOŚĆ",
      11: "SEKCJA 11: INFORMACJE TOKSYKOLOGICZNE",
      12: "SEKCJA 12: INFORMACJE EKOLOGICZNE",
      13: "SEKCJA 13: POSTĘPOWANIE Z ODPADAMI",
      14: "SEKCJA 14: INFORMACJE DOTYCZĄCE TRANSPORTU",
      15: "SEKCJA 15: INFORMACJE DOTYCZĄCE PRZEPISÓW PRAWNYCH",
      16: "SEKCJA 16: INNE INFORMACJE"
    };

    for (let i = 1; i <= 16; i++) {
      const data = sdsData.sections[`section_${i}`];
      if (!data) continue;
      
      const isQuarantine = data.type === "QUARANTINE";
      const lines = data.content.split("\n");
      
      let sectionTitle = CANONICAL_SECTION_TITLES[i] || `SEKCJA ${i}`;
      if (lines.length > 0 && lines[0].toUpperCase().includes(`SEKCJA ${i}`)) {
        const rawTitleLine = lines.shift().trim();
        const cleanExtracted = rawTitleLine.replace(/^(?:SEKCJA\s*\d+)\s*[\.:\-]?\s*/i, '').trim();
        if (cleanExtracted.length > 3) {
          sectionTitle = `SEKCJA ${i}: ${cleanExtracted.toUpperCase()}`;
        }
      }

      sectionsBody.push(new Paragraph({
        children: [new TextRun({ text: sectionTitle.trim().toUpperCase(), bold: true, size: 22 })],
        shading: isQuarantine ? { fill: "FFF9E6", type: ShadingType.CLEAR } : undefined,
        border: { bottom: { color: "00A651", space: 1, value: BorderStyle.SINGLE, size: 12 } },
        spacing: { before: 300, after: 150 }
      }));

      if (i === 3 && data.components && data.components.length > 0) {
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "3.1. Substancje: Nie dotyczy.", bold: true, size: 20, font: "Arial" })],
          spacing: { before: 180, after: 100 }
        }));
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "3.2. Mieszaniny", bold: true, size: 20, font: "Arial" })],
          spacing: { before: 180, after: 80 }
        }));
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: `Opis chemiczny: ${data.chemicalDescription || "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi."}`, size: 20, font: "Arial" })],
          spacing: { after: 150 }
        }));


        const tableBorder = {
          top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0" }
        };

        const headerRow = new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 2800, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Nazwa substancji", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 2600, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Identyfikatory", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 2800, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Klasyfikacja CLP", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 1400, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Stężenie", bold: true, size: 18, font: "Arial" })] })]
            })
          ]
        });

        const rows = [headerRow];
        data.components.forEach(c => {
          const idParagraphs = c.identifiers.split('\n').map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 17, font: "Arial" })],
            spacing: { after: 40 }
          }));

          const classParagraphs = c.classification.split('\n').map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 17, font: "Arial" })],
            spacing: { after: 40 }
          }));

          rows.push(new TableRow({
            children: [
              new TableCell({
                width: { size: 2800, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: c.name, bold: true, size: 18, font: "Arial" })],
                    spacing: { after: 40 }
                  }),
                ]
              }),
              new TableCell({
                width: { size: 2600, type: WidthType.DXA },
                children: idParagraphs
              }),
              new TableCell({
                width: { size: 2800, type: WidthType.DXA },
                children: classParagraphs
              }),
              new TableCell({
                width: { size: 1400, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: c.concentration, size: 18, font: "Arial" })] })]
              })
            ]
          }));
        });

        sectionsBody.push(new Table({
          width: { size: 9600, type: WidthType.DXA },
          borders: tableBorder,
          rows: rows
        }));

        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.", italics: true, size: 18, font: "Arial" })],
          spacing: { before: 180, after: 150 }
        }));

        continue;
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const tLine = line.trim();
        if (!tLine) continue;

        // Sekcja 2.2: Piktogramy określające rodzaj zagrożenia (CLP)
        if (i === 2 && /Piktogramy określające rodzaj zagrożenia/i.test(tLine)) {
          sectionsBody.push(new Paragraph({
            children: [new TextRun({ text: tLine.endsWith(':') ? tLine : tLine + ':', bold: true, size: 20, font: "Arial" })],
            spacing: { before: 150, after: 80 }
          }));
          if (sdsData.ghsPictograms && sdsData.ghsPictograms.length > 0) {
            const imageRuns = [];
            for (const code of sdsData.ghsPictograms) {
              const buffer = await GHSPictogramGenerator.generatePictogramBuffer(code, 180);
              imageRuns.push(new ImageRun({ data: buffer, transformation: { width: 75, height: 75 } }));
            }
            sectionsBody.push(new Paragraph({ children: imageRuns, spacing: { before: 60, after: 100 } }));
          }
          continue;
        }

        // Sekcja 14.3: Klasa(-y) zagrożenia w transporcie & Nalepka ostrzegawcza ADR
        if (i === 14 && /14\.3\.\s*Klasa/i.test(tLine)) {
          sectionsBody.push(new Paragraph({
            children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
            spacing: { before: 200, after: 80 }
          }));
          const isNotRegulatedTransport = /Produkt nie jest sklasyfikowany jako stwarzający zagrożenie|nie podlega przepisom dotyczącym międzynarodowego przewozu/i.test(data.content) || /14\.3\.\s*Klasa[^\n]*\n\s*Nie dotyczy/i.test(data.content);
          const adrClassMatch = data.content.match(/(?:ADR[^:\n]*:\s*Klasa|Klasa|Nalepka ostrzegawcza:\s*Nr)\s*([0-9\.]+)/i);
          if (!isNotRegulatedTransport && adrClassMatch && adrClassMatch[1]) {
            const adrClass = adrClassMatch[1];
            try {
              const adrBuffer = await ADRPictogramGenerator.generateAdrLabelBuffer(adrClass, 180);
              if (adrBuffer) {
                sectionsBody.push(new Paragraph({
                  children: [new ImageRun({ data: adrBuffer, transformation: { width: 75, height: 75 } })],
                  spacing: { before: 60, after: 100 }
                }));
              }
            } catch (adrErr) {
              console.warn(`[DOCX Exporter] Pominięto generowanie nalepki ADR dla klasy ${adrClass}:`, adrErr.message);
            }
          }
          continue;
        }

        // Sekcja 14.6: Ilości ograniczone (LQ) wg 3.4 ADR
        if (i === 14 && /Ilości ograniczone\s*\(LQ\)/i.test(tLine)) {
          const idx = tLine.indexOf(':');
          const headerTxt = idx !== -1 ? tLine.substring(0, idx + 1) : tLine;
          let valTxt = idx !== -1 ? tLine.substring(idx + 1).trim() : '';

          // Scalenie ewentualnej oderwanej jednostki z następnej linii (np. '1 \n L' lub 'L')
          if (lineIndex + 1 < lines.length && /^(?:L|lt|kg|ml|g)\b/i.test(lines[lineIndex + 1].trim())) {
            valTxt = (valTxt ? valTxt + ' ' : '') + lines[lineIndex + 1].trim();
            lineIndex++; // pomijamy skonsumowaną linię jednostki, aby nie pojawiła się jako akapit pod obrazkiem
          } else if (/^\d+$/.test(valTxt)) {
            valTxt += " L";
          }

          sectionsBody.push(new Paragraph({
            children: [
              new TextRun({ text: headerTxt + ' ', bold: true, size: 20, font: "Arial" }),
              new TextRun({ text: valTxt, size: 20, font: "Arial" })
            ],
            spacing: { before: 80, after: 60 }
          }));
          if (!/brak|nie dotyczy|\b0\b/i.test(valTxt)) {
            const lqBuffer = await ADRPictogramGenerator.generateLqMarkBuffer(180);
            sectionsBody.push(new Paragraph({
              children: [
                new ImageRun({ data: lqBuffer, transformation: { width: 70, height: 70 } }),
                new TextRun({ text: "  Znak dla towarów pakowanych w ilościach ograniczonych (LQ) zgodnie z działem 3.4 Umowy ADR", italics: true, size: 16, font: "Arial" })
              ],
              spacing: { before: 40, after: 80 }
            }));
          }
          continue;
        }

        const isSubSection = /^(\d+\.\d+(\.\d+)?\.?)\s+/.test(tLine);
        const isLabelHeader = /^(Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze|Nazwy niebezpiecznych substancji wymienione na etykiecie|Zwroty wskazujące rodzaj zagrożenia|Zwroty wskazujące środki ostrożności|Informacje uzupełniające|Informacja toksykologiczna w Polsce \(organ doradczy\):|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Polska\):|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Dz\.U\. 2018 poz\. 1286 z późn\. zm\.\):|Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego \(OEL\):|Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu \(3:1\) \(CAS: 55965-84-9\):|Właściwości ekotoksykologiczne mieszaniny:|Informacje ekotoksykologiczne o składnikach:|Informacje dotyczące składników:|Substancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:|Zalecenia dotyczące produktu i pozostałości:|Zalecenia dotyczące odpadów opakowaniowych:|Zalecenia dotyczące opakowań:|Klasyfikacja i kody odpadów.+?:|Proponowane kody odpadów.+?:|Krajowe i unijne akty prawne dotyczące gospodarki odpadami:|Prawodawstwo Unii Europejskiej:|Prawodawstwo Rzeczypospolitej Polskiej:|Pełne brzmienie zwrotów H i EUH.+?:|Wykaz klas i kategorii zagrożenia.+?:|Objaśnienie skrótów i akronimów.+?:|Główne źródła literatury i danych:|Zalecenia i wskazówki szkoleniowe.+?:|Informacje o zmianach i aktualizacji:|Klauzula prawna i ochrona praw autorskich:|.+?\(CAS:\s*\d{2,7}-\d{2}-\d\):)$/i.test(tLine);
        const isBoldStart = /^(Firma|Adres|Strona www|E-mail|Telefon|Telefon alarmowy przedsiębiorstwa|Krajowe Centrum Informacji Toksykologicznej.+?|Ośrodek Informacji Toksykologicznej.+?|Ogólne telefony ratunkowe.+?|Nazwa handlowa|Kod produktu|UFI|Zastosowanie zidentyfikowane|Zastosowania odradzane|Hasło ostrzegawcze|Zwroty wskazujące|Piktogramy|DNEL|PNEC|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową|Leczenie|Odpowiednie środki gaśnicze|Niewłaściwe środki gaśnicze|Szczególne zagrożenia|Środki ochrony strażaków|Dla osób nienależących do personelu udzielającego pomocy|Dla osób udzielających pomocy|Odpowiedni materiał do zbierania|Środki ostrożności|Zalecenia dotyczące ogólnej higieny pracy|Materiały niezgodne|Wskazówki dotyczące pomieszczeń magazynowych|Rozwiązania specyficzne dla sektora przemysłowego|Wartości DNEL i PNEC|Zalecane procedury monitorowania|Ochrona oczu|Ochrona skóry|Ochrona rąk|Ochrona dróg oddechowych|Zagrożenia termiczne|Kontrola narażenia środowiska|Środki higieniczne i techniczne|Austria|Stan skupienia|Kolor|Zapach|Temperatura topnienia\/krzepnięcia|Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia|Palność materiałów|Dolna i górna granica wybuchowości|Temperatura zapłonu|Temperatura samozapłonu|Temperatura rozkładu|pH|Lepkość kinematyczna|Rozpuszczalność w wodzie|Rozpuszczalność w innych rozpuszczalnikach|Współczynnik podziału n-oktanol\/woda \(wartość współczynnika log\)|Prężność pary|Gęstość lub gęstość względna|Względna gęstość pary|Charakterystyka cząsteczek|Lotne Związki Organiczne \(LZO \/ VOC\)|a\)\s*Ostra toksyczność dla środowiska wodnego|b\)\s*Przewlekła toksyczność dla środowiska wodnego|Współczynnik biokoncentracji \(BCF\)|Współczynnik podziału n-oktanol\/woda \(log Kow\)|Kod ograniczeń przewozu przez tunele|Kategoria transportowa|Ilości ograniczone \(LQ\)|Ilości wyłączone \(EQ\)|Nalepka ostrzegawcza|Numer rozpoznawczy zagrożenia|Odpady z produktu.+?|Odpady opakowaniowe|Substancje wzbudzające szczególnie duże obawy.+?|Ograniczenia dotyczące produkcji.+?|H\d{3}[a-zA-Z]?|EUH\d{3}|Acute Tox\..+?|Skin Corr\..+?|Skin Irrit\..+?|Eye Dam\..+?|Eye Irrit\..+?|Skin Sens\..+?|Resp\. Sens\..+?|Flam\. Liq\..+?|Flam\. Sol\..+?|Aerosol.+?|Asp\. Tox\..+?|STOT SE.+?|STOT RE.+?|Aquatic Acute.+?|Aquatic Chronic.+?|ADR|RID|IMDG|IATA|ICAO|CLP|REACH|GHS|CAS|WE|NDS|NDSCh|NDSP|vPvB|SVHC|log Kow|LD50|LC50|EC50|NOEC|SCL|BDO|ECHA|Mieszanina|Uwaga):/i.test(tLine);

        if (isSubSection) {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
             spacing: { before: 200, after: 100 }
           }));
        } else if (isLabelHeader) {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
             spacing: { before: 150, after: 80 }
           }));
        } else if (isBoldStart) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20, font: "Arial" }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20, font: "Arial" })
             ],
             spacing: { before: 80, after: 80 }
           }));
        } else if (/^\s*[*•-]\s+/.test(tLine) && tLine.includes(':')) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20, font: "Arial" }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20, font: "Arial" })
             ],
             spacing: { before: 60, after: 60 }
           }));
        } else {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, size: 20, font: "Arial" })],
             spacing: { after: 80 }
           }));
        }
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial"
            }
          }
        }
      },
      sections: [{
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({ 
                alignment: AlignmentType.RIGHT, 
                border: { bottom: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: `KARTA CHARAKTERYSTYKI | ${sdsData.productName} | Wersja: ${versionStr}`, font: "Arial", size: 16, color: "555555" })
                ] 
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { before: 120 },
                children: [
                  new TextRun({ text: `Dystrybutor: ${distName} | `, font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: "Strona ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: " z ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: "555555" })
                ]
              })
            ]
          })
        },
        children: sectionsBody
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
  }
}

// ============================================================================
// CLI RUNNER DLA AGENTA ANTIGRAVITY
// ============================================================================

module.exports = { SDSDocxExporter };
