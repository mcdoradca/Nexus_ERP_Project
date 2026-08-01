# AKCEPTACJA PLANU 33 — cztery rozstrzygnięcia

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Plan zaakceptowany poza jednym punktem: **Prisma zostaje nietknięta.**

**1. Składowanie: pliki, nie baza produkcyjna.**
Bez `schema.prisma`, bez `migrate`, bez `db push`. Dwie tabele lądują jako pliki
w `data/reference/` (JSON albo SQLite, Twój wybór) i są wczytywane do pamięci
przy starcie jako mapa po kluczu `canon`. Uzasadnienie: to są dane referencyjne,
tylko do odczytu, około 30 tysięcy rekordów — kilka MB w pamięci, wyszukiwanie
natychmiastowe. Ruszanie schematu bazy produkcyjnej przy zadeklarowanym drifcie
daje ryzyko nieodwracalne, a zysku żadnego. Do bazy przeniesiemy to dopiero,
jeśli kiedyś okaże się potrzebne.

**2. Pobranie ręczne jest dopuszczalne.**
Jeśli skrypt nie przejdzie przez zabezpieczenia, wolno wgrać pliki ręcznie.
Wymagam **pochodzenia i sumy kontrolnej**, a nie tego, żeby ściągnął je skrypt:
adres, data pobrania, `sha256`. Warunek STOP dotyczy sytuacji, w której pliku
nie da się zdobyć w ogóle albo nie da się go sparsować — nie tego, że trzeba
kliknąć ręcznie.

**3. Mock w teście P1 — kształt musi być prawdziwy.**
`eu_responsible_person: { data: { company: 'Test' } }` ma zły kształt.
Prawdziwa struktura to `{ name, address_eu, contact, raw_fragment }` i waliduje
ją V11 — na Twoim kluczu `company` test padnie z innego powodu. **Skopiuj
kształt z prawdziwego zrzutu stanu Equilibry** z `RAPORT_24A_DOK2`, zamiast
wymyślać klucze. To samo dotyczy `inci`: `{ value, source, matched_key }`.

**4. Nie mieszaj nowych tabel z istniejącym magazynem wektorowym.**
`INCI_NAMES` i `INCI_FUNCTIONS` to osobne, deterministyczne mapy. Testy GATE-3
i idempotencji ingestu, które dziś przechodzą, mają dalej przechodzić bez zmian.
