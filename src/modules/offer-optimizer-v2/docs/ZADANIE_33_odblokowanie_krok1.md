# ZADANIE 33 — odblokowanie KROKU 1

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Krok 0 zaliczony. Blokada źródeł wynika z użycia złego adresu, nie z zabezpieczeń.

## 1. Zły identyfikator

Pytałeś przez `CELEX:32025D1175`. Ten akt jest dostępny pod identyfikatorem
Dziennika Urzędowego, nie CELEX. Działa wzorzec:

```
https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202501175
https://eur-lex.europa.eu/legal-content/PL/TXT/HTML/?uri=OJ:L_202501175
```

Kolejność prób: HTML → PDF (`/TXT/PDF/` zamiast `/TXT/HTML/`) → Formex XML
(plik `L_202501175EN.000101.fmx.xml` w pakiecie OJ). Dokument ma ponad 30 tysięcy
wierszy, więc licz się z odpowiedzią rzędu dziesiątek megabajtów i pobieraj
strumieniowo do pliku, zamiast trzymać w pamięci.

`HTTP 202` z poprzedniej próby to asynchroniczny tryb CELLAR — nie blokada.

## 2. CosIng może być niepotrzebny — sprawdź to przed pobieraniem

Załącznik do glosariusza ma najprawdopodobniej kolumny obejmujące nazwę INCI,
numer CAS, numer EC, ograniczenie **oraz funkcję**. Jeżeli tak jest, to jedno
źródło pokrywa obie tabele i **CosIng odpada w całości** razem ze swoim 404.

**Po pobraniu podaj nagłówki kolumn załącznika i trzy pierwsze wiersze.**
Dopiero na tej podstawie decyduję, czy w ogóle ruszamy CosIng. Nie szukaj
endpointów CosIng, dopóki nie wiesz, czego brakuje.

## 3. Jeśli pobranie automatyczne nadal nie wyjdzie

Zgłaszasz **jeden** komunikat: dokładny adres, kod odpowiedzi i pierwsze 200
znaków tego, co przyszło. Operator pobierze ręcznie. Nie proś go o obliczanie
`sha256` ani o zakładanie katalogów — to robisz Ty po wgraniu pliku.
