# 📕 RAG SOT 04: BEZPIECZEŃSTWO CHEMICZNE I TOKSYKOLOGIA INCI (CMR / STĘŻENIA / REACH 2026)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 4
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 4 (INCI Parser), Agent 5 (Legal Sanitizer), Agent 10 (Sentinel)
**Stan prawny:** Rozp. 1223/2009; Omnibus VIII = Rozp. Komisji (UE) 2026/78 (wdraża 22. ATP do CLP, tj. Rozp. delegowane 2024/2564); Rozp. 2024/996 (Retinoidy); Rozp. 2023/1545 (Alergeny); Rozp. 2023/2055 (Mikroplastiki). Stan na lipiec 2026 r.

> **Nota o źródłach (higiena RAG):** Ten plik jest **jedynym źródłem prawdy dla twardych limitów liczbowych** stężeń substancji. Ogólny opis reżimu Omnibus VIII i okresów przejściowych → **SOT 02**. Ten plik podaje wartości; SOT 02 podaje kontekst prawny.

---

## 1. SUBSTANCJE ZAKAZANE I KRYTYCZNE RYZYKA FORMULACYJNE (HARD BANS)
Wykrycie w bazie PIM lub na etykiecie INCI którejkolwiek z poniższych substancji skutkuje **natychmiastowym odrzuceniem produktu (ocena = 0 pkt / Czerwona Kartka)** i blokadą publikacji w e-commerce:
* **Substancje CMR (Kancerogenne, Mutagenne, Reprotoksyczne):**
  * `Perboric acid, sodium salt` (Kwas nadborowy i jego sole) – związki uwalniające nadtlenek wodoru, sklasyfikowane jako CMR 1B. Całkowity zakaz w Załączniku II.
  * `Trimethylbenzoyl Diphenylphosphine Oxide` (TPO) – fotoinicjator UV w żelach do paznokci, reprotoksyczny (CMR 1B).
  * `N,N-dimethyl-p-toluidine` (Dimetylotoluidyna) – substancja o potencjale rakotwórczym.
  * `Tetrabromobisphenol-A` oraz pochodne cyny (np. `Dibutyltin oxide`).
* **Zaburzacze endokrynne (Endocrine Disruptors) i nielegalne filtry UV:**
  * `4-Methylbenzylidene Camphor` (4-MBC) – całkowity zakaz stosowania (zakaz sprzedaży od 01.05.2026 r.).
  * `Benzophenone-2` (BP-2) oraz `Benzophenone-5` (BP-5) – negatywna opinia SCCS, ryzyko genotoksyczności i aktywności endokrynnej.
* **Nanomateriały pod nadzorem SCCS:** `Titanium Dioxide (nano)` w produktach doustnych/higienicznych, `Hydrated Silica (nano)`, `Silica Silylate (nano)` oraz `Silver (nano)` (Rozp. 2026/78 / Omnibus VIII).

---

## 2. DWA RÓŻNE REŻIMY PROGOWE – NIE MYLIĆ!
Agenci 4, 5 i 10 muszą traktować poniższe jako **dwie odrębne kategorie prawne**. Sklejenie ich to błąd generujący fałszywe reguły w opisie:

**REŻIM A – Limit obecności substancji w recepturze (ile WOLNO zawrzeć).**
Dotyczy m.in. substancji CMR objętych odstępstwem art. 15 w ramach Omnibus VIII oraz limitów substancji aktywnych. Wartości w tabeli poniżej + progi Omnibus VIII opisane w SOT 02 (2% / 0,5% / 0,3%).

**REŻIM B – Próg obowiązkowej deklaracji alergenu w wykazie INCI (od kiedy trzeba WYMIENIĆ na etykiecie).**
Rozp. 2023/1545. Nie jest to limit stosowania – substancja jest legalna, ale powyżej progu musi być nazwana w składzie.

---

## 3. RESTRYKCJE STĘŻENIOWE (REŻIM A – LIMITY RECEPTURY)
| Składnik INCI / Grupa | Maksymalne Dopuszczalne Stężenie w UE (2026 r.) | Wymogi Dodatkowe i Uwagi Nadzorcze SCCS |
| :--- | :--- | :--- |
| **Retinoidy** (`Retinol`, `Retinyl Palmitate`, `Retinyl Acetate`) | 0,05% ekwiwalentu retinolu w emulsjach/balsamach do ciała; 0,3% ekwiwalentu retinolu w pozostałych produktach niespłukiwanych i spłukiwanych (m.in. kremy do twarzy). | Restrykcje z Rozp. 2024/996 (zapobieganie hiperwitaminozie A). Obowiązkowe ostrzeżenie na etykiecie: *„Zawiera witaminę A / Uwzględnić dzienne pobranie witaminy A"*. |
| **Diethylamino Hydroxybenzoyl Hexyl Benzoate** (DHHB / Uvinul A Plus) | 10% w gotowym produkcie kosmetycznym. | SCCS narzuca kontrolę poziomu zanieczyszczenia DnHexP w surowcu – docelowo maks. 1 ppm. |
| **Składniki depigmentacyjne** (`Kojic Acid`, `Alpha-Arbutin`) | `Kojic Acid`: maks. 1% do twarzy i dłoni. `Alpha-Arbutin`: maks. 2% do twarzy / 0,5% do ciała. | Surowe limity ze względu na stabilność, potencjał drażniący i ryzyko uwalniania hydrochinonu. |

---

## 4. ALERGENY ZAPACHOWE (REŻIM B – PRÓG DEKLARACJI W INCI)
Rozp. Komisji (UE) **2023/1545** rozszerzyło listę alergenów zapachowych wymagających indywidualnego oznakowania z 26 do **ok. 80 pozycji**.

* **Próg deklaracji** (obecność substancji w wykazie INCI wymagana, gdy stężenie przekracza):
  * **> 0,001%** w produktach niespłukiwanych (leave-on).
  * **> 0,01%** w produktach spłukiwanych (rinse-off).
* Przykłady substancji: `Hexyl Salicylate`, `Citral`, `Linalool`, `Limonene`, olejki eteryczne (lawendowy, z drzewa herbacianego, ylang-ylang).
* **Daty:** nowe wymogi etykietowania obowiązują dla produktów wprowadzanych do obrotu **od 31 lipca 2026 r.**; produkty już w obrocie na starych zasadach mogą pozostać do **31 lipca 2028 r.**
* **Skutek dla claimów:** obecność deklarowanych alergenów **wyklucza** oświadczenie „hipoalergiczny".

---

## 5. DELEGALIZACJA MIKROPLASTIKÓW (REACH 2023/2055)
Absolutny zakaz celowego dodawania syntetycznych polimerów nierozpuszczalnych w wodzie i ulegających powolnej degradacji: `Polyethylene` (PE), `Polypropylene` (PP), `Polymethyl Methacrylate` (PMMA), `Nylon-12`, `Nylon-6` oraz `Polyethylene Terephthalate` (PET – syntetyczny brokat).

---

## 6. EWOLUCJA BAZ FORMULACYJNYCH I ALGORYTM OCENY OCR
* **Surowce Przestarzałe (-20 do -30 pkt):** `Triethanolamine` (TEA – ryzyko nitrozoamin), `PEG-100 Stearate` (ryzyko 1,4-dioksanu), `Polysorbate 60/80`, `Phenoxyethanol`, `Methylparaben`, `Propylparaben`.
  * ⚠️ **Uwaga (spójność z SOT 03):** „przestarzałość" surowca to kryterium **wewnętrznej oceny jakości formuły (scoring)**, a NIE argument marketingowy. Zakaz przenoszenia tego do opisu w formie „bez parabenów / bez PEG / bez fenoksyetanolu jako zaleta" – to greenwashing i demonizowanie legalnej chemii (patrz SOT 03).
* **Surowce Nowoczesne (+15 do +20 pkt):** Emulgatory ciekłokrystaliczne (`Olivem 1000`, `Montanov 68`), silikony bez PEG (`CHT-BeauSil ECO 903`), Technologia Płotków (`Pentylene Glycol`, `Caprylyl Glycol`, `1,2-Hexanediol` + synergia z `Niacinamide`), Promotory przenikania (`Dimethyl Isosorbide`, `Oleic Acid`).
* **Algorytm OCR Hero Product 2026:**
  $$Score = 0.4 \cdot I_B + 0.35 \cdot I_S + 0.25 \cdot I_P$$
  *(Gdzie $I_B$ = Bezpieczeństwo [max 100, system kar], $I_S$ = Skuteczność/Synergie [premiowanie bazy], $I_P$ = Potencjał Rynkowy [spikule, PDRN, egzosomy, ekstremofity]).*
