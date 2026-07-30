# 📘 RAG SOT 01: ARCHITEKTURA I REGULAMIN ALLEGRO 2026 (MARKETPLACE RULES)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 1
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 3 (SEO Title), Agent 6 (Copywriter), Agent 9 (Vision Auditor), Agent 10 (Sentinel)
**Stan prawny:** Regulamin Allegro + dokumentacja Allegro REST API (stan na lipiec 2026 r.) + wytyczne UX Mobile First

> **Nota o źródłach (higiena RAG):** Ten plik jest **jedynym źródłem prawdy** dla reguł technicznych Allegro (dozwolone tagi HTML, tytuł, miniatura) oraz **wzorca 6 sekcji**. Reguły prawne dot. treści (claims, medyczne, biocydy) → SOT 02/03. Numeracja agentów zgodna z plikiem Master Prompts (węzły 0–10).

---

## 1. TWARDE ZAKAZY TECHNICZNE I TREŚCIOWE (ABSOLUTE BANS)

*   **Manipulacja wyszukiwarką (Keyword Stuffing):** Bezwzględny zakaz sztucznego nasycania tytułu, parametrów i opisu słowami kluczowymi. Algorytmy AI Allegro odrzucają payloady z nienaturalnym ciągiem fraz.
*   **Dane kontaktowe w opisie:** Zakaz umieszczania numerów telefonów, adresów e-mail, komunikatorów, numerów kont bankowych w treści opisu, na grafikach i w tle (wyjątek: kategoria *Produkty spożywcze > Catering*).
*   **Wyprowadzanie transakcji (Outbound Links):** Całkowity zakaz linków do sklepów zewnętrznych i stron sprzedażowych. Dopuszczalne są wyłącznie linki do instrukcji obsługi/rozszerzenia wiedzy na serwerach nieprowadzących sprzedaży.
*   **Reklama zewnętrzna i banery:** Zakaz reklamowania działalności poza Allegro. Banery na liście ofert mogą zawierać tylko logo marki/producenta i informacje o towarze – zakaz haseł promocyjnych i imitacji przycisków („Dodaj do koszyka").
*   **Niedozwolone słownictwo (Filtr Czasu Rzeczywistego):** Zakaz używania w opisie słów promocyjnych: `gratis`, `tanio`, `promocja`, `hit`, `prezent`, `okazja`, `gwarancja najniższej ceny`. Dodanie gratisu do oferty musi odbywać się przez systemową funkcję **Zestawów Produktowych**, a nie opis tekstowy.
*   **Wybór wariantu w opisie:** Zakaz zmuszania Kupującego do wyboru istotnej cechy (rozmiar, model, zapach) w wiadomości do sprzedającego. Należy stosować systemowe **Warianty Produktowe**. (Wyjątek: wybór koloru/wzoru z dostępnej puli w ofertach wielosztukowych).
*   **Zestawy w opisie:** Zakaz łączenia różnych produktów w jednym opisie bez użycia systemowego narzędzia Wielopaków/Zestawów.

---

## 2. TWARDE WYMOGI I STANDARDY INTEGRACJI (MANDATORY REQUIREMENTS)

*   **Katalog Produktów Allegro (KPA):** Obowiązkowe powiązanie oferty z Produktem na podstawie prawidłowego, zarejestrowanego w GS1 kodu **GTIN/EAN**. Parametry w opisie autorskim nie mogą być sprzeczne ze specyfikacją KPA!
*   **Zgodność z rzeczywistością:** Tytuł, opis, parametry i zdjęcia muszą dotyczyć wyłącznie oferowanego przedmiotu i nie mogą wprowadzać w błąd.
*   **Stan przedmiotu:** Obowiązek stosowania oficjalnego słownika stanów (np. `Nowy`, `Nowy z defektem`, `Używany`, `Odnowiony przez producenta`, `Powystawowy`).
*   **Cena:** Wyłącznie w kwocie brutto (z VAT), w walucie docelowego Marketplace (`pl`, `cz`, `sk`, `hu`).
*   **Reżim GPSR (Rozporządzenie UE 2023/988):** Obowiązkowe uzupełnienie w parametrach/API danych Producenta, Osoby Odpowiedzialnej w UE (dla importu) oraz załączenie instrukcji i ostrzeżeń bezpieczeństwa po polsku (lub w języku rynku docelowego).

---

## 3. DOZWOLONE ZNACZNIKI HTML W OPISIE (TWARDA REGUŁA API)

Opis oferty na Allegro to **podzbiór HTML**. Dozwolone są **wyłącznie** tagi:
`<h1>`, `<h2>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<b>`.

**Reguły krytyczne (naruszenie = błąd walidacji `Invalid HTML subset` i odrzucenie payloadu):**
*   **`<br>` NIE jest dozwolone.** Nie stosować podziału linii tagiem `<br>` – nowe akapity realizować przez osobne `<p>`.
*   **Zakaz `<b>` wewnątrz nagłówków `<h1>`/`<h2>`.** Nagłówek to czysty tekst (emoji dozwolone jako znak Unicode). Pogrubienie w nagłówku wywala walidację (tag typu prostego nie może mieć dzieci).
*   **`<b>` obowiązkowe w treści `<p>` i `<li>`** – najważniejsze marketingowo/psychologicznie frazy, liczby, nazwy składników i parametry MUSZĄ być pogrubione (kotwica dla skanowania wzrokiem). `<b>` działa poprawnie wewnątrz `<p>` i `<li>`.
*   **Zagnieżdżanie tagów:** przy łączeniu tagów zamykaj je w odwrotnej kolejności otwierania.
*   Zakaz surowego HTML, stylów CSS, `<div>`, `<section>`, `<table>`, JavaScript, linków zewnętrznych i danych kontaktowych.

---

## 4. ARCHITEKTURA OPISU: 6 SEKCJI AEO Z OBOWIĄZKOWYMI EMOTIKONAMI

Opis na Allegro musi być projektowany **linearnie pod Mobile First** (na smartfonie wiersze układają się jeden pod drugim od lewej do prawej). Obowiązuje zakaz szachownicy (zderzania zdjęć).

**Wymóg absolutny dla zautomatyzowanych Agentów:** Opis składa się z **dokładnie 6 sekcji modularnych**. Każdy **nagłówek** (`<h1>`/`<h2>`) oraz każdy **punkt listy** (`<li>`) jest poprzedzony **emotikonem** jako kotwicą wizualną. Emoji stoi PRZED tekstem nagłówka, poza wszelkimi tagami pogrubienia.

**Zasada nagłówka:** Sekcja 1 może użyć `<h1>` (jeden raz, jako główny nagłówek opisu) LUB `<h2>` – oba czysto tekstowe, bez `<b>` w środku. Pozostałe sekcje: `<h2>`. Pogrubienia `<b>` wchodzą dopiero w `<p>`/`<li>` pod nagłówkiem.

### Wzorzec Struktury 6 Sekcji (Blueprint):
1.  **Sekcja 1: `<h1>` [Emoji] [Tytuł oferty + USP + Pojemność/Waga]** — *Wiersz: Tylko tekst.* Pod nagłówkiem `<p>` z 2–3 zdaniami konkretu o formule i obietnicy wartości (z pogrubieniami kluczowych fraz). Bez lania wody.
2.  **Sekcja 2: `<h2>` ❓ Problem & Answer** — *Wiersz: Tekst po lewej (50%) + Zdjęcie po prawej (50%).* Lista `<ul>` z parami: `<li>🔴 <b>Problem:</b> [ból klienta z bazy RAG]</li>` oraz `<li>🟢 <b>Answer:</b> [rozwiązanie technologiczne]</li>`.
3.  **Sekcja 3: `<h2>` ⚙️ Technical Benefits** — *Wiersz: Zdjęcie po lewej (50%) + Tekst po prawej (50%).* Lista `<ul>` z mechanizmami (np. System 2w1) i rolą składników INCI/aktywnych (nazwy pogrubione).
4.  **Sekcja 4: `<h2>` 📝 Sposób użycia i rutyna** — *Wiersz: Tylko tekst lub Tekst + Zdjęcie.* Lista numerowana `<ol>`: dozowanie, obszar aplikacji, wmasowywanie, porady.
5.  **Sekcja 5: `<h2>` 📊 Parametry Techniczne** — *Wiersz: Tekst po lewej (50%) + Zdjęcie po prawej (50%).* Lista `<ul>` z KPA: Marka, Linia, Nazwa, Pojemność, Typ skóry/domu, Certyfikaty, EAN, Kod producenta, Waga (wartości pogrubione).
6.  **Sekcja 6: `<h2>` ⚠️ Bezpieczeństwo i informacje prawne (GPSR / CLP / Omnibus VIII)** — *Wiersz: Tylko tekst.* Ostrzeżenia z etykiety, warunki przechowywania, status prawny wyrobu; dla chemii: zwroty H/P z karty SDS.

---

## 5. STANDARDY WIZUALNE I MINIATURY (GRAPHIC RULES)

*   **Miniatura (Zdjęcie główne nr 1):** Bezwzględnie czyste, białe tło **RGB (255, 255, 255)**. Zakaz umieszczania tekstów, logotypów, ramek, znaków wodnych i cenników (wyjątek: oznaczenie `[Wygenerowano przez AI]`, jeśli miniatura powstała w AI – patrz SOT 08). Produkt musi być pokazany w sposób jednoznaczny.
*   **Zakaz piktogramów CLP/GHS na miniaturze:** dodane graficznie w rogu piktogramy zagrożeń są traktowane jako niedozwolony napis/ozdobnik i skutkują odrzuceniem miniatury. Piktogramy CLP prezentuje się na zdjęciu tylnej etykiety w galerii.
*   **Wyjątki od białego tła miniatury:** Okładki książek/gier/filmów; odzież i obuwie na modelu/manekinie w kategoriach Moda/Dziecko/Sport (dozwolone jednolite tło szare o wartości $V \ge 0,8$ w skali HSV); towary używane u osób prywatnych; wybrane kategorie (np. rośliny, meble, części samochodowe).
*   **Oznaczenia graficzne cech:** Jeśli miniatura nie oddaje cech niewidocznych (smak, zapach, kolor), dozwolone jest ich symboliczne określenie graficzne (np. owoc przy smaku).
*   **Zdjęcia w galerii opisu (pozycje 2–16):** Dowolne tło. Charakter kontekstowy (lifestyle, produkt w użyciu). Zamiast opisywać wymiary w tekście, zaleca się infografikę z liniami wymiarowymi. Dozwolone są certyfikaty i oznaczenia techniczne. Dla chemii z reżimem CLP: obowiązkowe wyraźne zdjęcie tylnej etykiety z piktogramami GHS, zwrotami H/P i kodem UFI.
*   **Kategoria „Erotyka":** Miniatura może przedstawiać wyłącznie sam towar (lub odzież/bieliznę na modelu w pozycji neutralnej). Zakaz pokazywania w kontekście użycia. Bezwzględny zakaz nawiązań do osób niepełnoletnich.
