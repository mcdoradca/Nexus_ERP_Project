# ADR-037: Gemini API IPv6 Geoblock Workaround (Node.js)

## 1. Kontekst i Przyczyna (What & Why)
- **Problem:** Silnik AI (Master Agent V2 oraz podlegli agenci: 1, 2, 11) sporadycznie zwracali błąd z Google Gemini API: `[400 Bad Request] User location is not supported for the API use` (Geoblocking).
- **Diagnoza:** Wykazano, że błąd występuje wyłącznie po stosie IPv6. Podsieć IPv6 przydzielona do serwera VPS (OVH) znajduje się na błędnej geolokalizacji w bazach Google, blokując zapytania (traktując je jako ruch ze strefy wykluczonej).
- **Ryzyko:** Od wersji Node.js 20, z powodu usprawnień sieciowych (*Happy Eyeballs*), moduły HTTP `fetch` (na których m.in. bazuje `@google/generative-ai`) domyślnie priorytetyzują pulę IPv6 (lub ścigają się w asynchronicznym połączeniu dual-stack). Skutkowało to nieregularnymi awariami agentów.

## 2. Rozwiązanie (How)
- Kategorycznie zakazano modyfikacji kodu źródłowego (`server.js`, podmienianie instancji `fetch/axios`), aby uniknąć redundancji.
- Zmiana musiała być bezstratna dla pozostałych (działających) 5 agentów, nie wyłączając w pełni obsługi IPv6 na serwerze (co groziłoby uszkodzeniem innych usług systemowych).
- Zastosowano natywne obejście na poziomie runtime'u Node.js.

### Wdrożenie
1. Zmiana priorytetyzacji resolvera DNS w `glibc` na preferencję IPv4:
   Dopisano klauzulę `precedence ::ffff:0:0/96 100` w pliku systemowym `/etc/gai.conf`.
2. Zastosowano środowiskową modyfikację gniazd dla całej grupy agentów w demonie PM2:
   Wstrzyknięto dyrektywę `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"` jako stałą regułę uruchomieniową dla procesu `nexus`.

## 3. Plan Wycofania (Rollback / Disaster Recovery)
W przypadku przyszłych kolizji po aktualizacjach Node.js:
- Skasować dopisek z `/etc/gai.conf`.
- Przepisać środowisko V8: `pm2 restart nexus --env NODE_OPTIONS="" --update-env` i wykonać `pm2 save`.
- Awaryjne przywrócenie całkowite bazy PM2: `cp ~/nexus-backup/dump.pm2.bak.* ~/.pm2/dump.pm2 && pm2 resurrect`.

## 4. Akcje po stronie zewnętrznej (Zależności)
Wygenerowano dwa zgłoszenia do zewnętrznych Providerów w celu trwałego rozwiązania trasy BGP / geolokacji:
- Raport do **Google (Gemini / AI Studio)** przez narzędzie *Report IP problems*.
- Ticket techniczny do **OVH** (weryfikacja broadcastu regionalnego ASN dla podsieci `2001:41d0:305:2100::/64`).
