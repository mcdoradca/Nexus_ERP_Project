# Zgłoszenie: OVH Support (Ticket)

**Tytuł zgłoszenia (Temat):**
Błędna geolokalizacja (Geoblocking) przypisanej podsieci IPv6 w infrastrukturze Google

**Treść zgłoszenia (Do wklejenia w panelu BOK OVH):**

Dzień dobry,

Zgłaszam problem z rozgłaszaniem lub kategoryzacją przypisanej nam podsieci IPv6 dla serwera VPS. 
Obecnie usługi Google (konkretnie API Google Gemini / AI Studio) blokują cały nasz ruch wychodzący realizowany po protokole IPv6, zgłaszając błąd geolokalizacji: "User location is not supported for the API use" (Kody błędu HTTP 400 / 403 wskazujące na ruch z terytorium objętego sankcjami lub nieobsługiwanego).

Ruch wychodzący z tego samego serwera po przypisanym adresie IPv4 (145.239.73.39) trafia do Google poprawnie i jest autoryzowany z właściwą lokalizacją geograficzną (EU).

**Dane techniczne usługi:**
- Przypisany IPv4 (Poprawny / Działający): 145.239.73.39
- Przypisany IPv6 (Błędnie oznaczony w rejestrach / BGP): 2001:41d0:305:2100::1:36c2 (oraz cała pula /64)
- Destynacja, na której występuje Geoblock: generativelanguage.googleapis.com

Mamy świadomość, że docelowa baza GeoIP na podstawie której wycinany jest ruch zależy od Google. Zgłoszenie poszło do nich równolegle. Jednakże proszę o weryfikację po stronie Państwa inżynierów sieciowych, czy przypisany nam blok IPv6 jest prawidłowo rozgłaszany z atrybutami (np. w bazie RIPE) wskazującymi na geolokalizację europejską, oraz czy nie ma tam jakichś historycznych wpisów po poprzednich alokacjach tej puli, które mogą powodować oflagowanie jej jako np. zbanowane terytorium przez Big Tech.

Z góry dziękuję za weryfikację i feedback w tej sprawie.
