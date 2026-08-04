require('dotenv').config();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function startDeviceFlow() {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://allegro.pl/auth/oauth/device', `client_id=${clientId}`, {
        headers: {
            'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return { data: response.data, authString };
}

async function pollDeviceFlow(deviceCode, authString, interval) {
    console.log('Oczekiwanie na autoryzację...');
    while (true) {
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        try {
            const response = await axios.post('https://allegro.pl/auth/oauth/token', 
                `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${deviceCode}`, {
                headers: {
                    'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            console.log('Autoryzacja zakończona sukcesem!');
            
            const cachedToken = response.data.access_token;
            const tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
            
            await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_ACCESS_TOKEN' }, update: { value: cachedToken }, create: { key: 'ALLEGRO_ACCESS_TOKEN', value: cachedToken } });
            await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' }, update: { value: tokenExpiry.toString() }, create: { key: 'ALLEGRO_TOKEN_EXPIRY', value: tokenExpiry.toString() } });
            if (response.data.refresh_token) {
                await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_REFRESH_TOKEN' }, update: { value: response.data.refresh_token }, create: { key: 'ALLEGRO_REFRESH_TOKEN', value: response.data.refresh_token } });
            }
            console.log('Tokeny zapisane w bazie danych.');
            break;
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error === 'authorization_pending') {
                process.stdout.write('.');
            } else {
                console.error('\nBłąd:', err.response ? err.response.data : err.message);
                break;
            }
        }
    }
}

async function run() {
    try {
        const { data, authString } = await startDeviceFlow();
        console.log('=============================================');
        console.log('WEJDŹ NA STRONĘ:', data.verification_uri_complete);
        console.log('LUB WPISZ KOD:', data.user_code, 'NA STRONIE', data.verification_uri);
        console.log('=============================================');
        await pollDeviceFlow(data.device_code, authString, data.interval);
        process.exit(0);
    } catch (e) {
        console.error('Błąd inicjalizacji:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

run();
