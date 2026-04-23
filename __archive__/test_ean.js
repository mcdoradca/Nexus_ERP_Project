const ean = "8000137016273";
async function test() {
    try { 
        const r1 = await fetch('https://world.openbeautyfacts.org/api/v0/product/' + ean + '.json');
        console.log('Beauty:', await r1.json()); 
    } catch(e){ console.log('Beauty Error', e.message); }
    
    try { 
        const r2 = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + ean);
        console.log('UPC DB:', await r2.json()); 
    } catch(e){ console.log('UPC DB Error', e.message); }
}
test();
