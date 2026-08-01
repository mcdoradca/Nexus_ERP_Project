# RAPORT 35-DOK3

Potwierdzam trafność Twojej diagnozy. Reguła sklejająca połyka nietrafione pozycje, jeśli potrafi je scalić z ciągami zawierającymi nawiasy. Wynika to stąd, że usunięcie nawiasów pozostawia pierwszy człon ciągu (np. Aqua, Parfum), co słownik akceptuje jako trafienie w glosariusz.

Poniżej dowody z symulacji uruchomionej bez naruszania aktualnego kodu źródłowego.

## KROK 1: Tabela dla Equilibry (30 wierszy)

Każda pozycja ze składu Equilibry przeszła przez asercję sklejania. Widać wyraźnie, jak `Glyceryl Stereate` łączy się z `Aqua (Water)` po czym RAG zwraca odpowiedź `TAK`.

```text
POZYCJA: Aqua (Water)
WARIANTY: aqua water | aqua | water | aqua waters | aquas | waters
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Glyceryl Stereate
WARIANTY: glyceryl stereate | glyceryl stereates
SKLEJONA: TAK z poprzednim: Aqua (Water) -> Aqua (Water),Glyceryl Stereate
TRAFIENIE: TAK
---
POZYCJA: Cetyl Alcohol
WARIANTY: cetyl alcohol | cetyl alcohols
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Ethylhexyl Stereate
WARIANTY: ethylhexyl stereate | ethylhexyl stereates
SKLEJONA: NIE
TRAFIENIE: NIE
---
POZYCJA: Coco-Caprylate/Caprate
WARIANTY: coco caprylate/caprate | coco caprylate/caprates
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Prunus Amygdalus Dulcis (Sweet Almond) Oil
WARIANTY: prunus amygdalus dulcis sweet almond oil | prunus amygdalus dulcis | sweet almond | prunus amygdalus dulcis oil | prunus amygdalus dulcis sweet almond oils | prunus amygdalus dulci | sweet almonds | prunus amygdalus dulcis oils
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Glycerin
WARIANTY: glycerin | glycerins
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Hydrolyzed Eruca Sativa Leaf
WARIANTY: hydrolyzed eruca sativa leaf | hydrolyzed eruca sativa leafs
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Cetearyl Alcohol
WARIANTY: cetearyl alcohol | cetearyl alcohols
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: C10-18 Triglyceride
WARIANTY: c10 18 triglyceride | c10 18 triglycerides
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Aloe Barbadensis Leaf Juice
WARIANTY: aloe barbadensis leaf juice | aloe barbadensis leaf juices
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Vaccinium Myrtillus Fruit Extract
WARIANTY: vaccinium myrtillus fruit extract | vaccinium myrtillus fruit extracts
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Ribes Nigrum Fruit Extract
WARIANTY: ribes nigrum fruit extract | ribes nigrum fruit extracts
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Charcoal Powder
WARIANTY: charcoal powder | charcoal powders
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Sodium Hyaluronate
WARIANTY: sodium hyaluronate | sodium hyaluronates
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Xanthan Gum
WARIANTY: xanthan gum | xanthan gums
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Helianthus Annuus (Sunflower) Seed Oil
WARIANTY: helianthus annuus sunflower seed oil | helianthus annuus | sunflower | helianthus annuus seed oil | helianthus annuus sunflower seed oils | helianthus annuu | sunflowers | helianthus annuus seed oils
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Tocopherol
WARIANTY: tocopherol | tocopherols
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Phenoxyethanol
WARIANTY: phenoxyethanol | phenoxyethanols
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Stearic Acid
WARIANTY: stearic acid | stearic acids
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Parfum (Fragrance)
WARIANTY: parfum fragrance | parfum | fragrance | parfum fragrances | parfums | fragrances
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Ethylexyglycerin
WARIANTY: ethylexyglycerin | ethylexyglycerins
SKLEJONA: TAK z poprzednim: Parfum (Fragrance) -> Parfum (Fragrance),Ethylexyglycerin
TRAFIENIE: TAK
---
POZYCJA: Dicaprylyl Ether
WARIANTY: dicaprylyl ether | dicaprylyl ethers
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Sodium Lauroyl Glutamate
WARIANTY: sodium lauroyl glutamate | sodium lauroyl glutamates
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Sodium Benzoate
WARIANTY: sodium benzoate | sodium benzoates
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Beta-Sitosterol
WARIANTY: beta sitosterol | beta sitosterols
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Potassium Sorbate
WARIANTY: potassium sorbate | potassium sorbates
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Squalene
WARIANTY: squalene | squalenes
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Citric Acid
WARIANTY: citric acid | citric acids
SKLEJONA: NIE
TRAFIENIE: TAK
---
POZYCJA: Sodium Dehydroacetate.
WARIANTY: sodium dehydroacetate | sodium dehydroacetates
SKLEJONA: NIE
TRAFIENIE: TAK
---
```

## KROK 2: Kontrola reguły sklejania

W całym zbiorze wystąpiły następujące pary, w tym 2 absolutnie błędne (wynikające z literówek pochłanianych przez wariant obcinający po pierwszym nawiasie).

```text
"Aqua (Water)" + "Glyceryl Stereate" -> "Aqua (Water),Glyceryl Stereate" -> TAK (Błąd algorytmu!)
"Parfum (Fragrance)" + "Ethylexyglycerin" -> "Parfum (Fragrance),Ethylexyglycerin" -> TAK (Błąd algorytmu!)
"1" + "2-Hexanediol" -> "1,2-Hexanediol" -> TAK
"1" + "2-Hexanediol" -> "1,2-Hexanediol" -> TAK
"1" + "2 Hexanediol" -> "1,2 Hexanediol" -> TAK
```

*Adnotacja*: Funkcja zgłasza błędy jako "TAK", co dowodzi błędu w samej logice sklejania - połyka ona nietrafione pozycje. W żadnym przypadku z całego zbioru nie ma sytuacji, gdzie program zatwierdziłby sklejenie a funkcja dopasowania (checkHit) odpowiedziałaby kłamliwie "NIE" (to jest technicznie niemożliwe z racji konstrukcji `checkHit`).

## KROK 3: Uzgodnienie liczb

Oto wygenerowana ostateczna unikalna lista odrzuceń na bazie skryptu, wynosząca **22 pozycje** (zawierająca luki opisane wyżej).

Wyjaśnienie: Zgłoszone z braków `Glyceryl Stereate` oraz `Ethylexyglycerin` zniknęły na rzecz trafienia w słowniku INCI dla terminów `AQUA` oraz `PARFUM`. Stało się tak dlatego, że po usunięciu z nowej formy sklejki tekstu zawartego w nawiasie (na mocy 4 wariantu czyszczącego), ciąg ucięty w całości (wraz ze sklejonym błędem) pozostawił w pamięci do sprawdzenia tylko samo bazowe słowo przed nawiasem.

**Licza unikalnych odrzuceń: 22**
- Cal dum Lactate
- Calcium Lacta te
- Calcum Lactate
- Cera mide NP
- CI 420 90
- Cu rauma Longa (Turmeric) Root Extract
- Dipotassium Gly cynthizate
- Ethyl Ascorbyl Ether
- Ethylhexyl Stereate
- Frag rance
- Fragrance
- Hexy lene Glycol
- Hexylene Glycol Potassium Chloride
- Hydroxyacetophe none
- licum Verum (Anise) Fruit Extract
- Nelumbo Nu cifera Callus Culture Extract
- Norbom anediamine/Resorcinol Diglycidyl Ether Crosspolymer
- Palmitoyl Tripep tide-5
- PEG-60 Hy drogenated Castor Oil
- Phase olus Radiatus Seed Extract
- Tocopheryl A cetate
- Tocopheryl Ace tate

---

## 4. Wynik weryfikacji regresji (Test Runner)

```text
ℹ tests 108
ℹ suites 0
ℹ pass 108
ℹ fail 0
ℹ duration_ms 7498.9384
```

## 5. Podsumowanie całego potoku v2 (`git diff --stat`)

```text
 src/modules/offer-optimizer-v2/ai.wrapper.js       |   5 +-
 .../baselinker.extract.config.json                 |   3 +-
 .../offer-optimizer-v2/baselinker.extract.js       |  14 +-
 .../offer-optimizer-v2/config/nodes.config.js      |  11 +-
 .../offer-optimizer-v2/docs/Agent_1_prompt_v4.md   |  28 +-
 .../offer-optimizer-v2/docs/Agent_2_prompt_v4.md   |   2 +-
 .../offer-optimizer-v2/docs/Agent_4_prompt_v4.md   |   2 +-
 .../offer-optimizer-v2/docs/PATCH_v4.1_prompty.md  |   9 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 734 ++++++++++++++++-----
 .../offer-optimizer-v2/prompts/Agent_1_compiled.md |  37 +-
 .../offer-optimizer-v2/prompts/Agent_2_compiled.md |   2 +-
 .../offer-optimizer-v2/prompts/Agent_4_compiled.md |   2 +-
 .../tests/baselinker.extract.test.js               |  14 +
 src/modules/offer-optimizer-v2/tests/gate.test.js  |  25 +
 .../offer-optimizer-v2/tests/orchestrator.test.js  |  43 +-
 src/modules/offer-optimizer-v2/validators/index.js |  45 +-
 16 files changed, 717 insertions(+), 259 deletions(-)
```
