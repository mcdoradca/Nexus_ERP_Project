require('dotenv').config();
const aiService = require('./src/modules/offer-optimizer/ai.service');

async function testNative() {
    try {
        const result = await aiService.generateNativeAnalysis(
            "Product: Super Cream\nFeatures: hydrating\nDesc: A nice cream.",
            [],
            "STANDARD"
        );
        console.log("Result:", result);
    } catch (e) {
        console.error("Crash:", e);
    }
}

testNative();
