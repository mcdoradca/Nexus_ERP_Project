# ADR-038: Multimodalny Agent 11 (Prompt Master) i Nowy Standard Photoroom (SSOT 6.0)

## Kontekst i Problem
Dotychczasowy mechanizm generowania promptów w tle dla silnika Photoroom (realizowany przez Agenta 11 w `prompt-master.service.js`) wymuszał na modelu sztuczne usytuowanie produktu ("w całkowicie losowym miejscu w trzeciej linii lub w tle"). Taka konstrukcja powodowała, że API graficzne gubiło kontekst produktu, co skutkowało niską jakością, nienaturalnym pozycjonowaniem i "koszmarnymi" wizualnie kompozycjami (problemy ze skalowaniem maski, utrata fotorealizmu). Ponadto Agent LLM operował wyłącznie w oparciu o suche dane z PIM, nie mając wglądu w wygląd samego produktu.

## Decyzja (Zgodnie z wytycznymi SSOT 6.0)
Wdrożyliśmy całkowitą przebudowę potoku dla zdjęć lifestylowych (Agent 11):

1. **Multimodalność (Wzrok Agenta):** Agent 11 w `prompt-master.service.js` otrzymuje teraz w formacie `inlineData` (Base64) oryginalny obraz wejściowy. Dzięki temu polecenie oparte o frazę "produkt ze zdjęcia referencyjnego" pozwala AI dokładnie zrozumieć perspektywę i kształt obiektu.
2. **Ekstrakcja Modułu 3 (Detale):** Poszerzyliśmy zasilanie z bazy PIM w `photoroom.service.js`. Zamiast suchych parametrów, model otrzymuje treść draftu z *Sekcji 3* (Detale), w której to copywriter wygenerował pożądane konteksty, emocje oraz wymienione składniki.
3. **Konstrukcja Dwuplanowa z Bokeh:** System Prompt narzuca nową, sztywną architekturę kompozycji (bez wyśrodkowania, bez efektu zoomu). Pierwszy plan ma być atrakcyjny i wyraźny (składniki, owoce, tekstury), natomiast produkt docelowy znajduje się na planie drugim, wtopiony asymetrycznie za pomocą mgiełki lub naturalnego rozmycia tła (bokeh). Ukrywa to niedoskonałości generowania etykiet i daje efekt profesjonalnego lifestylu.
4. **Usunięcie Sztywnych Przedrostków:** Dotychczasowy kod bezpieczeństwa `MANDATORY_PREFIX` wymuszający na Photoroom zachowanie oryginału został zredukowany do pustego ciągu (`""`), by pozostawić system w pełni elastycznym, lecz szkielet pod ewentualny "fallback" został w kodzie utrzymany. Model zablokowano również w trybie ekstrakcji czystego tekstu wewnątrz ramki JSON.

## Konsekwencje
System Photoroom V2 zaczął produkować ultra-fotorealistyczne, głębokie (dwuplanowe) kompozycje, w których produkt bazowy ukazuje się jako naturalny element bogatego tła emocjonalnego wywiedzionego bezpośrednio z copywritingu (Moduł 3). Wdrożenie obrazu (multimodalności) na poziomie prompt-mastera znacząco zwiększyło precyzję umiejscowienia detali w wygenerowanej scenie.
