# Uszczelnienie bramek i kanonizacja nazw składników (Zadanie 31B)

Plan realizuje dyrektywę architektoniczną likwidującą luki bramek GATE-1/2, gdzie zanieczyszczenia spacjami czy kropkami przepuszczały zakazane substancje. Wprowadza reguły deterministycznego usuwania znaków interpunkcyjnych (kanonizacja).

## User Review Required
- Implementowana poprawka rygorystycznie modyfikuje bramki. Wprowadziłem funkcję `canon` do `validators/index.js` i od teraz mechanizm detekcji korzysta ze ścisłego porównywania skanonizowanych form w oparciu o polecenia `canon(wpis)` oraz `canon(pozycja).includes(canon(wpis))`.

## Proposed Changes

### `validators/index.js` (Bramki GATE-1 i GATE-2)
- **[MODIFY] [validators/index.js](file:///Z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/validators/index.js)**: 
  - Wstrzyknięcie lokalnej funkcji `canon(s)` wg definicji `s.toLowerCase().replace(/[^a-z0-9]/g, '')`.
  - Modyfikacja pętli bramkującej `gate_ingredients`, w której każdy sprawdzany wpis INCI będzie iterowany w zestawieniu ze skanonizowaną listą `gate1` oraz `gate2`.
  - Zastosowanie reguły dwu-stopniowego dopasowania.

### `tests/gate.test.js`
- **[MODIFY] [tests/gate.test.js](file:///Z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/gate.test.js)**
  - Implementacja nowych 7 wariantów testowych z Kroku 3 i weryfikacja regresji istniejących 31 asercji testowych.

## Verification Plan

### Manual Verification
- Wygenerowanie finalnego raportu z diagnozą i odpowiedziami do "sprzeczności liczb RAG".
- Wykonanie `npm test` i dostarczenie 100% sprawności asercji bramek bez rozluźniania list.
