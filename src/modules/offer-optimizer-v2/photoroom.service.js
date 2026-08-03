const FormData = require('form-data');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { GLOBAL_ENVIRONMENTS, GLOBAL_SURFACES, GLOBAL_LIGHTING } = require('./photoroom.dictionaries');

// Wczytywanie wyuczonych properties (właściwości INCI itp. przeniesione z V1)
// Z V1 zachowujemy te, które działały super.
const INGREDIENT_PROPS = {
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

const NEUTRAL_PROPS = [
  'a folded cream cotton towel',
  'a small ceramic dish',
  'smooth river stones',
  'a sprig of dried grass in soft focus',
  'clear water droplets on the surface',
  'a natural loofah sponge',
  'sparkling clean glassware in the background',
  'a natural cellulose sponge',
  'a neatly folded grey microfiber cloth',
  'a small steel tray',
  'a folded linen cloth',
  'a smooth wooden block',
  'a coil of natural twine'
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
  
  for (const [needle, phrase] of Object.entries(activeDictionary)) {
    if (text.includes(needle.toLowerCase()) && !matched.includes(phrase)) matched.push(phrase);
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

// Zmieniony SLOT PLAN - zlikwidowane 'macro'
const SLOT_PLAN = {
  1: { role: 'thumbnail' },
  2: { role: 'hero',        propCount: 1 },
  3: { role: 'ingredients', propCount: 2 },
  4: { role: 'mood',        propCount: 1 },
  5: { role: 'hero',        propCount: 0 },
  6: { role: 'ingredients', propCount: 3 },
  7: { role: 'hero',        propCount: 1 },
  8: { role: 'mood',        propCount: 0 },
  9: { role: 'ingredients', propCount: 2 },
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
  if (plan.propCount > 0) {
    props = extractIngredientProps(pimText, plan.propCount);
    while (props.length < plan.propCount) {
      const neutral = pickRandom(NEUTRAL_PROPS);
      if (!props.includes(neutral)) props.push(neutral);
      else break;
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
    try {
        if (ean) {
            const product = await prisma.product.findUnique({ where: { ean } });
            if (product) {
                const featuresString = product.features ? JSON.stringify(product.features) : '';
                const draftString = product.offerDraft ? JSON.stringify(product.offerDraft) : '';
                productDetailsText = `NAME: ${product.name} FEATURES: ${featuresString} DESC: ${product.descriptionHtml || ''} DRAFT: ${draftString}`;
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

        // Wyciąganie marki z INCI (tekst PIM)
        const brandMatch = productDetailsText.match(/NAME:\s*([^\s]+)/);
        const brand = brandMatch ? brandMatch[1].toUpperCase() : 'MARKA';

        // --- POST-PROCESSING: Włoska ramka i znak wodny AI (Sharp) ---
        const svgFrame = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
          <!-- Prawa ramka (Czerwona) -->
          <rect x="1056" y="0" width="24" height="1080" fill="#CE2B37" />
          
          <!-- Górna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="0" width="360" height="24" fill="#009246" />
          <rect x="360" y="0" width="360" height="24" fill="#FFFFFF" />
          <rect x="720" y="0" width="360" height="24" fill="#CE2B37" />
          
          <!-- Dolna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="1056" width="360" height="24" fill="#009246" />
          <rect x="360" y="1056" width="360" height="24" fill="#FFFFFF" />
          <rect x="720" y="1056" width="360" height="24" fill="#CE2B37" />

          <!-- Lewa ramka (Zielona) - Przerwana na środku dla marki -->
          <rect x="0" y="0" width="24" height="380" fill="#009246" />
          <rect x="0" y="700" width="24" height="380" fill="#009246" />
          
          <!-- Tekst Marki w przerwie lewej ramki (bez letter-spacing, by uniknąć problemów w librsvg) -->
          <text x="-540" y="19" font-family="sans-serif" font-size="24" font-weight="bold" fill="#009246" stroke="#FFFFFF" stroke-width="1.5" text-anchor="middle" transform="rotate(-90)">${brand}</text>

          <!-- Znacznik AI (Pigułka z tekstem AI i piktogramem) -->
          <g transform="translate(940, 1000)">
            <rect x="0" y="0" width="100" height="40" rx="20" fill="rgba(0,0,0,0.65)" />
            <text x="15" y="28" font-family="sans-serif" font-size="22" font-weight="bold" fill="white">AI</text>
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
