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
const { LocalKnowledgeConnector } = require('./engine/extractors/local.knowledge.connector');
const localKnowledge = new LocalKnowledgeConnector();

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
  "9.2.1": "9.2.1. Informacje dotyczące klas zagrożenia fizycznego",
  "9.2.2": "9.2.2. Inne właściwości bezpieczeństwa",
  "10.1": "10.1. Reaktywność",
  "10.2": "10.2. Stabilność chemiczna",
  "10.3": "10.3. Możliwość występowania niebezpiecznych reakcji",
  "10.4": "10.4. Warunki, których należy unikać",
  "10.5": "10.5. Materiały niezgodne",
  "10.6": "10.6. Niebezpieczne produkty rozkładu",
  "11.1": "11.1. Informacje na temat klas zagrożenia zdefiniowanych w rozporządzeniu (WE) nr 1272/2008",
  "11.2": "11.2. Informacje o innych zagrożeniach",
  "11.2.1": "11.2.1. Właściwości zaburzające funkcjonowanie układu hormonalnego",
  "11.2.2": "11.2.2. Inne informacje",
  "12.1": "12.1. Toksyczność",
  "12.2": "12.2. Trwałość i zdolność do rozkładu",
  "12.3": "12.3. Zdolność do bioakumulacji",
  "12.4": "12.4. Mobilność w glebie",
  "12.5": "12.5. Wyniki oceny właściwości PBT, vPvB, PMT i vPvM",
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

    // Pobranie oryginalnej daty z obcej karty by wstawić ją do fallbacku
    const originalSdsDate = meta.compilationDate || "brak danych";
    // Data polskiej wersji (obecna chyba że nadpisano)
    const polCompilationDate = sdsData.compilationDate || new Date().toLocaleDateString('pl-PL');
    
    const revDate = meta.revisionDate || "Nie dotyczy";
    
    let replRev = meta.replacedRevision || "";
    if (!replRev || replRev.toLowerCase().includes('brak') || replRev.toLowerCase().includes('none') || replRev.toLowerCase().includes('nessun') || replRev === "Nie dotyczy") {
        replRev = `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia ${originalSdsDate})`;
    }
    
    const textColor = "0A4027"; // Ciemnozielony kolor tekstu
    const bgColor = "F9FAFB"; // Jasnoszare tło tabeli

    const metaRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Data sporządzenia: ", bold: true, size: 17, font: "Arial", color: textColor }),
                  new TextRun({ text: polCompilationDate, size: 17, font: "Arial", color: textColor })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 40, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Wersja: ", bold: true, size: 17, font: "Arial", color: textColor }),
                  new TextRun({ text: versionStr, size: 17, font: "Arial", color: textColor })
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
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Aktualizacja: ", bold: true, size: 17, font: "Arial", color: textColor }),
                  new TextRun({ text: revDate, size: 17, font: "Arial", color: textColor })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 4800, type: WidthType.DXA },
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            margins: { top: 40, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Zastępuje wersję: ", bold: true, size: 17, font: "Arial", color: textColor }),
                  new TextRun({ text: replRev, size: 17, font: "Arial", color: textColor })
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
      } else if (secNum === 5) {
        await this.renderSection5(docChildren, secData, sdsData);
      } else if (secNum === 7) {
        await this.renderSection7(docChildren, secData, sdsData);
      } else if (secNum === 8) {
        await this.renderSection8(docChildren, secData, sdsData);
      } else if (secNum === 9) {
        await this.renderSection9(docChildren, secData, sdsData);
      } else if (secNum === 11) {
        await this.renderSection11(docChildren, secData, sdsData);
      } else if (secNum === 12) {
        await this.renderSection12(docChildren, secData, sdsData);
      } else if (secNum === 13) {
        await this.renderSection13(docChildren, secData, sdsData);
      } else if (secNum === 14) {
        await this.renderSection14(docChildren, secData, sdsData);
      } else if (secNum === 15) {
        await this.renderSection15(docChildren, secData, sdsData);
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
                    text: `KARTA CHARAKTERYSTYKI | ${prodName} ${versionStr}`,
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
   * Renderuje Sekcję 2 (Zgodność z CLP Art. 18 ust. 3, EUH208 CLP Załącznik III, REACH 2020/878 i Rozp. 2023/707)
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

    // Nazwy niebezpiecznych substancji wymienione na etykiecie (Art. 18 ust. 3 CLP)
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Nazwy niebezpiecznych substancji wymienione na etykiecie", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));
    
    // Reguła prawna Art. 18 ust. 3 CLP:
    // Jeżeli mieszanina nie jest sklasyfikowana jako stwarzająca zagrożenie (brak zwrotów H),
    // alergeny EUH208 NIE są wymieniane w tym polu jako substancje determinujące klasyfikację!
    const isHazardous = (sdsData.classification?.hPhrases && sdsData.classification.hPhrases.length > 0) ||
      (secData["2.1"] && !/nie jest sklasyfikowan|nie stwarza zagrożenia|brak klasyfikacji/i.test(secData["2.1"]) && /H\d{3}/i.test(secData["2.1"]));
    
    let allergenNames = "Nie dotyczy.";
    if (isHazardous) {
      const raw22 = secData["2.2"] || "";
      const labelMatch = raw22.match(/Zawiera:\s*([^.\n]+)/i);
      if (labelMatch) {
        allergenNames = labelMatch[1].trim();
      } else if (sdsData.components && sdsData.components.length > 0) {
        const hazComps = sdsData.components.filter(c => c.clp && !/brak|nie sklasyfikowan/i.test(c.clp) && !c.clp.startsWith('EUH'));
        allergenNames = hazComps.length > 0 ? hazComps.map(c => c.namePl).join(', ') : "Nie dotyczy.";
      }
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
    const raw22 = secData["2.2"] || "";
    const pPhrases = sdsData.classification?.pPhrases || [];
    if (pPhrases.length > 0) {
      for (const p of pPhrases) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: p, size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else {
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

    // Informacje uzupełniające (EUH208 itp. - BEZWZGLĘDNIE PEŁNE BRZMIENIE ZGODNE Z CLP ZAŁĄCZNIK III)
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Informacje uzupełniające", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 80, after: 60 }
    }));

    let euhEntries = [];
    if (Array.isArray(sdsData.classification?.supplemental) && sdsData.classification.supplemental.length > 0) {
      euhEntries.push(...sdsData.classification.supplemental);
    }
    const lines22 = raw22.split('\n');
    for (const line of lines22) {
      if (/EUH\d{2,3}/i.test(line)) {
        const cl = line.trim();
        if (!euhEntries.some(e => e.includes(cl.substring(0, 15)))) {
          euhEntries.push(cl);
        }
      }
    }
    // Wykrywanie substancji uczulających Skin Sens z sekcji 3 jako uniwersalny mechanizm
    const sensComps = (sdsData.components || []).filter(c => /Skin Sens|H317/i.test(c.clp || ''));
    if (sensComps.length > 0 && !euhEntries.some(e => /EUH208/i.test(e))) {
      const sensNames = sensComps.map(c => c.namePl.replace(/\s*\(ang\..*?\)/gi, '').trim()).join('; ');
      euhEntries.push(`EUH208 Zawiera ${sensNames}. Może powodować wystąpienie reakcji alergicznej.`);
    }

    // Normalizacja i twarda gwarancja pełnego zdania dla każdego EUH208 (CLP Załącznik III)
    const normalizedEuh = [];
    for (let e of euhEntries) {
      let t = e.replace(/\s+/g, ' ').trim();
      if (/EUH208/i.test(t)) {
        if (!t.startsWith('EUH208')) {
          t = 'EUH208 ' + t.replace(/^EUH208:?\s*/i, '');
        }
        if (!/Zawiera/i.test(t)) {
          t = t.replace(/^EUH208\s*:?\s*/i, 'EUH208 Zawiera ');
        }
        if (!/Może powodować wystąpienie reakcji alergicznej/i.test(t)) {
          t = t.replace(/[\.\s]+$/, '') + '. Może powodować wystąpienie reakcji alergicznej.';
        }
      }
      if (t && !normalizedEuh.includes(t)) {
        normalizedEuh.push(t);
      }
    }

    if (normalizedEuh.length > 0) {
      for (const ne of normalizedEuh) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: ne, size: 19, font: "Arial" })],
          spacing: { after: 50 }
        }));
      }
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Brak.", size: 19, font: "Arial" })],
        spacing: { after: 60 }
      }));
    }

    // 2.3. Inne zagrożenia (Rozdzielenie PBT/vPvB, PMT/vPvM oraz ED z odsyłaczami)
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["2.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    
    const hasGalaxolide = (sdsData.components || []).some(c => 
      /galaxolide|hhcb|1,3,4,6,7,8-heksahydro/i.test(c.namePl + ' ' + (c.nameEn || '') + ' ' + (c.cas || '')) || c.cas === '1222-05-5'
    );

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Kryteria PBT i vPvB: Mieszanina nie zawiera substancji spełniających kryteria dla substancji PBT lub vPvB zgodnie z załącznikiem XIII do rozporządzenia (WE) nr 1907/2006 (REACH) w stężeniu ≥ 0,1% wag.", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Kryteria PMT i vPvM: Mieszanina nie zawiera substancji spełniających kryteria dla substancji PMT lub vPvM zgodnie z rozporządzeniem delegowanym Komisji (UE) 2023/707 w stężeniu ≥ 0,1% wag.", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    if (hasGalaxolide) {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Właściwości zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera 1,3,4,6,7,8-heksahydro-4,6,6,7,8,8-heksametyloindeno[5,6-c]piran (Galaxolide, HHCB) umieszczony na Liście II (substancje poddawane ocenie pod kątem zaburzania gospodarki hormonalnej w środowisku). Szczegółowe informacje podano w podsekcjach 11.2 oraz 12.6.", size: 19, font: "Arial" })],
        spacing: { after: 80 }
      }));
    } else {
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: "Właściwości zaburzające funkcjonowanie układu hormonalnego: Mieszanina nie zawiera substancji o właściwościach zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu (UE) 2017/2100 lub rozporządzeniu (UE) 2018/605 w stężeniu ≥ 0,1% wag.", size: 19, font: "Arial" })],
        spacing: { after: 80 }
      }));
    }
  }

  /**
   * Renderuje Sekcję 3 (SANDALO 1:1 + Wstrzykiwanie ATE w komórkach tabeli CLP)
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

        // Dołączenie wartości ATE w kolumnie klasyfikacji CLP dla substancji z Acute Tox (np. masa poreakcyjna CMI/MIT CAS 55965-84-9)
        let clpText = comp.clp || "Brak klasyfikacji";
        if (/Acute Tox/i.test(clpText)) {
          if ((comp.cas === '55965-84-9' || /masa poreakcyjna 5-chloro/i.test(comp.namePl)) && !/ATE/i.test(clpText)) {
            clpText += '; ATE (droga pokarmowa) = 64 mg/kg mc.; ATE (na skórę) = 87,12 mg/kg mc.; ATE (inhalacyjnie, pyły/mgły) = 0,33 mg/l';
          }
        }

        const clpParagraphs = [
          new Paragraph({
            children: [new TextRun({ text: clpText, size: 17, font: "Arial" })],
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
   * Renderuje Sekcję 4 (SANDALO 1:1 + Dynamiczna dedukcja chemiczna objawów)
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
    
    // Dynamiczna dedukcja objawów z właściwości mieszaniny (pH i alergeny uczulające)
    let text42 = secData["4.2"] || "";
    if (!text42 || /brak specyficznych|brak danych|nie są znane/i.test(text42) || text42.length < 120) {
      text42 = `W kontakcie ze skórą: W przypadku dłuższego kontaktu możliwe lekkie podrażnienie lub zaczerwienienie. U osób szczególnie wrażliwych może wywołać miejscową reakcję alergiczną skóry (zaczerwienienie, świąd, pokrzywka).
W kontakcie z oczami: Bezpośrednie dostanie się do oczu może powodować przejściowe pieczenie, łzawienie i zaczerwienienie spojówek.
W przypadku spożycia: Może wywołać podrażnienie błon śluzowych jamy ustnej i przewodu pokarmowego, ból brzucha, nudności.
Po narażeniu drogą oddechową: W normalnych warunkach stosowania brak negatywnych skutków. Wdychanie rozpylonej mgły lub aerozolu może wywołać przejściowe kichanie, kaszel i podrażnienie górnych dróg oddechowych.`;
    }
    this.renderFormattedParagraphs(docChildren, text42, "4.2");

    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["4.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["4.3"] || "Leczenie objawowe. W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik, etykietę lub niniejszą kartę charakterystyki.", "4.3");
  }

  /**
   * Renderuje Sekcję 5 (Terminologia chemiczna ditlenek węgla CO2 oraz normy strażackie PN-EN)
   */
  static async renderSection5(docChildren, secData, sdsData) {
    // 5.1. Środki gaśnicze
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["5.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    let text51 = secData["5.1"] || "";
    text51 = text51.replace(/dwutlenek węgla/gi, 'ditlenek węgla (CO2)');
    text51 = text51.replace(/gaśnica śniegowa \(CO2\)/gi, 'ditlenek węgla (CO2)');
    if (!text51 || text51.length < 20 || !text51.includes('ditlenek węgla')) {
      text51 = `Odpowiednie środki gaśnicze: Piana gaśnicza, ditlenek węgla (CO2), proszek gaśniczy, rozpylony strumień wody.
Niewłaściwe środki gaśnicze: Zwarty strumień wody – ryzyko rozprzestrzenienia pożaru.`;
    }
    this.renderFormattedParagraphs(docChildren, text51, "5.1");

    // 5.2. Szczególne zagrożenia
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["5.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const text52 = secData["5.2"] || "W trakcie spalania mogą wydzielać się niebezpieczne gazy pożarowe, w tym tlenki węgla (CO, CO2) oraz inne toksyczne produkty rozkładu termicznego. Unikać wdychania dymów i par pożarowych.";
    this.renderFormattedParagraphs(docChildren, text52, "5.2");

    // 5.3. Informacje dla straży pożarnej
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["5.3"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    let text53 = secData["5.3"] || "";
    if (!text53 || !text53.includes('PN-EN 469')) {
      text53 = `Środki ochrony strażaków: Stosować kompletne ubranie ochronne dla strażaków zgodne z normą PN-EN 469, rękawice ochronne (PN-EN 659) oraz autonomiczny aparat oddechowy o dodatnim ciśnieniu (PN-EN 137).
Dodatkowe wskazówki: Schładzać zagrożone pojemniki rozpylonym strumieniem wody z bezpiecznej odległości. Nie dopuścić do przedostania się wód pogaszeniowych do kanalizacji, wód powierzchniowych ani gruntowych.`;
    }
    this.renderFormattedParagraphs(docChildren, text53, "5.3");
  }

  /**
   * Renderuje Sekcję 7 (Magazynowanie i manipulowanie, zakaz TRGS/WGK, obligatoryjny zakaz sprężonego powietrza)
   */
  static async renderSection7(docChildren, secData, sdsData) {
    const sub71 = OFFICIAL_SUBSECTIONS_PL["7.1"] || "7.1. Środki ostrożności dotyczące bezpiecznego postępowania";
    const sub72 = OFFICIAL_SUBSECTIONS_PL["7.2"] || "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności";
    const sub73 = OFFICIAL_SUBSECTIONS_PL["7.3"] || "7.3. Szczególne zastosowanie(-a) końcowe";

    let text71 = secData["7.1"] || secData["7"] || "";
    let text72 = secData["7.2"] || "";
    let text73 = secData["7.3"] || "Brak szczególnych zaleceń poza wymienionymi w podsekcji 1.2.";

    const clean7 = (t) => t
      .replace(/(?:^|\n)[ \t]*(?:Storage\s+class\s+)?(?:TRGS\s*510(?:\s*\([^\)]*\))?|Lagerklasse\s*(?:TRGS\s*510)?|Klasa\s+składowania\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?|Klasa\s+magazynowa\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?)[^\n]*/gi, '')
      .replace(/(?:^|\n)[ \t]*(?:WGK\b|Wassergefährdungsklasse|Klasa\s+zagrożenia\s+wód\s+WGK)[^\n]*/gi, '')
      // Usunięcie wycieku meta-instrukcji RAG o „zakazie powielania niemieckich norm"
      .replace(/[^\n.]*?(?:CAŁKOWITY\s+ZAKAZ|całkowity\s+zakaz|ZAKAZ)[^\n.]*?niemieckich\s+norm[^\n.]*\.?/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    text71 = clean7(text71);
    text72 = clean7(text72);

    if (!/sprężon(?:ego|ym)\s+powietrz(?:a|em)/i.test(text71)) {
      const airNotice = "Zabrania się stosowania sprężonego powietrza do napełniania, opróżniania, przetłaczania lub manipulowania produktem (ryzyko powstawania niebezpiecznych aerozoli i wyładowań elektrostatycznych).";
      text71 = text71 ? `${text71}\n${airNotice}` : `Zapewnić odpowiednią wentylację ogólną i miejscową. Nie jeść, nie pić i nie palić podczas pracy. ${airNotice}`;
    }

    // 7.1
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: sub71, bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, text71, "7.1");

    // 7.2
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: sub72, bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    if (!text72) {
      text72 = "Przechowywać wyłącznie w oryginalnych, szczelnie zamkniętych opakowaniach, w chłodnym, suchym i dobrze wentylowanym miejscu. Chronić przed bezpośrednim działaniem promieni słonecznych, ciepła i źródeł zapłonu. Stosować nienasiąkliwe posadzki chemoodporne.";
    }
    this.renderFormattedParagraphs(docChildren, text72, "7.2");

    // 7.3
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: sub73, bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, text73, "7.3");
  }

  /**
   * Renderuje Sekcję 8 (Klauzula DNEL/PNEC oraz rozbicie ŚOI konsument vs przemysł)
   */
  static async renderSection8(docChildren, secData, sdsData) {
    // 8.1. Parametry dotyczące kontroli
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["8.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    
    let text81 = secData["8.1"] || "";
    if (!text81.includes("Wartości DNEL") && !text81.includes("PNEC")) {
      text81 += (text81 ? "\n\n" : "") + "Wartości DNEL (Pochodny poziom niepowodujący zmian) i PNEC (Przewidywane stężenie niepowodujące zmian w środowisku):\nDla mieszaniny oraz substancji składowych nie oznaczono wartości DNEL oraz PNEC.";
    }
    this.renderFormattedParagraphs(docChildren, text81, "8.1");

    // 8.2. Kontrola narażenia
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["8.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    const raw82 = secData["8.2"] || "";
    
    // Ochrona konsumencka vs przemysłowa
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Stosowne techniczne środki kontroli: Zapewnić odpowiednią wentylację ogólną pomieszczeń.", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Indywidualne środki ochrony (zastosowanie konsumenckie): W warunkach normalnego stosowania konsumenckiego zgodnie z przeznaczeniem nie jest wymagane stosowanie indywidualnych środków ochrony.", size: 19, font: "Arial" })],
      spacing: { after: 50 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: "Indywidualne środki ochrony (sektor przemysłowy / usuwanie awarii):", bold: true, size: 19, font: "Arial" })],
      spacing: { before: 40, after: 50 }
    }));

    const ppeItems = [
      { label: "Ochrona oczu lub twarzy:", defaultVal: "W warunkach przemysłowych lub przy ryzyku rozchlapania: okulary ochronne lub gogle (PN-EN 166).", pattern: /Ochrona oczu(?: lub twarzy)?:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { label: "Ochrona rąk:", defaultVal: "W przypadku przedłużającego się lub bezpośredniego kontaktu: rękawice ochronne odporne na działanie chemikaliów (PN-EN ISO 374-1, np. kauczuk nitrylowy, neopren). Czas przebicia > 480 min.", pattern: /Ochrona rąk:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { label: "Ochrona skóry i ciała:", defaultVal: "Standardowa odzież robocza dostosowana do poziomu narażenia.", pattern: /Ochrona skóry(?:\s*i ciała)?:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { label: "Ochrona dróg oddechowych:", defaultVal: "W normalnych warunkach niepotrzebna. W przypadku niewystarczającej wentylacji lub powstawania aerozoli: aparat oddechowy z filtropochłaniaczem typu A-P2 (PN-EN 14387).", pattern: /Ochrona dróg oddechowych:\s*([^.\n]+(?:\.[^.\n]+)*)/i },
      { label: "Zagrożenia termiczne:", defaultVal: "Nie dotyczy.", pattern: /Zagrożenia termiczne:\s*([^.\n]+(?:\.[^.\n]+)*)/i }
    ];

    for (const ppe of ppeItems) {
      const match = raw82.match(ppe.pattern);
      const val = match ? match[1].trim() : ppe.defaultVal;
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: ppe.label + " ", bold: true, size: 19, font: "Arial" }),
          new TextRun({ text: val, size: 19, font: "Arial" })
        ],
        spacing: { after: 50 }
      }));
    }

    // Kontrola narażenia środowiska - BEZWZGLĘDNIE NIE MOŻE BYĆ "Nie dotyczy."
    docChildren.push(new Paragraph({
      children: [
        new TextRun({ text: "Kontrola narażenia środowiska: ", bold: true, size: 19, font: "Arial" }),
        new TextRun({ text: "Nie dopuścić do przedostania się dużych ilości produktu do kanalizacji, wód powierzchniowych ani gruntowych.", size: 19, font: "Arial" })
      ],
      spacing: { before: 40, after: 80 }
    }));
  }

  /**
   * Renderuje Sekcję 9 (Podział na 9.1 tabela a-s oraz 9.2.1/9.2.2)
   */
  static async renderSection9(docChildren, secData, sdsData) {
    // 9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["9.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const raw91 = secData["9.1"] || "";
    this.renderFormattedParagraphs(docChildren, raw91, "9.1");

    // 9.2. Inne informacje
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["9.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    // 9.2.1. Informacje dotyczące klas zagrożenia fizycznego
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["9.2.1"], bold: true, size: 19, font: "Arial" })],
      spacing: { before: 60, after: 40 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: secData["9.2.1"] || "Brak dodatkowych danych badawczych. Mieszanina nie wykazuje dodatkowych zagrożeń fizycznych.", size: 19, font: "Arial" })],
      spacing: { after: 60 }
    }));

    // 9.2.2. Inne właściwości bezpieczeństwa
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["9.2.2"], bold: true, size: 19, font: "Arial" })],
      spacing: { before: 60, after: 40 }
    }));
    let vocText = secData["9.2.2"] || "";
    if (!vocText || /brak danych/i.test(vocText) || !/%/i.test(vocText)) {
      vocText = localKnowledge.calculateVocContent(sdsData.components || [], secData["9.1"] || "");
    }
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: vocText, size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));
  }

  /**
   * Renderuje Sekcję 11 (Podział na 11.1 oraz 11.2.1 ED i 11.2.2 Inne)
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

    const hasGalaxolide = (sdsData.components || []).some(c => 
      /galaxolide|hhcb|1,3,4,6,7,8-heksahydro/i.test(c.namePl + ' ' + (c.nameEn || '') + ' ' + (c.cas || '')) || c.cas === '1222-05-5'
    );

    // 11.2.1. Właściwości zaburzające funkcjonowanie układu hormonalnego
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["11.2.1"], bold: true, size: 19, font: "Arial" })],
      spacing: { before: 60, after: 40 }
    }));
    let ed11Text = secData["11.2.1"] || "";
    if (!ed11Text) {
      if (hasGalaxolide) {
        ed11Text = "Produkt zawiera substancję 1,3,4,6,7,8-heksahydro-4,6,6,7,8,8-heksametyloindeno[5,6-c]piran (Galaxolide, HHCB) umieszczoną na Liście II (substancje poddawane ocenie przez organy UE pod kątem zaburzania gospodarki hormonalnej). Żaden ze składników nie został formalnie zidentyfikowany jako substancja zaburzająca funkcjonowanie układu hormonalnego zgodnie z kryteriami rozporządzeń (UE) 2017/2100 lub (UE) 2018/605 w stężeniu ≥ 0,1%.";
      } else {
        ed11Text = "Mieszanina nie zawiera substancji zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami rozporządzeń (UE) 2017/2100 lub (UE) 2018/605 w stężeniu ≥ 0,1%.";
      }
    }
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: ed11Text, size: 19, font: "Arial" })],
      spacing: { after: 60 }
    }));

    // 11.2.2. Inne informacje
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["11.2.2"], bold: true, size: 19, font: "Arial" })],
      spacing: { before: 60, after: 40 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: secData["11.2.2"] || "Brak innych znanych zagrożeń dla zdrowia ludzkiego.", size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));
  }

  /**
   * Renderuje Sekcję 12 (12.5 PMT i vPvM oraz 12.6 Zaburzenia hormonalne w środowisku)
   */
  static async renderSection12(docChildren, secData, sdsData) {
    const keys = ["12.1", "12.2", "12.3", "12.4"];
    for (const subKey of keys) {
      const content = secData[subKey] || "";
      this.renderSubSectionHeader(docChildren, subKey, content);
      this.renderFormattedParagraphs(docChildren, content, subKey);
    }

    // 12.5. Wyniki oceny właściwości PBT, vPvB, PMT i vPvM
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["12.5"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    let pmtText = secData["12.5"] || "";
    if (!pmtText.includes("PMT") || !pmtText.includes("vPvM")) {
      pmtText = "Zgodnie z załącznikiem XIII do rozporządzenia (WE) nr 1907/2006 (REACH) mieszanina nie zawiera substancji ocenianych jako PBT (trwałe, wykazujące zdolność do bioakumulacji i toksyczne) lub vPvB (bardzo trwałe i wykazujące bardzo dużą zdolność do bioakumulacji) w stężeniu ≥ 0,1% wag.\nZgodnie z kryteriami rozporządzenia delegowanego Komisji (UE) 2023/707 mieszanina nie zawiera substancji spełniających kryteria PMT (trwałe, mobilne i toksyczne) ani vPvM (bardzo trwałe i bardzo mobilne) w stężeniu ≥ 0,1% wag.";
    }
    this.renderFormattedParagraphs(docChildren, pmtText, "12.5");

    // 12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["12.6"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    const hasGalaxolide = (sdsData.components || []).some(c => 
      /galaxolide|hhcb|1,3,4,6,7,8-heksahydro/i.test(c.namePl + ' ' + (c.nameEn || '') + ' ' + (c.cas || '')) || c.cas === '1222-05-5'
    );
    let ed12Text = secData["12.6"] || "";
    if (!ed12Text) {
      if (hasGalaxolide) {
        ed12Text = "Produkt zawiera 1,3,4,6,7,8-heksahydro-4,6,6,7,8,8-heksametyloindeno[5,6-c]piran (Galaxolide, HHCB) poddawany ocenie pod kątem zaburzania gospodarki hormonalnej w środowisku wodnym (Lista II).";
      } else {
        ed12Text = "Mieszanina nie zawiera substancji zaburzających funkcjonowanie układu hormonalnego w środowisku zgodnie z kryteriami rozporządzeń (UE) 2017/2100 lub (UE) 2018/605 w stężeniu ≥ 0,1%.";
      }
    }
    this.renderFormattedParagraphs(docChildren, ed12Text, "12.6");

    // 12.7. Inne szkodliwe skutki działania
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["12.7"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    this.renderFormattedParagraphs(docChildren, secData["12.7"] || "Brak innych znanych szkodliwych skutków dla środowiska naturalnego.", "12.7");
  }

  /**
   * Renderuje Sekcję 13 (Pełne 6-cyfrowe kody odpadów Dz.U. 2020 poz. 10)
   */
  static async renderSection13(docChildren, secData, sdsData) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["13.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    let wasteText = secData["13.1"] || "";
    if (!wasteText.includes("20 01 30") || !wasteText.includes("15 01 10*")) {
      wasteText = `Metody unieszkodliwiania odpadów:
Odzyskać, jeśli to możliwe. Nie wprowadzać do kanalizacji, wód powierzchniowych ani gruntowych. Likwidację pozostałości produktu oraz opakowań powierzać wyłącznie uprawnionym podmiotom posiadającym stosowne decyzje odpadowe (BDO).

Klasyfikacja i proponowane kody odpadów (Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów, Dz.U. 2020 poz. 10):
- Odpady z produktu (gospodarstwa domowe / konsumenci): 20 01 30 (Detergenty inne niż wymienione w 20 01 29).
- Odpady z produktu (sektor przemysłowy / czyszczenie instalacji): 16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05) lub 07 06 99 (Inne niewymienione odpady).
- Odpady opakowaniowe (oczyszczone, selektywna zbiórka tworzyw): 15 01 02 (Opakowania z tworzyw sztucznych).
- Odpady opakowaniowe (zanieczyszczone pozostałościami niebezpiecznymi): 15 01 10* (Opakowania zawierające pozostałości substancji niebezpiecznych lub nimi skażone).

Krajowe akty prawne:
- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).
- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).
- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).`;
    }

    this.renderFormattedParagraphs(docChildren, wasteText, "13.1");
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
   * Renderuje Sekcję 15 (Jednolita, niepowielona lista aktów prawnych, Rozp. 758/2013, rozdzielenie SVHC Art. 59 od Załącznika XIV)
   */
  static async renderSection15(docChildren, secData, sdsData) {
    // 15.1. Przepisy prawne
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["15.1"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));

    let legal151 = secData["15.1"] || "";
    if (!legal151 || legal151.includes('WGK') || legal151.includes('TRGS 510') || !legal151.includes('2019/1148')) {
      const isFlammable = Boolean(
        sdsData.classification?.hazardClasses?.some(c => /Flam/i.test(c)) ||
        sdsData.classification?.hPhrases?.some(h => /H22[456]/i.test(h))
      );
      legal151 = localKnowledge.lookupLegalActs({ isFlammable, isTattooProduct: false });
    }

    this.renderFormattedParagraphs(docChildren, legal151, "15.1");

    // 15.2. Ocena bezpieczeństwa chemicznego
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: OFFICIAL_SUBSECTIONS_PL["15.2"], bold: true, size: 20, font: "Arial" })],
      spacing: { before: 180, after: 80 }
    }));
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: secData["15.2"] || "Dla mieszaniny nie przeprowadzono oceny bezpieczeństwa chemicznego.", size: 19, font: "Arial" })],
      spacing: { after: 80 }
    }));
  }

  /**
   * Renderuje Sekcję 16 (SANDALO 1:1 + Gwarancja obecności definicji EUH208 w słowniku zwrotów)
   */
  static async renderSection16(docChildren, secData, sdsData) {
    let raw16 = secData["16.1"] || secData["16"] || "";
    
    // Wstrzyknięcie lub uzupełnienie urzędowej definicji EUH208
    const sec2 = sdsData.sections?.['2'] ? (typeof sdsData.sections['2'] === 'string' ? sdsData.sections['2'] : (sdsData.sections['2']['2.2'] || '')) : '';
    const sensComps = (sdsData.components || []).filter(c => /Skin Sens|H317/i.test(c.clp || ''));
    let allergenNames = "";
    if (sensComps.length > 0) {
      allergenNames = sensComps.map(c => c.namePl.replace(/\s*\(ang\..*?\)/gi, '').trim()).join(', ');
    } else {
      const m = sec2.match(/Zawiera\s*([^.]+?)(?:\.\s*Może|\.|$)/i);
      allergenNames = m ? m[1].replace(/\n+/g, ' ').trim() : "";
    }
    allergenNames = allergenNames.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
    if (!allergenNames) allergenNames = "substancje uczulające";

    const euhDefinition = `EUH208: Zawiera ${allergenNames}. Może powodować wystąpienie reakcji alergicznej.`;

    // 1. Sanacja wszelkich placeholderów w nawiasach kwadratowych
    raw16 = raw16.replace(/(EUH208:?\s*Zawiera\s*)\[[^\]]+\]/gi, `$1${allergenNames}`);
    raw16 = raw16.replace(/\[(?:nazwa\s+substancji\s+uczulającej|substancj[eaęy]|substancj[eaęy]\s+uczulając[eaęy]|nazwa\s+składnika|alergeny?|alergenów|konkretne\s+alergeny)\]/gi, allergenNames);
    raw16 = raw16.replace(/Zawiera\s+substancj[ęe]\s+uczulając[ąa]\./gi, `Zawiera ${allergenNames}.`);

    // 2. Wstrzyknięcie definicji jeśli występuje w Sekcji 2, a brak w Sekcji 16
    if (/EUH208/i.test(sec2) && !raw16.includes('EUH208:')) {
      if (raw16.includes('Pełne brzmienie zwrotów H i EUH')) {
        raw16 = raw16.replace(/(Pełne brzmienie zwrotów H i EUH[^\n]*\n)/i, `$1${euhDefinition}\n`);
      } else {
        raw16 = `${euhDefinition}\n\n` + raw16;
      }
    }

    // Gwarancja kanonicznej stopki prawnej (Single Source of Truth z LocalKnowledgeConnector)
    const canonicalFooter = localKnowledge.getSection16LegalFooter(sdsData.metadata || {});
    const cutIdx = raw16.search(/(?:Główne\s+źródła\s+literatury|Wskazówki\s+szkoleniowe|Zalecenia\s+i\s+wskazówki\s+szkoleniowe|Informacje\s+o\s+zmianach|Klauzula\s+prawna)/i);
    const body16 = cutIdx >= 0 ? raw16.substring(0, cutIdx).trim() : raw16.trim();
    raw16 = body16 ? `${body16}\n\n${canonicalFooter}` : canonicalFooter;

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
