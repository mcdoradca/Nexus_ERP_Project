const AllegroService = require('./src/modules/offer-optimizer/allegro.service');

async function doFlow() {
    try {
        console.log("Rozpoczynam sesję Device Flow...");
        const data = await AllegroService.startDeviceFlow();
        
        console.log("\n=======================================================");
        console.log("SKOPIUJ TEN LINK I OTWÓRZ W PRZEGLĄDARCE ZALOGOWANEJ DO ALLEGRO:");
        console.log(data.verification_uri_complete);
        console.log("=======================================================\n");
        console.log("Oczekiwanie na Twoje potwierdzenie (skrypt sprawdza co 5 sekund)...");

        let tokenData;
        while(true) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                tokenData = await AllegroService.pollForToken(data.device_code);
                console.log("\n✅ SUKCES! Token autoryzowany i zapisany w bazie PIM.");
                process.exit(0);
            } catch (e) {
                if (e.response && e.response.data && e.response.data.error === 'authorization_pending') {
                    process.stdout.write(".");
                } else {
                    console.error("\n❌ Błąd:", e.response?.data || e.message);
                    process.exit(1);
                }
            }
        }
    } catch (err) {
        console.error("Błąd krytyczny:", err.message);
    }
}

doFlow();
