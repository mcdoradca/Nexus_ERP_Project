import re

f = r'z:\Nexus_ERP_Project\.agents\.ai-memory\NES-opis-8-5.md'
with open(f, 'r', encoding='utf-8') as file:
    content = file.read()

# 1. Remove line 667
content = content.replace('* IDP (USUNIĘTY Z SYSTEMU NA STAŁE)\n', '')

# 2. Replace lines 691-694
target_2 = """### Nazwa operacji/zadania: Ekstrakcja Kosztów z Faktur (IDP Skaner Kosztów) [ZDEPRECIONOWANE/USUNIĘTE]

**Po co to jest? (Cel biznesowy):** Moduł został usunięty z systemu z powodu braku użyteczności. Zlikwidowano integrację, endpointy `/api/idp` oraz model bazy danych `InvoiceDocument`. System ERP nie prowadzi już bezpośredniego wgrywania faktur przez UI i agenta Gemini AI."""
content = content.replace(target_2, "")

# 3. Replace lines 828-838
target_3 = """11\. \*\*Admin (Panel Zarządzania i IdP)\*\*  
    \* Bezpieczeństwo i Baza Osobowościowa (Role)  
    \* Panel Zarządzania Kluczami API (AI, BaseLinker, Subiekt)  
    \* Action Logs (Audyt Operacji)  
    \* System IDP (Intelligent Document Processing \- OCR Faktur)  
Oto kompletny i rygorystyczny raport z eksploracji oraz inżynierii wstecznej modułu **Admin (Panel Zarządzania i IdP)**, zrealizowany zgodnie z Twoimi wytycznymi. Przeszedłem przez analizę kodu (Krok 1\) oraz fizyczne testy w przeglądarce w środowisku Nexus ERP (Krok 2).  
Zidentyfikowałem kluczowego Agenta AI pracującego w module IDP:

* **Model:** gemini-3.1-pro-preview  
* **Rola:** Ekstrakcja kluczowych danych finansowych (EAN, cena hurtowa netto, koszt transportu przychodzącego) z surowego tekstu, który został odczytany z faktury PDF przy użyciu biblioteki pdf-parse.  
* **Zabezpieczenia przed halucynowaniem:** W backendzie (idp.service.js) wdrożono twarde ramy – Agent ma nakaz odpowiadać TYLKO czystym JSON-em (bez formatowania Markdown). Następnie wynik podlega "sanityzacji" (usuwanie błędnych tagów), sprawdzane jest, czy obiekt to faktycznie tablica (Array). Co najważniejsze: system i tak bezwzględnie weryfikuje w lokalnej bazie bazy PIM (prisma.product.findUnique), czy dany produkt o odczytanym kodzie EAN fizycznie istnieje, zanim dokona jakiejkolwiek zmiany kosztów, niwelując tym samym wymyślone kody. Zmiany wysyłane są później cicho przez szynę EventBus."""
replace_3 = """11\. \*\*Admin (Panel Zarządzania)\*\*  
    \* Bezpieczeństwo i Baza Osobowościowa (Role)  
    \* Panel Zarządzania Kluczami API (AI, BaseLinker, Subiekt)  
    \* Action Logs (Audyt Operacji)  
Oto kompletny i rygorystyczny raport z eksploracji oraz inżynierii wstecznej modułu **Admin (Panel Zarządzania)**, zrealizowany zgodnie z Twoimi wytycznymi. Przeszedłem przez analizę kodu (Krok 1\) oraz fizyczne testy w przeglądarce w środowisku Nexus ERP (Krok 2)."""
content = content.replace(target_3, replace_3)

# 4. Remove lines 904-920
target_4 = """### Nazwa operacji/zadania: Ekstrakcja Kosztów IDP (OCR Faktury)

**Po co to jest? (Cel biznesowy):** Mechanizm skanowania nowo przybyłych dokumentów dostawy lub faktur, który oszczędza setki godzin ręcznego wklepywania faktur z "kartki" do PIM. Automatyzuje wyliczanie narzutów (takich jak basePrice i inboundTransportCost).  
**Gdzie to znaleźć? (Lokalizacja UI):** Pasek boczny nawigacji (Ikona Pudełka \- PIM) \-\> Widok "Katalog SKU (PIM)" \-\> Górny pasek zadań PIM \-\> Przycisk w kształcie ikony Chmury ze Strzałką w górę (Upload Skanera IDP).  
**Wymagania wstępne (Wiedza z kodu):** Dokument w formacie wyłącznie .pdf o maksymalnej wielkości do 20 MB (walidacja frontendowa po rozmiarze file.size oraz typie application/pdf). Musisz posiadać upewnienie, że pozycje na fakturze posiadają znaki szczególne (EAN lub SKU zgodne z naszą bazą Nexus), aby AI potrafiła je sparować z obiektem Prisma.  
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Przejdź do Katalogu SKU i kliknij przycisk ikony **Uploadu / Skanera IDP** na samym szczycie.  
2. Na pulpicie "IDP: Skaner Kosztów" możesz kliknąć prostokątny, przerywany obrys pola "Przeciągnij fakturę PDF" na środku ekranu, aby wywołać okno dialogowe wyboru plików.  
3. Wybierz przygotowany plik PDF, np. fakturę (na Twoim komputerze leży testowy, przykładowy dokument test\_faktura.pdf).  
4. Upewnij się, że nazwa pliku pojawiła się na środku obrysu, a pod spodem wyświetlany jest mały, czerwony napis "Usuń plik".  
5. Poniżej naciśnij szeroki, ciemny przycisk: **"Rozpocznij Ekstrakcję Kosztów"**.  
6. Czekaj (proces może potrwać do minuty), nie zamykając i nie klikając okna w trakcie gdy na przycisku kręci się wskaźnik ("AI Przetwarza...").

**Wynik operacji (Output):** Gdy proces dobiegnie końca, w lewej części modalu poniżej przycisku pojawia się zielone obramowanie ("Sukces Ekstrakcji"). Wyświetlają się statystyki: liczba odczytanych pozycji z PDF oraz cyfra mówiąca, ile obiektów faktycznie odnaleziono w bazie i zaktualizowano. Pojawiają się także wypisane odczytane numery "EAN". Jednocześnie sam plik wędruje trwale po prawej stronie do sekcji panelowej: **Archiwum IDP**, skąd można go w każdym momencie odczytać klikając w nazwę linku. Od tego momentu pozycje uległy re-kalkulacji założeń marżowych w systemie po ukrytym kanale PRODUCT\_COST\_UPDATED."""
content = content.replace(target_4, "")

# 5. Fix Admin IDP line 942
content = content.replace('Admin["⚙️ 11\. Admin (Panel & IDP)"]:::module', 'Admin["⚙️ 11\. Admin (Panel)"]:::module')

# 6. Replace lines 1029-1035
target_6 = """- Backend: `src/modules/idp/idp.service.js`, `src/modules/rma/rma.service.js`, `src/modules/logistics/logistics.service.js`, `src/core/cron.js`
- API Routy: `src/modules/rma/rma.routes.js`, `src/modules/logistics/logistics.routes.js`
- Frontend UI: `frontend/src/views/ZeroBleedHubView.jsx`, zintegrowane w `frontend/src/App.jsx`
**Wymagania wstępne (Wiedza z kodu):**
1. **Agent IDP (Multimodal Vision):** Usunięto tradycyjny OCR (`pdf-parse`). Agent pobiera faktury jako Base64 PDF, analizuje natywnie w `gemini-3.1-pro-preview` poszukując kosztów. Zbudowano **Tarczę Błędów (Human-in-the-loop)**: Jeśli model zwróci `confidenceScore < 0.98` w JSON, modyfikacja w PIM jest zablokowana, a na panelu (i Kanbanie) trafia jako czerwony alarm do ręcznej weryfikacji. 
2. **Agent RMA Fraud Prevention:** Działa w CRON co 5 minut. Uderza do `getReturnJournalList` chroniąc limity (pobiera tylko delta od `lastLogId`). Konstruuje bazę kupujących z wyłudzeniami. Po 3 zwrotach (3 Strikes Rule) Agent automatycznie wykonuje żądanie API HTTP `/sale/blacklisted-users` i blokuje kupującego na koncie firmy na Allegro. Zabezpieczony dedykowanym widokiem w "Czarna Lista (RMA)".
3. **Agent Wirtualny Logistyk (Zaopatrzeniowiec):**"""
replace_6 = """- Backend: `src/modules/rma/rma.service.js`, `src/modules/logistics/logistics.service.js`, `src/core/cron.js`
- API Routy: `src/modules/rma/rma.routes.js`, `src/modules/logistics/logistics.routes.js`
- Frontend UI: `frontend/src/views/ZeroBleedHubView.jsx`, zintegrowane w `frontend/src/App.jsx`
**Wymagania wstępne (Wiedza z kodu):**
1. **Agent RMA Fraud Prevention:** Działa w CRON co 5 minut. Uderza do `getReturnJournalList` chroniąc limity (pobiera tylko delta od `lastLogId`). Konstruuje bazę kupujących z wyłudzeniami. Po 3 zwrotach (3 Strikes Rule) Agent automatycznie wykonuje żądanie API HTTP `/sale/blacklisted-users` i blokuje kupującego na koncie firmy na Allegro. Zabezpieczony dedykowanym widokiem w "Czarna Lista (RMA)".
2. **Agent Wirtualny Logistyk (Zaopatrzeniowiec):**"""
content = content.replace(target_6, replace_6)

# 7. Line 1079
target_7 = "RMA (ochrona przed zwrotami/wyłudzeniami), IDP (automatyzacja odczytu kosztów faktur z modeli Vision LLM) oraz Virtual Logistics (zaopatrzenie B2B)"
replace_7 = "RMA (ochrona przed zwrotami/wyłudzeniami) oraz Virtual Logistics (zaopatrzenie B2B)"
content = content.replace(target_7, replace_7)

# Remove multiple empty lines that might have been left
content = re.sub(r'\n{3,}', '\n\n', content)

with open(f, 'w', encoding='utf-8') as file:
    file.write(content)

print("IDP cleaned.")
