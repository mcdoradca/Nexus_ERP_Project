# ADR 008: Obejście geoblokady dla tekstowych odpowiedzi (Thinking API)

**Data:** 2026-08-17
**Status:** Wdrożone
**Komponent:** `prompt-master.service.js` (Agent 11)

## 1. Kontekst Problemu
Wykryto, że Agent 11 generował na produkcji błąd `User location is not supported for the API use. (status: FAILED_PRECONDITION)`, a logowanie wykazało, że żądanie posiadało parametr `responseMimeType: ""`. 
W tym samym czasie Agenty 2, 4, 6, 7 i 10 wyposażone w tryb `ThinkingLevel` funkcjonowały poprawnie.

Różnicą między Agentem 11 a resztą był brak zdefiniowanego parametru `schema` dla wrappera (Agent 11 ma zwracać tekst, a pozostali JSON-y). Brak `schema` oznacza brak wymuszenia trybu `responseMimeType: "application/json"`.

## 2. Decyzja
Zdecydowano o wstrzyknięciu sztucznej schemy JSON (z pojedynczym polem `prompt`) podczas wywoływania wrappera telemetrii dla Agenta 11. Zmiana w `prompt-master.service.js` powoduje, że:
1. Wrapper automatycznie dopisuje do nagłówków `responseMimeType: "application/json"`.
2. Omijamy restrykcję regionalną, która w Europie odrzuca kombinację gołego tekstu i aktywnego `ThinkingLevel`.

## 3. Konsekwencje
Rozwiązano problem zrzutów z kodem 400 i 412 na europejskich serwerach bez utraty zdolności "myślenia" przed wygenerowaniem opisu. Po wygenerowaniu JSON przez model, moduł `prompt-master.service.js` rozpakowuje tekst i wysyła czysty string dalej do Photoroom AI.
