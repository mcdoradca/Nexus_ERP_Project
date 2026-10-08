# ADR-0135: Przywrócenie Rygoru Kognitywnego ThinkingLevel.HIGH dla Pełnej Floty Agentów SDS

## Status
Zaakceptowany i Wdrożony (Status: PRODUCTION-READY)

## Kontekst i Problem
Moduł generowania i weryfikacji Kart Charakterystyki (SDS) stanowi fundament zgodności prawnej i bezpieczeństwa chemicznego systemu Nexus ERP (reżim prawny REACH 2020/878, CLP 1272/2008, BPR 528/2012, Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017).

Podczas porannej aktualizacji systemowej (ADR-0132), mającej na celu eliminację zdeprecjonowanych parametrów samplera (`temperature`, `top_p`), w ramach wstępnej kategoryzacji kognitywnej przypisano części agentów SDS obniżone poziomy wnioskowania (`ThinkingLevel: "LOW"` oraz `"MEDIUM"`):
- `sds.agent.js` otrzymał `thinkingLevel: "LOW"`
- `sds.vision.agent.js` otrzymał `thinkingLevel: "LOW"`
- `narrative.translator.agent.js` otrzymał `thinkingLevel: "LOW"`
- `administrative.auditor.js` otrzymał `thinkingLevel: "MEDIUM"`
- `semantic.arbiter.agent.js` otrzymał `thinkingLevel: "MEDIUM"`
- `sds.investigator.agent.js` otrzymał `thinkingLevel: "MEDIUM"`

Konsekwencją obniżenia głębokości myślenia była drastyczna redukcja wewnętrznego łańcucha wnioskowania (Chain-of-Thought) w modelach Gemini 3. Skutkowało to powierzchowną analizą wielostronicowych sekcji, ucinaniem tabel sekcji 3 i 8 oraz odrzuceniem generowanych kart przez zewnętrzny system audytorski weryfikacji chemicznej.

Audyt historii rewizji git potwierdził jednocześnie, że w treści merytorycznej promptów systemowych (`systemInstruction`, wytyczne ECHA, zakazy WGK/TRGS 510, nienaruszalna stopka ITALLUX) nie wprowadzono żadnych zmian – treść reguł prawnych pozostała w 100% nienaruszona od 18 września 2026 r.

## Decyzja Architektoniczna
Zgodnie z bezwzględnym nakazem biznesowym i audytorskim, moduł SDS nie podlega żadnym kompromisom kosztowym ani redukcjom budżetu myślenia.

Wdrożono poziom **`ThinkingLevel: "HIGH"`** dla **wszystkich 10 agentów roju SDS** bez żadnego wyjątku:
1. `sds.vision.agent.js` (Multimodal Vision Extractor) -> `HIGH`
2. `sds.agent.js` (Core Section Translator/Compiler) -> `HIGH`
3. `sds.investigator.agent.js` (Anomaly Investigator) -> `HIGH`
4. `sds.verifier.agent.js` (Legal Verifier & Compliance Gatekeeper) -> `HIGH`
5. `hazard.classification.auditor.js` (CLP/ADR Domain Expert) -> `HIGH`
6. `health.environment.auditor.js` (Toxicology & Ecotoxicology Expert) -> `HIGH`
7. `workplace.safety.auditor.js` (Occupational Safety & NDS Expert) -> `HIGH`
8. `administrative.auditor.js` (Formal & Section 16 Expert) -> `HIGH`
9. `narrative.translator.agent.js` (Official Polish Chemical Translator) -> `HIGH`
10. `semantic.arbiter.agent.js` (Numerical Integrity Arbiter) -> `HIGH`

## Weryfikacja
- Składnia wszystkich 10 plików agentów zweryfikowana poleceniem `node -c` (0 błędów).
- Testy walidacji schematu SDS i integracji RAG (`tests/sds.schema.validator.test.js`, `tests/sds.swarm_rag_compliance.test.js`): 13/13 PASSED.
- Testy regresyjne potoku (`src/modules/offer-optimizer-v2/tests/*.test.js`): 155/155 PASSED.
