require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ResiService = require('../src/modules/resi/resi.service');

async function runMassLoadTest() {
    console.log("Rozpoczynam test masywnego obciążenia modułu Resi (Wariant A - Claid API)");
    
    // Utworzenie małego obrazu testowego (1x1 transparent PNG) aby nie obciążać zbytnio łącza
    const testImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    
    const NUM_IMAGES = 50; // Masywne obciążenie
    const files = [];

    console.log(`Przygotowuję ${NUM_IMAGES} plików do przetworzenia...`);
    for (let i = 0; i < NUM_IMAGES; i++) {
        files.push({
            originalname: `test_image_${i}.png`,
            buffer: testImageBuffer
        });
    }

    console.log(`Rozpoczynam wysyłanie ${NUM_IMAGES} plików do ResiService.processBatch (Z limitowaniem współbieżności do 5)...`);
    const startTime = Date.now();
    
    try {
        const zipBuffer = await ResiService.processBatch(files, 'full', 'TEST-ASIN');
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n✅ SUKCES! Test obciążeniowy zakończony pomyślnie.`);
        console.log(`Czas przetwarzania ${NUM_IMAGES} plików: ${duration} sekund.`);
        console.log(`Wygenerowany plik ZIP waży: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
        
        const outPath = path.join(__dirname, 'load_test_result.zip');
        fs.writeFileSync(outPath, zipBuffer);
        console.log(`Zapisano paczkę testową jako: ${outPath}`);
    } catch (error) {
        console.error(`\n❌ BŁĄD podczas testu obciążeniowego:`, error);
    }
}

runMassLoadTest();
