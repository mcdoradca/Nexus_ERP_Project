# Raport z Ewolucji Agenta 11 ("Prompt Master") - Ostatnie 24H
**Data wygenerowania:** 2026-08-17
**Zakres analityczny:** `git log --since="24 hours ago"` (Gałąź `main`)

Poniższy raport przedstawia kompletną oś czasu dotyczącą stabilizacji i modyfikacji Agenta 11 (Generatora Promptów dla Photoroom AI) w systemie Nexus ERP. Skupia się on na trzech głównych obszarach: walce z modelem dyfuzyjnym (in-painting), zarządzaniu oknem kontekstowym LLM oraz łataniu infrastruktury API.

---

## Faza 1: Walka z Kompozycją Photoroom (07:13 - 11:09)

Na przestrzeni kilku godzin deweloperzy (Agenci) eksperymentowali z narzucaniem sztywnych ram (tzw. `MANDATORY_PREFIX`) do wygenerowanego przez Agenta 11 promptu. Głównym celem było powstrzymanie systemu Photoroom od zniekształcania produktu referencyjnego.

* **[07:13] Commit `f97645f`**: Wprowadzono opis wizualny zastępujący "zakazy konwersacyjne", których model dyfuzyjny Photoroom nie potrafił przetworzyć. Dodano rygorystyczny prefiks nakazujący zachowanie etykiety na poziomie 100%.
* **[07:31] Commit `caba756`**: Doprecyzowano prefiks, narzucając warunek: *"Cała kompozycja z prompta ma być zawarta na zdjęciu"*, by produkt nie "uciekał" z kadru.
* **[07:45] Commit `282b22a`**: **Krytyczny Rollback**. Wyczyszczono całkowicie `MANDATORY_PREFIX` do postaci pustego stringa (`""`). Wskazuje to, że doklejanie sztucznych bloków przed wynikowym promptem powodowało konflikt lub spadek jakości na wyjściu z Agenta 11. Próbowano puszczać kod "na żywioł" (czysty wyjściowy prompt).
* **[10:47 - 11:09] Commity `4a7a964`, `85bbefd`**: Przeniesiono zasady kompozycji scen bezpośrednio do wewnętrznych instrukcji Agenta 11. Skrypt `prompt-master.service.js` został uproszczony z godnie z wytycznymi administratora, polegając bardziej na natywnej inteligencji Agenta niż twardo hardkodowanych prefiksach.

> [!TIP]
> **Wniosek architektoniczny:** Hardkodowanie długich prefiksów i "zakazów" do generatywnych wyników rzadko działa poprawnie w modelach image2image. Skuteczniejszym rozwiązaniem okazało się poprawienie systemowego promptu dla Agenta 11 i poleganie na jego wewnętrznej logice.

---

## Faza 2: Nasycenie Kontekstu i Pamięć (11:22 - 13:34)

Gdy poprawiono jakość generowanych promptów, napotkano błąd związany ze skalowaniem działania agenta na produktach o powtarzalnych EAN. Agent dławił się rosnącym oknem kontekstowym.

* **[11:22] Commit `ae2741c`**: Zaimplementowano ostry limit historii promptów (array zredukowany do max 10 wpisów). Miało to chronić Agenta 11 przed *LLM context saturation*. Zbyt długa historia tego, co było już wygenerowane, degradowała wyniki ("amnezja kontekstowa").
* **[13:34] Commit `e50fadb`**: Usunięcie "wyhalucynowanych limitów i destrukcyjnego czyszczenia pamięci". Cofnięto restrykcje, co sugeruje, że poprzedni limit albo odcinał kluczowe dane, albo został zaimplementowany w niewłaściwym miejscu, psując architekturę bazy danych (pamięci agentów).

> [!WARNING]
> Należy zachować ostrożność podczas przycinania historii czatów (pamięci `agentCache`). Drastyczne kasowanie list pamięci może trwale uszkodzić ciągłość wnioskowania w systemach produkcyjnych.

---

## Faza 3: Ucieczka Tokenów - Błąd Serializacji w API (Aktualne)

Pod koniec doby skupiono się na infrastrukturze bezpośrednio utrzymującej LLM w ryzach, w pliku `ai.wrapper.js`.

* **[~19:40] Commit `8e29f54`**: Wprowadzono chirurgiczną łatkę (Surgical Edits) po tym, jak system zaczął zwracać dla Agenta 11 krytyczny błąd `HTTP 400 (Invalid JSON payload - Unknown name "")`.
  * **Diagnoza:** SDK `genai` uszkadzało żądania, gdy do konfiguracji przekazano pusty obiekt `thinkingConfig: {}`.
  * **Odkrycie poboczne:** Przeprowadzony audyt REST API wyjawił, że wymuszanie formatu `responseMimeType: "text/plain"` w połączeniu z jawnym włączeniem klucza `thinkingLevel` doprowadza u Google Gemini do hardware'owego błędu i zwrotu `thoughtsTokenCount: 0`.
  * **Rozwiązanie:** Wprowadzono sanityzację parametrów budujących obiekt konfiguracji we wrapperze, zapobiegając przesyłaniu pustych struktur. Jawnie przypisano `ThinkingLevel.LOW` dla Agenta 11 w pliku `nodes.config.js`.

> [!IMPORTANT]
> To odkrycie definiuje nowy standard w projekcie. Pod żadnym pozorem nie łącz w `nodes.config.js` jawnym trybem `ThinkingLevel` agentów zwracających natywnie czysty tekst (`text/plain`), gdyż API wycina im tokeny dedykowane na "rozumowanie", osłabiając merytorykę ich wypowiedzi.

---
**Status Agenta 11 (na chwilę obecną):** Aktywny, stabilny, logujący poprawnie do telemetrii, wolny od amnezji kontekstowej oraz zabezpieczony przed awarią SDK przy połączeniach HTTP.
