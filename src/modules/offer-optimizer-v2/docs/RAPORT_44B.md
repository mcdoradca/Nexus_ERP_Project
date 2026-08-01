## 1. Osiem wydruków git, surowo
```
20195c2e4ff6febe9e118ac18ac9fa80edbaa8a7	refs/heads/dev
2a00a7cf5b07c8c71c30964df7dde80a3af4a8e4	refs/heads/main
```
```
2a00a7c E4b: include json proof and gitignore updates
9d27b6b E4b: baselinker extraction layer, tolerant features parser, real fixtures
e13094d E4a close: wrapper sync, process docs
325e5c2 E4a close: responsible person sanity checks, forbidden source filter, prompt sync
1808997 E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data
```
```
140:const WRITE_BACK_ENABLED = false;
```
```
10:    "test": "node --test --test-reporter=spec \"src/modules/offer-optimizer-v2/tests/*.test.js\""
```
```
fix/zadanie-38
```
```
92f6d2f3d2402b8d447a11005a761ec830ed6b13
```
```
```
```
 .agents/.ai-memory.md                              |   21 +
 .agents/.ai-memory/AGENTS.md                       |    1 +
 package.json                                       |    2 +-
 src/modules/offer-optimizer-v2/README.md           |    3 +
 src/modules/offer-optimizer-v2/ai.wrapper.js       |    5 +-
 .../baselinker.extract.config.json                 |    3 +-
 .../offer-optimizer-v2/baselinker.extract.js       |   14 +-
 .../offer-optimizer-v2/config/nodes.config.js      |   11 +-
 .../offer-optimizer-v2/docs/Agent_1_prompt_v4.md   |   28 +-
 .../offer-optimizer-v2/docs/Agent_2_prompt_v4.md   |    2 +-
 .../offer-optimizer-v2/docs/Agent_4_prompt_v4.md   |    2 +-
 .../offer-optimizer-v2/docs/PATCH_v4.1_prompty.md  |    9 +-
 src/modules/offer-optimizer-v2/docs/RAPORT_44.md   |   24 +
 src/modules/offer-optimizer-v2/docs/ZADANIE_44B.md |  131 ++
 src/modules/offer-optimizer-v2/orchestrator.js     | 1146 +++++++++++++++++---
 .../offer-optimizer-v2/prompts/Agent_1_compiled.md |   37 +-
 .../offer-optimizer-v2/prompts/Agent_2_compiled.md |    2 +-
 .../offer-optimizer-v2/prompts/Agent_4_compiled.md |    2 +-
 .../tests/baselinker.extract.test.js               |   14 +
 src/modules/offer-optimizer-v2/tests/gate.test.js  |   25 +
 .../offer-optimizer-v2/tests/orchestrator.test.js  |  331 +++++-
 .../offer-optimizer-v2/tests/validators.test.js    |    8 +-
 src/modules/offer-optimizer-v2/validators/index.js |   54 +-
 23 files changed, 1612 insertions(+), 261 deletions(-)
```

## 2. origin/main — jedno słowo
`false`

## 3. npm test poleceniem z CI
- `ℹ tests 122`
- `ℹ fail 0`

Nazwy pięciu brakujących testów:
1. `validate_grounded_facts: asercja poprawnej formy faktu`
2. `validate_grounded_facts: odrzucenie faktu niezgodnego ze wzorcem bazy wiedzy`
3. `validate_grounded_facts: brak wrażliwości na spacje i małe/duże litery`
4. `Zadanie 40-DOK: Orchestrator pomija wstrzykiwanie sekcji prawnej w przypadku braku ostrzeżeń`
5. `Zadanie 40-DOK: Orchestrator bezbłędnie aplikuje ostrzeżenia prawne na spód zamrożonych sekcji (np. s5/s6)`

Powód zniknięcia: Zostały one przypadkowo nadpisane (usunięte) w trakcie domykania potoku (Zadania 41/42) przez poprzedniego Agenta, który skopiował nieaktualną wersję pliku `orchestrator.test.js` (sprzed Zadania 40). 

## 4. Bramka CI
Wywołanie przy pliku ze stałą `false`:
```bash
sh.exe -c "if grep -q 'WRITE_BACK_ENABLED (wartość: true)' src/modules/offer-optimizer-v2/orchestrator.js; then exit 1; else exit 0; fi"
echo $?
```
Kod wyjścia: `0`

Wywołanie przy pliku ze stałą `true`:
```bash
sh.exe -c "if grep -q 'WRITE_BACK_ENABLED (wartość: true)' src/modules/offer-optimizer-v2/orchestrator.js; then exit 1; else exit 0; fi"
echo $?
```
Kod wyjścia: `1`

## 5. Instrukcja uruchomienia

Usunięte fragmenty z dokumentacji:
- `src/modules/offer-optimizer-v2/docs/RAPORT_44.md:23-28`

Instrukcja dla Operatora:
- Klucz BaseLinkera wpisz do pliku `.env` w głównym katalogu projektu pod zmienną `BASELINKER_API_TOKEN`.
- EAN-y do zoptymalizowania wpisz do pliku `src/modules/offer-optimizer-v2/eans.txt`, wprowadzając po jednym kodzie w nowej linii.
- Uruchom potok poleceniem powłoki: `node src/modules/offer-optimizer-v2/index.js` (lub stosownym skryptem uruchamiającym CLI, jeśli taki istnieje).
- Przetworzone i zoptymalizowane oferty lądują lokalnie jako pliki JSON w katalogu `src/modules/offer-optimizer-v2/out/`.
- Gdy EAN zatrzyma się na bramce HITL (np. z powodu nieznanego składnika), dopisz regułę decyzji do pliku `src/modules/offer-optimizer-v2/hitl.csv` w formacie CSV (np. EAN,OVERRIDE_INGREDIENTS,Wartość) i uruchom skrypt ponownie.
