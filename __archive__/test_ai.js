const AiService = require('./src/modules/offer-optimizer/ai.service');
const fs = require('fs');

async function test() {
    // create a fake image buffer 1x1 png base64
    const fakeImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    
    try {
        console.log("Testing STANDARD...");
        const res1 = await AiService.generateHybridAnalysis(fakeImageBuffer, "STANDARD");
        console.log("STANDARD OK", res1);
    } catch(e) {
        console.error("STANDARD FAILED:", e);
    }

    try {
        console.log("Testing COSMETIC...");
        const res2 = await AiService.generateHybridAnalysis(fakeImageBuffer, "COSMETIC_LEGAL_AUDIT");
        console.log("COSMETIC OK", res2);
    } catch(e) {
        console.error("COSMETIC FAILED:", e);
    }
}
test();
