# ADR-0126: Poprawność Językowa, Higiena Typograficzna i Eliminacja Redundancji w Sekcji GPSR / CLP

## Status
Zaakceptowany (Accepted)

## Kontekst
W wyjściowych opisach ofert generowanych w module `offer-optimizer-v2` w Sekcji 6 (⚠️ Bezpieczeństwo i informacje GPSR) zaobserwowano powtarzające się anomalie językowe, interpunkcyjne i semantyczne:
1. **Błąd gramatyczny / archaizm fleksyjny**: Występowanie przestarzałej i niepoprawnej formy dopełniacza liczby mnogiej rzeczownika „oko”: *„W PRZYPADKU DOSTANIA SIĘ DO OCZÓW:”* zamiast poprawnej formy *„DO OCZU”*.
2. **Zbite, podwójne dwukropki**: W liście punktowanej etykieta `<b>Ostrzeżenie CLP/GPSR:</b>` kończyła się dwukropkiem, a z bazy wiedzy SDS/CLP wstrzykiwane były kody zwrotów z dwukropkiem (np. `P102: Chronić przed dziećmi.`, `P305+P351+P338: W PRZYPADKU...:`), co tworzyło nieestetyczne sekwencje: `<b>Ostrzeżenie CLP/GPSR:</b> P102: ...`.
3. **Semantyczna redundancja i dublowanie treści**:
   - Szablon promptu Agenta 6 we wstępnym akapicie `<p>` wymuszał frazę *„Przechowywać poza zasięgiem dzieci.”*, podczas gdy lista punktowana powtarzała to samo jako *„P102: Chronić przed dziećmi.”*.
   - W przypadku chemii gospodarczej zawierającej surfaktanty reguła ogólna dodawała zdanie *„W przypadku dostania się produktu do oczu natychmiast przepłukać...”*, a reguła chemiczna dodawała oficjalny zwrot CLP *„P305+P351+P338: W PRZYPADKU...”*, dublując niemal identyczną instrukcję dla konsumenta.

## Decyzja Architektoniczna
Wprowadzono wielowarstwową ochronę jakościową obejmującą bazę wiedzy SSOT, serwis domenowy GPSR, prompty Agenta 6 oraz deterministyczną tarczę sanitizującą w Orkiestratorze:

1. **Poprawka SSOT EuPhraC (`euphrac_ssot.json`)**:
   - Skorygowano oficjalne zwroty w słowniku: `P305` oraz `P305+P351+P338` z *„W PRZYPADKU DOSTANIA SIĘ DO OCZÓW:”* na *„W PRZYPADKU DOSTANIA SIĘ DO OCZU:”*.
2. **Refaktoryzacja `GpsrSafetyService` (`gpsr.safety.service.js`)**:
   - Zastąpienie dwukropków po kodach P/H półpauzą: `P102 – Chronić przed dziećmi.`, `P305+P351+P338 – ...`.
   - Zabezpieczenie przed dublowaniem ostrzeżeń o oczach: ogólna reguła surfaktantów jest pomijana dla chemii gospodarczej i kapsułek piorących, gdyż nadrzędny priorytet ma precyzyjny zwrot CLP P305.
   - Wdrożenie tarczy fleksyjnej `.replace(/\bDO OCZÓW\b/gi, 'DO OCZU')` przy pobieraniu z bazy.
3. **Rozszerzenie Roli Agenta 6 (Master Copywriter & Redaktor Językowy)**:
   - Do promptów `Agent_6_compiled.md` oraz `Agent_6_prompt_v4.md` wprowadzono rolę Redaktora Językowego odpowiedzialnego za kulturę i czystość języka polskiego.
   - Wprowadzono twarde dyrektywy: zakaz podwójnych dwukropków, zakaz archaizmów deklinacyjnych, obowiązek deduplikacji zaleceń między akapitem `<p>` a listą `<li>`.
4. **Deterministyczna Tarcza Sanitizująca w Orkiestratorze (`orchestrator.js`)**:
   - Zaimplementowano funkcję `sanitizeSection6Html`, która wykonuje się deterministycznie przed zamrożeniem hashy (`hashS6`):
     - Zamiana podwójnych dwukropków: `(<b>...:</b>\s*)([A-Z0-9+]+):` -> `$1$2 –`.
     - Likwidacja zbitek `::` -> `:`.
     - Korekta fleksyjna `DO OCZÓW` -> `DO OCZU` we wszystkich sekcjach opisu (1..6).
     - Usunięcie zduplikowanego zdania o dzieciach z akapitu `<p>`, jeśli na liście występuje P102.
     - Usunięcie ogólnego ostrzeżenia o oczach z listy `<li>`, jeśli występuje zwrot CLP P305.

## Konsekwencje i Korzyści
- Opisy w Allegro / Baselinkerze posiadają wzorcową typografię, brak powtórzeń i pełną zgodność z zasadami języka polskiego.
- Wyeliminowano ryzyko halucynacji lub przeoczenia błędów interpunkcyjnych przez LLM dzięki deterministycznej tarczy kodowej.
- Wszystkie testy jednostkowe (`gpsr.safety.test.js`, `orchestrator.test.js`) przechodzą w 100%.
