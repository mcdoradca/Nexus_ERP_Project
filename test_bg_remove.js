require('dotenv').config();
const axios = require('axios');

async function testClaidBgRemove() {
    const claidKey = process.env.CLAID_API_KEY;
    // Puszka Coca-Coli na białym tle
    const dummyImage = "https://picsum.photos/400/400.jpg"; 

    const payload = {
        input: dummyImage,
        operations: {
            background: {
                remove: true
            }
        },
        output: {
            format: "png"
        }
    };

    try {
        const res = await axios.post('https://api.claid.ai/v1/image/edit', payload, {
            headers: { 'Authorization': `Bearer ${claidKey}`, 'Content-Type': 'application/json' }
        });
        console.log("Success:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Claid Error 1:", JSON.stringify(err.response?.data, null, 2) || err.message);
    }
}

testClaidBgRemove();
