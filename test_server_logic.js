const URLSearchParams = require('url').URLSearchParams;
async function test() {
    try {
        const ean = "8000137016273"; // Ten kod od uzytkownika
        console.log("Test: BaseLinker block...");
        
        // Mock BaseLinker Logic
        const formData = new URLSearchParams();
        formData.append('method', 'getInventoryProductsList');
        formData.append('parameters', JSON.stringify({ "filter_ean": ean }));
        
        const blRes = await fetch('https://api.baselinker.com/connector.php', {
            method: 'POST',
            // Pusty lub bledny klucz wygeneruje error w blRes.json badz odp. text
            headers: { 'X-BLToken': '123' },
            body: formData
        });
        
        const blData = await blRes.json();
        console.log("BaseLinker Response:", blData);
        
        if (blData.status === 'SUCCESS' && blData.products && Object.keys(blData.products).length > 0) {
            console.log("Znaleziono w BL!");
            return;
        }

        console.log("Test: OpenBeauty...");
        let response = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${ean}.json`);
        let data = response.ok ? await response.json() : {};
        if (data.status === 1 && data.product) return console.log("Znaleziono 1");

        console.log("Brak w Beauty");

    } catch(e) {
        console.error("Znaleziony Wyjatek 500:", e);
    }
}
test();
