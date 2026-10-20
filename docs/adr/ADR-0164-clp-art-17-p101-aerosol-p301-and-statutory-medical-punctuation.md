# ADR-0164: Wdrożenie obowiązkowego zwrotu P101 (art. 17 ust. 1 CLP), procedury P301+P312 dla aerozoli oraz ochrona urzędowej interpunkcji procedur medycznych

## Status
ZAAKCEPTOWANY / WDROŻONY

## Kontekst
W procesie optymalizacji ofert (`offer-optimizer-v2`) dla produktów chemii gospodarczej, detergentów i preparatów w aerozolu (np. odświeżacze powietrza, preparaty czyszczące) wystąpiły uchybienia formalno-prawne i interpunkcyjne:
1. **Brakujący obowiązkowy kod P101:** Zgodnie z art. 17 ust. 1 lit. g w zw. z art. 28 Rozporządzenia CLP (WE 1272/2008), w przypadku produktów konsumenckich sklasyfikowanych jako stwarzające zagrożenie (np. H319) zwrot P102 (*"Chronić przed dziećmi"*) musi być obligatoryjnie uzupełniony o zwrot ogólny P101 (*"W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę."*). Pominięcie P101 stanowiło uchybienie wymogom etykietowania konsumenckiego.
2. **Brak procedury ratunkowej przy połknięciu:** W preparatach aerozolowych i sprayach z potencjalnymi substancjami drażniącymi lub frakcjami chemicznymi brakowało uniwersalnego zabezpieczenia ratunkowego `P301+P312` (*"W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem."*).
3. **Błędy interpunkcyjne w procedurach medycznych CLP:** W zwrotach `P301+P312`, `P305+P351+P338` oraz `P337+P313` pojawiały się myślniki zamiast urzędowych dwukropków po nagłówkach okolicznościowych (np. `W PRZYPADKU DOSTANIA SIĘ DO OCZU –` zamiast `W PRZYPADKU DOSTANIA SIĘ DO OCZU:`). Śledztwo w kodzie wykazało, że w funkcji `sanitizeSection6Html` w `orchestrator.js` funkcjonował destrukcyjny regex:
   ```javascript
   res = res.replace(/(P305\+P351\+P338\s*–\s*W\s+PRZYPADKU\s+DOSTANIA\s+SIĘ\s+DO\s+OCZU):/gi, '$1 –');
   ```
   który pod pretekstem eliminacji potrójnego dwukropka mechanicznie niszczył prawidłowy, urzędowy dwukropek CLP.

Zgodnie z wytycznymi użytkownika wykluczono „betonowanie i regexy zastępujące modele”. Zamiast tego modele (A5, A6, A10) otrzymały ścisłą reprymendę i wiedzę dziedzinową, orkiestrator przestał niszczyć tekst, a serwis bezpieczeństwa GPSR/CLP rozszerzono o aerozole.

## Podjęte Decyzje i Zmiany Architektoniczne

### 1. Eliminacja destrukcyjnego regexa w `orchestrator.js`
- Usunięto linię w `sanitizeSection6Html`, która zamieniała urzędowy dwukropek po `W PRZYPADKU DOSTANIA SIĘ DO OCZU:` na myślnik `–`.
- Zachowano standardową sanityzację likwidującą wyłącznie podwójne zbitki dwukropkowe `::` oraz zbite dwukropki po etykiecie pogrubionej i kodzie (`<b>Ostrzeżenie CLP/GPSR:</b> P102:` -> `<b>Ostrzeżenie CLP/GPSR:</b> P102 –`).

### 2. Rozszerzenie klasyfikacji chemicznej o aerozole w `gpsr.safety.service.js`
- Wprowadzono precyzyjną detekcję aerozoli/sprayów:
  ```javascript
  const isAerosol = /(aerozol|spray|aerosol|atomizer|odświeżacz powietrza|odswiezacz powietrza)/i.test(prodNameLower) ||
                    features?.['Postać'] === 'Spray' || features?.['Postać'] === 'Aerozol';
  ```
- Włączono `isAerosol` do `isActualChemical` oraz `isClassifiedChemical`.
- W fallbacku (przy braku INCI) wstrzyknięto obligatoryjny zwrot `P101` obok `P102` oraz `P301+P312` dla kapsułek, chemii i aerozoli.
- Zapewniono automatyczne generowanie `P301+P312` dla sklasyfikowanej chemii, kapsułek oraz aerozoli w regułach CLP.

### 3. Aktualizacja promptów i wiedzy dziedzinowej Agentów (A5, A6, A10)
- **Agent 5 (Legal Compliance Shield):**
  - Dyrektywa 4D: Wprowadzono twardy wymóg obligatoryjności `P101` (art. 17 ust. 1 CLP) obok `P102`.
  - Wprowadzono wymóg standardowego zabezpieczenia ratunkowego `P301+P312` dla detergentów, kapsułek, płynów oraz preparatów aerozolowych.
  - Zdefiniowano urzędową interpunkcję CLP: nagłówki okolicznościowe (`W PRZYPADKU POŁKNIĘCIA:`, `W PRZYPADKU DOSTANIA SIĘ DO OCZU:`, `W przypadku utrzymywania się działania drażniącego na oczy:`) bezwzględnie kończą się dwukropkiem `: `.
- **Agent 6 (Master Copywriter):**
  - Dyrektywa 6: Sprecyzowano, że zakaz zbitych dwukropków dotyczy wyłącznie `::` i dublowania dwukropka po etykiecie i kodzie. Nagłówki okolicznościowe procedur medycznych bezwzględnie wymagają urzędowego dwukropka.
  - Sekcja s6: Kategoryczny nakaz uwzględniania `P101` (art. 17 CLP) oraz `P301+P312` dla chemii i aerozoli w `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> ...</li>`.
- **Agent 10 (Master Compliance Sentinel):**
  - Reguła F5: Dodano procedury audytu i samonaprawy (`repair_patches`):
    * Audyt art. 17 CLP: brak P101 -> automatyczny patch naprawczy.
    * Audyt procedury przy połknięciu: brak P301+P312 dla detergentów, płynów i aerozoli -> automatyczny patch naprawczy.
    * Audyt interpunkcji urzędowej: myślnik zamiast dwukropka po nagłówku okolicznościowym procedury medycznej -> patch przywracający urzędowy dwukropek `: `.

### 4. Rekompilacja i Weryfikacja
- Przeprowadzono pełną kompilację promptów przez `prompt-compiler.js` z weryfikacją poprawności bajtowej i diakrytyków (2696 polskich znaków diakrytycznych).
- Zweryfikowano bezbłędną składnię modułów Node.js (`node -c`).

## Konsekwencje
- Wyeliminowano ryzyko niezgodności z art. 17 ust. 1 Rozporządzenia CLP – oferty dla mieszanin stwarzających zagrożenie zawierają komplet P101 + P102.
- Oferty dla aerozoli i detergentów posiadają kompletną procedurę ratunkową przy połknięciu (`P301+P312`).
- Przywrócono urzędowy standard interpunkcyjny CLP w procedurach medycznych bez destrukcyjnych ingerencji regexów orkiestratora.
