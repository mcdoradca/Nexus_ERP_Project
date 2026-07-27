PLAYBOOK AGENTA AI — SSOT 3.0 (Hiperrealizm i Sprzedaż)
Wersja: Lipiec 2026
Fundament: Prawny rygor EU AI Act + Neuromarketing wizualny
Silnik API: Photoroom v2 (editWithAI.mode = ai.auto)
Złota zasada estetyki: Nieskończona głębia ostrości (Deep Focus), hiper-detale. Zero mydła.

1. Architektura API (Złoty Payload)
Oddajemy dowodzenie inteligentnemu silnikowi editWithAI, który doskonale czyta zakazy wprost z tekstu, a produkt rotujemy za pomocą zmiennych Marginesów (Padding), by zabić wtórność.

JSON
{
  "imageFile": "[PLIK_RAW_Z_PIM]",
  "removeBackground": "true", 
  "editWithAI.mode": "ai.auto",
  "editWithAI.prompt": "[PROMPT_ZE_SLOTU]",
  "quality": "advanced",
  "paddingTop": "[ZMIENNA_KADRU]",
  "paddingBottom": "[ZMIENNA_KADRU]",
  "paddingLeft": "[ZMIENNA_KADRU]",
  "paddingRight": "[ZMIENNA_KADRU]"
}
2. OSTATECZNA MACIERZ PROMPTÓW (Sloty 2-9)
Wprowadzamy komendy: infinite depth of field, f/22, hyper-detailed, tack-sharp. W "Żelaznej Tarczy" na końcu każdego promptu dodajemy absolutny i bezwzględny zakaz rozmywania. Dodaliśmy też opisy emocji – ukryty LLM w Photoroom odczyta je i dopasuje kolorystykę, by wywołać ten stan u widza.

Slot 2: Urban Modern (Sugerowany kadr: Asymetria Lewa) – Emocja: Prestiż, Luksus, Energia Sukcesu

"Make it a high-end luxury lifestyle commercial photoshoot with infinite depth of field. The object rests firmly on a highly textured, razor-sharp dark concrete table. In the background, a crystal-clear, hyper-detailed modern city street at golden hour, capturing an energetic and luxurious urban vibe. Brilliant, cinematic directional sunlight casting a crisp contact shadow. Every background detail is in absolute sharp focus (f/22). CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO out of focus areas, NO people, NO texts, NO artificial pedestals."

Slot 3: Raw Nature / Zen (Sugerowany kadr: Hero Image) – Emocja: Czystość, Organiczna Siła, Ukojenie

"Make it a breathtaking nature lifestyle commercial photoshoot with infinite depth of field. The object rests firmly on a large, flat, dark river stone surrounded by hyper-detailed, vibrant green moss. The background is a crystal-clear, majestic pine forest at sunrise, evoking a deep sense of purity and organic power. Crisp morning sunlight casting a realistic sharp shadow. Every leaf, stone, and background element must be tack-sharp (f/22). CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO soft focus, NO bokeh, NO floating objects, NO podiums, NO hands."

Slot 4: Fashion Editorial (Sugerowany kadr: Makro) – Emocja: Awangarda, Ekskluzywność, Premium

"Make it a premium fashion editorial commercial photoshoot, tack-sharp from front to back. Place the object on a highly polished black glass surface reflecting pure luxury. The background is a crisp, sophisticated dark monochromatic studio setting with hyper-detailed textures. A single dramatic spotlight illuminates the product and surface, creating striking, high-contrast geometry and a sharp, elegant shadow. Exuding bold minimalism and exclusivity. CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO soft focus, NO bokeh, NO props, NO people, NO texts."

Slot 5: Woda / Orzeźwienie (Sugerowany kadr: Hero Image) – Emocja: Rajskie Wakacje, Witalność, Pragnienie

"Make it a hyper-realistic luxury resort commercial photoshoot with infinite depth of field. Place the object on clean, sun-warmed pristine white sand. The background is a crystal-clear, sparkling infinity pool and a breathtaking ocean horizon reflecting the intense summer sun. Evokes absolute refreshment, vitality, and premium vacation vibes. Brilliant high-key lighting, razor-sharp details in every water ripple and grain of sand (f/22). CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO out of focus areas, NO people, NO towels, NO bathrooms."

Slot 6: Minimalist Color Blocking (Sugerowany kadr: Asymetria Prawa) – Emocja: Nowoczesny Design, Trend, Estetyka

"Make it a cutting-edge minimalist design commercial photoshoot, completely in sharp focus edge-to-edge. Place the object on a perfectly smooth, hyper-detailed surface. The entire background and floor should be a seamless, vibrant terracotta pastel color block, separated by a crisp architectural lighting line. Aesthetically pleasing, bold, and modern. Razor-sharp textures, striking directional light casting a defined geometric shadow. CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO soft focus, NO pedestals, zero clutter, NO hands."

Slot 7: Cozy Interior / Dom (Sugerowany kadr: Hero Image) – Emocja: Zaufanie, Komfort, Aspiracje Lifestyle'owe

"Make it an inviting, premium interior commercial photoshoot with infinite depth of field. The object is placed on a hyper-detailed, rustic brushed oak wood table. The background is a crystal-clear, luxurious modern minimalist living room bathed in radiant natural window light. A neutral palette of off-white and sand evoking ultimate comfort, trust, and premium lifestyle. Every furniture texture and wood grain in the background must be razor-sharp and lifelike (f/22). CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO soft focus, NO bathrooms, NO mirrors, NO people."

Slot 8: Geometryczne Światło / Art (Sugerowany kadr: Asymetria Lewa) – Emocja: Wyrafinowanie, Innowacja, Sztuka

"Make it an avant-garde artistic commercial photoshoot, shot with f/22 aperture for maximum sharpness everywhere. Place the object on a pristine, hyper-detailed white plaster surface. The background is a crisp white architectural wall. Use striking 'gobo' lighting: dramatic, razor-sharp geometric shadows (like sharp window blinds or tropical leaves) cast perfectly across the background and surface. Evokes absolute sophistication and high intelligence. CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO soft focus, NO floating elements, NO text, NO people."

Slot 9: Wstrzyknięcie Kontekstowe z PIM – Emocja: Bogactwo, Surowa Prawda, Gwarancja Jakości

"Make it a premium commercial e-commerce photoshoot with infinite depth of field. Place the object on a hyper-detailed, clean slate countertop. Integrate natural elements crisply into the scene, specifically: ${product_ingredients_english_from_PIM}. These elements must rest naturally on the surface with razor-sharp textures, showcasing their raw authenticity and premium quality. Crystal-clear bright studio background, brilliant realistic lighting. Everything is tack-sharp (f/22). CRITICAL RULES: The original product must remain 100% unchanged. NO blur, NO bokeh, NO soft focus, NO human hands, NO text."

3. Zabezpieczenia (EU AI Act & Omnibus)
Znakowanie prawne: Twój skrypt musi narzucić znak wodny ("AI Modified Background" / "Tło AI"), ponieważ hiperrealistyczne zdjęcia, które osiągniesz tymi promptami, będą na tyle autentyczne, że wpadną w rygor unijnego zakazu wprowadzania w błąd formą fotorealistyczną.

PIM Log Audit: Jak ustaliliśmy, zapisuj wywołany prompt, seed i RAW w bazie dla każdego zdjęcia na wypadek weryfikacji manualnej marketplace'u (udowodnienie, że AI na sztywno miało zakazane ruszać bryłę przedmiotu).

Logika Greenwashingu: Blokuj w PIM sloty Wodne i Leśne (3, 5, 9) dla agresywnej chemii bez atestów.

Ten Playbook zamienia sztuczną inteligencję z "magika od obrazków" w precyzyjne narzędzie komercyjne, zmuszając ją do renderowania twardych faktur, które bezpośrednio konwertują uwagę w sprzedaż.