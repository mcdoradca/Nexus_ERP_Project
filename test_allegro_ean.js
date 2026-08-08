require('dotenv').config();
const axios = require('axios');
const AllegroService = require('./src/modules/offer-optimizer/allegro.service.js');

async function test() {
    try {
        const testEan = '8015194502539'; 
        const token = await AllegroService.getAllegroToken();
        
        console.log(`[1] Test wyszukiwania EAN: ${testEan} przez /sale/products...`);
        const response = await axios.get(`https://api.allegro.pl/sale/products?phrase=${testEan}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
        });
        
        console.log('Odpowiedź Allegro API (surowa):');
        console.dir(response.data, { depth: null });
        
        console.log('\n[2] Test przetworzenia funkcją z serwisu (getProductParametersByEan)...');
        const parsed = await AllegroService.getProductParametersByEan(testEan);
        console.log('Zwrócone twarde parametry:');
        console.dir(parsed, { depth: null });

    } catch (e) {
        console.error('Błąd:', e.message);
        if (e.response) {
            console.error('Dane błędu:', e.response.data);
        }
    }
}
test();
