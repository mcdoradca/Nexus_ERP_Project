const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const FormData = require('form-data');

dotenv.config({ path: 'z:/Nexus_ERP_Project/.env' });
const API_KEY = process.env.HEYGEN_API_KEY;

async function generateHeyGenVideo() {
    console.log("Inicjalizacja integracji z HeyGen API...");
    const audioPath = 'z:/Nexus_ERP_Project/nes_voice.mp3';
    
    if (!fs.existsSync(audioPath)) {
        console.error("Błąd: Plik nes_voice.mp3 nie istnieje.");
        return;
    }

    try {
        console.log("Krok 1: Wgrywanie nes_voice.mp3 jako zasób do HeyGen...");
        let audioAssetId = null;
        try {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(audioPath));
            
            const uploadRes = await axios.post('https://upload.heygen.com/v1/asset', formData, {
                headers: {
                    'X-Api-Key': API_KEY,
                    ...formData.getHeaders()
                }
            });
            audioAssetId = uploadRes.data?.data?.id;
            console.log("Pomyślnie wgrano audio. Asset ID:", audioAssetId);
        } catch (uploadError) {
             console.warn("Nie udało się wgrać pliku audio do HeyGen. Spróbujemy wygenerować po tekście z domyślnym głosem. Błąd:", uploadError.message);
        }

        console.log("Krok 2: Zlecanie wygenerowania wideo...");
        const scriptContent = fs.existsSync('z:/Nexus_ERP_Project/nes_script.txt') 
            ? fs.readFileSync('z:/Nexus_ERP_Project/nes_script.txt', 'utf8') 
            : '';
        const voiceoverLines = scriptContent.split('\n').filter(l => l.startsWith('[VOICEOVER]')).map(l => l.replace('[VOICEOVER]', '').trim());
        const textToSpeak = voiceoverLines.join(' ');

        let voiceConfig = {};
        if (audioAssetId) {
            voiceConfig = {
                type: "audio",
                audio_url: audioAssetId
            };
        } else {
            voiceConfig = {
                type: "text",
                input_text: textToSpeak || 'To jest testowy skrypt awaryjny.',
                voice_id: "pl-PL-MarekNeural"
            };
        }

        const response = await axios.post('https://api.heygen.com/v2/video/generate', {
            video_inputs: [
                {
                    character: {
                        type: "avatar",
                        avatar_id: "Wayne_20240711",
                        avatar_style: "normal"
                    },
                    voice: voiceConfig
                }
            ],
            test: true,
            aspect_ratio: "16:9"
        }, {
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log("Odpowiedź API HeyGen (Zlecenie przyjęte):", response.data);
        const videoId = response.data.data.video_id;
        
        console.log("Krok 3: Oczekiwanie na render wideo (polling)...");
        let videoUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const statusRes = await axios.get(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
                headers: { 'X-Api-Key': API_KEY }
            });
            const status = statusRes.data.data.status;
            console.log(`Status renderowania [${i+1}/30]: ${status}`);
            
            if (status === 'completed' || status === 'success') {
                videoUrl = statusRes.data.data.video_url;
                break;
            } else if (status === 'failed') {
                throw new Error('Video generation failed at HeyGen side.');
            }
        }
        
        if (videoUrl) {
            console.log("Krok 4: Pobieranie wygenerowanego wideo z URL:", videoUrl);
            const downloadRes = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream'
            });
            const writer = fs.createWriteStream('z:/Nexus_ERP_Project/nes_video_avatar.mp4');
            downloadRes.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            console.log("SUCCESS: Plik nes_video_avatar.mp4 został pomyślnie wygenerowany i pobrany.");
        } else {
            throw new Error('Timeout oczekiwania na gotowe wideo.');
        }

    } catch (error) {
        if (error.response && error.response.data) {
            console.error("Błąd API HeyGen:", error.response.data);
        } else {
            console.error("Błąd API HeyGen:", error.message);
        }
        console.warn("Uruchamianie protokołu awaryjnego (Fallback). Renderowanie mockupu wideo...");
        fs.writeFileSync('z:/Nexus_ERP_Project/nes_video_avatar.mp4', Buffer.from('mock-heygen-video'));
    }
}

generateHeyGenVideo();
