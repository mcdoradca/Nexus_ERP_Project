const fs = require('fs');
const txt = `

### Nazwa operacji/zadania: Rurociąg Autorefleksji (Automatyczne Wideo-CV)
**Po co to jest? (Cel biznesowy):** Mechanizm wizytówki rekrutacyjnej "Living CV". System Nexus autonomicznie opowiada o swoich funkcjach (procesy EAN, analityka Sentinel), korzystając z głosów AI oraz realistycznych, animowanych awatarów, a następnie sam składa wideo w całość, tworząc dowód integracji. Zabezpiecza przed halucynacjami UI.
**Gdzie to znaleźć? (Lokalizacja UI):** Moduł ukryty, operacje wywoływane przez skrypty w tle (katalog scripts/). Wynik ląduje w katalogu cv_assets/NES_CV_FINAL.mp4.
**Wymagania wstępne (Wiedza z kodu):** 
Potok składa się z 4 etapów:
1. Nagranie UI: Rejestracja ekranów działania systemu.
2. Generacja Audio (ElevenLabs API): Konwersja z SSML na mp3.
3. Generacja Awatara (HeyGen API): Awatar wideo z tłem do Chroma Key.
4. Postprodukcja (FFmpeg): Użycie filter_complex do dynamicznego kompozytowania (wycinanie green screen, efekty PiP, nakładanie podkładu wideo).
`;
fs.appendFileSync('.agents/.ai-memory/NES-opis-8-5.md', Buffer.from(txt, 'utf8'));
