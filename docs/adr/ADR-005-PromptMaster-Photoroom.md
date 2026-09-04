# ADR: Wprowadzenie Agenta Gemini jako Prompt Mastera dla Photoroom V2

## Kontekst
Dotychczasowy mechanizm generowania wariantów zdjęć lifestylowych opierał się na sztywnym losowaniu elementów (słowniki `photoroom.dictionaries.js`) i skomplikowanym układzie pozycjonowania (Chaos Engine). Mechanizm ten był niewystarczający do generowania zaawansowanych scen interaktywnych (np. produkt w dłoni, produkt za mgłą) z wykorzystaniem pełni możliwości najnowszego modelu Photoroom v2/edit. 

## Decyzja
Zdecydowano o całkowitym usunięciu starych słowników oraz Chaos Engine. Do projektu wprowadzono "Prompt Mastera" opisanego w pliku `prompt-master.service.js`.
1. **Delegacja logiki do LLM:** Zamiast sztywnych szablonów, model LLM (`gemini-3.7-flash`, zarejestrowany jako Agent ID: 11) przejmuje zadanie wykreowania kreatywnego promptu w języku polskim, znając dane z bazy PIM oraz rodzaj slota (parzysty/nieparzysty).
2. **Zmiana parametrów Photoroom:** Zapytanie API przeniesiono z klasycznego wycięcia i tła (`removeBackground=true`, `background.prompt`) na tryb edycji AI (`removeBackground=false`, `editWithAI.prompt`, `editWithAI.mode=ai.auto`), co umożliwia nakładanie elementów na pierwszy plan przed produktem oraz lepszą integrację przestrzenną.
3. **Twarde zasady dla LLM:** Wymuszono stały prefiks zabraniający zmiany oryginalnego produktu, co chroni przed halucynacjami Photoroom.

## Konsekwencje
- Zwiększona jakość i spójność wygenerowanych obrazów (bardziej naturalne integracje produktu z otoczeniem).
- Skrócenie kodu w `photoroom.service.js` i przeniesienie odpowiedzialności za kompozycję na model sztucznej inteligencji.
- Utrzymanie wydajności dzięki użyciu modelu Flash-3.5.
