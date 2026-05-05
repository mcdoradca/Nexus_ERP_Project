const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');

async function testSharpShadow() {
    try {
        // Download a sample transparent product image (e.g. bottle)
        const imgUrl = "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"; // Dice
        const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        const inputBuffer = Buffer.from(response.data);

        // Get metadata
        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Shadow parameters
        const shadowWidth = width * 0.8; // shadow slightly narrower than product
        const shadowHeight = height * 0.15; // flat ellipse
        const blurRadius = Math.max(10, width * 0.05);

        // Create SVG shadow
        const svgShadow = `
            <svg width="${width}" height="${height + shadowHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="blur">
                        <feGaussianBlur stdDeviation="${blurRadius}" />
                    </filter>
                </defs>
                <ellipse 
                    cx="${width / 2}" 
                    cy="${height - (shadowHeight / 4)}" 
                    rx="${shadowWidth / 2}" 
                    ry="${shadowHeight / 2}" 
                    fill="rgba(0, 0, 0, 0.7)" 
                    filter="url(#blur)" 
                />
            </svg>
        `;

        // Extend the original image to make room for the shadow at the bottom
        const extendedImage = await sharp(inputBuffer)
            .extend({
                bottom: Math.round(shadowHeight),
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();

        // Composite shadow UNDER the extended image
        // Sharp composites ON TOP by default, so we use the SVG as the base, and composite the extended image on it
        const finalImage = await sharp(Buffer.from(svgShadow))
            .composite([
                { input: extendedImage, blend: 'over' }
            ])
            .png()
            .toBuffer();

        fs.writeFileSync('shadow_test.png', finalImage);
        console.log("SUKCES: Zapisano shadow_test.png");
    } catch (err) {
        console.error("Błąd:", err);
    }
}
testSharpShadow();
