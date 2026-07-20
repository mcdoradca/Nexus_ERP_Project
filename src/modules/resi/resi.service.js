const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const AdmZip = require('adm-zip');

class ResiService {
    static async uploadToClaid(fileBuffer, claidKey) {
        const form = new FormData();
        form.append('file', fileBuffer, { filename: 'upload.jpg', contentType: 'image/jpeg' });
        form.append('data', JSON.stringify({}));

        const res = await axios.post('https://api.claid.ai/v1/image/edit/upload', form, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                ...form.getHeaders()
            },
            timeout: 30000
        });

        const tmpUrl = res.data?.data?.output?.tmp_url;
        if (!tmpUrl) throw new Error("Nie udało się pobrać tmp_url z uploadu Claid.");
        return tmpUrl;
    }

    static async removeBackgroundClaid(imageUrl, claidKey) {
        const payload = {
            image: imageUrl,
            operations: {
                restorations: { remove_background: true }
            },
            output: { format: "png" }
        };

        const res = await axios.post('https://api.claid.ai/v1/image/edit', payload, {
            headers: {
                'Authorization': `Bearer ${claidKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        const transparentUrl = res.data?.data?.output?.tmp_url;
        if (!transparentUrl) throw new Error("Brak tmp_url z wynikiem szparowania.");
        return transparentUrl;
    }

    static async downloadImageBuffer(url) {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(res.data, 'binary');
    }

    static async createPlatformImage(sourceBuffer, targetSize, fillPercentage, fitMode = 'fit') {
        const image = sharp(sourceBuffer);

        if (fitMode === 'fit') {
            const maxSize = Math.round(targetSize * fillPercentage);
            return image
                .resize({
                    width: maxSize,
                    height: maxSize,
                    fit: 'inside',
                    kernel: sharp.kernel.lanczos3
                })
                .sharpen({ sigma: 1.3 })
                .extend({
                    top: Math.floor((targetSize - maxSize) / 2),
                    bottom: Math.ceil((targetSize - maxSize) / 2),
                    left: Math.floor((targetSize - maxSize) / 2),
                    right: Math.ceil((targetSize - maxSize) / 2),
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .withMetadata({ density: 72 })
                .toFormat('jpeg', { quality: 90, mozjpeg: true })
                .toBuffer();
        } else if (fitMode === 'fill') {
            return image
                .resize({
                    width: targetSize,
                    height: targetSize,
                    fit: 'cover',
                    kernel: sharp.kernel.lanczos3
                })
                .sharpen({ sigma: 1.3 })
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .toFormat('jpeg', { quality: 90, mozjpeg: true })
                .toBuffer();
        }
    }

    static async processSingleImage(fileBuffer, originalName, mode, asinPrefix, claidKey) {
        try {
            let processedBuffer = fileBuffer;
            let results = {};

            const baseName = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9\-_ ]/g, "").trim();

            if (mode === 'full' || mode === 'extract-only') {
                console.log(`[Resi] Wgrywanie ${originalName} do Claid...`);
                const uploadedUrl = await this.uploadToClaid(fileBuffer, claidKey);
                console.log(`[Resi] Szparowanie ${originalName}...`);
                const transparentUrl = await this.removeBackgroundClaid(uploadedUrl, claidKey);
                console.log(`[Resi] Pobieranie pliku ${originalName}...`);
                processedBuffer = await this.downloadImageBuffer(transparentUrl);

                processedBuffer = await sharp(processedBuffer)
                    .trim()
                    .toFormat('png')
                    .toBuffer();
                    
                results['czyste_png'] = {
                    name: `${baseName}_czyste.png`,
                    buffer: processedBuffer
                };

                if (mode === 'extract-only') return results;
            }
            
            const fitMode = (mode === 'full' || mode === 'extract-only') ? 'fit' : 'fill';

            const [imgAllegro, imgAmazon, imgEmag, imgKaufland] = await Promise.all([
                this.createPlatformImage(processedBuffer, 2560, (fitMode === 'fit' ? 0.90 : 1.0), fitMode),
                this.createPlatformImage(processedBuffer, 3000, (fitMode === 'fit' ? 0.95 : 1.0), fitMode),
                this.createPlatformImage(processedBuffer, 3000, (fitMode === 'fit' ? 0.85 : 1.0), fitMode),
                this.createPlatformImage(processedBuffer, 2048, (fitMode === 'fit' ? 0.95 : 1.0), fitMode)
            ]);

            results['allegro'] = { name: `${baseName}_allegro.jpg`, buffer: imgAllegro };
            const amazonName = asinPrefix ? `${asinPrefix}_${baseName}.MAIN.jpg` : `${baseName}.MAIN.jpg`;
            results['amazon'] = { name: amazonName, buffer: imgAmazon };
            results['emag'] = { name: `${baseName}_emag.jpg`, buffer: imgEmag };
            results['kaufland'] = { name: `${baseName}_kaufland.jpg`, buffer: imgKaufland };

            return results;
        } catch (error) {
            console.error(`[Resi] Błąd pliku ${originalName}:`, error.message);
            throw error;
        }
    }

    static async processBatch(files, mode, asinPrefix) {
        const claidKey = process.env.CLAID_API_KEY;
        if (!claidKey) throw new Error("Brak klucza CLAID_API_KEY w konfiguracji .env.");

        const zip = new AdmZip();
        
        // Funkcja limitująca współbieżność (Queue)
        const runWithConcurrencyLimit = async (limit, items, asyncFn) => {
            const results = [];
            const executing = [];
            for (const item of items) {
                const p = asyncFn(item);
                results.push(p);
                const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                executing.push(e);
                if (executing.length >= limit) {
                    await Promise.race(executing);
                }
            }
            return Promise.all(results);
        };

        let completed = 0;
        await runWithConcurrencyLimit(5, files, async (file) => {
            try {
                const results = await this.processSingleImage(file.buffer, file.originalname, mode, asinPrefix, claidKey);
                if (results['czyste_png']) zip.addFile(`Czyste_PNG/${results['czyste_png'].name}`, results['czyste_png'].buffer);
                if (results['allegro']) zip.addFile(`Allegro_Ready/${results['allegro'].name}`, results['allegro'].buffer);
                if (results['amazon']) zip.addFile(`Amazon_Ready/${results['amazon'].name}`, results['amazon'].buffer);
                if (results['emag']) zip.addFile(`eMag_Ready/${results['emag'].name}`, results['emag'].buffer);
                if (results['kaufland']) zip.addFile(`Kaufland_Ready/${results['kaufland'].name}`, results['kaufland'].buffer);
                completed++;
                console.log(`[Resi] Ukończono ${completed}/${files.length} plików.`);
            } catch (err) {
                console.error(`[Resi] Pominięto plik ${file.originalname}: ${err.message}`);
            }
        });

        console.log("[Resi] Koniec przetwarzania paczki. Zwracanie ZIP...");
        return zip.toBuffer();
    }
}

module.exports = ResiService;
