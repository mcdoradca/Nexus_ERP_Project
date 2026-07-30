# NEXUS ERP 2.0 — REFAKTORYZACJA POTOKU v4.0 (TOKEN ECONOMY + SAFETY-FIRST)

## 0. ZASADA NADRZĘDNA
Produkty to chemia i kosmetyki. **Żadna kontrola bezpieczeństwa (CLP, GPSR, roszczenia
medyczne, biocydy, AI Act) nie została usunięta ani osłabiona.** Oszczędności pochodzą
wyłącznie z: (a) eliminacji tokenów myślenia tam, gdzie zadanie jest deterministyczne,
(b) cache'owania statycznych prefiksów, (c) przeniesienia kontroli mechanicznych do kodu,
(d) wyjść diff-owych zamiast przepisywania HTML, (e) usunięcia martwych referencji.
Warstwy prawne (Agent 5, Agent 10-semantyczny) pozostają na Gemini 3.1 Pro z budżetem
myślenia — tam myślenie ma wartość.

---

## 1. DIAGNOZA NA PODSTAWIE TELEMETRII (zrzut z 2026-07)

| Ognisko strat | Dowód z telemetrii | Naprawa v4 |
|---|---|---|
| Tokeny myślenia ~40% potoku | A10: 10 154 thoughts / 2 586 completion; A7: 7 884/2 058; A6: 6 345/1 594; A2: 3 060/838 | `thinkingConfig.thinkingBudget` per węzeł (tabela §3) |
| Cache martwy | 1 465 cached na ~35 000 prompt tokens łącznie | Implicit/explicit caching: statyczny prefiks (rola+reguły+schemat) identyczny bajt-w-bajt, dane SKU zawsze NA KOŃCU promptu |
| Passthrough za pełną stawkę | A4: 4 708 prompt → 52 completion | Orkiestrator w kodzie decyduje `is_chemical` PRZED wywołaniem; A4 nie jest wołany dla produktów niechemicznych |
| Tranzyt HTML przez A7 | A7 prompt 8 406 (największy) | A7 otrzymuje TYLKO sekcje 1, 2, 4 + surowiec pratfall; sekcje 3/5/6 zamrożone w kodzie |
| Agregator A10 | 19 980 total (najdroższe wywołanie) | Pre-audyt w kodzie (§2) + A10 dostaje tylko wynik pre-audytu i sekcje opisowe; naprawy jako lista patchy, nie pełny HTML |
| Martwy Agent 3 | pętle/fałszywe pola `node_3_title` | Usunięty z Node 0 i Node 10 (enum, wejście, FILAR 2, routing) |
| Schematy Draft-07 w promptach | setki tokenów/wywołanie | Schemat przez `responseSchema` (structured output) — poza promptem; prompt zawiera tylko krótką listę pól |

Szacunek łączny: **55–70% redukcji kosztu na SKU** bez utraty pokrycia kontroli.

---

## 2. WARSTWA KODU (PRE/POST-WALIDATORY — 0 tokenów LLM)
Orkiestrator (Node 0 — od v4 czysty kod, nie LLM) wykonuje deterministycznie:

**Pre-walidatory (przed LLM):**
- `ean_checksum(gtin)` — suma kontrolna GS1 (dotąd w prompcie A1).
- `route_chemical(pim)` — czy wołać A4/A8-ingredient path.
- `freeze_sections(s3, s5, s6)` — hash SHA-256 sekcji zamrożonych; przechowywane poza obiegiem LLM.

**Post-walidatory (po LLM, przed A10):**
- `scan_stopwords(html)` — lista Allegro + UOKiK (SHARED_RULES §A) — regex, case-insensitive, odmiany.
- `scan_medical_claims_lexical(html)` — twardy leksykon (leczy, terapia, antybiotyk, łuszczyca…). Trafienie → wraca do A5. LLM A10 robi tylko warstwę SEMANTYCZNĄ (parafrazy, roszczenia ukryte).
- `validate_html_whitelist(html)` — dozwolone tagi: h1,h2,p,ul,ol,li,b,strong,br; zakaz linków/kontaktów.
- `diff_numeric(html, pim)` — ekstrakcja liczb+jednostek (ml, g, kg, pH, EAN, %) i porównanie 1:1 z PIM. Rozbieżność → HALLUCINATION_DATA_MISMATCH bez udziału LLM.
- `verify_frozen(s5, s6)` — porównanie hashy; jakakolwiek zmiana = twardy błąd (ochrona ostrzeżeń CLP silniejsza niż promptowa).
- `c2pa_check(file)` — odczyt metadanych C2PA/SynthID biblioteką, nie modelem wizyjnym.
- `emoji_structure_check(html)` — emotikon na początku h1/h2/li.

Do A10 (LLM) trafia raport pre-audytu + wyłącznie to, czego kod nie umie ocenić:
semantyczne roszczenia medyczne/greenwashing, spójność logiczna, jakość Pratfall/Kotwic.

---

## 3. KONFIGURACJA WYWOŁAŃ v4 (per węzeł)

| Węzeł | Model | thinkingBudget | Cache prefiksu | Uwagi |
|---|---|---|---|---|
| A1 Autofill | flash + grounding | 0 | TAK | ekstrakcja, nie rozumowanie |
| A2 Sentiment | flash + grounding | 0 | TAK | limity maxItems (nowe) |
| A4 INCIParser | flash | 0–512 | TAK | wołany TYLKO dla chemii; RAG-only |
| A5 LegalSanitizer | **3.1-pro** | **1024–2048** | TAK | BEZPIECZEŃSTWO — bez cięć |
| A6 Copywriter | flash | 512 | TAK | schemat przez responseSchema |
| A7 Psychology | flash | 512 | TAK | wejście/wyjście tylko s1,s2,s4 |
| A8 Mapper | flash (+grounding krok 2) | 0 | TAK | bez zmian merytorycznych |
| A9 Vision | 3.5-flash (vision) | 0 | TAK | obrazy kanałem natywnym; C2PA w kodzie |
| A10 Sentinel | **3.1-pro** | **1024** | TAK | zakres zawężony do semantyki; naprawy = patche |
| Node 0 | **KOD (bez LLM)** | — | — | maszyna stanowa + walidatory §2 |

Reguła cache: prompt = [BLOK STATYCZNY: rola + SHARED_RULES + instrukcje] + [BLOK
DYNAMICZNY: dane SKU]. Blok statyczny nie może się różnić ani jednym bajtem między
wywołaniami (żadnych dat/UUID w prefiksie).

---

## 4. PRZEPŁYW DANYCH v4 (kto co widzi)

```
Node0(kod) ── EAN checksum, routing
  A1 ─→ PIM+ (pełny) ──→ cache
  A2 ─→ sentiment (limitowany) ─┐
  A4 ─→ benefits AEO (tylko chemia) ─┤
  A5 ←─ {A1.compliance, A2.matrix, A4.benefits}   ← pełny kontekst prawny (safety!)
  A6 ←─ {A1 slim, A4, A5}  ─→ s1..s6
  Node0: freeze(s3,s5,s6) + post-walidatory leksykalne
  A7 ←─ {s1,s2,s4 + pratfall + kategoria}  ─→ diff: {s1',s2',s4'}
  Node0: merge + walidatory ponownie
  A8, A9 (wizja) — bez zmian logiki, C2PA w kodzie
  A10 ←─ {raport pre-audytu, s1',s2',s4', log A5, flagi A9}  ─→ werdykt + patche
  Node0: apply_patches → verify_frozen → eksport HITL
```

Kluczowa zmiana bezpieczeństwa: **sekcje 5 i 6 (parametry, ostrzeżenia CLP/GPSR,
podmiot odpowiedzialny) po wygenerowaniu przez A6 nie przechodzą już przez ŻADEN
model generatywny.** Integralność gwarantuje hash, nie obietnica w prompcie.

---

## 5. KOLEJNOŚĆ WDROŻENIA (minimalne ryzyko)
1. **Dzień 1:** usunięcie referencji A3 z Node 0 i A10 (zatrzymuje fałszywe pętle rewizyjne — natychmiastowy zysk). Ustawienie `thinkingBudget` wg tabeli — zmiana wyłącznie w konfiguracji wywołań, zero zmian w promptach, ~30–40% oszczędności od ręki.
2. **Dzień 2–3:** cache prefiksów (przestawienie danych SKU na koniec promptu) + `responseSchema` zamiast schematów w treści.
3. **Tydzień 1:** walidatory kodowe §2 + routing A4 w kodzie.
4. **Tydzień 2:** diff-owe A7 i patchowe A10 + zamrażanie sekcji (wymaga zmiany merge'a w Orkiestratorze). Testy A/B na 50 SKU z pełnym audytem HITL przed przełączeniem.

## 6. METRYKI SUKCESU (do monitoringu, ten sam dashboard)
- thoughtsTokenCount/completionTokens < 0.5 dla węzłów ekstrakcyjnych (dziś 3–4×).
- cachedContentTokenCount > 60% promptTokens od 2. wywołania danego węzła.
- A4 wywoływany tylko przy is_chemical=true (spadek liczby rekordów A4).
- 0 pętli rewizyjnych z error_code dotyczącym node_3_title.
- 100% zgodności hashy sekcji 5/6 (nowy twardy licznik bezpieczeństwa).
