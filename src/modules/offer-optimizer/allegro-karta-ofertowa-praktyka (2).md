# Karta ofertowa Allegro — praktyczny przewodnik

> **Zakres:** projektowanie opisu oferty pod Mobile First — układ, zdjęcia, typografia, treść.
> **Podstawa:** zweryfikowane praktyki UX + wymogi Regulaminu Allegro (wersja od 16.06.2026)
> i oficjalnej pomocy Allegro.
> **Dokumenty towarzyszące:** `allegro-regulamin-wystawianie-ofert.md`,
> `allegro-oferty-widocznosc-i-promocja.md`, `allegro-zalacznik-1-towary-zakazane.md`,
> `allegro-zgodnosc-a-widocznosc-webinar.md` (zasady miniaturek, lista fraz zakazanych w opisie),
> `allegro-zdjecia-produktowe-multiplatforma.md` (parametry techniczne, Amazon/eMAG/Kaufland)

**Legenda:** ✅ = wymóg regulaminowy · 💡 = praktyka UX (niewymagana, ale skuteczna)

---

## 1. Zasada nadrzędna: projektuj linearnie

Opis oferty na Allegro powstaje w Edytorze Wizualnym opartym na **sztywnych wierszach**.
Na telefonie każdy wiersz dzielony rozkłada się na osobne bloki ułożone jeden pod drugim,
w kolejności **od lewej do prawej, z góry na dół**. Nie da się wymusić innej kolejności —
edytor nie ma odpowiednika „Reverse Columns" znanego z kreatorów stron.

💡 **Konsekwencja praktyczna:** projektuj ofertę tak, jakby miała istnieć wyłącznie
w jednej pionowej kolumnie. Wersja desktopowa to tylko jej szersza adaptacja, nie odwrotnie.

### Pułapka szachownicy

Naprzemienny układ wygląda dynamicznie na monitorze, ale na telefonie rozpada się:

| Desktop | Mobile (kolejność faktyczna) |
|---|---|
| Wiersz 1: `Tekst A` \| `Zdjęcie A` | 1. Tekst A |
| Wiersz 2: `Zdjęcie B` \| `Tekst B` | 2. Zdjęcie A |
| | 3. **Zdjęcie B** ← zderzenie zdjęć |
| | 4. Tekst B |

W punktach 2–3 użytkownik widzi dwa zdjęcia pod rząd. Drugie pojawia się **przed** jakimkolwiek
opisem, często poza pierwszym ekranem — traci kontekst i nie wie, co ogląda.

💡 **Rozwiązanie:** w wierszach dzielonych **zawsze tekst po lewej, zdjęcie po prawej**.
Powtarzaj ten sam układ zamiast go odwracać. Na telefonie daje to spójny rytm:
*Teza → Dowód → Teza → Dowód*.

💡 **Test:** sprawdzaj efekt w **natywnej aplikacji mobilnej Allegro**, nie przez zwężanie okna
przeglądarki — zwężone okno nie odwzorowuje mechaniki linearyzacji edytora.

---

## 2. Struktura karty ofertowej

Sprawdzony blueprint, zaprojektowany tak, by każdy element miał sens również w widoku pionowym:

| # | Sekcja | Typ wiersza | Na mobile | Cel |
|---|---|---|---|---|
| 1 | **Nagłówek + USP** | Tekst (pełna szerokość) | Tekst na górze | Nazwa produktu + kluczowa korzyść. Max 3–4 zdania |
| 2 | **Zdjęcie główne (Hero)** | Zdjęcie (pełna szerokość) | Pełna szerokość ekranu | Najbardziej atrakcyjne ujęcie, może być lifestyle |
| 3 | **Kluczowe cechy** | Tekst — lista punktowana | Lista | Szybkie skanowanie wzrokiem |
| 4 | **Moduł edukacyjny A** | Tekst (lewo) + Zdjęcie (prawo) | Tekst → Zdjęcie | Najpierw „co to jest", potem „jak wygląda" |
| 5 | **Moduł edukacyjny B** | Tekst (lewo) + Zdjęcie (prawo) | Tekst → Zdjęcie | **Powtórz układ, nie odwracaj** |
| 6 | **Detal / zbliżenie** | Zdjęcie (pełna szerokość) | Zbliżenie z zoomem | Dowód jakości wykonania, przerwa od czytania |
| 7 | **Sekcja techniczna** | Tekst (pełna szerokość) | Tekst z nagłówkami | Specyfikacja, zawartość zestawu, sposób pakowania |

💡 **Zasada jedności semantycznej:** traktuj każdy wiersz jako zamkniętą całość. Nie rozbijaj
opisu jednej funkcji na dwa wiersze (nagłówek osobno, treść osobno) — na telefonie tworzy to
nienaturalne odstępy i rwie płynność czytania.

---

## 3. Treść i typografia

### Hierarchia nagłówków

| Poziom | Zastosowanie | Przykład |
|---|---|---|
| **H1** | Generowany automatycznie przez system na górze strony — **nie dubluj go w opisie** | — |
| **H2** | Główne bloki tematyczne; działa jak „stoper" przy skanowaniu | „Dlaczego warto wybrać ten model?", „Specyfikacja techniczna" |
| **H3** | Konkretne cechy wewnątrz sekcji | „Wodoodporność IP67", „Bateria na 24h" |

💡 Na małym ekranie nagłówek jest kotwicą uwagi. Użytkownik scrolluje szybko, zatrzymując wzrok
niemal wyłącznie na nagłówkach i zdjęciach — dopiero zainteresowany czyta akapit poniżej.

### Formatowanie bloku tekstu

- 💡 **Akapit:** maksymalnie 3–4 linijki w widoku desktop (na telefonie urosną do 6–8)
- 💡 **Pogrubienia:** tylko kluczowe frazy, nigdy całe zdania — pogrubienie wszystkiego znosi efekt
- 💡 **Listy punktowane:** obowiązkowe przy cechach technicznych, składzie, zawartości zestawu

### Model Cecha → Zaleta → Korzyść

| Poziom | Przykład |
|---|---|
| Cecha (fakt) | „Silnik o mocy 2000W" |
| Zaleta (co z tego wynika) | „Zapewnia bardzo dużą siłę ssania" |
| **Korzyść (to piszemy w ofercie)** | **„Usuniesz sierść z dywanu w 3 minuty"** |

### Tytuł oferty

- ✅ Limit: **75 znaków** (obowiązuje od września 2023; zmieniało się natomiast *minimum* —
  warto sprawdzić aktualną wartość w Sales Center przed masową edycją)
- 💡 Marka, model i typ produktu w **pierwszych 30–40 znakach** — na listingach mobilnych
  koniec tytułu bywa ucinany
- ✅ **Zakaz keyword stuffingu** — Zał. 2, art. 1.14: nie wolno umieszczać słów kluczowych
  w celu manipulowania wynikami wyszukiwania. Granica między optymalizacją a spamem
  jest cienka i egzekwowana

---

## 4. Zdjęcia

### Parametry techniczne

| Parametr | Wartość |
|---|---|
| Maksymalny rozmiar | ✅ **2560 × 2560 px** (większe skalowane proporcjonalnie) |
| Maksymalna rozdzielczość | ✅ **26 Mpx** |
| Minimalny rozmiar | ✅ **dłuższy bok min. 400 px** |
| Profil kolorów | ✅ **sRGB** — inne profile mogą zniekształcić barwy |
| Formaty | ✅ jpg, jpeg, png (**webp** tylko przez API lub z pliku) |
| Proporcje | ✅ dowolne (1:1, 4:3, 16:9 lub inne) |

💡 **Rekomendacja praktyczna:** wgrywaj zdjęcia o dłuższym boku **min. 1200–1500 px**.
Wymagane minimum to 400 px, ale przy tej wartości funkcja lupy (zoom) w aplikacji mobilnej
nie pokaże detali, a na ekranach o wysokiej gęstości pikseli zdjęcie wygląda nieostro.

💡 **Proporcje pod mobile:** kwadrat (1:1) lub pion (4:5) zajmują większą powierzchnię ekranu
telefonu niż panorama (16:9). Większa powierzchnia = dłuższe zatrzymanie uwagi.

### Tło

| Miejsce | Zasada |
|---|---|
| **Miniaturka** (pierwsze zdjęcie) | ✅ Białe, jednolite **RGB 255.255.255** — Zał. 2, art. 2.2 |
| **Zdjęcia w opisie** | ✅ **Dowolny kolor tła** |

> Wyjątki od białego tła miniaturki (m.in. Moda — tło szare o V ≥ 0,8 w HSV; książki, filmy,
> dzieła sztuki; towary używane na Koncie bez statusu Firma; kilkadziesiąt wskazanych kategorii)
> opisuje szczegółowo `allegro-oferty-widocznosc-i-promocja.md`, klauzule 2.2.1–2.4.

### Co może znaleźć się na zdjęciu

✅ **Dozwolone w opisie** (Zał. 2, art. 1.5):
- logo marki/producenta
- oznaczenia kolorów i wzorów
- **liczby i jednostki** — czyli wymiarowanie techniczne
- certyfikaty, technologie, elementy graficzne (np. strzałki)
- oznaczenia wskazujące na wygenerowanie lub modyfikację zdjęcia przy użyciu **AI**
- teksty znajdujące się fizycznie na produkcie lub oryginalnym opakowaniu

✅ **Zabronione:** napisy poza powyższymi wyjątkami — nazwa i logo sklepu, znaki wodne,
informacje o wysyłce („Wysyłka 24h"), treści promocyjne. Zakaz prezentowania intymnych części ciała.

✅ **Miniaturka — zasady ostrzejsze** (art. 2.2.4): zakaz **jakichkolwiek** dodatkowych elementów
(teksty, grafiki, ramki, logotypy) poza oznaczeniami AI.

### Rola zdjęć w opisie

💡 Zdjęcia w opisie **nie powinny dublować** packshotów z galerii. Klient widział już produkt
na białym tle — w opisie pokaż go w użyciu.

✅ Regulamin to wspiera (Zał. 2, art. 1.5):
> „Dozwolone jest przedstawienie Towaru w kontekście jego zastosowania lub aranżacji."

**Przykład:** zamiast kolejnego zegarka na białym tle — ten sam zegarek na nadgarstku,
w realnej sytuacji. Zdjęcie kontekstowe pokazuje skalę przedmiotu i jego rzeczywisty wygląd.

💡 **Wymiary jako grafika:** zamiast opisywać wymiary w tekście, przygotuj rysunek techniczny
lub zdjęcie z liniami wymiarowymi i wstaw jako osobny wiersz zdjęciowy. Liczby i jednostki są
dozwolone, a rozwiązuje to realny problem — użytkownik mobilny ma trudność z wyobrażeniem sobie
wielkości przedmiotu na podstawie samego opisu.

> ⚠️ **Tylko w opisie, nigdy na miniaturce.** Oficjalna pomoc Allegro mówi wprost: w kategorii
> Motoryzacja pokaż na miniaturce produkt, **nie dodawaj rysunku technicznego**. Wyjątek z Zał. 2
> art. 2.5 dotyczy wyłącznie podmiotów z indywidualną umową ze Spółką.

💡 **Czytelność dla wyszukiwania wizualnego:** zdjęcia wyraźne i dobrze oświetlone są łatwiej
rozpoznawane przez mechanizmy wyszukiwania obrazem. Mocno stylizowane lub zniekształcone ujęcia
sprawdzają się gorzej.

---

## 5. Spójność i zgodność treści

### Spójność danych

✅ Tytuł, parametry, opis i zdjęcia muszą tworzyć spójną całość.

- **Art. 5.2** — treść Oferty musi być rzetelna, kompletna i nie może wprowadzać w błąd
  co do właściwości Towaru (stan, parametry, jakość, pochodzenie, marka, producent)
- **Zał. 2, art. 1.1.a** — Spółka może stosować **narzędzia oparte o sztuczną inteligencję**,
  które automatycznie weryfikują rzetelność, jakość, spójność, estetykę i czytelność treści Oferty
  oraz wykrywają błędy językowe i formalne. Może też **odmówić publikacji**, wskazując
  w uzasadnieniu elementy wymagające zmiany
- **Art. 3.4 ust. 1** — „zgodność opisu Oferty z Regulaminem" to czynnik **główny** trafności

> Rozbieżność typu „Zestaw XXL" w tytule przy parametrze „Liczba elementów: 2" to nie tylko
> ryzyko dyskusji z kupującym, ale i realny spadek trafności.

### Jedna oferta = jeden wariant

✅ **Zał. 2, art. 1.12:**
> „Niedopuszczalne jest pozostawienie Kupującemu w ramach Oferty wyboru co do jednej bądź kilku
> istotnych cech Towaru, takich jak np. rozmiar, model itp."

Nie pisz w opisie „dostępne również w czerwonym i niebieskim". Od tego są **warianty Produktowe**
(art. 1.13). Wyjątek: przy wielu sztukach dopuszczalny wybór **koloru lub wzoru graficznego**,
o ile prezentujesz aktualną informację o dostępnych opcjach.

### Rozmieszczenie informacji w polach

✅ **Zał. 2, art. 1.4.a** — każda informacja ma swoje miejsce:

| Pole | Zawartość |
|---|---|
| `Opis` | Wyłącznie informacje o Towarze (+ dodatkowo o producencie, ale nie jako większość opisu) |
| `Dostawa i płatność` | Szczegóły dostawy |
| `Gwarancja` | Warunki gwarancji |
| `Reklamacja` | Procedura reklamacyjna |
| `Zwroty` | Odstąpienie od umowy |
| `O sprzedającym` | Informacje o sprzedającym |

✅ **Dane kontaktowe** — wyłącznie w miejscach do tego przeznaczonych.
*Wyjątek:* kategoria `Produkty spożywcze > Catering`, gdzie w polu „Opis" dane kontaktowe
i informacje o dostawie **są dozwolone**.

✅ **Parametry** — puste lub niejednoznaczne wartości („Inny", „Pozostałe") Spółka może
**sama uzupełnić** na podstawie innych pól Oferty. Poinformuje o zmianie i umożliwi jej wycofanie
przez edycję.

### Linki w opisie

✅ **Zał. 2, art. 1.16** — adresy stron dozwolone **wyłącznie** gdy:
- **a)** nie jest przez nie prowadzona działalność handlowa, a treści służą wyłącznie
  poszerzeniu informacji o Towarze, **albo**
- **b)** adres jest przedmiotem Oferty (domena, hosting, serwis internetowy)

✅ **Art. 1.3** dodatkowo dopuszcza linki do treści na serwerach zewnętrznych, pod warunkiem
że **nie są to treści istotne** dla Oferty.

### Rabaty i gratisy

✅ **Zał. 2, art. 1.18** — dozwolone:
> „W ramach Oferty Sprzedający może udzielić rabatu lub zaoferować bezpłatny dodatek do Towaru
> (gratis), pod warunkiem, że Kupujący otrzymujący rabat lub bezpłatny dodatek nie jest wyłaniany
> w drodze losowania. Zarówno rabat jak i gratis muszą być określone w sposób jednoznaczny."

Ograniczenie: gratisem nie mogą być Towary zakazane z Załącznika nr 1 (art. 4.3). Wyjątek stanowią
próbki kosmetyczne i zapachowe w kategorii `Uroda`, oznaczone jako nieprzeznaczone do sprzedaży —
dozwolone jako gratis przy pełnowymiarowym produkcie z tej kategorii.

> ⚠️ **Rozróżnij praktykę od słownictwa.** Sama instytucja gratisu i rabatu jest dozwolona,
> ale oficjalna pomoc Allegro wymienia **słowo „gratis"** wśród fraz reklamowych **niedozwolonych
> w opisie** (obok: *tanio, promocja, hit, prezent*). Narzędzie podświetlania fraz działa w czasie
> rzeczywistym i **zablokuje wystawienie oferty** do czasu poprawki.
>
> **Jak zrobić to poprawnie:** dodaj gratis przez funkcję **zestawu produktów**
> (produkt główny + produkt-gratis), zamiast pisać „GRATIS!" w opisie. Jeśli gratis jest częścią
> oryginalnego zestawu producenta, upewnij się, że pod danym EAN w Katalogu Produktów
> znajduje się produkt uwzględniający ten gratis.

---

## 6. Co daje większy zwrot niż układ graficzny

Optymalizacja opisu to praca jednorazowa. Poniższe czynniki są udokumentowane w Regulaminie
jako wpływające na trafność i działają na **cały asortyment**:

| Czynnik | Efekt | Podstawa |
|---|---|---|
| **Połączenie Oferty z Produktem** | Bez tego Oferta jest **niewidoczna** i nie wywołuje skutków | Art. 3.8 |
| **Jakość sprzedaży ≥ „neutralny"** | Warunek Wyróżnień i Allegro Ceny; niżej — ryzyko sankcji | Art. 10.7, Zał. 2 art. 3.1 |
| **Terminowe nadawanie i numery przesyłek** | Bezpośredni czynnik rankingowy | Art. 3.4 ust. 3, Art. 10.5 |
| **Czas odpowiedzi na wiadomości (24 h)** | Bezpośredni czynnik rankingowy | Art. 3.4 ust. 3, Art. 10.4 |
| **Liczba metod darmowej dostawy** | Bezpośredni czynnik rankingowy | Art. 3.4 ust. 1 |
| **Krótki deklarowany czas wysyłki** | Wpływa na trafność i kwalifikację do Allegro Ceny | Art. 3.4 ust. 1, Zał. 21 art. 4.2 |
| **Brak naruszeń Zał. 1 i upomnień z Zał. 2** | Liczone do trafności **wszystkich** Ofert | Art. 3.4 ust. 3 |
| **Uzupełnione obowiązkowe parametry** | Czynnik Reprezentanta Produktu | Art. 3.4.b pkt 8 |
| **Jakość pierwszego zdjęcia** | Czynnik Reprezentanta Produktu | Art. 3.4.b pkt 5 |

> Pełne zestawienie czynników trafności: `allegro-oferty-widocznosc-i-promocja.md`, sekcja 1.

---

## 7. Checklist wdrożeniowy

### Układ i struktura
```
[ ] Projekt powstaje z myślą o jednej pionowej kolumnie (Linear Design)
[ ] W wierszach dzielonych: zawsze Tekst po lewej, Zdjęcie po prawej
[ ] Brak układu szachownicowego — układ powtarzany, nie odwracany
[ ] Każdy wiersz to zamknięta całość (nagłówek + treść razem)
[ ] Struktura wg blueprintu: USP → Hero → cechy → moduły → detal → specyfikacja
[ ] Weryfikacja w natywnej aplikacji mobilnej Allegro
```

### Treść
```
[ ] H2 dla sekcji, H3 dla cech; H1 niedublowany
[ ] Akapity max 3–4 linijki (widok desktop)
[ ] Listy punktowane przy specyfikacji i zawartości zestawu
[ ] Pogrubienia tylko na kluczowych frazach
[ ] Opisy funkcji w modelu Cecha → Zaleta → Korzyść
[ ] Tytuł: marka i model w pierwszych 30–40 znakach, max 75 znaków
[ ] Brak keyword stuffingu (Zał. 2, 1.14)
[ ] Informacje w odpowiednich polach, nie wszystko w „Opisie"
[ ] Brak danych kontaktowych (poza kategorią Catering)
[ ] Jeden wariant na ofertę — reszta przez warianty Produktowe
```

### Zdjęcia
```
[ ] Miniaturka: białe tło RGB 255.255.255 lub udokumentowany wyjątek
[ ] Miniaturka bez tekstów, ramek i logotypów (poza oznaczeniem AI)
[ ] Dłuższy bok min. 1200 px (wymagane minimum: 400 px)
[ ] Profil kolorów sRGB
[ ] Format kwadratowy lub pionowy w opisie
[ ] Zdjęcia w opisie kontekstowe, nie duplikaty packshotów
[ ] Rysunek techniczny z wymiarami jako osobny wiersz zdjęciowy (NIE na miniaturce)
[ ] Zdjęcia wyraźne i dobrze oświetlone
```

### Spójność
```
[ ] Tytuł, parametry, opis i zdjęcia zgodne ze sobą
[ ] Wszystkie obowiązkowe parametry uzupełnione, bez wartości „Inne"
[ ] Oferta połączona z Produktem
[ ] GTIN/EAN prawidłowy i pasujący do produktu
[ ] Parametr „Stan" zgodny ze słownikiem z Zał. 2, art. 1.4.b
```
