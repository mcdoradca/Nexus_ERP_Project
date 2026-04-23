require('dotenv').config();
const fs = require('fs');

async function testDownload() {
    const BRIA_API_TOKEN = process.env.BRIA_API_TOKEN;
    const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const payload = {
        file: dummyImage,
        text: "A woman holding a product",
        placement_type: "automatic",
        sync: false
    };

    try {
        const response = await fetch('https://engine.prod.bria-api.com/v1/product/lifestyle_shot_by_text', {
            method: 'POST',
            headers: {
                'api_token': BRIA_API_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        console.log("Status:", response.status);
        const data = await response.json();
        console.log(JSON.stringify(data));
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
testDownload();
