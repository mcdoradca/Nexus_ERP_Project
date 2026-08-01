# Raport 40: Naprawa regresji testów (dane prawne)

## 1. `extracted_data` z przebiegu 40 — w całości
```json
{
  "inci": {
    "value": "Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.",
    "source": "baselinker",
    "matched_key": "skladniki inci"
  },
  "mpn": {
    "value": null,
    "source": null,
    "matched_key": null
  },
  "brand": {
    "value": null,
    "source": null,
    "matched_key": null
  },
  "capacity": {
    "value": "75 ml",
    "source": "baselinker",
    "matched_key": "pojemnosc"
  },
  "usage": {
    "value": "Nakładaj na idealnie oczyszczoną skórę twarzy rano i/lub wieczorem, masując aż do całkowitego wchłonięcia.",
    "source": "baselinker",
    "matched_key": "sposob uzycia"
  },
  "warnings": {
    "value": "Tylko do użytku zewnętrznego. Unikać kontaktu z oczami.",
    "source": "baselinker",
    "matched_key": "uwagi dotyczace bezpieczenstwa"
  },
  "line": {
    "value": null,
    "source": null,
    "matched_key": null
  },
  "truncated": true,
  "recovered_keys": [
    "Funkcja",
    "Rodzaj produktu",
    "ean",
    "pojemnosc",
    "zastosowanie",
    "sposob uzycia",
    "skladniki inci",
    "uwagi dotyczace bezpieczenstwa",
    "rich kontent"
  ],
  "eu_responsible_person": {
    "source": "description",
    "data": {
      "name": "Equilibra srl",
      "address_eu": "Via Plava, 74 Torino – 10135 Italy",
      "contact": "cosmetica@equilibra.it",
      "raw_fragment": "<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href=\"mailto:cosmetica@equilibra.it\">cosmetica@equilibra.it</a></p>"
    }
  },
  "product_name": {
    "value": "Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml",
    "source": "baselinker",
    "matched_key": null
  }
}
```

## 2. Czy Equilibra srl i 75 ml były na wejściu A6?
**TAK**. Zostały one wyekstrahowane z bazy wiedzy (RAG + text z BaseLinker) i poprawnie wczytane z `extracted_data`, jako dane wejściowe przekazywane węzłom modelu językowego.

## 3. Sekcje faktograficzne — plik, linia, pełny kod funkcji
Plik: `src/modules/offer-optimizer-v2/orchestrator.js`
Linie: 767 - 787
```javascript
                // Budowanie sekcji 5 i 6 z extracted_data (Zadanie 40)
                let sec5 = '<h2>📊 Parametry produktu</h2><ul>';
                if (this.state.extracted_data.brand && this.state.extracted_data.brand.value) sec5 += `<li>🏷️ <b>Marka:</b> ${this.state.extracted_data.brand.value}</li>`;
                if (this.state.extracted_data.product_name && this.state.extracted_data.product_name.value) sec5 += `<li>🏷️ <b>Nazwa:</b> ${this.state.extracted_data.product_name.value}</li>`;
                if (this.state.extracted_data.capacity && this.state.extracted_data.capacity.value) sec5 += `<li>🏷️ <b>Pojemność:</b> ${this.state.extracted_data.capacity.value}</li>`;
                if (this.state.a1_result && this.state.a1_result.country_of_origin && this.state.a1_result.country_of_origin.value) sec5 += `<li>🏷️ <b>Kraj pochodzenia:</b> ${this.state.a1_result.country_of_origin.value}</li>`;
                sec5 += '</ul>';
                if (this.state.extracted_data.inci && this.state.extracted_data.inci.value) {
                    sec5 += `<h2>🧪 Skład (INCI)</h2><p>${this.state.extracted_data.inci.value}</p>`;
                }
                result.section_5_html = sec5;

                if (this.state.extracted_data.eu_responsible_person && this.state.extracted_data.eu_responsible_person.data && this.state.extracted_data.eu_responsible_person.data.name) {
                    let sec6 = '<h2>⚠️ Bezpieczeństwo i dane prawne</h2><ul>';
                    const rep = this.state.extracted_data.eu_responsible_person.data;
                    if (rep.name) sec6 += `<li>🛡️ <b>Podmiot odpowiedzialny w UE:</b> ${rep.name}</li>`;
                    if (rep.address_eu) sec6 += `<li>🛡️ <b>Adres:</b> ${rep.address_eu}</li>`;
                    if (rep.contact) sec6 += `<li>🛡️ <b>Kontakt:</b> ${rep.contact}</li>`;
                    sec6 += '</ul>';
                    result.section_6_html = sec6;
                }
```

## 4. Schemat A6 po zmianie — pełny wydruk
Z usuniętymi polami `section_5_html` oraz `section_6_html`.
Plik: `src/modules/offer-optimizer-v2/orchestrator.js`
Linie: 742 - 751
```javascript
            const a6Schema = {
                type: "object",
                properties: {
                    section_1_html: { type: "string" },
                    section_2_html: { type: "string" },
                    section_3_html: { type: "string" },
                    section_4_html: { type: "string" }
                },
                required: ["section_1_html", "section_2_html", "section_3_html", "section_4_html"]
            };
```

## 5. `validate_grounded_facts` — plik, linia, pełne ciało
Plik: `src/modules/offer-optimizer-v2/validators/index.js`
Linie: 303 - 370
```javascript
function validate_grounded_facts(state, html) {
    if (!html || !state || !state.extracted_data) return { valid: true };

    const ex = state.extracted_data;
    
    // 1. Liczby z jednostką
    const numRegex = /\b(\d+(?:[.,]\d+)?)\s?(ml|l|g|kg)\b/gi;
    let match;
    while ((match = numRegex.exec(html)) !== null) {
        const fullMatch = match[0].toLowerCase().replace(/\s+/g, '');
        const rawNum = parseFloat(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        
        let foundInState = false;
        
        const checkField = (field) => {
            if (field && field.value) {
                const val = field.value.toLowerCase().replace(/\s+/g, '');
                if (val.includes(fullMatch)) return true;
                
                const fieldNumRegex = /\b(\d+(?:[.,]\d+)?)\s?(ml|l|g|kg)\b/gi;
                let fm;
                while ((fm = fieldNumRegex.exec(field.value)) !== null) {
                    const fNum = parseFloat(fm[1].replace(',', '.'));
                    const fUnit = fm[2].toLowerCase();
                    if (fNum === rawNum && fUnit === unit) return true;
                }
            }
            return false;
        };

        if (checkField(ex.capacity)) foundInState = true;
        if (checkField(ex.product_name)) foundInState = true;
        
        if (!foundInState) {
            return { valid: false, error: `UNGROUNDED_QUANTITY: ${match[0]}` };
        }
    }
    
    // 2. Podmiot odpowiedzialny
    const textHtml = html.replace(/<\/li>|<\/p>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
    const repMatch = textHtml.match(/Podmiot odpowiedzialny[a-zA-Z\s]*:\s*([^\n]+)/i);
    if (repMatch) {
        const extractedRep = repMatch[1].trim();
        const canonHtmlRep = extractedRep.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const stateRep = (ex.eu_responsible_person && ex.eu_responsible_person.data && ex.eu_responsible_person.data.name) ? ex.eu_responsible_person.data.name : '';
        const canonStateRep = stateRep.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (canonHtmlRep !== canonStateRep) {
            return { valid: false, error: `FABRICATED_RESPONSIBLE_PERSON: ${extractedRep}` };
        }
    }
    
    // 3. Marka
    const brandIsNull = !ex.brand || ex.brand.value === null || String(ex.brand.value).trim() === '';
    if (brandIsNull) {
        const brandMatch = textHtml.match(/Marka:\s*([^\n]+)/i);
        if (brandMatch) {
            const extractedBrand = brandMatch[1].trim();
            if (extractedBrand.length > 0 && extractedBrand.toLowerCase() !== 'brak' && extractedBrand.toLowerCase() !== 'brak danych') {
                return { valid: false, error: `UNGROUNDED_BRAND: ${extractedBrand}` };
            }
        }
    }
    
    return { valid: true };
}
```

## 6. Testy nowej logiki (6 asercji)
Zdefiniowane w `src/modules/offer-optimizer-v2/tests/validators.test.js`:
- L196: `assert.deepStrictEqual(res.valid, false);`
- L197: `assert.ok(res.error.includes('UNGROUNDED_QUANTITY'));`
- L208: `assert.deepStrictEqual(res.valid, false);`
- L209: `assert.ok(res.error.includes('FABRICATED_RESPONSIBLE_PERSON'));`
- L220: `assert.deepStrictEqual(res.valid, false);`
- L221: `assert.ok(res.error.includes('UNGROUNDED_BRAND'));`

## 7. Equilibra — PEŁNA treść `description_html`
```html
<!-- Applied: Sensory Priming, Routine Anchors, Beauty Rx --><h1>🌟 Oczyszczający krem-żel do twarzy z aktywnym węglem</h1><p>Odkryj zaawansowaną formułę, która łączy <strong>głębokie oczyszczanie</strong> z ochroną naturalnej bariery hydrolipidowej skóry. Ten wyjątkowy krem-żel delikatnie usuwa codzienne zanieczyszczenia, nadmiar sebum oraz pozostałości makijażu, pozostawiając Twoją skórę <strong>matową</strong>, a zarazem miękką i nawilżoną. Czujesz pod palcami, jak <strong>bogata, jedwabista konsystencja</strong> po spienieniu z wodą łagodnie szarzeje, otulając twarz i zapewniając sensoryczną czystość bez nieprzyjemnego uczucia ściągnięcia.</p>
<!-- Applied: Pratfall Effect, Beauty Rx --><h2>❓ Pytania i odpowiedzi</h2><ul><li>🔴 <strong>Problem:</strong> Trudności z domywaniem makijażu i szorstkość skóry po myciu?</li><li>🟢 <strong>Answer:</strong> Formuła z <strong>aktywnym węglem</strong> oraz <strong>naturalnymi olejami</strong> skutecznie rozpuszcza zanieczyszczenia już przy pierwszym kontakcie, dbając o jedwabistą miękkość naskórka i wspierając jego barierę ochronną.</li><li>🔴 <strong>Problem:</strong> Obawa przed zabrudzeniem armatury łazienkowej ciemnym kosmetykiem?</li><li>🟢 <strong>Answer:</strong> Nasz krem-żel po spienieniu szarzeje i <strong>bardzo łatwo spłukuje się z powierzchni</strong>, nie pozostawiając osadów na umywalce ani kafelkach.</li><li>🔴 <strong>Problem:</strong> Uczucie ściągnięcia i przesuszenia po oczyszczaniu?</li><li>🟢 <strong>Answer:</strong> Dzięki obecności <strong>kwasu hialuronowego</strong> i <strong>gliceryny</strong> produkt aktywnie dba o nawodnienie już w trakcie mycia, eliminując dyskomfort napiętej skóry.</li><li>🔴 <strong>Problem:</strong> Specyficzny, lekko apteczny zapach kosmetyku?</li><li>🟢 <strong>Answer:</strong> Brak sztucznych kompozycji zapachowych może skutkować surową nutą węgla, co stanowi bezpośredni dowód na <strong>prosty skład</strong> i minimalizuje ryzyko podrażnień wrażliwej cery.</li></ul>
<h2>⚙️ Zaawansowane działanie składników aktywnych</h2><ul><li>🌱 <strong>Charcoal Powder:</strong> Wykazuje silne właściwości absorpcyjne, skutecznie przyciągając zanieczyszczenia oraz nadmiar sebum z powierzchni skóry, działając jak <strong>naturalny magnes oczyszczający</strong>.</li><li>💧 <strong>Sodium Hyaluronate i Glycerin:</strong> Silne humektanty, które <strong>wiążą wodę w naskórku</strong>, zapewniając długotrwałe nawilżenie i zapobiegając przesuszeniu skóry po myciu.</li><li>🌿 <strong>Prunus Amygdalus Dulcis Oil i Helianthus Annuus Seed Oil:</strong> Naturalne emoliety bogate w kwasy tłuszczowe, które <strong>odbudowują płaszcz lipidowy</strong> i pozostawiają wyczuwalną miękkość.</li><li>🛡️ <strong>Hydrolyzed Eruca Sativa Leaf i Tocopherol:</strong> Dostarczają skutecznej ochrony antyoksydacyjnej, neutralizując wolne rodniki i wspierając <strong>naturalne mechanizmy obronne skóry</strong>.</li><li>⚡ <strong>Coco-Caprylate/Caprate i C10-18 Triglycerides:</strong> Lekkie emolienty, które poprawiają sensorykę aplikacji, zapewniając <strong>gładkość bez obciążania skóry</strong>.</li><li>💆‍♀️ <strong>Aloe Barbadensis Leaf Juice:</strong> Kondycjonuje i <strong>koi skórę</strong>, wspierając jej zdrowy wygląd i redukując dyskomfort.</li><li>🔬 <strong>Xanthan Gum i Cetearyl Alcohol:</strong> Odpowiadają za stabilizację emulsji oraz kontrolę lepkości, gwarantując <strong>idealną, kremowo-żelową konsystencję</strong> produktu.</li><li>⚡ <strong>Synergia węgla i humektantów:</strong> Połączenie węgla aktywnego z humektantami zapewnia <strong>głębokie oczyszczenie bez efektu ściągnięcia</strong> skóry.</li><li>⚡ <strong>Odbudowa barierowa:</strong> Połączenie naturalnych lipidów z oleju ze słodkich migdałów i oleju słonecznikowego <strong>rekonstruuje barierę naskórkową</strong> już na etapie mycia.</li></ul>
<!-- Applied: Pratfall Effect, Sensory Priming, Routine Anchors --><h2>📝 Sposób użycia i codzienna rutyna</h2><p>Wprowadź produkt jako stały element swojej pielęgnacji, aby aktywnie dbać o czystość i barierę skóry każdego dnia.</p><ol><li>💧 <strong>Krok 1 — Przygotowanie:</strong> Zwilż skórę twarzy letnią wodą, aby przygotować ją na przyjęcie składników aktywnych.</li><li>💧 <strong>Krok 2 — Dozowanie:</strong> Wyciśnij niewielką ilość produktu. Z uwagi na <strong>gęstą, niezwykle zwartą konsystencję</strong>, wyciśnięcie wymaga minimalnie większego nacisku, co zapobiega przypadkowemu rozlaniu i pozwala precyzyjnie odmierzyć dozę. Jedno opakowanie wystarcza na ok. 60 dni systematycznego oczyszczania.</li><li>💧 <strong>Krok 3 — Aplikacja:</strong> Rozprowadź kosmetyk na twarzy, wykonując delikatny masaż. Poczuj, jak gładka, czarna formuła <strong>delikatnie szarzeje i pieni się</strong> pod palcami, absorbując zanieczyszczenia z porów.</li><li>💧 <strong>Krok 4 — Spłukiwanie:</strong> Zmyj produkt dokładnie letnią wodą. Kosmetyk <strong>błyskawicznie się spłukuje</strong>, pozostawiając uczucie świeżości i czystości.</li><li>💧 <strong>Krok 5 — Kontynuacja:</strong> Delikatnie osusz twarz i przejdź do aplikacji ulubionego toniku lub serum, aby dopełnić rytuał pielęgnacyjny.</li></ol>
<h2>📊 Parametry produktu</h2><ul><li>🏷️ <strong>Nazwa:</strong> Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml</li><li>🏷️ <strong>Pojemność:</strong> 75 ml</li><li>🏷️ <strong>Kraj pochodzenia:</strong> Italy</li></ul><h2>🧪 Skład (INCI)</h2><p>Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.</p>
<h2>⚠️ Bezpieczeństwo i dane prawne</h2><ul><li>🛡️ <strong>Podmiot odpowiedzialny w UE:</strong> Equilibra srl</li><li>🛡️ <strong>Adres:</strong> Via Plava, 74 Torino – 10135 Italy</li><li>🛡️ <strong>Kontakt:</strong> cosmetica@equilibra.it</li></ul>
```

## 8. Equilibra — pełna zawartość `out/offer_8000137015436.json`
```json
{
  "title": "Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml",
  "description_html": "<!-- Applied: Sensory Priming, Routine Anchors, Beauty Rx --><h1>🌟 Oczyszczający krem-żel do twarzy z aktywnym węglem</h1><p>Odkryj zaawansowaną formułę, która łączy <strong>głębokie oczyszczanie</strong> z ochroną naturalnej bariery hydrolipidowej skóry. Ten wyjątkowy krem-żel delikatnie usuwa codzienne zanieczyszczenia, nadmiar sebum oraz pozostałości makijażu, pozostawiając Twoją skórę <strong>matową</strong>, a zarazem miękką i nawilżoną. Czujesz pod palcami, jak <strong>bogata, jedwabista konsystencja</strong> po spienieniu z wodą łagodnie szarzeje, otulając twarz i zapewniając sensoryczną czystość bez nieprzyjemnego uczucia ściągnięcia.</p>\n<!-- Applied: Pratfall Effect, Beauty Rx --><h2>❓ Pytania i odpowiedzi</h2><ul><li>🔴 <strong>Problem:</strong> Trudności z domywaniem makijażu i szorstkość skóry po myciu?</li><li>🟢 <strong>Answer:</strong> Formuła z <strong>aktywnym węglem</strong> oraz <strong>naturalnymi olejami</strong> skutecznie rozpuszcza zanieczyszczenia już przy pierwszym kontakcie, dbając o jedwabistą miękkość naskórka i wspierając jego barierę ochronną.</li><li>🔴 <strong>Problem:</strong> Obawa przed zabrudzeniem armatury łazienkowej ciemnym kosmetykiem?</li><li>🟢 <strong>Answer:</strong> Nasz krem-żel po spienieniu szarzeje i <strong>bardzo łatwo spłukuje się z powierzchni</strong>, nie pozostawiając osadów na umywalce ani kafelkach.</li><li>🔴 <strong>Problem:</strong> Uczucie ściągnięcia i przesuszenia po oczyszczaniu?</li><li>🟢 <strong>Answer:</strong> Dzięki obecności <strong>kwasu hialuronowego</strong> i <strong>gliceryny</strong> produkt aktywnie dba o nawodnienie już w trakcie mycia, eliminując dyskomfort napiętej skóry.</li><li>🔴 <strong>Problem:</strong> Specyficzny, lekko apteczny zapach kosmetyku?</li><li>🟢 <strong>Answer:</strong> Brak sztucznych kompozycji zapachowych może skutkować surową nutą węgla, co stanowi bezpośredni dowód na <strong>prosty skład</strong> i minimalizuje ryzyko podrażnień wrażliwej cery.</li></ul>\n<h2>⚙️ Zaawansowane działanie składników aktywnych</h2><ul><li>🌱 <strong>Charcoal Powder:</strong> Wykazuje silne właściwości absorpcyjne, skutecznie przyciągając zanieczyszczenia oraz nadmiar sebum z powierzchni skóry, działając jak <strong>naturalny magnes oczyszczający</strong>.</li><li>💧 <strong>Sodium Hyaluronate i Glycerin:</strong> Silne humektanty, które <strong>wiążą wodę w naskórku</strong>, zapewniając długotrwałe nawilżenie i zapobiegając przesuszeniu skóry po myciu.</li><li>🌿 <strong>Prunus Amygdalus Dulcis Oil i Helianthus Annuus Seed Oil:</strong> Naturalne emoliety bogate w kwasy tłuszczowe, które <strong>odbudowują płaszcz lipidowy</strong> i pozostawiają wyczuwalną miękkość.</li><li>🛡️ <strong>Hydrolyzed Eruca Sativa Leaf i Tocopherol:</strong> Dostarczają skutecznej ochrony antyoksydacyjnej, neutralizując wolne rodniki i wspierając <strong>naturalne mechanizmy obronne skóry</strong>.</li><li>⚡ <strong>Coco-Caprylate/Caprate i C10-18 Triglycerides:</strong> Lekkie emolienty, które poprawiają sensorykę aplikacji, zapewniając <strong>gładkość bez obciążania skóry</strong>.</li><li>💆‍♀️ <strong>Aloe Barbadensis Leaf Juice:</strong> Kondycjonuje i <strong>koi skórę</strong>, wspierając jej zdrowy wygląd i redukując dyskomfort.</li><li>🔬 <strong>Xanthan Gum i Cetearyl Alcohol:</strong> Odpowiadają za stabilizację emulsji oraz kontrolę lepkości, gwarantując <strong>idealną, kremowo-żelową konsystencję</strong> produktu.</li><li>⚡ <strong>Synergia węgla i humektantów:</strong> Połączenie węgla aktywnego z humektantami zapewnia <strong>głębokie oczyszczenie bez efektu ściągnięcia</strong> skóry.</li><li>⚡ <strong>Odbudowa barierowa:</strong> Połączenie naturalnych lipidów z oleju ze słodkich migdałów i oleju słonecznikowego <strong>rekonstruuje barierę naskórkową</strong> już na etapie mycia.</li></ul>\n<!-- Applied: Pratfall Effect, Sensory Priming, Routine Anchors --><h2>📝 Sposób użycia i codzienna rutyna</h2><p>Wprowadź produkt jako stały element swojej pielęgnacji, aby aktywnie dbać o czystość i barierę skóry każdego dnia.</p><ol><li>💧 <strong>Krok 1 — Przygotowanie:</strong> Zwilż skórę twarzy letnią wodą, aby przygotować ją na przyjęcie składników aktywnych.</li><li>💧 <strong>Krok 2 — Dozowanie:</strong> Wyciśnij niewielką ilość produktu. Z uwagi na <strong>gęstą, niezwykle zwartą konsystencję</strong>, wyciśnięcie wymaga minimalnie większego nacisku, co zapobiega przypadkowemu rozlaniu i pozwala precyzyjnie odmierzyć dozę. Jedno opakowanie wystarcza na ok. 60 dni systematycznego oczyszczania.</li><li>💧 <strong>Krok 3 — Aplikacja:</strong> Rozprowadź kosmetyk na twarzy, wykonując delikatny masaż. Poczuj, jak gładka, czarna formuła <strong>delikatnie szarzeje i pieni się</strong> pod palcami, absorbując zanieczyszczenia z porów.</li><li>💧 <strong>Krok 4 — Spłukiwanie:</strong> Zmyj produkt dokładnie letnią wodą. Kosmetyk <strong>błyskawicznie się spłukuje</strong>, pozostawiając uczucie świeżości i czystości.</li><li>💧 <strong>Krok 5 — Kontynuacja:</strong> Delikatnie osusz twarz i przejdź do aplikacji ulubionego toniku lub serum, aby dopełnić rytuał pielęgnacyjny.</li></ol>\n<h2>📊 Parametry produktu</h2><ul><li>🏷️ <strong>Nazwa:</strong> Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml</li><li>🏷️ <strong>Pojemność:</strong> 75 ml</li><li>🏷️ <strong>Kraj pochodzenia:</strong> Italy</li></ul><h2>🧪 Skład (INCI)</h2><p>Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.</p>\n<h2>⚠️ Bezpieczeństwo i dane prawne</h2><ul><li>🛡️ <strong>Podmiot odpowiedzialny w UE:</strong> Equilibra srl</li><li>🛡️ <strong>Adres:</strong> Via Plava, 74 Torino – 10135 Italy</li><li>🛡️ <strong>Kontakt:</strong> cosmetica@equilibra.it</li></ul>",
  "ingredients_inci": "Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.",
  "eu_responsible_person": {
    "source": "description",
    "data": {
      "name": "Equilibra srl",
      "address_eu": "Via Plava, 74 Torino – 10135 Italy",
      "contact": "cosmetica@equilibra.it",
      "raw_fragment": "<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href=\"mailto:cosmetica@equilibra.it\">cosmetica@equilibra.it</a></p>"
    }
  },
  "safety_warnings": [],
  "source_map": {
    "title": {
      "source": "baselinker",
      "matched_key": null
    },
    "description_html": {
      "source": "pipeline",
      "matched_key": null
    },
    "ingredients_inci": {
      "source": "baselinker",
      "matched_key": null
    },
    "eu_responsible_person": {
      "source": "description",
      "matched_key": null
    },
    "safety_warnings": {
      "source": "a5",
      "matched_key": null
    }
  }
}
```

## 9. Tabela weryfikacyjna

| pole | wartość w `extracted_data` | wartość w `description_html` |
|---|---|---|
| pojemność | 75 ml | 75 ml |
| marka | _brak (null)_ | _brak w HTML_ |
| podmiot odpowiedzialny | Equilibra srl | Equilibra srl |
| pierwsze 5 pozycji INCI | Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate | Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate |

## 10. `token_usage_per_node` zrzucony z usageMetadata
```json
{
  "A1": {
    "promptTokenCount": 860,
    "candidatesTokenCount": 48,
    "thoughtsTokenCount": 0,
    "totalTokenCount": 908
  },
  "A2": {
    "promptTokenCount": 751,
    "candidatesTokenCount": 431,
    "thoughtsTokenCount": 0,
    "totalTokenCount": 1182
  },
  "A4": {
    "promptTokenCount": 3047,
    "candidatesTokenCount": 664,
    "thoughtsTokenCount": 0,
    "totalTokenCount": 3711
  },
  "A5": {
    "promptTokenCount": 2952,
    "candidatesTokenCount": 104,
    "thoughtsTokenCount": 1068,
    "totalTokenCount": 4124
  },
  "A6": {
    "promptTokenCount": 3129,
    "candidatesTokenCount": 1412,
    "thoughtsTokenCount": 0,
    "totalTokenCount": 4541
  },
  "A7": {
    "promptTokenCount": 3046,
    "candidatesTokenCount": 986,
    "thoughtsTokenCount": 2657,
    "totalTokenCount": 6689
  },
  "A10": {
    "promptTokenCount": 3284,
    "candidatesTokenCount": 79,
    "thoughtsTokenCount": 493,
    "totalTokenCount": 3856
  }
}
```

## 11. Testy — pełny wydruk `npm test`
```
> offer-optimizer-v2@1.0.0 test
> node tests/orchestrator.test.js && node tests/baselinker.extract.test.js && node tests/config.test.js && node tests/normalization.test.js && node tests/gate.test.js && node tests/rag.service.test.js && node tests/validators.test.js && node tests/gate_12.test.js

Testing V1 Orchestrator core
✔ Zadanie 36-DOK: A6 - hash sekcji 3, 5, 6 trafia do frozen_hashes (6.7725ms)
✔ Zadanie 36-DOK: A10 musi zachować sekcje 3, 5, 6 używając frozen_hashes (0.7583ms)
✔ Zadanie 36-DOK: A10 - odrzucenie zmiany w sekcji 3 (0.3541ms)
✔ Orchestrator init (0.2878ms)
✔ Orchestrator - NORMAL FAIL w pipeline (12.4214ms)
✔ Orchestrator - BLOCKED w pipeline (11.0537ms)
✔ Orchestrator - HARD FAIL na pustym eu_responsible_person w EXTRACT (132.5032ms)
✔ Zadanie 36-DOK: A5 - BLOCKED_CRITICAL_LEGAL_BREACH zatrzymuje potok (15.9495ms)
✔ Zadanie 36-DOK: A5 - mandatory_safety_warnings przechodzi dalej znak w znak (10.5916ms)
✔ Zadanie 36-DOK: A6 - hash sekcji 3, 5, 6 trafia do frozen_hashes (4.8205ms)
✔ Zadanie 36-DOK: A6 - wyjście z niedozwolonym tagiem jest odrzucane (3.1406ms)
✔ Zadanie 36-DOK: normalizacja tagów z punktu 1 działa na poziomie A6 (2.7944ms)
✔ Zadanie 36-DOK: A7 - zmiana sekcji zamrożonej daje FROZEN_SECTION_VIOLATION i nie wysyłane do A7 są 3,5,6 (2.9407ms)
✔ Zadanie 36-DOK: A10 - patch w sekcję zamrożoną jest odrzucany (15.0317ms)
✔ Zadanie 36-DOK: A10 - patch poza zamrożonymi nakłada się poprawnie (13.2214ms)
✔ Zadanie 36-DOK: Normalizacja tagów działa na tag <i> (3.1798ms)
✔ Zadanie 36-DOK: A7 weryfikacja nie zamraża innych sekcji (9.9533ms)
✔ Zadanie 36-DOK: A10 ignoruje braki na dozwolonych patchach w schemacie tablicy (11.3986ms)
✔ Zadanie 36-DOK: Sklejanie (checkHitExact) omija błędne zlepki, rozdzielając nazwy bez spacji (2.4534ms)
✔ Zadanie 37: wywołanie writeBackToBaseLinker rzuca WRITE_BACK_DISABLED_BY_OPERATOR (0.2149ms)
✔ Zadanie 40: Orchestrator składa sekcje 5 i 6 z extracted_data (3.1976ms)
✔ Zadanie 40: eu_responsible_person = null skutkuje MISSING_EU_RESPONSIBLE_PERSON i brakiem zmyślonej sekcji (2.3287ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-08-01": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-08-01": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3719.1621ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (811.9246ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (208.0596ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (411.3454ms)
✔ Asercje Metadanych - GATE/RULE/entryName (1896.0996ms)
✔ Teardown (4.2041ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (2.1818ms)
  ✔ Wykrywa stop-words z polskimi znakami (1.0522ms)
✔ Test korupcji kodowania list bezpieczeństwa (4.022ms)
✔ V1 ean_checksum (0.9637ms)
✔ V2 route_chemical (0.3648ms)
✔ V3 scan_stopwords (0.4581ms)
✔ V4 scan_medical_claims_lexical (0.3317ms)
✔ V5 validate_html_whitelist (1.4962ms)
✔ V5b validate_html_whitelist po normalizacji (249.7163ms)
✔ V6 diff_numeric (1.2718ms)
✔ V7 emoji_structure_check (13.0719ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (0.4522ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.2089ms)
  ✔ GATE-1 check 3: tpo (0.1709ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.1065ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.0593ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0504ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.0521ms)
  ✔ GATE-1 check 8: 4-mbc (0.0492ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.0496ms)
  ✔ GATE-1 check 10: bp-2 (0.051ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.0551ms)
  ✔ GATE-1 check 12: bp-5 (0.0453ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.0447ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0436ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.0613ms)
  ✔ GATE-1 check 16: silver (nano) (0.0471ms)
  ✔ GATE-2 check 1: ketoconazole (0.1412ms)
  ✔ GATE-2 check 2: climbazole (0.0537ms)
  ✔ GATE-2 check 3: clotrimazole (0.1214ms)
  ✔ GATE-2 check 4: miconazole (0.0592ms)
  ✔ GATE-2 check 5: hydroquinone (0.0503ms)
  ✔ GATE-2 check 6: tretinoin (0.0518ms)
  ✔ GATE-2 check 7: adapalene (0.1534ms)
  ✔ GATE-2 check 8: isotretinoin (0.1071ms)
  ✔ GATE-2 check 9: egf (0.0689ms)
  ✔ GATE-2 check 10: fgf (2.2525ms)
  ✔ GATE-2 check 11: erythromycin (0.0856ms)
  ✔ GATE-2 check 12: clindamycin (0.058ms)
  ✔ GATE-2 check 13: neomycin (0.0503ms)
  ✔ GATE-2 check 14: corticosteroids (0.0511ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0494ms)
  ✔ GATE-1 forma etykietowa (0.2188ms)
  ✔ GATE-1 brak falszywych trafien (0.1753ms)
  ✔ Safe ingredients (0.122ms)
✔ V8 gate_ingredients (6.9773ms)
✔ V9 c2pa_check (0.0983ms)
✔ V10 freeze_sections (4.282ms)
✔ V11 validate_eu_responsible_person (0.4391ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.1042ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0863ms)
✔ V12 validate_grounded_facts - UNGROUNDED_QUANTITY (0.9157ms)
✔ V12 validate_grounded_facts - FABRICATED_RESPONSIBLE_PERSON (0.3608ms)
✔ V12 validate_grounded_facts - UNGROUNDED_BRAND (0.1295ms)
ℹ tests 127
ℹ suites 0
ℹ pass 127
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7915.4711
```

## 12. `git diff --stat` całego modułu v2
```
 .agents/.ai-memory.md                              | 691 +++++++++++----------
 .github/workflows/deploy.yml                       |   7 +
 .github/workflows/staging-deploy.yml               |   7 +
 .gitignore                                         | Bin 660 -> 684 bytes
 src/modules/offer-optimizer-v2/orchestrator.js     |  52 +-
 .../offer-optimizer-v2/prompts/Agent_6_compiled.md |  17 +-
 .../scripts/test_orchestrator.js                   |  11 +
 .../offer-optimizer-v2/tests/orchestrator.test.js  |  64 +-
 .../offer-optimizer-v2/tests/validators.test.js    |  37 ++
 src/modules/offer-optimizer-v2/validators/index.js |  83 ++-
 10 files changed, 599 insertions(+), 370 deletions(-)
```
