# ADR 006: Zabezpieczenie integralności autoryzacji Głównego Administratora

## Status
Zatwierdzony i wdrożony

## Kontekst
Występował krytyczny błąd logowania (`401 Unauthorized`) na froncie aplikacji dla głównego konta `admin@n-e-s.it`. Logi zrzucone z Axios jasno wskazywały na niespójność uwierzytelnienia. W procesie głębokiej diagnozy udowodniono, że hasło przetrzymywane w zmiennych środowiskowych `.env` (`1v822x3vSM`) nie pokrywało się z hashem bcrypt w głównej bazie danych Prisma. Najprawdopodobniej wektor błędu leżał w historycznym wykonaniu skryptu narzędziowego `reset-admin.js`, który nadpisywał hasło administracyjne wartością "admin123", powodując trwałą desynchronizację w środowisku developerskim/produkcyjnym. Dodatkowo uruchomienie środowiska deweloperskiego `npm run dev` natrafiało na błąd `EADDRINUSE`, spowodowany przez "osierocone" procesy node i waitress (porty 3001, 5000), które należało ubić z poziomu terminala.

## Decyzja
Zdecydowano o twardym przywróceniu hasha dla `admin@n-e-s.it` wprost na wartość ze słownika środowiskowego `.env`. Wykonano skrypt awaryjny re-hashujący bezpośrednio na instancji Prisma. Odrzucono próby używania ogólnych skryptów w katalogu projektu, aby wykluczyć dalszą nadpisywalność błędnymi danymi. Zarządzono także obligatoryjną "chirurgiczną" pacyfikację portów 3001/5000 za pomocą komendy `taskkill` w środowisku Windows, umożliwiając prawidłowy binding gniazd nasłuchujących dla Express.js i Waitress.

## Konsekwencje
System odzyskał 100% dostępu do środowiska administracyjnego z prawidłowym statusem HTTP 200 na endpoincie `/api/auth/login`. Serwer deweloperski poprawnie budzi się i kompiluje usługi bez naruszeń gniazd TCP. Konieczne jest zachowanie ostrożności w przypadku używania zewnętrznych narzędzi typu `reset-admin.js` by unikać podobnych dryfów kontekstowych w bazie w przyszłości.
