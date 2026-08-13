const { getAllegroToken } = require('../src/modules/offer-optimizer/allegro.service');

async function test() {
    try {
        console.log("Wymuszam odświeżenie tokena...");
        const token = await getAllegroToken(true);
        console.log("Sukces! Token pobrany.");
        process.exit(0);
    } catch(e) {
        console.error("Błąd testu:", e.message);
        process.exit(1);
    }
}
test();
