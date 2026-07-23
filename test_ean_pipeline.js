const EanPipelineService = require('./src/modules/offer-optimizer/ean.pipeline.service');

async function test() {
    try {
        console.log('Testing EAN Pipeline delegation to Supervisor...');
        const result = await EanPipelineService.execute('1234567890123');
        console.log('Result:', result);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
