const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.HEYGEN_API_KEY;
const videoId = 'd843a7beec134901af8a59b6530d30a5';
const outputPath = path.join(__dirname, '../cv_assets/avatar_raw.mp4');

(async () => {
    let videoUrl = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        const statusRes = await axios.get(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
            headers: { 'X-Api-Key': API_KEY }
        });
        const status = statusRes.data.data.status;
        console.log(`Status renderowania [${i+1}/60]: ${status}`);
        
        if (status === 'completed' || status === 'success') {
            videoUrl = statusRes.data.data.video_url;
            break;
        } else if (status === 'failed') {
            console.error('Generowanie wideo nie powiodło się (HeyGen API status: failed).');
            process.exit(1);
        }
    }
    
    if (videoUrl) {
        console.log("Pobieranie wygenerowanego wideo z URL:", videoUrl);
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
        console.error('Dalszy timeout oczekiwania.');
    }
})();
