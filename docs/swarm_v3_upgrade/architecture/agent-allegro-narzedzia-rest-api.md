# Agent tytułów Allegro — warstwa narzędziowa (Node.js / Antigravity)

Dokument zastępuje wcześniejszą sekcję „źródła danych". Zakłada:
agent bez przeglądarki, bez DOM, komunikacja wyłącznie HTTP/REST z modułu ERP.

---

## 0. Co odpada i dlaczego

| Źródło | Status | Powód |
|---|---|---|
| Podpowiedzi wyszukiwarki Allegro (autocomplete) | ❌ | Brak w oficjalnym REST API. Endpoint wewnętrzny = scraping DOM/JSON front-endu, poza ToS |
| `GET /offers/listing` | ⚠️ zablokowany | Wymaga weryfikacji aplikacji przez Allegro. Nieweryfikowana aplikacja → HTTP 403 |
| Allegro Ads — planer słów kluczowych | ❌ | Wymaga konta Ads i osobnego API, brak dostępu testowego |
| Google Trends API (oficjalne) | ⚠️ alfa | Waitlist, autoryzacja przez Google Cloud, brak GA — nie do produkcji |
| Google Ads API — KeywordPlanIdeaService | ⚠️ | Konto testowe zwraca dane testowe, nie realne wolumeny. Realne dane = developer token z Basic Access + realne konto Ads |

Wniosek architektoniczny: **rdzeń agenta musi działać bez danych o wolumenach.**
Wolumeny traktuj jako opcjonalny wzbogacacz (feature flag), nie jako zależność.

---

## 1. Autoryzacja Allegro — client_credentials

Rejestracja aplikacji: `https://apps.developer.allegro.pl/`
(produkcja, wymaga aktywnego konta z 2FA — wystarczy konto osobiste)
lub `https://apps.developer.allegro.pl.allegrosandbox.pl/` (sandbox, bez 2FA).

Do odczytu zasobów publicznych **nie potrzebujesz kontekstu użytkownika** —
wystarczy token aplikacji.

```js
// src/allegro/auth.js
const TOKEN_URL = 'https://allegro.pl/auth/oauth/token?grant_type=client_credentials';

let cache = { token: null, exp: 0 };

export async function getAppToken() {
  if (cache.token && Date.now() < cache.exp - 60_000) return cache.token;

  const basic = Buffer
    .from(`${process.env.ALLEGRO_CLIENT_ID}:${process.env.ALLEGRO_CLIENT_SECRET}`)
    .toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  if (!res.ok) throw new Error(`Allegro auth ${res.status}: ${await res.text()}`);

  const data = await res.json();
  cache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cache.token;
}
```

Klient HTTP — **nagłówek `User-Agent` jest wymagany** przez Allegro i musi mieć
poprawny format (Allegro udostępnia generator/walidator w portalu dla deweloperów):

```js
// src/allegro/client.js
import { getAppToken } from './auth.js';

const BASE = process.env.ALLEGRO_BASE ?? 'https://api.allegro.pl';

export async function allegroGet(path, params = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    Array.isArray(v) ? v.forEach(x => url.searchParams.append(k, x))
                     : url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await getAppToken()}`,
      Accept: 'application/vnd.allegro.public.v1+json',
      'Accept-Language': 'pl-PL',
      'User-Agent': process.env.ALLEGRO_USER_AGENT,
    },
  });

  if (res.status === 403) {
    throw Object.assign(new Error('ALLEGRO_FORBIDDEN'), { path, hint: 'zasób wymaga weryfikacji aplikacji' });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('ALLEGRO_RATE_LIMIT'), { retryAfter: res.headers.get('retry-after') });
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}
```

Limit: 9000 zapytań/min na Client ID. Sandbox: `https://api.allegro.pl.allegrosandbox.pl`.

> **Uwaga praktyczna:** Sandbox ma ubogi Katalog Produktów i praktycznie brak
> realnych ofert. Do **odczytu** kategorii, parametrów i katalogu używaj produkcji
> (token aplikacji, read-only — nic nie psujesz). Sandbox trzymaj do testów zapisu
> (wystawianie, edycja tytułu).

---

## 2. Endpointy dostępne dla agenta

### 2.1 `GET /sale/matching-categories` — dopasowanie kategorii z nazwy

Podajesz surową nazwę produktu, dostajesz kategorie, w których Allegro
**samo** klasyfikuje ten produkt. To najbliższy legalny substytut autocomplete:
pokazuje, jak silnik Allegro rozumie Twoją frazę.

```
GET /sale/matching-categories?name=frytkownica beztłuszczowa Philips 4.1L
```

Zwraca: `matchingCategories[]` z `id`, `name`, `parent`, `leaf`.

**Wartość dla tytułu:** jeśli agent poda dwie kandydujące frazy główne i jedna
zwraca trafną kategorię liściastą, a druga rozjeżdża się po drzewie — pierwsza
jest lepiej rozumiana przez silnik Allegro. Tanim kosztem masz sygnał trafności.

### 2.2 `GET /sale/categories/{categoryId}/parameters` — kontrolowany słownik

To jest **najważniejszy endpoint w całym pipeline**.

```
GET /sale/categories/321/parameters
```

Zwraca listę parametrów kategorii: `id`, `name`, `type`, `required`,
`dictionary[]` (dopuszczalne wartości słownikowe), `restrictions` (jednostki,
zakresy), `options.customValuesEnabled`.

**Wartość dla tytułu:** `name` + `dictionary[].value` to dokładnie to słownictwo,
którym operuje algorytm Allegro i którym filtrują kupujący. Tytuł zbudowany z tych
słów jest spójny z parametrami oferty — a spójność tytuł↔parametry to realny
czynnik rankingowy. Agent nie zgaduje, czy pisać „beztłuszczowa" czy „na gorące
powietrze" — bierze wartość ze słownika.

### 2.3 `GET /sale/products` — Katalog Produktów Allegro

```
GET /sale/products?phrase=Philips HD9200
GET /sale/products?phrase=8710103991939&mode=GTIN
GET /sale/products?phrase=HD9200/90&mode=MPN
```

Zwraca produkty z kanoniczną nazwą nadaną przez Allegro, marką, parametrami,
GTIN-ami, `category.id` oraz sekcją `trustedContent.paths` (które dane pochodzą
od producenta/dystrybutora).

**Wartość dla tytułu:** `product.name` to nazwa, którą Allegro uznaje za wzorcową
dla tego produktu — najlepszy dostępny przez API punkt startowy dla frazy głównej
i kolejności słów (marka-pierwsza vs kategoria-pierwsza).

> Jeśli dostaniesz 403 na tokenie aplikacji — przełącz ten jeden call na token
> user-context (Device Flow na własnym koncie, `POST /auth/oauth/device`).

### 2.4 `GET /sale/products/{productId}` — pełne dane produktu

Dociągnięcie parametrów i nazw wariantów dla wybranego produktu z 2.3.

### 2.5 `GET /sale/categories` / `GET /sale/categories/{id}`

Drzewo kategorii. Cache'uj lokalnie w ERP i odświeżaj raz na dobę —
to dane statyczne, nie ma sensu odpytywać ich per produkt.

### 2.6 `GET /offers/listing` — po weryfikacji aplikacji

```
GET /offers/listing?phrase=frytkownica beztłuszczowa&category.id=321&sort=-popularity&limit=60
```

Zwraca `items.promoted[]` i `items.regular[]` (w tym `name` = tytuł oferty) oraz
`filters[]` z licznikami ofert per wartość parametru.

**Wartość dla tytułu:** to jedyne źródło realnych tytułów konkurencji, która już
rankuje. Z 60 tytułów TOP agent wyciąga: częstość tokenów, medianę długości,
dominującą kolejność bloków, słowa występujące w tytułach z najwyższą pozycją.
Plus `filters[]` daje rozkład podaży per parametr.

**Jak odblokować:** wniosek o weryfikację aplikacji przez formularz kontaktowy
Allegro dla deweloperów. Złóż go na starcie — czas oczekiwania jest nieprzewidywalny,
a bez tego agent działa na słabszych sygnałach. Zaprojektuj moduł tak, żeby ten
sygnał był opcjonalny (`competitorAnalysis: enabled|disabled`).

---

## 3. Warstwa Google — realne opcje w Node

### 3.1 Google Suggest (darmowe, bez klucza)

```js
export async function googleSuggest(q) {
  const url = `https://suggestqueries.google.com/complete/search`
            + `?client=chrome&hl=pl&gl=pl&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const [, suggestions] = await res.json();
  return suggestions;
}
```

Zwraca frazy długiego ogona wpisywane w Google. Endpoint nieoficjalny —
używaj z throttlingiem i traktuj awarię jako niekrytyczną. Dla „frytkownica
beztłuszczowa" dostaniesz m.in. warianty pojemności i zastosowań, które warto
przepuścić przez test trafności.

### 3.2 Google Trends — trzy ścieżki

| Opcja | Testowalność | Uwagi |
|---|---|---|
| **SerpApi**, engine `google_trends`, npm `serpapi` | ✅ darmowy tier ~100 zapytań/mc | Najszybsza droga do działającego POC. Obsługuje `TIMESERIES`, `RELATED_QUERIES`, `geo=PL` |
| **DataForSEO** (Google Trends / Keywords Data) | ✅ pay-as-you-go, niski próg | Tańsze przy wolumenie, dodatkowo daje realne wolumeny z Keyword Planner |
| npm `google-trends-api` (pat310) | ⚠️ | Nieutrzymywany od lat, stare endpointy Google są mocno throttlowane. Do prototypu, nie do produkcji |
| `@alkalisummer/google-trends-js` | ⚠️ | Nowszy, aktywniejszy fork — nadal scraping, nadal kruchy |
| Oficjalne Google Trends API | ❌ na teraz | Alfa od 24.07.2025, waitlist, auth przez Google Cloud. Warto zapisać się na listę, ale nie budować na tym |

Niezależnie od ścieżki — **Trends nie zwraca wolumenów bezwzględnych, tylko
znormalizowane zainteresowanie**. Oficjalne API skaluje dane spójnie między
zapytaniami (można je łączyć i porównywać), scrapery — nie. Jeśli agent ma
porównywać synonimy między osobnymi wywołaniami, to jest argument za SerpApi
lub oficjalnym API, nie za biblioteką scrapującą.

---

## 4. Definicje narzędzi dla agenta

```jsonc
[
  {
    "name": "allegro_match_category",
    "description": "Zwraca kategorie Allegro dopasowane do nazwy produktu. Użyj do ustalenia kategorii i do sprawdzenia, którą z kandydujących fraz głównych silnik Allegro rozumie precyzyjniej.",
    "parameters": {
      "type": "object",
      "properties": { "name": { "type": "string", "description": "Nazwa lub fraza produktowa" } },
      "required": ["name"]
    }
  },
  {
    "name": "allegro_category_parameters",
    "description": "Zwraca parametry kategorii wraz ze słownikami dopuszczalnych wartości. To źródło kontrolowanego słownictwa dla tytułu — używaj tych wartości zamiast synonimów wymyślonych przez model.",
    "parameters": {
      "type": "object",
      "properties": { "categoryId": { "type": "string" } },
      "required": ["categoryId"]
    }
  },
  {
    "name": "allegro_search_products",
    "description": "Przeszukuje Katalog Produktów Allegro. Zwraca kanoniczną nazwę produktu wg Allegro, markę, GTIN i parametry. Używaj jako punktu startowego dla frazy głównej i kolejności bloków w tytule.",
    "parameters": {
      "type": "object",
      "properties": {
        "phrase": { "type": "string" },
        "mode": { "type": "string", "enum": ["GTIN", "MPN"], "description": "Pomiń, gdy phrase to nazwa produktu" }
      },
      "required": ["phrase"]
    }
  },
  {
    "name": "allegro_listing_competitors",
    "description": "OPCJONALNE (wymaga zweryfikowanej aplikacji). Zwraca tytuły ofert konkurencji dla frazy w kategorii oraz rozkład filtrów. Jeśli zwróci ALLEGRO_FORBIDDEN, kontynuuj bez tego sygnału i odnotuj to w ostrzeżeniach.",
    "parameters": {
      "type": "object",
      "properties": {
        "phrase": { "type": "string" },
        "categoryId": { "type": "string" },
        "limit": { "type": "integer", "default": 60, "maximum": 100 }
      },
      "required": ["phrase"]
    }
  },
  {
    "name": "google_suggest",
    "description": "Zwraca podpowiedzi wyszukiwarki Google dla frazy (rynek PL). Źródło fraz długiego ogona. Awaria tego narzędzia nie blokuje procesu.",
    "parameters": {
      "type": "object",
      "properties": { "phrase": { "type": "string" } },
      "required": ["phrase"]
    }
  },
  {
    "name": "google_trends_compare",
    "description": "Porównuje 2-5 synonimów pod względem zainteresowania w Google (geo=PL) i zwraca kierunek trendu oraz zapytania rosnące. Dane to zainteresowanie względne, NIE wolumen bezwzględny — nie raportuj ich jako liczby wyszukań.",
    "parameters": {
      "type": "object",
      "properties": {
        "terms": { "type": "array", "items": { "type": "string" }, "minItems": 2, "maxItems": 5 },
        "timeframe": { "type": "string", "enum": ["today 12-m", "today 3-m"], "default": "today 12-m" }
      },
      "required": ["terms"]
    }
  },
  {
    "name": "validate_allegro_title",
    "description": "Waliduje kandydata na tytuł wobec twardych zasad Allegro. Wywołuj OBOWIĄZKOWO dla każdego wariantu przed zwróceniem wyniku. Zwraca listę naruszeń.",
    "parameters": {
      "type": "object",
      "properties": { "title": { "type": "string" }, "brand": { "type": "string" } },
      "required": ["title"]
    }
  }
]
```

---

## 5. Walidator — deterministyczny, nie po stronie modelu

Model nie umie liczyć znaków. Walidacja musi być kodem.

```js
// src/title/validate.js
const BANNED = [
  'okazja','promocja','hit','nowość','tanio','najtaniej','super','mega',
  'wyprzedaż','ostatnie sztuki','polecam','gratis','bestseller','rewelacja','wysyłka 24h'
];

export function validateAllegroTitle(title, { brand } = {}) {
  const issues = [];
  const len = [...title].length;                       // rodzime znaki + emoji
  const words = title.trim().split(/\s+/);

  if (len > 75) issues.push({ code: 'TOO_LONG', len });
  if (len < 12) issues.push({ code: 'TOO_SHORT', len });
  if (len < 55) issues.push({ code: 'SUBOPTIMAL_LENGTH', len, hint: 'celuj w 60-74' });
  if (words.length < 3) issues.push({ code: 'TOO_FEW_WORDS', count: words.length });

  const lower = title.toLowerCase();
  BANNED.filter(w => lower.includes(w)).forEach(w => issues.push({ code: 'BANNED_WORD', word: w }));

  if (/[!@#$%^&*(){}<>|~`"'♥★☆€]/.test(title)) issues.push({ code: 'SPECIAL_CHARS' });

  const caps = words.filter(w => w.length > 3 && w === w.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(w));
  if (caps.length > 1) issues.push({ code: 'CAPS_ABUSE', words: caps });

  // powtórzenia po rdzeniu (prymitywny stemming PL — wystarczy do wykrycia odmian)
  const stems = words.map(w => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5))
                     .filter(s => s.length >= 4);
  const dup = stems.filter((s, i) => stems.indexOf(s) !== i);
  if (dup.length) issues.push({ code: 'KEYWORD_REPEAT', stems: [...new Set(dup)] });

  const numeric = title.match(/\d+([.,]\d+)?\s*(l|ml|w|kw|cm|mm|"|cali|gb|tb|kg|g|mah|szt)\b/gi) ?? [];
  if (numeric.length > 2) issues.push({ code: 'TOO_MANY_PARAMS', found: numeric });

  if (/\b\d{6,}\b/.test(title)) issues.push({ code: 'POSSIBLE_SKU' });
  if (/(https?:\/\/|www\.|@\w+\.)/i.test(title)) issues.push({ code: 'CONTACT_OR_LINK' });
  if (/\b(faktura|vat|odbiór osobisty|kurier)\b/i.test(title)) issues.push({ code: 'LOGISTICS_INFO' });

  return { valid: issues.length === 0, length: len, issues };
}
```

Podłącz to jako narzędzie agenta **i** jako bramkę w pipeline ERP — tytuł, który
nie przeszedł walidatora, nie może trafić do `POST /sale/product-offers`.

---

## 6. Pipeline (kolejność wywołań)

```
1. allegro_search_products(phrase = nazwa z ERP)
   └─ brak trafienia → allegro_match_category(name)
2. allegro_category_parameters(categoryId)          ← słownik kontrolowany
3. google_suggest(fraza główna)                     ← long-tail, best-effort
4. google_trends_compare([synonim A, synonim B])    ← tylko gdy ≥2 kandydatów
5. allegro_listing_competitors(...)                 ← jeśli aplikacja zweryfikowana
6. LLM: generuj 3 warianty (wolumen / long-tail / trend)
7. validate_allegro_title(każdy wariant)
   └─ issues.length > 0 → wróć do 6 z listą naruszeń, maks. 3 iteracje
8. Zwróć JSON + zapisz nieużyte frazy do parametrów i opisu
```

Kroki 1–2 są obowiązkowe. Kroki 3–5 są best-effort: każda awaria ląduje w polu
`ostrzezenia`, nie przerywa procesu. Krok 7 jest twardą bramką.

---

## 7. Co zmienić w prompcie systemowym

Zamień poprzednią hierarchię źródeł na:

```
Masz do dyspozycji wyłącznie narzędzia z listy. Nie masz dostępu do wyszukiwarki
Allegro ani do przeglądarki. Nie zmyślaj wolumenów wyszukiwań — nie masz do nich
dostępu poza opcjonalnym google_trends_compare, który zwraca zainteresowanie
WZGLĘDNE, nie liczbę wyszukań.

Priorytet słownictwa:
1. product.name z allegro_search_products (nazwa kanoniczna Allegro)
2. parameters[].name i dictionary[].value z allegro_category_parameters
3. tytuły z allegro_listing_competitors — jeśli narzędzie zwróciło dane
4. google_suggest — tylko frazy przechodzące test trafności
5. google_trends_compare — wyłącznie do wyboru między synonimami i sezonowości

Jeśli narzędzie 3, 4 lub 5 zwróci błąd — kontynuuj i dopisz do "ostrzezenia".
Jeśli narzędzie 1 i 2 zwrócą błąd — przerwij i zgłoś, że nie masz podstaw do
zbudowania tytułu.

Każdy wariant tytułu przepuść przez validate_allegro_title. Jeśli valid=false,
popraw tytuł na podstawie zwróconych kodów i zwaliduj ponownie. Nie zwracaj
wariantu, który nie przeszedł walidacji.
```

Reszta poprzedniego promptu (test trafności trendu, szablon tytułu, format JSON
wyjściowy) zostaje bez zmian.
