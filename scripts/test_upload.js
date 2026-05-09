const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.HEYGEN_API_KEY;
const audioPath = path.join(__dirname, '../cv_assets/voiceover.mp3');

(async () => {
    try {
        console.log("Próba 1: multipart/form-data (stara metoda)");
        const FormData = require('form-data');
        const fd = new FormData();
        fd.append('file', fs.createReadStream(audioPath));
        try {
            const res1 = await axios.post('https://upload.heygen.com/v1/asset', fd, {
                headers: { 'X-Api-Key': API_KEY, ...fd.getHeaders() }
            });
            console.log("Sukces 1:", res1.data);
            return;
        } catch (e) { console.log("Błąd 1:", e.response?.data); }

        console.log("\nPróba 2: Raw body (Content-Type: audio/mpeg)");
        try {
            const res2 = await axios.post('https://upload.heygen.com/v1/asset', fs.readFileSync(audioPath), {
                headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'audio/mpeg' }
            });
            console.log("Sukces 2:", res2.data);
            return;
        } catch (e) { console.log("Błąd 2:", e.response?.data); }

    } catch (e) {
        console.error(e);
    }
})();
