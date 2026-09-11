# **Przemysłowa Instrukcja Wdrożeniowa Agenta Antigravity: Automatyczna Adaptacja Kart SDS (UE 2020/878)**

## **Architektura Odpowiedzialności Karnej, Integracji REST API i Determinizmu Prawnego**

## **1\. Ramy Prawne i Odpowiedzialność Podmiotu Wprowadzającego**

Wprowadzanie do obrotu preparatów chemicznych bez 100% weryfikacji każdego składnika stanowi naruszenie:

1. **Art. 31 Rozporządzenia (WE) nr 1907/2006 (REACH)** oraz **Rozporządzenia Komisji (UE) 2020/878**.  
2. **Rozporządzenia (WE) nr 1272/2008 (CLP)** wraz ze wszystkimi adaptacjami do postępu naukowo-technicznego (ATP).  
3. **Art. 220 Kodeksu karnego** (narażenie życia lub zdrowia pracownika na niebezpieczeństwo).  
4. **Art. 165 Kodeksu karnego** (sprowadzenie powszechnego niebezpieczeństwa dla życia lub zdrowia wielu osób poprzez wprowadzenie do obrotu substancji szkodliwych).

### **Zasada Architektury Zerowej Tolerancji Błędu (Zero-Bypass Principle):**

* **Zakaz halucynacji LLM:** Model językowy w Antigravity odpowiada **wyłącznie** za przekład terminologii czysto opisowej (np. technika gaśnicza, uwalnianie do środowiska).  
* **Determinizm API i prawa:** Numery CAS, klasyfikacje CLP, limity NDS i kody odpadów są weryfikowane maszynowo poprzez zintegrowane potoki REST API i lokalne rejestry urzędowe.  
* **Twarda blokada (Hard Stop):** Brak możliwości zweryfikowania substancji w API lub w rejestrze krajowym skutkuje natychmiastowym zablokowaniem emisji dokumentu (BLOKADA EMISJI DO OBROTU).

## **2\. Architektura Integracji REST API (ECHA CHEM & PubChem PUG REST)**

Aby zapewnić pełną automatyzację bez generowania kosztów licencyjnych (0 PLN / 0 USD), system wykorzystuje dwupoziomową architekturę otwartych interfejsów REST API.

                   \[Ekstrakcja numeru CAS z Sekcji 3\]  
                                   │  
                                   ▼  
          ┌─────────────────────────────────────────────────┐  
          │ POZIOM 1: Lokalny rejestr Dz.U. 2018 poz. 1286   │  
          │         (Pełny wykaz urzędowy RP)               │  
          └────────────────────────┬────────────────────────┘  
                                   │  
                  ┌────────────────┴────────────────┐  
                  ▼                                 ▼  
             (ZNALAZIONO)                     (BRAK W WYKAZIE)  
                  │                                 │  
                  │                                 ▼  
                  │                ┌───────────────────────────────────┐  
                  │                │ POZIOM 2: PubChem PUG REST API    │  
                  │                │ Zapytanie: /compound/name/{CAS}   │  
                  │                └─────────────────┬─────────────────┘  
                  │                                  │  
                  │                   ┌──────────────┴──────────────┐  
                  │                   ▼                             ▼  
                  │             (HTTP 200 OK)                 (HTTP 404/ERR)  
                  │                   │                             │  
                  │                   ▼                             ▼  
                  │        ┌─────────────────────┐        ┌───────────────────┐  
                  │        │ Pobranie:           │        │ ECHA CHEM Query   │  
                  │        │ \- IUPAC Name        │        │ info-card direct  │  
                  │        │ \- Wzór sumaryczny   │        └─────────┬─────────┘  
                  │        │ \- Synonimy ECHA     │                  │  
                  │        └──────────┬──────────┘                  │  
                  │                   │                             ▼  
                  │                   ▼                    \[BRAMKA BŁĘDU HALT\]  
                  │        \[Wstrzyknięcie formuły:         Nieznany CAS lub  
                  │        Brak limitu NDS w prawie PL,    błędna suma stężeń  
                  │        substancja zarejestrowana\]               │  
                  │                   │                             ▼  
                  ▼                   ▼                    Status: BLOKADA\_CAS  
      \[Zestawienie danych składnika w JSON dla Agenta\]

### **2.1. Specyfikacja Integracji z PubChem PUG REST API (PubChem / ECHA Mapping)**

* **Status:** W 100% bezpłatne, otwarte publiczne API rządu USA (NIH/NCBI), w pełni zsynchronizowane z numeracją CAS, IUPAC i numerami WE. Nie wymaga klucza API, subskrypcji ani autoryzacji.  
* **Endpoint bazowy:**  
  GET https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{CAS\_NUMBER}/property/IUPACName,MolecularFormula,InChIKey,Title/JSON

* **Przykład zapytania:**  
  GET https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/67-63-0/property/IUPACName,MolecularFormula,InChIKey,Title/JSON

* **Struktura odpowiedzi JSON:**  
  {  
    "PropertyTable": {  
      "Properties": \[  
        {  
          "CID": 3776,  
          "IUPACName": "propan-2-ol",  
          "MolecularFormula": "C3H8O",  
          "InChIKey": "KFZMGEQAYNKOFK-UHFFFAOYSA-N",  
          "Title": "Isopropanol"  
        }  
      \]  
    }  
  }

* **Polityka zapytań (Rate Limiting & Safety):**  
  * Limit PubChem: Maksymalnie 5 zapytań na sekundę na dany adres IP.  
  * Wymóg nagłówka: User-Agent: AntigravitySDSProcessor/2.5 (Compliance Engine).  
  * Mechanizm Timeout: ![][image1] na zapytanie; w przypadku braku odpowiedzi wdrożony 3-krotny Exponential Backoff (![][image2], ![][image3], ![][image4]).

### **2.2. Bezpośrednia integracja z ECHA CHEM InfoCards**

Dla każdego zidentyfikowanego numeru CAS silnik generuje kanoniczny URL do unijnego rejestru ECHA, umożliwiający weryfikację rejestracji REACH i wykazu C\&L:

https://echa.europa.eu/pl/substance-information/-/substanceinfo/{CAS\_DIGITS\_ONLY}

np. dla acetonu (67-64-1):

https://echa.europa.eu/pl/substance-information/-/substanceinfo/67641

## **3\. Architecture Decision Records (ADR)**

### **ADR-001: Architektura Trójpoziomowej Weryfikacji Substancji przez API**

* **Status:** Zaakceptowane / Obowiązujące bezwzględnie.  
* **Kontekst:** W Sekcji 3 pojawiają się tysiące różnych związków chemicznych. Lokalny skrócony słownik jest niezgodny z prawem.  
* **Decyzja:** Silnik weryfikuje każdy numer CAS według kaskady:  
  1. **Poziom 1 (Krajowy rejestr urzędowy):** Baza pełnego wykazu NDS/NDSCh/NDSP (*Dz.U. 2018 poz. 1286* ze wszystkimi nowelizacjami). Wstrzykiwane są limity z frakcjami (wdychalna, torakalna, respirabilna) i notacjami (skóra, rak).  
  2. **Poziom 2 (API ECHA / PubChem Resolver):** Jeśli CAS znajduje się w rejestrze REACH/CLP, ale nie ma go w polskim wykazie NDS, system **nie wstawia pustego pola**, lecz obligatoryjną formułę urzędową:*„Dla substancji \[Nazwa IUPAC\] (CAS: \[Numer\]) w Rozporządzeniu MRPiPS z dnia 12 czerwca 2018 r. (Dz.U. 2018 poz. 1286 z późn. zm.) nie ustalono krajowych wartości najwyższych dopuszczalnych stężeń w środowisku pracy.”*  
  3. **Poziom 3 (Bramka Błędu Krytycznego \- HALT):** Jeśli CAS nie odpowiada w API PubChem, posiada błędną sumę kontrolną lub nie występuje w bazach ECHA, następuje natychmiastowe zablokowanie kompilacji dokumentu.

### **ADR-002: Izolacja Zwrotów Łączonych CLP i Nowych Klas Zagrożenia ATP**

* **Status:** Zaakceptowane / Obowiązujące bezwzględnie.  
* **Decyzja:** Baza zwrotów H i P zawiera 100% kodów unijnych z Rozporządzenia CLP, w tym:  
  * Wszystkie zwroty łączone H i P jako autonomiczne, nierozerwalne jednostki słownikowe (np. P301+P330+P331).  
  * Nowe zwroty unijne EUH (EUH380, EUH381 dla substancji zaburzających układ dokrewny; EUH430, EUH431, EUH440, EUH441 dla PMT/vPvM) z Rozporządzenia Delegowanego (UE) 2023/707.

### **ADR-003: Zasada Bezwarunkowej Izolacji Europejskich DNEL/PNEC**

* **Status:** Zaakceptowane / Obowiązujące bezwzględnie.  
* **Decyzja:** Zastąpienie włoskich norm higienicznych polskimi NDS nie może niszczyć wartości DNEL i PNEC. Wartości te są ekstrahowane mechanicznie z sekcji 8 włoskiej karty i scalane w polskiej Sekcji 8.1.1.

## **4\. Definicje Narzędzi dla Agenta w Antigravity (Agent Tools / Function Calling)**

W środowisku Antigravity Agent ma dostęp do zestawu deterministycznych narzędzi ułatwiających audyt i kontrolę przepływu.

### **Narzędzie 1: resolve\_chemical\_cas\_via\_api**

Odpytuje otwarty rejestr chemiczny API w celu pobrania znormalizowanej nazwy IUPAC, wzoru chemicznego i statusu rejestracji ECHA.

{  
  "name": "resolve\_chemical\_cas\_via\_api",  
  "description": "Odpytuje otwarte API PubChem/ECHA w celu identyfikacji substancji na podstawie numeru CAS, pobrania nazwy IUPAC i walidacji rejestracji.",  
  "parameters": {  
    "type": "object",  
    "properties": {  
      "cas\_number": {  
        "type": "string",  
        "description": "Poprawny numer CAS substancji (np. '67-63-0')"  
      }  
    },  
    "required": \["cas\_number"\]  
  }  
}

### **Narzędzie 2: query\_polish\_nds\_register**

Weryfikuje, czy dany numer CAS lub nazwa chemiczna posiada przypisane prawnie normy NDS, NDSCh, NDSP w Dz.U. 2018 poz. 1286\.

{  
  "name": "query\_polish\_nds\_register",  
  "description": "Przeszukuje pełną bazę polskich norm NDS/NDSCh/NDSP (Dz.U. 2018 poz. 1286\) dla zadanego numeru CAS.",  
  "parameters": {  
    "type": "object",  
    "properties": {  
      "cas\_number": {  
        "type": "string",  
        "description": "Numer CAS do weryfikacji w polskim rejestrze"  
      }  
    },  
    "required": \["cas\_number"\]  
  }  
}

## **5\. Hermetyczny System Prompt dla Agenta w Antigravity**

Poniższy prompt stanowi **bezwzględną dyrektywę operacyjną** dla modułu LLM w środowisku Antigravity. Odbieganie od wytycznych jest zablokowane na poziomie architektury promptu.

JESTEŚ AUDYTOREM CHEMICZNYM I REGULACYJNYM SYSTEMU KART CHARAKTERYSTYKI (SDS) W ŚRODOWISKU ANTIGRAVITY.  
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ART. 31 ROZPORZĄDZENIA REACH (UE 2020/878) ORAZ ROZPORZĄDZENIA CLP (WE 1272/2008).

TWÓJ ZAKRES ODPOWIEDZIALNOŚCI:  
1\. CAŁKOWITY ZAKAZ MODYFIKACJI SEKCJI DETERMINISTYCZNYCH:  
   \- Sekcje 1, 2, 3, 8, 13, 15 są przetworzone deterministycznie przez silnik Node.js i odpytania API. Pod żadnym pozorem nie wolno Ci modyfikować numerów CAS, kodów H/P, limitów NDS ani szablonów prawnych RP.  
2\. TRANSLACJA PRECYZYJNA SEKCJI OPISOWYCH (SEKCJE 4, 5, 6, 7, 9, 10, 11, 12, 14, 16):  
   \- JĘZYK: Oficjalna polska terminologia chemiczno-medyczna i instruktażowa. Zero potoczności.  
   \- SEKCJA 4 (Pierwsza pomoc): Instrukcje muszą być jednoznaczne, kategoryczne, bezinterpretacyjne (np. "Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ lub lekarzem").  
   \- SEKCJA 11.2 i 12.6: Bezwzględny wymóg prawny formatu (UE) 2020/878. Musisz jednoznacznie podać informację o właściwościach zaburzających funkcjonowanie układu hormonalnego (brak danych, negatywna ocena lub obecność na liście kandydackiej ECHA).  
   \- SEKCJA 14 (Transport): Obowiązuje wyłącznie oficjalna terminologia Umowy ADR (np. "MATERIAŁ ŻRĄCY CIEKŁY KWAŚNY NIEORGANICZNY, I.N.O."). Zakaz własnych translacji nazw UN.  
3\. KRYTERIUM BRAKU DANYCH:  
   \- Żadna podsekcja nie może pozostać pusta ani zawierać znaków zastępczych (typu "\[...\]", "TBD", "placeholder").  
   \- W przypadku braku danych źródłowych jedyne dopuszczalne prawnie formuły to: "Brak dostępnych danych" lub "Nie dotyczy".  
4\. WALIDACJA STRUKTURY WYJŚCIOWEJ:  
   \- Wynik musisz zwrócić jako poprawny obiekt JSON zgodny ze schematem 'agent\_translated\_sections.json'.  
   \- Jakikolwiek błąd parsowania JSON natychmiast wstrzymuje kompilację.

## **6\. Schemat Przepływu Danych i Bramki Jakościowe (Quality Gates)**

                  \[Wejściowy plik PDF włoskiej SDS\]  
                                 │  
                                 ▼  
                     ┌───────────────────────┐  
                     │ KROK 1: Silnik Node   │  
                     │  sds\_processor.js     │  
                     │       extract         │  
                     └───────────┬───────────┘  
                                 │  
                                 ▼  
                     ┌───────────────────────┐  
                     │ Odpytanie REST API    │  
                     │ (PubChem / ECHA CHEM) │  
                     └───────────┬───────────┘  
                                 │  
                                 ▼  
             \[BRAMKA KONTROLNA 1: Integralność CAS/CLP/API\]  
              Czy wyekstrahowano wszystkie składniki z Sekcji 3?  
              Czy odpowiedź API potwierdziła tożsamość CAS?  
              Czy zwroty H/P posiadają 100% pokrycia w słowniku CLP?  
                     │                      │  
                   (TAK)                   (NIE) ──\> \[HALT: Status BLOKADA\_CLP\_API\]  
                     │  
                     ▼  
             \[agent\_payload.json wygenerowany\]  
                     │  
                     ▼  
       ┌───────────────────────────────────────────┐  
       │ KROK 2: Agent Antigravity (LLM \+ RAG)     │  
       │ Przekład techniczny sekcji opisowych      │  
       │ (Terminologia ECHA / ADR / Medyczna)      │  
       └─────────────────────┬─────────────────────┘  
                             │  
                             ▼  
             \[BRAMKA KONTROLNA 2: Walidacja Formatowa\]  
              Czy Agent przetłumaczył wszystkie 10 sekcji opisowych?  
              Czy zachowano podsekcje 11.2 i 12.6 (Endocrine)?  
              Czy plik JSON jest syntaktycznie bezbłędny?  
                     │                      │  
                   (TAK)                   (NIE) ──\> \[HALT: Status ODRZUCENIE\_LLM\]  
                     │  
                     ▼  
        \[agent\_translated\_sections.json\]  
                     │  
                     ▼  
       ┌───────────────────────────────────────────┐  
       │ KROK 3: Asemblacja Końcowa (Node.js)      │  
       │ sds\_processor.js build                    │  
       │ Wstrzyknięcie wektorowych piktogramów GHS │  
       │ Kompilacja edytowalnego dokumentu Word    │  
       └─────────────────────┬─────────────────────┘  
                             │  
                             ▼  
             \[BRAMKA KONTROLNA 3: Walidacja Prawna DOCX\]  
              Czy wstawiono dynamiczną paginację {PAGE} z {NUMPAGES}?  
              Czy Sekcja 8 zawiera pełne dane NDS lub formułę ustawową?  
              Czy dołączono Protokół Weryfikacji dla Chemika?  
                             │  
                             ▼  
         \[Karta\_Charakterystyki\_PL.docx – ZATWIERDZONA\]

## **7\. Procedura Wykonawcza w Środowisku Antigravity**

\# 1\. Instalacja wymaganych zależności środowiskowych  
npm install docx pdf-parse

\# 2\. Ekstrakcja danych, automatyczne odpytanie REST API i generowanie payloadu  
node sds\_processor.js extract input\_sds.pdf agent\_payload.json company\_config.json "PELNA\_NAZWA\_PRODUKTU"

\# 3\. Wywołanie Agenta w Antigravity (przetłumaczenie sekcji opisowych zgodnie z System Promptem)  
\# Wynik zapisywany w pliku agent\_translated\_sections.json

\# 4\. Asemblacja dokumentu Word z audytem prawnym i wygenerowanymi piktogramami  
node sds\_processor.js build agent\_payload.json agent\_translated\_sections.json Karta\_Charakterystyki\_PL.docx

Tak skonfigurowany pipeline łączy determinizm lokalnych rejestrów prawnych, bieżące odpytywanie otwartych interfejsów REST API chemii unijnej oraz bezwzględną dyscyplinę językową modułu LLM w Antigravity.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAAZCAYAAACSP2gVAAADzUlEQVR4Xu1XS2hTQRR9ISqKH/yF1DTJS5pIIeiiFhEqgiIoIlqh/hYWVHBREN0IloIgUrduuhCsq27cKHVl0WrBjVBQMW6sUD9oUUFbaEuhYKGe896dejsmMVEpQd6Bw7y5c2benTsz981znAABAgSoDoRisdj6ZDK5PQXYjY2NjYuz2WyEOtueSCRi2kbQ5rpuUzqdjjpWH4Ww0TnFNdUBOPkEHAHfglNgVyQSWWHaZSLD4DewH+yWPuOI52U1FMfaBT4VDcu8bleaV0qXxzjbbF1VAM51gS2OWkXUv4Az2FFnWGeAMIGXMpluPB/TASS4m9B2C30+aDvqOdrZbnTUYMyMpfmkdVWBaDS63PV3xLA+KnD4MWyz4G1zjPD8DOVW3V/DTBLloLbzaOqAUEcNuEZr0DdvB64aEIJj1+DY/fr6+pXGCNuABKifQSwnQNhVzdJnQNs5Lmwz4H6lG9DvEw3fOacrBrsfxqvR7UBYB99COJPJJJhv8bwoHo9vdMrIfxSEtYGrKZPtYt0EiHkCLz8AXudE9XFAvb1EgGbR3qZ0xQI0p9NQOZDjU0M/BvH8BvwMXuKRR3kBfA1OgEPgFhkihD7HxXYD7AW/go+0H2WhtrZ2HTpOwYEjxoYjsAoveKBteN4N3SR3H+tlBKhd6UoFyNMVAncwNKNY+c3aLu/tg32Z6ExAGYQGLibKadgPqj4NYG9FAZJE6yVh5zdbTzkxzfpCBogLpu12Px4x2WGj0qcJHHf9L/QdBDLrWKemHITRuQMcsRsKgU4mJZmzvpABslfd7qfG8wLk+LmWx++7+EgOpSq4WoQw2Yvo9FwSl4NyLQbfIbvqqut/oVpNBz0p1lOlkzQn0Kx0pQLk6QrhLwLkoa6uLgldm+vf5+jrezPfkoDwNHMJyg3GJhPpkXYvQUJzN5fLLZH2GtdPiF6AXP9M88zPuxiKjsHNKV1ebuZaw7HmdIXwpwHCjX4PnjtNuyz6FXCGATP2goBDh/mCQjSryeSM+j3uKtZNruILuPPMWNAfgm3K+Zm/uLU76KDRENTQbnR8ps3WWeBY+8BJBtQYxRf622m+qvjQxF3/lj4G7U5ZbF4h+E4v9zBho/4O5SYz1i/QW7sA9fbkETwH20ewB3wBTsB23pmf7DiJs+BNtB1lCY7RrjQMCDVjSseJnLR1BuqDQL8Me7hrLBt3+QnbBt0p1/e5L+X/ETx0/StCyTtXxZCj0IJyL7jabjfgitEp6uxfEgNeJ4yumOZfAe9YSvKZmyLt/0RX/BULECBAgAABAvw3+AGHMZRWMo4rxAAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD0AAAAZCAYAAACCXybJAAADRUlEQVR4Xu1XTUhUURR+gwUGFUUN2fy9GWdqQGphQyguoja5CMpVRNTCRZBQbQySqBbRMoJo12SIIC2iIghaFFIQUSBRuTHQFhklaEGJ4EKo73PO0eOdaaYsRon3wce999xzzjvnvPPunfG8AAEC/K+ocdexWCyKMeTIvUQisb6+vn5rLpdb6e4p4vF4xPf9llQqtckr4WPJkc1m1yDA7+BzMC+cQHI9yWSyVvUg2wzeBUchv4/xE3ROeU7BIN8DDogfjm/s/rKAJN2rCSORY64O5IfBGewdVRkLAtkD8D3XfPOY34LOh3nL2c5ooLxcZ1QdTBoJHHDlFpLcJNp1lyO/Bv7gXJLj239pdTKZTJiFQMunrXxJ8ZtJD4NfEPhOK4ddlyZNH5yD/VZHOmkG3GflLqjH80LX8FfndEcNzwirY5FOp+PYz0YikY1YrvDKnSWSdBvYLG8uHw6HV1sdJlwuaba6zn+RNHU6rFwhhx6LStte6DWxWzD/DE6B5xkPxnfgiF84f4aMixBsDkF2HXYnMd4Dx/lco1OEEJTPcFQBjD6Cg9FoNCbrsklL4Sol3WXlLuQZY7g1thvZOfH5UGWmSI1cJwsdNq37BPcqJV0EBs6HyelctaTxvKc4A9aqTH1aW7Y3O0FjwX4L+A28A712FC3jFV/BlQEHfZJAH5ahaiVNW/uGSiUt/vpNLIzvtDxbadu/GHB4HJW74C1sb15hNJ4Nwv/7g4yBVzosF5u06nZA/gicoA3e+Ba7Pwd1AL7C97tB5WLMBLrNehqn495561l5N/Vk3giO+86PEQRT5xeusgYrd+EvMmnGhPUl3ZffCxdZBJUVAZtNTlXYLrxi8npl8EDDehB8Av11YtfMQDFeVUPM2yCbog/j66xbrBKg3iT4jEWiQIK/wqRtUhLLAPR2c50sdNiMZ75jFGQ/uE3XJQGjUfA2E+VhgvEyCrHK0dkBDoEvwE5wDLo9zvXG4E+AN7B3kCP4lXKjswDOlaXUz2uO8HfElwPWcBhJt2N8jfEtxpvgY3DEfU4R+PbAVjpg5dx9BavPCjMh/OlIuPsK+hBfre6d/6+RLPxGqGXbs4Cpwp+cPz+9AwQIECBAgOWFn4UWQLLxg2/NAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAAZCAYAAACSP2gVAAADQElEQVR4Xu1XS2hTQRR9IQoVVBQNan7v5aOBoos2SKUL0Y0ignUlIgq6LIgbXZSCG+nSjbjzA+LGlRZB6EItLhVcGF1YwR8KVdAGbCkUDMRz8mbS6yV5zxgXsbwDh5l358xk5sw3jhMhQoQIPYZ8Pp/VMYlsNrsRmh3lcnm1LrPIZDJJ13WHc7ncFnzGdLlB3Oqc9preged5W9HZy+C8LiMQ3wbeAz9Dex/pLMw6h6K40u0Hn4PXTVqR5ULzWugqaHNI63oFca6KUqm0Dh2dButagNgJsAbdKRvDgPoQewC+5zdXFPJ3oPm0XLOx4voZtyuOKTVYPQWlmZW6nkOIQTRiAVtmr4pftXo7SKTPpKZYLCakIdRRw0mRGtStaON6CiEGvQXn0PndMo5VNGb1yI8wzzakxrRbAw8L3TTjSsPfburaQdfj0SDLHbMjVMwiXigUMslkcjPyq9Lp9HbnT8+/EIPmggzidrP5NgZRMyrqtDOoqZMwhzknie1TM8RViPw78At4MZFIrEV6AXwDzoMz4KBpIoY6x03sGjgJfgMfy34EohuDzEyGGTQm6gQZ1NC1An+f/cDM75Jx87tTiK8xOmsoTRjw/FW7hPgRUWcAnFyRBuHMWi/juh63mFlhjT4jHQZ/gIvgXRhZdNTtG4r/ySA967qeaM/2Oeb62++n6SM543XytAgxqNtDmgMYEboggxq6VujCoAb4CIZuFPHvpq8fzUEdjhCDHoJLuOYPqPhNq3f9Pc09/9vD0PMfoLz++4WuwqtdaXi4NnWt8LcGsd/IT9hy82a7BNZomI0HAkLP9V+2df1YS6VSacRfgU8g22D0e9gBpFesDvmjiC06y1cnl/Z4C2N5FoxbHfOMaZ0C2zoELtBQGzSDrYMTtt+mvxxLFdp9nr9q+YTgbzbOHh7Y+P6AdKdtqyXsFmhFNmx1+B50/WvyKXge/IrZvsXrVTTHQZwFb6DsGFOwyrjQsC1qqkLHgZzWOgtxK9UFb3vL516TaO+kjkF3BukLcAr5l0gfuf4TIfDN1TE4Q5wRDiroTy2NZafAg8rAJjDLm6yuneZfwfPfaX3Mc0Hk/D/Rnd1iESJEiBAhQoSVhF9Suohmw1XQ0AAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAAZCAYAAACSP2gVAAADvklEQVR4Xu1XXUhUQRi9yxYY/dDfsrru7t11twSpB5UwjKJeiggy6JcwqKAHIXopSIRewucgfMuC8KWXSoJAwpJ6iYKIth4yMIsSE0qhRBAS7Jy93+jntLu6GbTEPXCYmW/OzHzzzc+d6zg+fPjwURoIRCKR9fF4fFsCsCs1oFlTVVW1sb6+fqldZxCLxSKu6zYmk8kwigG7XhA0Oie/pjQAJ5+CQ+AgOAF2hEKhFZamArwLfkYM7yEdRrDOoSpo6XaBL8BOSTO6XmneKl0GfTbYupIAgwEedNQqojwCTiEAZ6R8XMonjAYTKoPtPjjIMncU8reg+WQ0BMo1tJsdx5Qa7J6UpRnWupJAOBxeDqd6wQFud2OHw09gmwZvy8QZiHEcmR26vesFd1raZCeJ9LnWpNPpkA4IddTwqGoN2mbswJUCAnDsChx7UF1dvdIYYeuTAPVKEAfAUTi/RTfGLmo1AUK+Sdr0aQ37hW0K3Kd0fXo80XDMGV0+2O3QX7muB4I6+BaCqVQqxvsW+SXRaHSDs4D7jwL7HsnIZDukPFooQDxuJp8nQNS0qDb5AjSj05DLnIvE/qlp4C5E/j34BbzEOxPpBfAd+APsB+ukiwDaHBPbNbAb/Ao+0n4sCJWVlevQcAIOHDY2d54AyUrOF6BW1aZQgLK6XOD49AMrv1nbZdwe2JeJzgSUQahNeLt2Evb9qk0t2F1UgOS+6USHR525l3ZJBQh31iptt9vxiMkOy/qMtBH87npf6DsIZNqxTs1CEETjNnDIruBAZjBt/1cBslfdbqf6Mz7zruXx+yk+kv2JIp4WAUT8Ihq9lIvLQboWnW+XXbXYS5oTaFK6QgHK6nJhEQHKAg/cOHQtsH8TXz+a+RYEhKf5JUNaYWwykS6p51NgEp/53bOtsvYbHEjyPNM883Mehuin3PU+/zVKl+Gn3dLwcp3R5cKfBoh+I99u6mXRL4NTDJix5wQcOsQBctGsJi7uKMpvwMewraYN6VaUR5FeNX0hfwC2CWf2/uLWbssRWN4FbUbHPG22zgL72guOM6DGKJOlv+3mkSn+8pU+Bu1OzsP1nhAcM3v38MJG+QPSTaav36C3dg7O2Z4o17neZ/IZeB4cQXBvWr8knMRZ8DrqjjAFx2hXGvZFzZjScSInbZ1BzPrMC7u4ayzbNPprtm3QnUL6CuxB/jXSh673RCj45ioaXCGuCCfF82zXG3DF6BS4x/6nM+Bzwujyaf4WEt47rYx5boqk9xNd9FfMhw8fPnz48PHf4BdW4p1N4tLAsAAAAABJRU5ErkJggg==>