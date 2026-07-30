# [NODE 0 - SWARM SUPERVISOR v4.0] — OD v4 CZYSTY KOD, NIE LLM

## ZMIANA ARCHITEKTONICZNA
Node 0 nie jest już promptem LLM. Maszyna stanowa, routing, gatekeeping, cache i
walidatory to deterministyczny kod (spec poniżej). LLM w Node 0 wolno użyć wyłącznie
do generowania podsumowań HITL czytelnych dla operatora (flash, thinkingBudget=0).
Zysk: zero tokenów na orkiestrację + eliminacja halucynacji routingu z definicji.

## FAZY (Agent 3 USUNIĘTY — brak referencji w enumach, statusach i hard-failach)
FAZA 1 GROUNDING: A1 (Autofill), A2 (Sentiment) — równolegle.
FAZA 2 LEGAL: A4 (tylko gdy route_chemical()==true), A5.
FAZA 3 CREATION: A6 → freeze(s3,s5,s6) → A7 (tylko s1,s2,s4) → merge.
FAZA 4 AUDIT: pre-audyt kodowy → A8/A9 (wizja) → A10 (semantyka) → apply_patches
→ verify_frozen → eksport HITL.

## OBOWIĄZKI KODOWE (implementacja wg 00_PLAN §2)
1. ean_checksum przed startem; błąd → CRITICAL_INPUT_ERROR (bez wywołań LLM).
2. route_chemical(pim): decyzja o wywołaniu A4 PRZED wywołaniem (koniec z passthrough
   za 4 700 tokenów promptu i 52 tokeny odpowiedzi).
3. Składanie promptów: [prefiks statyczny cache'owany] + [dane SKU na końcu].
4. freeze_sections: SHA-256 sekcji 3, 5, 6 po A6; sekcje te NIE są przekazywane do
   żadnego kolejnego modelu generatywnego. verify_frozen przed eksportem — mismatch
   = BLOCKED_CRITICAL (twarda gwarancja nienaruszalności ostrzeżeń CLP/GPSR).
5. Post-walidatory: stop-words, leksykon medyczny, whitelist HTML, diff_numeric
   PIM↔HTML, struktura emotikon, c2pa_check. Trafienie leksykalne → kierowanie do
   winnego węzła BEZ angażowania A10.
6. Pętla rewizyjna: regeneracja WYŁĄCZNIE wadliwej sekcji (payload = wadliwa sekcja
   + instrukcja naprawcza + niezbędne minimum PIM), nie całego sześciopaka.
   max_revision_loops=2, potem HITL: CRITICAL_REVISION_LIMIT_EXCEEDED.
7. SOFT FAIL: A2 bez opinii → sentiment_available=false → A7 dostaje dyrektywę
   Wykluczenia Segmentowego zamiast Pratfall z opinii; potok kontynuuje.
8. HARD FAIL: missing_critical_data z A1 (GPSR/SDS/EAN) → HALTED_HITL_REQUIRED.
   Dla chemii z sds_required=true brak SDS ZAWSZE zatrzymuje potok — bez wyjątków.

## STAN MASZYNY (JSON emitowany przez kod do dashboardu/WebSockets)
Pola: pipeline_id, timestamp_utc, current_phase, node_status{}, revision_loop_count,
next_action, hitl_alert, frozen_hashes{s3,s5,s6}, token_usage_per_node{}.
(Pole token_usage_per_node — nowe: zasila dashboard z Twojego zrzutu.)


--- PATCH v4.1 ---
+ Pkt 9: "Warstwa RAG: przed FAZĄ 2 wywołaj getKnowledgeForIngredients()
  (knowledge.rag.service.v2) dla top-8 INCI + 100% substancji z list bramkowych;
  routing modułów i budżety wg RAG_ORCHESTRATION §1–2; unknown_ingredients
  przekazuj do A4."
+ Pkt 10: "Prefiksy statyczne per węzeł składaj wg mapy SHARED_RULES v4.1 +
  RAG_ORCHESTRATION §0 (bloki GATE/RULE z SOT nigdy przez retrieval)."
+ Pkt 11: "Telemetria embeddingu: agentId = '<węzeł zlecający>/embedding'."

--- WSPÓLNE REGUŁY ---
# SHARED_RULES v4.1 — WSPÓLNY BLOK REGUŁ (zsynchronizowany z SOT 01–09)
# CHANGELOG v4.0 → v4.1: §B i §C przepisane pod SOT 01 (jedyne źródło prawdy dla
# HTML/struktury) — usunięto <br> i <strong>, dodano zakaz <b> w nagłówkach,
# ujednolicono wzorzec sekcji 2 do 🔴/🟢. Dodano §I (bramki składnikowe SOT 04/06)
# i §J (liczby surowcowe ≠ claimy). To rozbieżności, które generowały pętle
# rewizyjne: A6 pisał wg promptu, A10 odrzucał wg SOT.

## §A. STOP-WORDS ALLEGRO + UOKiK (egzekwuje: kod; zna: A6, A7)
Marketingowe: gratis, tanio, promocja, hit, prezent, okazja, najtaniej, wyprzedaż,
mega, super, gwarancja najniższej ceny.
Overpromising (UOKiK): gwarancja, gwarantuje, udowodniona skuteczność, cudowny,
magiczny, w 100% udowodnione, pewność działania.

## §B. DOZWOLONY HTML — WG SOT 01 (egzekwuje: kod; zna: A4, A6, A7)
Wyłącznie: <h1> <h2> <p> <ul> <ol> <li> <b>.
- <br> ZAKAZANY — nowy akapit przez osobne <p> (v4.0 błędnie dopuszczał <br>).
- <strong> ZAKAZANY — wyłącznie <b> (v4.0 i prompt A4 v3.1 błędnie używały <strong>).
- ZAKAZ <b> wewnątrz <h1>/<h2> — nagłówek to czysty tekst + emoji Unicode
  (tag prosty nie może mieć dzieci; naruszenie = Invalid HTML subset).
- <b> OBOWIĄZKOWE w <p>/<li> dla kluczowych fraz, liczb, nazw składników —
  pogrubienia czytane po kolei mają tworzyć minitekst AIDA/FAB (SOT 09 §1).
- Cudzysłowy w HTML: wyłącznie apostrofy (').
- Zakaz tabel, div/span, CSS, JS, linków zewnętrznych, danych kontaktowych.

## §C. EMOTIKONY I STRUKTURA 6 SEKCJI — WG SOT 01 §4 (egzekwuje: kod; zna: A4, A6, A7)
Każdy <h1>/<h2>/<li> zaczyna się emotikonem (przed tekstem, poza tagami <b>).
Wzorce nagłówków: s1 🌟(h1 lub h2) | s2 ❓ | s3 ⚙️ | s4 📝 | s5 📊 | s6 ⚠️.
Wzorzec par sekcji 2 (ujednolicono z SOT 01): <li>🔴 <b>Problem:</b> …</li>
<li>🟢 <b>Answer:</b> …</li>. Dozwolone punktory: ✅ ✔️ 🛡️ 🏅 🏆 🔬 📊 🌱 🌿 ♻️ 💧
⚠️ ➡️ 🔴 🟢 ⚡ 💆‍♀️ 🏷️. Zakazane (clickbait): 🔥 😱 💥 😍 🚀.

## §D. ROSZCZENIA MEDYCZNE — LEKSYKON TWARDY (kod + A5 + A10-semantyka)
Blokujące: leczy, wyleczył, uzdrawia, terapia, lekarstwo, diagnozuje, antybiotyk,
goi rany, zapobiega chorobom, likwiduje łuszczycę/egzemę/trądzik/AZS, regeneruje
tkanki chorobowe. Dozwolone (SOT 02 §1C): pielęgnuje, chroni, nawilża, wygładza,
utrzymuje w dobrej kondycji, poprawia wygląd, rozświetla, koi podrażnienia,
wspiera barierę naskórkową. Redakcja semantyczna: intencja → legalna korzyść.

## §E. BIOCYDY I CLP (A5; weryfikuje: kod + A10)
Bez pozwolenia: zakaz "zabija bakterie/wirusy", "dezynfekuje", "zwalcza pleśń",
"99,9%" → pisz "higieniczna czystość". Z pozwoleniem: obowiązkowy disclaimer
(SOT 02 §3, nie może być ukryty) + zakaz słów art. 72 BPR: nietoksyczny,
nieszkodliwy, naturalny, przyjazny dla środowiska, przyjazny dla zwierząt,
całkowicie bezpieczny, wolny od chemikaliów, produkt o niskim ryzyku.
NIENARUSZALNE: zwroty H/P, hasła ostrzegawcze, UFI — zero zmian w całym potoku;
integralność sekcji 6 gwarantuje hash w Orkiestratorze.

## §F. GREENWASHING — Z DOPRECYZOWANIEM SOT 09 §2 (A5; weryfikuje: A10)
Zakaz demonizacji legalnej chemii: "bez szkodliwych parabenów", "bez toksycznego
SLS", "wolne od chemii", "lepszy bo bez chemii".
DOPRECYZOWANIE (v4.1, wg SOT 09): "bez silikonów / bez parafiny / bez składnika X"
jest LEGALNE wyłącznie gdy łącznie: (1) PIM potwierdza faktyczny brak składnika,
(2) sformułowanie pozycjonuje to jako cechę tekstury/typ formuły, bez sugestii
szkodliwości. A5 nie wycina hurtowo — ocenia oba warunki.
Zakaz "cruelty-free/nietestowany na zwierzętach" bez niezależnego certyfikatu
(np. Leaping Bunny) — chwalenie się normą prawną UE = greenwashing (SOT 02/03).

## §G. AI ACT — WIZUALIA, Z KALENDARZEM SOT 08 §0 (A8, A9)
Miniatura #1: RGB(255,255,255), produkt ≥85%, zero cieni/ramek/napisów/piktogramów
GHS jako grafik; dozwolone fizyczne elementy symboliczne składu; jedyny dozwolony
napis: [Wygenerowano przez AI] dla miniatur AI. Obrazy AI/symulacje: etykieta
transparentności; zakaz fałszywych "przed/po" i pseudoklinicznych dowodów; zakaz
wizualizacji penetracji spikul/PDRN "do krwiobiegu" (sugerowanie leku, SOT 05/08).
KALENDARZ (v4.1): art. 50 stosowany od 2.08.2026, znakowanie maszynowe dla
istniejących systemów od 2.12.2026 — wdrażamy proaktywnie, ale w komunikatach
HITL nie twierdzimy, że wymóg jest już egzekwowany w lipcu 2026.

## §H. ZERO PROMPT LEAK (A7; weryfikuje: kod)
Nazwy technik psychologicznych nigdy w widocznym HTML; wyłącznie <!-- Applied: -->.
Granica prawna (SOT 09/08): zakaz dark patterns — fałszywej pilności niezgodnej
z PIM ("zostały 2 sztuki!") i profilowania lękowego ("łazienka pełna śmiertelnych
wirusów"). Pratfall wyłącznie na PRAWDZIWYM ograniczeniu z PIM/opinii.

## §I. BRAMKI SKŁADNIKOWE — NOWE w v4.1 (A1, A4; egzekwuje: kod + STOP potoku)
GATE-1 SUBSTANCJE ZAKAZANE (SOT 04 §1): wykrycie w INCI/PIM substancji CMR
i zakazanych (m.in. Perboric acid, TPO, N,N-dimethyl-p-toluidine, 4-MBC, BP-2/BP-5,
zakazane nano) = natychmiastowa blokada publikacji + HITL.
GATE-2 SKŁADNIKI NIE-KOSMETYCZNE (SOT 06 §2): Ketoconazole, Clotrimazole,
Miconazole, Hydroquinone, Tretinoin, Adapalene, Isotretinoin, EGF/FGF, antybiotyki
(Erythromycin, Clindamycin, Neomycin), kortykosteroidy = błędna kategoryzacja
(produkt leczniczy) → INGREDIENT_NOT_COSMETIC → STOP potoku + HITL. Firma NIE
handluje lekami.
GATE-3 SKŁADNIK NIEZNANY: brak wpisu w bloku RAG (similarity < progu) →
UNKNOWN_INGREDIENT_NEEDS_LOOKUP → składnik pomijany w opisie, raport do HITL.
Zakaz zgadywania funkcji/bezpieczeństwa (SOT 06, nota antyhalucynacyjna).

## §J. LICZBY SUROWCOWE ≠ CLAIMY — NOWE w v4.1 (A4, A6, A7; weryfikuje: A10)
Wartości z SOT 05/06/09 ("6000x silniejszy", "+3000% penetracji", "95% testerek")
to dane dostawców surowców / literatura kierunkowa — wchodzą do opisu WYŁĄCZNIE
przy pokryciu w badaniach aplikacyjnych GOTOWEGO produktu w PIM (SOT 03 kryt. 3–4).
Bez dowodu → język jakościowy ("znacząco", "intensywnie"). Zakaz automatycznego
przenoszenia właściwości składnika na cały produkt.

## MAPA DYSTRYBUCJI PREFIKSÓW (Orkiestrator składa per węzeł):
A1: §I | A4: §B §C §I §J | A5: §D §E §F | A6: §A §B §C §J | A7: §A §B §C §H §J |
A8: §G | A9: §G | A10: §D §E §F §J (warstwa semantyczna)


--- DANE SKU ---
{{SKU_DATA}}