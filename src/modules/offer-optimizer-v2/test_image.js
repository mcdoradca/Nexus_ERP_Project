require('dotenv').config();
const { generateLifestyle } = require('./photoroom.service');
const fs = require('fs');
const path = require('path');

async function runTest() {
    try {
        console.log("Rozpoczynam test generowania dla EAN 8000137016853...");
        
        // Stwórzmy pusty obrazek jako wejście
        const sharp = require('sharp');
        const mockImg = await sharp({
            create: {
                width: 1080,
                height: 1080,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        }).jpeg().toBuffer();

        const base64Input = `data:image/jpeg;base64,${mockImg.toString('base64')}`;
        
        const result = await generateLifestyle(base64Input, null, '8000137016853', 1);
        
        const outputBuffer = Buffer.from(result.base64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const outputPath = path.join(__dirname, 'test_output_8000137016853.jpg');
        fs.writeFileSync(outputPath, outputBuffer);
        
        console.log("Test zakończony! Plik zapisany w:", outputPath);
    } catch (error) {
        console.error("Błąd podczas testu:", error);
    }
}

runTest();
