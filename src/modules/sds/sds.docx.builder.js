const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  ShadingType
} = require('docx');

const { GHSPictogramGenerator, ADRPictogramGenerator } = require('./sds.service');

const SECTION_TITLES_PL = {
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

const OFFICIAL_SUBSECTIONS_PL = {
  "1.1": "1.1. Identyfikator produktu",
  "1.2": "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane",
  "1.3": "1.3. Dane dotyczące dostawcy karty charakterystyki",
  "1.4": "1.4. Numer telefonu alarmowego",
  "2.1": "2.1. Klasyfikacja substancji lub mieszaniny",
  "2.2": "2.2. Elementy oznakowania",
  "2.3": "2.3. Inne zagrożenia",
  "3.1": "3.1. Substancje",
  "3.2": "3.2. Mieszaniny",
  "4.1": "4.1. Opis środków pierwszej pomocy",
  "4.2": "4.2. Najważniejsze ostre i opóźnione objawy oraz skutki narażenia",
  "4.3": "4.3. Wskazania dotyczące wszelkiej natychmiastowej pomocy lekarskiej i szczególnego postępowania z poszkodowanym",
  "5.1": "5.1. Środki gaśnicze",
  "5.2": "5.2. Szczególne zagrożenia związane z substancją lub mieszaniną",
  "5.3": "5.3. Informacje dla straży pożarnej",
  "6.1": "6.1. Indywidualne środki ostrożności, wyposażenie ochronne i procedury w sytuacjach awaryjnych",
  "6.2": "6.2. Środki ostrożności w zakresie ochrony środowiska",
  "6.3": "6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia",
  "6.4": "6.4. Odniesienia do innych sekcji",
  "7.1": "7.1. Środki ostrożności dotyczące bezpiecznego postępowania",
  "7.2": "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności",
  "7.3": "7.3. Szczególne zastosowania końcowe",
  "8.1": "8.1. Parametry dotyczące kontroli",
  "8.2": "8.2. Kontrola narażenia",
  "9.1": "9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych",
  "9.2": "9.2. Inne informacje",
  "10.1": "10.1. Reaktywność",
  "10.2": "10.2. Stabilność chemiczna",
  "10.3": "10.3. Możliwość występowania niebezpiecznych reakcji",
  "10.4": "10.4. Warunki, których należy unikać",
  "10.5": "10.5. Materiały niezgodne",
  "10.6": "10.6. Niebezpieczne produkty rozkładu",
  "11.1": "11.1. Informacje na temat klas zagrożenia zdefiniowanych w rozporządzeniu (WE) nr 1272/2008",
  "11.2": "11.2. Informacje o innych zagrożeniach",
  "12.1": "12.1. Toksyczność",
  "12.2": "12.2. Trwałość i zdolność do rozkładu",
  "12.3": "12.3. Zdolność do bioakumulacji",
  "12.4": "12.4. Mobilność w glebie",
  "12.5": "12.5. Wyniki oceny właściwości PBT i vPvB",
  "12.6": "12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego",
  "12.7": "12.7. Inne szkodliwe skutki działania",
  "13.1": "13.1. Metody unieszkodliwiania odpadów",
  "14.1": "14.1. Numer UN lub numer identyfikacyjny ID",
  "14.2": "14.2. Prawidłowa nazwa przewozowa UN",
  "14.3": "14.3. Klasa(-y) zagrożenia w transporcie",
  "14.4": "14.4. Grupa pakowania",
  "14.5": "14.5. Zagrożenia dla środowiska",
  "14.6": "14.6. Szczególne środki ostrożności dla użytkowników",
  "14.7": "14.7. Transport morski luzem zgodnie z instrumentami IMO",
  "15.1": "15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny",
  "15.2": "15.2. Ocena bezpieczeństwa chemicznego",
  "16.1": "16.1. Inne informacje"
};

/**
 * SDSDocxBuilder - Profesjonalny generator dokumentów DOCX klasy Enterprise,
 * odtwarzający strukturę i estetykę referencyjnej karty SANDALO (8034055535424_SDS_SANDALO 1.0 PL.pdf) 1:1.
 */
class SDSDocxBuilder {
  /**
   * Generuje plik .docx z przetłumaczonego i ustrukturyzowanego obiektu SDS
   */
  static async buildDocx(sdsData, outPath) {
    const docChildren = [];
    const meta = sdsData.metadata || {};
    const prodName = meta.productName || "KARTA CHARAKTERYSTYKI PRODUKTU";
    const versionStr = meta.version || "1.0 PL";
    const distributorStr = meta.distributor || "ITALLUX Sp. z o.o., ul. Wesoła 16, 63-600 Kępno";

    // 1. NAGŁÓWEK TYTUŁOWY DOKUMENTU NA PIERWSZEJ STRONIE (Wzór SANDALO)
    docChildren.push(new Paragraph({
      children: [
        new TextRun({
          text: "KARTA CHARAKTERYSTYKI",
          bold: true,
          size: 32, // 16pt
          font: "Arial",
          color: "111827"
        })
      ],
      spacing: { before: 80, after: 60 }
    }));

    docChildren.push(new Paragraph({
      children: [
        new TextRun({
          text: "[Sporządzona zgodnie z Rozporządzeniem (WE) nr 1907/2006 (REACH), zmienionym Rozporządzeniem Komisji (UE) 2020/878]",
          italics: true,
          size: 16, // 8pt
          font: "Arial",
          color: "4B5563"
        })
      ],
      spacing: { after: 180 }
    }));

    // 2. TABELA METADANYCH (Data sporządzenia, Aktualizacja, Wersja, Zastępuje)
    const metaBorders = {
      top: { color: "00A651", space: 4, value: BorderStyle.SINGLE, size: 12 },
      bottom: { color: "00A651", space: 4, value: BorderStyle.SINGLE, size: 12 },
      left: { value: BorderStyle.NONE },
      right: { value: BorderStyle.NONE }
    };

    const metaRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9600, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Data sporządzenia: ", bold: true, size: 18, font: "Arial" }),
                  new TextRun({ text: meta.compilationDate || "17.09.2026", size: 18, font: "Arial" })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9600, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Aktualizacja: ", bold: true, size: 18, font: "Arial" }),
                  new TextRun({ text: meta.revisionDate || "Nie dotyczy", size: 18, font: "Arial" })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9600, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Wersja: ", bold: true, size: 18, font: "Arial" }),
                  new TextRun({ text: versionStr, size: 18, font: "Arial" })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9600, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Zastępuje wersję: ", bold: true, size: 18, font: "Arial" }),
                  new TextRun({ text: meta.replacedRevision || "Brak (wydanie pierwsze w języku polskim)", size: 18, font: "Arial" })
                ]
              })
            ]
          })
        ]
      })
    ];

    docChildren.push(new Table({
      width: { size: 9600, type: WidthType.DXA },
      borders: metaBorders,
      rows: metaRows
    }));

    docChildren.push(new Paragraph({ spacing: { after: 200 } }));

    // 3. GENEROWANIE SEKCJI OD 1 DO 16
    for (let secNum = 1; secNum <= 16; secNum++) {
      const secKey = String(secNum);
      const secTitle = SECTION_TITLES_PL[secNum];
      const secData = sdsData.sections ? (sdsData.sections[secKey] || {}) : {};

      // Nagłówek główny sekcji z zieloną linią podkreślenia (#00A651)
      docChildren.push(new Paragraph({
        border: { bottom: { color: "00A651", space: 6, value: BorderStyle.SINGLE, size: 12 } },
        spacing: { before: 320, after: 160 },
        children: [
          new TextRun({
            text: secTitle,
            bold: true,
            size: 22, // 11pt
            font: "Arial",
            color: "000000"
          })
        ]
      }));

      // SPECJALNA OBSŁUGA SEKCJI 2 (Piktogramy GHS i elementy oznakowania)
      if (secNum === 2) {
        await this.renderSection2(docChildren, secData, sdsData);
        continue;
      }

      // SPECJALNA OBSŁUGA SEKCJI 3 (Tabela składników 3.2 OpenXML)
      if (secNum === 3) {
        await this.renderSection3(docChildren, secData, sdsData);
        continue;
      }

      // SPECJALNA OBSŁUGA SEKCJI 14 (Transport i piktogramy ADR / LQ)
      if (secNum === 14) {
        await this.renderSection14(docChildren, secData, sdsData);
        continue;
      }

      // STANDARDOWA OBSŁUGA POZOSTAŁYCH SEKCJI
      await this.renderStandardSection(docChildren, secNum, secData, sdsData);
    }

    // 4. KONSTRUKCJA CAŁEGO DOKUMENTU WORD
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 20 // 10pt
            }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { after: 120 },
                children: [
                  new TextRun({
                    text: `KARTA CHARAKTERYSTYKI | ${prodName} | Wersja: ${versionStr}`,
                    font: "Arial",
                    size: 16,
                    color: "555555"
                  })
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
                border: { top: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { before: 120 },
                children: [
                  new TextRun({ text: `Dystrybutor: ${distributorStr.split(',')[0]} | `, font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: "Strona ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: " z ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: "555555" })
                ]
              })
            ]
          })
        },
        children: docChildren
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
    console.log(`[SDSDocxBuilder] Pomyślnie wygenerowano dokument DOCX: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  /**
   * Renderuje Sekcję 2 z piktogramami GHS i elementami oznakowania CLP
   */
  static async renderSection2(docChildren, secData, sdsData) {
    const keys = Object.keys(secData).sort();
    for (const subKey of keys) {
      const content = secData[subKey] || "";
      this.renderSubSectionHeader(docChildren, subKey, content);

      // W sekcji 2.2 renderujemy piktogramy graficzne
      if (subKey === "2.2") {
        const pictograms = sdsData.classification?.pictograms || [];
        if (pictograms.length > 0) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Piktogramy określające rodzaj zagrożenia:", bold: true, size: 20, font: "Arial" })],
            spacing: { before: 140, after: 80 }
          }));

          const imageRuns = [];
          for (const code of pictograms) {
            try {
              const pBuffer = await GHSPictogramGenerator.generatePictogramBuffer(code, 180);
              if (pBuffer) {
                imageRuns.push(new ImageRun({
                  data: pBuffer,
                  transformation: { width: 75, height: 75 }
                }));
              }
            } catch (err) {
              console.warn(`[SDSDocxBuilder] Błąd generowania piktogramu ${code}:`, err.message);
            }
          }

          if (imageRuns.length > 0) {
            docChildren.push(new Paragraph({
              children: imageRuns,
              spacing: { before: 60, after: 120 }
            }));
          }
        }
      }

      // Renderowanie linii tekstu podsekcji
      this.renderFormattedParagraphs(docChildren, content, subKey);
    }
  }

  /**
   * Renderuje Sekcję 3 z profesjonalną 4-kolumnową tabelą OpenXML (Wzór SANDALO 1:1)
   */
  static async renderSection3(docChildren, secData, sdsData) {
    // 3.1. Substancje
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["3.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 160, after: 60 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: secData["3.1"] || "Nie dotyczy.", size: 19, font: "Arial" })],
      spacing: { after: 120 }
    }));

    // 3.2. Mieszaniny
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["3.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 160, after: 60 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Opis chemiczny: Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi.", size: 19, font: "Arial" })],
      spacing: { after: 140 }
    }));

    const components = sdsData.components || [];
    if (components.length > 0) {
      const tableBorder = {
        top: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 },
        bottom: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 },
        left: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 },
        right: { color: "D1D5DB", space: 4, value: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 },
        insideVertical: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 }
      };

      const tableRows = [];

      // Nagłówek tabeli
      tableRows.push(new TableRow({
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            shading: { fill: "F2F4F7", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Nazwa substancji", bold: true, size: 18, font: "Arial" })] })]
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            shading: { fill: "F2F4F7", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Identyfikatory", bold: true, size: 18, font: "Arial" })] })]
          }),
          new TableCell({
            width: { size: 2700, type: WidthType.DXA },
            shading: { fill: "F2F4F7", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Klasyfikacja CLP", bold: true, size: 18, font: "Arial" })] })]
          }),
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            shading: { fill: "F2F4F7", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: "Stężenie", bold: true, size: 18, font: "Arial" })] })]
          })
        ]
      }));

      // Wiersze danych składników
      for (const comp of components) {
        let cleanNamePl = (comp.namePl || "Substancja").replace(/\s*\(ang\..*?\)/gi, '').trim();
        let displayEn = comp.nameEn || "";
        const enMatch = (comp.namePl || "").match(/\(ang\.\s*([^)]+)\)/i);
        if (enMatch && !displayEn) {
          displayEn = enMatch[1].trim();
        }

        const nameParagraphs = [
          new Paragraph({
            children: [new TextRun({ text: cleanNamePl, bold: true, size: 18, font: "Arial" })],
            spacing: { after: 40 }
          })
        ];
        if (displayEn && displayEn.toLowerCase() !== cleanNamePl.toLowerCase()) {
          nameParagraphs.push(new Paragraph({
            children: [new TextRun({ text: `(ang. ${displayEn})`, italics: true, size: 16, font: "Arial", color: "4B5563" })],
            spacing: { after: 40 }
          }));
        }

        // Kolumna 2: Identyfikatory
        const idParagraphs = [];
        if (comp.cas && comp.cas !== '-' && comp.cas !== 'Brak') {
          idParagraphs.push(new Paragraph({ children: [new TextRun({ text: `Numer CAS: ${comp.cas}`, size: 17, font: "Arial" })], spacing: { after: 30 } }));
        }
        if (comp.ec && comp.ec !== '-' && comp.ec !== 'Brak') {
          idParagraphs.push(new Paragraph({ children: [new TextRun({ text: `Numer WE: ${comp.ec}`, size: 17, font: "Arial" })], spacing: { after: 30 } }));
        }
        if (comp.indexNo && comp.indexNo !== '-' && comp.indexNo !== 'Brak') {
          idParagraphs.push(new Paragraph({ children: [new TextRun({ text: `Numer indeksowy: ${comp.indexNo}`, size: 17, font: "Arial" })], spacing: { after: 30 } }));
        }
        if (comp.reach && comp.reach !== '-' && comp.reach !== 'Brak') {
          idParagraphs.push(new Paragraph({ children: [new TextRun({ text: `Numer rejestracji REACH: ${comp.reach}`, size: 17, font: "Arial" })], spacing: { after: 30 } }));
        }
        if (idParagraphs.length === 0) {
          idParagraphs.push(new Paragraph({ children: [new TextRun({ text: "Brak danych identyfikacyjnych", size: 17, font: "Arial" })] }));
        }

        // Kolumna 3: Klasyfikacja CLP
        const clpParagraphs = [
          new Paragraph({
            children: [new TextRun({ text: comp.clp || "Brak klasyfikacji", size: 17, font: "Arial" })],
            spacing: { after: 40 }
          })
        ];

        // Kolumna 4: Stężenie
        const concParagraphs = [
          new Paragraph({
            children: [new TextRun({ text: comp.concentration || "Brak danych", size: 18, font: "Arial" })]
          })
        ];

        tableRows.push(new TableRow({
          children: [
            new TableCell({ width: { size: 3000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: nameParagraphs }),
            new TableCell({ width: { size: 2500, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: idParagraphs }),
            new TableCell({ width: { size: 2700, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: clpParagraphs }),
            new TableCell({ width: { size: 1400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: concParagraphs })
          ]
        }));
      }

      docChildren.push(new Table({
        width: { size: 9600, type: WidthType.DXA },
        borders: tableBorder,
        rows: tableRows
      }));

      docChildren.push(new Paragraph({
        children: [
          new TextRun({
            text: "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.",
            italics: true,
            size: 16,
            font: "Arial",
            color: "555555"
          })
        ],
        spacing: { before: 140, after: 180 }
      }));
    } else if (secData["3.2"]) {
      this.renderFormattedParagraphs(docChildren, secData["3.2"], "3.2");
    }
  }

  /**
   * Renderuje Sekcję 14 z danymi transportowymi i piktogramami ADR / LQ
   */
  static async renderSection14(docChildren, secData, sdsData) {
    const transport = sdsData.transport || {};
    const keys = Object.keys(secData).sort();

    for (const subKey of keys) {
      const content = secData[subKey] || "";
      this.renderSubSectionHeader(docChildren, subKey, content);

      // Sekcja 14.3: Jeśli występuje klasa transportowa ADR, wstrzyknij piktogram
      if (subKey === "14.3") {
        if (transport.isRegulated && transport.class && transport.class !== "Nie dotyczy") {
          const adrClassNum = transport.class.replace(/[^0-9\.]/g, '');
          if (adrClassNum) {
            try {
              const adrBuf = await ADRPictogramGenerator.generateAdrLabelBuffer(adrClassNum, 180);
              if (adrBuf) {
                docChildren.push(new Paragraph({
                  children: [new ImageRun({ data: adrBuf, transformation: { width: 75, height: 75 } })],
                  spacing: { before: 60, after: 100 }
                }));
              }
            } catch (err) {
              console.warn(`[SDSDocxBuilder] Błąd generowania nalepki ADR ${adrClassNum}:`, err.message);
            }
          }
        }
      }

      // Sekcja 14.6: Znak LQ jeśli dotyczy
      if (subKey === "14.6" && transport.lq && !/brak|nie dotyczy|\b0\b/i.test(transport.lq)) {
        try {
          const lqBuf = await ADRPictogramGenerator.generateLqMarkBuffer(180);
          if (lqBuf) {
            docChildren.push(new Paragraph({
              children: [
                new ImageRun({ data: lqBuf, transformation: { width: 70, height: 70 } }),
                new TextRun({ text: "  Znak dla towarów pakowanych w ilościach ograniczonych (LQ) zgodnie z działem 3.4 Umowy ADR", italics: true, size: 16, font: "Arial" })
              ],
              spacing: { before: 60, after: 80 }
            }));
          }
        } catch (lqErr) {
          console.warn(`[SDSDocxBuilder] Błąd generowania znaku LQ:`, lqErr.message);
        }
      }

      this.renderFormattedParagraphs(docChildren, content, subKey);
    }
  }

  /**
   * Renderuje sekcje o standardowej strukturze podsekcji
   */
  static async renderStandardSection(docChildren, secNum, secData, sdsData) {
    const keys = Object.keys(secData).sort();
    if (keys.length === 0) {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Brak dostępnych danych dla tej sekcji.", size: 19, font: "Arial" })],
        spacing: { after: 120 }
      }));
      return;
    }

    for (const subKey of keys) {
      const content = secData[subKey] || "";
      this.renderSubSectionHeader(docChildren, subKey, content);
      this.renderFormattedParagraphs(docChildren, content, subKey);
    }
  }

  /**
   * Generuje nagłówek podsekcji (np. 1.1., 9.1., 11.1.)
   */
  static renderSubSectionHeader(docChildren, subKey, content) {
    let headerText = OFFICIAL_SUBSECTIONS_PL[subKey] || `${subKey}.`;

    docChildren.push(new Paragraph({
      children: [
        new TextRun({
          text: headerText,
          bold: true,
          size: 20, // 10pt
          font: "Arial",
          color: "1F2937"
        })
      ],
      spacing: { before: 180, after: 80 }
    }));
  }

  /**
   * Parsuje treść i tworzy elegancko sformatowane akapity z pogrubionymi etykietami
   */
  static renderFormattedParagraphs(docChildren, text, subKey = "") {
    if (!text) return;

    // Specjalne dzielenie wieloliniowe dla sekcji 9.1 (właściwości a-s) lub sekcji zawierających punkty ze średnikami
    let rawLines = [];
    if (subKey === "9.1") {
      // Podziel na punkty a), b), c)...
      const splitPoints = text.split(/(?:;\s*|\n+|(?<=\.\s+))(?=[a-z]\)\s+)/i);
      for (const p of splitPoints) {
        if (p.trim()) rawLines.push(p.trim());
      }
    } else {
      // Dzielimy najpierw po znakach nowej linii
      const lineSplits = text.split('\n');
      for (const l of lineSplits) {
        // Jeśli linia zawiera wielokrotne punkty oddzielone średnikami (np. ADR/RID: ...; IMDG: ...; IATA: ...)
        if (l.includes('; ') && l.length > 80 && !l.startsWith('http')) {
          const subParts = l.split(/;\s+/);
          for (const sp of subParts) {
            if (sp.trim()) rawLines.push(sp.trim());
          }
        } else {
          if (l.trim()) rawLines.push(l.trim());
        }
      }
    }

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i].trim();
      if (!line) continue;

      // Jeśli linia jest zbędnym powtórzeniem nagłówka podsekcji, pomiń
      const offTitle = OFFICIAL_SUBSECTIONS_PL[subKey];
      if (offTitle && (line.toLowerCase() === offTitle.toLowerCase() || line.startsWith(offTitle + ':'))) {
        line = line.substring(offTitle.length + 1).trim();
        if (!line) continue;
      }

      // Sprawdzenie czy linia to klucz z dwukropkiem (np. "Stan skupienia: Ciecz", "pH: 2,5")
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0 && colonIndex < 80 && !line.startsWith('http')) {
        const keyPart = line.substring(0, colonIndex + 1);
        const valPart = line.substring(colonIndex + 1);

        docChildren.push(new Paragraph({
          children: [
            new TextRun({ text: keyPart + " ", bold: true, size: 19, font: "Arial", color: "111827" }),
            new TextRun({ text: valPart.trim(), size: 19, font: "Arial", color: "1F2937" })
          ],
          spacing: { after: 60 }
        }));
      } else if (/^[-*•]\s+/.test(line)) {
        // Element listy punktowanej
        const cleanBullet = line.replace(/^[-*•]\s+/, '');
        const bColonIndex = cleanBullet.indexOf(':');
        if (bColonIndex > 0 && bColonIndex < 60) {
          const bKey = cleanBullet.substring(0, bColonIndex + 1);
          const bVal = cleanBullet.substring(bColonIndex + 1);
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true, size: 19, font: "Arial", color: "00A651" }),
              new TextRun({ text: bKey + " ", bold: true, size: 19, font: "Arial" }),
              new TextRun({ text: bVal.trim(), size: 19, font: "Arial" })
            ],
            spacing: { after: 50 }
          }));
        } else {
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true, size: 19, font: "Arial", color: "00A651" }),
              new TextRun({ text: cleanBullet, size: 19, font: "Arial" })
            ],
            spacing: { after: 50 }
          }));
        }
      } else {
        // Zwykły akapit narracyjny
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line, size: 19, font: "Arial" })],
          spacing: { after: 70 }
        }));
      }
    }
  }
}

module.exports = { SDSDocxBuilder, SECTION_TITLES_PL, OFFICIAL_SUBSECTIONS_PL };
