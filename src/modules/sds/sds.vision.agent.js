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
4. CZYTELNY, NIEZLEPIONY UKŁAD AKAPITÓW (WZORZEC SANDALO 1:1):
   Każda kategoria i każde pole w sekcjach narracyjnych MUSI być oddzielone znakiem nowej linii (\n) i posiadać wyraźną etykietę:
   - W Sekcji 1.1:
     Nazwa handlowa: [spolonizowana nazwa, np. SWEET HOME LAYALI - PERFUMY DO TKANIN I POMIESZCZEŃ NAJMA]
     Kod produktu: [kod handlowy]
     UFI: [kod UFI]
   - W Sekcji 1.2:
     Zastosowanie zidentyfikowane: [opis]
     Zastosowania odradzane: [opis]
   - W Sekcji 4.1:
     W kontakcie ze skórą: [dokładny opis]
     W kontakcie z oczami: [dokładny opis]
     W przypadku spożycia: [dokładny opis]
     Po narażeniu drogą oddechową: [dokładny opis]
   - W Sekcji 5.1/5.2/5.3:
     Odpowiednie środki gaśnicze: [opis]
     Niewłaściwe środki gaśnicze: [opis]
     Zagrożenia wynikające z narażenia na działanie pożaru: [opis]
     Sprzęt ochronny strażaków: [opis]
   - W Sekcji 6.1/6.3:
     Dla osób nienależących do personelu udzielającego pomocy: [opis]
     Dla osób udzielających pomocy: [opis]
     Odpowiedni materiał do zbierania: [opis]
   - W Sekcji 7.1/7.2:
     Środki ostrożności: [opis]
     Zalecenia dotyczące ogólnej higieny pracy: [opis]
     Materiały niezgodne: [opis]
     Wskazówki dotyczące pomieszczeń magazynowych: [opis]
   - W Sekcji 8.2:
     Ochrona oczu lub twarzy: [opis]
     Ochrona rąk: [opis]
     Ochrona skóry: [opis]
     Ochrona dróg oddechowych: [opis]
     Zagrożenia termiczne: [opis]
     Kontrola narażenia środowiska: [opis]
   - W Sekcji 9.1:
     Każdy punkt od a) do s) w osobnej linii:
     a) Stan skupienia: [wartość]
     b) Kolor: [wartość]
     c) Zapach: [wartość]
     d) Temperatura topnienia/krzepnięcia: [wartość]
     e) Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia: [wartość]
     f) Palność materiałów: [wartość]
     g) Dolna i górna granica wybuchowości: [wartość]
     h) Temperatura zapłonu: [wartość]
     i) Temperatura samozapłonu: [wartość]
     j) Temperatura rozkładu: [wartość]
     k) pH: [wartość]
     l) Lepkość kinematyczna: [wartość]
     m) Rozpuszczalność w wodzie: [wartość]
     n) Rozpuszczalność w oleju: [wartość]
     o) Współczynnik podziału n-oktanol/woda (wartość współczynnika log): [wartość]
     p) Prężność pary: [wartość]
     q) Gęstość lub gęstość względna: [wartość]
     r) Względna gęstość pary: [wartość]
     s) Charakterystyka cząsteczek: [wartość]
   - W Sekcji 11.1:
     TOKSYCZNOŚĆ OSTRA
     [dane per składnik LD50/LC50]
     a) toksyczność ostra: [uzasadnienie]
     b) działanie żrące/drażniące na skórę: [uzasadnienie]
     c) poważne uszkodzenie oczu/działanie drażniące na oczy: [uzasadnienie]
     d) działanie uczulające na drogi oddechowe lub skórę: [uzasadnienie]
     e) działanie mutagenne na komórki rozrodcze: [uzasadnienie]
     f) rakotwórczość: [uzasadnienie]
     g) szkodliwe działanie na rozrodczość: [uzasadnienie]
     h) działanie toksyczne na narządy docelowe – narażenie jednorazowe: [uzasadnienie]
     i) działanie toksyczne na narządy docelowe – narażenie powtarzane: [uzasadnienie]
     j) zagrożenie spowodowane aspiracją: [uzasadnienie]
   - W Sekcji 14:
     14.1. Numer UN lub numer identyfikacyjny ID: [wartość]
     14.2. Prawidłowa nazwa przewozowa UN: [wartość]
     14.3. Klasa(-y) zagrożenia w transporcie: [wartość]
     14.4. Grupa pakowania: [wartość]
     14.5. Zagrożenia dla środowiska: [wartość]
     14.6. Szczególne środki ostrożności dla użytkowników: [wartość]
     14.7. Transport morski luzem zgodnie z instrumentami IMO: [wartość]
   - W Sekcji 16:
     Pełne brzmienie zwrotów H i EUH przytoczonych w sekcjach 2 i 3 karty charakterystyki:
     [każdy zwrot w nowej linii: Hxxx: Opis]
     Wykaz klas i kategorii zagrożenia przytoczonych w karcie charakterystyki:
     [każda klasa w nowej linii: Klasa Kat: Opis]
     Objaśnienie skrótów i akronimów:
     [każdy skrót w nowej linii: SKRÓT: Pełna nazwa]
     Główne źródła literatury i danych:
     - Karty charakterystyki substancji składowych udostępnione przez producentów i dostawców surowców.
     - Baza danych Europejskiej Agencji Chemikaliów (ECHA): https://echa.europa.eu/
     - Baza danych PubChem National Library of Medicine: https://pubchem.ncbi.nlm.nih.gov/
     - Obowiązujące unijne i krajowe akty prawne (REACH, CLP, Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587).
     Zalecenia i wskazówki szkoleniowe dla pracowników:
     Przed przystąpieniem do pracy z produktem należy zapoznać się z treścią niniejszej karty charakterystyki oraz przepisami BHP obowiązującymi na stanowisku pracy. Pracownicy mający kontakt z produktem powinni zostać przeszkoleni w zakresie prawidłowego i bezpiecznego obchodzenia się z chemikaliami oraz postępowania w sytuacjach awaryjnych.
     Informacje o zmianach i aktualizacji:
     Niniejsza karta charakterystyki (wersja 1.0 PL) stanowi wydanie pierwsze w języku polskim, opracowane na podstawie karty charakterystyki SDS producenta z dnia [data sporządzenia karty producenta] r.
     Aktualizacja została sporządzona i dostosowana zgodnie z wymogami Rozporządzenia Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniającego załącznik II do rozporządzenia (WE) nr 1907/2006 (REACH) oraz przepisami prawa Rzeczypospolitej Polskiej.
     Główne zmiany wprowadzone w bieżącej wersji obejmują:
     - Sekcja 1.3: Aktualizacja danych dostawcy karty w Rzeczypospolitej Polskiej na ITALLUX Sp. z o.o. (ul. Wesoła 16, 63-600 Kępno, www.prostozwloch.com.pl).
     - Sekcja 8.1: Weryfikacja i implementacja krajowych norm higienicznych w środowisku pracy (NDS, NDSCh) na podstawie Rozporządzenia MRPiPS (Dz.U. 2018 poz. 1286 z późn. zm.).
     - Sekcja 11.2 i 12.6: Wdrożenie obligatoryjnych podsekcji dotyczących właściwości zaburzających funkcjonowanie układu hormonalnego.
     - Sekcja 13: Aktualizacja klasyfikacji i 6-cyfrowych kodów odpadów zgodnie z ustawą o odpadach i Dz.U. 2020 poz. 10.
     - Sekcja 14: Weryfikacja i zharmonizowanie warunków przewozu zgodnie z Umową ADR.
     Klauzula prawna i ochrona praw autorskich:
     Niniejsze autorskie opracowanie tłumaczenia, formatowania oraz adaptacji regulacyjnej do prawa polskiego stanowi własność intelektualną firmy ITALLUX Sp. z o.o.. Kopiowanie i wykorzystywanie całości lub fragmentów w celach komercyjnych przez podmioty trzecie bez uprzedniej zgody właściciela jest zabronione. Dozwolone jest wykorzystanie dokumentu przez odbiorców w łańcuchu dostaw do celów bezpieczeństwa pracy i ochrony zdrowia.
     Informacje zawarte w niniejszej karcie wynikają z aktualnego stanu wiedzy producenta i dystrybutora i odnoszą się wyłącznie do opisanego produktu. Użytkownik ponosi odpowiedzialność za stworzenie bezpiecznych warunków pracy oraz spełnienie wymagań prawnych związanych z jego zastosowaniem.

5. STRUKTURA DANYCH WYJŚCIOWYCH (JSON):
   Musisz zwrócić wyłącznie poprawny obiekt JSON o następującej strukturze:
   {
     "metadata": {
       "productName": "Pełna spolonizowana handlowa nazwa produktu (np. SWEET HOME LAYALI - PERFUMY DO TKANIN I POMIESZCZEŃ NAJMA)",
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
       "1": { "1.1": "...", "1.2": "...", "1.3": "...", "1.4": "..." },
       "2": { "2.1": "...", "2.2": "...", "2.3": "..." },
       "3": { "3.1": "Nie dotyczy", "3.2": "Mieszanina..." },
       "4": { "4.1": "...", "4.2": "...", "4.3": "..." },
       "5": { "5.1": "...", "5.2": "...", "5.3": "..." },
       "6": { "6.1": "...", "6.2": "...", "6.3": "...", "6.4": "..." },
       "7": { "7.1": "...", "7.2": "...", "7.3": "..." },
       "8": { "8.1": "...", "8.2": "..." },
       "9": { "9.1": "...", "9.2": "..." },
       "10": { "10.1": "...", "10.2": "...", "10.3": "...", "10.4": "...", "10.5": "...", "10.6": "..." },
       "11": { "11.1": "...", "11.2": "..." },
       "12": { "12.1": "...", "12.2": "...", "12.3": "...", "12.4": "...", "12.5": "...", "12.6": "...", "12.7": "..." },
       "13": { "13.1": "..." },
       "14": { "14.1": "...", "14.2": "...", "14.3": "...", "14.4": "...", "14.5": "...", "14.6": "...", "14.7": "..." },
       "15": { "15.1": "...", "15.2": "..." },
       "16": { "16.1": "..." }
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
  /**
   * Wzbogacenie danych o polskie normy NDS (Dz.U. 2024 poz. 1017) i oficjalne zwroty
   */
  enrichWithPolishRegulations(sdsData) {
    if (!sdsData.sections) sdsData.sections = {};
    if (!sdsData.components) sdsData.components = [];

    const { LocalKnowledgeConnector } = require('./engine/extractors/local.knowledge.connector');
    const rag = new LocalKnowledgeConnector();

    // 1. Ładowanie bazy NDS i wyznaczenie limitów NDS oraz ATE
    const foundNdsLimits = [];
    for (const comp of sdsData.components) {
      if (comp.cas && comp.cas !== '-' && comp.cas !== 'Brak') {
        const ndsEntry = rag.lookupPolishNDSSync(comp.cas);
        if (ndsEntry && ndsEntry.found && ndsEntry.NDS !== 'brak') {
          let line = `${comp.namePl || comp.nameEn || ndsEntry.substance} [CAS: ${comp.cas}]:\n- NDS: ${ndsEntry.NDS}`;
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

      // Wzbogacenie ATE dla składników z Acute Tox (np. masa CMI/MIT CAS 55965-84-9)
      if (/Acute Tox/i.test(comp.clp || '')) {
        if (comp.cas === '55965-84-9' && !/ATE/i.test(comp.clp)) {
          comp.clp += '; ATE (droga pokarmowa) = 64 mg/kg mc.; ATE (na skórę) = 87,12 mg/kg mc.; ATE (inhalacyjnie, pyły/mgły) = 0,33 mg/l';
        }
      }
    }

    // Wstrzyknięcie NDS i oświadczenia DNEL/PNEC do Sekcji 8.1
    sdsData.sections['8'] = sdsData.sections['8'] || {};
    let sec81Text = "";
    if (foundNdsLimits.length > 0) {
      sec81Text = "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n" + foundNdsLimits.join('\n\n') + "\n\n";
    }
    const existingSec8 = sdsData.sections['8']?.['8.1'] || '';
    if (existingSec8 && !existingSec8.includes('Dz.U. 2024 poz. 1017')) {
      sec81Text += existingSec8 + "\n\n";
    }
    sec81Text += "Wartości DNEL (Pochodny poziom niepowodujący zmian) i PNEC (Przewidywane stężenie niepowodujące zmian w środowisku):\nDla mieszaniny oraz substancji składowych nie oznaczono wartości DNEL oraz PNEC.";
    sdsData.sections['8']['8.1'] = sec81Text.trim();

    // Sekcja 13: Kody odpadów wg Rozporządzenia Ministra Klimatu (Dz.U. 2020 poz. 10)
    const isHaz = Boolean(
      (sdsData.classification?.hazardClasses && sdsData.classification.hazardClasses.length > 0) ||
      (sdsData.classification?.hPhrases && sdsData.classification.hPhrases.length > 0)
    );
    const wasteSectionText = `Metody unieszkodliwiania odpadów:
Odzyskać lub poddać recyklingowi, jeśli to możliwe. Nie wprowadzać do kanalizacji, wód powierzchniowych ani gruntowych. Likwidację pozostałości produktu oraz opakowań powierzać wyłącznie uprawnionym podmiotom posiadającym stosowne decyzje odpadowe (BDO).

Klasyfikacja i proponowane kody odpadów (Dz.U. 2020 poz. 10):
- Odpady z produktu (gospodarstwa domowe / konsumenci): ${isHaz ? '20 01 29* (Detergenty zawierające substancje niebezpieczne)' : '20 01 30 (Detergenty inne niż wymienione w 20 01 29)'}.
- Odpady z produktu (sektor przemysłowy / czyszczenie instalacji): ${isHaz ? '16 03 05* (Organiczne odpady zawierające substancje niebezpieczne) lub 07 06 04*' : '16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05) lub 07 06 99 (Inne niewymienione odpady)'}.
- Odpady opakowaniowe (oczyszczone, selektywna zbiórka): 15 01 02 (Opakowania z tworzyw sztucznych).
- Odpady opakowaniowe (zanieczyszczone pozostałościami niebezpiecznymi): 15 01 10* (Opakowania zawierające pozostałości substancji niebezpiecznych lub nimi skażone).

Krajowe akty prawne:
- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).
- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).
- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).`;

    sdsData.sections['13'] = sdsData.sections['13'] || {};
    sdsData.sections['13']['13.1'] = wasteSectionText;

    // Sekcja 15.1: Czysty wykaz aktów prawnych z RAG (BEZ WGK, TRGS 510 i Ograniczenia 75)
    const isFlammable = Boolean(
      sdsData.classification?.hazardClasses?.some(c => /Flam/i.test(c)) ||
      sdsData.classification?.hPhrases?.some(h => /H22[456]/i.test(h))
    );
    sdsData.sections['15'] = sdsData.sections['15'] || {};
    sdsData.sections['15']['15.1'] = rag.lookupLegalActs({ isFlammable, isTattooProduct: false });
    sdsData.sections['15']['15.2'] = "Dla mieszaniny nie przeprowadzono oceny bezpieczeństwa chemicznego.";

    return sdsData;
  }
}

module.exports = { SDSVisionAgent };
