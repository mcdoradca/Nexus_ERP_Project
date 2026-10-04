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
        visual_prompt: "Świetlista lewitacja butelki w czystej przestrzeni z rozproszonym światłem"
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

test('AdIntelligenceController & CreativeStudio - uploadMediaMaterial zapisuje plik z dysku i generuje kreację', async () => {
    // 1. Tworzymy mały bufor obrazu PNG 100x100
    const sharp = require('sharp');
    const testPngBuffer = await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 }
        }
    }).png().toBuffer();

    let resJson = null;
    let resStatus = 200;
    const mockRes = {
        status: (s) => { resStatus = s; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
    };

    const mockReq = {
        file: {
            originalname: 'custom_packshot_test.png',
            mimetype: 'image/png',
            buffer: testPngBuffer,
            size: testPngBuffer.length
        }
    };

    await adIntelligenceController.uploadMediaMaterial(mockReq, mockRes);
    assert.strictEqual(resStatus, 200);
    assert.ok(resJson.success, 'Upload musi zwrócić success: true');
    assert.ok(resJson.url, 'Upload musi zwrócić url');
    assert.strictEqual(resJson.mediaType, 'image');

    // Sprawdzamy czy fizyczny plik istnieje na dysku
    const localUploadedPath = path.join(__dirname, '../../../../frontend/public', resJson.localUrl);
    assert.ok(fs.existsSync(localUploadedPath), 'Plik z uploadu musi fizycznie istnieć na dysku serwera');

    // 2. Weryfikujemy czy CreativeStudio potrafi wygenerować statyk z nowo wgranego pliku
    const brief = {
        id: "UPLOAD_TEST_1",
        headline: "Test Wgranego Packshotu",
        subheadline: "Sprawdzona integracja pliku lokalnego",
        body_copy: "Opis testowy z pliku wgranego z komputera.",
        cta_text: "Kup Teraz",
        badge_text: "⭐ Nowość",
        suggested_budget: "200 zł",
        hashtags: "#TestUpload",
        productImageUrl: resJson.localUrl
    };

    const asset = await creativeStudioService.generateStaticAd(brief, { name: 'Test Marka' });
    assert.ok(asset.mediaUrl, 'mediaUrl wygenerowanego assetu musi być ustawione');
    assert.strictEqual(asset.mediaType, 'image');
    assert.strictEqual(asset.productImageUrl, resJson.localUrl);

    // Czyszczenie pliku testowego
    if (fs.existsSync(localUploadedPath)) {
        fs.unlinkSync(localUploadedPath);
    }
});

test('AdIntelligenceService & Controller - enrichProductFromWeb autonomicznie bada produkt i uzupełnia pola', async () => {
    // 1. Test bezpośredniego wywołania serwisu
    const enriched = await adIntelligenceService.enrichProductFromWeb('Air Wick');
    assert.ok(enriched, 'Wynik enrichmentu musi istnieć');
    assert.ok(enriched.brandName, 'brandName musi być uzupełnione');
    assert.ok(enriched.usp, 'USP musi być uzupełnione');
    assert.ok(enriched.proof, 'Proof musi być uzupełnione');
    assert.ok(enriched.description, 'Opis musi być uzupełniony');

    // 2. Test kontrolera enrichProduct
    let resJson = null;
    let resStatus = 200;
    const mockRes = {
        status: (s) => { resStatus = s; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
    };
    const mockReq = {
        body: { name: 'Cif' }
    };

    await adIntelligenceController.enrichProduct(mockReq, mockRes);
    assert.strictEqual(resStatus, 200);
    assert.ok(resJson.success, 'Odpowiedź kontrolera musi mieć success: true');
    assert.ok(resJson.enrichedData, 'Odpowiedź musi zawierać enrichedData');
    assert.ok(resJson.enrichedData.usp, 'enrichedData musi zawierać usp');
});

test('AdIntelligenceController - scanAndAnalyze z directGeneration generuje strategię i 28 hooków natychmiast', async () => {
    let resJson = null;
    let resStatus = 200;
    const mockRes = {
        status: (s) => { resStatus = s; return mockRes; },
        json: (data) => { resJson = data; return mockRes; }
    };
    const mockReq = {
        body: {
            directGeneration: true,
            query: 'Krem nawilżający',
            brandProfile: {
                name: 'BioDerm',
                usp: 'Kwas hialuronowy i ceramidy',
                proof: 'Testy dermatologiczne'
            }
        }
    };

    await adIntelligenceController.scanAndAnalyze(mockReq, mockRes);
    assert.strictEqual(resStatus, 200);
    assert.ok(resJson.success, 'Odpowiedź musi mieć success: true');
    assert.strictEqual(resJson.totalScanned, 0, 'W trybie direct totalScanned wynosi 0');
    assert.ok(resJson.strategy, 'Strategia musi być wygenerowana');
    assert.ok(resJson.strategy.angles && resJson.strategy.angles.length === 4, 'Musi zawierać 4 kąty');
    assert.ok(resJson.strategy.hooks_28 && resJson.strategy.hooks_28.length === 28, 'Musi zawierać 28 haczyków');
    assert.ok(resJson.strategy.static_ad_briefs && resJson.strategy.static_ad_briefs.length > 0, 'Musi zawierać briefy statyczne');
});

test('PromptDirectorService - generuje 5 profesjonalnych promptów AI w 100% po polsku', async () => {
    const promptDirectorService = require('../prompt-director.service');
    const brief = {
        headline: "Czystość bez szorowania",
        subheadline: "Certyfikowana formuła z minerałami",
        body_copy: "Usuwa 100% kamienia i tłuszczu z powierzchni kuchennych.",
        productName: "Cif Ultra Mleczko"
    };

    const prompts = await promptDirectorService.generateProductionPrompts({
        brief,
        brandProfile: { name: 'Cif Polska', usp: 'Mikrogranulki czyszczące' },
        productData: { name: 'Cif Ultra Mleczko' }
    });

    assert.ok(prompts, 'Obiekt promptów musi istnieć');
    assert.ok(prompts.nano_banana_packshot, 'Musi zawierać prompt dla Nano Banana');
    assert.ok(prompts.omni_rich_content, 'Musi zawierać prompt dla OmniGen');
    assert.ok(prompts.reels_video_flow, 'Musi zawierać prompt dla Google Flow');
    assert.ok(prompts.story_tiktok_viral, 'Musi zawierać prompt dla TikTok UGC');
    assert.ok(prompts.macro_details, 'Musi zawierać prompt makro detali');

    // Weryfikacja języka polskiego - brak typowo angielskich zwrotów placeholders
    assert.match(prompts.nano_banana_packshot, /[ąćęłńóśźż]/i, 'Prompt Nano Banana musi być po polsku z polskimi znakami');
    assert.match(prompts.reels_video_flow, /[ąćęłńóśźż]/i, 'Prompt wideo Flow musi być po polsku z polskimi znakami');
});

test('AdIntelligenceService - scoreAdsWithGemini zachowuje linki do reklam i produktów oraz zwraca bogatą analizę rynkową', async () => {
    const adsWithLinks = [
        {
            id: 'ad-winner-1',
            advertiser: 'Cif Polska',
            productName: 'Cif Mleczko Cytrynowe 750ml',
            headline: 'Lśniąca kuchnia w 30 sekund',
            copy: 'Odkryj moc mikrokryształków. Sprawdź ofertę na oficjalnej stronie.',
            startDate: new Date(Date.now() - 50 * 86400000).toISOString(),
            adUrl: 'https://www.facebook.com/ads/library/?id=123456789',
            productUrl: 'https://cif.pl/produkty/mleczko-cytrynowe'
        }
    ];

    const result = await adIntelligenceService.scoreAdsWithGemini(adsWithLinks, { name: 'Cif' });
    assert.strictEqual(result.topWinners.length, 1);
    const winner = result.topWinners[0];

    // Sprawdzamy czy linki i nazwa produktu zostały nienaruszone
    assert.strictEqual(winner.productName, 'Cif Mleczko Cytrynowe 750ml');
    assert.strictEqual(winner.adUrl, 'https://www.facebook.com/ads/library/?id=123456789');
    assert.strictEqual(winner.productUrl, 'https://cif.pl/produkty/mleczko-cytrynowe');

    // Sprawdzamy czy analiza rynkowa nie jest ograniczona do 3 pozycji i zawiera bogate sekcje
    assert.ok(result.marketInsights.dominant_hooks.length > 0);
    assert.ok(result.marketInsights.saturated_claims.length > 0);
    assert.ok(result.marketInsights.blue_ocean_angles.length > 0);
    assert.ok(Array.isArray(result.marketInsights.pricing_and_offers), 'Musi zawierać sekcję ofert cenowych');
    assert.ok(Array.isArray(result.marketInsights.audience_triggers), 'Musi zawierać triggery audytorium');
    assert.ok(typeof result.marketInsights.executive_summary === 'string', 'Musi zawierać podsumowanie wykonawcze');
});

test('AdIntelligenceService - Agent Badacza DNA i Klimatu Marki (Brand DNA Scout) bada tożsamość i kod emocjonalny', async () => {
    const brandInfo = {
        brandName: 'e-Fiore',
        website: 'https://e-fiore.pl',
        category: 'Kosmetyki naturalne',
        description: 'Rozświetlające serum z witaminą C i ekstraktem z jeżyny.',
        usp: 'Naturalna witamina C i antyoksydanty z jeżyn rozjaśniające cerę',
        proof: '100% wegański skład, certyfikowane surowce organiczne',
        targetAudience: 'Kobiety 20-40 lat poszukujące promiennego blasku skóry'
    };

    const dna = await adIntelligenceService.scoutBrandDnaAndAesthetics(brandInfo);
    assert.ok(dna, 'Agent DNA musi zwrócić analizę tożsamości marki');
    assert.ok(typeof dna === 'string');
    assert.ok(dna.length > 30, 'Analiza DNA musi być wyczerpująca');
    assert.match(dna, /(Klimat|Odbiorca|Emocje|marki)/i, 'DNA musi zawierać zdefiniowane wymiary tożsamości');
});

test('PromptDirectorService - Tarcza Nienaruszalności Produktu (Product Immutability Shield) oraz brak klisz postumentów', async () => {
    const promptDirectorService = require('../prompt-director.service');
    const brief = {
        headline: "Promienny blask i energia każdego dnia",
        subheadline: "Serum Black & Berry z witaminą C",
        body_copy: "Rozjaśnij przebarwienia i ciesz się gładką, rozświetloną cerą bez ciężkich formuł.",
        productName: "Serum Rozjaśniające Black & Berry"
    };

    const brandDna = "Klimat: Pastelowy, owocowo-botaniczny minimalizm e-Fiore. Jasne, miękkie światło dzienne, soczystość owoców jeżyn i witaminy C. Odbiorca: Kobiety poszukujące naturalnego rozświetlenia. Emocje: Radość, lekkość, świeżość, promienny blask bez ciemnych podestów.";

    const prompts = await promptDirectorService.generateProductionPrompts({
        brief,
        brandProfile: {
            name: 'e-Fiore',
            usp: 'Witamina C z jeżynami',
            brandDna
        },
        productData: {
            name: 'Serum Rozjaśniające Black & Berry',
            salePrice: 69.00
        }
    });

    assert.ok(prompts, 'Obiekt promptów musi zostać wygenerowany');
    assert.ok(prompts.nano_banana_packshot, 'Musi istnieć prompt packshotu Nano Banana');

    // Weryfikacja Tarczy Nienaruszalności Produktu:
    // Prompt musi zabraniać przeprojektowywania butelki i nakazywać zachowanie 100% wierności ze zdjęciem
    const packshotPrompt = prompts.nano_banana_packshot;
    assert.match(
        packshotPrompt,
        /(Nienaruszalny|referencyjn|100%|oryginaln|zakaz modyfikow|tożsamość|wierność)/i,
        'Prompt Nano Banana musi zawierać Tarczę Nienaruszalności Produktu (Product Immutability Shield)'
    );

    // Weryfikacja braku archaicznych marmurowych/kamiennych postumentów w wygenerowanych promptach
    assert.doesNotMatch(packshotPrompt, /marmurowym postumencie/i, 'Prompt nie może zawierać kliszy marmurowego postumentu');
    assert.doesNotMatch(packshotPrompt, /kamiennym postumencie/i, 'Prompt nie może zawierać kliszy kamiennego postumentu');
});


