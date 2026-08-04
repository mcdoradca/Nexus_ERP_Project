const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('http://localhost:3001/api/products/baselinker-id?ean=8015194502539&sku=0000007738');
        console.log("Success:", res.data);
    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
    }
}
test();
