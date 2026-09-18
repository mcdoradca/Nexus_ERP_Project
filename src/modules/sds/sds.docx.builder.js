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
  "16": "16.1. Inne informacje",
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

    // Rozwiązanie pełnej, spolonizowanej nazwy produktu do nagłówka
    let prodName = meta.productName;
    if (!prodName || prodName === "PRODUKT CHEMICZNY" || prodName.trim().length === 0) {
      if (sdsData.productName && sdsData.productName !== "PRODUKT CHEMICZNY") {
        prodName = sdsData.productName;
      } else {
        const sec11 = sdsData.sections?.['1']?.['1.1'] || '';
        const nameMatch = sec11.match(/Nazwa handlowa:\s*([^.\n]+)/i);
        if (nameMatch) {
          prodName = nameMatch[1].trim();
        } else {
          prodName = "KARTA CHARAKTERYSTYKI PRODUKTU";
        }
      }
    }

    const versionStr = meta.version || "1.0 PL";
    const distributorStr = meta.distributor || "ITALLUX Sp. z o.o., ul. Wesoła 16, 63-600 Kępno";

    // 1. NAGŁÓWEK TYTUŁOWY DOKUMENTU NA PIERWSZEJ STRONIE (Wzór SANDALO 1:1)
    docChildren.push(new Paragraph({
      children: [
        new TextRun({
          text: "KARTA CHARAKTERYSTYKI",
          bold: true,
          size: 28, // 14pt (dokładna wysokość z SANDALO)
          font: "Arial",
          color: "000000"
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
          color: "444444"
        })
      ],
      spacing: { after: 180 }
    }));

    // 2. TABELA METADANYCH (Układ 2-kolumnowy z karty SANDALO 1:1)
    const metaBorders = {
      top: { color: "00A651", space: 4, value: BorderStyle.SINGLE, size: 12 },
      bottom: { color: "00A651", space: 4, value: BorderStyle.SINGLE, size: 12 },
      left: { value: BorderStyle.NONE },
      right: { value: BorderStyle.NONE },
      insideHorizontal: { value: BorderStyle.NONE },
      insideVertical: { value: BorderStyle.NONE }
    };

    const compDate = meta.compilationDate || "17.09.2026";
    const revDate = meta.revisionDate || "Nie dotyczy";
    const replRev = meta.replacedRevision || "Brak (wydanie pierwsze w języku polskim)";

    const metaRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Data sporządzenia: ", bold: true, size: 17, font: "Arial" }),
                  new TextRun({ text: compDate, size: 17, font: "Arial" })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Wersja: ", bold: true, size: 17, font: "Arial" }),
                  new TextRun({ text: versionStr, size: 17, font: "Arial" })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Aktualizacja: ", bold: true, size: 17, font: "Arial" }),
                  new TextRun({ text: revDate, size: 17, font: "Arial" })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Zastępuje wersję: ", bold: true, size: 17, font: "Arial" }),
                  new TextRun({ text: replRev, size: 17, font: "Arial" })
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

      // Nagłówek główny sekcji ze szmaragdową linią (#00A651)
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

      // Renderowanie dedykowanych sekcji o unikalnej strukturze
      if (secNum === 1) {
        await this.renderSection1(docChildren, secData, sdsData);
      } else if (secNum === 2) {
        await this.renderSection2(docChildren, secData, sdsData);
      } else if (secNum === 3) {
        await this.renderSection3(docChildren, secData, sdsData);
      } else if (secNum === 4) {
        await this.renderSection4(docChildren, secData, sdsData);
      } else if (secNum === 8) {
        await this.renderSection8(docChildren, secData, sdsData);
      } else if (secNum === 11) {
        await this.renderSection11(docChildren, secData, sdsData);
      } else if (secNum === 14) {
        await this.renderSection14(docChildren, secData, sdsData);
      } else if (secNum === 16) {
        await this.renderSection16(docChildren, secData, sdsData);
      } else {
        await this.renderStandardSection(docChildren, secNum, secData, sdsData);
      }
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
   * Renderuje Sekcję 1 (SANDALO 1:1)
   */
  static async renderSection1(docChildren, secData, sdsData) {
    // 1.1. Identyfikator produktu
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["1.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    const raw11 = secData["1.1"] || "";
    let prodName = sdsData.metadata?.productName || "";
    let prodCode = sdsData.metadata?.tradeCode || "";
    let ufi = sdsData.metadata?.ufi || "";

    const nameMatch = raw11.match(/Nazwa handlowa:\s*([^.\n]+)/i);
    if (nameMatch) prodName = nameMatch[1].trim();
    const codeMatch = raw11.match(/Kod (?:produktu|handlowy):\s*([^.\n]+)/i);
    if (codeMatch) prodCode = codeMatch[1].trim();
    const ufiMatch = raw11.match(/UFI:\s*([^.\n]+)/i);
    if (ufiMatch) ufi = ufiMatch[1].trim();

    if (prodName) {
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: "Nazwa handlowa: ", bold: true, size: 19, font: "Arial" }),
          new TextRun({ text: prodName, size: 19, font: "Arial" })
        ],
        spacing: { after: 50 }
      }));
    }
    if (prodCode) {
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: "Kod produktu: ", bold: true, size: 19, font: "Arial" }),
          new TextRun({ text: prodCode, size: 19, font: "Arial" })
        ],
        spacing: { after: 50 }
      }));
    }
    if (ufi) {
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: "UFI: ", bold: true, size: 19, font: "Arial" }),
          new TextRun({ text: ufi, size: 19, font: "Arial" })
        ],
        spacing: { after: 80 }
      }));
    }

    // 1.2. Zastosowania
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["1.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const raw12 = secData["1.2"] || "";
    const clean12 = raw12.replace(/^1\.2\.[^\n]*\n?/i, '').replace(/^Istotne zidentyfikowane zastosowania[^\n:]*:\s*/i, '').trim();
    this.renderFormattedParagraphs(docChildren, clean12, "1.2");

    // 1.3. Dostawca karty charakterystyki
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["1.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Firma: ", bold: true, size: 19, font: "Arial" }), new TextRun({ text: "ITALLUX Sp. z o.o.", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Adres: ", bold: true, size: 19, font: "Arial" }), new TextRun({ text: "ul. Wesoła 16, 63-600 Kępno", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Strona www: ", bold: true, size: 19, font: "Arial" }), new TextRun({ text: "www.prostozwloch.com.pl", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "E-mail: ", bold: true, size: 19, font: "Arial" }), new TextRun({ text: "kontakt@prostozwloch.com.pl", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Telefon: ", bold: true, size: 19, font: "Arial" }), new TextRun({ text: "+48 663116607", size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));

    // 1.4. Numery telefonów alarmowych
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["1.4"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ text: "Telefon alarmowy przedsiębiorstwa: ", bold: true, size: 19, font: "Arial" }),
        new TextRun({ text: "+48 663116607 (czynny od poniedziałku do piątku w godzinach 8:00 – 16:00, informacja udzielana w języku polskim)", size: 19, font: "Arial" })
      ],
      spacing: { after: 60 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Informacja toksykologiczna w Polsce (organ doradczy):", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 60, after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ text: "Krajowe Centrum Informacji Toksykologicznej (Instytut Medycyny Pracy im. prof. J. Nofera w Łodzi): ", bold: true, size: 19, font: "Arial" }),
        new TextRun({ text: "tel. +48 42 631 47 24, +48 42 631 47 25 (czynne w dni robocze w godz. 7:00 – 15:00)", size: 19, font: "Arial" })
      ],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ text: "Ośrodek Informacji Toksykologicznej w Warszawie (całodobowa informacja toksykologiczna 24/7): ", bold: true, size: 19, font: "Arial" }),
        new TextRun({ text: "tel. +48 22 619 66 54", size: 19, font: "Arial" })
      ],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ text: "Ogólne telefony ratunkowe w nagłych wypadkach: ", bold: true, size: 19, font: "Arial" }),
        new TextRun({ text: "112 (ogólnoeuropejski numer alarmowy), 998 (straż pożarna), 999 (pogotowie ratunkowe)", size: 19, font: "Arial" })
      ],
      spacing: { after: 100 }
    }));
  }

  /**
   * Renderuje Sekcję 2 (SANDALO 1:1)
   */
  static async renderSection2(docChildren, secData, sdsData) {
    // 2.1. Klasyfikacja substancji lub mieszaniny
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["2.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const raw21 = secData["2.1"] || "";
    const clean21 = raw21.replace(/^2\.1\.[^\n]*\n?/i, '').replace(/^Klasyfikacja substancji[^\n:]*:\s*/i, '').trim();
    this.renderFormattedParagraphs(docChildren, clean21, "2.1");

    // 2.2. Elementy oznakowania
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["2.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    // Piktogramy i hasło
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze:", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));

    const pictograms = sdsData.classification?.pictograms || [];
    if (pictograms.length > 0) {
      const imageRuns = [];
      for (const code of pictograms) {
        try {
          const pBuffer = await GHSPictogramGenerator.generatePictogramBuffer(code, 180);
          if (pBuffer) {
            imageRuns.push(new ImageRun({ data: pBuffer, transformation: { width: 75, height: 75 } }));
          }
        } catch (err) {
          console.warn(`[SDSDocxBuilder] Błąd piktogramu ${code}:`, err.message);
        }
      }
      if (imageRuns.length > 0) {
        docChildren.push(new Paragraph({ children: imageRuns, spacing: { before: 60, after: 80 } }));
      }
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Brak.", size: 19, font: "Arial" })],
        spacing: { after: 60 }
      }));
    }

    const signalWord = sdsData.classification?.signalWord || "";
    if (signalWord && signalWord !== "Brak hasła ostrzegawczego" && signalWord !== "Brak") {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: signalWord, bold: true, size: 19, font: "Arial" })],
        spacing: { before: 40, after: 80 }
      }));
    }

    // Nazwy niebezpiecznych substancji wymienione na etykiecie
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Nazwy niebezpiecznych substancji wymienione na etykiecie", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));
    const raw22 = secData["2.2"] || "";
    const labelMatch = raw22.match(/Zawiera\s*([^.]+)\./i);
    let allergenNames = "";
    if (labelMatch) {
      allergenNames = labelMatch[1].trim();
    } else if (sdsData.components && sdsData.components.length > 0) {
      allergenNames = sdsData.components.map(c => c.namePl).join(', ');
    } else {
      allergenNames = "Brak.";
    }
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: allergenNames, size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));

    // Zwroty wskazujące rodzaj zagrożenia
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Zwroty wskazujące rodzaj zagrożenia", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));
    const hPhrases = sdsData.classification?.hPhrases || [];
    if (hPhrases.length > 0) {
      for (const h of hPhrases) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: h, size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Brak.", size: 19, font: "Arial" })],
        spacing: { after: 60 }
      }));
    }

    // Zwroty wskazujące środki ostrożności
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Zwroty wskazujące środki ostrożności", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));
    const pPhrases = sdsData.classification?.pPhrases || [];
    if (pPhrases.length > 0) {
      for (const p of pPhrases) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: p, size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else {
      // Wyciągnij zwroty P z tekstu 2.2
      const foundP = raw22.match(/P\d{3}[^.]*\./gi);
      if (foundP && foundP.length > 0) {
        for (const p of foundP) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: p.trim(), size: 19, font: "Arial" })],
            spacing: { after: 50 }
          }));
        }
      } else {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: "Brak.", size: 19, font: "Arial" })],
          spacing: { after: 60 }
        }));
      }
    }

    // Informacje uzupełniające (EUH208 itp.)
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Informacje uzupełniające", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));
    const euhMatch = raw22.match(/EUH\d{3}[^.]*\./gi);
    if (euhMatch && euhMatch.length > 0) {
      for (const e of euhMatch) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: e.trim(), size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else if (sdsData.classification?.supplemental && sdsData.classification.supplemental.length > 0) {
      for (const s of sdsData.classification.supplemental) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: s, size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Brak.", size: 19, font: "Arial" })],
        spacing: { after: 60 }
      }));
    }

    // 2.3. Inne zagrożenia
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["2.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const raw23 = secData["2.3"] || "";
    const clean23 = raw23.replace(/^2\.3\.[^\n]*\n?/i, '').replace(/^Inne zagrożenia:\s*/i, '').trim();
    this.renderFormattedParagraphs(docChildren, clean23 || "Brak innych zagrożeń. Mieszanina nie zawiera substancji spełniających kryteria PBT lub vPvB zgodnie z załącznikiem XIII do rozporządzenia REACH ani substancji zaburzających gospodarkę hormonalną w stężeniu ≥ 0,1%.", "2.3");
  }

  /**
   * Renderuje Sekcję 3 (SANDALO 1:1)
   */
  static async renderSection3(docChildren, secData, sdsData) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["3.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 160, after: 60 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: secData["3.1"] || "Nie dotyczy.", size: 19, font: "Arial" })],
      spacing: { after: 120 }
    }));

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

        const clpParagraphs = [
          new Paragraph({
            children: [new TextRun({ text: comp.clp || "Brak klasyfikacji", size: 17, font: "Arial" })],
            spacing: { after: 40 }
          })
        ];

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
   * Renderuje Sekcję 4 (SANDALO 1:1)
   */
  static async renderSection4(docChildren, secData, sdsData) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["4.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki. W przypadku cięższych objawów wezwać natychmiast pomoc medyczną.", size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));

    const raw41 = secData["4.1"] || "";
    const routes = [
      { key: "W kontakcie ze skórą:", pattern: /(?:W kontakcie ze skórą|po kontakcie ze skórą|kontakt ze skórą):\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "W kontakcie z oczami:", pattern: /(?:W kontakcie z oczami|po kontakcie z oczami|kontakt z oczami):\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "W przypadku spożycia:", pattern: /(?:W przypadku spożycia|połknięcie|spożycie):\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Po narażeniu drogą oddechową:", pattern: /(?:Po narażeniu drogą oddechową|w przypadku wdychania|wdychanie):\s*([^.\n]+(?:\.[^.\n]+)*)/i }
    ];

    for (const r of routes) {
      const match = raw41.match(r.pattern);
      if (match) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: r.key, bold: true, size: 19, font: "Arial" })],
          spacing: { before: 60, after: 40 }
        }));
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: match[1].trim(), size: 19, font: "Arial" })],
          spacing: { after: 70 }
        }));
      }
    }

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["4.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["4.2"] || "Brak specyficznych objawów i skutków wywoływanych przez produkt w normalnych warunkach stosowania.", "4.2");

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["4.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["4.3"] || "Leczenie: brak dostępnych danych. Postępować objawowo.", "4.3");
  }

  /**
   * Renderuje Sekcję 8 (SANDALO 1:1)
   */
  static async renderSection8(docChildren, secData, sdsData) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["8.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["8.1"] || "Brak ustalonych dopuszczalnych stężeń.", "8.1");

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["8.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    const raw82 = secData["8.2"] || "";
    const ppeItems = [
      { key: "Ochrona oczu lub twarzy:", label: "Ochrona oczu lub twarzy:", pattern: /Ochrona oczu(?: lub twarzy)?:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Ochrona rąk:", label: "Ochrona rąk:", pattern: /Ochrona rąk:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Ochrona skóry:", label: "Ochrona skóry:", pattern: /Ochrona skóry:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Ochrona dróg oddechowych:", label: "Ochrona dróg oddechowych:", pattern: /Ochrona dróg oddechowych:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Zagrożenia termiczne:", label: "Zagrożenia termiczne:", pattern: /Zagrożenia termiczne:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { key: "Kontrola narażenia środowiska:", label: "Kontrola narażenia środowiska:", pattern: /(?:Kontrola narażenia środowiska|Środowiskowa kontrola narażenia):\s*([^.\n]+(?:\.[^.\n]+)*)/i }
    ];

    let foundPpe = false;
    for (const ppe of ppeItems) {
      const match = raw82.match(ppe.pattern);
      if (match) {
        foundPpe = true;
        docChildren.push(new Paragraph({
          children: [
            new TextRun({ text: ppe.label + " ", bold: true, size: 19, font: "Arial" }),
            new TextRun({ text: match[1].trim(), size: 19, font: "Arial" })
          ],
          spacing: { after: 60 }
        }));
      }
    }

    if (!foundPpe) {
      this.renderFormattedParagraphs(docChildren, raw82, "8.2");
    }
  }

  /**
   * Renderuje Sekcję 11 (SANDALO 1:1)
   */
  static async renderSection11(docChildren, secData, sdsData) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["11.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "W przypadku braku danych doświadczalnych dla samego produktu, zagrożenia dla zdrowia ocenia się na podstawie właściwości substancji w nim zawartych, stosując kryteria określone w odpowiednich przepisach dotyczących klasyfikacji.", size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));

    const raw111 = secData["11.1"] || "";
    this.renderFormattedParagraphs(docChildren, raw111, "11.1");

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["11.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["11.2"] || "Brak właściwości zaburzających funkcjonowanie układu hormonalnego w stężeniu ≥ 0,1%.", "11.2");
  }

  /**
   * Renderuje Sekcję 14 (SANDALO 1:1)
   */
  static async renderSection14(docChildren, secData, sdsData) {
    const transport = sdsData.transport || {};
    const keys = ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7"];

    for (const subKey of keys) {
      const content = secData[subKey] || "";
      this.renderSubSectionHeader(docChildren, subKey, content);

      if (subKey === "14.3" && transport.isRegulated && transport.class && transport.class !== "Nie dotyczy") {
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
            console.warn(`[SDSDocxBuilder] Błąd nalepki ADR:`, err.message);
          }
        }
      }

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
          console.warn(`[SDSDocxBuilder] Błąd LQ:`, lqErr.message);
        }
      }

      this.renderFormattedParagraphs(docChildren, content, subKey);
    }
  }

  /**
   * Renderuje Sekcję 16 (SANDALO 1:1)
   */
  static async renderSection16(docChildren, secData, sdsData) {
    const raw16 = secData["16.1"] || secData["16"] || "";
    this.renderFormattedParagraphs(docChildren, raw16, "16");
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
          color: "000000"
        })
      ],
      spacing: { before: 180, after: 80 }
    }));
  }

  /**
   * Sprawdza czy dany wiersz tekstu nie powiela tytułu podsekcji (np. z lub bez numeru, z dwukropkiem itp.)
   * i zwraca oczyszczony ciąg znaków lub null, jeśli cała linia była echem tytułu.
   */
  static cleanSubsectionTitle(line, subKey) {
    if (!line || !subKey) return line;
    const offTitle = OFFICIAL_SUBSECTIONS_PL[subKey] || OFFICIAL_SUBSECTIONS_PL[`${subKey}.1`];
    if (!offTitle) return line;

    const noNum = offTitle.replace(/^\d+\.\d+\.?\s*/, '').trim();

    // Lista alternatywnych form gramatycznych i synonimów nagłówków podsekcji
    const candidates = [
      offTitle,
      noNum,
      noNum.replace(/\(-a\)/g, 'a'),
      noNum.replace(/\(-a\)/g, ''),
      noNum.replace(/zastosowanie\(-a\) końcowe/i, 'zastosowania końcowe'),
      noNum.replace(/zastosowanie\(-a\) końcowe/i, 'zastosowanie końcowe'),
      noNum.replace(/uniemożliwiające/i, 'zapobiegające'),
      noNum.replace(/zapobiegające/i, 'uniemożliwiające'),
      noNum.replace(/oraz zastosowania odradzane/i, '').trim(),
      noNum.replace(/oraz ich magazynowanie/i, '').trim()
    ];

    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // 1. Sprawdzenie czy cała linia jest powtórzeniem nagłówka podsekcji
    for (const cand of candidates) {
      const cLow = cand.toLowerCase().trim();
      if (!cLow) continue;
      if (
        lower === cLow ||
        lower === cLow + ':' ||
        lower === cLow + '.' ||
        lower === `${subKey.toLowerCase()}. ${cLow}` ||
        lower === `${subKey.toLowerCase()} ${cLow}` ||
        lower === `${subKey.toLowerCase()}.` ||
        lower === `${subKey.toLowerCase()}`
      ) {
        return null;
      }
    }

    // 2. Sprawdzenie czy linia zaczyna się od nagłówka (np. "Środki gaśnicze: Odpowiednie...")
    for (const cand of candidates) {
      const cLow = cand.toLowerCase().trim();
      if (cLow.length < 5) continue;
      const prefixes = [
        `${subKey.toLowerCase()}. ${cLow}`,
        `${subKey.toLowerCase()} ${cLow}`,
        cLow
      ];

      for (const prefix of prefixes) {
        if (lower.startsWith(prefix)) {
          const rest = trimmed.substring(prefix.length).replace(/^[:\.\-\s]+/, '').trim();
          if (!rest) return null;
          return rest;
        }
      }
    }

    return trimmed;
  }

  /**
   * Parsuje treść i tworzy elegancko sformatowane akapity z pogrubionymi etykietami
   */
  static renderFormattedParagraphs(docChildren, text, subKey = "") {
    if (!text) return;

    let rawLines = [];
    if (subKey === "9.1") {
      const splitPoints = text.split(/(?:;\s*|\n+|(?<=\.\s+))(?=[a-z]\)\s+)/i);
      for (const p of splitPoints) {
        if (p.trim()) rawLines.push(p.trim());
      }
    } else {
      const lineSplits = text.split('\n');
      for (const l of lineSplits) {
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

      // Usunięcie echa tytułu podsekcji
      if (subKey) {
        const cleaned = SDSDocxBuilder.cleanSubsectionTitle(line, subKey);
        if (!cleaned) continue;
        line = cleaned;
      }

      // Pominięcie linii separatorów tabeli Markdown (| --- | --- |)
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        continue;
      }

      // Jeśli linia to wiersz tabeli Markdown (| komórka 1 | komórka 2 |)
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (cells.length > 0) {
          line = cells.join(' — ');
        }
      }

      // Nagłówki pisane wersalikami w karcie SANDALO (np. TOKSYCZNOŚĆ OSTRA, ODPOWIEDNIE ŚRODKI GAŚNICZE)
      if (/^[A-ZĄĆĘŁŃÓŚŹŻ\s\(\)\/\-]{4,}:?$/.test(line) && line.length < 80) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line, bold: true, size: 19, font: "Arial", color: "000000" })],
          spacing: { before: 120, after: 60 }
        }));
        continue;
      }

      // Sprawdzenie czy linia to klucz z dwukropkiem (np. "Stan skupienia: Ciecz", "pH: 2,5")
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0 && colonIndex < 80 && !line.startsWith('http')) {
        const keyPart = line.substring(0, colonIndex + 1);
        const valPart = line.substring(colonIndex + 1);

        docChildren.push(new Paragraph({
          children: [
            new TextRun({ text: keyPart + " ", bold: true, size: 19, font: "Arial", color: "000000" }),
            new TextRun({ text: valPart.trim(), size: 19, font: "Arial", color: "1F2937" })
          ],
          spacing: { after: 50 }
        }));
      } else if (/^[-*•]\s+/.test(line)) {
        const cleanBullet = line.replace(/^[-*•]\s+/, '');
        const bColonIndex = cleanBullet.indexOf(':');
        if (bColonIndex > 0 && bColonIndex < 60) {
          const bKey = cleanBullet.substring(0, bColonIndex + 1);
          const bVal = cleanBullet.substring(bColonIndex + 1);
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: "- ", bold: true, size: 19, font: "Arial" }),
              new TextRun({ text: bKey + " ", bold: true, size: 19, font: "Arial" }),
              new TextRun({ text: bVal.trim(), size: 19, font: "Arial" })
            ],
            spacing: { after: 40 }
          }));
        } else {
          docChildren.push(new Paragraph({
            children: [
              new TextRun({ text: "- ", bold: true, size: 19, font: "Arial" }),
              new TextRun({ text: cleanBullet, size: 19, font: "Arial" })
            ],
            spacing: { after: 40 }
          }));
        }
      } else {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: line, size: 19, font: "Arial" })],
          spacing: { after: 60 }
        }));
      }
    }
  }
}

module.exports = { SDSDocxBuilder, SECTION_TITLES_PL, OFFICIAL_SUBSECTIONS_PL };
