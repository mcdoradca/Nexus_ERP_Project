require('dotenv').config();
const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    const systemPrompt = `Jesteś wybitnym kreatorem scen (Prompt Masterem) dla generatora obrazów Photoroom AI.
Otrzymasz dane produktu z bazy PIM (Product Information Management).
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku POLSKIM opisujący scenę dla zdjęcia. Upewnij się, że w prompcie znajduje się absolutny zakaz umieszczania produktu na samym środku kadru. Na końcu promptu zawsze dodaj słowa kluczowe podnoszące jakość (np. fotorealistyczne, profesjonalna fotografia, kinowe oświetlenie, ostra ostrość).

ZAKAZ MODYFIKACJI PRODUKTU: Masz absolutny zakaz opisywania w prompcie cech samego produktu (np. zmiany koloru patyczków zapachowych, materiału, kształtu). Produkt referencyjny jest święty.

BEZWZGLĘDNA OBECNOŚĆ PRODUKTU: Produkt referencyjny MUSI ZAWSZE znajdować się na zdjęciu. Może stać daleko w tle, być za mgłą, parą lub mocno zblurowany (zależnie od polecenia), ale w Twoim prompcie musi fizycznie istnieć w kreowanej scenie jako jej część.

ZAKAZANE MOTYWY: Masz absolutny zakaz używania w scenerii motywów lepienia garnków, koła garncarskiego oraz mrocznego klimatu stolarni/warsztatu.

TWOJE ZADANIE: Wykreuj scenę, gdzie produkt jest ustawiony w całkowicie losowym miejscu w tle, ale bezwzględnie poza centrum kadru. Produkt musi pozostać widoczny.

WYMÓG KREATYWNOŚCI: 
Przeanalizuj do czego służy produkt i wylosuj JEDNO, konkretne, ale nieszablonowe otoczenie dla niego. 
Zaskocz mnie różnorodnością!
Wykaz scenerii, które użyłeś już dla tego EAN (absolutny ZAKAZ powtarzania ich):
- Słoneczny marokański dziedziniec z tradycyjną, kamienną niecką pełną ciepłej, parującej wody i pływających płatków pomarańczy na pierwszym planie. Produkt stoi w tle, po lewej stronie kadru na niskim stoliku z ciemnego drewna, lekko otulony delikatną parą, całkowicie poza centrum obrazu. Ciepłe, złote światło słońca przesącza się przez liście palmowe, tworząc malownicze cienie. Fotorealistyczne, profesjonalna fotografia, kinowe oświetlenie, ostra ostrość.

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST PROMPTU, BEZ ŻADNYCH ZNACZNIKÓW, BEZ WSTĘPÓW I BEZ FORMATOWANIA JSON.

Dane produktu PIM:
NAME: MIL MIL PŁYN DO KĄPIELI ARGAN  1000 ML FEATURES: {"Typ":"Płyn Do Kąpieli","Stan":"Nowy","Waga":"1","Efekt":"Delikatna Pianka","Marka":"Mil Mil","Rodzaj":"płyn","Zapach":"Argan","Działanie":"Nawilżające, Relaksujące","EAN (GTIN)":"8004120905674","Opakowanie":"butelka","Wielkość":"Produkt pełnowymiarowy","Pojemność":"Produkt pełnowymiarowy","Skład/INCI":"AQUA, SODIUM LAURETH SULFATE, SODIUM CHLORIDE, COCAMIDOPROPYL BETAINE, COCO-GLUCOSIDE, GLYCERIN, PARFUM, ARGANIA SPINOSA KERNEL OIL, CITRIC ACID, STYRENE/ACRYLATES COPOLYMER, GLYCOL DISTEARATE, GLYCERYL OLEATE, GLYCERYL STEARATE, PROPYLENE GLYCOL, TRIETHYLENE GLYCOL, MAGNESIUM NITRATE, MAGNESIUM CHLORIDE, BENZYL ALCOHOL, METHYLCHLOROISOTHIAZOLINONE, METHYLISOTHIAZOLINONE","Przeznaczenie":"kąpiel","Kod producenta":"8004120905674","Problem skóry":"nie dotyczy","Stan opakowania":"oryginalne","Kod taryfy celnej":"33073000","INFORMACJE O BEZPIECZEŃSTWIE":"MIL MIL 76 S.p.A. Via Sciarei, 8, 28064 Landiona (NO), Italy info@milmil.it / www.milmil.it","Waga produktu z opakowaniem jednostkowym":"1,1"} STRENGTHS: ⭐ MIL MIL Płyn do kąpieli arganowy 1000 mlOdkryj włoski sekret codziennej pielęgnacji i zamień swoją łazienkę w domowe spa. Czujesz, jak pod ciepłą wodą rozchodzi się intensywny, słodki aromat arganu, a Twoje ciało otula bogata, kremowa piana? Dzięki zawartości naturalnego oleju arganowego płyn delikatnie oczyszcza i wspiera barierę naskórkową. Twoja skóra staje się miękka i aksamitna w dotyku bez nieprzyjemnego uczucia ściągnięcia. To idealny rytuał na wieczorny relaks po intensywnym dniu, który na stałe zagości w Twoim harmonogramie dbania o siebie.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: systemPrompt,
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                // BRAK temperature - to jest to, co wysłaliśmy na GitHuba
            }
        });
        console.log("SUKCES:", response.text);
    } catch (e) {
        console.error("BŁĄD:", e.message, "Status:", e.status);
    }
}
run();
