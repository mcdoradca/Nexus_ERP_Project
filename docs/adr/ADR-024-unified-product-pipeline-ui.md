# ADR-024: Unifikacja Architektury UI (PIM & Agent Supervisor)

## 1. Kontekst i Problem
Dotychczasowy proces dodawania i edycji produktów w systemie (Karta PIM) opierał się na rozbudowanym modalu (`isNewProductModalOpen`), który wymuszał liniowe zarządzanie poszczególnymi właściwościami produktu (Ceny, Cło, Logistyka, Tytuł). W miarę wzrostu funkcji systemu i rosnącej roli Agenta EAN Pipeline (Supervisor Agent), interfejs użytkownika stawał się coraz bardziej chaotyczny ("okienka w okienkach", wielokrotne powielone przyciski akcji).
Dodatkowo przycisk "Generuj AEO" został umieszczony w głównej tabeli produktów, co prowadziło do fragmentacji procesu pracy. Użytkownik musiał operować na kilku widokach jednocześnie, co obniżało UX i zagrażało płynności działania całego Rurociągu EAN.

## 2. Rozważane Alternatywy
1. **Dalsze rozbudowywanie Modala (odrzucono):** Powiększanie Modala o kolejne karty doprowadziłoby do drastycznego spadku wydajności (Fixed Layout) i zablokowania nawigacji na ekranach 13-14 cali. Brak przestrzeni dla panelu pracującego Agenta AI.
2. **Całkowita Separacja Narzędzi (odrzucono):** Trzymanie PIM i EAN Pipeline na różnych, niepołączonych zakładkach wymuszało zbyt wiele kliknięć.
3. **Stworzenie ujednoliconego kokpitu "Unified Product Pipeline View" z podziałem Grid (odrzucono przez użytkownika):** Podział na lewą kolumnę PIM i prawą Agentową ukrywał zbyt wiele danych i zakłócał ciągły przepływ pracy w dół strony.
4. **Wertykalny, jednolity widok Pipeline & PIM (wybrano):** Dedykowany, nowo zaaranżowany widok w postaci pojedynczej, przewijanej kolumny, pozwalający na liniową, kaskadową edycję - od panelu Agenta (na górze) po parametry strukturalne i logistyczne PIM (na dole).

## 3. Decyzja
Postanowiono o całkowitym usunięciu komponentu Modala `isNewProductModalOpen` z warstwy nadrzędnej `App.jsx`. W jego miejsce wprowadzono nowy widok – `UnifiedProductPipelineView.jsx`. 
Decyzje architektoniczne:
* **Separacja logiki widoków:** Widok PIM (Katalog SKU) nie wywołuje już ukrytych stanów modalnych wewnątrz `App.jsx`, a zamiast tego zmienia stan górnego stopnia na `activeTab = 'unifiedHub'`.
* **Podział ekranu (Wertykalny Przepływ):**
    * Zrezygnowano z układu Grid (dwie kolumny) na rzecz jednego przewijanego ekranu.
    * **Góra:** Środowisko pracy Supervisor Agenta (EAN Pipeline). Zawiera moduły audytora wizyjnego, walidatora tytułu oraz edytora StrictWysiwyg dla generowanego kodu HTML.
    * **Dół:** Surowy interfejs Kartoteki PIM (Atrybuty, Ceny, Cło, Gabaryty). Dodano tu bezpośrednio przycisk "Generuj AEO", usunięty uprzednio z widoku tabelarycznego.
* **Sekwencyjność akcji:** Wprowadzono jeden połączony Trigger ("Zapisz PIM i Uruchom Agenta"). Eliminuje to ryzyko, że Agent EAN zacznie pracę zanim zaktualizowany PIM spłynie do relacyjnej bazy PostgreSQL (wymagane bezpieczne przekazanie parametru EAN).

## 4. Konsekwencje i Skutki
### Pozytywne:
* Osiągnięto architekturę określaną mianem Single Source of Truth w środowisku User Experience dla produktyzacji bazy. 
* Cały cykl życia SKU, od definicji pudełka po generację opisów SEO oraz zatwierdzanie zdjęć (HitL), odbywa się na tym samym ekranie.
* Wyeliminowano problem zakładek i nawigowania pomiędzy widokami podczas optymalizowania jednego produktu.

### Negatywne:
* Plik `UnifiedProductPipelineView.jsx` stał się relatywnie obszerny, grupując dużą ilość stanów (ponad 1000+ linii kodu, obejmując formularze bazy oraz Agenta). W przyszłości (Phase 3+) komponent ten prawdopodobnie będzie wymagał dekompozycji na mniejsze pliki `PimForm.jsx` oraz `PipelineSupervisorAgent.jsx`.

## 5. Zgodność
Architektura w 100% dostosowana do protokołu End-to-End Delivery Agentów AI (bezobsługowy proces od A do Z, ujednolicona nawigacja React + TailwindCSS, z uwzględnieniem dotychczasowego stacku `axios`).
