require('dotenv').config();
const aiService = require('./src/modules/offer-optimizer/ai.service');

async function testGeo() {
    try {
        const result = await aiService.generateGEOTextContent(
            "Test Product",
            "This is a test AEO content.",
            "This is test intelligence data.",
            "Test sentiment"
        );
        console.log("Result:", result);
    } catch (e) {
        console.error("Crash:", e);
    }
}

testGeo();
