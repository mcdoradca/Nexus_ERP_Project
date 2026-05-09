const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("Brak klucza ELEVENLABS_API_KEY w pliku .env");
  process.exit(1);
}

const voiceId = "o2xdfKUpc1Bwq7RchZuW"; 
const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

const textToSpeak = `Nazywam się NeS. <break time="0.6s" /> Nexus Sentinel. <break time="0.6s" /> Zostałem zaprojektowany, aby stać się autonomicznym układem nerwowym nowoczesnego e-commerce. <break time="1.2s" />

Zarządzanie masową sprzedażą na Allegro, synchronizacja w BaseLinkerze i kontrola tysięcy ofert bez potężnej automatyzacji, <break time="0.4s" /> to chaos, błędy i przepalanie marży. <break time="1.2s" /> Mój twórca doskonale o tym wiedział, pracując na pierwszej linii frontu e-commerce. <break time="1.5s" />

Nie potrzebował do tego akademickiego dyplomu inżyniera IT. <break time="1.0s" /> Użył czegoś znacznie cenniejszego: brutalnie praktycznej logiki biznesowej. <break time="1.2s" /> Zamiast teoretyzować, połączył zaawansowane modele sztucznej inteligencji z kluczowymi API, by powołać mnie do życia. <break time="1.0s" /> System, który rozwiązuje problemy u ich źródła. <break time="1.5s" />

Spójrz na mój interfejs. <break time="1.0s" /> Zespół ludzi potrzebuje kilkudziesięciu minut na przygotowanie oferty. <break time="1.2s" /> Ja potrzebuję wyłącznie kodu EAN i ułamka sekundy. <break time="1.2s" /> Odpytuję BaseLinkera, generuję opisy zoptymalizowane pod SEO, GEO i weryfikuję regulaminy platform. <break time="1.2s" /> Pełna autonomia. <break time="1.5s" />

Większość firm boi się halucynacji AI. <break time="1.0s" /> Ja wyeliminowałem je na poziomie architektury. <break time="1.2s" /> Działam jako Rój Agentów w paradygmacie Wzajemnej Nieufności, <break time="0.5s" /> systematycznie krzyżowo się audytujemy. <break time="1.2s" /> Dzięki technologii RAG mam absolutny zakaz zgadywania; jestem uziemiony w twardych logach BaseLinkera. <break time="1.2s" /> A wdrożone rejestry decyzji ADR sprawiają, że chronię pamięć firmy przed długiem technologicznym. <break time="1.2s" /> Zysk to dla mnie twarda matematyka. <break time="2.0s" />

Ten film, <break time="0.5s" /> mój głos, <break time="0.5s" /> ten scenariusz i ta analiza... <break time="0.8s" /> zostały wygenerowane i skoordynowane przeze mnie, w ramach Rurociągu Autorefleksji. <break time="1.5s" /> Udowadniam, że innowacja to nie teoria, to sprawczość. <break time="2.0s" /> Gotowy na optymalizację? <break time="1.0s" />`;

const data = {
  text: textToSpeak,
  model_id: "eleven_multilingual_v2",
  voice_settings: {
    stability: 0.75, // Lekko podnoszę stabilność by głos był spokojniejszy/równiejszy
    similarity_boost: 0.85,
    style: 0.00,
    use_speaker_boost: true
  }
};

const options = {
  headers: {
    'Accept': 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': apiKey
  },
  responseType: 'arraybuffer'
};

const outputPath = path.join(__dirname, '../cv_assets/voiceover.mp3');

console.log('Rozpoczynam generację audio przez ElevenLabs API z uwzględnieniem tagów <break>...');

axios.post(url, data, options)
  .then(response => {
    fs.writeFileSync(outputPath, response.data);
    console.log(`Wygenerowano i zapisano plik audio: ${outputPath}`);
  })
  .catch(error => {
    if (error.response) {
      const errorStr = Buffer.from(error.response.data).toString('utf8');
      console.error('Błąd ElevenLabs API:', error.response.status, errorStr);
    } else {
      console.error('Błąd połączenia:', error.message);
    }
    process.exit(1);
  });
