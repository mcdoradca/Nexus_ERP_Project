# ADR-050: Korekta Danych Dostawcy SDS (1.3, 1.4) i Eliminacja Paginacji PDF (Sekcja 11.1)

## Kontekst i Problem Biznesowy
Podczas audytu wygenerowanych kart charakterystyki (SDS) w formacie DOCX wykryto następujące niezgodności regulacyjne i wizualne:
1. **Sekcja 1.3 (Dostawca karty):** Pojawił się niepotrzebny blok zagranicznego producenta wraz z jego danymi teleadresowymi. Zgodnie z art. 31 Rozporządzenia REACH (WE 1907/2006) na terytorium RP dostawcą karty charakterystyki odpowiedzialnym za wprowadzenie produktu do obrotu jest wyłącznie podmiot krajowy. Prawidłowe dane dla każdej karty to:
   ```
   Firma: MITRANS Weronika Grzesiak
   Adres: ul. Wesoła 16, 63-600 Kępno, woj. wielkopolskie
   E-mail: kontakt@prostozwloch.com.pl
   Telefon: +48 663116607
   ```
2. **Sekcja 1.4 (Numery alarmowe):** Do urzędowych numerów ratunkowych w Polsce (112, 998, 999) doklejany był numer telefonu producenta zagranicznego.
3. **Sekcja 11.1 i sekcje LLM (Artefakty paginacji):** Do treści podsekcji 11.1 została wklejona i przetłumaczona przez model stopka strony z pliku źródłowego PDF (np. `Strona n.of49\n07/03/2026Nazwa produktu SWEET HOME LAYALI...`).

## Podjęte Decyzje Architektoniczne

1. **Ujednolicenie i czystość Sekcji 1.3:**
   - W `SDSProcessorEngine.processSection1` usunięto parsowanie oraz generowanie bloku producenta zagranicznego.
   - Sekcja 1.3 generuje wyłącznie oficjalne dane dostawcy w Polsce (MITRANS Weronika Grzesiak) z zachowaniem pełnej konfiguracji (`companyConfig` z fallbackiem na oficjalne dane).
2. **Oczyszczenie Sekcji 1.4:**
   - W Sekcji 1.4 pozostawiono wyłącznie polskie numery alarmowe (112, 998, 999), całkowicie eliminując telefon producenta.
3. **Pancerna filtracja stopek i paginacji (`cleanPdfArtifacts`):**
   - Opracowano chirurgiczny zestaw wyrażeń regularnych:
     - Wycinanie linii paginacji (`Page n.of49`, `Page 1 of 9`, `Strona 1 z 9`, `Pagina 1 di 9`): `/(?:^|\n)\s*(?:Page|Strona|Pagina)\b[^\n]*/gi`
     - Wycinanie linii stopki zaczynających się od daty: `/(?:^|\n)\s*\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)?[^\n]*/gi`
     - Wycinanie linii stopki kończących się znacznikiem Date/Data: `/(?:^|\n)\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)\s*[:\.]?\s*[^\n]*(?:\bDate|\bData)\s*$/gim`
   - Zabezpieczono nazwy handlowe (`Trade name`) w Sekcji 1.1 przed przypadkowym wycięciem.
   - Wdrożono podwójną tarczę:
     - Przed wysłaniem tekstu sekcji do LLM (`prepareAgentPayload`),
     - W `SYSTEM_PROMPT` agenta (zakaz przetwarzania paginacji),
     - Po odebraniu odpowiedzi od LLM w `mergeCompletedSds`.
4. **Typografia DOCX:**
   - Zaktualizowano `isBoldStart` w `SDSDocxExporter` o klucze `Firma`, `Adres`, `E-mail`, `Telefon`, gwarantując profesjonalne pogrubienie etykiet w Sekcji 1.3.

## Konsekwencje i Rezultaty
- Karty DOCX są w 100% wolne od obcych danych producenta i spełniają wymogi REACH w RP.
- Podsekcja 11.1 oraz pozostałe sekcje generowane przez LLM są wolne od artefaktów stopki i paginacji PDF.
