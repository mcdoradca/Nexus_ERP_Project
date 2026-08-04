const FormData = require('form-data');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let FONT = null;
try {
    const fontPath = path.join(__dirname, 'assets', 'Roboto-Bold.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    const fontArrayBuffer = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
    FONT = opentype.parse(fontArrayBuffer);
} catch (e) {
    console.error("[Photoroom V2] Błąd wczytywania czcionki dla wektorów:", e.message);
}

function textToPathData(text, fontSize) {
    if (!FONT) return { d: '', width: 0 };
    const p = FONT.getPath(text, 0, 0, fontSize);
    return {
        d: p.toPathData(2),
        width: FONT.getAdvanceWidth(text, fontSize)
    };
}

const { GLOBAL_ENVIRONMENTS, GLOBAL_SURFACES, GLOBAL_LIGHTING } = require('./photoroom.dictionaries');

// Wczytywanie wyuczonych properties (właściwości INCI itp. przeniesione z V1)
// Z V1 zachowujemy te, które działały super.
// Rozbudowany słownik składników (wielowariantowy)
const INGREDIENT_PROPS = {
  'rozmaryn':        ['fresh rosemary sprigs', 'scattered rosemary leaves on a soft surface', 'a small bundle of dried rosemary tied with twine'],
  'rosmarino':       ['fresh rosemary sprigs', 'scattered rosemary leaves on a soft surface'],
  'rosemary':        ['fresh rosemary sprigs', 'scattered rosemary leaves on a soft surface'],
  'lawend':          ['dried lavender stems', 'a few sprigs of fresh purple lavender', 'scattered lavender buds'],
  'lavend':          ['dried lavender stems', 'a few sprigs of fresh purple lavender'],
  'szałwi':          ['fresh sage leaves', 'a bundle of dried white sage'],
  'sage':            ['fresh sage leaves', 'a bundle of dried white sage'],
  'eukaliptus':      ['a eucalyptus branch with soft green leaves', 'scattered silver dollar eucalyptus leaves'],
  'eucalyptus':      ['a eucalyptus branch with soft green leaves', 'scattered silver dollar eucalyptus leaves'],
  'rumianek':        ['chamomile flowers', 'a few delicate chamomile blossoms resting softly'],
  'chamomile':       ['chamomile flowers', 'a few delicate chamomile blossoms resting softly'],
  'mięt':            ['fresh mint leaves', 'a small sprig of bright green peppermint', 'dewy mint leaves'],
  'mint':            ['fresh mint leaves', 'a small sprig of bright green peppermint'],
  'aloes':           ['a cut aloe vera leaf with clear gel drops', 'fresh aloe vera slices', 'a small potted aloe vera plant in soft focus'],
  'aloe':            ['a cut aloe vera leaf with clear gel drops', 'fresh aloe vera slices'],
  'pokrzyw':         ['fresh nettle leaves with morning dew', 'a bundle of dried nettle'],
  'zielona herbata': ['loose green tea leaves', 'a delicate matcha powder dusting'],
  'tè verde':        ['loose green tea leaves', 'a delicate matcha powder dusting'],
  'green tea':       ['loose green tea leaves', 'a delicate matcha powder dusting'],
  'herbat':          ['loose black tea leaves', 'a small vintage teaspoon with tea leaves'],
  'cytryn':          ['fresh lemon slices', 'a halved bright yellow lemon', 'curled lemon peel zest'],
  'lemon':           ['fresh lemon slices', 'a halved bright yellow lemon'],
  'pomarańcz':       ['fresh orange slices', 'a halved juicy orange', 'dried orange slices'],
  'orange':          ['fresh orange slices', 'a halved juicy orange'],
  'granat':          ['pomegranate seeds scattered beautifully', 'a cracked open pomegranate with ruby red seeds'],
  'malin':           ['a few fresh red raspberries', 'crushed raspberries leaving a soft pink stain'],
  'kokos':           ['a cracked coconut half showing white meat', 'scattered coconut flakes', 'a small bowl of coconut oil'],
  'coconut':         ['a cracked coconut half showing white meat', 'scattered coconut flakes'],
  'migdał':          ['raw almonds in their skins', 'blanched white almonds', 'a few almond blossoms'],
  'almond':          ['raw almonds in their skins', 'blanched white almonds'],
  'owies':           ['scattered golden oat flakes', 'a small wooden scoop filled with oats', 'a few stalks of dried oat grass'],
  'oat':             ['scattered golden oat flakes', 'a small wooden scoop filled with oats'],
  'miód':            ['a wooden honey dipper with golden honey drips', 'a small pool of amber honey', 'a piece of natural honeycomb'],
  'honey':           ['a wooden honey dipper with golden honey drips', 'a piece of natural honeycomb'],
  'wanili':          ['dark vanilla pods', 'a vanilla bean split open', 'a delicate yellow vanilla orchid'],
  'hialuron':        ['clear water droplets glistening on the surface', 'a small glass pipette dripping clear serum', 'microscopic water bubbles in soft focus'],
  'ialuronico':      ['clear water droplets glistening on the surface', 'a small glass pipette dripping clear serum'],
  'hyaluronic':      ['clear water droplets glistening on the surface', 'a small glass pipette dripping clear serum'],
  'kolagen':         ['a small dish of clear viscous serum', 'a single glowing drop of essence'],
  'collagen':        ['a small dish of clear viscous serum', 'a single glowing drop of essence'],
  'keratyn':         ['a silky strand of light satin fabric', 'a smooth glossy silk ribbon'],
  'keratin':         ['a silky strand of light satin fabric', 'a smooth glossy silk ribbon'],
  'witamina c':      ['bright fresh orange slices', 'a glowing drop of yellow serum', 'a halved ruby red grapefruit'],
  'vitamin c':       ['bright fresh orange slices', 'a glowing drop of yellow serum'],
  'węgiel':          ['pieces of raw activated charcoal', 'a dusting of fine black charcoal powder', 'smooth black volcanic stones'],
  'charcoal':        ['pieces of raw activated charcoal', 'a dusting of fine black charcoal powder'],
  'glinka':          ['a small bowl of powdered green clay', 'a smear of pink clay texture', 'chunks of raw white kaolin clay'],
  'clay':            ['a small bowl of powdered green clay', 'a smear of pink clay texture'],
  'sól morska':      ['coarse sea salt crystals', 'a pinch of pink himalayan salt', 'a small wooden bowl of bath salts'],
  'sea salt':        ['coarse sea salt crystals', 'a pinch of pink himalayan salt'],
  'argan':           ['argan nuts', 'a small glass dish of golden argan oil', 'a cracked argan kernel'],
  'shea':            ['a chunk of raw yellow shea butter', 'a smooth dollop of white shea cream'],
  'jojoba':          ['golden jojoba seeds', 'a few drops of golden oil'],
  'oliw':            ['an olive branch with green olives', 'a rustic bowl with fresh olives', 'a drop of green olive oil'],
  'olive':           ['an olive branch with green olives', 'a drop of green olive oil'],
  'ocean':           ['smooth sea glass pieces', 'a delicate white seashell', 'a starfish resting softly'],
  'alga':            ['translucent green seaweed strands', 'a piece of dry kelp'],
  'detox':           ['fresh cucumber slices and mint leaves', 'a glass of infused water with lemon'],
  'awokado':         ['a halved fresh avocado', 'a small spoonful of green avocado mash', 'avocado leaves'],
  'masło':           ['a smooth swirl of rich cream', 'a chunk of raw botanical butter'],
  'truskawk':        ['a fresh ripe strawberry', 'a halved strawberry with green leaves'],
  'jedwab':          ['a pool of liquid silk', 'a draping of fine white silk cloth'],
  'róż':             ['soft pink rose petals', 'a single blooming white rose', 'a wild pink rose bud'],
  'rose':            ['soft pink rose petals', 'a single blooming white rose'],
};

// Nowe obszerne i nieszablonowe elementy neutralne (bez oklepanych marmurów)
const NEUTRAL_PROPS = [
  // Delikatna natura / zwierzątka
  'a tiny cute ladybug resting on a leaf',
  'a small adorable garden snail on a twig',
  'a delicate butterfly perched softly in the background',
  'a cute little hermit crab shell',
  'a small friendly bumblebee hovering softly',
  'a tiny green tree frog in soft focus',
  'a fluffy white dandelion seed head',
  'a delicate iridescent dragonfly wing',
  
  // Tkaniny i tekstury
  'a gently folded cream cotton towel',
  'a flowing strand of sheer organza ribbon',
  'a crumpled piece of raw linen',
  'a smooth draped silk scarf',
  'a piece of delicate white lace',
  'a soft fluffy wool throw in the background',
  'a piece of woven rattan texture',
  
  // Szkło i woda
  'clear water droplets scattered on the surface',
  'a subtle water ripple reflection',
  'a clear glass sphere refracting light',
  'a softly frosted glass element',
  'a tiny glass vial catching the sunlight',
  'a vintage textured glass bottle in soft focus',
  'a small puddle of clear water with soft reflections',
  'condensation drops on a cool surface',
  
  // Botanika i flora neutralna
  'a sprig of fluffy dried pampas grass',
  'a beautiful green monstera leaf shadow',
  'a delicate fern frond',
  'a piece of sun-bleached driftwood',
  "a cluster of tiny white baby's breath flowers",
  'a dried lotus pod',
  'a fresh green ginkgo biloba leaf',
  'a thin curling vine',
  'a small piece of natural cork',
  'a dried pine cone',
  
  // Naturalne kamienie (nietypowe, bez marmuru/granitu)
  'a smooth dark river pebble',
  'a piece of rough rose quartz crystal',
  'a translucent piece of sea glass',
  'a small cluster of amethyst crystals',
  'a glowing piece of natural amber',
  'a slice of natural agate with beautiful banding',
  'a chunk of raw sea salt',
  'a weathered terracotta shard',
  
  // Drewno i inne naturalne surowce
  'a small wooden block with visible grain',
  'a piece of curled birch bark',
  'a few scattered natural pearls',
  'a piece of raw unpolished clay',
  'a natural sea sponge',
  'a small bamboo stalk',
  'a woven palm leaf',
  'a piece of raw honeycomb texture'
];

let learnedProps = {};
try {
  // Próba odczytu learned_props.json z V1, żeby nic nie tracić
  const p = path.join(__dirname, '../offer-optimizer/learned_props.json');
  if (fs.existsSync(p)) {
    learnedProps = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
} catch (e) {
  console.warn('[photoroom.v2] Brak learned_props.json z v1');
}

function extractIngredientProps(pimText, limit = 2) {
  const text = (pimText || '').toLowerCase();
  const matched = [];
  const activeDictionary = { ...INGREDIENT_PROPS, ...learnedProps };
  
  for (const [needle, phrases] of Object.entries(activeDictionary)) {
    if (text.includes(needle.toLowerCase())) {
        const phrase = Array.isArray(phrases) ? pickRandom(phrases) : phrases;
        if (!matched.includes(phrase)) matched.push(phrase);
    }
  }
  if (matched.length <= limit) return matched;
  // Losowy wybór, bo Agent 8 wylatuje i chcemy totalny random
  const out = [];
  const pool = [...matched];
  while(out.length < limit && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// -----------------------------------------------------------------------------------
// CHAOS ENGINE: 100% Losowości, duża rozpiętość pozycji, brak determinizmu EAN
// -----------------------------------------------------------------------------------
// Presety kompozycji rozszerzone, żeby produkt pojawiał się w najróżniejszych miejscach.
// Suma paddingów przeciwnych < 1.0. verticalAlignment = bottom dla postawienia na blacie.
const COMPOSITIONS = [
  // Duże hero lewo/prawo (zmniejszone paddingi by produkt się zmieścił)
  { pT: 0.05, pB: 0.05, pL: 0.05, pR: 0.40, hA: 'left',   vA: 'bottom', label: 'HUGE_LEFT' },
  { pT: 0.05, pB: 0.05, pL: 0.40, pR: 0.05, hA: 'right',  vA: 'bottom', label: 'HUGE_RIGHT' },
  { pT: 0.10, pB: 0.05, pL: 0.10, pR: 0.35, hA: 'left',   vA: 'bottom', label: 'BIG_LEFT' },
  { pT: 0.10, pB: 0.05, pL: 0.35, pR: 0.10, hA: 'right',  vA: 'bottom', label: 'BIG_RIGHT' },
  
  // Średnie pozycje
  { pT: 0.15, pB: 0.10, pL: 0.15, pR: 0.30, hA: 'left',   vA: 'bottom', label: 'MID_LEFT' },
  { pT: 0.15, pB: 0.10, pL: 0.30, pR: 0.15, hA: 'right',  vA: 'bottom', label: 'MID_RIGHT' },
  
  // Małe, edytorialowe (dalekie ujęcia)
  { pT: 0.25, pB: 0.15, pL: 0.25, pR: 0.25, hA: 'center', vA: 'bottom', label: 'FAR_CENTER' },
  { pT: 0.25, pB: 0.15, pL: 0.15, pR: 0.45, hA: 'left',   vA: 'bottom', label: 'FAR_LEFT' },
  { pT: 0.25, pB: 0.15, pL: 0.45, pR: 0.15, hA: 'right',  vA: 'bottom', label: 'FAR_RIGHT' },
  
  // Skrajnie asymetryczne na krawędzi blatu (złagodzone do bezpiecznych 40-45%)
  { pT: 0.20, pB: 0.05, pL: 0.45, pR: 0.05, hA: 'right',  vA: 'bottom', label: 'EDGE_RIGHT' },
  { pT: 0.20, pB: 0.05, pL: 0.05, pR: 0.45, hA: 'left',   vA: 'bottom', label: 'EDGE_LEFT' },

  // Gładkie centralne (klasyczne)
  { pT: 0.15, pB: 0.10, pL: 0.20, pR: 0.20, hA: 'center', vA: 'bottom', label: 'CLASSIC_HERO' },
  { pT: 0.10, pB: 0.05, pL: 0.15, pR: 0.15, hA: 'center', vA: 'bottom', label: 'TIGHT_CENTER' },
  
  // Bardzo dużo stołu (wysoko zawieszony horyzont)
  { pT: 0.05, pB: 0.30, pL: 0.20, pR: 0.20, hA: 'center', vA: 'bottom', label: 'HIGH_HORIZON' },
  { pT: 0.05, pB: 0.25, pL: 0.05, pR: 0.40, hA: 'left',   vA: 'bottom', label: 'HIGH_HORIZON_LEFT' }
];

// Zmieniony SLOT PLAN - zlikwidowane 'macro', zmienione na dynamiczne zakresy propsów
const SLOT_PLAN = {
  1: { role: 'thumbnail' },
  2: { role: 'hero',        minProps: 1, maxProps: 2 },
  3: { role: 'ingredients', minProps: 2, maxProps: 4 },
  4: { role: 'mood',        minProps: 1, maxProps: 2 },
  5: { role: 'hero',        minProps: 1, maxProps: 2 },
  6: { role: 'ingredients', minProps: 2, maxProps: 4 },
  7: { role: 'hero',        minProps: 1, maxProps: 2 },
  8: { role: 'mood',        minProps: 1, maxProps: 2 },
  9: { role: 'ingredients', minProps: 2, maxProps: 3 },
};

function buildBackgroundPrompt({ surface, environment, lighting, props }) {
  const propsClause = props.length
    ? `Resting flat on the surface nearby: ${props.join(' and ')}. `
    : '';

  return (
    `Close-up commercial product photography scene. ${surface} in the foreground, ` +
    `${propsClause}` +
    `background: ${environment}, softly blurred, shallow depth of field. ` +
    `${lighting}. Photorealistic, natural perspective at counter height, ` +
    `no people, no text, no logos.`
  );
}

const PHOTOROOM_ENDPOINT = 'https://image-api.photoroom.com/v2/edit';
const MODEL_HEADERS = {
  SHADOWS:    { 'pr-ai-shadows-model-version': '2026-04-15' },
  BACKGROUND: { 'pr-ai-background-model-version': 'background-studio-beta-2025-03-17' },
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPhotoroomRequest(ean, slot, pimText, imageBlob) {
  const plan = SLOT_PLAN[slot];
  if (!plan) throw new Error(`Nieznany slot: ${slot}`);

  const fd = new FormData();
  fd.append('imageFile', imageBlob, `${ean}_src.jpg`);
  fd.append('removeBackground', 'true');
  fd.append('outputSize', '1080x1080');
  fd.append('export.format', 'jpeg');

  // Miniatura
  if (plan.role === 'thumbnail') {
    fd.append('background.color', '#FFFFFF');
    fd.append('padding', '0.05');
    fd.append('shadow.mode', 'none');
    return {
      endpoint: PHOTOROOM_ENDPOINT,
      headers: { ...MODEL_HEADERS.SHADOWS },
      formData: fd,
      meta: { slot, role: 'thumbnail', ean },
    };
  }

  // Losowanie składników wizualnych bez determinizmu!
  const surface     = pickRandom(GLOBAL_SURFACES);
  const environment = pickRandom(GLOBAL_ENVIRONMENTS);
  const lighting    = pickRandom(GLOBAL_LIGHTING);

  let props = [];
  if (plan.role !== 'thumbnail') {
    // Losujemy ile propsów ze składników chcemy w tym slocie
    const targetCount = Math.floor(Math.random() * (plan.maxProps - plan.minProps + 1)) + plan.minProps;
    
    // Zawsze wyciągamy do targetCount składników powiązanych z produktem
    props = extractIngredientProps(pimText, targetCount);
    
    // Twarda zasada: Zawsze dorzucamy do zdjęcia losowe elementy z NEUTRAL_PROPS (żeby ożywić tło i uniknąć pustki)
    const neutralCount = Math.floor(Math.random() * 2) + 1; // Zawsze 1 lub 2 neutralne
    let addedNeutrals = 0;
    while (addedNeutrals < neutralCount) {
      const neutral = pickRandom(NEUTRAL_PROPS);
      if (!props.includes(neutral)) {
        props.push(neutral);
        addedNeutrals++;
      }
    }
  }

  const prompt = buildBackgroundPrompt({ surface, environment, lighting, props });

  fd.append('background.prompt', prompt);
  fd.append('background.expandPrompt', 'never');
  fd.append('quality', 'advanced');

  fd.append('lighting.mode', 'ai.preserve-hue-and-saturation');  
  fd.append('shadow.mode', 'ai.auto-with-overrides');    
  fd.append('shadow.softnessOverride', '0.7');
  fd.append('shadow.intensityOverride', '0.8');

  // Losowa kompozycja (zamiast przypisanej z góry)
  const comp = pickRandom(COMPOSITIONS);
  fd.append('paddingTop', String(comp.pT));
  fd.append('paddingBottom', String(comp.pB));
  fd.append('paddingLeft', String(comp.pL));
  fd.append('paddingRight', String(comp.pR));
  fd.append('horizontalAlignment', comp.hA);
  fd.append('verticalAlignment', comp.vA);
  // Zabezpieczenie przed wyrzuceniem poza kadr (chroni przed przycinaniem przez padding przy wyrównaniach bocznych)
  fd.append('ignorePaddingAndSnapOnCroppedSides', 'false');

  return {
    endpoint: PHOTOROOM_ENDPOINT,
    headers: { 
      ...MODEL_HEADERS.BACKGROUND,
      ...MODEL_HEADERS.SHADOWS
    },
    formData: fd,
    meta: { slot, role: plan.role, ean, surface, environment, lighting, props, composition: comp.label, prompt },
  };
}

// -------------------------------------------------------------------------
// Wrapper sieciowy (z V1) - zapewnia obejście blokad WAF
// -------------------------------------------------------------------------
const imageHttpsAgent = new https.Agent({ 
    rejectUnauthorized: false,
    family: 4 
});

async function fetchImageSecure(url, timeoutMs = 15000) {
    return axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        httpsAgent: imageHttpsAgent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });
}

// -------------------------------------------------------------------------
// Główna usługa wywoływana przez kontroler (Zastępuje AiService.generateLifestyle)
// -------------------------------------------------------------------------
async function generatePhotoroomLifestyle(imageBase64, sourceImageUrl, ean, imageIndex = 0) {
    const photoroomKey = (process.env.PHOTOROOM_API_KEY && process.env.PHOTOROOM_API_KEY !== "TBD") 
        ? process.env.PHOTOROOM_API_KEY 
        : "sandbox_sk_pr_default_9f10500b15c19db1e2f8aee29e1671ac7ff33aa2";

    const slot = imageIndex + 1;
    console.log(`[Photoroom V2] Rozpoczęto generowanie zdjęcia (Slot ${slot}) dla EAN: ${ean} (CHAOS ENGINE)`);

    // 1. Weryfikacja
    let inputBuffer;
    if (imageBase64 && imageBase64.startsWith('data:image')) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (sourceImageUrl) {
        const imgRes = await fetchImageSecure(sourceImageUrl);
        inputBuffer = Buffer.from(imgRes.data);
    } else {
        throw new Error("Brak wejściowego obrazu (wymagany imageBase64 lub sourceImageUrl).");
    }

    // 2. Pobranie danych z PIM (słowa kluczowe do propsów)
    let productDetailsText = "";
    let dbProduct = null;
    try {
        if (ean) {
            dbProduct = await prisma.product.findUnique({ 
                where: { ean },
                include: { brand: true } 
            });
            if (dbProduct) {
                const featuresString = dbProduct.features ? JSON.stringify(dbProduct.features) : '';
                const draftString = dbProduct.offerDraft ? JSON.stringify(dbProduct.offerDraft) : '';
                productDetailsText = `NAME: ${dbProduct.name} FEATURES: ${featuresString} DESC: ${dbProduct.descriptionHtml || ''} DRAFT: ${draftString}`;
            }
        }
    } catch(e) { 
        console.error("[Photoroom V2] Błąd odczytu PIM:", e.message); 
    }

    // 3. Budowa requestu - ZERO agentów, 100% Random.
    const req = buildPhotoroomRequest(ean, slot, productDetailsText, inputBuffer);
    console.log(`[Photoroom V2] Promt wygenerowany z Chaos Engine: ${req.meta.prompt || 'Thumbnail'}`);

    const headers = {
        'x-api-key': photoroomKey,
        ...req.headers,
        ...req.formData.getHeaders()
    };

    try {
        const response = await axios.post(req.endpoint, req.formData, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 45000
        });

        const resultBuffer = Buffer.from(response.data);

        // --- POST-PROCESSING: Włoska ramka i znak wodny AI (Sharp + opentype.js) ---
        // Wyciąganie marki bez halucynacji regexa
        const brand = (dbProduct && dbProduct.brand && dbProduct.brand.name) 
            ? dbProduct.brand.name.toUpperCase() 
            : null;

        const aiPath = textToPathData('AI', 22);

        let leftFrameSvg = '';
        if (brand) {
            const brandPath = textToPathData(brand, 28);
            const H = 1080;
            const brandY = (H / 2) + (brandPath.width / 2);
            
            // Dynamicznie dopasowana wielkość luki na tekst
            const padding = 60; // Margines wokół tekstu (po 30px na górę i dół luki)
            const gapHeight = brandPath.width + padding;
            let topRectHeight = (H / 2) - (gapHeight / 2);
            let bottomRectY = (H / 2) + (gapHeight / 2);
            let bottomRectHeight = H - bottomRectY;

            // Zabezpieczenie przed ujemnymi wysokościami w przypadku ekstremalnie długiego tekstu
            if (topRectHeight < 0) topRectHeight = 0;
            if (bottomRectHeight < 0) bottomRectHeight = 0;

            leftFrameSvg = `
          <!-- Lewa ramka (Zielona) - Przerwana na środku dla marki -->
          <rect x="0" y="0" width="18" height="${topRectHeight}" fill="#009246" />
          <rect x="0" y="${bottomRectY}" width="18" height="${bottomRectHeight}" fill="#009246" />
          
          <!-- Tekst Marki jako Czyste Krzywe SVG -->
          <!-- translate x=20 by tekst delikatnie wystawał z 18px ramki, y centruje rotowany napis -->
          <g transform="translate(20, ${brandY}) rotate(-90)">
            <path d="${brandPath.d}" fill="#009246" stroke="#FFFFFF" stroke-width="1.5" />
          </g>`;
        }

        const svgFrame = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
          <!-- Prawa ramka (Czerwona) -->
          <rect x="1062" y="0" width="18" height="1080" fill="#CE2B37" />
          
          <!-- Górna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="0" width="360" height="18" fill="#009246" />
          <rect x="360" y="0" width="360" height="18" fill="#FFFFFF" />
          <rect x="720" y="0" width="360" height="18" fill="#CE2B37" />
          
          <!-- Dolna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="1062" width="360" height="18" fill="#009246" />
          <rect x="360" y="1062" width="360" height="18" fill="#FFFFFF" />
          <rect x="720" y="1062" width="360" height="18" fill="#CE2B37" />

${leftFrameSvg}

          <!-- Znacznik AI (Pigułka z tekstem ze ścieżek i piktogramem gwiazdek) -->
          <g transform="translate(940, 1000)">
            <rect x="0" y="0" width="100" height="40" rx="20" fill="rgba(0,0,0,0.65)" />
            <g transform="translate(15, 28)">
                <path d="${aiPath.d}" fill="white" />
            </g>
            <g transform="translate(50, 4) scale(1.33)">
              <path d="M10 2c0 4.42-3.58 8-8 8 4.42 0 8 3.58 8 8 0-4.42 3.58-8 8-8-4.42 0-8-3.58-8-8z" fill="white" />
              <path d="M19 3c0 1.66-1.34 3-3 3 1.66 0 3 1.34 3 3 0-1.66 1.34-3 3-3-1.66 0-3-1.34-3-3z" fill="white" />
              <path d="M17 15c0 1.1-0.9 2-2 2 1.1 0 2 0.9 2 2 0-1.1 0.9-2 2-2-1.1 0-2-0.9-2-2z" fill="white" />
            </g>
          </g>
        </svg>`;

        const compositedBuffer = await sharp(resultBuffer)
            .composite([{ input: Buffer.from(svgFrame) }])
            .jpeg({ quality: 95 })
            .toBuffer();

        const base64Output = `data:image/jpeg;base64,${compositedBuffer.toString('base64')}`;

        return {
            base64: base64Output,
            visualTrendReport: `Wygenerowano za pomocą V2 Chaos Engine. Kompozycja: ${req.meta.composition || 'Brak (Miniaturka)'}`
        };

    } catch (err) {
        let errorDetails = err.message;
        if (err.response && err.response.data) {
            try {
                errorDetails = Buffer.from(err.response.data).toString('utf-8');
            } catch(e) {}
        }
        console.error("[Photoroom V2 Error]", errorDetails);
        throw new Error(`Błąd Photoroom API V2: ${errorDetails}`);
    }
}

module.exports = {
    generateLifestyle: generatePhotoroomLifestyle
};
