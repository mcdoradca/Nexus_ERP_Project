require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function run() {
    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_ACCESS_TOKEN' } });
        if (!tokenRecord) {
            console.log("No token in DB");
            return;
        }
        const token = tokenRecord.value;
        console.log("Token found in DB. Length:", token.length);
        
        const response = await axios.get(`https://api.allegro.pl/sale/categories`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
        });
        console.log("Success! Token works. Status:", response.status);
    } catch (e) {
        console.error("Error:", e.response ? e.response.status + ' - ' + JSON.stringify(e.response.data) : e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
