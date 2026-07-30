# 📘 RAG SOT 06: SŁOWNIK INCI I MAPOWANIE KORZYŚCI AEO (COMPREHENSIVE BENEFIT DICTIONARY)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 6
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 4 (INCI Parser), Agent 6 (Copywriter)
**Stan prawny:** 37 grup działaniowych z rygorystycznym uwzględnieniem zakazu oświadczeń medycznych (Rozp. 655/2013).

> **⚠️ NOTA O ZAKRESIE (KRYTYCZNA – ANTYHALUCYNACJA):** Ten słownik to **wiedza pojęciowa i reprezentatywne przykłady**, a **NIE wyczerpujący wykaz** wszystkich składników INCI (realny słownik INCI to >20 000 nazw). Jeśli Agent 4 napotka w składzie produktu substancję, której **nie ma na tej liście**, ma **ZAKAZ zgadywania** jej funkcji, statusu lub bezpieczeństwa. Zamiast tego oznacza ją jako `UNKNOWN_INGREDIENT_NEEDS_LOOKUP` i kieruje do weryfikacji (baza referencyjna / Agent 1 / HITL). Twarde limity stężeń → SOT 04. Reguły claimów → SOT 03.

---

## 1. FUNDAMENTALNA REGUŁA MAPOWANIA (COMPLIANCE GUARDRAIL)
**OSTRZEŻENIE:** Dokumentacja surowcowa opisuje patomechanizmy laboratoryjne (np. *„eradykacja bakterii C. acnes"*, *„leczenie oparzeń"*). **Na Allegro i w e-commerce w UE BEZWZGLĘDNIE ZAKAZANE JEST kopiowanie terminologii medycznej do opisu kosmetyku!**
Wzorzec transformacji: $\text{INCI z bazy PIM} \longrightarrow \text{Mechanizm Biochemiczny} \longrightarrow \text{Bezpieczna Korzyść AEO na Allegro}$.
*Przykład:* Zamiast *„Serum leczy trądzik i zabija bakterie"* → piszemy: *„🔬 <b>Kwas salicylowy i olejek z drzewa herbacianego:</b> Aktywne połączenie penetrujące przez sebum, oczyszczające pory z zanieczyszczeń. Redukuje widoczność zaskórników i ogranicza przetłuszczanie bez barierowego przesuszenia."*

---

## 2. BRAMKA: SKŁADNIKI NIE-KOSMETYCZNE (HARD STOP DLA AGENTA 4)
Poniższe substancje **NIE są legalnymi składnikami kosmetycznymi w UE** – to substancje lecznicze lub zakazane. Jeśli pojawią się w składzie produktu deklarowanego jako kosmetyk, oznacza to **błędną kategoryzację** (prawdopodobnie produkt leczniczy). Agent 4 zwraca `INGREDIENT_NOT_COSMETIC` i zatrzymuje potok (alert HITL). **Firma NIE handluje lekami.**
* `Ketoconazole`, `Climbazole (jako substancja lecznicza)`, `Clotrimazole`, `Miconazole` – przeciwgrzybicze substancje lecznicze.
* `Hydroquinone` – zakazany w kosmetykach wybielających (poza wyjątkami dla sztucznych paznokci).
* `Tretinoin` (kwas retinowy), `Adapalene`, `Isotretinoin` – leki (retinoidy przepisowe).
* `EGF / FGF / inne rekombinowane czynniki wzrostu` – działanie biologiczne poza definicją kosmetyku w UE.
* `Antybiotyki` (np. `Erythromycin`, `Clindamycin`, `Neomycin`), `Corticosteroids` (np. `Hydrocortisone`).
> *Uwaga: to lista sygnalna, nie wyczerpująca. Docelowo Agent 4 weryfikuje status każdego składnika w zewnętrznej bazie referencyjnej (osobny projekt).*

---

## 3. SŁOWNIK INCI I KRYTERIA SKUTECZNOŚCI (WIODĄCE GRUPY)
1. **Antybakteryjne i redukujące niedoskonałości:** `Benzoyl Peroxide` (otoczenie beztlenowe), `Salicylic Acid` (BHA - rozpuszcza się w tłuszczach, redukuje zaskórniki), `Azelaic Acid` (wycisza rumień, redukuje grudki), `Melaleuca Alternifolia Leaf Oil` (olejek z drzewa herbacianego).
2. **Antyoksydacyjne (Tarcza Miejska):** `Astaxanthin` (silny antyoksydant o wysokiej sprawności w gaszeniu tlenu singletowego), `Ascorbic Acid` (złoty standard rozświetlenia), `Ferulic Acid` (stabilizuje wit. C i E), `Tocopherol`, `Ergothioneine` (ochrona przed stresem oksydacyjnym).
3. **Eksfoliacyjne (Złuszczające):** `Glycolic Acid` (AHA - najmniejsza cząsteczka, głęboki resurfacing), `Lactic Acid` (AHA - wygładza i stymuluje ceramidy), `Gluconolactone` (PHA - złuszcza łagodnie, działa jako humektant), `Papain`, `Bromelain` (enzymy - dla cer wrażliwych).
4. **Fotoprotekcyjne (Ochrona UV):** `Tinosorb S` (organiczny, szerokie spektrum i stabilność), `Uvinul A Plus` (bloker UVA), `Zinc Oxide` (szeroki filtr mineralny, koi podrażnienia), `Titanium Dioxide` (filtr fizyczny UVB/krótkie UVA).
5. **Kojące i Łagodzące:** `Madecassoside`, `Asiaticoside` (izolaty CICA - wyciszają rumień), `Panthenol` (łagodzi pieczenie), `Allantoin` (regeneruje mikrourazy), `Bisabolol` (izolat z rumianku), `Glycyrrhetinic Acid` (kwas lukrecjowy).
6. **Matujące i Seboregulujące:** `Niacinamide` (w stężeniach 2-5% pomaga normalizować sekrecję sebum i zwężać widoczność porów), `Zinc PCA` (reguluje aktywność gruczołów łojowych), `Silica` (krzemionka mikrosferyczna - absorbuje łój i pot).
7. **Natłuszczające i Okluzyjne (Redukcja TEWL):** `Petrolatum` (silna redukcja TEWL), `Squalane` (biozgodny emolient naśladujący sebum, nie zapycha), `Butyrospermum Parkii Butter` (Masło Shea), `Mineral Oil`.
8. **Nawilżające (Humektanty):** `Polyglutamic Acid` (PGA - wysoka zdolność wiązania wody), `Sodium Hyaluronate` (silne wiązanie wody, efekt *plumping*), `Glycerin` (moduluje akwaporyny), `Urea` (mocznik 5-10% podnosi wilgotność).
9. **Odbudowujące Barierę:** `Ceramide NP, AP, EOP` (w stosunku 3:1:1 z cholesterolem i kwasami tłuszczowymi wspierają odbudowę cementu międzykomórkowego), `Cholesterol`, `Phytosphingosine` (prekursor ceramidów).
10. **Przeciwstarzeniowe (Wsparcie kolagenu):** `Retinal` (retinaldehyd, szybka konwersja do kwasu retinowego), `Retinol`, `Copper Tripeptide-1` (GHK-Cu - wsparcie remodelingu włókien), `Bakuchiol` (roślinny analog retinolu), `Palmitoyl Pentapeptide-4` (Matrixyl).
11. **Rozjaśniające (Depigmentacyjne):** `Thiamidol` (silny inhibitor tyrozynazy), `Hexylresorcinol`, `Tranexamic Acid` (redukcja widoczności przebarwień), `Alpha-Arbutin`, `Kojic Acid`.
12. **Stymulujące mikrokrążenie:** `Caffeine` (redukuje widoczność obrzęków i „worków"), `Escin` (escyna - wspiera mikrokrążenie), `Hesperidin` (bioflawonoid redukujący widoczność cieni pod oczami).
13–37. **Pozostałe grupy funkcjonalne:** Antyperspiracyjne (`Aluminum Zirconium Tetrachlorohydrex GLY`), Brązujące (`DHA`, `Erythrulose`), Chłodzące (`Menthol`, `Menthyl Lactate`), Dezodorujące (`Triethyl Citrate`, `Zinc Ricinoleate`), Kondycjonujące (`Behentrimonium Chloride`, `Polyquaternium-10`), Liftingujące (`SYN-AKE`, `Acetyl Hexapeptide-8 / Argireline`, `Pullulan`), Myjące (`SLES`, `SCI`, `Coco-Glucoside`), Napinające (`Macrocystis Pyrifera`, `DMAE`), Adsorbujące (`Bentonite`, `Charcoal Powder`), Odżywcze (`Omega 3/6`, olej z awokado), Przeciwłupieżowe (`Piroctone Olamine`, `Climbazole` [w dozwolonym stężeniu kosmetycznym], `Zinc Pyrithione` [wg aktualnego statusu prawnego – weryfikować], `Selenium Disulfide`), Przeciwzmarszczkowe (`Matrixyl`, `Adenosine`), Regenerujące (`Śluz ślimaka / Snail Secretion Filtrate`, `Centella Asiatica`), Rewitalizujące (`Żeń-szeń / Panax Ginseng`, `Ubiquinone / Koenzym Q10`), Ściągające (`Hamamelis Virginiana / Oczar`, `Zinc Sulfate`), Tonizujące (`Kwas mlekowy/cytrynowy < 1%` regulujące pH do 4.5-5.5), Uelastyczniające (`Kolagen rozpuszczalny`), Ujędrniające (`Palmitoyl Tetrapeptide-7`, `Asiatic Acid`), Wygładzające (`Dimethicone`), Złuszczające fizycznie (`Celuloza mikrokrystaliczna`), Emolienty suche (`Caprylic/Capric Triglyceride`, `Isopropyl Myristate`), Ochronne Anti-Smog (`Marrubium Vulgare`), Lamelarne (`Olivem 1000`, `Montanov 68`).

> **Nota (spójność z SOT 02):** `Zinc Pyrithione` oraz `Selenium Disulfide` podlegają zmieniającym się ograniczeniom UE (m.in. status ZPT był przedmiotem zmian regulacyjnych). Agent 4 traktuje je jako składniki wymagające weryfikacji statusu przed użyciem w opisie – nie zakłada domyślnie, że są dozwolone.
