OSTATECZNY PLAYBOOK AGENTA AI — SSOT 5.0
Cel: 100% autentyczności produktu (Etykieta), Hiper-ostrość tła (Neuromarketing f/22), Organiczne mikro-elementy likwidujące sterylność.
Endpoint: POST [https://image-api.photoroom.com/v2/edit](https://image-api.photoroom.com/v2/edit)

1. Architektura Żądania (Złoty Payload API)
Wyrzucamy editWithAI. Wracamy do kompozycji. Aby zapobiec automatycznemu rozmywaniu tła, wyłączamy "ulepszacza promptów".

JSON
{
  "imageFile": "[PLIK_RAW_Z_PIM]",
  "removeBackground": "true",
  "background.prompt": "[PROMPT_ZE_SLOTU_PONIŻEJ]",
  "background.expandPrompt": "never",
  "quality": "advanced",
  "paddingTop": "[ZMIENNA]",
  "paddingBottom": "[ZMIENNA]",
  "paddingLeft": "[ZMIENNA]",
  "paddingRight": "[ZMIENNA]"
}
Kluczowe modyfikatory:

Nagłówek HTTP (Header): pr-ai-background-model-version: background-studio-beta-2025-03-17 (Najlepszy model renderujący fotorealistyczne tekstury).

background.expandPrompt: "never" – KRYTYCZNE. Odcina API od samowolnego dodawania rozmyć (bokeh) do Twojego promptu.

Brak editWithAI i negativePrompt – Zapewnia ochronę etykiety, a zakazy wplatamy bezpośrednio w tekst główny.

2. Rozszerzona Macierz Kadrowania (Padding) - 4 Warianty
Zamiast sztywnych pozycji na sztywnych slotach, aplikujemy 4 zróżnicowane warianty kadrowania dla lepszej rotacji i asymetrii:

Wariant A – Bliski plan / Dominacja (Duży produkt, blisko widza):
paddingTop=0.08, paddingBottom=0.08, paddingLeft=0.08, paddingRight=0.45

Wariant B – Daleki plan / Przestrzeń (Mniejszy produkt, oddalony, dużo tła):
paddingTop=0.32, paddingBottom=0.20, paddingLeft=0.32, paddingRight=0.32

Wariant C – Asymetria Prawa (Produkt średniej wielkości po prawej):
paddingTop=0.18, paddingBottom=0.12, paddingLeft=0.48, paddingRight=0.08

Wariant D – Klasyczny Hero (Zbalansowany środek):
paddingTop=0.18, paddingBottom=0.18, paddingLeft=0.22, paddingRight=0.22

3. Zaktualizowana Matryca Promptów (SSOT 5.0 — Organiczne mikro-elementy)

Slot 2: Urban Modern (Prestiż i Energia Miasta)
"An empty, hyper-detailed modern city street scene at golden hour. The resting surface is a flat, dark textured concrete table featuring fine mineral dust particles scattered naturally. Visible faint dust motes drifting softly in a crisp diagonal sunbeam. Infinite depth of field, f/22 aperture, tack-sharp focus on every background brick and texture. Cinematic warm sunlight casting a sharp contact shadow. Empty scene, absolutely no blur, no soft focus, no bokeh, no people, no pedestals."

Slot 3: Raw Nature / Zen (Organiczna Surowość)
"An empty, majestic pine forest at sunrise. The resting surface is a flat, dark river stone surrounded by hyper-detailed green moss and tiny authentic dew droplets. Subtle atmospheric haze catching the morning rays. Infinite depth of field, f/22 aperture, tack-sharp focus on every leaf and stone texture. Crisp morning sunlight casting a realistic sharp shadow. Empty scene, absolutely no blur, no soft focus, no bokeh, no floating objects."

Slot 4: Fashion Editorial (Awangarda i Kontrast)
"An empty, sophisticated dark monochromatic studio setting. The resting surface is a flat, highly polished black glass reflecting subtle ambient reflections. Infinite depth of field, f/22 aperture, razor-sharp from front to back. A single dramatic spotlight creating sharp geometric shadows with fine light diffusion on the floor. Minimalist empty scene, absolutely no blur, no soft focus, no props."

Slot 5: Woda / Orzeźwienie (Witalność i Powietrze)
"An empty, luxury resort scene. The resting surface is pristine white sand with subtle micro-ripples from the wind. The background is a sparkling infinity pool and ocean horizon reflecting intense summer sun, with fine light refractions dancing on the ground. Infinite depth of field, f/22 aperture, every water ripple and grain of sand is razor-sharp. Brilliant high-key lighting. Empty scene, absolutely no blur, no bokeh, no out of focus areas, no people."

Slot 6: Minimalist Color Blocking (Nowoczesny Design)
"An empty, minimalist design studio. The resting surface is perfectly smooth with a matte finish. The background is a seamless, vibrant terracotta pastel wall separated by a crisp architectural lighting line and a subtle surface gradient. Infinite depth of field, f/22 aperture, sharp geometric shadow. Empty scene, absolutely no blur, no bokeh, no soft focus, no pedestals."

Slot 7: Cozy Interior / Dom (Ciepło i Zaufanie)
"An empty, luxurious modern minimalist living room bathed in radiant natural window light. The resting surface is a rustic brushed oak wood table showing authentic wood grain and micro-textures. Warm ambient light particles floating in the air stream. Infinite depth of field, f/22 aperture, every furniture texture and wood grain is razor-sharp and lifelike. Empty scene, absolutely no blur, no soft focus, no bokeh, no people."

Slot 8: Geometryczne Światło / Art (Wyrafinowanie)
"An empty, avant-garde artistic studio. The resting surface is flat, pristine white plaster with fine tactile grain. The background is a crisp white architectural wall. Dramatic 'gobo' lighting: sharp geometric shadows of window blinds cast across the wall with high-contrast edges. Infinite depth of field, f/22 aperture, maximum sharpness everywhere. Empty scene, absolutely no blur, no bokeh."

Slot 9: Składniki z PIM (Neuromarketing i Autentyczność)
"An empty, bright commercial photography studio. The resting surface is a clean slate countertop featuring subtle natural chipping and stone dust. Resting completely flat on the surface are: ${product_ingredients_english_from_PIM}, showing raw, hyper-detailed organic textures. Brilliant realistic lighting with soft ambient bounce. Infinite depth of field, f/22 aperture, hyper-detailed, everything in tack-sharp focus. Empty scene, absolutely no blur, no bokeh, no soft focus, no flying objects, no hands."