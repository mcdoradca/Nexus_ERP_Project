# ADR-0174: Universal Contextual Section 3 (A4), Legal English INCI / Reg. 648/2004, EUH208 1:1 Manufacturer Fidelity & AGD Electrical Safety

**Status:** Accepted  
**Date:** 2026-11-10  
**Scope:** `offer-optimizer-v2` (Universal Pipeline — Chemii Gospodarczej, AGD, Kosmetyków)  
**Triggering Incident:** Production description for *Dual Power środek do czyszczenia frytkownic 500 ml* (`EAN 8050999571724`):
1. Cross-category bathroom leak (`"ułatwiają penetrację osadów z kamienia i mydła"`) injected into air fryer cleaner from `inci_mechanisms_pl.json` and hardcoded deterministic Section 3 skip.
2. Pseudoscientific template (`"Synergia Dwufazowego Odtłuszczania"`) applied to homogeneous single-phase aqueous spray.
3. Conservant / `EUH208` discrepancy + false substring collision (`/nic/` inside `gpsr.safety.service.js` matching `frytkownic` as dental floss) and `EUH208` overriding manufacturer's CLP threshold declaration (`MCI/MI` only) with Reg. 648/2004 preservative list (`BIT + MCI/MI`), plus Polish-translated ingredient fragments instead of legal English INCI/IUPAC naming.
4. Missing electrical unplugging and complete cool-down instructions prior to cleaning powered/heated AGD interiors (`Krok 1` + `WYKLUCZENIE ZASTOSOWANIA`).

---

## Decision

1. **Universal Contextual Section 3 via Agent 4 (`orchestrator.js`, `inci_mechanisms_pl.json`, `Agent_4_prompt_v4.md`):**
   - Removed the static multi-ingredient Agent 4 bypass (`tryBuildDeterministicSection3` skip) from the primary execution path so `Agent 4` (`gemini-3.8-flash`) always evaluates INCI / Reg. 648/2004 composition in the context of `product_purpose`, `physical_form`, `dispenser_type`, `usage_instructions`, and `physical_grounding_context`.
   - Retained `tryBuildDeterministicSection3` strictly as a defensive fallback when `Agent 4` throws OR returns empty `technical_benefits_aeo`, ensuring `orchestrator.run()` continues through `RUN_A5 -> RUN_A6 -> RUN_A11 -> RUN_A10` without premature return (`a4FallbackUsed` guard + safe synthesis in `RUN_A6` using `<h2>` HTML whitelist tags).
   - Disabled cross-product `auto_learned` poisoning in `learnFromAgent4Output` (returns `0`) and purged bathroom/pseudoscientific templates from generic surfactant/synergy defaults in `inci_mechanisms_pl.json` and `deterministic-pipeline.engine.js` (`KROK L` sanitizer).

2. **Mandatory Legal English INCI / Reg. 648/2004 Naming (`normalization.js`, `vision-extractor.service.js`, `orchestrator.js`, `Agent_4/6_prompt_v4.md`):**
   - Implemented `normalizeInciToLegalEnglish(rawInci)` in `normalization.js` to deterministically map PL/IT/DE/FR detergent groups and common cosmetic/chemical names 1:1 into canonical English INCI / Reg. 648/2004 / IUPAC terminology without adding or omitting any substance.
   - Enforced legal English output in `BACK_PACK_INCI_PROMPT` (`extractInciFromBackPack`) and applied `normalizeInciToLegalEnglish` in `RUN_A4` and `RUN_A6` (`compFooterHtml`).

3. **Strict 1:1 Manufacturer Label Fidelity (`ABC -> ABC`) & Substring Collision Hardening (`gpsr.safety.service.js`, `validators/index.js`, `Agent_6/10/11_prompt_v4.md`):**
   - Replaced bare substring matchers in `gpsr.safety.service.js` (`isToothbrush`, `isDentalFloss`) with Unicode word boundaries and `!isActualChemical` / oral-chemical guards so kitchen/technical nouns (`frytkownic`, `chłodnic`) never route to `DENTAL_FLOSS_SAFETY`.
   - In `generateGpsrWarnings` Section 10 (`EUH208`), honored explicit manufacturer label `EUH208` declarations verbatim (`Zawiera:`/`Contains:`/`Contiene:` with or without colon) without injecting Reg. 648/2004 preservatives that fall below CLP Specific Concentration Limits (`BIT` < SCL when label lists only `MCI/MI`), while still deriving full sensitizer `EUH208` from INCI when no explicit label `EUH208` exists.
   - Harmonized `validators/index.js` Rule 6 (`"Nie połykać."`) with `gpsr.safety.service.js` so mild unclassified products with an explicit 1:1 manufacturer label (only `P101/P102/P103/EUH208`, no `H3xx`/`P301`/ingestion hazard) pass without fabricated warnings.

4. **AGD Electrical & Thermal BHP + Universal Search Intent (`Agent_6/10/11_prompt_v4.md`, `google-suggest-faq.service.js`, `validators/index.js`):**
   - Mandated explicit unplugging and full appliance/heating-element cool-down before liquid application inside powered/heated AGD (`frytkownice`, `piekarniki`, `tostery`, `grille`, `ekspresy`) without altering manufacturer step semantics (`1:1`).
   - Generalized `google-suggest-faq.service.js` fallback queries to reflect `frontPurpose` instead of generic `"zmywalne powierzchnie bez smug"`.
   - Added **Rule 22** in `validate_domain_and_chemical_logic` blocking unsubstantiated `"dwufazowe odtłuszczanie"` and non-bathroom/non-acid `"osady z kamienia i mydła"`.

---

## Verification

- **Full Unit Test Suite:** `node --test src/modules/offer-optimizer-v2/tests/*.test.js` -> **264/264 PASS (0 failed, 0 skipped)** across all 14 test files (`orchestrator.test.js` 28/28, `gpsr.safety.test.js` 21 subtests + parent suite PASS, `validators.test.js` PASS incl. ADR-0174 tests).
- **Live End-to-End Verification (`EAN 8050999571724`, back-of-pack photo `media_1794299801058_8a5b28ef.jpg`):**
  - Vision OCR (`Agent 0` `gemini-3.8-flash`): Extracted legal English 648/2004 composition (`5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone)`), exact manufacturer warnings (`P101, P102, P103, EUH208 MCI/MI` without `BIT`), and exact usage instructions (`KOSZYK / ŚCIANKI WEWNĘTRZNE / GRZAŁKA`).
  - `gpsrSafety.generateGpsrWarnings`: Classified as `['HOUSEHOLD_CHEMICAL', 'EUH208_SENSITIZER']` (no dental floss hijack), preserved `EUH208` 1:1 (`MCI/MI` only).
  - Live `Agent 4` + `Agent 6` + deterministic S6 + `validate_domain_and_chemical_logic`: `{ valid: true, errors: [] }` — zero bathroom/limescale/soap leaks, zero `"dwufazowe odtłuszczanie"`, full electrical unplugging & cooling in `Krok 1` + `WYKLUCZENIE ZASTOSOWANIA`, plus liquid soap & generic detergent contrast checks passing.

