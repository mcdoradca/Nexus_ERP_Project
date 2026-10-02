const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { GoogleGenAI } = require('@google/genai');

ffmpeg.setFfmpegPath(ffmpegStatic);

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 60000 }
});

class CreativeStudioService {
    constructor() {
        this.outputDir = path.join(__dirname, '../../../frontend/public/uploads/ad-intelligence');
        this.tempDir = path.join(this.outputDir, 'temp');
        this._ensureDirs();
    }

    _ensureDirs() {
        if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
        if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    }

    /**
     * Generuje pojedynczą statyczną kreację reklamową (1080x1080)
     */
    async generateStaticAd(adBrief, brandProfile = {}) {
        const brandName = brandProfile.name || 'NEXUS';
        const fileId = `static_${adBrief.id || Date.now()}_${Math.random().toString(36).substring(7)}`;
        const outputPath = path.join(this.outputDir, `${fileId}.png`);

        let bgBuffer = null;

        // 1. Próba generowania tła fotograficznego przez Imagen 3
        if (adBrief.visual_prompt && process.env.GEMINI_API_KEY) {
            try {
                console.log(`[CreativeStudio] Próba generowania obrazu bazowego przez Imagen 3 dla "${adBrief.headline.substring(0, 30)}"...`);
                const imagenResp = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt: `${adBrief.visual_prompt}, commercial product photography, ultra clean lighting, sharp focus, 8k resolution`,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/jpeg',
                        aspectRatio: '1:1'
                    }
                });

                const generatedImage = imagenResp.generatedImages && imagenResp.generatedImages[0];
                if (generatedImage && generatedImage.image && generatedImage.image.imageBytes) {
                    bgBuffer = Buffer.from(generatedImage.image.imageBytes, 'base64');
                    console.log('[CreativeStudio] Obraz bazowy pomyślnie wygenerowany przez Imagen 3 ✅');
                }
            } catch (err) {
                console.warn(`[CreativeStudio] Imagen 3 niedostępny lub limit (${err.message}). Używam wysokiej klasy silnika kompozytowego Sharp.`);
            }
        }

        // 2. Jeśli brak obrazu z Imagen, tworzymy nowoczesne tło gradientowe Dark-Mode w Sharp
        if (!bgBuffer) {
            const svgBg = `
            <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#090d16" />
                        <stop offset="40%" stop-color="#111827" />
                        <stop offset="100%" stop-color="#1e1b4b" />
                    </linearGradient>
                    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
                        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
                    </radialGradient>
                    <radialGradient id="glow2" cx="20%" cy="80%" r="50%">
                        <stop offset="0%" stop-color="#ec4899" stop-opacity="0.25" />
                        <stop offset="100%" stop-color="#ec4899" stop-opacity="0" />
                    </radialGradient>
                </defs>
                <rect width="1080" height="1080" fill="url(#bgGrad)" />
                <rect width="1080" height="1080" fill="url(#glow)" />
                <rect width="1080" height="1080" fill="url(#glow2)" />
                <circle cx="540" cy="540" r="450" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1.5" />
                <circle cx="540" cy="540" r="320" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1" />
            </svg>`;
            bgBuffer = await sharp(Buffer.from(svgBg)).png().toBuffer();
        } else {
            // Przeskalowanie tła Imagen do 1080x1080 z ciemną winietą na tekst
            const vignetteSvg = `
            <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
                <rect width="1080" height="1080" fill="#000000" fill-opacity="0.55" />
            </svg>`;
            bgBuffer = await sharp(bgBuffer)
                .resize(1080, 1080, { fit: 'cover' })
                .composite([{ input: Buffer.from(vignetteSvg), blend: 'over' }])
                .png()
                .toBuffer();
        }

        // 3. Deterministyczny skład typografii i elementów zaufania (Zero zniekształconych liter)
        const cleanHeadline = this._escapeXml(adBrief.headline || 'Nowość na rynku');
        const cleanSubheadline = this._escapeXml(adBrief.subheadline || 'Sprawdź szczegóły oferty');
        const cleanBadge = this._escapeXml(adBrief.badge_text || '⭐ 4.9/5 | Najwyższa Jakość');
        const cleanCta = this._escapeXml(adBrief.cta_text || 'Sprawdź Ofertę');
        const cleanBrand = this._escapeXml(brandName.toUpperCase());

        const textOverlaySvg = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
            <style>
                .brand { font-family: 'Segoe UI', Arial, sans-serif; font-size: 24px; font-weight: 900; fill: #a5b4fc; letter-spacing: 4px; }
                .badge-bg { fill: #4f46e5; fill-opacity: 0.9; rx: 24px; }
                .badge-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 22px; font-weight: 800; fill: #ffffff; letter-spacing: 1px; }
                .headline { font-family: 'Segoe UI', Arial, sans-serif; font-size: 64px; font-weight: 900; fill: #ffffff; line-height: 1.15; }
                .subheadline { font-family: 'Segoe UI', Arial, sans-serif; font-size: 32px; font-weight: 500; fill: #cbd5e1; }
                .cta-box { fill: #ec4899; rx: 18px; filter: drop-shadow(0 10px 25px rgba(236, 72, 153, 0.45)); }
                .cta-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 30px; font-weight: 900; fill: #ffffff; letter-spacing: 1px; }
                .guarantee { font-family: 'Segoe UI', Arial, sans-serif; font-size: 18px; font-weight: 600; fill: #94a3b8; }
            </style>

            <!-- Brand Header -->
            <text x="90" y="110" class="brand">${cleanBrand}</text>

            <!-- Badge Trust -->
            <rect x="90" y="150" width="460" height="50" class="badge-bg" />
            <text x="320" y="183" text-anchor="middle" class="badge-text">${cleanBadge}</text>

            <!-- Main Headline -->
            <foreignObject x="90" y="240" width="900" height="340">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 58px; font-weight: 900; color: #ffffff; line-height: 1.18;">
                    ${cleanHeadline}
                </div>
            </foreignObject>

            <!-- Subheadline -->
            <foreignObject x="90" y="600" width="900" height="180">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 28px; font-weight: 500; color: #cbd5e1; line-height: 1.4;">
                    ${cleanSubheadline}
                </div>
            </foreignObject>

            <!-- Conversion CTA Button -->
            <g transform="translate(90, 840)">
                <rect width="480" height="85" class="cta-box" />
                <text x="240" y="53" text-anchor="middle" class="cta-text">${cleanCta} →</text>
            </g>

            <!-- Guarantee Note -->
            <text x="90" y="980" class="guarantee">🔒 Bezpieczna dostawa z magazynu UE • Gwarancja satysfakcji • Szybka realizacja</text>
        </svg>`;

        // Składanie warstw
        await sharp(bgBuffer)
            .composite([{ input: Buffer.from(textOverlaySvg), blend: 'over' }])
            .png()
            .toFile(outputPath);

        const publicUrl = `/uploads/ad-intelligence/${path.basename(outputPath)}`;
        return {
            id: adBrief.id,
            mediaUrl: publicUrl,
            mediaType: 'image',
            format: 'Zdjęcie / Statyk',
            headline: adBrief.headline,
            content: `${adBrief.headline}\n\n${adBrief.body_copy}\n\n👉 ${adBrief.cta_text}`,
            hashtags: adBrief.hashtags || '#SkinCare #Beauty #Nexus',
            adBudgetInfo: adBrief.suggested_budget || '200 zł',
            notes: `Wygenerowano w Creative Studio na bazie zwycięskich reklam konkurencji. Badge: ${adBrief.badge_text}.`
        };
    }

    /**
     * Generuje krótką formę wideo Reels (format pionowy 9:16 - 1080x1920)
     */
    async generateReelsVideo(reelBrief, brandProfile = {}) {
        const brandName = brandProfile.name || 'NEXUS';
        const fileId = `reel_${reelBrief.id || Date.now()}_${Math.random().toString(36).substring(7)}`;
        const reelTempDir = path.join(this.tempDir, fileId);
        fs.mkdirSync(reelTempDir, { recursive: true });

        const scenes = Array.isArray(reelBrief.scenes) && reelBrief.scenes.length >= 3 
            ? reelBrief.scenes 
            : [
                { onscreen_text: reelBrief.hook_3s || "STOP! Czy Twoja skóra też tak reaguje?", visual_action: "Hook alert" },
                { onscreen_text: "90% drogeryjnych produktów wypłukuje barierę lipidową", visual_action: "Problem presentation" },
                { onscreen_text: "Odkryj formułę biomimetyczną z certyfikatem UE", visual_action: "Solution reveal" },
                { onscreen_text: "Sprawdź link w bio i zamów z darmową dostawą!", visual_action: "CTA outro" }
            ];

        const framePaths = [];

        // Generujemy po 1 klatce kluczowej dla każdej sceny (1080x1920)
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const framePath = path.join(reelTempDir, `frame_${i}.png`);

            const isHook = i === 0;
            const isCta = i === scenes.length - 1;

            const bgTheme = isHook 
                ? 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 60%, #450a0a 100%)'
                : isCta 
                ? 'linear-gradient(180deg, #090d16 0%, #1e1b4b 50%, #4c0519 100%)'
                : 'linear-gradient(180deg, #090d16 0%, #111827 70%, #1e1b4b 100%)';

            const badgeBg = isHook ? '#dc2626' : isCta ? '#ec4899' : '#4f46e5';
            const badgeText = isHook ? '🚨 PILNY ALERT KOSMETYCZNY' : isCta ? '⚡ OFERTA LIMITOWANA' : `KROK ${i}`;

            const svgFrame = `
            <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="grad${i}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${isHook ? '#1e1b4b' : isCta ? '#090d16' : '#0f172a'}" />
                        <stop offset="50%" stop-color="${isHook ? '#090d16' : '#1e1b4b'}" />
                        <stop offset="100%" stop-color="${isHook ? '#450a0a' : isCta ? '#831843' : '#1e1b4b'}" />
                    </linearGradient>
                </defs>
                <rect width="1080" height="1920" fill="url(#grad${i})" />
                
                <!-- Glow Circles -->
                <circle cx="540" cy="960" r="500" fill="#6366f1" fill-opacity="0.12" />
                <circle cx="540" cy="${isHook ? 400 : 1500}" r="380" fill="${isHook ? '#ef4444' : '#ec4899'}" fill-opacity="0.18" />

                <!-- Top Header -->
                <text x="540" y="180" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="28px" font-weight="900" fill="#94a3b8" letter-spacing="6px">${this._escapeXml(brandName.toUpperCase())} REELS</text>

                <!-- Indicator Badge -->
                <rect x="240" y="240" width="600" height="65" rx="32" fill="${badgeBg}" />
                <text x="540" y="282" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="24px" font-weight="900" fill="#ffffff" letter-spacing="2px">${badgeText}</text>

                <!-- Dynamic Center Text -->
                <foreignObject x="90" y="650" width="900" height="700">
                    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 64px; font-weight: 900; color: #ffffff; text-align: center; line-height: 1.25; text-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                        ${this._escapeXml(scene.onscreen_text)}
                    </div>
                </foreignObject>

                <!-- Action Footer -->
                <rect x="140" y="1600" width="800" height="110" rx="30" fill="${isCta ? '#ec4899' : '#4f46e5'}" />
                <text x="540" y="1668" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="34px" font-weight="900" fill="#ffffff" letter-spacing="2px">
                    ${isCta ? 'KLIKNIJ LINK W BIO →' : 'PRZESUŃ W GÓRĘ, ABY SPRAWDZIĆ'}
                </text>
            </svg>`;

            await sharp(Buffer.from(svgFrame)).png().toFile(framePath);
            framePaths.push(framePath);
        }

        // Przygotowujemy plik konfiguracyjny concat dla FFmpeg
        const concatTxt = path.join(reelTempDir, 'concat.txt');
        let concatContent = '';
        const durationPerScene = 3.5; // 3.5s x 4 sceny = 14 sekund
        for (let i = 0; i < framePaths.length; i++) {
            const escaped = framePaths[i].replace(/\\/g, '/');
            concatContent += `file '${escaped}'\nduration ${durationPerScene}\n`;
        }
        // Ostatnia klatka musi być powtórzona zgodnie ze specyfikacją concat demuxer w FFmpeg
        concatContent += `file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'\n`;
        fs.writeFileSync(concatTxt, concatContent, 'utf8');

        const outputMp4 = path.join(this.outputDir, `${fileId}.mp4`);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(concatTxt)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .input('anullsrc=channel_layout=stereo:sample_rate=44100')
                    .inputOptions(['-f', 'lavfi'])
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac',
                        '-shortest',
                        '-movflags', '+faststart'
                    ])
                    .save(outputMp4)
                    .on('end', () => resolve(outputMp4))
                    .on('error', (err) => reject(err));
            });
        } finally {
            // Sprzątanie plików tymczasowych
            try {
                fs.rmSync(reelTempDir, { recursive: true, force: true });
            } catch (e) {}
        }

        const publicUrl = `/uploads/ad-intelligence/${path.basename(outputMp4)}`;
        return {
            id: reelBrief.id,
            mediaUrl: publicUrl,
            mediaType: 'video',
            format: 'Rolka (Reels)',
            headline: reelBrief.title || reelBrief.hook_3s,
            content: `🎬 [REELS] ${reelBrief.title}\n\nHACZYK: "${reelBrief.hook_3s}"\n\nLEKTOR / VOICEOVER:\n${reelBrief.script_voiceover}\n\nCTA: ${reelBrief.cta_audio}`,
            hashtags: '#Reels #ViralMarketing #KBeauty #Pielęgnacja #NexusERP',
            adBudgetInfo: reelBrief.suggested_budget || '350 zł',
            notes: `Format Reels (9:16) zmontowany przez FFmpeg. Czas trwania: ~14s. Sceny: ${scenes.length}.`
        };
    }

    _escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

module.exports = new CreativeStudioService();
