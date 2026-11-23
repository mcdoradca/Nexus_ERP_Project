/**
 * Centralny słownik biznesowych opisów ("chmurek") dla wszystkich metryk, parametrów filtrów
 * oraz kolumn tabel w module Centrum Analityki Sprzedaży PRO.
 * Zasada spójności: stan <= stockoutThreshold to jeden jednolity stan BRAK W OFERCIE (bez podziału 0 vs 1-2).
 */
export const METRIC_TOOLTIPS = {
    // Globalne parametry analizy
    filterMarket: 'Pozwala zawęzić analizę wyłącznie do sprzedaży krajowej (PLN) lub rynków zagranicznych (CZK, EUR, HUF) w celu osobnej oceny marżowości i logistyki.',
    filterStockoutThreshold: 'Jednolity próg wyłączenia aukcji: zapas mniejszy lub równy tej liczbie traktujemy jako 0 szt. sprzedażowych (BRAK W OFERCIE). Dla stanów 0–N aukcje są zatrzymywane.',
    filterSmartThreshold: 'Kwota minimalna koszyka dla darmowej dostawy Allegro Smart! (od 02.03.2026 wynosi 49,90 zł). Wykrywa tzw. martwą strefę (produkty kupowane solo tuż poniżej tego progu).',
    filterLeadTime: 'Średni czas oczekiwania na dostawę od producenta/dostawcy (w dniach). Służy do wyliczania bezpiecznego punktu domówienia ROP.',

    // Overview KPI Cards
    kpiGmv: 'Łączny przychód brutto ze sprzedaży produktów (bez kosztów dostawy, po odfiltrowaniu zamówień anulowanych i po deduplikacji kanałów Omnichannel). Wskazuje skalę sprzedaży oraz procent realizacji pełnego potencjału.',
    kpiFullPotential: 'Hipotetyczny maksymalny obrót, jaki firma osiągnęłaby, gdyby żaden produkt nie wypadł ze sprzedaży przez brak zapasu (Obrót GMV + Łączny Utracony GMV).',
    kpiLostByStockout: 'Łączna wartość utraconego obrotu przez okresy, w których stan produktu spadł poniżej lub był równy progowi wyłączenia. Składa się z 3 warstw: sprzedaży bezpośredniej, utraconego Cross-Sellu i kary trafności.',
    kpiLostDirect: 'Wartość sprzedaży samego produktu, która nie doszła do skutku bezpośrednio w dniach, gdy jego stan wynosił ≤ próg braku (liczba dni braku × dzienne tempo sprzedaży w dni aktywne × średnia cena).',
    kpiLostCrossSell: 'Wartość dodatkowych produktów z innych pozycji koszyka, których klienci nie dokupili, ponieważ główny produkt (szczególnie Kotwica) był wyłączony z powodu braku.',
    kpiLostRelevance: '14-dniowa kara algorytmiczna Allegro/marketplace: utracona sprzedaż po powrocie produktu na magazyn wynikająca ze spadku pozycji w rankingu trafności po przerwie w ofercie.',
    kpiNetProfit: 'Rzeczywisty zysk netto (po odjęciu VAT, kosztu zakupu COGS, logistyki/opakowania/BDO, prowizji, Smart!, wyróżnień oraz Allegro Ads). Liczony WYŁĄCZNIE dla produktów mających wpisany koszt zakupu (basePrice > 0) w PIM.',
    kpiCogsCoverage: 'Jaki procent analizowanego obrotu GMV posiada wpisany prawdziwy koszt zakupu (COGS) w katalogu SKU PIM. Im bliżej 100%, tym pełniejszy obraz prawdziwego zysku (zero zmyślonych marż).',
    kpiRoas: 'Zwrot z wydatków reklamowych brutto (Przychód z Allegro Ads / Koszt Ads netto). Np. 8.00x oznacza 8 zł przychodu z każdej 1 zł netto wydanej na reklamę.',
    kpiPoas: 'Prawdziwy zwrot z zysku netto na reklamie (Zysk netto ze sprzedaży Ads / Koszt Ads netto). Wartość < 1.00x oznacza, że reklamy przynoszą obrót, ale przepalają marżę i dokładają do sprzedaży.',
    kpiTacos: 'Udział wydatków reklamowych Ads w całym obrocie sklepu (Koszt Ads netto / Całkowity GMV %). Pokazuje, na ile sprzedaż jest uzależniona od płatnego ruchu.',
    kpiGmroi: 'Zwrot brutto/netto z kapitału zamrożonego w magazynie w skali roku (Roczny zysk netto / Wartość obecnego stanu magazynowego w COGS). Pokazuje, ile złotych rocznie pracuje każda złotówka włożona w towar.',
    kpiMultiShare: 'Procent zamówień zawierających co najmniej 2 różne pozycje w koszyku. Rosnący udział koszyków 2+ obniża koszt wysyłki/obsługi przypadający na 1 produkt i podbija marżę.',
    kpiCrossSell: 'Wartość innych towarów, które zostały sprzedane przy okazji zakupu produktów w koszykach wielopozycyjnych — pokazuje efekt przyciągania produktów typu Kotwica.',
    kpiRopBudget: 'Szacowana gotówka (w cenach zakupu netto COGS z PIM), jaką trzeba przeznaczyć na pilne domówienia brakujących lub niskostanowych towarów według kalkulatora ROP.',
    kpiActionAlerts: 'Liczba wykrytych zagrożeń wymagających decyzji: Krwawiące (reklamy/promo na ujemnym zysku lub braku), Leżaki (zamrożony kapitał), Luki InPost (bestsellery Allegro nieobecne/odrzucone na Von Halsky).',

    // Wykresy i sekcje Overview
    chartPnlWaterfall: 'Rozbicie wyniku finansowego od przychodu brutto aż do zysku netto po uwzględnieniu VAT, kosztu zakupu towaru, logistyki, opłat Allegro i kosztów Ads.',
    chartMonthlyTrend: 'Zestawienie miesięcznego obrotu i liczby zamówień z liczbą momentów wejścia produktów w próg wyłączenia (stan ≤ próg braku). Pozwala łatwo powiązać spadki przychodu z brakami magazynowymi.',
    sectionMarkets: 'Podsumowanie sprzedaży z automatycznym przeliczeniem walut obcych (CZK, EUR, HUF) na PLN. Pomaga ocenić opłacalność ekspansji zagranicznej.',
    sectionChannels: 'Zdeduplikowana sprzedaż w podziale na kanał źródłowy zamówienia (Allegro, InPost Von Halsky, Sklep własny, Inne). Zamówienie w Base.com i Allegro jest liczone zawsze raz.',
    sectionActionQueue: 'Lista najważniejszych decyzji do podjęcia natychmiast, uszeregowana od największego wpływu finansowego PLN. Możesz przejść prosto do diagnozy SKU lub edycji oferty w Offer Optimizer.',
    sectionSpikesDrops: 'Automatyczne wykrycie tygodni ze skokiem sprzedaży (+65% i więcej) lub nagłym załamaniem (-45% i więcej) wraz z przypisaną przyczyną biznesową (zmiana ceny, powrót po braku, efekt zestawu).',

    // Kolumny tabel wspólne & Magazyn ROP
    colProductSku: 'Nazwa produktu oraz kod SKU i EAN z PIM/BaseLinker. Kliknięcie otwiera pełną kartę diagnostyczną produktu 360°.',
    colRoleAbc: 'Rola koszykowa (Kotwica = przyciąga koszyki 2+; Dopełniacz = dokładany do koszyka; Solista = kupowany osobno) oraz klasa ABC-XYZ (A/B/C = udział w obrocie; X/Y/Z = stabilność popytu).',
    colRole: 'Rola koszykowa produktu: Kotwica (magnes ruchu 2+), Dopełniacz (zwiększa koszyk) lub Solista.',
    colPhysicalStock: 'Aktualny stan fizyczny na magazynie pobrany z BaseLinker/Allegro/PIM. Gdy jest mniejszy lub równy progowi wyłączenia, oferty są zablokowane.',
    colSellableStock: 'Dostępny zapas do realnej sprzedaży: Stan fizyczny minus jednolity próg wyłączenia ofert (np. stan 5 przy progu 2 daje 3 szt. realnie dostępne do sprzedaży; ≤ 2 daje 0 szt.).',
    colOpenPo: 'Liczba sztuk będących aktualnie w drodze w otwartych zamówieniach zakupu (Purchase Orders z Base.com). Odejmowana od sugestii domówienia ROP, aby nie dublować zamówień.',
    colDailyVelocity: 'Średnia dzienna liczba sprzedawanych sztuk wyliczana WYŁĄCZNIE z dni, kiedy produkt był faktycznie dostępny w sprzedaży (dni z brakiem są wyłączone z mianownika!).',
    colDoi: 'Dni Zapasu (Days of Inventory): na ile dni sprzedaży wystarczy obecny zapas sprzedażowy przy utrzymaniu obecnego tempa obrotu.',
    colRop: 'Punkt Domówienia (Reorder Point): minimalny bezpieczny stan magazynowy (uwzględniający czas dostawy Lead Time, bufor bezpieczeństwa + dodatkowy bufor dla Kotwic oraz próg wyłączenia).',
    colSuggestedOrder: 'Rekomendowana liczba sztuk do zamówienia teraz u dostawcy, aby uzupełnić zapas na 21 dni ponad ROP po uwzględnieniu sztuk z otwartych PO.',
    colPurchaseBudget: 'Koszt netto domówienia sugerowanej liczby sztuk wyliczony na podstawie ceny zakupu COGS (basePrice) w katalogu PIM.',
    colStockoutDays: 'Łączna liczba dni w analizowanym okresie, kiedy stan produktu spadł ≤ próg wyłączenia (jeden jednolity stan BRAK W OFERCIE — bez sztucznego dzielenia).',
    colLostTotalGmv: 'Suma wszystkich 3 warstw strat finansowych wywołanych brakami tego SKU (strata bezpośrednia + utracony Cross-Sell + 14-dniowa kara trafności).',
    colDaysSinceLastSale: 'Liczba dni od ostatniej odnotowanej sprzedaży produktu. Wartość ≥ 60 dni przy dodatnim zapasie oznacza leżak magazynowy.',
    colFrozenCapital: 'Gotówka zamrożona w niesprzedającym się zapasie wyliczona w cenach zakupu netto COGS z PIM (stan × basePrice).',
    colDeadStockAction: 'Zalecana strategia odblokowania kapitału z leżaka (wyłączenie kosztownego promowania/Ads, pakiet z Kotwicą lub wyprzedaż poniżej progu wyłączenia).',

    // Pełny wykaz / Raport Zarządu
    colUnitsSold: 'Łączna liczba sprzedanych sztuk tego produktu w wybranym okresie i kanale.',
    colGmvPln: 'Całkowity obrót brutto (GMV) wygenerowany przez sprzedaż tego SKU (w PLN).',
    colNetProfitSku: 'Zweryfikowany zysk netto na produkcie po VAT, COGS, logistyce, BDO, prowizjach i kosztach Ads (tylko dla SKU z wpisanym basePrice > 0 w PIM).',
    colLostDirectCol: 'Utracony obrót ze sprzedaży samego SKU w czasie, gdy jego zapas wynosił ≤ próg wyłączenia.',
    colLostCrossCol: 'Wartość koszyków powiązanych (innych produktów), które nie zostały kupione przez brak tego SKU.',
    colLostRelevanceCol: 'Utrata sprzedaży w ciągu 14 dni po wznowieniu oferty wskutek spadku pozycji oferty w rankingu po przerwie.',

    // Koszyki & Cross-Channel
    colPairCoCount: 'Liczba zdeduplikowanych zamówień, w których Produkt A i Produkt B znalazły się razem w tym samym koszyku.',
    colConfidence: 'Prawdopodobieństwo warunkowe: jak często klient kupujący Produkt A dokłada do koszyka również Produkt B.',
    colLift: 'Siła powiązania koszykowego (Lift > 1 oznacza prawdziwą synergię, ≥ 1.50x to bardzo silny kandydat na stały Zestaw Kup Razem lub pakiet Smart!).',
    colAvgBasket: 'Średnia wartość brutto całego zamówienia zawierającego tę parę produktów.',
    colOrdersMulti: 'Łączna liczba zamówień produktu oraz (w nawiasie) ile z nich było koszykami wieloprzedmiotowymi 2+.',
    colMultiShare: 'Odsetek wszystkich zamówień tego produktu, w których klient kupił jeszcze co najmniej jeden inny produkt.',
    colAvgPrice: 'Średnia cena sprzedaży brutto 1 sztuki w analizowanym okresie (w przeliczeniu na PLN).',
    colCrossSellGenerated: 'Łączna wartość innych pozycji w koszykach, które sprzedały się razem z tym produktem.',
    colSoloUnderSmart: 'Liczba zamówień 1-sztukowych dla tego SKU poniżej progu Allegro Smart! (49,90 zł), w tzw. martwej strefie — klient dopłacił za wysyłkę; warto dorzucić Zestaw Kup Razem lub wielopak.',
    colGapOpportunity: 'Szacowany dodatkowy miesięczny obrót na InPost Von Halsky przy założeniu konserwatywnych 15% obrotu osiąganego już przez ten produkt na Allegro.',

    // Diagnostyka Platform & Bilingi
    feeCommission: 'Prowizje od sprzedaży naliczone w bilingach Allegro (przed odliczeniem zwrotów prowizji).',
    feeRefunds: 'Zwroty i korekty prowizji od anulowanych lub zwróconych transakcji.',
    feeSmart: 'Opłaty sprzedawcy za przesyłki w ramach programu Allegro Smart!.',
    feePromo: 'Koszty wyróżnień, podświetleń, pogrubień oraz pakietów promowania w Allegro.',
    feeAdsBilling: 'Opłaty za Allegro Ads rozliczone bezpośrednio na rachunku bilingowym sprzedawcy.',
    feeSubOther: 'Koszty abonamentów sklepowych Allegro oraz pozostałych opłat operacyjnych.',
    colVisitsDelta: 'Zmiana (lub bieżący odczyt) liczby unikalnych odwiedzin ofert tego SKU na Allegro pobrana z GET /sale/offers lub CSV Allegro Analytics.',
    colWatchersDelta: 'Przyrost lub spadek liczby użytkowników obserwujących aukcje tego SKU.',
    colConversionRate: 'Szacowany współczynnik konwersji zamówień z odwiedzin (Zamówienia / Odwiedziny %).',
    colAdsClicks: 'Liczba płatnych kliknięć w kampanii oraz współczynnik klikalności CTR (% kliknięć względem wyświetleń).',
    colAdsRoas: 'Zwrot przychodu reklamowego na kampanii Ads (Przychód Ads / Koszt netto kampanii).',
    vhPriceProgram: 'Rozbicie rabatów z Programu Cenowego InPost („Cenowy Sztos”): część finansowana przez InPost (inpostShare) vs Twój wkład w rabat (merchantShare).',
    vhSlaTimes: 'Średni czas od wpłynięcia zamówienia do akceptacji (ACCEPTED) oraz nadania paczki (SHIPPED) na InPost Von Halsky.',

    // Źródła danych
    syncDeepMode: 'Opcjonalny tryb pobierający dodatkowo historię zmian stanów (Top 20 SKU) i SLA kurierskie Base.com. Wyłączony domyślnie, aby uniknąć pauz limitera API (50 zap./120s) i zakończyć sync w kilkanaście sekund.',
    coverage24m: 'Oś pokazująca pokrycie historii sprzedaży za ostatnie 24 miesiące: kolor indygo = dane API, zielony = dograne z archiwum CSV/XLSX, szary = brak danych (zalecane dogranie eksportu CSV z Base.com).'
};
