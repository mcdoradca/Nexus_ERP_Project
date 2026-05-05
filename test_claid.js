require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');

async function testClaid() {
    const claidKey = process.env.CLAID_API_KEY;
    console.log("Claid Key:", claidKey ? "SET" : "MISSING");
    
    // Pobierzmy losowy obrazek jako buffer
    console.log("1. Pobieranie obrazka bazowego...");
    const imgRes = await axios.get("https://picsum.photos/400/400.jpg", { responseType: 'arraybuffer' });
    const buffer = Buffer.from(imgRes.data, 'binary');

    // Upload
    console.log("2. Wgrywanie do Claid Upload API...");
    const form = new FormData();
    form.append('file', buffer, { filename: 'upload.jpg', contentType: 'image/jpeg' });
    form.append('data', JSON.stringify({}));
    
    let uploadedUrl;
    try {
        const uploadRes = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                ...form.getHeaders()
            }
        });
        uploadedUrl = uploadRes.data?.data?.output?.tmp_url;
        console.log("Uploaded URL:", uploadedUrl);
    } catch(err) {
        console.error("Upload Error:", err.response?.data || err.message);
        return;
    }

    const aiScenePayload = {
        object: {
            image_url: uploadedUrl,
            placement_type: "original"
        },
        scene: {
            model: "v2-beta",
            prompt: "a beautiful perfume bottle on a marble table in a luxury bathroom",
            preference: "best"
        },
        output: {
            number_of_images: 1,
            format: "jpeg"
        }
    };

    console.log("3. Testowanie /v1/scene/create...");
    try {
        const res = await axios.post('https://api.claid.ai/v1/scene/create', aiScenePayload, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                'Content-Type': 'application/json'
            }
        });
        console.log("Success Scene Create:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Claid Scene Create Error:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
}

testClaid();
