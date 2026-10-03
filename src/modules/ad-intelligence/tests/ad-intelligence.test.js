const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const adIntelligenceService = require('../ad-intelligence.service');
const creativeStudioService = require('../creative-studio.service');
const adIntelligenceController = require('../ad-intelligence.controller');

test('AdIntelligenceService - fetchCompetitorAds poprawnie normalizuje dane', async () => {
    const rawAds = [
        { headline: "Test Headline", copy: "Test copy text", startDate: new Date(Date.now() - 60 * 86400000).toISOString() }
    ];
    const ads = await adIntelligenceService.fetchCompetitorAds({ dataset: rawAds });
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].headline, "Test Headline");
    assert.strictEqual(ads[0].platform, "Meta (FB/IG)");
});

test('AdIntelligenceService - scoreAdsWithGemini wylicza Longevity Index i zwraca Top Winners', async () => {
    const fixtureAds = [
        { id: 'ad-pl-1', headline: "Płyn do prania Soft", copy: "Włoska formuła usuwająca plamy w 30 stopniach.", startDate: new Date(Date.now() - 65 * 86400000).toISOString(), platform: 'Meta (FB/IG)' },
        { id: 'ad-pl-2', headline: "Cif Mleczko do czyszczenia", copy: "Skuteczne usuwanie kamienia i tłuszczu bez rysowania.", startDate: new Date(Date.now() - 40 * 86400000).toISOString(), platform: 'Meta (FB/IG)' },
        { id: 'ad-pl-3', headline: "Mydło Felce Azzurra", copy: "Klasyczny zapach talku prosto z Włoch.", startDate: new Date(Date.now() - 20 * 86400000).toISOString(), platform: 'Meta (FB/IG)' }
    ];
    const ads = await adIntelligenceService.fetchCompetitorAds({ dataset: fixtureAds, limit: 10 });
    assert.strictEqual(ads.length, 3, 'Powinien pobrać 3 rekordy z fixture');

    const result = await adIntelligenceService.scoreAdsWithGemini(ads, { name: 'Nexus FMCG' });
    assert.ok(result.totalScanned > 0);
    assert.ok(Array.isArray(result.topWinners));
    assert.ok(result.topWinners.length > 0);
    
    // Sprawdzamy czy reklamy mają wyliczony czas trwania i ocenę
    const firstWinner = result.topWinners[0];
    assert.ok(firstWinner.activeDays > 0, 'activeDays musi być większe od zera');
    assert.ok(firstWinner.longevityScore >= 1, 'longevityScore musi wynosić min. 1');
    assert.ok(firstWinner.extractedHook, 'Musi posiadać wyekstrahowany hook');
    assert.ok(result.marketInsights.blue_ocean_angles.length > 0, 'Powinien zidentyfikować luki błękitnego oceanu');
});

test('AdIntelligenceService - synthesizeAnglesAndHooks generuje 4 kąty, 28 haczyków i integruje PIM', async () => {
    const mockWinners = [
        { extractedHook: "Dlaczego krem nawilżający przestaje działać?", keyAngle: "Bariera lipidowa", activeDays: 75, whyItWorks: "Demaskuje powszechny błąd" }
    ];
    const mockInsights = {
        dominant_hooks: ["Przed i po"],
        saturated_claims: ["100% naturalny"],
        blue_ocean_angles: ["Analiza INCI"]
    };

    const mockProduct = {
        id: "prod-test-1",
        name: "Serum Peptydowe UltraLift",
        salePrice: 189.00,
        features: "5 peptydów sygnałowych, kwas hialuronowy 4D",
        descriptionHtml: "<p>Klinicznie potwierdzona regeneracja bariery skórnej.</p>"
    };

    const strategy = await adIntelligenceService.synthesizeAnglesAndHooks({
        topWinners: mockWinners,
        marketInsights: mockInsights,
        brandProfile: { name: 'Skin Care Korea', usp: 'Czyste INCI', proof: '12k klientów' },
        productData: mockProduct
    });

    assert.ok(strategy.angles.length >= 4, 'Powinny powstać min. 4 kąty psychologiczne');
    assert.strictEqual(strategy.hooks_28.length, 28, 'Musi wygenerować dokładnie 28 haczyków (hooks_28)');
    assert.ok(strategy.static_ad_briefs.length > 0, 'Powinny powstać briefy reklam statycznych');
    assert.ok(strategy.reels_briefs.length > 0, 'Powinny powstać briefy dla formatu Reels');

    // Weryfikacja jakości copy - brak pustych lub powtórzonych nagłówków
    const firstBrief = strategy.static_ad_briefs[0];
    assert.ok(firstBrief.headline, 'Musi posiadać headline');
    assert.ok(firstBrief.subheadline, 'Musi posiadać subheadline');
    assert.notStrictEqual(firstBrief.headline.toLowerCase(), firstBrief.subheadline.toLowerCase(), 'Subheadline nie może być identyczny z headline');
});

test('CreativeStudioService - generateStaticAd generuje plik graficzny PNG z kompozycją i Shadow Baking', async () => {
    const brief = {
        id: "TEST_STAT_1",
        headline: "Skin Care Korea: Czysty skład bez kompromisów",
        subheadline: "Formuła liposomowa nawilżająca przez 48h.",
        body_copy: "Odkryj pielęgnację nowej generacji. Ponad 12 000 zadowolonych klientek.",
        cta_text: "Sprawdź Ofertę",
        badge_text: "⭐ 4.9/5 | 100% Czyste INCI",
        suggested_budget: "250 zł",
        hashtags: "#SkinCare #KBeauty",
        visual_prompt: "Luxury cosmetic bottle on marble"
    };

    const asset = await creativeStudioService.generateStaticAd(brief, { name: 'Skin Care Korea' });
    assert.ok(asset.mediaUrl, 'mediaUrl musi być ustawione');
    assert.ok(asset.localUrl.startsWith('/uploads/ad-intelligence/'));
    assert.ok(asset.base64DataUrl.startsWith('data:image/png;base64,'));
    assert.strictEqual(asset.mediaType, 'image');

    const localFilePath = path.join(__dirname, '../../../../frontend/public', asset.localUrl);
    assert.ok(fs.existsSync(localFilePath), 'Fizyczny plik PNG musi istnieć na dysku');
    assert.ok(fs.statSync(localFilePath).size > 1000, 'Rozmiar pliku musi być większy niż 1 KB');
});

test('CreativeStudioService - generateReelsVideo generuje pionowe wideo MP4 (9:16) przez FFmpeg', async () => {
    const reelBrief = {
        id: "TEST_REEL_1",
        title: "Testowa rolka ostrzegawcza",
        hook_3s: "STOP! Czy Twoja skóra też tak reaguje?",
        script_voiceover: "Większość produktów niszczy barierę ochronną. Przetestuj nową formułę.",
        scenes: [
            { onscreen_text: "STOP! Czy Twoja skóra też tak reaguje?", visual_action: "Alert" },
            { onscreen_text: "Błąd #1: Wypłukiwanie lipidów przez zwykłe mydło", visual_action: "Problem" },
            { onscreen_text: "Rozwiązanie: Czysta formuła biomimetyczna", visual_action: "Solution" },
            { onscreen_text: "Sprawdź link w bio i zamów z darmową dostawą!", visual_action: "CTA" }
        ],
        cta_audio: "Kliknij link w bio!",
        suggested_budget: "300 zł"
    };

    const videoAsset = await creativeStudioService.generateReelsVideo(reelBrief, { name: 'Skin Care Korea' });
    assert.ok(videoAsset.mediaUrl, 'mediaUrl musi być ustawione');
    assert.ok(videoAsset.localUrl.startsWith('/uploads/ad-intelligence/'));
    assert.strictEqual(videoAsset.mediaType, 'video');

    const localVideoPath = path.join(__dirname, '../../../../frontend/public', videoAsset.localUrl);
    assert.ok(fs.existsSync(localVideoPath), 'Fizyczny plik MP4 musi istnieć na dysku');
    assert.ok(fs.statSync(localVideoPath).size > 5000, 'Plik wideo MP4 musi mieć prawidłowy rozmiar > 5KB');
});

test('AdIntelligenceController - exportToSmi waliduje wymagane parametry', async () => {
    let statusCode = null;
    let jsonResult = null;
    const mockRes = {
        status: (code) => { statusCode = code; return mockRes; },
        json: (data) => { jsonResult = data; return mockRes; }
    };

    // Test braku campaignId
    await adIntelligenceController.exportToSmi({ body: { items: [{ headline: 'Test' }] } }, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResult.success, false);

    // Test braku items
    await adIntelligenceController.exportToSmi({ body: { campaignId: 'c-1', items: [] } }, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResult.success, false);
});

test('AdIntelligenceService & CreativeStudio - obsługa produktu spoza bazy PIM (zewnętrzny packshot URL i brandProfile)', async () => {
    const brandProfile = {
        name: 'Air Wick Polska',
        customProductImgUrl: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388',
        usp: 'Naturalne olejki eteryczne i świeżość do 120 dni',
        proof: 'Certyfikat jakości, testy laboratoryjne'
    };

    const strategy = await adIntelligenceService.synthesizeAnglesAndHooks({
        topWinners: [
            { extractedHook: "Twój dom nie pachnie tak świeżo jak myślisz", keyAngle: "Czystość i komfort", activeDays: 45, whyItWorks: "Zwrócenie uwagi na niezauważalny problem" }
        ],
        marketInsights: {
            dominant_hooks: ["Długotrwały zapach"],
            saturated_claims: ["100% natury"],
            blue_ocean_angles: ["Neutralizacja cząsteczkowa"]
        },
        brandProfile,
        productData: {} // Celowo pusty - produkt spoza bazy PIM
    });

    assert.ok(strategy.static_ad_briefs.length > 0, 'Briefy statyczne muszą powstać');
    const firstBrief = strategy.static_ad_briefs[0];
    assert.strictEqual(firstBrief.productImageUrl, brandProfile.customProductImgUrl, 'Brief musi zawierać zewnętrzny packshot URL');
    assert.strictEqual(firstBrief.productName, brandProfile.name, 'Brief musi zawierać nazwę marki produktu zewnętrznego');

    // Test generacji fizycznego statyku dla produktu spoza PIM
    const staticAsset = await creativeStudioService.generateStaticAd(firstBrief, brandProfile, {});
    assert.ok(staticAsset.mediaUrl, 'mediaUrl musi być ustawione');
    assert.strictEqual(staticAsset.productImageUrl, brandProfile.customProductImgUrl);
    assert.strictEqual(staticAsset.mediaType, 'image');
});
