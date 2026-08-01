# PLAN 39: Przebieg na żywo, separacja artefaktów i dowody

## Zrozumienie błędów z poprzedniego raportu
Przyjmuję do wiadomości reprymendę:
- Zbyt szybko uznałem temat za zamknięty, nie podając jednoznacznie, czy stała na `origin/main` w ogóle istniała.
- Pominąłem wymagane, surowe wydruki (git, wyniki testów) zastępując je prozą, co było błędem w kontekście sztywnego procesu weryfikacji.
- Naruszyłem zakaz przedwczesnego aktualizowania pliku `.ai-memory.md` i ustalania statusu zadań na własną rękę.
Ostrzeżenia te traktuję jako najwyższy priorytet. Nowy raport będzie składał się z "suchych" dowodów z systemu, zgodnie z szablonem z kroku 13 (Zadanie 39).

## Plan Działania

### KROK 1: Dowody z Zadania 38
- Uruchomię polecenia diagnostyczne Gita dokładnie w podanej formie: `git branch -a -v`, `git ls-remote --heads origin`, `git log --oneline -5 origin/main`, `git show origin/main:src/modules/offer-optimizer-v2/orchestrator.js | grep -n "WRITE_BACK_ENABLED"`, `git log --oneline -3 HEAD`, `git status --short`. Odpowiedzi wkleję "na surowo".
- Odpowiem w jednym, konkretnym zdaniu o zawartości pliku na gałęzi `origin/main`. Jeśli z wydruku okaże się, że zmienna ma wartość `true`, proces przerywam i natychmiast raportuję wynik!
- Wyciągnę wszystkie wymagane dane (plik, linia, hashe) i skontroluję kolejność bramek CI względem testów w plikach GitHub Actions.

### KROK 2: Weryfikacja Stagingu
- Skonfrontuję plik `.github/workflows/deploy.yml` ze `staging-deploy.yml`.
- Wkleję blok `on:` wyzwalacza. Odpowiem krótko (TAK/NIE) na pytania: czy używają innego hosta, bazy danych, czy klucza API, dokumentując nazwy sekretów.

### KROK 3: Naprawa uszkodzonej izolacji artefaktów w testach
- Odnajdę w testach (m.in. w pliku `orchestrator.test.js`) moment zapisu do ścieżki `out/`.
- Zmienię kod testowy tak, aby generował pliki do ścieżki `tests/tmp/`. Dopiszę ten katalog do `.gitignore`.
- Wyczyszczę ręcznie zawartość katalogu `out/`, by przed Krokami 4 i 5 nie było tam żadnych artefaktów z przeszłości. Zgromadzę i wykażę lokalizacje wprowadzonych zmian.

### KROK 4: Przebieg potoku na żywo (Equilibra)
- Przygotuję dedykowany skrypt uruchomieniowy dla węzłów AI bez stosowania żadnych atrap (`aiWrapper.callAgentWithTelemetry` będzie działał sieciowo).
- Przepuszczę EAN `8000137015436` (Equilibra). Przechwycę w raporcie 39 potężne zrzuty: pełny `orch.state`, dokładny `description_html` oraz tokeny (szczegółowy `usageMetadata`). Plik `offer_8000137015436.json` zostanie dołączony. Jeśli potok utknie na walidatorach – zostawię raport i udam się do kolejnego kroku, bez stosowania mocków.

### KROK 5: Przebieg HITL na żywo (Trimay)
- Uruchomię EAN `8809822541010` (Trimay). Będę w stanie obserwować zatrzymanie wywołane brakiem `EU_RESPONSIBLE_PERSON`.
- Zasymuluję rolę operatora wywołując `resolveHitl('ACCEPT_AND_CONTINUE')` w tym samym potoku.
- Zrzucę z tego zdarzenia `hitl_log` oraz w ten sam sposób wyjaśnię zagadkę tabeli z raportu 38.

### KROK 6: Potwierdzenie testów i podsumowanie
- Puszczę pełny zrzut `npm test` i zliczę wystąpienia poszczególnych testów w plikach katalogu `tests/` aby udowodnić bezwzględne "ℹ tests 122" (lub udokumentować, jaki test został usunięty).
- Zaprezentuję całościowy `git diff --stat` modułu v2.
- Wygeneruję ostateczny `RAPORT_39_przebieg_na_zywo.md` ściśle wg Szablonu 13, bez żadnych odstępstw.

*Proszę o weryfikację i akceptację Planu, abym mógł odpalić pierwsze zadania z terminala i dostarczyć dowody.*
