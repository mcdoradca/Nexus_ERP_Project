# ALLEGRO 2026 COMPLIANCE & UX SSOT (STAN: LISTOPAD 2026)

**Klasyfikacja:** Single Source of Truth (SSOT) – Wytyczne operacyjne dla Agentów AI i Operatorów  
**Zakres:** Nowy wizualny interfejs oferty Allegro (zwijany opis), Załącznik nr 2 do Regulaminu Allegro, REST API Allegro (`composition`, `safetyInformation`, `aiCoCreatedContent`, parametry), Prawo UE (GPSR 2023/988, CLP 2024/2865 art. 48a, Kosmetyki 1223/2009 + Omnibus VIII 2026/78 + 655/2013, Detergenty 648/2004, BPR 528/2012, AI Act 2024/1689 art. 50).

---

## 1. NOWY WIZUALNY INTERFEJS ALLEGRO I REGUŁY „ABOVE-THE-FOLD” (SEKCJA 1)

W nowym układzie wizualnym strony oferty Allegro główna kolumna jest węższa, a **opis oferty jest domyślnie zwinięty** przyciskiem **„Rozwiń opis”** (*„Pokaż cały opis”*). Przed rozwinięciem kupujący widzi wyłącznie górny fragment **Sekcji 1** (pierwszego modułu opisu).

1. **Zasada Above-the-Fold (Sekcja 1 jako karta decyzyjna):**
   - Nagłówek `<h2>⭐ [Nazwa produktu + kluczowa korzyść/pojemność]</h2>` (lub `<h1>`, maksymalnie 75 znaków, bez `<b>` wewnątrz nagłówka).
   - Pierwszy akapit `<p>`: **maksymalnie 220–240 znaków czystego tekstu** (1–2 zwięzłe zdania o dużej gęstości informacyjnej: dokładny typ produktu + pojemność/wydajność + główny efekt użytkowy i powierzchnia/zastosowanie, z 2–3 pogrubieniami `<b>`). Bez ogólnego wstępu marketingowego i lania wody!
   - Bezpośrednio pod `<p>`: **3–4 krótkie, skanowalne punkty** `<li>✔️ <b>[Kluczowa cecha/korzyść]:</b> [krótki konkret ≤ 110 zn. z pogrubieniem efektu <b>]</li>`. Dzięki temu główne parametry decyzyjne mieszczą się w polu widzenia przed kliknięciem *„Rozwiń opis”*.
2. **Kolejność modułów:** Sekcja 1 zawsze jako pierwsza sekcja opisu. Układ linearny **Mobile First** (zakaz szachownicy zdjęć w sąsiednich wierszach).
3. **Limity techniczne Allegro API:**
   - Dozwolone tagi HTML: wyłącznie `<h1>`, `<h2>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<b>` (zakaz `<br>`, `<strong>`, `<div>`, `<span>`, `<table>`, `<a>`, `<img>` w HTML opisu, zakaz `<b>` wewnątrz `<h1>`/`<h2>`).
   - Limit całego payloadu opisu: **40 000 bajtów**.
   - Tytuł oferty: **maksymalnie 75 znaków**, zgodny 1:1 z oferowanym przedmiotem, bez słów zakazanych (§A) i deklaracji biobójczych (§E).

---

## 2. ZAŁĄCZNIK NR 2 REGULAMINU ALLEGRO — CZYSTOŚĆ OPISU I SPÓJNOŚĆ Z PARAMETRAMI

1. **Opis dotyczy WYŁĄCZNIE oferowanego przedmiotu:**
   - Zakaz wklejania informacji o „natychmiastowej wysyłce”, czasie realizacji, wysyłce 24h, dostawie, reklamie sklepu czy sekcji „O sprzedającym” do treści opisu oferty (te dane należą do zakładek systemowych konta Allegro).
   - Moduł informacyjny (`Sekcja 7`) może dotyczyć wyłącznie cech pochodzenia/dystrybucji produktu i zalecenia zapoznania się z etykietą producenta przed użyciem.
2. **Bezwzględna spójność Opis ↔ Karta Parametrów Allegro:**
   - Postać fizyczna (`w płynie`, `w sprayu`, `żel`, `proszek`, `tabletki`), pojemność/waga, liczba sztuk, zapach i przeznaczenie opisane w tekście opisu (szczególnie w Sekcji 1, 4 i 5) **nie mogą być sprzeczne** z parametrami wybranymi w Katalogu Parametrów Allegro!
   - Zatwierdzona wartość parametru z PIM/Allegro ma wyższy priorytet niż surowe przypuszczenie OCR.

---

## 3. ALLEGRO REST API — `composition`, `safetyInformation`, `aiCoCreatedContent`

1. **`productSet[].composition` (skład produktu w API Allegro):**
   - Przeznaczone **wyłącznie dla kosmetyków (Rozp. 1223/2009)** w ustandaryzowanej angielsko-łacińskiej notacji INCI (walidowanej przez `POST /ingredients/parse`).
   - Dopiski FDA/CTFA w nawiasach kwadratowych (np. `AQUA [WATER]`, `CI 19140 [YELLOW 5]`) należy redukować do nazwy kanonicznej przed wysyłką do parsera.
   - **Detergenty (Rozp. WE 648/2004)** z przedziałami procentowymi (`<5% Anionic surfactants...`) lub sekcją `Contains:` nie powinny blokować aktualizacji parametrów/GPSR — w razie nieobsługiwanej kategorii lub odrzucenia walidacji składu system wysyła pozostałe parametry i GPSR.
   - Zakaz doklejania pełnego surowego wykazu INCI / WE 648/2004 na dole Sekcji 3 w opisie HTML — Sekcja 3 wyjaśnia wyłącznie mechanizmy działania kluczowych składników (⚙️/⚡).
2. **`productSet[].safetyInformation` (GPSR 2023/988):**
   - Pole tekstowe (`type: 'TEXT'`, max 5000 zn.), czysty tekst bez tagów HTML i bez emotikonów.
   - Zakaz używania ogólników typu „brak informacji” czy pozostawiania pustego pola przy mieszaninach chemicznych lub kosmetykach z ostrzeżeniami.
   - Dane Podmiotu Odpowiedzialnego w UE (`responsiblePerson`) i Producenta (`responsibleProducer`) przekazuje się przez dedykowane obiekty API; w treści HTML Sekcji 6 podaje się wyłącznie nazwę i pełny adres pocztowy (bezwzględny zakaz e-maili, telefonów, linków i domen internetowych!).
3. **`aiCoCreatedContent` / AI Act (UE) 2024/1689 Art. 50:**
   - Jeśli obrazy oferty były generowane/modyfikowane przez AI, należy przekazać odpowiednie oznaczenia API oraz zachować przejrzystość (bez fałszywych wizualizacji klinicznych i bez ukrywania piktogramów CLP na etykietach w galerii).

---

## 4. AKTUALNE PRAWO PRODUKTOWE UE/PL (FIZYKOCHEMIA I KATEGORYZACJA)

1. **Rozporządzenie CLP (WE) 1272/2008 + Rewizja (UE) 2024/2865 (art. 48a):**
   - Oferty sprzedaży na odległość (e-commerce) dla mieszanin zaklasyfikowanych jako stwarzające zagrożenie muszą wyraźnie prezentować: **Hasło ostrzegawcze** (`UWAGA` / `NIEBEZPIECZEŃSTWO`), **zwroty H**, **zwroty P** (z zachowaniem nierozerwalnych procedur typu `P301+P312`, `P305+P351+P338`, `P337+P313` oraz urzędowych dwukropków) i **EUH** (`EUH206`, `EUH208`) oraz czytelne zdjęcie etykiety z piktogramami GHS i kodem UFI w galerii.
   - Okresy przejściowe nowych zasad etykietowania i formatowania z rewizji 2024/2865 obowiązują etapami w latach 2026–2028; przy braku pełnych danych na etykiecie obowiązuje **zasada 1:1 (ABC -> ABC)** — zakaz fabrykowania kodów H/P nieobecnych u producenta.
   - **Fizykochemiczny realizm postaci:** stałe tabletki chlorowe (`Troclosene sodium`) przechowuje się w suchym miejscu chronionym przed wilgocią (nie „w pozycji pionowej dla stabilności podchlorynu sodu”), a płynne mydła/żele o zapachu „talku” lub z dodatkiem „oleju migdałowego” posiadają fazę wodną i nie podlegają regułom suchych pudrów ani olejów bezwodnych.
2. **Detergenty (WE) 648/2004, Biocydy (BPR 528/2012) i Kosmetyki (1223/2009 + 655/2013 + Omnibus VIII 2026/78):**
   - Katalog nie obejmuje produktów leczniczych ani rejestrowanych produktów biobójczych — bezwzględny zakaz roszczeń medycznych oraz biobójczych (`antybakteryjny`, `dezynfekujący`, `grzybobójczy`, `99,9% bakterii`) również w słownikowych parametrach oferty!
   - Kosmetyki i chemia gospodarcza nie posiadają znaku CE (wyłącznie wyroby medyczne MDR itp.).
   - Wyroby gotowe/artykuły (szczoteczki, akcesoria — REACH art. 3 pkt 3) podlegają wyłącznie GPSR (bez kodów CLP H/P i bez zmyślonego zapachu).
