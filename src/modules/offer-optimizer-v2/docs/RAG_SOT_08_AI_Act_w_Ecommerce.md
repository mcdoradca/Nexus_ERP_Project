# 📙 RAG SOT 08: AI ACT W E-COMMERCE – ZGODNOŚĆ SŁOWA PISANEGO I OBRAZÓW (REGULACJA UE 2024/1689)

**Klasyfikacja:** Single Source of Truth (SOT) – Moduł 8
**Przeznaczenie:** Indeksowanie wektorowe dla `gemini-embedding-2` / Agenci: Agent 6 (Copywriter), Agent 9 (Vision Auditor), Agent 10 (Sentinel)
**Stan prawny:** Rozporządzenie (UE) 2024/1689 (AI Act). Stan na lipiec 2026 r.

---

## 0. KALENDARZ STOSOWANIA (KRYTYCZNE – STAN NA LIPIEC 2026)
Na dzień redakcji (lipiec 2026) obowiązki przejrzystości z **Art. 50 jeszcze formalnie nie są egzekwowane** – wchodzą lada moment. Agenci mają je wdrażać **proaktywnie**, ale plik nie może twierdzić, że są już egzekwowane.
* **Art. 50 (przejrzystość – ujawnianie interakcji z AI, oznaczanie treści syntetycznej, deep fake):** stosowany **od 2 sierpnia 2026 r.**
* **Art. 50 ust. 2 (maszynowe znakowanie treści generowanej przez AI) dla systemów wprowadzonych na rynek przed 2.08.2026:** okres przejściowy – obowiązek dopiero **od 2 grudnia 2026 r.**
* Treści wygenerowane przed 2.08.2026 nie muszą być znakowane wstecznie.
* **Wniosek dla architektury:** wdrażamy znakowanie `ai_generated_content: true` od początku (proaktywnie, koszt zerowy), ale w komunikacji do operatora HITL nie prezentujemy tego jako „wymóg już egzekwowany w lipcu 2026".

---

## 1. KLASYFIKACJA RYZYKA W E-COMMERCE
* **Praktyki zakazane (Art. 5):** Bezwzględny zakaz technik podprogowych i manipulacji kognitywnej (*AI Dark Patterns*) – np. generowania fałszywych poczuć zagrożenia lub pilności w celu wymuszenia zakupu preparatów leczniczych czy chemii.
* **Systemy wysokiego ryzyka (Art. 6):** Oceny zdolności kredytowej / BNPL (np. PayU Raty) – wymóg certyfikacji i nadzoru. *(Poza zakresem naszego potoku treściowego.)*
* **Systemy o ograniczonym ryzyku (Art. 50):** Nasz obszar (LLM, asystenci, generowanie tekstów GEO/AEO i grafik). Wymóg jawnej przejrzystości i znakowania.

---

## 2. SŁOWO PISANE – ZGODNOŚĆ TREŚCI (GPAI / DEPLOYER LIABILITY)
* **Znakowanie maszynowe (Art. 50 ust. 2):** Teksty generowane przez AI muszą zawierać w metadanych lub payloadzie odczytywalny maszynowo wskaźnik sztucznego pochodzenia (np. C2PA, SynthID, flaga `ai_generated_content: true`). Zakaz czyszczenia metadanych! *(Egzekwowanie – patrz kalendarz w sekcji 0.)*
* **Odpowiedzialność Deployera:** Sprzedawca ponosi 100% odpowiedzialności prawnej za treści wygenerowane przez AI. Wdrożenie Agenta 5 (Sanitizer) i Agenta 10 (Sentinel) realizuje wymóg nadzoru *„Human-on-the-Loop"* (HOTL).
* **Zakaz manipulacji w tekście:** Zakaz generowania fałszywej pilności niezgodnej z PIM (*„Zostały 2 sztuki!"*) oraz profilowania lękowego (*„Twoja łazienka jest pełna śmiertelnych wirusów – kup natychmiast"*).

---

## 3. OBRAZY I GRAFIKA – GENEROWANIE I MODYFIKACJA (SYNTHETIC MEDIA)
* **Obowiązkowe etykietowanie (Art. 50 ust. 4 & Regulamin Allegro):** Publikacja obrazu wygenerowanego lub zmodyfikowanego przez AI wymaga jawnej informacji. **Wyjątek na miniaturce Allegro:** na białym tle miniatury zakazane są wszelkie napisy **z wyjątkiem** etykiety poświadczającej wygenerowanie obrazu przez AI. Jeśli miniatura powstała w AI – obecność etykiety `[Wygenerowano przez AI]` jest obowiązkowa.
* **Znakowanie wodne:** Obrazy powinny posiadać nienaruszone metadane C2PA / SynthID.
* **Granice modyfikacji wizualnej:**
  * *Kosmetyki:* Zakaz generowania fotorealistycznych twarzy AI jako dowodu „efektu po 7 dniach" bez etykiety symulacji komputerowej (fałszowanie dowodów z Rozp. 655/2013). Zakaz pokazywania penetracji spikul lub PDRN do krwiobiegu (sugerowanie leku).
  * *Chemia Domowa:* Zakaz wideo AI pokazującego rozpuszczanie kamienia w 1 sekundę z jednoczesnym ukryciem piktogramów zagrożeń CLP.

---

## 4. ŁAŃCUCH DOSTAW AI (PROVIDER VS. DEPLOYER)
* **Provider (np. dostawca modelu / API):** Odpowiada za trenowanie modelu, przestrzeganie praw autorskich (TDM Opt-out) i wbudowanie maszynowych znaków wodnych.
* **Deployer (Podmiot wdrożeniowy / Ty):** Pełna odpowiedzialność przed UOKiK i konsumentem za finalny tekst/grafikę w sieci.
* **Sankcje:** Naruszenie zakazanych praktyk z Art. 5 zagrożone jest karą do **35 000 000 EUR lub 7% światowego obrotu**. Naruszenie pozostałych obowiązków (w tym Art. 50) – do **15 000 000 EUR lub 3% światowego obrotu** (wyższa z kwot). *(Skala zależna od typu naruszenia – nie mylić progów.)*
