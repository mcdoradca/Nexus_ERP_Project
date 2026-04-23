require('dotenv').config({ path: 'z:/Nexus_ERP_Project/.env' });
require('dotenv').config({ path: 'z:/Nexus_ERP_Project/.env' });
async function testGemini() {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await res.json();
    console.log(data.models.map(m => m.name + " (" + m.supportedGenerationMethods.join(',') + ")").join('\n'));
}
testGemini();

testGemini();

testGemini();
