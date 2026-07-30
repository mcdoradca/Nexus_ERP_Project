# PATCH v4.0 → v4.1 — ZMIANY W PROMPTACH WYNIKAJĄCE Z INTEGRACJI SOT/RAG
# Format: co zmienić w plikach Agent_X_prompt_v4.md. Zmiany małe, punktowe —
# nie regeneruję całych plików (zasada diff, którą sami wdrażamy w potoku).

## Agent_1_prompt_v4.md
+ Do sekcji ZAKRES POZYSKANIA dodaj pkt 6: "Bramka GATE-1 (SHARED_RULES §I):
  jeśli w INCI/PIM występuje substancja z listy zakazanych SOT 04 §1, ustaw
  missing_critical_data=true z powodem BANNED_SUBSTANCE_DETECTED — blokada
  publikacji, HITL."
+ Do sekcji GPSR/CLP dopisz: "Dla chemii domowej pozyskuj dane wg potoku
  SOT 07 §3 (SDS sekcje 3/9/11, Arkusz Danych Składników 648/2004, rejestry
  Ecolabel, cross-referencing EAN dla wydajności roboczej)."

## Agent_4_prompt_v4.md
+ Nowa sekcja BRAMKI WEJŚCIOWE (przed FORMAT GEO):
  "Zanim przetłumaczysz jakikolwiek składnik: (1) GATE-2 — jeśli w INCI jest
  substancja lecznicza z listy §I (ketokonazol, hydrochinon, tretinoina,
  antybiotyki, kortykosteroidy, EGF/FGF), zwróć status INGREDIENT_NOT_COSMETIC
  i zakończ — produkt jest błędnie skategoryzowany, potok STOP + HITL.
  (2) GATE-3 — składnik obecny w INCI, ale nieobecny w bloku RAG → oznacz
  UNKNOWN_INGREDIENT_NEEDS_LOOKUP w polu unknown_ingredients[], pomiń w opisie,
  nie zgaduj funkcji."
+ W FORMAT GEO zamień wszystkie <strong> na <b> (SOT 01). Dodaj: "Zakaz <b>
  wewnątrz nagłówków; zakaz <br>."
+ Dodaj dyrektywę §J: "Liczby z bloku RAG (SOT 05/06) to dane surowcowe —
  zakaz przenoszenia jako claim liczbowy o produkcie bez dowodu w PIM;
  stosuj język jakościowy."
+ Do WYJŚCIA dodaj pola: gate_status (PASSED | INGREDIENT_NOT_COSMETIC |
  BANNED_SUBSTANCE_DETECTED), unknown_ingredients[].
+ Blok wejściowy: "--- BLOK RAG (z getKnowledgeForIngredients: wpisy SOT 06/10/05/04
  per składnik + lista unknown_ingredients) + DANE SKU ---".

## Agent_5_prompt_v4.md
+ SKANER 3 (greenwashing) doprecyzuj wg §F v4.1: "'bez składnika X' oceniaj
  dwuwarunkowo (prawdziwość w PIM + brak demonizacji) — nie wycinaj hurtowo
  legalnych deklaracji tekstury (SOT 09 §2)."
+ Dodaj SKANER 6 (Omnibus VIII, SOT 02 §1B): "Przekroczenie limitów CMR
  (2%/0,5%/0,3%) w produkcie wprowadzonym do obrotu PRZED 1.05.2026 = okres
  przejściowy do 31.07.2028 → alert HITL z datami, NIE automatyczna blokada.
  Produkt wprowadzony PO 1.05.2026 → BLOCKED_CRITICAL_LEGAL_BREACH."
+ Prefiks statyczny: pełne teksty SOT 02 §3 (czarna lista BPR + disclaimer),
  SOT 03 §1–2 (6 kryteriów claims), SOT 02 §1C (słownictwo) — wklejone
  deterministycznie, NIE przez retrieval.

## Agent_6_prompt_v4.md
+ §B/§C v4.1: usuń <br> i <strong> z dozwolonych; zakaz <b> w nagłówkach;
  <b> obowiązkowe dla kluczowych fraz w <p>/<li> (minitekst AIDA z pogrubień).
+ Sekcja 2: wzorzec par zmień z ❓/💡 na 🔴 <b>Problem:</b> / 🟢 <b>Answer:</b>
  (zgodność z SOT 01 §4 — dotychczasowa rozbieżność powodowała odrzuty w audycie).
+ Sekcja 1: nagłówek h1 bez <b> w środku; pogrubienia dopiero w <p> pod spodem.
+ Dodaj §J (liczby surowcowe ≠ claimy).
+ Blok wejściowy: dla HOUSEHOLD_CHEMISTRY dołączany jest RAG z SOT 07 §2 / SOT 10
  (grupy funkcjonalne wykrytych składników) — korzystaj z niego przy s3 zamiast
  wiedzy własnej.

## Agent_7_prompt_v4.md
+ Do dyrektyw dodaj granicę SOT 09/08: "Zakaz dark patterns: fałszywej pilności
  niezgodnej z PIM i profilowania lękowego. Pratfall wyłącznie na prawdziwym
  ograniczeniu." (dotąd tylko implicite)
+ M3 Kotwica Rutyny: przeliczenia podawaj jako szacunek ("ok. 45 dni"), nie twardy
  claim (SOT 09 §4); Zestawy Systemowe — cross-selling wyłącznie wzmianką o rutynie,
  bez łączenia produktów w opisie (SOT 01 §1).
+ §B v4.1: pilnuj braku <br>/<strong> także we wstrzykiwanych fragmentach.

## Agent_9_prompt_v4.md
+ SKANER S2: dodaj zakaz wizualizacji penetracji spikul/PDRN do krwiobiegu
  (SOT 08 §3 — sugerowanie leku).
+ Dodaj sekcję KALENDARZ AI ACT (SOT 08 §0): "Art. 50 stosowany od 2.08.2026;
  znakowanie maszynowe dla istniejących systemów od 2.12.2026. Egzekwuj etykiety
  proaktywnie, ale w raportach HITL opisuj jako 'wdrażane proaktywnie przed datą
  stosowania', nie jako obowiązek już egzekwowany." (Korekta v3.1, który
  twierdził, że wymóg już obowiązuje.)

## Agent_10_prompt_v4.md
+ F1 rozszerz o §J: "Wykryj liczbowe claimy skuteczności ('95% testerek',
  'redukcja o 20%') bez pokrycia w PIM — to halucynacja claimowa (SOT 03 kryt. 3),
  routing → Agent_6 lub Agent_4."
+ F2 doprecyzuj wg §F v4.1 (dwuwarunkowa ocena 'bez składnika X').
+ Dodaj do F5: obsługa statusów bramek z A4 (INGREDIENT_NOT_COSMETIC /
  BANNED_SUBSTANCE_DETECTED nigdy nie mogą dotrzeć do A10 — jeśli dotarły,
  to błąd Orkiestratora → BLOCKED_CRITICAL_HITL_ESCALATION).

## Node 0 (Agent_0_prompt_v4.md) — obowiązki kodowe
+ Pkt 9: "Warstwa RAG: przed FAZĄ 2 wywołaj getKnowledgeForIngredients()
  (knowledge.rag.service.v2) dla top-8 INCI + 100% substancji z list bramkowych;
  routing modułów i budżety wg RAG_ORCHESTRATION §1–2; unknown_ingredients
  przekazuj do A4."
+ Pkt 10: "Prefiksy statyczne per węzeł składaj wg mapy SHARED_RULES v4.1 +
  RAG_ORCHESTRATION §0 (bloki GATE/RULE z SOT nigdy przez retrieval)."
+ Pkt 11: "Telemetria embeddingu: agentId = '<węzeł zlecający>/embedding'."
