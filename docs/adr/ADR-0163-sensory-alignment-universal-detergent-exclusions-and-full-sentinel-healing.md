# ADR-0163: Spójność Sensoryczna Wariantu, Wykluczenia Tkaninowe Detergentów Uniwersalnych, Producent GPSR w Sekcji 5 oraz Pełne Odblokowanie Samonaprawy Sentinela S1–S6

## Status
ZAAKCEPTOWANY / WDROŻONY PRODUKCYJNIE (Data: 2026-10-20)

## Kontekst i Identyfikacja Wad Produkcyjnych
Podczas audytu wykonania potoku EAN Pipeline (`offer-optimizer-v2`) dla asortymentu detergentów piorących (Sweet Home Ocean Paradis) zidentyfikowano następujące krytyczne nieścisłości:
1. **🚨 Konflikt sensoryczny we wstępie (halucynacja zapachu):**
   Agent 7 we wstępie przypisał produktowi o wariancie morskim/oceanicznym zapach „czystej bawełny”. Przyczyną było ubożenie kontekstu w `agent7Data` (brak przekazania wariantu zapachu z PIM/cech) oraz generyczna klisza w prompcie A7 sugerująca „świeży zapach czystości”. Agent 10 nie posiadał w matrycy audytu reguły weryfikacji zgodności olfaktorycznej.
2. **🚨 Pominięcie wełny i jedwabiu w wykluczeniach aplikacyjnych:**
   Wykluczenie tkanin delikatnych w promptach A4, A6 i A10 było warunkowane wyłącznie obecnością enzymu proteazy. Uniwersalne płyny piorące o odczynie zasadowym (pH > 8) bezpowrotnie degradują naturalne włókna białkowe (keratynę i fibroinę) niezależnie od obecności proteazy.
3. **🚨 Brak kompozycji zapachowej w wykazie ⚙️ Sekcji 3:**
   Prompt Agenta 4 pominął rolę technologiczną kompozycji zapachowych (Parfum z alergenami jak Limonene). Mimo wykazania Limonenu w synergiach ⚡ oraz w EUH208, zabrakło punktu ⚙️ w Sekcji 3.
4. **🚨 Mieszanie warstw opisu w Sekcji 3 (⚙️):**
   W punkcie rozjaśniaczy optycznych (FWA) Agent 4 wkleił konsumencki zakaz prania czerni zamiast czystego mechanizmu fizykochemicznego (fluorescencja UV i emisja błękitu). Zakazy aplikacyjne należą wyłącznie do Sekcji 4 i FAQ.
5. **🚨 Brak parametru Producent w specyfikacji technicznej (Sekcja 5 ⚖️):**
   W specyfikacji Sekcji 5 brakowało parametru `Producent: Suarez Company S.r.l.`, mimo że podmiot wytwórczy różnił się od marki marketingowej (`Sweet Home Collection`). W `orchestrator.js` linie 2159–2162 odrzucały jakiekolwiek patche Agenta 10 na sekcje 3, 5 i 6.

---

## Podjęte Decyzje Architektoniczne

### 1. Rozszerzenie Kognitywne i Rekonstrukcja Promptów
- **`Agent_4_prompt_v4.md`:**
  * Wprowadzono do ról technologicznych kompozycję zapachową (`Parfum / Fragrance` oraz alergeny jak Limonene, Linalool itp.) jako obowiązkowy punkt ⚙️ w `technical_benefits_aeo`.
  * Oczyszczono definicję rozjaśniaczy optycznych (FWA) – punkt ⚙️ opisuje wyłącznie mechanizm fluorescencji cząsteczki z zakazem umieszczania formułek aplikacyjnych.
- **`Agent_6_prompt_v4.md`:**
  * Sekcja 2 (FAQ ❓) i Sekcja 4 (Sposób użycia ✍️): Wprowadzono bezwzględny obowiązek wykluczenia prania wełny i jedwabiu dla wszystkich uniwersalnych detergentów piorących (ochrona włókien białkowych przed środowiskiem alkalicznym).
  * Sekcja 3 (⚙️): Wdrożono rygorystyczną separację warstw (fizykochemia w ⚙️ vs aplikacja w Sekcji 4).
  * Sekcja 5 (⚖️): Dodano parametr `Producent:` do listy wymaganych pól specyfikacji obok marki.
- **`Agent_7_prompt_v4.md`:**
  * W mechanizmie M2 Sensory Priming wprowadzono rygor spójności olfaktorycznej: model operuje ściśle profilem zapachowym przekazanym w danych SKU (`scent_variant`) z kategorycznym zakazem halucynowania obcych nut („czysta bawełna”) dla innych profili zapachowych.
- **`Agent_10_prompt_v4.md`:**
  * F3: Dodano audyt spójności wariantu zapachowego między nazwą/cechami a narracją wstępu.
  * F6: Dodano audyt wykluczenia wełny i jedwabiu w detergentach uniwersalnych oraz audyt obecności kompozycji zapachowej w Sekcji 3.
  * F7: Dodano audyt obecności Producenta w Sekcji 5.
  * Zaktualizowano schemat i dyrektywę dozwolonych sekcji patchy (`section_1_html` do `section_6_html`).

### 2. Modyfikacje w Orkiestratorze i Walidatorach
- **`orchestrator.js`:**
  * Zniesiono blokadę `A10_PATCH_ON_FROZEN_SECTION` – Agent 10 może bezpiecznie patchować wszystkie sekcje S1–S6. Po nałożeniu patchy orkiestrator natychmiast uruchamia wzmocnione sanitizery (`sanitizeSection3Html`, `sanitizeSection5Html`, `sanitizeSection6Html`).
  * W `sanitizeSection5Html` zaimplementowano automatyczne wstrzykiwanie parametru `Producent: [Nazwa]`, jeśli podmiot wytwórczy jest znany z PIM/GPSR i brakuje go w kodzie HTML.
  * Wzbogacono payloady `agent6Data`, `agent7Data`, `agent10Data` oraz `pimPayload` o jawne pola `scent` / `scent_variant` oraz `manufacturer`.
- **`validators/index.js`:**
  * W `validate_section5_compliance` dodano opcję `require_manufacturer` weryfikującą obecność twardego parametru `Producent:` w sekcji 5.

### 3. Kompilacja Promptów
- Uruchomiono `prompt-compiler.js` – zrekompilowano prompty Agentów 1, 2, 4, 5, 6, 7, 8, 9, 10.
- Weryfikacja składni Node.js `node -c` zakończona sukcesem (exit code 0).
