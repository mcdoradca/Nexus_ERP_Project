# 📓 RAG SOT 07: SŁOWNIK CHEMII DOMOWEJ I MAPOWANIE KORZYŚCI AEO (HOUSEHOLD CHEMICALS & DETERGENTS)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 7
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 6 (Copywriter), Agent 5 (Legal Sanitizer), Agent 1 (PIM Autofill)
**Stan prawny:** Rozp. o Detergentach (WE) 648/2004, Rozp. CLP (WE) 1272/2008, REACH, Rozp. Biocydowe (BPR) 528/2012.

> **⚠️ NOTA O ZAKRESIE (KRYTYCZNA):** To słownik pojęciowy mapujący **grupy funkcjonalne** chemii domowej na Język Korzyści AEO – nie wyczerpujący wykaz surowców. Substancja/mieszanina spoza tych grup → Agent 4/1 weryfikuje pH i klasyfikację z Karty SDS, nie zgaduje. Twarde reguły prawne oznakowania CLP/BPR → **SOT 02** (jedyne źródło prawdy dla wymogów prawnych; tu tylko operacyjne mapowanie korzyści).

---

## 1. NOMENKLATURA I ŻELAZNA REGUŁA BEZPIECZEŃSTWA (COMPLIANCE GUARDRAIL)
Chemia domowa operuje na 3 poziomach: etykieta dla konsumenta (kategorie % wg Rozp. 648/2004), Karta Charakterystyki SDS (nazwy IUPAC, CAS, odczyn pH) oraz Arkusz Danych Składników (pełny wykaz INCI/CAS na stronie www).
* **Zakaz roszczeń biobójczych bez pozwolenia:** Jeśli produkt nie posiada pozwolenia URPL/ECHA na biocyd, BEZWZGLĘDNIE ZAKAZANE JEST pisanie: *„zabija bakterie/wirusy"*, *„dezynfekuje"*, *„zwalcza pleśń"*. Piszemy o *„higienicznej czystości"*.
* **Czarna lista w biocydach (Art. 72 BPR):** W legalnych biocydach zakaz wyrazów: `nietoksyczny`, `nieszkodliwy`, `naturalny biocyd`, `przyjazny dla środowiska`, `całkowicie bezpieczny`. (Pełna lista i disclaimer biobójczy → SOT 02 sekcja 3.)
* **Wzorzec mapowania:** $\text{Substancja z SDS/Etykiety} \longrightarrow \text{Mechanizm Fizykochemiczny} \longrightarrow \text{Bezpieczna Korzyść AEO na Allegro}$.

---

## 2. SŁOWNIK CHEMII DOMOWEJ I MAPOWANIE AEO (10 GRUP DZIAŁANIOWYCH)
1. **Surfaktanty Anionowe (SLES, SLS, LAS):** Główne siły pociągowe. Obfita piana, zwilżanie i odrywanie brudu organicznego/tłuszczu. *Korzyść AEO:* Zmniejszają napięcie powierzchniowe, rozpuszczając trudny tłuszcz bez siłowego szorowania.
2. **Surfaktanty Niejonowe (Glukozydy APG, etoksylowane alkohole):** Odporne na twardą wodę, odtłuszczacze, nie zostawiają smug. *Korzyść AEO:* Wiążą oleje i smary, gwarantując krystaliczny połysk bez mikrowłókien i zacieków na szkle czy meblach.
3. **Surfaktanty Kationowe i Amfoteryczne (Betaina CAPB, Esterquats, Benzalkonium Chloride):** Antystatyka, zmiękczanie tkanin. *Korzyść AEO:* Neutralizują ładunki elektrostatyczne we włóknach, ułatwiają prasowanie, zapobiegają szybkiemu osiadaniu kurzu. *(Uwaga: Benzalkonium Chloride bywa składnikiem biocydowym – sprawdź reżim BPR.)*
4. **Kwasy Czyszczące ($pH < 3$ - Kwas cytrynowy, mlekowy, amidosulfonowy, fosforowy):** Reakcja z węglanem wapnia i tlenkami żelaza. *Korzyść AEO:* Formuła Active Acid błyskawicznie rozpuszcza kamień wodny, osady z mydła i rdzę bez rysowania ceramiki i chromu.
5. **Zasady i Alkalia ($pH > 11$ - Wodorotlenek sodu/soda kaustyczna, węglan sodu):** Saponifikacja (zmydlanie tłuszczów) i rozkład białek. *Korzyść AEO:* Skoncentrowana siła zasadowa rozpuszcza zwęglone przypalenia w piekarniku, tłuszcz na grillu i zatory w rurach.
6. **Środki Wybielające i Utleniające (Nadwęglan sodu, Nadtlenek wodoru, aktywator TAED, Podchloryn sodu):** Niszczenie chromoforów plam. *Korzyść AEO:* Aktywny tlen z aktywatorem TAED wywabia plamy z wina, kawy i jagód już w 30°C, przywracając nieskazitelną biel.
7. **Enzymy Czyszczące (Proteaza, Amylaza, Lipaza, Celulaza):** Biokatalizatory rozcinające łańcuchy brudu. *Korzyść AEO:* Kompleks Bio-Clean dopiera plamy z krwi, trawy i sosów w 20°C. Celulaza zapobiega mechaceniu, chroniąc kolory.
8. **Związki Kompleksujące (GLDA, Cytrynian sodu, Zeolity):** Neutralizacja twardości wody ($Ca^{2+}$, $Mg^{2+}$). *Korzyść AEO:* Zapobiegają osadzaniu kamienia na grzałkach pralki/zmywarki, wydłużając żywotność sprzętu AGD.
9. **Rozpuszczalniki Organiczne (Isopropanol / IPA, Etanol, Butoxyethanol):** Zmniejszają lepkość, odtłuszczają, odparowują. *Korzyść AEO:* Formuła Fast-Dry usuwa brud z luster i frontów na wysoki połysk, odparowując w sekundy bez smug.
10. **Polimery Ochronne (Silikony hydrofobowe, Polikarboksylany):** Film odpychający wodę i brud (*anti-resoiling* / *anti-fog*). *Korzyść AEO:* Niewidzialna tarcza na kabinie prysznicowej – woda spływa bez zacieków, a lustra nie zaparowują.

---

## 3. POTOK POZYSKIWANIA DANYCH (DATA SCAVENGING PIPELINE)
Gdy opis w PIM jest lakoniczny, Orkiestrator aktywuje pozyskiwanie z 6 źródeł (realizuje Agent 1):
1. **Karta SDS (Sekcje 3, 9, 11):** Wyciąganie % stężeń oraz odczynu pH ($pH < 2$ = kamień/rdza; $pH \approx 7$ = bezpieczeństwo dla marmuru/drewna; $pH > 11$ = przypalenia/smary).
2. **Arkusz Danych Składników (WE 648/2004):** Wyszukiwanie na stronie www pełnego wykazu INCI/CAS (w tym dodatków <0,2%).
3. **Scraping Opinii po EAN (Agent 2):** Wyszukiwanie życiowych scenariuszy użycia i przekładanie ich na sekcję Problem & Answer (po sanityzacji przez Agenta 5).
4. **Rejestry Certyfikatów (EU Ecolabel / ECOCERT):** Weryfikacja numeru licencji i eksponowanie biodegradowalności oraz opakowań PCR.
5. **Cross-referencing EAN w KPA i marketplace'ach zagranicznych:** Pobieranie wydajności roboczej (np. *1L koncentratu = 20L płynu*), wag brutto i wymiarów.
6. **AI Vision Label Reader:** Odczyt ze zdjęcia tylnej etykiety piktogramów GHS, zwrotów H/P i kodu UFI do Sekcji 6 (Bezpieczeństwo).
