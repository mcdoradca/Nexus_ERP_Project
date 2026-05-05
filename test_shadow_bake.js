require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function test() {
    const claidKey = process.env.CLAID_API_KEY;

    try {
        // 1. Download dummy image
        const imgRes = await axios.get("https://picsum.photos/400/400.jpg", { responseType: 'arraybuffer' });
        
        // 2. Upload to Claid
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', Buffer.from(imgRes.data), { filename: 'upload.jpg', contentType: 'image/jpeg' });
        form.append('data', JSON.stringify({}));
        
        const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: { 'Authorization': `Bearer ${claidKey}`, ...form.getHeaders() }
        });
        const uploadedUrl = uploadRes.data?.data?.output?.tmp_url;
        console.log("Uploaded URL:", uploadedUrl);

        // 3. Shadow bake with color transparent
        const shadowPayload = {
            object: { image_url: uploadedUrl },
            scene: { effect: "shadows", model: "v2", color: "transparent" },
            output: { number_of_images: 1, format: { type: "png" } }
        };
        const res = await axios.post('https://api.claid.ai/v1/scene/create', shadowPayload, {
            headers: { 'Authorization': `Bearer ${claidKey}`, 'Content-Type': 'application/json' }
        });
        console.log("SUKCES!");
        console.log("Baked shadow URL:", res.data?.data?.output?.[0]?.tmp_url);
    } catch(err) {
        console.error("Błąd API:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
}
test();
