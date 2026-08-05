# ADR 036: Deterministyczny Eksport BaseLinker V2 (Zastąpienie LLM)

## Status
Zatwierdzony i wdrożony (Sierpień 2026)

## Kontekst
System do tej pory opierał eksport danych do systemu BaseLinker na agencie AI (`BaselinkerExportAgent`). Zadaniem agenta było mapowanie 7 wygenerowanych sekcji opisu HTML (w tym specyficznego pola extra_field_4245) na słownik zgodny z wymogami BaseLinker API. 
To podejście okazało się niestabilne i podatne na "halucynacje" AI. LLM często "tłumaczył" parametry zamiast przepisać je 1:1 ze słownika Allegro, pomijał znaczniki HTML, i nie zawsze zachowywał spójność sekcji. Dodatkowo nie istniał mechanizm weryfikacji i optymalizacji zdjęć wklejanych pod konkretne indeksy.

## Decyzja
Zrezygnowano z agenta AI (`baselinker_export_agent.md`) na rzecz autorskiego, deterministycznego serwisu: `baselinker.export.service.js`.

Nowa architektura eksportu wprowadza bezwzględne reguły:
1. **Sztywna mapa sekcji:** Pola od 1 do 4 wpadają w odpowiednie `description`, pola 5 i 6 są łączone w `description_extra4`, a pole 7 wędruje wyłącznie do `extra_field_4245`.
2. **Czyszczenie Tytułów (GEO):** W tytule bezwzględnie wycinane są 4-bajtowe emoji przed wysłaniem pod klucz `name|pl|allegro_...`.
3. **Konwersja Emoji (HTML Entities):** W opisach HTML emoji są transformowane na bezpieczne encje (np. `&#x1F60A;`) chroniąc bazę BaseLinkera (utf8).
4. **Złota zasada Parametrów:** Cechy (features) pochodzące wprost z API Allegro są wklejane 1:1, bez modyfikacji i interpretacji, gwarantując 100% zbieżność słownika.
5. **Obsługa Zdjęć:** Dodano mechanizm omijania martwych slotów (CDN BaseLinker) oraz wstrzykiwania głównego zdjęcia (`product.imageUrl`) na indeks `"0"`, z wykorzystaniem biblioteki `sharp` do zbijania wagi poniżej 1.9MB (limit BaseLinker).

## Konsekwencje
### Pozytywne
- Wyeliminowano halucynacje i niezgodności słownika Allegro na BaseLinker.
- Szybszy czas odpowiedzi (brak oczekiwania na generację od modelu AI).
- Pewność przypisania głównego zdjęcia do indeksu `"0"`.
- Ochrona krytycznych danych (ceny, stany magazynowe) przez użycie mechanizmu partial update w BaseLinker API (`addInventoryProduct`).

### Negatywne
- W przypadku zmiany struktury szablonu w BaseLinkerze (dodanie nowych sekcji), konieczna będzie programistyczna zmiana mapowania w pliku `baselinker.export.service.js` (brak elastyczności LLM).
