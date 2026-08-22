const FormData = require('form-data');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PromptMasterService = require('./prompt-master.service');

let FONT = null;
try {
    const fontPath = path.join(__dirname, 'assets', 'Roboto-Bold.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    const fontArrayBuffer = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
    FONT = opentype.parse(fontArrayBuffer);
} catch (e) {
    console.error("[Photoroom V2] Błąd wczytywania czcionki dla wektorów:", e.message);
}

function textToPathData(text, fontSize) {
    if (!FONT) return { d: '', width: 0 };
    const p = FONT.getPath(text, 0, 0, fontSize);
    return {
        d: p.toPathData(2),
        width: FONT.getAdvanceWidth(text, fontSize)
    };
}

const PHOTOROOM_ENDPOINT = 'https://image-api.photoroom.com/v2/edit';

// Wrapper sieciowy - zapewnia obejście blokad WAF
const imageHttpsAgent = new https.Agent({ 
    rejectUnauthorized: false,
    family: 4 
});

async function fetchImageSecure(url, timeoutMs = 15000) {
    return axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        httpsAgent: imageHttpsAgent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });
}

// Główna usługa wywoływana przez kontroler
async function generatePhotoroomLifestyle(imageBase64, sourceImageUrl, ean, imageIndex = 0, onLog = () => {}) {
    const photoroomKey = process.env.PHOTOROOM_API_KEY;
    if (!photoroomKey || photoroomKey === "TBD") {
        throw new Error("Brak klucza PHOTOROOM API V2 w zmiennych środowiskowych (.env). Upewnij się, że przeładowałeś serwer na VPS po dopisaniu klucza.");
    }

    const slot = imageIndex + 1;
    console.log(`[Photoroom V2] Rozpoczęto generowanie zdjęcia (Slot ${slot}) dla EAN: ${ean} (Prompt Master)`);
    onLog(`[INIT] Rozpoczęto generowanie zdjęcia (Slot ${slot})`);

    // 1. Weryfikacja
    let inputBuffer;
    if (imageBase64 && imageBase64.startsWith('data:image')) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (sourceImageUrl) {
        const imgRes = await fetchImageSecure(sourceImageUrl);
        inputBuffer = Buffer.from(imgRes.data);
    } else {
        throw new Error("Brak wejściowego obrazu (wymagany imageBase64 lub sourceImageUrl).");
    }

    // 2. Pobranie danych z PIM
    let productDetailsText = "";
    let dbProduct = null;
    try {
        if (ean) {
            dbProduct = await prisma.product.findUnique({ 
                where: { ean },
                include: { brand: true } 
            });
            if (dbProduct) {
                const featuresString = dbProduct.features ? JSON.stringify(dbProduct.features) : '';
                let textDesc = '';
                if (dbProduct.offerDraft && dbProduct.offerDraft.htmlContent) {
                    if (dbProduct.offerDraft.htmlContent.sekcja1) {
                        // Wyciągnięcie Modułu 1
                        textDesc += dbProduct.offerDraft.htmlContent.sekcja1
                            .replace(/<[^>]*>?/gm, '')
                            .replace(/\s+/g, ' ')
                            .trim() + ' ';
                    }
                    if (dbProduct.offerDraft.htmlContent.sekcja3) {
                        // Wyciągnięcie Modułu 3: DETALE
                        textDesc += dbProduct.offerDraft.htmlContent.sekcja3
                            .replace(/<[^>]*>?/gm, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                    }
                }
                
                productDetailsText = `NAME: ${dbProduct.name} FEATURES: ${featuresString} STRENGTHS: ${textDesc}`;
            }
        }
    } catch(e) { 
        console.error("[Photoroom V2] Błąd odczytu PIM:", e.message); 
    }

    const fd = new FormData();
    let generatedPrompt = "";

    if (slot === 1) {
        // Miniatura - klasyczne usunięcie tła
        fd.append('imageFile', inputBuffer, `${ean}_src.jpg`);
        fd.append('removeBackground', 'true');
        fd.append('background.color', '#FFFFFF');
        fd.append('padding', '0.05');
        fd.append('shadow.mode', 'none');
        onLog(`[PHOTOROOM API] Konfiguracja: Miniatura (removeBackground: true)`);
    } else {
        // Zdjęcia lifestylowe (Prompt Master)
        generatedPrompt = await PromptMasterService.generatePrompt(slot, productDetailsText, ean, inputBuffer.toString('base64'), onLog);
        const seed = Math.floor(Math.random() * 2147483647).toString();
        
        fd.append('imageFile', inputBuffer, `${ean}_src.jpg`);
        fd.append('removeBackground', 'false');
        fd.append('outputSize', '1080x1080');
        fd.append('export.format', 'jpeg');
        fd.append('editWithAI.mode', 'ai.auto');
        fd.append('editWithAI.prompt', generatedPrompt);
        // Parametr Photoroom API zapobiegający ucinaniu produktu z brzegów kadru
        fd.append('ignorePaddingAndSnapOnCroppedSides', 'false');
        // Losowy seed dla dodatkowego zróżnicowania
        fd.append('editWithAI.seed', seed);

        console.log(`\n=== [Photoroom API] WYSYŁKA ŻĄDANIA DLA SLOTA ${slot} ===`);
        console.log(`ENDPOINT: POST ${PHOTOROOM_ENDPOINT}`);
        console.log(`PAYLOAD (Zmontowany obiekt FormData):`);
        console.log(` - imageFile: <Oryginalny Obraz Base64/Buffer ${inputBuffer.length} bytes>`);
        console.log(` - removeBackground: false`);
        console.log(` - outputSize: 1080x1080`);
        console.log(` - export.format: jpeg`);
        console.log(` - editWithAI.mode: ai.auto`);
        console.log(` - editWithAI.prompt:\n   "${generatedPrompt}"`);
        console.log(` - editWithAI.seed: ${seed}`);
        console.log(` - ignorePaddingAndSnapOnCroppedSides: false`);
        console.log(`=========================================================\n`);
        
        onLog(`\n[PHOTOROOM API - WYSYŁANY PAYLOAD Z FORMDATA]
- endpoint: POST ${PHOTOROOM_ENDPOINT}
- imageFile: <Buffer ${inputBuffer.length} bytes>
- removeBackground: false
- outputSize: 1080x1080
- export.format: jpeg
- editWithAI.mode: ai.auto
- editWithAI.prompt: ${generatedPrompt}
- editWithAI.seed: ${seed}
- ignorePaddingAndSnapOnCroppedSides: false
[KONIEC PAYLOADU]`);
    }

    const headers = {
        'x-api-key': photoroomKey,
        ...fd.getHeaders()
    };

    try {
        const response = await axios.post(PHOTOROOM_ENDPOINT, fd, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 60000
        });

        const resultBuffer = Buffer.from(response.data);
        const rawMetadata = await sharp(resultBuffer).metadata();
        onLog(`[API SUCCESS] Odebrano poprawny obraz z Photoroom V2. Wymiary RAW: ${rawMetadata.width}x${rawMetadata.height}. Rozpoczynam post-processing (Sharp)...`);
        
        try {
            const debugDir = require('path').join(__dirname, 'debug_images');
            if (!require('fs').existsSync(debugDir)) {
                require('fs').mkdirSync(debugDir, { recursive: true });
            }
            const safeEan = ean || 'unknown';
            const rawPath = require('path').join(debugDir, `photoroom_debug_raw_${safeEan}_slot_${slot}.jpg`);
            require('fs').writeFileSync(rawPath, resultBuffer);
            onLog(`[DEBUG] Zapisano surowy obraz przed post-processingiem do: ${rawPath}`);
        } catch (e) {
            console.error('[DEBUG] Błąd zapisu pliku testowego:', e);
        }

        // --- POST-PROCESSING: Włoska ramka i znak wodny AI (Sharp + opentype.js) ---
        const brand = (dbProduct && dbProduct.brand && dbProduct.brand.name) 
            ? dbProduct.brand.name.toUpperCase() 
            : null;

        const W = rawMetadata.width;
        const H = rawMetadata.height;
        const scale = Math.min(W, H) / 1080;
        const thickness = Math.max(2, Math.round(18 * scale));

        const aiPath = textToPathData('AI', Math.round(22 * scale));

        let leftFrameSvg = '';
        if (brand) {
            const brandPath = textToPathData(brand, Math.round(28 * scale));
            const brandY = (H / 2) + (brandPath.width / 2);
            
            const padding = Math.round(60 * scale);
            const gapHeight = brandPath.width + padding;
            let topRectHeight = (H / 2) - (gapHeight / 2);
            let bottomRectY = (H / 2) + (gapHeight / 2);
            let bottomRectHeight = H - bottomRectY;

            if (topRectHeight < 0) topRectHeight = 0;
            if (bottomRectHeight < 0) bottomRectHeight = 0;

            leftFrameSvg = `
          <!-- Lewa ramka (Zielona) - Przerwana na środku dla marki -->
          <rect x="0" y="0" width="${thickness}" height="${topRectHeight}" fill="#009246" />
          <rect x="0" y="${bottomRectY}" width="${thickness}" height="${bottomRectHeight}" fill="#009246" />
          
          <!-- Tekst Marki jako Czyste Krzywe SVG -->
          <g transform="translate(${Math.round(20 * scale)}, ${brandY}) rotate(-90)">
            <path d="${brandPath.d}" fill="#009246" stroke="#FFFFFF" stroke-width="${1.5 * scale}" />
          </g>`;
        }

        const segmentW = W / 3;

        const svgFrame = `
        <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
          <!-- Prawa ramka (Czerwona) -->
          <rect x="${W - thickness}" y="0" width="${thickness}" height="${H}" fill="#CE2B37" />
          
          <!-- Górna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="0" width="${segmentW}" height="${thickness}" fill="#009246" />
          <rect x="${segmentW}" y="0" width="${segmentW}" height="${thickness}" fill="#FFFFFF" />
          <rect x="${segmentW * 2}" y="0" width="${W - segmentW * 2}" height="${thickness}" fill="#CE2B37" />
          
          <!-- Dolna ramka (Zielony, Biały, Czerwony) -->
          <rect x="0" y="${H - thickness}" width="${segmentW}" height="${thickness}" fill="#009246" />
          <rect x="${segmentW}" y="${H - thickness}" width="${segmentW}" height="${thickness}" fill="#FFFFFF" />
          <rect x="${segmentW * 2}" y="${H - thickness}" width="${W - segmentW * 2}" height="${thickness}" fill="#CE2B37" />

${leftFrameSvg}

          <!-- Znacznik AI -->
          <g transform="translate(${W - Math.round(140 * scale)}, ${H - Math.round(80 * scale)})">
            <rect x="0" y="0" width="${Math.round(100 * scale)}" height="${Math.round(40 * scale)}" rx="${Math.round(20 * scale)}" fill="rgba(0,0,0,0.65)" />
            <g transform="translate(${Math.round(15 * scale)}, ${Math.round(28 * scale)})">
                <path d="${aiPath.d}" fill="white" />
            </g>
            <g transform="translate(${Math.round(50 * scale)}, ${Math.round(4 * scale)}) scale(${1.33 * scale})">
              <path d="M10 2c0 4.42-3.58 8-8 8 4.42 0 8 3.58 8 8 0-4.42 3.58-8 8-8-4.42 0-8-3.58-8-8z" fill="white" />
              <path d="M19 3c0 1.66-1.34 3-3 3 1.66 0 3 1.34 3 3 0-1.66 1.34-3 3-3-1.66 0-3-1.34-3-3z" fill="white" />
              <path d="M17 15c0 1.1-0.9 2-2 2 1.1 0 2 0.9 2 2 0-1.1 0.9-2 2-2-1.1 0-2-0.9-2-2z" fill="white" />
            </g>
          </g>
        </svg>`;

        let quality = 95;
        let compositedBuffer = await sharp(resultBuffer)
            .composite([{ input: Buffer.from(svgFrame) }])
            .jpeg({ quality })
            .toBuffer();
            
        const MAX_BYTES = 1.9 * 1024 * 1024;
        while (compositedBuffer.length > MAX_BYTES && quality > 10) {
            quality -= 10;
            compositedBuffer = await sharp(resultBuffer)
                .composite([{ input: Buffer.from(svgFrame) }])
                .jpeg({ quality })
                .toBuffer();
        }

        const base64Output = `data:image/jpeg;base64,${compositedBuffer.toString('base64')}`;
        onLog(`[GOTOWE] Zakończono post-processing. Zwracam Base64 zdjęcia.`);

        return {
            base64: base64Output,
            visualTrendReport: `Wygenerowano za pomocą V2 Prompt Master. Agent ID: 11.`
        };

    } catch (err) {
        let errorDetails = err.message;
        if (err.response && err.response.data) {
            try {
                errorDetails = Buffer.from(err.response.data).toString('utf-8');
            } catch(e) {}
        }
        console.error("[Photoroom V2 Error]", errorDetails);
        throw new Error(`Błąd Photoroom API V2: ${errorDetails}`);
    }
}

module.exports = {
    generateLifestyle: generatePhotoroomLifestyle
};
