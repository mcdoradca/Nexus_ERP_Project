# 📗 RAG SOT 02: PRAWO KOSMETYCZNE I CHEMIA DOMOWA UE/PL (SAFETY & COMPLIANCE)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 2
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 4 (INCI Parser), Agent 5 (Legal Sanitizer), Agent 10 (Sentinel)
**Stan prawny:** Rozporządzenia UE: 1223/2009 (Kosmetyki), 1272/2008 (CLP), 648/2004 (Detergenty), 528/2012 (Biocydy BPR), Omnibus VIII (2026/78). Stan na lipiec 2026 r.

> **Nota o źródłach (higiena RAG):** Ten plik jest **jedynym źródłem prawdy** dla ogólnych zakazów kosmetycznych i reżimu chemii domowej/biocydów. Szczegółowe **limity stężeń substancji** (retinoidy, alergeny, depigmentacja, filtry) znajdują się w **SOT 04** i nie są tu powielane. Kryteria **oświadczeń (claims 655/2013)** znajdują się w **SOT 03**. W razie rozbieżności obowiązuje SOT 04 dla liczb i SOT 03 dla claimów.

---

## 1. REŻIM KOSMETYCZNY (ROZPORZĄDZENIE 1223/2009 & OMNIBUS VIII)

### A. Twarde Zakazy w Kosmetykach:
*   **Zakaz obietnic medycznych:** Kosmetyk to nie lek. Absolutny zakaz sugerowania, że produkt leczy choroby (np. trądzik różowaty, łuszczycę, egzemę, atopowe zapalenie skóry), zapobiega im, goi rany, likwiduje stany zapalne lub działa jak antybiotyk.
*   **Zakaz chwalenia się brakiem testów na zwierzętach (Cruelty-Free Greenwashing):** W UE obowiązuje całkowity zakaz **testowania** gotowych kosmetyków na zwierzętach (od 2004 r.) oraz testowania ich składników (od 2009 r.), a od **11 marca 2013 r.** – zakaz **wprowadzania do obrotu** kosmetyków testowanych na zwierzętach (tzw. marketing/sales ban). Ponieważ jest to powszechny wymóg prawa dla **wszystkich** kosmetyków w UE, **bezwzględnie zakazane jest chwalenie się hasłem „nie testowane na zwierzętach / cruelty-free" jako unikalną przewagą marki**, o ile produkt nie posiada niezależnego certyfikatu (np. Leaping Bunny) poświadczającego audyt całego łańcucha dostaw. Eksponowanie samego wymogu prawa jako zalety to ukryty greenwashing i naruszenie wytycznych UOKiK.
*   **Zakaz substancji niedozwolonych i CMR:** Zakaz stosowania substancji rakotwórczych, mutagennych lub reprotoksycznych (CMR) oraz substancji z Załącznika II.

### B. Cezura „Omnibus VIII" – co to naprawdę jest (Rozp. Komisji (UE) 2026/78):
**Omnibus VIII to rozporządzenie zmieniające 1223/2009 w zakresie substancji sklasyfikowanych jako CMR** (rakotwórcze, mutagenne, działające szkodliwie na rozrodczość), wdrażające 22. ATP do CLP. Opublikowane 13.01.2026 r., **stosowane od 1 maja 2026 r.** Wprowadza zakazy/ograniczenia konkretnych substancji (m.in. kwas nadborowy i sole, srebro w postaci nano i litej, aceton oksym) oraz – dla wybranych substancji objętych odstępstwem art. 15 – **limity stężeń w gotowym produkcie** zależne od typu kosmetyku:

*   *Kompozycje zapachowe na bazie wodno-alkoholowej (np. perfumy):* maks. **2%** (z surowszymi wyłączeniami dla produktów dla dzieci < 3 lat).
*   *Produkty spłukiwane (rinse-off – szampony, żele):* maks. **0,5%**.
*   *Produkty niespłukiwane (leave-on – kremy, sera, balsamy):* maks. **0,3%**. *(To najczęstsza kategoria w portfolio kosmetycznym – nie pomijać!)*

**Okresy przejściowe (KRYTYCZNE dla decyzji o blokadzie oferty):**
*   Produkty **wprowadzane do obrotu po 1 maja 2026 r.** muszą być zgodne od tej daty.
*   Produkty **już znajdujące się w obrocie** przed wejściem wymogów mogą pozostać na rynku do **31 lipca 2028 r.**; po tej dacie niezgodne zapasy muszą zostać wycofane.
*   **Wniosek dla Agenta:** samo „przekroczenie limitu" nie oznacza automatycznej blokady starych zapasów – należy uwzględnić datę wprowadzenia do obrotu. W razie wątpliwości → alert HITL.

> ⚠️ **Nie mylić dwóch różnych reżimów progowych:**
> - **Limit obecności substancji w formule** (Omnibus VIII: 2% / 0,5% / 0,3%) – dotyczy tego, ile substancji *wolno zawrzeć* w recepturze.
> - **Próg obowiązkowej deklaracji alergenu w wykazie INCI** (Rozp. 2023/1545: 0,001% niespłukiwane / 0,01% spłukiwane) – dotyczy tego, od jakiego stężenia alergen *trzeba wymienić na etykiecie*. Szczegóły w **SOT 04**.

### C. Obowiązkowe Elementy i Słownictwo:
*   **Zgłoszenie CPNP:** Wymóg weryfikacji numeru notyfikacji w unijnym portalu CPNP.
*   **Wykaz INCI:** Pełny skład w porządku malejącym (substancje < 1% w dowolnej kolejności na końcu). Nanomateriały oznaczone słowem `(nano)`.
*   **Norma ISO 16128:** Deklarowanie % składników naturalnych (np. „95% pochodzenia naturalnego") musi bazować na wyliczeniu indeksu wg normy ISO 16128 i posiadać certyfikat (np. BIOAGRICERT, ECOCERT, COSMOS).
*   **Słownictwo dozwolone (Kosmetologiczne):** `pielęgnuje`, `chroni`, `nawilża`, `wygładza`, `utrzymuje w dobrej kondycji`, `poprawia wygląd`, `rozświetla`, `koi podrażnienia`, `wspiera barierę naskórkową`.
*   **Słownictwo zakazane (Medyczne):** `leczy`, `uzdrawia`, `terapia`, `lekarstwo`, `zapobiega chorobom`, `diagnozuje`, `regeneruje tkanki chorobowe`.

---

## 2. REŻIM CHEMII DOMOWEJ I DETERGENTÓW (CLP 1272/2008 & REACH)

Chemia domowa (płyny do naczyń, proszki, odkamieniacze, środki do powierzchni) podlega pod surowe prawo chemiczne.

> **Nota RAG:** Operacyjny słownik mapowania chemii domowej na Język Korzyści AEO znajduje się w **SOT 07**. Poniżej – wyłącznie twarde wymogi prawne oznakowania.

### A. Oznakowanie Zagrożeń CLP w e-commerce (Obowiązkowe):
Jeśli mieszanina jest zaklasyfikowana jako niebezpieczna w Karcie Charakterystyki (SDS/MSDS), Agent AI **musi obligatoryjnie** włączyć do opisu (Sekcja 6: Bezpieczeństwo) oraz do parametrów oferty na Allegro:
1.  **Hasło ostrzegawcze:** **`NIEBEZPIECZEŃSTWO`** (DANGER) lub **`UWAGA`** (WARNING).
2.  **Zwroty H (Zagrożenia):** np. *H318 – Powoduje poważne uszkodzenie oczu*, *H315 – Działa drażniąco na skórę*, *H226 – Łatwopalna ciecz i pary*.
3.  **Zwroty P (Środki ostrożności):** np. *P102 – Chronić przed dziećmi*, *P280 – Stosować rękawice ochronne*, *P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą...*.
4.  **Kod UFI (Unique Formula Identifier):** 16-znakowy kod alfanumeryczny musi być obecny na zdjęciu etykiety w galerii produktu.

### B. Wymogi dla Detergentów (WE 648/2004):
*   **Biodegradowalność:** Środki powierzchniowo czynne muszą spełniać kryterium całkowitej biodegradacji tlenowej.
*   **Przejrzystość składu:** W opisie należy podać przedziały procentowe (np. `<5% niejonowe środki powierzchniowo czynne, kompozycje zapachowe, konserwanty`).
*   **Zakaz mikroplastików (REACH 2023/2055):** Bezwzględny zakaz celowego dodawania syntetycznych polimerów nierozpuszczalnych w wodzie (np. mikrodrobin w proszkach czy kapsułkach).

---

## 3. PRODUKTY BIOBÓJCZE W CHEMII DOMOWEJ (REŻIM BPR 528/2012)

Detergenty o działaniu dezynfekującym, antybakteryjnym, grzybobójczym czy pleśniobójczym to **Produkty Biobójcze**.

*   **Pozwolenie na obrót:** Obowiązek podania w opisie i parametrach numeru pozwolenia URPL lub ECHA (np. `Pozwolenie URPL nr XXXX/XX`).
*   **Obligatoryjny Disclaimer Biobójczy (nie może być ukryty):**
    > ⚠️ **PRODUKT BIOBÓJCZY. NALEŻY UŻYWAĆ Z ZACHOWANIEM ŚRODKÓW OSTROŻNOŚCI. PRZED KAŻDYM UŻYCIEM NALEŻY PRZECZYTAĆ ETYKIETĘ I INFORMACJE DOTYCZĄCE PRODUKTU.**
*   **CZARNA LISTA SŁÓW ZAKAZANYCH W BIOCYDACH (Art. 72 BPR):** W reklamie i opisie biocydu **bezwzględnie zakazane jest stosowanie określeń sugerujących brak zagrożenia lub niskie ryzyko**. Agent AI ma twardy filtr wycinający słowa:
    `nietoksyczny`, `nieszkodliwy`, `naturalny`, `przyjazny dla środowiska`, `przyjazny dla zwierząt`, `całkowicie bezpieczny`, `wolny od chemikaliów`, `produkt o niskim ryzyku`.
    *(Nawet jeśli płyn do dezynfekcji opiera się na bio-etanolu lub kwasie mlekowym, nazwanie go „naturalnym i bezpiecznym biocydem" jest nielegalne!).*
