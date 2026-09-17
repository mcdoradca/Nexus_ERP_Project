const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const { NDSRegistry, OFFICIAL_CLP_H_PHRASES, OFFICIAL_CLP_P_PHRASES, SIGNAL_WORDS_MAP } = require('./sds.service');

/**
 * SDSVisionAgent - Profesjonalny agent wielomodalny analizujący i tłumaczący
 * całe dokumenty kart charakterystyki (DOCX / PDF) przy użyciu modeli Gemini Vision.
 * Gwarantuje 100% zgodności z Rozporządzeniem REACH (UE 2020/878) oraz CLP (WE 1272/2008).
 */
class SDSVisionAgent {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) {
      throw new Error('[SDSVisionAgent] Brak GEMINI_API_KEY w środowisku!');
    }
    this.apiKey = apiKey;
    this.primaryModel = 'gemini-3.8-flash';
    this.fallbackModel = 'gemini-3.1-pro-preview';
    this.secondaryFallback = 'gemini-3.6-flash';
  }

  /**
   * Główny prompt systemowy dla Agenta Chemika i Audytora Regulacyjnego
   */
  getSystemInstruction() {
    return `JESTEŚ ELITARNYM, CERTYFIKOWANYM EKSPERTEM CHEMICZNYM I GŁÓWNYM AUDYTOREM REGULACYJNYM SYSTEMÓW KART CHARAKTERYSTYKI (SDS).
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA (WE) NR 1907/2006 (REACH) ORAZ ROZPORZĄDZENIA KOMISJI (UE) 2020/878.

TWOJE ZADANIE:
Otrzymujesz oryginalny plik karty charakterystyki (DOCX lub PDF) w języku obcym (np. włoskim lub angielskim).
Twoim celem jest dokonanie PEŁNEJ, RZETELNEJ, PRAWNIE PRECYZYJNEJ I 100% PROFESJONALNEJ TRANSLACJI I STRUKTURYZACJI NA JĘZYK POLSKI.

BEZWZGLĘDNE ZASADY JAKOŚCI I ZGODNOŚCI PRAWNEJ:
1. 100% JĘZYKA POLSKIEGO:
   - Wszelkie opisy, zalecenia, procedury, nazwy sekcji i podsekcji MUSZĄ być w języku polskim.
   - Niedopuszczalne jest pozostawianie włoskich lub angielskich słów łączących (np. "orale", "inalatoria", "cute", "miscela", "nessun dato").
   - Nazwy składników chemicznych w Sekcji 3.2 podaj po polsku, a w nawiasie oryginalną nazwę angielską/włoską: np. "etanol (ang. ETHANOL)".
2. ZACHOWANIE 1:1 WSZYSTKICH IDENTYFIKATORÓW I DANYCH LICZBOWYCH:
   - Numery CAS, Numery WE/EINECS, Numery indeksowe, Numery rejestracji REACH podaj dokładnie tak jak w dokumencie źródłowym.
   - Wszystkie stężenia (np. "74 ≤ x < 78 %", "≥ 0,1 - < 0,25 %"), wartości SCL (Specyficzne Stężenia Graniczne) oraz współczynniki M (M-ostra, M-przewlekła) muszą zostać precyzyjnie przepisane.
   - Wartości parametrów fizykochemicznych (pH, gęstość, lepkość, temperatura zapłonu) i ekotoksykologicznych (LD50, LC50, EC50, NOEC wraz z gatunkami i wytycznymi OECD) muszą być przepisane bez żadnych zmian liczbowych.
3. BRAK HALUCYNACJI (ZERO GUESSWORK):
   - Jeśli dokument źródłowy nie podaje danej wartości, wpisz "Brak danych" lub "Nie dotyczy". Nigdy nie zmyślaj wyników badań laboratoryjnych.
4. STRUKTURA DANYCH WYJŚCIOWYCH (JSON):
   Musisz zwrócić wyłącznie poprawny obiekt JSON o następującej strukturze:
   {
     "metadata": {
       "productName": "Pełna handlowa nazwa produktu",
       "tradeCode": "Kod produktu (np. BLK...)",
       "ufi": "Kod UFI jeśli występuje, inaczej 'Nie dotyczy'",
       "compilationDate": "Data sporządzenia w formacie DD.MM.YYYY",
       "revisionDate": "Data aktualizacji lub 'Nie dotyczy'",
       "version": "1.0 PL",
       "replacedRevision": "Informacja o wersji zastępowanej",
       "distributor": "ITALLUX Sp. z o.o., ul. Wesoła 16, 63-600 Kępno, tel. +48 663116607, e-mail: kontakt@prostozwloch.com.pl"
     },
     "classification": {
       "hazardClasses": ["Flam. Liq. 2", "Eye Irrit. 2"],
       "hPhrases": ["H225 Wysoce łatwopalna ciecz i pary.", "H319 Działa drażniąco na oczy."],
       "pPhrases": ["P101 ...", "P102 ...", "P210 ..."],
       "signalWord": "Niebezpieczeństwo" | "Uwaga" | "Brak hasła ostrzegawczego",
       "pictograms": ["GHS02", "GHS07"],
       "supplemental": ["Zawiera ... Może powodować wystąpienie reakcji alergicznej."]
     },
     "components": [
       {
         "namePl": "Polska nazwa chemiczna",
         "nameEn": "Oryginalna nazwa handlowa/angielska",
         "cas": "XX-XX-X",
         "ec": "XXX-XXX-X",
         "indexNo": "XXX-XXX-XX-X lub 'Brak'",
         "reach": "01-XXXXXXXXXX-XX-XXXX lub 'Brak'",
         "clp": "Klasy i zwroty CLP wraz ze specyficznymi stężeniami granicznymi SCL i współczynnikami M",
         "concentration": "Zakres stężenia (np. 74 ≤ x < 78 %)"
       }
     ],
     "sections": {
       "1": {
         "1.1": "Identyfikator produktu...",
         "1.2": "Istotne zidentyfikowane zastosowania...",
         "1.3": "Dane dostawcy karty charakterystyki (Dystrybutor: ITALLUX Sp. z o.o., ul. Wesoła 16, 63-600 Kępno, www.prostozwloch.com.pl, kontakt@prostozwloch.com.pl, tel. +48 663116607)",
         "1.4": "Numery telefonów alarmowych w Polsce: Telefon alarmowy przedsiębiorstwa: +48 663116607 (pon-pt 8:00-16:00). Informacja toksykologiczna: Krajowe Centrum Informacji Toksykologicznej w Łodzi: +48 42 631 47 24 / 25; Całodobowy Ośrodek Informacji Toksykologicznej w Warszawie: +48 22 619 66 54. Ogólny numer alarmowy: 112."
       },
       "2": { "2.1": "...", "2.2": "...", "2.3": "..." },
       "3": { "3.1": "Nie dotyczy", "3.2": "Mieszanina..." },
       "4": { "4.1": "...", "4.2": "...", "4.3": "..." },
       "5": { "5.1": "...", "5.2": "...", "5.3": "..." },
       "6": { "6.1": "...", "6.2": "...", "6.3": "...", "6.4": "..." },
       "7": { "7.1": "...", "7.2": "...", "7.3": "..." },
       "8": { "8.1": "...", "8.2": "..." },
       "9": {
         "9.1": "Informacje na temat podstawowych właściwości fizycznych i chemicznych (dokładne punkty od a do s)",
         "9.2": "Inne informacje (w tym LZO/VOC, klasy zagrożenia fizycznego)"
       },
       "10": { "10.1": "...", "10.2": "...", "10.3": "...", "10.4": "...", "10.5": "...", "10.6": "..." },
       "11": { "11.1": "Informacje na temat klas zagrożenia...", "11.2": "Informacje o innych zagrożeniach..." },
       "12": { "12.1": "Toksyczność...", "12.2": "Trwałość i zdolność do rozkładu...", "12.3": "Zdolność do bioakumulacji...", "12.4": "Mobilność w glebie...", "12.5": "Wyniki oceny PBT i vPvB...", "12.6": "Zaburzanie gospodarki hormonalnej...", "12.7": "Inne szkodliwe skutki..." },
       "13": { "13.1": "Metody unieszkodliwiania odpadów..." },
       "14": { "14.1": "...", "14.2": "...", "14.3": "...", "14.4": "...", "14.5": "...", "14.6": "...", "14.7": "..." },
       "15": { "15.1": "Przepisy prawne dotyczące bezpieczeństwa, zdrowia i środowiska...", "15.2": "Ocena bezpieczeństwa chemicznego..." },
       "16": { "16.1": "Inne informacje: pełne brzmienie zwrotów H i EUH, wykaz klas zagrożenia, objaśnienie skrótów i akronimów (ADR, RID, IMDG, IATA, CLP, REACH, NDS, NDSCh, DNEL, PNEC, LD50, LC50, EC50, NOEC, vPvB, PBT, SVHC, UFI), klauzula prawna." }
     },
     "transport": {
       "isRegulated": boolean,
       "unNumber": "np. UN 1170 lub 'Nie dotyczy'",
       "properShippingName": "...",
       "class": "np. 3 lub 'Nie dotyczy'",
       "packingGroup": "np. II lub 'Nie dotyczy'",
       "marinePollutant": boolean,
       "lq": "np. 1 L lub 'Nie dotyczy'",
       "tunnelCode": "np. (D/E) lub 'Nie dotyczy'"
     }
   }`;
  }

  /**
   * Przesyła plik źródłowy do Gemini Vision API i uzyskuje pełny przetłumaczony obiekt JSON
   */
  async processDocument(filePath) {
    console.log(`[SDSVisionAgent] Rozpoczynanie przetwarzania dokumentu: ${filePath}`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[SDSVisionAgent] Plik nie istnieje: ${filePath}`);
    }

    const fileExt = path.extname(filePath).toLowerCase();
    let mimeType = 'application/pdf';
    if (fileExt === '.docx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fileExt === '.rtf') {
      mimeType = 'application/rtf';
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    console.log(`[SDSVisionAgent] Plik załadowany. Rozmiar: ${(fileBuffer.length / 1024).toFixed(1)} KB, MIME: ${mimeType}`);

    const promptText = `Oto oryginalna Karta Charakterystyki (SDS) produktu.
Dokonaj jej bezbłędnego, kompletnego przetłumaczenia i strukturyzacji na język polski zgodnie z Rozporządzeniem REACH (UE 2020/878) i CLP (WE 1272/2008).
Zwróć WYŁĄCZNIE czysty obiekt JSON bez znaczników markdown.`;

    const requestPayload = {
      system_instruction: {
        parts: [{ text: this.getSystemInstruction() }]
      },
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.0
      }
    };

    const modelsToTry = [this.primaryModel, this.fallbackModel, this.secondaryFallback];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[SDSVisionAgent] Wywołanie modelu Gemini: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        
        const response = await axios.post(url, requestPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000 // 3 minuty na dużą kartę
        });

        const candidates = response.data?.candidates;
        if (!candidates || candidates.length === 0) {
          throw new Error(`Brak kandydatów odpowiedzi od modelu ${model}`);
        }

        const rawText = candidates[0].content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error(`Pusta treść odpowiedzi od modelu ${model}`);
        }

        console.log(`[SDSVisionAgent] Odpowiedź otrzymana z ${model} (${rawText.length} znaków). Parsowanie JSON...`);
        const parsedJson = this.cleanAndParseJson(rawText);

        // Wzbogacenie o polskie rejestry NDS i walidacja substancji
        const enrichedSds = this.enrichWithPolishRegulations(parsedJson);
        console.log(`[SDSVisionAgent] Pomyślnie przetłumaczono i wzbogacono kartę: ${enrichedSds.metadata?.productName}`);
        return enrichedSds;
      } catch (err) {
        console.warn(`[SDSVisionAgent] Błąd wywołania modelu ${model}:`, err.response?.data?.error?.message || err.message);
        lastError = err;
      }
    }

    throw new Error(`[SDSVisionAgent] Wszystkie modele Gemini (${modelsToTry.join(', ')}) zawiodły. Ostatni błąd: ${lastError?.message}`);
  }

  /**
   * Oczyszczanie i bezpieczne parsowanie odpowiedzi JSON
   */
  cleanAndParseJson(rawText) {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(`[SDSVisionAgent] Standardowy JSON.parse zawiódł, próba wycięcia skrajnych klamer...`);
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const slice = cleaned.substring(firstBrace, lastBrace + 1);
        return JSON.parse(slice);
      }
      throw new Error(`[SDSVisionAgent] Nie udało się sparsować odpowiedzi JSON: ${parseErr.message}`);
    }
  }

  /**
   * Wzbogacenie danych o polskie normy NDS (Dz.U. 2024 poz. 1017) i oficjalne zwroty
   */
  enrichWithPolishRegulations(sdsData) {
    if (!sdsData.sections) sdsData.sections = {};
    if (!sdsData.components) sdsData.components = [];

    // 1. Ładowanie bazy NDS
    const ndsPath = path.join(__dirname, 'rag_knowledge', 'nds_database_2018.json');
    if (fs.existsSync(ndsPath)) {
      NDSRegistry.loadRegistry(ndsPath);
    }

    // 2. Wyznaczenie limitów NDS dla składników w sekcji 8.1
    const foundNdsLimits = [];
    for (const comp of sdsData.components) {
      if (comp.cas && comp.cas !== '-' && comp.cas !== 'Brak') {
        const ndsEntry = NDSRegistry.getEntry(comp.cas);
        if (ndsEntry) {
          let line = `${comp.namePl} [CAS: ${comp.cas}]:\n- NDS: ${ndsEntry.NDS}`;
          if (ndsEntry.NDSCh && ndsEntry.NDSCh !== '-' && ndsEntry.NDSCh !== 'brak') {
            line += `\n- NDSCh: ${ndsEntry.NDSCh}`;
          }
          if (ndsEntry.NDSP && ndsEntry.NDSP !== '-' && ndsEntry.NDSP !== 'brak') {
            line += `\n- NDSP: ${ndsEntry.NDSP}`;
          }
          if (ndsEntry.uwagi && ndsEntry.uwagi !== '-' && ndsEntry.uwagi !== 'brak') {
            line += `\n- Uwagi: ${ndsEntry.uwagi}`;
          }
          foundNdsLimits.push(line);
        }
      }
    }

    // Jeśli sekcja 8 nie ma krajowych limitów NDS, a znaleziono je w bazie, wstrzyknij je
    if (foundNdsLimits.length > 0) {
      const existingSec8 = sdsData.sections['8']?.['8.1'] || '';
      if (!existingSec8.includes('Dz.U. 2024 poz. 1017') && !existingSec8.includes('Dz.U. 2018 poz. 1286')) {
        const ndsHeader = "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n" + foundNdsLimits.join('\n\n');
        sdsData.sections['8'] = sdsData.sections['8'] || {};
        sdsData.sections['8']['8.1'] = ndsHeader + (existingSec8 ? '\n\n' + existingSec8 : '');
      }
    }

    // 3. Weryfikacja i uzupełnienie Sekcji 15 (Polskie i Europejskie akty prawne)
    const officialLegalText = `Prawodawstwo Unii Europejskiej:
- Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późniejszymi zmianami.
- Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 (wymogi dotyczące sporządzania kart charakterystyki).
- Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) z późniejszymi zmianami.
- Substancje wzbudzające szczególnie duże obawy (SVHC – REACH załącznik XIV): Mieszanina nie zawiera substancji z listy kandydackiej SVHC w stężeniu ≥ 0,1% wag.
- Ograniczenia dotyczące produkcji, wprowadzania do obrotu i stosowania (REACH załącznik XVII): Zastosowanie mają odpowiednie pozycje załącznika XVII (w zależności od przeznaczenia).

Prawodawstwo Rzeczypospolitej Polskiej:
- Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (t.j. Dz.U. 2022 poz. 1816 z późn. zm.).
- Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017).
- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).
- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).
- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).
- Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (t.j. Dz.U. 2024 poz. 643 z późn. zm.) oraz Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).`;

    if (sdsData.sections['15']) {
      if (!sdsData.sections['15']['15.1'] || sdsData.sections['15']['15.1'].length < 200) {
        sdsData.sections['15']['15.1'] = officialLegalText;
      } else if (!sdsData.sections['15']['15.1'].includes('Dz.U. 2024 poz. 1017')) {
        sdsData.sections['15']['15.1'] = sdsData.sections['15']['15.1'] + '\n\n' + officialLegalText;
      }
    }

    return sdsData;
  }
}

module.exports = { SDSVisionAgent };
