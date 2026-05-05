const axios = require('axios');
const fs = require('fs');

async function testLocalApi() {
    try {
        const res = await axios.post('http://localhost:3001/api/offer-optimizer/generate-lifestyle', {
            sourceImageUrl: "https://picsum.photos/1024/1024.jpg",
            ean: "1234567890123",
            imageIndex: 0
        });
        console.log("Success!");
    } catch (err) {
        console.error("Local API Error:", err.response?.data || err.message);
    }
}

testLocalApi();
