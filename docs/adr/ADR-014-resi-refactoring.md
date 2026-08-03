# ADR-014: Refaktoryzacja Modułu Resi (Wariant A - [DEPRECATED] Claid API - System został wyłączony, nie brać pod uwagę.)

## Kontekst i Problem
Moduł Resi służący do wycinania tła (rembg) z obrazów (Packshoty) był oparty o oddzielny serwer napisany w Pythonie (Flask + Waitress), który był obciążony licznymi problemami związanymi ze zużyciem pamięci (OOM - Out of Memory) na środowiskach chmurowych (szczególnie Hetzner/GCP). Dodatkowo generowało to problem utrzymywania dwóch oddzielnych backendów na portach 3001 (Node.js) oraz 5000 (Python), co utrudniało wdrożenie i spowalniało komunikację MTool.

## Podjęta Decyzja
Zgodnie z wytycznymi Zarządu (Wariant A), moduł Resi został zrefaktoryzowany tak, aby zintegrować się bezpośrednio w backendzie Node.js.

1. **Wyeliminowanie Pythona**: Moduł lokalny Python Flask został trwale zastąpiony przez Endpoint w Expressie (`/api/resi`). 
2. **[DEPRECATED] Claid API (System wyłączony)**: Zamiast lokalnego modułu AI (rembg), który wyczerpywał zasoby serwera (RAM/CPU), wykorzystano zewnętrzne potężne rozwiązanie. API to przetwarza zdjęcia, wycina z nich tło i odszumia przy zachowaniu idealnej krawędzi bez spadków jakości.
3. **Sharp do Kompozytowania**: Pobierane ze zdeprecjonowanego API zdjęcia są natychmiast modyfikowane przy użyciu biblioteki `sharp` w środowisku Node.js. Wymuszane są na nich odpowiednie marginesy (tzw. "padding"), wyśrodkowanie (contain/fit) na formacie pod platformę (np. 1500x1500px) i eksportowane w postaci zoptymalizowanego obrazu JPG/PNG. 
4. **Batch Processing z Ochroną 429**: Proces przetwarzania odbywa się paczkami z określoną maksymalną współbieżnością (`p-limit`, np. 5 na raz), co stanowi tarcze przed blokadą `429 Too Many Requests` API.
5. **Autentykacja Frontendu**: Frontend z iframe został przekonfigurowany na przekazywanie tokenu z powrotem do API przez URL Parameter (token param), po czym odpytuje Node.js z poprawnym nagłówkiem Authorization.

## Konsekwencje i Rezultaty
1. Zmniejszenie śladu pamięci (Memory Footprint) na maszynie produkcyjnej. Nie ma ryzyka zawieszenia serwera z powodu braku pamięci (OOM), co jest absolutnie krytyczne dla niezawodności instancji np. na OVH.
2. Zintegrowana architektura (Jeden Backend), brak kłopotliwych portów (5000 vs 3001) co diametralnie upraszcza Deployment Plan.
3. Testy uciążeniowe ("masywne obciążenie", 50+ plików) powiodły się pomyślnie. Serwer zachował płynność i nie przekroczył pułapu pamięci V8. Wystąpiły jedynie limitowania Rate-Limit od strony dostawcy API (429), które są łagodzone przez system współbieżności zaimplementowany w `resi.service.js`.

**Data i Podpis Agenta**: 20.07.2026, Antigravity AI
