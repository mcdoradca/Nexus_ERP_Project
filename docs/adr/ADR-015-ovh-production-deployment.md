# ADR-015: Wdrożenie na serwer produkcyjny OVH (Node.js Monolith, PM2, Nginx, SSL)

## Kontekst
System Nexus ERP potrzebował stabilnego, przewidywalnego, i niedrogiego środowiska uruchomieniowego po problemach z brakiem pamięci na rozwiązaniach dedykowanych pod Python. Osiągnięto to przenosząc logikę do Node.js (moduł Resi oparty na `sharp` i batchingu przez p-limit) oraz kupując i konfigurując dedykowaną maszynę VPS-2 w OVHcloud. Konieczne było zdefiniowanie docelowej architektury produkcyjnej: Node.js (backend na porcie 3001) + Vite (frontend zbudowany lokalnie), wystawione za pomocą rewers-proxy (Nginx) zabezpieczonym za pomocą SSL (Let's Encrypt).

## Decyzja
Zdecydowano na wdrożenie aplikacji w układzie monolitycznym (frontend i backend obsługiwane z tego samego repozytorium) na platformie Linux Ubuntu 26.04 VPS (OVH).
Zdefiniowano następujące technologie i komponenty utrzymaniowe:
1. **Nginx** - Jako serwer proxy odwracający, mapujący subkatalog `/api/` na wewnętrzny port Node.js `3001` oraz serwujący wygenerowane pliki statyczne frontend-u (`dist`) bezpośrednio dla głównej lokalizacji `/`.
2. **PM2** - Jako menedżer procesów demonizujący i pilnujący ciągłości działania aplikacji backendowej (autostart po padzie zasilania systemu - `pm2 startup`).
3. **Let's Encrypt (Certbot)** - Do w pełni zautomatyzowanego uzyskiwania certyfikatów SSL dla podpiętej domeny `n-e-s.it` (i subdomeny `www`).
4. **Git** - Wdrożenia aktualnie wykonywane są poprzez transfer paczki archiwum i rozpakowywanie go, jednak docelowym mechanizmem jest pull ze zdalnego brancha Github.

## Status
Zaakceptowane i wdrożone.

## Konsekwencje
### Pozytywne
- **Niezawodność**: Nginx zdejmuje obciążenie utrzymania plików statycznych i SSL z aplikacji Node.js, która zajmuje się tylko ruchem API.
- **Bezpieczeństwo**: Aplikacja operuje w izolowanym katalogu (`/var/www/nexus`) zarządzanym przez non-root użytkownika, UFW domyślnie blokuje wszystko poza 22, 80 i 443.
- **Utrzymanie**: Menedżer PM2 oraz certbot potrafią automatycznie reagować na restarty systemu i wygasanie certyfikatów bez ingerencji manualnej.

### Negatywne / Ryzyka
- Brak pełnej automatyzacji CI/CD od razu - na ten moment wrzucanie nowych zmian na serwer musiało być zrobione rsync'iem / SCP (wymaga implementacji np. GitHub Actions).
- Współdzielenie 1 adresu IP w wypadku chęci stawiania wielu instancji mikroserwisów wymagałoby ostrożnego mapowania portów na serwerze i kolejnych konfiguracji Vhost w Nginx.
