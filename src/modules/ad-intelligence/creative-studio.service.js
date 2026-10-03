const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

ffmpeg.setFfmpegPath(ffmpegStatic);

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 60000 }
}) : null;

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    : null;

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
     * Bezpiecznie pobiera bufor obrazu z URL (HTTP/HTTPS), Base64 lub dysku lokalnego
     */
    async _fetchImageBuffer(source) {
        if (!source || typeof source !== 'string') return null;

        try {
            if (source.startsWith('data:image/')) {
                const base64Data = source.split(',')[1];
                return Buffer.from(base64Data, 'base64');
            }

            if (source.startsWith('http://') || source.startsWith('https://')) {
                const response = await axios.get(source, {
                    responseType: 'arraybuffer',
                    timeout: 12000,
                    headers: { 'User-Agent': 'Nexus-Creative-Studio/1.0' }
                });
                return Buffer.from(response.data);
            }

            // Obsługa ścieżek relatywnych /uploads/...
            let localPath = source;
            if (source.startsWith('/uploads')) {
                localPath = path.join(__dirname, '../../../frontend/public', source);
            }
            if (fs.existsSync(localPath)) {
                return fs.readFileSync(localPath);
            }
        } catch (err) {
            console.warn(`[CreativeStudio] Nie udało się pobrać zdjęcia źródłowego (${source}): ${err.message}`);
        }
        return null;
    }

    /**
     * Upload bufora do Supabase Storage ('nexus-files')
     */
    async _uploadToSupabase(buffer, fileName, contentType) {
        if (!supabase) {
            console.warn('[CreativeStudio] Supabase nie jest skonfigurowany. Pomijam upload do chmury.');
            return null;
        }

        try {
            const storagePath = `ad-intelligence/${Date.now()}_${fileName}`;
            const { error } = await supabase.storage
                .from('nexus-files')
                .upload(storagePath, buffer, {
                    contentType,
                    upsert: true
                });

            if (error) {
                console.error('[CreativeStudio] Błąd uploadu do Supabase Storage:', error.message);
                return null;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('nexus-files')
                .getPublicUrl(storagePath);

            console.log(`[CreativeStudio] Pomyślnie zsynchronizowano asset z Supabase CDN: ${publicUrl}`);
            return publicUrl;
        } catch (err) {
            console.error('[CreativeStudio] Nieoczekiwany wyjątek podczas uploadu do Supabase:', err.message);
            return null;
        }
    }

    /**
     * Generuje pojedynczą statyczną kreację reklamową (1080x1080)
     * Komponuje fizyczny packshot z PIM, wypieka wektorowy cień (Shadow Baking) i nakłada typografię
     */
    async generateStaticAd(adBrief, brandProfile = {}, productData = {}) {
        const brandName = brandProfile.name || productData.brand?.name || productData.name || 'NEXUS';
        const fileId = `static_${adBrief.id || Date.now()}_${Math.random().toString(36).substring(7)}`;
        const outputFileName = `${fileId}.png`;
        const outputPath = path.join(this.outputDir, outputFileName);

        // 1. Ustalenie źródła zdjęcia produktu (z briefu, profilu zewnętrznego lub z PIM)
        const productImgSource = adBrief.productImageUrl 
            || brandProfile.customProductImgUrl
            || productData.imageUrl 
            || (Array.isArray(productData.images) && productData.images.length > 0 ? productData.images[0] : null);

        let productBuffer = null;
        if (productImgSource) {
            productBuffer = await this._fetchImageBuffer(productImgSource);
        }

        // 2. Generowanie tła bazowego (Nowoczesny Dark Mode ze świetlistymi gradientami)
        // Wybór 1 z 4 luksusowych motywów kolorystycznych w zależności od briefu
        const themes = [
            {
                id: 'indigo',
                bgStart: '#080c18',
                bgMid: '#0f172a',
                bgEnd: '#1e1b4b',
                glow1: '#6366f1',
                glow2: '#06b6d4',
                accent: '#818cf8',
                badgeBg: '#4f46e5',
                ctaBg: '#6366f1',
                podiumStroke: 'rgba(99, 102, 241, 0.45)',
                podiumGlow: '#6366f1',
                tagText: '⭐ BESTSELLER RYNKOWY'
            },
            {
                id: 'coral',
                bgStart: '#140810',
                bgMid: '#240b17',
                bgEnd: '#4c0519',
                glow1: '#f43f5e',
                glow2: '#fb923c',
                accent: '#fb7185',
                badgeBg: '#e11d48',
                ctaBg: '#f43f5e',
                podiumStroke: 'rgba(244, 63, 94, 0.45)',
                podiumGlow: '#f43f5e',
                tagText: '🔥 HIT KONWERSJI 2026'
            },
            {
                id: 'emerald',
                bgStart: '#03120b',
                bgMid: '#062417',
                bgEnd: '#022c22',
                glow1: '#10b981',
                glow2: '#06b6d4',
                accent: '#34d399',
                badgeBg: '#059669',
                ctaBg: '#10b981',
                podiumStroke: 'rgba(16, 185, 129, 0.45)',
                podiumGlow: '#10b981',
                tagText: '🌿 100% CZYSTA JAKOŚĆ'
            },
            {
                id: 'gold',
                bgStart: '#0c0d12',
                bgMid: '#1a1815',
                bgEnd: '#291804',
                glow1: '#f59e0b',
                glow2: '#eab308',
                accent: '#fbbf24',
                badgeBg: '#d97706',
                ctaBg: '#f59e0b',
                podiumStroke: 'rgba(245, 158, 11, 0.45)',
                podiumGlow: '#f59e0b',
                tagText: '👑 EDYCJA PREMIUM'
            }
        ];

        const numericId = parseInt((adBrief.id || '').replace(/\D/g, '')) || 0;
        const currentTheme = themes[numericId % themes.length];

        // 2. Generowanie tła bazowego (Kinematograficzny Dark Mode z wielowarstwowymi gradientami i siatką świetlną)
        const svgBg = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="mainBg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${currentTheme.bgStart}" />
                    <stop offset="45%" stop-color="${currentTheme.bgMid}" />
                    <stop offset="100%" stop-color="${currentTheme.bgEnd}" />
                </linearGradient>
                <radialGradient id="neonGlow1" cx="80%" cy="30%" r="55%">
                    <stop offset="0%" stop-color="${currentTheme.glow1}" stop-opacity="0.38" />
                    <stop offset="100%" stop-color="${currentTheme.glow1}" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="neonGlow2" cx="20%" cy="85%" r="60%">
                    <stop offset="0%" stop-color="${currentTheme.glow2}" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="${currentTheme.glow2}" stop-opacity="0" />
                </radialGradient>
            </defs>
            <rect width="1080" height="1080" fill="url(#mainBg)" />
            <rect width="1080" height="1080" fill="url(#neonGlow1)" />
            <rect width="1080" height="1080" fill="url(#neonGlow2)" />
            
            <!-- Eleganckie linie geometryczne siatki studia -->
            <circle cx="540" cy="540" r="500" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1.5" />
            <circle cx="540" cy="540" r="360" fill="none" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1" />
            <line x1="80" y1="120" x2="1000" y2="120" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1" />
            <line x1="80" y1="960" x2="1000" y2="960" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1" />
        </svg>`;

        let baseCanvas = sharp(Buffer.from(svgBg)).resize(1080, 1080);
        const compositeLayers = [];

        // 3. Commercial Showcase Podium: osadzenie packshotu w luksusowej kapsule studyjnej
        const hasProductImage = Boolean(productBuffer);

        if (hasProductImage) {
            try {
                // Przeskalowanie packshotu do 410x510 px z zachowaniem proporcji
                const resizedProduct = await sharp(productBuffer)
                    .resize(410, 510, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                const meta = await sharp(resizedProduct).metadata();
                const prodWidth = meta.width || 380;
                const prodHeight = meta.height || 480;

                // Podest studyjny (Showcase Card): lewa: 560, góra: 190, szerokość: 440, wysokość: 650
                const cardLeft = 560;
                const cardTop = 190;
                const cardWidth = 440;
                const cardHeight = 650;

                const prodLeft = cardLeft + Math.floor((cardWidth - prodWidth) / 2);
                const prodTop = cardTop + 70 + Math.floor((480 - prodHeight) / 2);

                // Warstwa kapsuły studyjnej (Frosted Glass Podium + Rim Light)
                const podiumSvg = `
                <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="prodSpot" cx="50%" cy="50%" r="55%">
                            <stop offset="0%" stop-color="${currentTheme.glow1}" stop-opacity="0.32" />
                            <stop offset="60%" stop-color="${currentTheme.glow1}" stop-opacity="0.08" />
                            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
                        </radialGradient>
                        <linearGradient id="glassBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35" />
                            <stop offset="50%" stop-color="${currentTheme.accent}" stop-opacity="0.2" />
                            <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
                        </linearGradient>
                        <filter id="shadowBlur" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="22" />
                        </filter>
                    </defs>

                    <!-- Karta Showcase Pod -->
                    <rect x="${cardLeft}" y="${cardTop}" width="${cardWidth}" height="${cardHeight}" rx="32" fill="#000000" fill-opacity="0.45" />
                    <rect x="${cardLeft}" y="${cardTop}" width="${cardWidth}" height="${cardHeight}" rx="32" fill="url(#prodSpot)" />
                    <rect x="${cardLeft}" y="${cardTop}" width="${cardWidth}" height="${cardHeight}" rx="32" fill="none" stroke="url(#glassBorder)" stroke-width="2" />

                    <!-- Odznaka górna w kapsule produktu -->
                    <rect x="${cardLeft + 25}" y="${cardTop + 24}" width="${cardWidth - 50}" height="32" rx="16" fill="${currentTheme.badgeBg}" fill-opacity="0.9" />
                    <text x="${cardLeft + cardWidth / 2}" y="${cardTop + 45}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="13" font-weight="900" fill="#ffffff" letter-spacing="1.5">${currentTheme.tagText}</text>

                    <!-- Podwójny cień kontaktowy i podest eliptyczny pod produktem -->
                    <ellipse cx="${cardLeft + cardWidth / 2}" cy="${prodTop + prodHeight + 8}" rx="${Math.min(prodWidth * 0.55, 170)}" ry="26" fill="#000000" fill-opacity="0.85" filter="url(#shadowBlur)" />
                    <ellipse cx="${cardLeft + cardWidth / 2}" cy="${prodTop + prodHeight + 8}" rx="${Math.min(prodWidth * 0.45, 140)}" ry="16" fill="${currentTheme.podiumGlow}" fill-opacity="0.35" />
                </svg>`;

                compositeLayers.push({
                    input: Buffer.from(podiumSvg),
                    blend: 'over'
                });

                // Osadzamy właściwy wycentrowany packshot
                compositeLayers.push({
                    input: resizedProduct,
                    top: prodTop,
                    left: prodLeft,
                    blend: 'over'
                });

                // Dolna wstęga gwarancji pod kapsułą
                const podFooterSvg = `
                <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${cardLeft + 30}" y="${cardTop + cardHeight - 55}" width="${cardWidth - 60}" height="36" rx="10" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1" />
                    <text x="${cardLeft + cardWidth / 2}" y="${cardTop + cardHeight - 32}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="12" font-weight="700" fill="#e2e8f0" letter-spacing="0.5">✓ ZGODNOŚĆ Z FORMULARZEM PIM</text>
                </svg>`;

                compositeLayers.push({
                    input: Buffer.from(podFooterSvg),
                    blend: 'over'
                });

            } catch (err) {
                console.warn('[CreativeStudio] Błąd nakładania packshotu produktu:', err.message);
            }
        }

        // 4. Skład typografii reklamowej i elementów perswazji
        const cleanHeadline = this._escapeXml(adBrief.headline || productData.name || 'Przełomowa formuła');
        const cleanSubheadline = this._escapeXml(adBrief.subheadline || 'Sprawdź certyfikowane rezultaty');
        const cleanBadge = this._escapeXml(adBrief.badge_text || '★ 4.9/5 | 100% Czyste Składniki');
        const cleanCta = this._escapeXml(adBrief.cta_text || 'Sprawdź Ofertę i Kup');
        const cleanBrand = this._escapeXml(brandName.toUpperCase());

        const priceText = productData.salePrice 
            ? `${Number(productData.salePrice).toFixed(2)} zł`
            : null;

        // Dynamiczna szerokość kolumny tekstu
        const textWidth = hasProductImage ? 440 : 900;

        const textOverlaySvg = `
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
            <style>
                .brand { font-family: 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 900; fill: ${currentTheme.accent}; letter-spacing: 5px; }
                .badge-bg { fill: ${currentTheme.badgeBg}; fill-opacity: 0.95; rx: 18px; }
                .badge-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; font-weight: 800; fill: #ffffff; letter-spacing: 0.8px; }
                .stars-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 700; fill: #fbbf24; }
                .benefit-check { font-family: 'Segoe UI', Arial, sans-serif; font-size: 16px; font-weight: 700; fill: #38bdf8; }
                .benefit-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; font-weight: 600; fill: #e2e8f0; }
                .price-ribbon { fill: #059669; rx: 10px; }
                .price-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 800; fill: #a7f3d0; text-transform: uppercase; letter-spacing: 1px; }
                .price-val { font-family: 'Segoe UI', Arial, sans-serif; font-size: 26px; font-weight: 900; fill: #ffffff; }
                .cta-box { fill: ${currentTheme.ctaBg}; rx: 16px; filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.45)); }
                .cta-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 22px; font-weight: 900; fill: #ffffff; letter-spacing: 0.8px; }
                .guarantee { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; font-weight: 600; fill: #94a3b8; }
            </style>

            <!-- Brand Header & Rating -->
            <g transform="translate(80, 85)">
                <text x="0" y="20" class="brand">${cleanBrand}</text>
                <text x="0" y="44" class="stars-text">★ ★ ★ ★ ★ 4.9/5 (1 420+ opinii)</text>
            </g>

            <!-- Trust Badge -->
            <rect x="80" y="150" width="${hasProductImage ? 400 : 480}" height="38" class="badge-bg" />
            <text x="${hasProductImage ? 280 : 320}" y="174" text-anchor="middle" class="badge-text">${cleanBadge}</text>

            <!-- Main Headline -->
            <foreignObject x="80" y="210" width="${textWidth}" height="280">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: ${hasProductImage ? '44px' : '56px'}; font-weight: 900; color: #ffffff; line-height: 1.16; word-break: break-word; text-shadow: 0 4px 12px rgba(0,0,0,0.6);">
                    ${cleanHeadline}
                </div>
            </foreignObject>

            <!-- Subheadline -->
            <foreignObject x="80" y="495" width="${textWidth}" height="140">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 20px; font-weight: 500; color: #cbd5e1; line-height: 1.42;">
                    ${cleanSubheadline}
                </div>
            </foreignObject>

            <!-- Benefit Checkmarks (Perswazyjne Punkty) -->
            <g transform="translate(80, 650)">
                <g transform="translate(0, 0)">
                    <text x="0" y="16" class="benefit-check">✓</text>
                    <text x="24" y="16" class="benefit-text">Gwarancja widocznych rezultatów lub zwrot</text>
                </g>
                <g transform="translate(0, 32)">
                    <text x="0" y="16" class="benefit-check">✓</text>
                    <text x="24" y="16" class="benefit-text">Certyfikowana formuła o przedłużonym działaniu</text>
                </g>
                <g transform="translate(0, 64)">
                    <text x="0" y="16" class="benefit-check">✓</text>
                    <text x="24" y="16" class="benefit-text">Ekspresowa dostawa 24h z magazynu PL</text>
                </g>
            </g>

            <!-- Price Badge Tag -->
            ${priceText ? `
            <g transform="translate(80, 775)">
                <rect width="${hasProductImage ? 220 : 260}" height="52" class="price-ribbon" />
                <text x="16" y="20" class="price-label">Cena Promocyjna</text>
                <text x="16" y="44" class="price-val">${priceText}</text>
            </g>
            ` : ''}

            <!-- Conversion CTA Button -->
            <g transform="translate(80, ${priceText ? 850 : 790})">
                <rect width="${hasProductImage ? 420 : 480}" height="76" class="cta-box" />
                <text x="${hasProductImage ? 210 : 240}" y="48" text-anchor="middle" class="cta-text">${cleanCta} →</text>
            </g>

            <!-- Bottom Guarantee Bar -->
            <text x="80" y="990" class="guarantee">🔒 Oficjalna dystrybucja • Gwarancja 100% Satysfakcji • Faktura VAT</text>
        </svg>`;

        compositeLayers.push({
            input: Buffer.from(textOverlaySvg),
            blend: 'over'
        });

        // 5. Finalny render obrazu
        const finalPngBuffer = await baseCanvas.composite(compositeLayers).png().toBuffer();
        fs.writeFileSync(outputPath, finalPngBuffer);

        // 6. Upload do Supabase Storage CDN z fallbackiem lokalnym i Base64

        const supabaseUrl = await this._uploadToSupabase(finalPngBuffer, outputFileName, 'image/png');
        const publicLocalUrl = `/uploads/ad-intelligence/${outputFileName}`;
        const base64DataUrl = `data:image/png;base64,${finalPngBuffer.toString('base64')}`;

        return {
            id: adBrief.id || `static_${Date.now()}`,
            mediaUrl: supabaseUrl || publicLocalUrl,
            localUrl: publicLocalUrl,
            base64DataUrl: base64DataUrl,
            mediaType: 'image',
            format: 'Zdjęcie / Statyk',
            headline: adBrief.headline || cleanHeadline,
            subheadline: adBrief.subheadline || cleanSubheadline,
            content: `${adBrief.headline || cleanHeadline}\n\n${adBrief.body_copy || cleanSubheadline}\n\n👉 ${cleanCta}`,
            hashtags: adBrief.hashtags || '#Pielęgnacja #Beauty #KBeauty #NexusERP',
            adBudgetInfo: adBrief.suggested_budget || '250 zł',
            productImageUrl: productImgSource || null,
            productName: productData.name || null,
            production_prompts: adBrief.production_prompts || null,
            notes: `Wygenerowano w Creative Studio z integracją PIM. Badge: ${adBrief.badge_text || 'Certyfikat UE'}.`
        };
    }

    /**
     * Generuje krótką formę wideo Reels (format pionowy 9:16 - 1080x1920)
     * Montuje sceny z animowanym packshotem produktu i napisami ekranowymi
     */
    async generateReelsVideo(reelBrief, brandProfile = {}, productData = {}) {
        const brandName = brandProfile.name || productData.brand?.name || productData.name || 'NEXUS';
        const fileId = `reel_${reelBrief.id || Date.now()}_${Math.random().toString(36).substring(7)}`;
        const reelTempDir = path.join(this.tempDir, fileId);
        fs.mkdirSync(reelTempDir, { recursive: true });

        // Ustalenie zdjęcia produktu (z briefu, profilu zewnętrznego lub z PIM)
        const productImgSource = reelBrief.productImageUrl 
            || brandProfile.customProductImgUrl
            || productData.imageUrl 
            || (Array.isArray(productData.images) && productData.images.length > 0 ? productData.images[0] : null);

        let productBuffer = null;
        if (productImgSource) {
            productBuffer = await this._fetchImageBuffer(productImgSource);
        }

        const scenes = Array.isArray(reelBrief.scenes) && reelBrief.scenes.length >= 3 
            ? reelBrief.scenes 
            : [
                { onscreen_text: reelBrief.hook_3s || "STOP! Czy Twoja skóra też tak reaguje?", visual_action: "Hook alert" },
                { onscreen_text: "90% drogeryjnych produktów wypłukuje barierę lipidową", visual_action: "Problem presentation" },
                { onscreen_text: `Odkryj ${productData.name || 'formułę biomimetyczną'} z certyfikatem UE`, visual_action: "Solution reveal" },
                { onscreen_text: "Sprawdź link w bio i zamów z darmową dostawą!", visual_action: "CTA outro" }
            ];

        const framePaths = [];

        // Generujemy po 1 klatce kluczowej dla każdej sceny (1080x1920)
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const framePath = path.join(reelTempDir, `frame_${i}.png`);

            const isHook = i === 0;
            const isProductScene = (i === 1 || i === 2) && Boolean(productBuffer);
            const isCta = i === scenes.length - 1;

            const badgeBg = isHook ? '#dc2626' : isCta ? '#ec4899' : '#4f46e5';
            const badgeText = isHook ? '🚨 PILNY ALERT' : isCta ? '⚡ OFERTA LIMITOWANA' : `KROK ${i + 1}`;

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
                
                <!-- Ambient Glow Circles -->
                <circle cx="540" cy="960" r="500" fill="#6366f1" fill-opacity="0.14" />
                <circle cx="540" cy="${isHook ? 400 : 1500}" r="380" fill="${isHook ? '#ef4444' : '#ec4899'}" fill-opacity="0.18" />

                <!-- Top Header -->
                <text x="540" y="180" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="28px" font-weight="900" fill="#94a3b8" letter-spacing="6px">${this._escapeXml(brandName.toUpperCase())} REELS</text>

                <!-- Indicator Badge -->
                <rect x="240" y="240" width="600" height="65" rx="32" fill="${badgeBg}" />
                <text x="540" y="282" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="24px" font-weight="900" fill="#ffffff" letter-spacing="2px">${badgeText}</text>

                <!-- Dynamic Scene Text -->
                <foreignObject x="90" y="${isProductScene ? 350 : 650}" width="900" height="${isProductScene ? 320 : 650}">
                    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', Arial, sans-serif; font-size: ${isProductScene ? '48px' : '62px'}; font-weight: 900; color: #ffffff; text-align: center; line-height: 1.25; text-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                        ${this._escapeXml(scene.onscreen_text)}
                    </div>
                </foreignObject>

                <!-- Action Footer -->
                <rect x="140" y="1650" width="800" height="110" rx="30" fill="${isCta ? '#ec4899' : '#4f46e5'}" />
                <text x="540" y="1718" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="32px" font-weight="900" fill="#ffffff" letter-spacing="2px">
                    ${isCta ? 'KLIKNIJ LINK W BIO →' : 'PRZESUŃ W GÓRĘ, ABY SPRAWDZIĆ'}
                </text>
            </svg>`;

            let frameSharp = sharp(Buffer.from(svgFrame)).resize(1080, 1920);

            // Jeśli to scena produktowa i mamy packshot: nałóż produkt w centrum (y: 720-1450)
            if (isProductScene && productBuffer) {
                try {
                    const resizedProd = await sharp(productBuffer)
                        .resize(520, 680, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .png()
                        .toBuffer();

                    const meta = await sharp(resizedProd).metadata();
                    const pW = meta.width || 520;
                    const pH = meta.height || 680;
                    const pLeft = Math.floor((1080 - pW) / 2);
                    const pTop = 730 + Math.floor((720 - pH) / 2);

                    const shadowSvg = `
                    <svg width="${pW + 100}" height="140" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <filter id="reelShadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="20" />
                            </filter>
                        </defs>
                        <ellipse cx="${(pW + 100) / 2}" cy="70" rx="${pW * 0.45}" ry="35" fill="#000000" fill-opacity="0.85" filter="url(#reelShadow)" />
                    </svg>`;
                    const shadowBuf = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

                    frameSharp = frameSharp.composite([
                        { input: shadowBuf, top: pTop + pH - 50, left: pLeft - 50, blend: 'over' },
                        { input: resizedProd, top: pTop, left: pLeft, blend: 'over' }
                    ]);
                } catch (e) {
                    console.warn('[CreativeStudio] Nie udało się nałożyć produktu na klatkę Reels:', e.message);
                }
            }

            await frameSharp.png().toFile(framePath);
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
        concatContent += `file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'\n`;
        fs.writeFileSync(concatTxt, concatContent, 'utf8');

        const silentWavPath = path.join(reelTempDir, 'silent.wav');
        this._createSilentWav(silentWavPath, Math.ceil((scenes.length * durationPerScene) + 2));

        const outputMp4FileName = `${fileId}.mp4`;
        const outputMp4 = path.join(this.outputDir, outputMp4FileName);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(concatTxt)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .input(silentWavPath)
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac',
                        '-shortest',
                        '-movflags', '+faststart'
                    ])
                    .save(outputMp4)
                    .on('end', () => resolve(outputMp4))
                    .on('error', (err) => {
                        console.error('[CreativeStudio] Błąd kodowania wideo FFmpeg:', err.message);
                        reject(err);
                    });
            });
        } finally {
            try {
                fs.rmSync(reelTempDir, { recursive: true, force: true });
            } catch (e) {}
        }

        const mp4Buffer = fs.readFileSync(outputMp4);
        const supabaseUrl = await this._uploadToSupabase(mp4Buffer, outputMp4FileName, 'video/mp4');
        const publicLocalUrl = `/uploads/ad-intelligence/${outputMp4FileName}`;

        return {
            id: reelBrief.id || `reel_${Date.now()}`,
            mediaUrl: supabaseUrl || publicLocalUrl,
            localUrl: publicLocalUrl,
            mediaType: 'video',
            format: 'Rolka (Reels)',
            headline: reelBrief.title || reelBrief.hook_3s,
            scenes: scenes,
            content: `🎬 [REELS] ${reelBrief.title || reelBrief.hook_3s}\n\nHACZYK: "${reelBrief.hook_3s}"\n\nLEKTOR / VOICEOVER:\n${reelBrief.script_voiceover || ''}\n\nCTA: ${reelBrief.cta_audio || 'Kliknij link w bio!'}`,
            hashtags: '#Reels #ViralMarketing #KBeauty #Pielęgnacja #NexusERP',
            adBudgetInfo: reelBrief.suggested_budget || '350 zł',
            productImageUrl: productImgSource || null,
            productName: productData.name || null,
            production_prompts: reelBrief.production_prompts || null,
            notes: `Format Reels (9:16) zmontowany przez FFmpeg z packshotem produktu. Czas trwania: ~14s.`
        };
    }

    /**
     * Generuje natywny bufor WAV (PCM 16-bit stereo 44.1kHz)
     * Eliminuje zależność od wirtualnego demuxera -f lavfi
     */
    _createSilentWav(filePath, durationSec = 16, sampleRate = 44100) {
        const numChannels = 2;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = Math.floor(durationSec * byteRate);
        const buffer = Buffer.alloc(44 + dataSize);

        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20); // PCM
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(byteRate, 28);
        buffer.writeUInt16LE(blockAlign, 32);
        buffer.writeUInt16LE(bitsPerSample, 34);
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        fs.writeFileSync(filePath, buffer);
        return filePath;
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
