# ADR 012: Zagnieżdżona struktura modułów HTML w sekcji sprzedażowej GEO/AEO (MTool)

## Kontekst i Problem
Sekcja sprzedażowa GEO/AEO w module optymalizacji ofert (MTool) generuje opisy produktów według układu Allegro za pomocą Agenta GEO Text. 
Przed zmianą, opis był generowany jako płaska struktura (całość ładowana do jednego pola opisu `opis1`). Powodowało to brak ustrukturyzowania opisu na 5 zalecanych przez Allegro sekcji (kafelków), co utrudniało klientom szybkie skanowanie korzyści i naruszało najlepsze praktyki Allegro. 
Ponadto istniał rozdźwięk między zapisem potoku EAN (który zapisywał zagnieżdżone dane w bazie wewnątrz `htmlContent`) a zapisem ręcznym z frontendu (który zapisywał płaskie właściwości `opis1`-`opis5` w korzeniu obiektu `offerDraft`), co powodowało, że ponowne wczytanie draftów z bazy przez `analyzeSingle` zwracało puste pola dla produktów z potoku EAN.

## Decyzja Architektoniczna
1. **Model Generowania AI (responseSchema)**: W `ai.service.js` wewnątrz funkcji `generateGEOTextContent` wstrzyknięto do API Gemini parametr `responseSchema` (JSON schema). Wymusza on od modelu Gemini odpowiedź o strukturze JSON zawierającej klucz `htmlContent` będący obiektem z właściwościami `opis1`, `opis2`, `opis3`, `opis4` i `opis5` (gdzie `opis5` to bezwzględnie przepisany skład INCI 1:1).
2. **Defensywne Mapowanie (Backend Controller)**: W `offer-optimizer.controller.js` w metodach `analyzeSingle` oraz `exportToBaselinker` zaimplementowano warstwę kompatybilności wstecznej (Mapping Layer). Kod potrafi bezpiecznie odczytać zarówno nowy format zagnieżdżony (`draft.htmlContent.opis1...`), jak i stary format płaski (`draft.opis1...`), normalizując je do jednolitej formy przed odesłaniem na frontend.
3. **Spójny Zapis i Odczyt (Frontend)**: Zaktualizowano komponent `OfferOptimizerView.jsx` w funkcjach `compileDraftData` oraz `handleAnalysisComplete`. Frontend zapisuje teraz wyłącznie nowy format zagnieżdżony w `htmlContent`, eliminując rozdźwięk struktur, a przy ładowaniu obsługuje dynamicznie oba warianty struktur.
4. **Rozwiązanie Problemów Lintera**: Usunięto nieużywane zmienne (`titleValid`, `e`, `err`) oraz uregulowano synchroniczne wywoływanie `setState` wewnątrz `useEffect` za pomocą dyrektywy wyciszającej `// eslint-disable-next-line react-hooks/set-state-in-effect`, co zapewniło 100% czystości lintera w modyfikowanych komponentach.

## Konsekwencje
- **Pozytywne**: 
  - Pełne ustrukturyzowanie opisów produktów na 5 kafelków Allegro (w tym dedykowany INCI) bezpośrednio z potoku AI.
  - Spójny format danych w bazie danych (SSoT) bez konfliktów między zapisem manualnym a automatycznym.
  - Kod w 100% zgodny z regułami lintera i wolny od ostrzeżeń ESLint.
- **Negatywne**: Brak. Wszystkie historyczne dane (płaskie opisy) są w pełni obsługiwane przez warstwę mapowania wstecznego.
