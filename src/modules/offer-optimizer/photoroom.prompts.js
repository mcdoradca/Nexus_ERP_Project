const { GoogleGenerativeAI } = require('@google/generative-ai');

function hashSKU(sku) {
    if (!sku) return 12345;
    const str = String(sku);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    // Dodanie prostego mnożnika, aby uniknąć małych klastrów dla podobnych EANów
    return Math.abs(hash * 31);
}

// Mapowanie tekstów PIM na tagi
function extractProductTags(text) {
    if (!text) return [];
    const textLower = text.toLowerCase();
    const tags = [];
    if (textLower.includes('węgiel') || textLower.includes('detox') || textLower.includes('oczyszcz')) tags.push('detox');
    if (textLower.includes('woda') || textLower.includes('żel') || textLower.includes('nawilż') || textLower.includes('pian')) tags.push('water');
    if (textLower.includes('matuj') || textLower.includes('sebum')) tags.push('matte');
    if (textLower.includes('natura') || textLower.includes('roślin')) tags.push('nature');
    return tags;
}

const SLOTS_DICTIONARIES = {
    // Slot 2 (index 1) - Było Urban Modern, teraz "Slot 8" - Geometryczne Światło / Art (Gobo)
    1: {
        surfaces: [
            "flat, pristine white plaster with fine tactile grain",
            "smooth, matte ivory micro-cement",
            "flawless, pale gray alabaster stone",
            "crisp white architectural ceramic slab"
        ],
        microDetails: [
            "Dramatic 'gobo' lighting: sharp geometric shadows of window blinds cast across the wall with high-contrast edges.",
            "Dramatic 'gobo' lighting: sharp shadows of tropical palm leaves cast perfectly across the background.",
            "Dramatic 'gobo' lighting: crisp angular architectural shadows slicing through the bright scene.",
            "Dramatic 'gobo' lighting: subtle dappled sunlight filtered through a distant tree canopy."
        ],
        lightingAndAtmosphere: [
            "An empty, avant-garde artistic studio. The background is a crisp white architectural wall.",
            "An empty, high-end minimalist gallery space. The background is a flawless, bright gallery wall.",
            "An empty, pristine conceptual studio setting. The background is a seamless white cove.",
            "An empty, sophisticated bright architectural space. The background is a pure, matte white wall."
        ],
        build: (s, d, l) => `${l} The resting surface is ${s}. ${d} Infinite depth of field, f/22 aperture, maximum sharpness everywhere. Empty scene, absolutely no blur, no bokeh, no people.`
    },
    // Slot 3 (index 2) - Raw Nature / Zen
    2: {
        surfaces: [
            "a flat, dark river stone surrounded by hyper-detailed green moss",
            "a weathered piece of driftwood covered in fine organic textures",
            "a raw, dark slate rock with tiny authentic dew droplets",
            "a flat, organic basalt slab surrounded by lush, vibrant fern leaves"
        ],
        microDetails: [
            "and tiny authentic dew droplets catching the morning rays.",
            "featuring highly textured, realistic natural imperfections.",
            "with ultra-sharp, raw organic grain.",
            "and fine, realistic forest floor details."
        ],
        lightingAndAtmosphere: [
            "An empty, majestic pine forest at sunrise.",
            "An empty, serene botanical garden at early dawn.",
            "An empty, deep vibrant woodland setting with crisp morning sunlight.",
            "An empty, lush tropical forest atmosphere."
        ],
        build: (s, d, l) => `${l} The resting surface is ${s} ${d} Subtle atmospheric haze. Infinite depth of field, f/22 aperture, tack-sharp focus on every leaf and stone texture. Crisp sunlight casting a realistic sharp shadow. Empty scene, absolutely no blur, no soft focus, no bokeh, no floating objects.`
    },
    // Slot 4 (index 3) - Fashion Editorial
    3: {
        surfaces: [
            "a flat, highly polished black glass reflecting subtle ambient reflections",
            "a flawless, dark obsidian mirror with razor-sharp edges",
            "a glossy, deep charcoal acrylic surface",
            "a perfectly smooth, reflective dark marble slab"
        ],
        microDetails: [
            "A single dramatic spotlight creating sharp geometric shadows with fine light diffusion on the floor.",
            "Intense, cinematic rim lighting highlighting the flawless texture.",
            "A sharp, high-contrast spotlight slicing through the dark.",
            "Dramatic chiaroscuro lighting casting a razor-sharp shadow."
        ],
        lightingAndAtmosphere: [
            "An empty, sophisticated dark monochromatic studio setting.",
            "An empty, high-end luxury fashion editorial backdrop.",
            "An empty, premium dark minimalist stage.",
            "An empty, moody and elegant product photography studio."
        ],
        build: (s, d, l) => `${l} The resting surface is ${s}. ${d} Infinite depth of field, f/22 aperture, razor-sharp from front to back. Minimalist empty scene, absolutely no blur, no soft focus, no props, no people.`
    },
    // Slot 5 (index 4) - Woda / Orzeźwienie
    4: {
        surfaces: [
            "pristine white sand with subtle micro-ripples from the wind",
            "a smooth, wet pebble stone surface",
            "flawless, bright coral sand",
            "a flat, sun-bleached wooden deck with fine grain"
        ],
        microDetails: [
            "The background is a sparkling infinity pool and ocean horizon reflecting intense summer sun, with fine light refractions dancing on the ground.",
            "The background is crystal-clear, azure tropical water with hyper-detailed ripples and brilliant light flares.",
            "The background is a majestic coastal horizon with sharp, crashing wave details in the distance.",
            "The background is an ultra-sharp, luxurious resort pool reflecting the bright blue sky."
        ],
        lightingAndAtmosphere: [
            "An empty, luxury resort scene.",
            "An empty, premium tropical island setting.",
            "An empty, high-end coastal vacation atmosphere.",
            "An empty, refreshing summer oasis."
        ],
        build: (s, d, l) => `${l} The resting surface is ${s}. ${d} Infinite depth of field, f/22 aperture, every water ripple and grain of sand is razor-sharp. Brilliant high-key lighting. Empty scene, absolutely no blur, no bokeh, no out of focus areas, no people.`
    },
    // Slot 6 (index 5) - Minimalist Color Blocking
    5: {
        surfaces: [
            "perfectly smooth with a matte terracotta finish",
            "a flawless, flat pastel peach podium",
            "a clean, soft coral architectural slab",
            "a highly precise, matte warm-grey surface"
        ],
        microDetails: [
            "The background is a seamless, vibrant terracotta pastel wall separated by a crisp architectural lighting line and a subtle surface gradient.",
            "The background is a minimalist, split-tone pastel wall with a razor-sharp shadow line.",
            "The background features striking, vibrant color blocking with precise geometric light angles.",
            "The background is a flawless, warm pastel backdrop with an ultra-sharp dividing shadow."
        ],
        lightingAndAtmosphere: [
            "An empty, minimalist design studio.",
            "An empty, avant-garde colorful architectural space.",
            "An empty, modern interior with bold color aesthetics.",
            "An empty, premium conceptual design set."
        ],
        build: (s, d, l) => `${l} The resting surface is ${s}. ${d} Infinite depth of field, f/22 aperture, sharp geometric shadow. Empty scene, absolutely no blur, no bokeh, no soft focus, no pedestals.`
    },
    // Slot 7 (index 6) - Cozy Interior
    6: {
        surfaces: [
            "a rustic brushed oak wood table showing authentic wood grain and micro-textures",
            "a warm, polished walnut wooden surface",
            "a light, natural ash wood board with hyper-detailed fibers",
            "a premium, authentic teak wood slab"
        ],
        microDetails: [
            "Warm ambient light particles floating in the air stream. Radiant natural window light.",
            "Subtle, realistic morning sunlight casting long, cozy shadows across the wood.",
            "Beautiful, diffused daylight highlighting the microscopic texture of the wood.",
            "Golden hour sunlight filtering through, creating a warm and inviting atmosphere."
        ],
        lightingAndAtmosphere: [
            "An empty, luxurious modern minimalist living room.",
            "An empty, warm and elegant Scandinavian interior.",
            "An empty, premium cozy home setting.",
            "An empty, beautifully decorated natural living space."
        ],
        build: (s, d, l) => `${l} bathed in light. The resting surface is ${s}. ${d} A neutral palette of off-white and sand. Infinite depth of field, f/22 aperture, every furniture texture and wood grain is razor-sharp and lifelike. Empty scene, absolutely no blur, no soft focus, no bokeh, no people.`
    },
    // Slot 8 (index 7) - Urban Modern (Przeniesiony ze Slotu 2)
    7: {
        surfaces: [
            "a flat, dark textured concrete table",
            "a matte black slate countertop",
            "a weathered charcoal stone plate",
            "a smooth dark industrial micro-cement slab"
        ],
        microDetails: [
            "featuring fine mineral dust particles scattered naturally.",
            "with subtle natural micro-scratches on the surface.",
            "showing raw, hyper-detailed authentic stone grain.",
            "with fine tactile grain catching the light."
        ],
        lightingAndAtmosphere: [
            "Visible faint dust motes drifting softly in a crisp diagonal sunbeam. Cinematic warm sunlight casting a sharp contact shadow.",
            "Subtle atmospheric haze catching the morning rays. Crisp directional light casting a long, realistic shadow.",
            "Warm ambient light particles floating in the air. Striking dramatic side lighting highlighting the surface texture.",
            "Fine light refractions dancing on the ground. Brilliant cinematic lighting casting a defined geometric shadow."
        ],
        build: (s, d, l) => `An empty, hyper-detailed modern city street scene at golden hour. The resting surface is ${s} ${d} ${l} Infinite depth of field, f/22 aperture, tack-sharp focus on every background detail. Empty scene, absolutely no blur, no soft focus, no bokeh, no people, no pedestals.`
    },
    // Slot 9 (index 8) - PIM Ingredients
    8: {
        surfaces: [
            "a clean slate countertop featuring subtle natural chipping and stone dust",
            "a pristine, hyper-detailed light marble slab with organic veins",
            "a dark, textured volcanic rock surface",
            "a flawless, smooth ceramic countertop"
        ],
        microDetails: [
            "showing raw, hyper-detailed organic textures.",
            "with brilliant realistic lighting and soft ambient bounce.",
            "highlighting the authentic, tactile macro details of the ingredients.",
            "with crisp, cinematic light bringing out vibrant natural colors."
        ],
        build: (s, d, l) => `An empty, bright commercial photography studio. The resting surface is ${s}. Resting completely flat on the surface are: ${l}, ${d} Infinite depth of field, f/22 aperture, hyper-detailed, everything in tack-sharp focus. Empty scene, absolutely no blur, no bokeh, no soft focus, no flying objects, no hands.`
    }
};

const paddingVariants = [
    { paddingTop: "0.08", paddingBottom: "0.08", paddingLeft: "0.08", paddingRight: "0.45" }, // A: Asymetria Lewa
    { paddingTop: "0.32", paddingBottom: "0.20", paddingLeft: "0.32", paddingRight: "0.32" }, // B: Daleki Hero
    { paddingTop: "0.18", paddingBottom: "0.12", paddingLeft: "0.48", paddingRight: "0.08" }, // C: Asymetria Prawa
    { paddingTop: "0.18", paddingBottom: "0.18", paddingLeft: "0.22", paddingRight: "0.22" }  // D: Klasyczny Hero
];

function getPaddingForSlot(index, seed) {
    if (index === 0) {
        // Slot 1 - Wymuszenie 90% pokrycia kadru (0.05 marginesu)
        return { paddingTop: "0.05", paddingRight: "0.05", paddingBottom: "0.05", paddingLeft: "0.05" };
    }
    
    // Zapętlone przypisywanie paddingów do slotów w oparciu o index, urozmaicone seedem
    return paddingVariants[(index + seed) % paddingVariants.length];
}

async function getDeterministicPromptForSlot(index, ean, productDetailsText, apiKey, generateWithRetry) {
    if (index === 0) return "Odczytaj ze zdjęcia główny składnik produktu i umieść go centralnie za produktem na czystym, nieskazitelnie białym tle. Oryginalny produkt musi pozostać w 100% nienaruszony - absolutny zakaz modyfikacji jego kształtu, etykiety czy proporcji.";
    
    const seed = hashSKU(ean);
    const tags = extractProductTags(productDetailsText);
    const dict = SLOTS_DICTIONARIES[index];
    
    if (!dict) return "Photoroom_Native_AI";
    
    let surface = dict.surfaces[seed % dict.surfaces.length];
    let detail = dict.microDetails[seed % dict.microDetails.length];
    const light = dict.lightingAndAtmosphere[seed % dict.lightingAndAtmosphere.length];
    
    // Nadpisywanie PIM (przykład nadpisywania dla Slotu 9 lub 8)
    if (tags.includes('detox') && dict.surfaces.some(s => s.includes('black') || s.includes('dark'))) {
        // Przymus ciemnych powierzchni dla Detox/Węgiel (Slot 8 to Urban Modern, gdzie mamy "dark textured concrete table")
        const darkSurfaces = dict.surfaces.filter(s => s.includes('dark') || s.includes('black') || s.includes('charcoal'));
        if (darkSurfaces.length > 0) surface = darkSurfaces[seed % darkSurfaces.length];
    }
    if (tags.includes('water') && dict.microDetails.some(d => d.includes('water') || d.includes('drop'))) {
        const waterDetails = dict.microDetails.filter(d => d.includes('water') || d.includes('drop') || d.includes('dew'));
        if (waterDetails.length > 0) detail = waterDetails[seed % waterDetails.length];
    }

    if (index === 8) { // Slot 9 - PIM Ingredients
        let ingredients = "natural elements";
        if (apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig: { temperature: 0.1 }});
                const promptInstruction = `Extract the main 2-3 natural active ingredients from this product data and translate them to English as a comma separated list. If none found, reply with "natural elements". Data: ${productDetailsText}`;
                const result = await generateWithRetry(model, promptInstruction, 2, "Agent_Slot9_Ingredients");
                ingredients = result.response.text().replace(/\n/g, '').trim();
                console.log("[Photoroom Slot 9] Wyekstrahowano składniki:", ingredients);
            } catch (e) {
                console.error("[Photoroom Slot 9] Błąd pobierania składników (fallback):", e.message);
            }
        }
        return dict.build(surface, detail, ingredients);
    }

    return dict.build(surface, detail, light);
}

module.exports = {
    getDeterministicPromptForSlot,
    getPaddingForSlot,
    hashSKU
};
