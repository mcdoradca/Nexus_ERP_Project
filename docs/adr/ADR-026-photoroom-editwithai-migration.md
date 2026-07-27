# ADR-026: Migracja do natywnego silnika Edit With AI w Photoroom v2 i porzucenie Agenta 11

## Status
Zatwierdzony i wdrożony

## Kontekst
Architektura przewidywała generowanie złożonych instrukcji kompozycyjnych (anglojęzycznych promptów ze słowami kluczowymi blokującymi cienie, otoczenie itp.) przy pomocy dedykowanego Agenta 11 (Gemini 3.5 Flash). Wynik był przekazywany do endpointu Photoroom jako wartość parametru `background.prompt`.
Mimo inżynierii promptów, Photoroom w trybie tworzenia tła często wariował przy żądaniach o usunięcie cienia (generował szare zepsute plansze) i źle radził sobie z lewitującymi elementami, psując białe tło dla e-commerce.

Zauważono, że natywna aplikacja webowa Photoroom osiąga idealne rezultaty (miękkie cienie kontaktowe, białe tło, brak zaburzeń proporcji produktu) przy użyciu prostego, naturalnego języka operacyjnego ("Odczytaj ze zdjęcia główny składnik..."). 

## Decyzja
Zdecydowano o drastycznym cięciu kosztów i ominięciu modelu językowego Google (Gemini) dla ujęć typu Slot 1.
W backendzie (plik `ai.service.js`) w pełni zaimplementowano natywny tryb Photoroom `editWithAI.mode: 'ai.auto'`, używając naturalnego polecenia w języku polskim.
Kod wyłącza wysyłanie starych form parametryzacji (`background.prompt`, `background.color`, `background.negativePrompt`) dla ujęcia pierwszego, polegając w 100% na inteligencji modelu Photoroom.
Funkcja `runNode11_Slot1Scenographer` została skasowana.

## Konsekwencje
- **Pozytywne:**
  - Redukcja kosztów generowania ofert (ominięto całkowicie konieczność opłacania tokenów LLM dla jednego z ujęć).
  - Skrócenie czasu generowania ujęcia (brak opóźnień asynchronicznych od Google).
  - Bardziej naturalne i przewidywalne wyniki generowane z Photoroom, idealnie klonujące jakość z aplikacji Web.
- **Negatywne (Akceptowalne):**
  - Częściowa utrata kontroli deterministycznej (Photoroom samodzielnie identyfikuje składnik z obrazka). W razie powtarzających się problemów z trudnymi etykietami, decyzja może zostać zmodyfikowana (wstrzyknięcie PIM do promptu `editWithAI`).
