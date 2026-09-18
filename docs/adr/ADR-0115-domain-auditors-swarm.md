# ADR-0115: Dekompozycja Audytora Prawnego na Klaster 4 Ekspertów Dziedzinowych w Kartach SDS

## Status
Zaakceptowane (18.09.2026)

## Kontekst
Zauważono ryzyko wynikające ze zbytniego polegania na jednym globalnym agencie ds. prawnych (`RegulatoryAuditorAgent`) przy weryfikacji wszystkich 16 sekcji kart charakterystyki (SDS). Karty te obejmują ogromne i różnorodne spektrum prawa: od klasyfikacji ADR, przez toksykologię środowiskową, ratownictwo medyczne, procedury PPOŻ, limity NDS, aż po prawo odpadów (BDO). Brak fragmentacji wywoływał ryzyko utraty kontekstu (hallucination drift) oraz uniemożliwiał weryfikację współzależności.

## Decyzja
Zdecydowano o całkowitym usunięciu i trwałej dekompozycji ogólnego agenta audytorskiego na 4 wyizolowanych specjalistów:
1. **`HazardClassificationAuditorAgent`** (Sekcje: 2, 3, 9, 14, 15)
2. **`HealthEnvironmentAuditorAgent`** (Sekcje: 4, 11, 12)
3. **`WorkplaceSafetyAuditorAgent`** (Sekcje: 5, 6, 7, 8, 10, 13)
4. **`AdministrativeAuditorAgent`** (Sekcje: 1, 16)

Zmodyfikowano również `SDSSwarmOrchestrator`, wdrażając inteligentny ruter, który kieruje wyekstrahowaną sekcję z tłumacza bezpośrednio do przypisanego eksperta dziedzinowego.

## Konsekwencje
1. Zwiększenie bezpieczeństwa (Safety Critical System): Agenci weryfikujący pierwszą pomoc i BHP nie są już obarczani wiedzą o kodach ADR czy klasyfikacjach ekotoksycznych, co pozwala na precyzyjniejszy audyt.
2. Współzależności (Coupling): Grupowanie sekcji wymusza ujęcie integralności. Audytor ds. Hazard widzi i sekcję 2 (zagrożenia), i sekcję 3 (skład), więc nie dopuści do zniknięcia np. klasyfikacji korozyjnej po stronie składników.
3. System stał się bardziej niezawodny (100% zgodności), realizując ideologię Zero-Bypass dla danych wstrzykiwanych do DocxExporter.
