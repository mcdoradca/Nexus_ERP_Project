# ADR-0122: Fizykochemiczna Sanacja Ostrzeżeń GPSR dla Alkoholi i Wdrożenie Standardu A.I.S.E. / CLP dla Kapsułek do Prania

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-09-30

## Kontekst i Zgłoszony Błąd Merytoryczny
W module generowania ostrzeżeń bezpieczeństwa GPSR dla kapsułek do prania (laundry capsules/pods) wygenerowano ostrzeżenie przeciwpożarowe: *"Produkt zawiera alkohol. Przechowywać z dala od otwartego ognia i bezpośrednich źródeł ciepła."*.
Przypisanie ostrzeżeń o łatwopalności kapsułkom piorącym stanowiło rażący błąd dziedzinowy (chemometrics / consumer safety) wynikający z mechanicznego potraktowania słowa `alcohol` w składzie. Kapsułki piorące zawierają polialkohol winylowy (`polyvinyl alcohol` / PVA – rozpuszczalna folia otoczki) oraz surfaktanty i emulgatory (alkohole tłuszczowe i etoksylowane), które w wyrobie gotowym są ciałami stałymi lub nielotnymi roztworami wodnymi, nie stwarzającymi zagrożenia pożarowego.

## Podjęte Decyzje Architektoniczne

1. **Przebudowa Heurystyki w `GpsrSafetyService` (`gpsr.safety.service.js`):**
   - **Biała lista nielotnych alkoholi (`nonFlammableAlcohols`):** Zdefiniowano listę alkoholi polimerowych i tłuszczowych (`polyvinyl alcohol`, `cetyl alcohol`, `cetearyl alcohol`, `stearyl alcohol`, `behenyl alcohol`, `myristyl alcohol`, `benzyl alcohol`, `c12-15 pareth`), które są bezwzględnie wykluczone z klasyfikacji jako lotne/łatwopalne.
   - **Blokada kategorialna:** Wprowadzono zakaz kwalifikowania detergentów piorących (kapsułki, płyny, żele do prania) oraz produktów wodnych/emulsji jako łatwopalne. Ostrzeżenia o łatwopalności rezerwowane są wyłącznie dla aerozoli ciśnieniowych (propan/butan) i produktów spirytusowych (perfumy/EDT, zmywacze, bioetanol, środki do dezynfekcji >60% alkoholu).
   - **Dedykowany Moduł Kapsułek do Prania (Rozporządzenie Komisji (UE) nr 1297/2014 & Standard A.I.S.E.):**
     Dla kapsułek piorących generowany jest urzędowy zestaw ostrzeżeń bezpieczeństwa:
     * `P102: Chronić przed dziećmi.`
     * `Nie połykać. W razie połknięcia natychmiast skontaktować się z ośrodkiem zatruć lub lekarzem.`
     * `Stosować suchymi dłońmi. Nie przekłuwać, nie rozrywać i nie rozcinać kapsułki. Szczelnie zamykać opakowanie po użyciu.`
     * `P305+P351+P338: W przypadku dostania się do oczu: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.`
     * Informacja o obecności alergenów zapachowych (jeśli występują w kompozycji zapachowej).

2. **Domenowy Sanity Check dla Agenta 5 (`Agent_5_compiled.md` & `Agent_5_prompt_v4.md`):**
   - Do Dyrektywy 4 wprowadzono twardą regułę adekwatności fizykochemicznej.
   - Zakazano Agentowi 5 bezkrytycznego przepisywania ostrzeżeń pożarowych dla chemii piorącej i kosmetyków emulsyjnych.
   - Nakazano priorytetyzację unijnych zasad A.I.S.E. dla kapsułek i ochrony dzieci (P102).

## Weryfikacja
- Rozszerzono `src/modules/offer-optimizer-v2/tests/gpsr.safety.test.js` o testy kapsułek do prania z `Polyvinyl Alcohol` (potwierdzenie braku ostrzeżeń pożarowych, obecność reguł A.I.S.E. i P102) oraz kosmetyków z `Cetearyl Alcohol`.
- Pełna regresja: 132/132 testy PASSED (100% spójności).
