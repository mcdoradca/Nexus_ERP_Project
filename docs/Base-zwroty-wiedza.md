## **Pobieranie danych o zwrotach z Allegro przez BaseLinker API**

Aby proces integracji był stabilny i gotowy do wdrożenia w środowisku produkcyjnym, należy zastosować odpowiednią architekturę zapytań, uwzględnić limity platformy oraz prawidłowo wyizolować wyłącznie zwroty pochodzące ze źródła, jakim jest Allegro. Poniżej znajduje się kompleksowa specyfikacja techniczna oraz w pełni zdatna do użycia implementacja.

---

### **1\. Architektura Zapytania i Autoryzacja**

Komunikacja z BaseLinker odbywa się za pośrednictwem żądań **POST** kierowanych na jeden, centralny endpoint.

* **Endpoint URL:** `[https://api.baselinker.com/connector.php](https://api.baselinker.com/connector.php)`  
* **Autoryzacja:** Jest realizowana za pomocą nagłówka HTTP `X-BLToken`. Swoją wartość tokenu wygenerujesz w panelu BaseLinker, przechodząc do sekcji *Konto i inne \-\> Moje konto \-\> API*.  
* **Format Danych:** System wymaga przesłania dwóch głównych parametrów w ciele zapytania (formatowanych jako standardowe dane formularza: `application/x-www-form-urlencoded`):  
  * `method` – nazwa wywoływanej metody API.  
  * `parameters` – argumenty metody przekazane w postaci ustrukturyzowanego ciągu znaków JSON.

---

### **2\. Wykorzystanie metody `getOrderReturns`**

Główną metodą operującą na zwrotach jest **`getOrderReturns`**. Zwraca ona pełen komplet informacji – w tym powiązanie zamówienia, asortyment, zwrot finansowy dla kupującego (`refund_done`) czy komentarze z powodem zwrotu.

Ponieważ API BaseLinker na etapie żądania nie udostępnia parametru filtrującego per konkretny marketplace (parametry wejściowe to głównie: `date_from`, `status_id`, `return_id`), wyizolowanie danych specyficznych dla Allegro **musi** odbyć się na poziomie Twojej aplikacji, poprzez weryfikację zwróconego pola źródłowego.

#### **Identyfikacja zwrotów z Allegro:**

Zwracana w odpowiedzi tablica obiektów `returns` zawiera klucz:

**`order_return_source`** – dla zwrotów inicjowanych przez Allegro pole to zawsze przybiera wartość **`"allegro"`**. Pozostałe zamówienia to np. `"shop"`, `"amazon"`, etc.

---

### **3\. Wzorcowa Implementacja (Python)**

Poniższy skrypt automatyzuje wywołanie, parsuje odpowiedź i izoluje interesujące nas dane. Posiada zaimplementowaną obsługę błędów na poziomie HTTP oraz logicznym wewnątrz zwracanego statusu API.

Python  
import requests  
import json  
import time

def fetch\_allegro\_returns(api\_token: str, date\_from\_timestamp: int) \-\> list:  
    """  
    Pobiera logi zwrotów z BaseLinker API i filtruje wyłącznie te powiązane z Allegro.  
      
    :param api\_token: Klucz autoryzacyjny API  
    :param date\_from\_timestamp: Data początkowa w formacie Unix Timestamp  
    :return: Lista słowników reprezentujących wyizolowane zwroty  
    """  
    endpoint \= "https://api.baselinker.com/connector.php"  
      
    headers \= {  
        "X-BLToken": api\_token  
    }  
      
    \# Definicja parametrów dla metody API (zapisane następnie jako JSON string)  
    api\_parameters \= {  
        "date\_from": date\_from\_timestamp  
    }  
      
    payload \= {  
        "method": "getOrderReturns",  
        "parameters": json.dumps(api\_parameters)  
    }  
      
    try:  
        response \= requests.post(endpoint, headers=headers, data=payload)  
        response.raise\_for\_status() \# Przechwycenie błędów sieciowych (np. 500, 404\)  
          
        data \= response.json()  
          
        if data.get("status") \== "SUCCESS":  
            all\_returns \= data.get("returns", \[\])  
              
            \# Logika biznesowa: ekstrakcja wyłącznie rekodrów z Allegro  
            allegro\_returns \= \[  
                ret for ret in all\_returns   
                if ret.get("order\_return\_source") \== "allegro"  
            \]  
              
            return allegro\_returns  
        else:  
            error\_msg \= data.get("error\_message", "Nieznany błąd po stronie BaseLinker")  
            raise Exception(f"Błąd logiczny API: {error\_msg}")  
              
    except requests.exceptions.RequestException as e:  
        raise Exception(f"Błąd komunikacji z endpointem: {e}")

\# \--- Środowisko testowe \---  
if \_\_name\_\_ \== "\_\_main\_\_":  
    TOKEN \= "TUTAJ\_WPROWADZ\_SWOJ\_TOKEN"  
      
    \# Ustawiamy punkt startowy np. na 7 dni wstecz  
    seven\_days\_ago \= int(time.time()) \- (7 \* 24 \* 60 \* 60\)  
      
    try:  
        returns \= fetch\_allegro\_returns(TOKEN, seven\_days\_ago)  
        print(f"Pobrano {len(returns)} zwrotów pochodzących z Allegro.")  
          
        \# Wypisanie przykładowych kluczowych parametrów dla pierwszego zwrotu z listy  
        if returns:  
            first\_return \= returns\[0\]  
            print(f"Wewnętrzne ID Zwrotu: {first\_return\['return\_id'\]}")  
            print(f"Referencja Allegro (np. nr transakcji): {first\_return\['external\_order\_id'\]}")  
            print(f"Zwrócona kwota: {first\_return\['refund\_done'\]} {first\_return\['currency'\]}")  
              
    except Exception as err:  
        print(f"CRITICAL ERROR: {err}")

---

### **4\. Kluczowe Aspekty Produkcyjne**

Przy implementacji docelowego modułu synchronizującego, należy uwzględnić poniższe mechanizmy, które zagwarantują niezawodność:

* **Obsługa Limitu Rekordów (Paginacja):** Metoda `getOrderReturns` ma narzucony systemowy limit wynoszący **maksymalnie 100 zwrotów** w jednej odpowiedzi API. Jeśli spodziewasz się większego wolumenu, konieczne jest zapętlenie skryptu. Pobierasz pierwszą setkę, odczytujesz najwyższą datę utworzenia z pobranych wyników (np. pole `date_add`), dodajesz do niej `1` sekundę i z takim wynikiem podmieniasz parametr `date_from` w kolejnym wywołaniu. Pętlę przerywasz w momencie, gdy API zwróci tablicę liczącą mniej niż 100 elementów.  
* **Optymalizacja Cykli API (Rate Limits):** Architektura systemów rozproszonych nie znosi zbędnego obciążenia. Do wdrożenia produkcyjnego zastosuj zadania zaplanowane (Cron Jobs/Task Scheduler) wywoływane w racjonalnych interwałach (np. co 15 minut). Zapisuj lokalnie w swojej bazie (lub pliku referencyjnym) timestamp ostatniego przetworzonego zwrotu, by zawsze odpytywać API tylko o deltę (czyli wyłącznie nowe lub zaktualizowane zwroty).  
* **Wykorzystanie Dodatkowych Danych (Payloadu):** Zwracana odpowiedź zawiera rozbudowany węzeł `products`, operujący na asortymencie. Wewnątrz tego węzła znajduje się pole `return_reason_comment`, do którego BaseLinker zaciąga opis reklamacji lub wady od klienta zgłaszającego – to krytyczna wartość przy budowaniu jakichkolwiek późniejszych analiz dla asortymentu w obszarze zwrotów Allegro.

