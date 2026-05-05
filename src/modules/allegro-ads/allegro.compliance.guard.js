const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');
const { calculateProductDQS } = require('../mdm/mdm.service');

/**
 * Pre-Flight Audit (Tarcza Bezpieczeństwa) dla Allegro Ads.
 * Sprawdza, czy dany produkt nadaje się do promowania, zanim przepalimy na niego jakikolwiek budżet.
 */
async function auditProductForAds(productId) {
    try {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { allegroCategory: true } // Wymagane do kalkulacji DQS
        });

        if (!product) {
            throw new Error('Produkt nie istnieje w bazie danych PIM.');
        }

        const errors = [];

        // 1. DANE FINANSOWE (Unit Economics) - Czy jesteśmy w stanie policzyć ROI?
        // Jeśli brakuje ceny zakupu (basePrice) lub ceny sprzedaży, puszczanie reklam jest nieobliczalne (Hazard!).
        if (!product.basePrice || product.basePrice <= 0) {
            errors.push('Brak kosztu zakupu (COGS - basePrice). AI nie potrafi obliczyć progu rentowności dla tego produktu.');
        }
        if (!product.salePrice || product.salePrice <= 0) {
            errors.push('Brak zdefiniowanej ceny sprzedaży. Produkt nie może być promowany.');
        }
        
        // Brak zdefiniowanych kosztów logistycznych (opcjonalnie, ale ważne dla pełnego ROI)
        if (!product.inboundTransportCost && !product.packagingCost) {
            // Możemy uznać to za ostrzeżenie lub błąd. Załóżmy błąd, by zachować 100% dokładności ROI.
            errors.push('Brak określonych kosztów logistyki i opakowania (inboundTransportCost / packagingCost).');
        }

        // 2. ZGODNOŚĆ Z REGULAMINEM ALLEGRO (Hard Rules)
        // Znacznie rozbudowana lista zakazanych zwrotów, które Allegro automatycznie flaguje.
        const forbiddenWords = [
            'wyprzedaż', 'hit', 'okazja', 'najtaniej', 'promocja', 'gwarancja', 
            'tylko u nas', 'najlepszy', 'gratis', '100%', 'oryginał'
        ];
        const titleLower = product.name.toLowerCase();
        
        forbiddenWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(titleLower)) {
                errors.push(`Tytuł oferty zawiera zakazane słowo: "${word}". Grozi to nałożeniem 30-dniowej blokady konta Ads przez Allegro.`);
            }
        });

        // 3. JAKOŚĆ KONTENTU (Minimum Quality Standards)
        const imageCount = (product.imageUrl ? 1 : 0) + (product.images ? product.images.length : 0);
        if (imageCount < 3) {
            errors.push(`Oferta posiada tylko ${imageCount} zdjęć. Wymagane są minimum 3 wysokiej jakości zdjęcia, aby algorytm Trafności Allegro mógł dopuścić ofertę do reklam (Ad Rank).`);
        }

        if (!product.descriptionHtml || product.descriptionHtml.length < 500) {
            errors.push('Opis oferty (descriptionHtml) jest zbyt krótki (mniej niż 500 znaków) lub nie istnieje. Algorytmy CPC odrzucą promowanie pustych ofert ze względu na niski oczekiwany CTR.');
        }

        // 4. DATA QUALITY SCORE (DQS) - Wymóg > 90%
        // Korzystamy ze wspólnego silnika oceniającego PXM Readiness z mdm.service.js
        const dqsResult = await calculateProductDQS(product);
        if (dqsResult.totalScore < 90) {
            const missingInfo = [...dqsResult.missingCore, ...dqsResult.missingChannel].join(', ');
            errors.push(`Data Quality Score (DQS) wynosi tylko ${dqsResult.totalScore}% (Wymagane minimum to 90%). Braki do uzupełnienia: ${missingInfo}`);
        }

        // 5. KONDYCJA OFERTY (Podstawy)
        if (!product.ean || product.ean.trim() === '') {
            errors.push('Brak kodu EAN. Allegro faworyzuje oferty powiązane z katalogiem. Promocja bez EAN przepala budżet na bardzo słaby CTR.');
        }
        if (product.stock <= 0) {
            errors.push('Brak towaru na stanie (Out-of-Stock). Uruchamianie kampanii wyzeruje historyczny wskaźnik konwersji i obniży pozycję organiczną.');
        }

        // 6. KONDYCJA KONTA I OFERTY (Health Check - Rozdział 3.0)
        // Zakładamy, że model posiada parametry lub odczytujemy mocki rynkowe
        const sellerQualityScore = 98; // W produkcji odczyt z /sale/user-ratings
        if (sellerQualityScore < 95) {
            errors.push('Spadek Jakości Sprzedaży poniżej progu Super Sprzedawcy. Koszty Adsów będą znacznie wyższe z powodu niższej Trafności.');
        }

        const dispatchTimeHours = product.dispatchTime || 24;
        if (dispatchTimeHours > 48) {
            errors.push('Czas wysyłki powyżej 48h. Algorytm Trafności Allegro faworyzuje szybkie wysyłki, inwestowanie w Ads przy tak długim czasie to przepalanie kasy.');
        }

        const hasWhiteBackground = product.hasWhiteBackground === undefined ? true : product.hasWhiteBackground;
        if (!hasWhiteBackground) {
            errors.push('Brak potwierdzenia, że miniatura (pierwsze zdjęcie) posiada w 100% białe tło (RGB 255,255,255). Grozi odrzuceniem kampanii przez weryfikator Allegro.');
        }

        const isCompliant = errors.length === 0;

        return {
            isCompliant,
            errors,
            productName: product.name,
            productSku: product.sku
        };

    } catch (err) {
        console.error('[COMPLIANCE GUARD ERROR]', err);
        throw err;
    }
}

/**
 * Próba włączenia reklam na dany produkt.
 * Używane przed jakimkolwiek bidowaniem lub planowaniem budżetu.
 */
async function safeEnableAds(productId, userId) {
    const audit = await auditProductForAds(productId);

    if (!audit.isCompliant) {
        // Blokada (Hard Block) + Alarm na UniversalChat dla działu
        const errorMessageList = audit.errors.map(e => `- ${e}`).join('\n');
        const alertMessage = `🛡️ **[TARCZA BEZPIECZEŃSTWA ADS]** Zablokowano próbę uruchomienia kampanii dla produktu: **${audit.productName}** (SKU: ${audit.productSku}).\n\nZnalezione krytyczne błędy (Hard Block):\n${errorMessageList}\n\n*Proszę poprawić dane w systemie PIM przed ponowną próbą aktywacji.*`;

        if (userId) {
            await prisma.globalMessage.create({
                data: {
                    content: alertMessage,
                    authorId: userId,
                    actionType: 'alert'
                }
            });
            EventBus.emit('new_global_message', { alert: true });
        }

        return {
            success: false,
            message: 'Zablokowano uruchomienie reklam. Szczegóły w raporcie Tarczy.',
            audit
        };
    }

    // Tu w przyszłości włączymy faktycznie kampanię na Allegro Ads / utworzymy rekord
    return {
        success: true,
        message: 'Pre-Flight Audit zakończony sukcesem. Produkt dopuszczony do sieci Ads.',
        audit
    };
}

module.exports = {
    auditProductForAds,
    safeEnableAds
};
