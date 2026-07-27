OSTATECZNY PLAYBOOK AGENTA AI — SSOT 4.0
Cel: 100% autentyczności produktu (Etykieta), Hiper-ostrość tła (Neuromarketing f/22), Brak halucynacji.
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

2. Macierz Kadrowania (Padding)
Sterowanie pozycją produktu odbywa się czysto matematycznie (w ułamkach wielkości kadru), co całkowicie niweluje wtórność.

Slot 3, 5, 7, 9 (Hero Image - Centrum): paddingTop=0.20, paddingBottom=0.20, paddingLeft=0.20, paddingRight=0.20

Slot 2, 8 (Miejsce na tekst po prawej): paddingTop=0.20, paddingBottom=0.10, paddingLeft=0.05, paddingRight=0.45

Slot 6 (Miejsce na tekst po lewej): paddingTop=0.20, paddingBottom=0.10, paddingLeft=0.45, paddingRight=0.05

Slot 4 (Makro - Potężne zbliżenie na detale): paddingTop=0.05, paddingBottom=0.05, paddingLeft=0.05, paddingRight=0.05

3. Matryca Promptów (Deep Focus, f/22, Zero Mydła)
Ponieważ API wygeneruje wyłącznie tło (produkt zostanie nałożony na końcu), w prompcie opisujemy tylko pustą scenografię, bezwzględnie wymuszając ostrość i wplatając zakazy (ponieważ negativePrompt nie działa).

Slot 2: Urban Modern (Prestiż)

"An empty, hyper-detailed modern city street scene at golden hour. The resting surface is a flat, dark textured concrete table. Infinite depth of field, f/22 aperture, tack-sharp focus on every background detail. Cinematic warm sunlight casting a crisp contact shadow. Empty scene, absolutely no blur, no soft focus, no bokeh, no people, no pedestals."

Slot 3: Raw Nature / Zen (Organiczna Siła)

"An empty, majestic pine forest at sunrise. The resting surface is a flat, dark river stone surrounded by hyper-detailed green moss. Infinite depth of field, f/22 aperture, tack-sharp focus on every leaf and stone texture. Crisp morning sunlight. Empty scene, absolutely no blur, no soft focus, no bokeh, no floating objects."

Slot 4: Fashion Editorial (Awangarda)

"An empty, sophisticated dark monochromatic studio setting. The resting surface is a flat, highly polished black glass. Infinite depth of field, f/22 aperture, razor-sharp from front to back. A single dramatic spotlight creating sharp geometric shadows. Minimalist empty scene, absolutely no blur, no soft focus, no props."

Slot 5: Woda / Orzeźwienie (Witalność)

"An empty, luxury resort scene. The resting surface is pristine white sand. The background is a sparkling infinity pool and ocean horizon reflecting intense summer sun. Infinite depth of field, f/22 aperture, every water ripple and grain of sand is razor-sharp. Brilliant high-key lighting. Empty scene, absolutely no blur, no bokeh, no out of focus areas, no people."

Slot 6: Minimalist Color Blocking (Nowoczesny Design)

"An empty, minimalist design studio. The resting surface is perfectly smooth. The background is a seamless, vibrant terracotta pastel wall separated by a crisp architectural lighting line. Infinite depth of field, f/22 aperture, sharp geometric shadow. Empty scene, absolutely no blur, no bokeh, no soft focus, no pedestals."

Slot 7: Cozy Interior / Dom (Zaufanie i Komfort)

"An empty, luxurious modern minimalist living room bathed in radiant natural window light. The resting surface is a rustic brushed oak wood table. A neutral palette of off-white and sand. Infinite depth of field, f/22 aperture, every furniture texture and wood grain is razor-sharp and lifelike. Empty scene, absolutely no blur, no soft focus, no bokeh, no people."

Slot 8: Geometryczne Światło / Art (Wyrafinowanie)

"An empty, avant-garde artistic studio. The resting surface is flat, pristine white plaster. The background is a crisp white architectural wall. Dramatic 'gobo' lighting: sharp geometric shadows of window blinds cast across the wall. Infinite depth of field, f/22 aperture, maximum sharpness everywhere. Empty scene, absolutely no blur, no bokeh."

Slot 9: Składniki z PIM (Neuromarketing)

"An empty, bright commercial photography studio. The resting surface is a clean slate countertop. Resting completely flat on the surface are: ${product_ingredients_english_from_PIM}. Brilliant realistic lighting. Infinite depth of field, f/22 aperture, hyper-detailed, everything in tack-sharp focus. Empty scene, absolutely no blur, no bokeh, no soft focus, no flying objects, no hands."

Wdrożenie tej konfiguracji – opartej twardo na mechanice API – wyeliminuje zniekształcenia etykiety, rozwiąże problem z artefaktami z drugiego zdjęcia, a poprzez expandPrompt="never" dostarczy kryształowo czyste, fotorealistyczne tła bez śladu taniego rozmycia. Przekaż to dokumentowi IT.