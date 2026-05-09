const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.HEYGEN_API_KEY;
if (!API_KEY) {
  console.error("Brak klucza HEYGEN_API_KEY w pliku .env");
  process.exit(1);
}

const audioPath = path.join(__dirname, '../cv_assets/voiceover.mp3');
const outputPath = path.join(__dirname, '../cv_assets/avatar_raw.mp4');

(async () => {
    try {
        console.log("Krok 1: Wgrywanie voiceover.mp3 jako zasób do HeyGen...");
        const fileBuffer = fs.readFileSync(audioPath);
        const uploadRes = await axios.post('https://upload.heygen.com/v1/asset', fileBuffer, {
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'audio/mpeg'
            }
        });
        const audioAssetId = uploadRes.data?.data?.id;
        if (!audioAssetId) throw new Error("Nie otrzymano ID zasobu od HeyGen.");
        console.log("Pomyślnie wgrano audio. Asset ID:", audioAssetId);

        console.log("Krok 2: Zlecanie wygenerowania wideo awatara...");
        const response = await axios.post('https://api.heygen.com/v2/video/generate', {
            video_inputs: [
                {
                    character: {
                        type: "avatar",
                        avatar_id: "Tyler-incasualsuit-20220721", // Profesjonalny, smart casual
                        avatar_style: "normal"
                    },
                    voice: {
                        type: "audio",
                        audio_asset_id: audioAssetId
                    },
                    background: {
                        type: "color",
                        value: "#00FF00" // Green screen dla idealnego Chroma Key
                    }
                }
            ],
            test: false,
            aspect_ratio: "16:9"
        }, {
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        const videoId = response.data.data.video_id;
        console.log("Zlecenie przyjęte. Video ID:", videoId);
        
        console.log("Krok 3: Oczekiwanie na render wideo (polling)...");
        let videoUrl = null;
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const statusRes = await axios.get(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
                headers: { 'X-Api-Key': API_KEY }
            });
            const status = statusRes.data.data.status;
            console.log(`Status renderowania [${i+1}/60]: ${status}`);
            
            if (status === 'completed' || status === 'success') {
                videoUrl = statusRes.data.data.video_url;
                break;
            } else if (status === 'failed') {
                throw new Error('Generowanie wideo nie powiodło się (HeyGen API status: failed).');
            }
        }
        
        if (videoUrl) {
            console.log("Krok 4: Pobieranie wygenerowanego wideo z URL:", videoUrl);
            const downloadRes = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream'
            });
            const writer = fs.createWriteStream(outputPath);
            downloadRes.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            console.log("SUCCESS: Plik avatar_raw.mp4 został pomyślnie zapisany w cv_assets.");
        } else {
            throw new Error('Timeout oczekiwania na gotowe wideo.');
        }

    } catch (error) {
        console.error("Błąd generacji awatara HeyGen:", error.response ? JSON.stringify(error.response.data) : error.message);
        process.exit(1);
    }
})();
