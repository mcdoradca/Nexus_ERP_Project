# ADR-0179: Deterministyczny Sanityzator DOM (`cheerio`) i Walidator HTML Opisu `StandardizedDescription` Allegro (`422: Brakuje taga zamykającego dla "p"`)

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer-v2/tests/allegro.content.export.test.js`

---

## 1. Kontekst i Zweryfikowana Przyczyna Błędu Produkcyjnego

Podczas wysyłki samych opisów i zdjęć przez `POST /api/offer-optimizer/export-allegro-content` (`PATCH /sale/product-offers/{offerId}`) Allegro REST API odrzuciło żądanie błędem:
`422: Brakuje taga zamykającego dla "p" [description.sections[4].items[1].content] | [description.sections[1].items[0].content] | [description.sections[2].items[1].content] | [description.sections[0].items[1].content]`.

Analiza rzeczywistych rekordów `Product.offerDraft` (m.in. EAN `8054633830741` / oferta `19112062838`, `8004120910364`, `8059602247612`) wykazała źródło błędu w [allegro_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/allegro_mapper.js):
1. Edytor TipTap (ProseMirror) generuje elementy list z zagnieżdżonym `<p>` wewnątrz `<li>`: `<ul><li><p>...</p></li>...</ul>`.
2. Poprzednie wyrażenie regularne w `sanitizeHtmlForAllegroDescription` (`/(<(?:h1|h2|p|ul|ol)>[\s\S]*?<\/(?:h1|h2|p|ul|ol)>)/gi`) dopasowywało otwierający tag `<ul>` aż do **pierwszego napotkanego `</p>`** wewnątrz `<li><p>...</p></li>`.
3. Rozbijało to listę na ułomne kawałki i owijało fragmenty `</li><li>` oraz `</li></ul>` w dodatkowe znaczniki `<p></li><li></p>` i `<p></li></ul></p>`, a ponadto pozostawiało niedozwolone w `StandardizedDescription` bloki `<p>` wewnątrz `<li>`.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Parser DOM AST w oparciu o `cheerio` (`src/utils/allegro_mapper.js`)
- Zamiast regexów zastosowano w `sanitizeHtmlForAllegroDescription` deterministyczne parsowanie fragmentów HTML przy użyciu już zainstalowanego pakietu **`cheerio` (`^1.2.0`)** (zero nowych zależności) oraz dedykowanych helperów (`escapeAllegroHtmlText`, `normalizeInlineWhitespace`, `renderAllegroInlineRuns`, `extractPlainHeadingText`).
- Zasady emisji dla ścisłej białej listy Allegro `{h1, h2, p, ul, ol, li, b}`:
  - odwijanie `<p>` i kontenerów blokowych wewnątrz `<li>` do tekstu i `<b>` (ze spacją między rozbitymi elementami), spłaszczanie zagnieżdżonych podlist `<ul>`/`<ol>` wewnątrz `<li>` na płaskie pozycje listy,
  - konwersja `<strong>` -> `<b>`, `<h3..h6>` -> `<h2>`, usuwanie komentarzy/`<script>`/`<style>`, atrybutów i tagów wewnątrz `<h1>`/`<h2>`,
  - dzielenie `<p>` na osobne akapity przy `<br>` z bezpiecznym domykaniem i ponownym otwieraniem `<b>`, wyprowadzanie zagnieżdżonych list/nagłówków z `<p>` na poziom główny oraz escapowanie encji tekstowych (`&`, `<`, `>`),
  - scalanie białych znaków na styku runów po połączeniu sąsiednich fragmentów oraz odrzucanie pustych elementów (`<p></p>`, `<li>&nbsp;</li>`, `<ul></ul>`, `<b> </b>`).

### 2.2. Bramka Walidacji Struktury HTML w Pre-flight i przed `PATCH` (`validateAllegroDescriptionHtml`)
- Dodano funkcję `validateAllegroDescriptionHtml(htmlStr)`, weryfikującą stosowo równowagę otwarć/zamknięć wszystkich tagów, brak atrybutów, brak surowych `<` i poprawność zagnieżdżeń Allegro (`h1/h2/p/ul/ol` na poziomie głównym, `li` wyłącznie w `ul/ol`, `b` wyłącznie w `p/li`, brak tagów w `h1/h2`).
- Wpięto walidator w `buildAllegroContentPreflight`, dzięki czemu blokuje błędny HTML zarówno na etapie Pre-flight (`/validate-allegro-content-export`), jak i podczas finalnej wysyłki (`/export-allegro-content`).

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `src/utils/allegro_mapper.js` i `src/modules/offer-optimizer-v2/tests/allegro.content.export.test.js` — **PASS (`0` błędów)**.
- **Pełna suita testów (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`291/291 PASS`** (`0` fail, `0` skipped), w tym **`allegro.content.export.test.js` (`8/8 PASS` — nowe testy regresyjne `7` i `8`)** oraz **`allegro.params.export.test.js` (`11/11 PASS`)**.
- **Masowa walidacja na rzeczywistych produktach z bazy (`100` rekordów z `offerDraft` przed finalną korektą białych znaków + `15` najnowszych rekordów / `104` sekcji po finalnej edycji):** `failed = 0`.
- **Nie-mutujący test E2E `validateAllegroContentExport` przeciw żywemu API Allegro (konto `50233197`):**
  - EAN `8054633830741` (oferta `19112062838`) -> `HTTP 200`, `sections = 6`, `htmlInvalid = 0`, `errors = []`, `token = true`.
  - EAN `8004120910364` (oferta `17803378483`) -> `HTTP 200`, `sections = 7`, `htmlInvalid = 0`, `errors = []`, `token = true`.
  - EAN `8059602247612` (oferta `18114732375`) -> `HTTP 200`, `sections = 7`, `htmlInvalid = 0`, `errors = []`, `token = true`.
- **Frontend build (`npm --prefix frontend run build`):** **PASS** (`✓ built in 6.63s`).
