# PLAN_17_ekstrakcja_baselinker.md

## Cel zadania

Zbudowanie bezstanowej warstwy ekstrakcji, która deterministycznie odczytuje i normalizuje dane produktu (np. skład INCI, producent, pojemność) zawarte bezpośrednio w źródłach BaseLinkera (w polach `features` oraz kodzie HTML w `description`). Model A1 (LLM) nie będzie używany.

## Wnioski z sondy KROK 1 (surowa odpowiedź metody)

Wykonałem badanie metody `getInventoryManufacturers`. Zwrócone rekordy z bazy BaseLinkera strukturalnie posiadają pola adresowe i kontaktowe (np. `manufacturer_street`, `manufacturer_city`, `manufacturer_phone`). Jednakże dla ponad 90% asortymentu z próby, np. `Equilibra`, pola te pozostają u dostawcy puste. Znalezienie ich np. u producenta `Lalachuu` udowadnia, że encja istnieje, ale na razie jest niewiarygodna strukturalnie. Z tego powodu operowanie na `text_fields.description` oraz `features` to w pełni słuszne założenie, by pozyskać realny adres.

## [PLAN DZIAŁANIA]

1. **Stworzenie map i kluczy normalizujących (`baselinker.extract.config.json` oraz `baselinker.extract.js`)**
   - Plik konfiguracyjny z mapą synonimów w czystym JSON.
   - Wdrożenie czystej logiki trójelementowej: `normalizeFeatureKey()` do usuwania ogonków, podwójnych spacji i diakrytyk. Z kolei `extractFromFeatures()` rozpakuje obiekt i dobierze wartość INCI znak w znak, a `extractResponsiblePersonFromDescription()` w sposób konserwatywny (używając RegExp na znaczniki `<p>`) przechwyci adres EU Responsible Person na podstawie bliskości elementu `mailto:`. Wymusi zachowanie pola `raw_fragment`. Wynik przepuszczony przez walidator.

2. **Fixtures oraz testy jednostkowe (`tests/fixtures/` oraz `tests/baselinker.extract.test.js`)**
   - Wygenerowanie 4 statycznych próbek odpowiedzi (fixture) z pominięciem obciążającego `kod karty`.
   - Zdefiniowanie testów dla dokładnie 7 wariantów wyszczególnionych w ZADANIU_17, zapewniających odporność na popsuty JSON i badających wypluty INCI.

3. **Końcowy raport (`docs/RAPORT_17_ekstrakcja_baselinker.md`)**
   - Raport końcowy z zaliczonym testowaniem (`fail 0`) Node.js Test Runner, logami z polecenia `--short` oraz wynikami dla Equilibra i Trimay. 

<WERYFIKACJA_QA>
- Sprawdziłem czy zasada ZERO LLM jest utrzymana. Tak - logika ekstrakcji jest twardym regexem/JSON parsowaniem.
- Uważać na wyłapywanie bloku HTML. Użyję Regexa obejmującego całe tagi paragrafów, tak by nie utracić adresów. Trimay nie posiada wcale HTML w opisie z `mailto`, więc `extractResponsiblePersonFromDescription` zgodnie ze zleceniem wyrzuci `null`.
- Unikać zgadywania "na podobieństwo" -> tylko ścisły match do tabeli kluczy `["ingredients inci", "skladniki inci", "sklad inci", "inci"]`. 
</WERYFIKACJA_QA>
