# 🚀 MATRYCA KOMPETENCYJNA AGENTA AI: ARCHITEKTURA OPISÓW AEO/GEO DLA KOSMETYKÓW I CHEMII DOMOWEJ NA ALLEGRO (RAG & MULTI-AGENT EDITION 2026)

**Dokumentacja techniczno-prawna dla systemów zautomatyzowanego generowania treści (LLM / AI Agents / RAG Orchestrators)**
**Wersja specyfikacji:** 2026.07-FINAL-V3-RAG-EDITION
**Jurysdykcja:** Unia Europejska / Rzeczpospolita Polska / Platformy Marketplace (Allegro)
**Sektory wiodące:** Kosmetyki (Beauty & Care) / Chemia Domowa i Detergenty / Biocydy
**Klasyfikacja:** Nadrzędna specyfikacja architektury dla orkiestratora `gemini-embedding-2` i agentów 0–10

> **📌 ROLA TEGO DOKUMENTU (higiena RAG):** To **spis nadrzędny** spinający architekturę. Szczegóły merytoryczne są w plikach SOT i NIE są tu powielane:
> - Prawo kosmetyczne / chemia / biocydy → **SOT 02**
> - Kryteria oświadczeń (claims) + sanityzacja opinii → **SOT 03**
> - Limity stężeń / alergeny / CMR → **SOT 04**
> - Synergie i biotech → **SOT 05** · Słownik INCI → **SOT 06** · Chemia domowa → **SOT 07**
> - AI Act → **SOT 08** · Psychologia → **SOT 09** · Reguły Allegro + 6 sekcji → **SOT 01**
> - Prompty systemowe agentów → **Master_Prompts_Swarm_AI_Nodes_0_to_10**
> W razie rozbieżności obowiązują pliki SOT (są źródłem prawdy dla swoich domen).

---

## ROZDZIAŁ 1: STRESZCZENIE REGULACYJNE (STAN NA LIPIEC 2026 R.)

Obrót kosmetykami i chemią domową podlega w 2026 r. surowym rygorom (UOKiK, GIS, URPL, PIH). Poniżej skrót; pełne reguły → SOT 02/03/04.

### 1.1. Kosmetyki (1223/2009, CPNP, Omnibus VIII)
* **Omnibus VIII = Rozp. (UE) 2026/78** – zmiana dot. substancji CMR (nie „regulacja o zapachach"), stosowana od **1 maja 2026 r.** Wprowadza zakazy substancji oraz – dla substancji objętych odstępstwem art. 15 – limity w gotowym produkcie: perfumy ≤ 2%, spłukiwane ≤ 0,5%, **niespłukiwane ≤ 0,3%**. Okres przejściowy dla produktów już w obrocie: do **31 lipca 2028 r.** (szczegóły + rozróżnienie od progów alergenowych → SOT 02/04).
* **CPNP:** weryfikacja notyfikacji przed publikacją.
* **Claims 655/2013:** 6 kryteriów (zgodność z prawem, prawdziwość, dowody, uczciwość, fair play wobec konkurencji, jasność) → SOT 03.
* **ISO 16128:** % naturalności wyłącznie z certyfikatem (BIOAGRICERT, ECOCERT, COSMOS, Vegan Society).
* **Anti-Greenwashing:** zakaz „bez freonów", „bez ftalanów", „cruelty-free bez certyfikatu" jako przewagi. Zakaz wprowadzania do obrotu kosmetyków testowanych na zwierzętach obowiązuje w UE od 2013 r. (testowania – wcześniej), więc to powszechny wymóg, nie zaleta. Reguła „bez silikonów" → dozwolona warunkowo (SOT 09).

### 1.2. Chemia domowa (CLP 1272/2008, 648/2004, REACH, GPSR)
* Klasyfikacja CLP → obowiązkowe w opisie i parametrach: hasło NIEBEZPIECZEŃSTWO/UWAGA, zwroty H, zwroty P, kod UFI (na zdjęciu etykiety). Szczegóły → SOT 02/07.
* Detergenty 648/2004: biodegradowalność, przedziały % składników, arkusz dla personelu medycznego.
* REACH 2023/2055: zakaz mikroplastików.

### 1.3. Biocydy (BPR 528/2012)
* Numer pozwolenia URPL/ECHA obowiązkowy.
* Disclaimer biobójczy (nieukryty). Czarna lista słów Art. 72 → SOT 02.

---

## ROZDZIAŁ 2: ARCHITEKTURA MULTI-AGENT (WĘZŁY 0–10)

Numeracja obowiązująca w całym projekcie (spójna z Master_Prompts):

```
[PIM/ERP: EAN, INCI, SDS/CLP, Certyfikaty]
                │
                ▼
   ORKIESTRATOR RAG (gemini-embedding-2) + Agent 0 (Supervisor)
                │
   FAZA 1 – GROUNDING:   Agent 1 (PIM Autofill) · Agent 2 (Sentiment Scraper) · Agent 3 (SEO Title)
   FAZA 2 – LEGAL SHIELD: Agent 4 (INCI Parser) · Agent 5 (Legal Sanitizer)
   FAZA 3 – CREATION:     Agent 6 (Copywriter) · Agent 7 (Psychology) · Agent 8 (Scenographer)
   FAZA 4 – AUDIT:        Agent 9 (Vision Auditor) · Agent 10 (Sentinel → HITL)
```

**Kluczowa zasada potoku:** warstwa kreacji (Agent 6+) nie startuje przed zamknięciem warstwy badawczej (1-3) i prawnej (4-5). Pełne prompty każdego agenta → Master_Prompts.

### 2.1. Mapowanie INCI → Korzyść AEO (Agent 4)
Agent 4 rozbija INCI, znajduje profil w RAG (SOT 05/06) i tłumaczy na Język Korzyści – **bez roszczeń leczniczych**. Jeśli składnika nie ma w bazie → `UNKNOWN_INGREDIENT_NEEDS_LOOKUP` (nie zgaduje). Jeśli składnik jest nie-kosmetyczny (lek) → `INGREDIENT_NOT_COSMETIC` + STOP (SOT 06 sekcja 2).
*Przykład:* `Ascorbic Acid` → antyoksydant → *„Wyrównanie kolorytu, redukcja widoczności przebarwień i ochrona przed stresem oksydacyjnym"* (bez „stymuluje syntezę kolagenu" jako claimu leczniczego bez dowodu).

### 2.2. Sanityzacja opinii (Agent 2 zbiera → Agent 5 czyści)
Sprzedawca odpowiada za każdą cytowaną opinię. Agent 5 wycina roszczenia medyczne/biobójcze przed przekazaniem do Agenta 6. Macierz sanityzacji → SOT 03 / Master_Prompts (Węzeł 5).

| Surowy komentarz z sieci (po EAN) | Naruszenie | Bezpieczny Problem AEO (po sanityzacji) |
| :--- | :--- | :--- |
| „To serum jako jedyne wyleczyło moją egzemę i rany od słońca!" | Roszczenie lecznicze (1223/2009) | Skóra podrażniona czynnikami zewnętrznymi, z oznakami stresu oksydacyjnego po ekspozycji na słońce, potrzebująca ukojenia bez obciążania. |
| „Inne sera z wit. C brązowieją, a to w perłach nie utlenia się." | Brak naruszeń – cenny social proof | Niestabilność i utlenianie (brązowienie) witaminy C w tradycyjnych kosmetykach wodnych. |
| „Ten płyn zabił wszystkie bakterie, jest nietoksyczny, umyję nim owoce dla dziecka!" | Roszczenie biobójcze bez pozwolenia + słowo zakazane „nietoksyczny" (BPR) | Poszukiwanie detergentu usuwającego zaschnięty tłuszcz i osady, łagodnego dla dłoni. |

---

## ROZDZIAŁ 3: RYGORY ALLEGRO (SKRÓT – PEŁNE REGUŁY W SOT 01)

### 3.1. GPSR i SDS w API
Dane Producenta i Osoby Odpowiedzialnej w UE (brak = blokada oferty). Dla chemii z CLP: załącznik SDS (PDF/zdjęcie) po polsku + zwroty H/P w sekcji 6. Dla kosmetyków: ostrzeżenia z etykiety w polu GPSR.

### 3.2. Grafika
Miniatura: białe tło RGB(255,255,255), bez napisów/piktogramów CLP (wyjątek: etykieta AI). Galeria: dla chemii CLP obowiązkowe zdjęcie tylnej etykiety z GHS/UFI. Szczegóły + AI Act → SOT 01 / SOT 08.

### 3.3. KPA – nienaruszalność specyfikacji
Opis nie może podawać parametrów sprzecznych z Katalogiem (np. „50 ml" gdy KPA = 30 ml → blokada). Parametry sztywne: EAN, Marka, Kod producenta, Pojemność/Waga, Certyfikaty, Wyrób medyczny: Tak/Nie. Agent 10 robi diff-check opisu z PIM.

---

## ROZDZIAŁ 4: STANDARD OPISU 6 SEKCJI – SZKIELET

Pełna specyfikacja tagów i układu → **SOT 01 sekcja 3-4**. Poniżej minimalny szkielet strukturalny (nie pełny przykład).

**Twarde reguły HTML (SOT 01):** dozwolone WYŁĄCZNIE `<h1>`, `<h2>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<b>`. **Zakaz `<br>`, `<i>`, `<div>`, CSS, tabel.** Zakaz `<b>` w nagłówkach. `<b>` obowiązkowe w treści. Emoji przed tekstem nagłówka i każdego `<li>`.

```
Sekcja 1 (<h1> + <p>): Tytuł z USP i pojemnością + 2-3 zdania obietnicy (kluczowe frazy <b>).
Sekcja 2 (<h2> ❓ + <ul>): pary 🔴 Problem / 🟢 Answer z danych Agenta 5.
Sekcja 3 (<h2> ⚙️ + <ul>): mechanizm (System 2w1) + składniki INCI od Agenta 4.
Sekcja 4 (<h2> 📝 + <ol>): dozowanie, obszar, aplikacja, kotwica rutyny (SOT 09).
Sekcja 5 (<h2> 📊 + <ul>): parametry KPA (Marka, EAN, pojemność, certyfikaty, pH, wyrób medyczny).
Sekcja 6 (<h2> ⚠️ + <p>/<ul>): bezpieczeństwo, przechowywanie, status prawny, dla chemii H/P.
```

**Wzorcowy fragment (Sekcja 1 – jedna sekcja jako referencja formatu):**
```html
<h1>🌟 L'Erboristica Perły Serum z Witaminą C i Luminescine 30 ml – Rozświetlenie i Ochrona Antyoksydacyjna</h1>
<p>Odkryj synergię natury i nowoczesnej kosmetologii. <b>Serum z linii Pearls</b> łączy <b>stabilizowaną witaminę C</b> w mikrokapsułkach z opatentowanym kompleksem <b>Luminescine®</b> (ekstrakt z kwiatów dziewanny). Formuła oparta w <b>95% na składnikach pochodzenia naturalnego</b> (certyfikat <b>BIOAGRICERT</b>) przywraca skórze blask i zapewnia tarczę antyoksydacyjną, zachowując lekką konsystencję.</p>
```
*Uwaga: „lekka konsystencja bez silikonów" dozwolona TYLKO gdy PIM potwierdza brak silikonów i bez sugestii, że silikony są szkodliwe (SOT 09). Pełny 6-sekcyjny przykład generuje Agent 6 na żywo – nie utrwalamy go tutaj, by uniknąć dryfu wzorca.*

---

## ROZDZIAŁ 5: PROMPTY SYSTEMOWE

Kompletne metaprompty wszystkich 11 agentów (parametry API, reguły, formaty JSON) znajdują się w osobnym pliku **Master_Prompts_Swarm_AI_Nodes_0_to_10**. Nie powielamy ich tutaj (higiena RAG).

---

## PODSUMOWANIE

Ta specyfikacja spina architekturę multi-agent (0–10) z warstwą wiedzy (SOT 01–09) i warstwą promptów (Master_Prompts). Zasada nadrzędna: **każdy twardy fakt (limit, status składnika, klasyfikacja) pochodzi z właściwego SOT lub bazy referencyjnej – agent nigdy nie zgaduje.** Warstwa danych referencyjnych (pełna tabela składników INCI/CAS + statusy prawne) jest budowana jako osobny moduł i podłączana do Agenta 4 jako deterministyczny lookup, uzupełniający semantyczny RAG.

*Stan prawny: lipiec 2026 r. Pliki SOT są źródłem prawdy dla swoich domen.*
