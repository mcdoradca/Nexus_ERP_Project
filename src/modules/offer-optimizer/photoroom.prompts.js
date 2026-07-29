/**
 * ============================================================================
 *  photoroom.prompts.js  —  SSOT 6.0 "LEGO 2.0 + PROPS ENGINE"
 * ============================================================================
 *  Nexus ERP 2.0 / Allegro Pipeline — produkcja galerii 1080x1080 (sloty 1-9)
 *
 *  ZMIANY vs SSOT 5.0:
 *   1. REALIZM: lighting.mode=ai.auto (AI Relight) + shadow.mode=ai.soft
 *      we wszystkich slotach lifestyle. Wycinanka jest prześwietlana pod
 *      wygenerowane tło — koniec efektu "naklejki".
 *   2. GŁĘBIA OSTROŚCI: prompt wymusza "softly blurred background, shallow
 *      depth of field" (usunięto samobójczy zakaz no-blur/no-bokeh).
 *   3. SKALA SCENY: wszystkie środowiska w słownikach opisują scenę w
 *      promieniu 30-80 cm od produktu (blat/półka/parapet). Zakaz krajobrazów.
 *   4. SEED PER-SLOT: hash(EAN + ":" + slot) — galeria jednego SKU jest
 *      wewnętrznie różnorodna, ale nadal w 100% deterministyczna.
 *   5. PROPS ENGINE: składniki z PIM (Węzeł 1) mapowane na rekwizyty
 *      w 5 z 8 slotów lifestyle. Koniec "muzealnej pustki".
 *   6. KOMPOZYCJE: 10 presetów paddingTop/Bottom/Left/Right + alignments.
 *      Produkt wypełnia od ~50% do ~93% wysokości kadru i wędruje po nim.
 *   7. MAKRO-SLOT: slot 3 tnie plik źródłowy (górne 62% butelki) przed
 *      wysyłką — autentyczne ujęcie detalu etykiety bez drugiego zdjęcia.
 *
 *  ZALEŻNOŚCI: node >= 18 (natywne FormData/Blob), opcjonalnie sharp (crop).
 * ============================================================================
 */

'use strict';

const FormData = require('form-data');

// ============================================================================
// [1] DETERMINIZM — hash i PRNG
// ============================================================================

/** FNV-1a 32-bit — stabilny hash stringa (EAN, EAN:slot, itp.) */
function hashSKU(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // uint32
}

/** Seed per-slot: ten sam EAN => ta sama galeria, ale sloty różne między sobą */
function seedForSlot(ean, slot) {
  return hashSKU(`${ean}:${slot}`);
}

/**
 * mulberry32 — tani, deterministyczny PRNG.
 * Używamy go zamiast serii modulo, żeby wybory surface/env/light/props
 * NIE były ze sobą skorelowane (seed % 10 dawał zawsze tę samą "kolumnę"
 * we wszystkich słownikach naraz).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministyczny wybór elementu tablicy */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Deterministyczny wybór N różnych elementów */
function pickN(rng, arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// ============================================================================
// [2] SŁOWNIKI SCEN — SKALA BLATU, ZERO MARMURU, ZERO POSTUMENTÓW
// ============================================================================
// Reguła żelazna: environment to zawsze ROZMYTE tło w skali pomieszczenia
// widzianego zza blatu. Surface to zawsze powierzchnia, na której produkt
// fizycznie stoi. Lighting zawsze podaje KIERUNEK światła (spójność z Relight).
// ============================================================================

const STYLE_DICTIONARIES = {
  // --------------------------------------------------------------------------
  COSMETICS_BEAUTY: {
    surfaces: [
      'a whitewashed oak wooden countertop',
      'a matte cream ceramic tabletop',
      'a natural linen cloth draped over a low table',
      'a wet dark slate slab with water sheen',
      'a warm beige sandstone counter',
      'a round cork tray on a pale wooden shelf',
      'a folded white terry towel on a bath ledge',
      'a light brushed-concrete vanity top',
      'a bamboo bath shelf with visible grain',
      'a frosted glass shelf with soft reflections',
    ],
    environments: [
      'a sunlit bathroom window with sheer curtain',
      'lush out-of-focus green foliage',
      'a soft warm neutral wall in morning light',
      'a steamy shower glass panel',
      'a pale linen curtain backdrop',
      'a blurred spa interior with warm wood tones',
      'a windowsill scene with soft daylight glow',
      'a muted sage-green painted wall',
      'a blurred shelf with ceramic vessels',
      'a hazy bright bathroom interior',
    ],
    lighting: [
      'soft golden-hour sunlight from the left',
      'diffused morning window light from the right',
      'gentle overhead softbox glow',
      'warm side light casting long soft shadows to the right',
      'bright airy high-key daylight',
      'dappled sunlight filtering through leaves from above left',
      'cool soft daylight from a window behind left',
      'warm candle-like ambient glow from the right',
      'crisp neutral studio daylight from the front left',
      'low warm evening light from the left side',
    ],
  },
  // --------------------------------------------------------------------------
  HOUSEHOLD_CHEMISTRY: {
    surfaces: [
      'a polished light-grey concrete countertop',
      'a brushed stainless steel worktop',
      'a glossy white quartz kitchen counter',
      'a pale grey ceramic tile surface',
      'a clean matte white laminate countertop',
      'a wet light-grey stone surface with fresh water droplets',
      'a smooth tempered glass counter',
      'a light oak kitchen worktop, freshly wiped',
      'a white enamel surface with subtle sheen',
      'a graphite composite sink edge',
    ],
    environments: [
      'a bright modern kitchen, softly out of focus',
      'a clean white tiled wall with soft reflections',
      'a blurred laundry room with white cabinets',
      'a sunlit kitchen window with green plant silhouettes',
      'a minimal grey architectural wall',
      'a blurred stack of fresh folded towels',
      'a bright utility room with daylight',
      'a soft-focus modern bathroom in white and chrome',
      'a blurred kitchen scene with steel appliances',
      'a clean pale-blue wall with morning light',
    ],
    lighting: [
      'crisp high-key studio light from above',
      'cool bright daylight from the left window',
      'clean neutral light with sparkling water reflections',
      'bright clinical light from the front right',
      'soft cool daylight with gentle chrome reflections',
      'fresh morning light from the right',
      'even bright light with subtle blue undertone',
      'strong window light from behind left, airy atmosphere',
      'neutral daylight with crisp micro-shadows',
      'cool skylight illumination from above',
    ],
  },
  // --------------------------------------------------------------------------
  BIOCIDAL_SPECIALIZED: {
    surfaces: [
      'a brushed stainless steel laboratory bench',
      'a matte grey epoxy worktop',
      'a light polished concrete surface',
      'a clean white solid-surface counter',
      'a graphite composite worktop with subtle texture',
      'a wet dark grey stone slab, freshly disinfected',
      'a pale industrial tile floor section',
      'a smooth anthracite countertop',
      'a clean galvanized metal shelf',
      'a white ceramic lab bench with soft sheen',
    ],
    environments: [
      'a bright blurred professional kitchen',
      'a clean industrial wall in cool grey',
      'a soft-focus greenhouse with green blur',
      'a blurred garage workshop in daylight',
      'a minimal concrete wall with cool light',
      'a blurred stable interior with warm wood',
      'a modern utility space, softly defocused',
      'a bright warehouse window backdrop',
      'a blurred garden shed with tools out of focus',
      'a cool-toned professional facility interior',
    ],
    lighting: [
      'strong clean overhead industrial light',
      'cool daylight from a large window on the left',
      'crisp neutral light with sharp foreground detail',
      'bright even illumination with cool undertone',
      'directional light from the right, technical mood',
      'clean skylight from above with soft falloff',
      'cold morning light from behind left',
      'neutral high-key light, spotless atmosphere',
      'focused beam light from the upper left',
      'bright diffuse light with steel reflections',
    ],
  },
  // --------------------------------------------------------------------------
  NON_CHEMICAL_GENERAL: {
    surfaces: [
      'a light microcement tabletop',
      'a natural oak wooden desk surface',
      'a matte pastel-grey painted board',
      'a warm beige textile runner on a table',
      'a smooth birch plywood surface',
      'a soft grey felt mat on a desk',
      'a clean white matte tabletop',
      'a terracotta ceramic tray on a shelf',
      'a ribbed glass surface with soft reflections',
      'a kraft paper covered work surface',
    ],
    environments: [
      'a bright minimal interior wall, softly blurred',
      'a blurred home office with warm daylight',
      'a soft geometric wall with gentle shadow play',
      'a blurred living room with neutral furniture',
      'a pale wooden slat wall out of focus',
      'a sunlit windowsill with a defocused plant',
      'a muted two-tone painted wall',
      'a blurred workshop shelf with tidy tools',
      'a soft-focus hallway in scandinavian style',
      'a warm grey studio backdrop with vignette',
    ],
    lighting: [
      'balanced soft daylight from the left',
      'warm afternoon light from the right window',
      'even studio light with soft geometric shadows',
      'gentle top light with smooth falloff',
      'morning light casting a soft diagonal shadow',
      'neutral bright light, editorial mood',
      'soft rim light from behind right',
      'diffuse skylight with airy feel',
      'directional window light from the front left',
      'calm even light with subtle warm tint',
    ],
  },
};

// ============================================================================
// [3] PROPS ENGINE — składniki z PIM => rekwizyty na zdjęciu
// ============================================================================
// Klucze: lowercase, dopasowanie substring w opisie/składzie z Węzła 1.
// Wartości: gotowe frazy EN opisujące rekwizyt LEŻĄCY na powierzchni
// (nigdy lewitujący, nigdy zasłaniający front produktu).
// ============================================================================

const INGREDIENT_PROPS = {
  // botanika / zioła
  'rozmaryn':        'fresh rosemary sprigs',
  'rosmarino':       'fresh rosemary sprigs',
  'rosemary':        'fresh rosemary sprigs',
  'lawend':          'dried lavender stems',
  'lavend':          'dried lavender stems',
  'szałwi':          'fresh sage leaves',
  'sage':            'fresh sage leaves',
  'eukaliptus':      'a eucalyptus branch',
  'eucalyptus':      'a eucalyptus branch',
  'rumianek':        'chamomile flowers',
  'chamomile':       'chamomile flowers',
  'mięt':            'fresh mint leaves',
  'mint':            'fresh mint leaves',
  'aloes':           'a cut aloe vera leaf with gel drops',
  'aloe':            'a cut aloe vera leaf with gel drops',
  'pokrzyw':         'fresh nettle leaves',
  'zielona herbata': 'loose green tea leaves',
  'tè verde':        'loose green tea leaves',
  'green tea':       'loose green tea leaves',
  'herbat':          'loose green tea leaves',
  // owoce / kuchnia
  'cytryn':          'fresh lemon slices',
  'lemon':           'fresh lemon slices',
  'pomarańcz':       'fresh orange slices',
  'orange':          'fresh orange slices',
  'granat':          'pomegranate seeds scattered nearby',
  'malin':           'a few fresh raspberries',
  'kokos':           'a cracked coconut half',
  'coconut':         'a cracked coconut half',
  'migdał':          'raw almonds',
  'almond':          'raw almonds',
  'owies':           'scattered oat flakes',
  'oat':             'scattered oat flakes',
  'miód':            'a honey dipper with golden honey drips',
  'honey':           'a honey dipper with golden honey drips',
  'wanili':          'vanilla pods',
  // aktywne / techniczne => wizualne metafory
  'hialuron':        'clear water droplets glistening on the surface',
  'ialuronico':      'clear water droplets glistening on the surface',
  'hyaluronic':      'clear water droplets glistening on the surface',
  'kolagen':         'a small dish of clear serum drops',
  'collagen':        'a small dish of clear serum drops',
  'keratyn':         'a silky strand of light fabric',
  'keratin':         'a silky strand of light fabric',
  'witamina c':      'fresh orange slices',
  'vitamin c':       'fresh orange slices',
  'węgiel':          'pieces of activated charcoal',
  'charcoal':        'pieces of activated charcoal',
  'glinka':          'a small bowl of powdered clay',
  'clay':            'a small bowl of powdered clay',
  'sól morska':      'coarse sea salt crystals',
  'sea salt':        'coarse sea salt crystals',
  'argan':           'argan nuts and a small oil dish',
  'shea':            'a chunk of raw shea butter',
  'jojoba':          'golden oil drops in a glass dish',
  'oliw':            'olive branch with green olives',
  'olive':           'olive branch with green olives',
  'ocean':           'smooth sea pebbles',
  'alga':            'dried seaweed strands',
  'detox':           'cucumber slices and mint leaves',
};

/**
 * Rekwizyty neutralne — używane gdy PIM nie da dopasowań,
 * żeby produkt NIGDY nie stał sam na pustej scenie.
 */
const NEUTRAL_PROPS = {
  COSMETICS_BEAUTY: [
    'a folded cream cotton towel',
    'a small ceramic dish',
    'smooth river stones',
    'a sprig of dried grass in soft focus',
    'clear water droplets on the surface',
    'a natural loofah sponge',
  ],
  HOUSEHOLD_CHEMISTRY: [
    'a folded fresh white towel',
    'sparkling clean glassware in the background',
    'a natural cellulose sponge',
    'fresh water droplets on the surface',
    'a neatly folded grey microfiber cloth',
  ],
  BIOCIDAL_SPECIALIZED: [
    'clean protective gloves folded neatly',
    'a fresh microfiber cloth',
    'water droplets on the clean surface',
    'a small steel tray',
  ],
  NON_CHEMICAL_GENERAL: [
    'a folded linen cloth',
    'a small ceramic tray',
    'a smooth wooden block',
    'a coil of natural twine',
  ],
};

/**
 * Ekstrakcja rekwizytów z twardego tekstu PIM (nazwa + linia + opis + skład).
 * Zwraca max `limit` deterministycznie wybranych fraz.
 */
const fs = require('fs');
const path = require('path');
let learnedProps = {};
try {
  const p = path.join(__dirname, 'learned_props.json');
  if (fs.existsSync(p)) {
    learnedProps = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
} catch (e) {
  console.warn('[photoroom.prompts] Brak lub błąd pliku learned_props.json', e.message);
}

function getKnownIngredientKeys() {
  return Object.keys({ ...INGREDIENT_PROPS, ...learnedProps });
}

/**
 * Ekstrakcja rekwizytów z twardego tekstu PIM (nazwa + linia + opis + skład).
 * Zwraca max `limit` deterministycznie wybranych fraz.
 */
function extractIngredientProps(pimText, rng, limit = 2, patchAsObject = {}) {
  const text = (pimText || '').toLowerCase();
  const matched = [];
  const activeDictionary = { ...INGREDIENT_PROPS, ...learnedProps, ...patchAsObject };
  
  for (const [needle, phrase] of Object.entries(activeDictionary)) {
    if (text.includes(needle.toLowerCase()) && !matched.includes(phrase)) matched.push(phrase);
  }
  if (matched.length <= limit) return matched;
  return pickN(rng, matched, limit);
}

// ============================================================================
// [4] PRESETY KOMPOZYCJI — produkt wędruje po kadrze i zmienia rozmiar
// ============================================================================
// Wysokość produktu w kadrze = 1 - (pT + pB). Zakres: 0.50 … 0.93.
// verticalAlignment=bottom prawie zawsze — produkt musi STAĆ na powierzchni,
// a dolny padding definiuje ile "blatu" widać na pierwszym planie.
// UWAGA API: suma paddingów przeciwległych krawędzi musi być < 1.0.
// ============================================================================

const COMPOSITIONS = [
  // 0: Duży hero, mocno w lewo — dużo "powietrza" po prawej na klimat sceny
  { pT: 0.06, pB: 0.04, pL: 0.08, pR: 0.42, hA: 'left',   vA: 'bottom', label: 'BIG_LEFT' },
  // 1: Duży hero, mocno w prawo
  { pT: 0.06, pB: 0.04, pL: 0.42, pR: 0.08, hA: 'right',  vA: 'bottom', label: 'BIG_RIGHT' },
  // 2: Średni, lekka asymetria lewa, więcej blatu na dole
  { pT: 0.14, pB: 0.10, pL: 0.14, pR: 0.30, hA: 'left',   vA: 'bottom', label: 'MID_LEFT' },
  // 3: Średni, lekka asymetria prawa
  { pT: 0.14, pB: 0.10, pL: 0.30, pR: 0.14, hA: 'right',  vA: 'bottom', label: 'MID_RIGHT' },
  // 4: Daleki hero — mały produkt, scena gra pierwsze skrzypce
  { pT: 0.32, pB: 0.16, pL: 0.28, pR: 0.28, hA: 'center', vA: 'bottom', label: 'FAR_HERO' },
  // 5: Daleki, zepchnięty w prawo dolne — mocno edytorialny kadr
  { pT: 0.30, pB: 0.12, pL: 0.44, pR: 0.12, hA: 'right',  vA: 'bottom', label: 'FAR_RIGHT_LOW' },
  // 6: Klasyczny hero centralny, oddychający
  { pT: 0.12, pB: 0.08, pL: 0.20, pR: 0.20, hA: 'center', vA: 'bottom', label: 'CLASSIC_HERO' },
  // 7: Ciasny kadr — produkt dominuje, prawie dotyka krawędzi
  { pT: 0.03, pB: 0.02, pL: 0.12, pR: 0.12, hA: 'center', vA: 'bottom', label: 'TIGHT' },
  // 8: Niski horyzont — produkt wysoko, widoczna duża tafla blatu
  { pT: 0.08, pB: 0.22, pL: 0.16, pR: 0.28, hA: 'left',   vA: 'bottom', label: 'DEEP_TABLE' },
  // 9: Makro-detal (używany ze slotem CROP — patrz [6])
  { pT: 0.00, pB: 0.00, pL: 0.06, pR: 0.06, hA: 'center', vA: 'center', label: 'MACRO_CROP' },
];

// ============================================================================
// [5] PLAN SLOTÓW — co się dzieje w każdym slocie galerii
// ============================================================================
// role:
//  'thumbnail'  => białe tło (SSOT 4.0, bez zmian merytorycznych)
//  'hero'       => czysty lifestyle, 1 neutralny rekwizyt
//  'macro'      => crop źródła + tło tekstury (detal etykiety)
//  'ingredients'=> scena bogata w składniki z PIM (2 frazy)
//  'mood'       => daleki hero, scena klimatyczna, 1 rekwizyt
// ============================================================================

const SLOT_PLAN = {
  1: { role: 'thumbnail' },
  2: { role: 'hero',        propCount: 1, compPool: [0, 1, 6] },
  3: { role: 'macro',       propCount: 1, compPool: [9] },
  4: { role: 'ingredients', propCount: 2, compPool: [2, 3, 8] },
  5: { role: 'hero',        propCount: 1, compPool: [2, 3] },
  6: { role: 'mood',        propCount: 1, compPool: [4, 5] },
  7: { role: 'ingredients', propCount: 2, compPool: [0, 1, 8] },
  8: { role: 'hero',        propCount: 1, compPool: [7, 6] },
  9: { role: 'ingredients', propCount: 2, compPool: [2, 3, 4] },
};

// ============================================================================
// [6] BUDOWA PROMPTU — szablon z głębią ostrości i kotwiczeniem rekwizytów
// ============================================================================

function buildBackgroundPrompt({ role, surface, environment, lighting, props }) {
  const propsClause = props.length
    ? `Resting flat on the surface nearby: ${props.join(' and ')}. `
    : '';

  if (role === 'macro') {
    // Detal etykiety: tło to czysta, rozmyta tekstura — zero konkurencji
    return (
      `Extreme close-up product photography. ${surface} in sharp focus, ` +
      `${propsClause}` +
      `background is ${environment}, heavily blurred, very shallow depth of field. ` +
      `${lighting}. Photorealistic, macro lens look, no people, no text, no logos.`
    );
  }

  return (
    `Close-up commercial product photography scene. ${surface} in the foreground, ` +
    `${propsClause}` +
    `background: ${environment}, softly blurred, shallow depth of field. ` +
    `${lighting}. Photorealistic, natural perspective at counter height, ` +
    `no people, no text, no logos.`
  );
}

// ============================================================================
// [7] GŁÓWNY GENERATOR ŻĄDANIA
// ============================================================================

const PHOTOROOM_ENDPOINT = 'https://image-api.photoroom.com/v2/edit';

const MODEL_HEADERS = {
  SHADOWS:    { 'pr-ai-shadows-model-version': '2026-04-15' },
  BACKGROUND: { 'pr-ai-background-model-version': 'background-studio-beta-2025-03-17' },
};

/**
 * Buduje kompletny opis żądania dla jednego slotu.
 *
 * @param {Object} cfg
 * @param {string} cfg.ean              GTIN/EAN produktu
 * @param {number} cfg.slot             1..9
 * @param {string} cfg.category         Klucz z STYLE_DICTIONARIES (Węzeł 7)
 * @param {string} cfg.pimText          Konkatenacja: product_name + line + opis + skład (Węzeł 1)
 * @param {Blob|Buffer} cfg.imageBlob   Zdjęcie źródłowe (dla slotu 'macro' — już przycięte!)
 * @param {Object} cfg.patchAsObject    Łatki ze słownika od Agenta 8
 * @param {Object} cfg.styleHints       Filtry z Agenta 8
 * @returns {{ endpoint, headers, formData, meta }}
 */
function buildPhotoroomRequest({ ean, slot, category, pimText, imageBlob, patchAsObject = {}, styleHints = null }) {
  const plan = SLOT_PLAN[slot];
  if (!plan) throw new Error(`Nieznany slot: ${slot}`);

  const fd = new FormData();
  fd.append('imageFile', imageBlob, `${ean}_src.jpg`);
  fd.append('removeBackground', 'true');
  fd.append('outputSize', '1080x1080');
  fd.append('export.format', 'jpeg');

  // --------------------------------------------------------------------------
  // SLOT 1 — miniaturka Allegro (RGB 255,255,255) — logika bez zmian
  // --------------------------------------------------------------------------
  if (plan.role === 'thumbnail') {
    fd.append('background.color', '#FFFFFF');
    fd.append('padding', '0.05');
    fd.append('shadow.mode', 'ai.preset-soft');
    return {
      endpoint: PHOTOROOM_ENDPOINT,
      headers: { ...MODEL_HEADERS.SHADOWS },
      formData: fd,
      meta: { slot, role: 'thumbnail', ean },
    };
  }

  // --------------------------------------------------------------------------
  // SLOTY 2-9 — lifestyle
  // --------------------------------------------------------------------------
  const seed = seedForSlot(ean, slot);
  const rng = mulberry32(seed);

  const dict = STYLE_DICTIONARIES[category] || STYLE_DICTIONARIES.NON_CHEMICAL_GENERAL;
  
  let validSurfaces = dict.surfaces;
  let validEnvironments = dict.environments;
  
  if (styleHints) {
    if (styleHints.avoid_surface_keywords && styleHints.avoid_surface_keywords.length > 0) {
      const filtered = validSurfaces.filter(s => !styleHints.avoid_surface_keywords.some(k => s.toLowerCase().includes(k.toLowerCase())));
      if (filtered.length > 0) validSurfaces = filtered;
    }
    if (styleHints.avoid_environment_keywords && styleHints.avoid_environment_keywords.length > 0) {
      const filtered = validEnvironments.filter(e => !styleHints.avoid_environment_keywords.some(k => e.toLowerCase().includes(k.toLowerCase())));
      if (filtered.length > 0) validEnvironments = filtered;
    }
  }

  const surface     = pick(rng, validSurfaces);
  const environment = pick(rng, validEnvironments);
  const lighting    = pick(rng, dict.lighting);

  // Rekwizyty: najpierw PIM, fallback na neutralne (produkt NIGDY sam)
  let props = [];
  if (plan.role === 'ingredients' || plan.role === 'hero' || plan.role === 'mood' || plan.role === 'macro') {
    props = extractIngredientProps(pimText, rng, plan.propCount, patchAsObject);
    while (props.length < plan.propCount) {
      const neutral = pick(rng, NEUTRAL_PROPS[category] || NEUTRAL_PROPS.NON_CHEMICAL_GENERAL);
      if (!props.includes(neutral)) props.push(neutral);
      else break; // zabezpieczenie przed pętlą przy 1-elementowej puli
    }
  }

  const prompt = buildBackgroundPrompt({ role: plan.role, surface, environment, lighting, props });

  fd.append('background.prompt', prompt);
  fd.append('background.expandPrompt', 'never'); // nowsze API: background.expandPrompt.mode=ai.never
  fd.append('background.seed', String(seed));
  fd.append('quality', 'advanced');

  // >>> KLUCZ DO REALIZMU <<<
  fd.append('lighting.mode', 'ai.auto');  // AI Relight: produkt prześwietlony pod scenę
  fd.append('shadow.mode', 'ai.preset-soft');    // miękki cień spójny z kierunkiem światła

  // Kompozycja — deterministyczny wybór z puli przypisanej do slotu
  const comp = COMPOSITIONS[pick(rng, plan.compPool)];
  fd.append('paddingTop', String(comp.pT));
  fd.append('paddingBottom', String(comp.pB));
  fd.append('paddingLeft', String(comp.pL));
  fd.append('paddingRight', String(comp.pR));
  fd.append('horizontalAlignment', comp.hA);
  fd.append('verticalAlignment', comp.vA);

  if (plan.role === 'macro') {
    // Przycięta krawędź źródła ma się kleić do krawędzi kadru
    fd.append('ignorePaddingAndSnapOnCroppedSides', 'true');
  }

  return {
    endpoint: PHOTOROOM_ENDPOINT,
    headers: { ...MODEL_HEADERS.BACKGROUND },
    formData: fd,
    meta: { slot, role: plan.role, ean, seed, surface, environment, lighting, props, composition: comp.label, prompt },
  };
}

// ============================================================================
// [8] PRE-PROCESSING DLA SLOTU MAKRO (slot 3)
// ============================================================================
// Crop źródła PRZED wysyłką => autentyczne "drugie ujęcie" z jednego zdjęcia.
// Wymaga: npm i sharp
// ============================================================================

async function cropForMacroSlot(sourceBuffer, topFraction = 0.62) {
  const sharp = require('sharp');
  const img = sharp(sourceBuffer);
  const { width, height } = await img.metadata();
  return img
    .extract({ left: 0, top: 0, width, height: Math.round(height * topFraction) })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }) // wysoka jakość, metadane patrz [9]
    .toBuffer();
}

// ============================================================================
// [9] AI ACT / COMPLIANCE — higiena metadanych (art. 50, od 02.08.2026)
// ============================================================================
// 1. Warstwa produktu = prawdziwe zdjęcie. NIE używamy beautify.mode ani
//    żadnej edycji dotykającej opakowania. AI generuje WYŁĄCZNIE tło i cień.
// 2. Postprocessing nie może zdzierać metadanych C2PA/IPTC z odpowiedzi
//    Photoroomu. Jeśli rekompresujesz (sharp), przenieś metadane jawnie
//    i dopisz oznaczenie kompozytu:
//
//    const exifr = piexif / exiftool-vendored — rekomendowane exiftool:
//    XMP-iptcExt:DigitalSourceType =
//      "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia"
//
// 3. W opisie oferty Allegro trzymamy stałą klauzulę:
//    "Zdjęcia nr 2-9 przedstawiają aranżacje — tła wygenerowane cyfrowo.
//     Wygląd produktu i opakowania jest autentyczny."
// ============================================================================

const AI_ACT_DISCLOSURE_PL =
  'Zdjęcia aranżacyjne (2-9): tła wygenerowane cyfrowo. ' +
  'Wygląd produktu i opakowania jest autentyczny.';

// ============================================================================
// [10] PRZYKŁAD UŻYCIA (orchestrator / Węzeł 0)
// ============================================================================
//
// const fs = require('fs');
// const src = fs.readFileSync('./uploads/8033874953366.jpg');
//
// for (let slot = 1; slot <= 9; slot++) {
//   const blob = new Blob(
//     [ SLOT_PLAN[slot].role === 'macro' ? await cropForMacroSlot(src) : src ],
//     { type: 'image/jpeg' }
//   );
//   const req = buildPhotoroomRequest({
//     ean: '8033874953366',
//     slot,
//     category: 'COSMETICS_BEAUTY',
//     pimText: 'Equilibra Rosmarino Ialuronico Dermo Shampoo Rinforzante ' +
//              'acido ialuronico tè verde rozmaryn zielona herbata',
//     imageBlob: blob,
//   });
//   const res = await fetch(req.endpoint, {
//     method: 'POST',
//     headers: { 'x-api-key': process.env.PHOTOROOM_KEY, ...req.headers },
//     body: req.formData,
//   });
//   fs.writeFileSync(`./out/${req.meta.ean}_slot${slot}.jpg`,
//                    Buffer.from(await res.arrayBuffer()));
//   console.log(`[slot ${slot}] ${req.meta.role} | ${req.meta.composition ?? ''} | seed=${req.meta.seed ?? '-'}`);
// }
//
// ============================================================================

module.exports = {
  hashSKU,
  seedForSlot,
  mulberry32,
  STYLE_DICTIONARIES,
  INGREDIENT_PROPS,
  NEUTRAL_PROPS,
  COMPOSITIONS,
  SLOT_PLAN,
  extractIngredientProps,
  buildBackgroundPrompt,
  buildPhotoroomRequest,
  getKnownIngredientKeys,
  cropForMacroSlot,
  AI_ACT_DISCLOSURE_PL,
  PHOTOROOM_ENDPOINT,
  MODEL_HEADERS,
};
