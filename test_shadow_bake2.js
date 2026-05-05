require('dotenv').config();
const axios = require('axios');

async function test() {
    const claidKey = process.env.CLAID_API_KEY;

    // 1. Izolacja produktu (Etap 1)
    const bgRemovePayload = {
        input: "https://picsum.photos/400/400.jpg",
        operations: {
            background: {
                remove: { category: "products", clipping: true },
                color: "transparent"
            }
        },
        output: { format: { type: "png" } }
    };

    let transparentUrl;
    try {
        const bgRes = await axios.post('https://api.claid.ai/v1/image/edit', bgRemovePayload, {
            headers: { 'Authorization': `Bearer ${claidKey}`, 'Content-Type': 'application/json' }
        });
        transparentUrl = bgRes.data?.data?.output?.tmp_url;
        console.log("Izolacja OK:", transparentUrl);
    } catch(err) {
        console.error("Błąd izolacji:", err.response?.data || err.message);
        return;
    }

    // 2. Wypalanie cienia (Etap 1.5)
    const shadowPayload = {
        object: { image_url: transparentUrl },
        scene: { effect: "shadows", model: "v2", color: "#ffffff" },
        output: { number_of_images: 1, format: { type: "jpeg" } }
    };

    try {
        const shadowRes = await axios.post('https://api.claid.ai/v1/scene/create', shadowPayload, {
            headers: { 'Authorization': `Bearer ${claidKey}`, 'Content-Type': 'application/json' }
        });
        console.log("Cień OK:", shadowRes.data?.data?.output?.[0]?.tmp_url);
    } catch(err) {
        console.error("Błąd cienia:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
}
test();
