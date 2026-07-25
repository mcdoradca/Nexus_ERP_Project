# 📙 RAG SOT 03: OŚWIADCZENIA I CLAIMS W KOSMETYKACH (ROZPORZĄDZENIE 655/2013)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 3
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 4 (INCI Parser), Agent 5 (Legal Sanitizer), Agent 6 (Copywriter)
**Stan prawny:** Rozporządzenie Komisji (UE) nr 655/2013 + wytyczne nadzorcze UOKiK i TSUE (stan na lipiec 2026 r.)

> **Nota o źródłach (higiena RAG):** Ten plik jest **jedynym źródłem prawdy dla kryteriów oświadczeń (claims)** oraz **sanityzacji opinii konsumenckich**. Ogólne zakazy medyczne i słownictwo → SOT 02. Limity stężeń → SOT 04.

---

## 1. 6 ZŁOTYCH KRYTERIÓW OŚWIADCZEŃ (THE 6 PILLARS OF CLAIMS)

Każde oświadczenie tekstowe, graficzne, wizualne lub symboliczne dotyczące działania kosmetyku musi spełniać łącznie 6 kryteriów prawnych:

1.  **Zgodność z prawem:** Zakaz sugerowania, że produkt posiada zezwolenie lub aprobatę urzędów (np. „Zatwierdzony przez Ministerstwo Zdrowia / UE").
2.  **Prawdziwość:** Zakaz deklarowania obecności składnika, którego fizycznie nie ma w recepturze produktu (np. „z witaminą C", gdy w składzie jest tylko śladowy zapach cytrusowy).
3.  **Dowody naukowo-aplikacyjne:** Każde twierdzenie o skuteczności (np. „redukuje zmarszczki o 20%", „nawilża przez 24h", „rozjaśnia przebarwienia") musi mieć pokrycie w rzetelnych, nowoczesnych badaniach aplikacyjnych lub aparaturowych zawartych w bazie wiedzy (PIM/RAG).
4.  **Uczciwość:** Zakaz wyolbrzymiania działania wykraczającego poza dostępne dowody. **Zakaz automatycznego przenoszenia właściwości składnika na cały produkt** – nie wolno twierdzić, że gotowe serum ma daną właściwość tylko dlatego, że ma ją jeden ze składników, o ile nie udowodniono tego dla gotowej formuły (np. „zawiera aloes, więc leczy oparzenia").
5.  **Uczciwość wobec konkurencji (Fair Play / Anti-Greenwashing):** Zakaz fałszywej unikalności (przypisywania produktowi wyjątkowych cech, jeśli standardowe produkty konkurencji robią dokładnie to samo). **Zakaz oczerniania legalnej chemii** – nie wolno przedstawiać w złym świetle konkurencji ani legalnie stosowanych w UE składników chemicznych (np. hasła „Bez szkodliwego fenoksyetanolu / parabenów / chemii" są nielegalne, bo demonizują dopuszczone prawem konserwanty).
6.  **Jasność i zrozumiałość:** Komunikat musi być precyzyjny, czytelny i dostosowany do percepcji przeciętnego, uważnego konsumenta. Zakaz ukrywania braku skuteczności za skomplikowanym żargonem pseudonaukowym.

---

## 2. TWARDE ZAKAZY W OŚWIADCZENIACH (WHAT IS BANNED)

*   **Chwalenie się prawem (Boasting about the law):** Reklamowanie jako zalety czegoś, co jest powszechnym obowiązkiem prawnym. (Przykłady zakazane: *„Kosmetyk bez freonów"*, *„Nie zawiera metali ciężkich"*, *„Cruelty-Free / Nietestowany na zwierzętach"* – bez zewnętrznej certyfikacji, patrz SOT 02).
*   **Kłamstwa składowe:** Twierdzenie *„olejek z róży"*, gdy produkt zawiera wyłącznie syntetyczną kompozycję zapachową o nucie róży.
*   **Obraz to również Claim:** Wyświetlenie na grafice miniatury plastrów ogórka lub liści aloesu, podczas gdy tych składników nie ma w INCI lub występują w stężeniu poniżej progu aktywności biologicznej, jest nielegalną manipulacją.
*   **Oświadczenia zależne od warunków:** Jeśli efekt działa tylko w połączeniu (np. *„szampon zapobiega łupieżowi – przy jednoczesnym stosowaniu z naszą odżywką"*), warunek ten musi być jasno i wyraźnie wyeksponowany w głównym bloku tekstu.

---

## 3. CO JEST DOZWOLONE W COPYWRITINGU AEO? (WHAT IS ALLOWED)

*   **Hiperbola marketingowa (Abstrakcja i Przesada):** Twierdzenia w sposób oczywisty przesadzone lub abstrakcyjne, których żaden rozsądny konsument nie bierze dosłownie (np. *„Dodaje skrzydeł"*, *„Królewski dotyk luksusu"*, *„Zapach, który przeniesie Cię do raju"*), są w pełni dozwolone i nie wymagają badań laboratoryjnych.
*   **Skuteczne stężenie:** Można opisywać mechanizm działania konkretnego składnika aktywnego (np. *Luminescine®*, *Witamina C*), pod warunkiem, że znajduje się on w produkcie w stężeniu efektywnym (potwierdzonym przez producenta surowca) i nie przypisuje mu się cech leku.
*   **Język Korzyści AEO (Problem & Answer):** Najskuteczniejszą formą oświadczeń jest mapowanie problemu konsumenta na rozwiązanie technologiczne poparte badaniami aplikacyjnymi (np. *„Problem: szara skóra → Answer: 95% testerek potwierdziło natychmiastowy efekt rozświetlenia po 7 dniach stosowania"*).

> ⚠️ **Uwaga o liczbach z bazy wiedzy (spójność z SOT 05/06/09):** Wartości typu „95% testerek", „redukcja o 20%", „6000x silniejszy antyoksydant" mogą wejść do opisu **tylko** jeśli mają pokrycie w badaniach aplikacyjnych/dokumentacji surowcowej danego produktu w PIM. Dane porównawcze o składnikach z SOT 05/06 to wiedza tła – NIE wolno ich przenosić 1:1 jako claimu o gotowym produkcie bez dowodu (kryterium 3 i 4).

---

## 4. SANITYZACJA OPINII KONSUMENTÓW Z SIECI (SOCIAL PROOF SHIELD)

Zgodnie z prawem UE i wytycznymi UOKiK, **sprzedawca ponosi 100% odpowiedzialności prawno-finansowej za każdą recenzję, komentarz lub opinię z sieci, którą zacytuje lub zintegruje w swoim opisie produktu na Allegro/sklepie**. Operacyjnie realizuje to Agent 5 (Legal Sanitizer) na danych od Agenta 2 (Sentiment Scraper).

*   **Reguła Sanityzera (Agent 5):** Jeżeli w bazie wiedzy (zescrapowanej po kodzie EAN) znajduje się autentyczna opinia klienta o treści: *„Ten krem L'Erboristica wyleczył moją łuszczycę i zlikwidował trądzik różowaty"*, Agentowi AI **bezwzględnie nie wolno wkleić ani użyć tego cytatu w sekcji AEO Answer**.
*   **Procedura naprawcza:** Agent 5 musi wykonać ekstrakcję semantyczną – usunąć nielegalne roszczenie lecznicze i przetłumaczyć je na bezpieczny język kosmetologiczny (np. *„Krem zapewnia intensywne ukojenie podrażnień, redukuje widoczne łuszczenie i wspiera naturalną regenerację barierową skóry"*).
