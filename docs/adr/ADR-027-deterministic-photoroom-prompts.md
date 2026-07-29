# ADR 027: Deterministyczna Losowość Promptów (SSOT 5.0)

## Status
Zastąpiony przez **ADR 033** (Węzeł 8 jako Ingredient Mapper i Architektura SSOT 6.0). Pierwotnie wdrożony dla SSOT 5.0.

## Kontekst
Przy masowym generowaniu zdjęć (np. 2000 SKU), sztywne prompty przypisane do slotów tworzyły "monokulturę" wizualną – każdy produkt w Slocie 2 miał identyczne tło i identyczny kadr. Dodatkowo brakowało mikro-detali organicznych (kurz, światło, krople wody), przez co tła wydawały się sterylne.

## Decyzja
Wdrożyliśmy mechanizm **deterministycznej losowości**:
1. Wykorzystujemy `EAN` lub `SKU` do wyliczenia unikalnego identyfikatora matematycznego (`hash`).
2. Hash pełni rolę `seed` w operacjach modulo, co pozwala na powtarzalne, lecz zróżnicowane pomiędzy produktami losowanie komponentów dla promptów ("Klocki LEGO").
3. Każdy slot (od 2 do 9) posiada własne mini-słowniki dla `surfaces`, `microDetails`, `lightingAndAtmosphere`.
4. Zgodnie z wytycznymi, dawny Slot 8 ("Geometryczne Światło") został zaimplementowany jako Slot 2. Z kolei dawny Slot 2 ("Urban Modern") został przeniesiony do Slotu 8.
5. Rotujemy 4 wariantami matematycznymi kadrowania (Padding).
6. Mechanizm opiera się na kodzie `Node.js` z zerowym kosztem tokenów (brak LLM w pętli dla Slotów 2-8).

## Konsekwencje
Dzięki temu rozwiązaniu zachowujemy 100% fotorealistyczny rygor SSOT 5.0 (f/22, zero rozmycia), a jednocześnie uzyskujemy nieskończoną różnorodność galerii e-commerce. Generowanie tej samej oferty po roku da identyczne obrazy (dzięki hash), ale sąsiadujące oferty będą miały unikalne oświetlenie i kadry.
