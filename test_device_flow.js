const axios = require('axios');
require('dotenv').config();

async function run() {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    try {
        const res = await axios.post('https://allegro.pl/auth/oauth/device', `client_id=${clientId}`, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log("Device response:", res.data);
    } catch (e) {
        console.error("Device error:", e.response ? e.response.data : e.message);
    }
}
run();
