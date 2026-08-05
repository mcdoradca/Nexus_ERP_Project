# ADR-035: Strategia odczytu logów (Produkcja vs Lokalne IDE) i pułapka dezinformacji

## Kontekst
Wielokrotnie podczas diagnozowania problemów, agenci AI (oraz deweloperzy) wpadali w pułapkę tzw. **"Cichego Zabójcy"**. Problem polegał na tym, że agent otrzymywał zgłoszenie od użytkownika (np. "Eksport nie zadziałał"), a następnie szukał błędu w plikach logów dostępnych w lokalnym systemie plików (np. przez `view_file` na plikach `Z:\Nexus_ERP_Project\logs\...`). 
Ponieważ środowisko IDE znajduje się na lokalnym komputerze (Windows), a rzeczywisty system, na którym użytkownik testuje aplikację, to chmura produkcyjna (Linux/OVH), lokalne pliki logów były **zawsze puste lub nieaktualne**.

To powodowało błędne wnioski:
- Agenci zakładali, że żądanie nigdy nie dotarło (błąd CORS / błąd frontendu).
- Agenci szukali "twardych blokad" (hard locks) w kodzie, których tam nie było.
- Prawdziwe błędy (np. wyjątki walidacji schematu Prisma rzucane asynchronicznie przez `EventBus` w tle) pozostawały niezauważone na żywym serwerze.

Ponadto, istniało ryzyko sprawdzania kodu/logów na gałęzi `staging` zamiast na głównej gałęzi `main`, na której faktycznie działa serwer, co potęgowało dezinformację.

## Decyzja (Instrukcja dla Agentów)

1. **ZAKAZ Ufania Lokalnym Logom przy Testach Produkcyjnych**: 
   Jeśli użytkownik zgłasza problem z działającym systemem (produkcja / OVH), masz ABSOLUTNY ZAKAZ opierania diagnozy wyłącznie na odczycie lokalnych plików logów (np. `logs/nexus-error-*.log` lub `logs/export-pipeline-*.log` na dysku). Zamiast tego MUSISZ odpytać żywy serwer o logi.

2. **Sposób Odpytania Produkcji o Logi**:
   Aby uzyskać prawdziwe logi prosto z serwera produkcyjnego, użyj narzędzia `run_command` i wykonaj:
   ```bash
   curl -s https://n-e-s.it/api/system/logs
   ```
   (Ten endpoint wywołuje w tle `pm2 logs` i zwraca ostatnie 300 linii wszystkich zdarzeń z serwera, omijając autoryzację na potrzeby szybkiej diagnozy).

3. **Priorytet Gałęzi `main`**:
   Wszelkie weryfikacje błędów na produkcji muszą być przeprowadzane na gałęzi `main` (a nie `dev` czy profilach `staging`), ponieważ to `main` jest wdrażany przez GitHub Actions (`deploy.yml`) na docelowy serwer OVH.

## Konsekwencje
Dzięki temu podejściu, błędy asynchroniczne rzucane np. z `mdm.service.js` czy z innych systemów EventBus są natychmiast widoczne dla Agenta (jako zrzut błędów PM2 i Winstona po stronie chmury), co skraca czas diagnozy z godzin do minut i chroni przed wymyślaniem fałszywych teorii o blokadach w kodzie.
