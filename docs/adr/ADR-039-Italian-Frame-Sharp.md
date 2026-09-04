# ADR 039: Wdrożenie Włoskiej Ramki za pomocą Sharp

## Kontekst
W ramach rozbudowy centrum marketingowego MTool HQ, użytkownicy zgłosili zapotrzebowanie na funkcję szybkiego, wizualnego nakładania tzw. "Włoskiej Ramki" (trójkolorowej flagi narodowej Włoch) na obrzeża wgrywanych zdjęć. Koniecznością była również możliwość regulowania jej grubości na froncie.

Standardowym podejściem mogłoby być wydelegowanie obróbki obrazu do skryptu w Pythonie, jednak wprowadzenie zewnętrznych procesów zwiększyłoby obciążenie I/O, wydłużyło czas odpowiedzi API i skomplikowało warstwę infrastrukturalną.

## Decyzja
Zdecydowano się zaimplementować generator "Włoskiej Ramki" całkowicie natywnie w środowisku Node.js z wykorzystaniem szybkiego silnika `sharp`.

**Technikalia rozwiązania:**
1. Zamiast manualnie iterować przez piksele obrazu wejściowego, system generuje w locie wektorowy dokument SVG. Maska ta zawiera dokładne wymiary (1:1) zdjęcia oraz precyzyjne odzwierciedlenie pasków włoskiej flagi (zielony, biały, czerwony).
2. Generowany dokument SVG jest następnie stosowany jako nakładka (composite) za pomocą modułu `sharp` bezpośrednio na bufor przesłanego obrazu.
3. Parametr grubości krawędzi jest pobierany na bieżąco z interfejsu (slider na froncie) i bezpośrednio przeliczany na atrybuty `width`/`height` poszczególnych bloków (rect) w masce wektorowej.

## Konsekwencje
- **Wydajność:** Osiągnięto niemal natychmiastowe (podsekundowe) renderowanie zdjęć, całkowicie operujące w pamięci RAM. Uniknięto narzutów wydajnościowych związanych z opóźnieniami startupu podprocesów w środowisku uruchomieniowym.
- **Koszt utrzymania:** Zlikwidowano ryzyko problemów z brakiem pakietów, wirtualnych środowisk i zależności, utrzymując lekki obraz kontenerowy bez wymogu dodawania środowiska Pythona z biblioteką Pillow do przetwarzania grafiki.
- **Rozszerzalność:** Ten sam wzorzec z maskowaniem SVG w `sharp` otwiera drogę do nakładania dowolnych skomplikowanych filtrów nakładkowych i ramkowych w aplikacji (Shadow Baking itp.) w przyszłości.
