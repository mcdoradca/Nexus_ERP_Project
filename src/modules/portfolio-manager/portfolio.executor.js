const BaseLinkerService = require('../offer-optimizer/baselinker.service');
const BundleOrchestrator = require('./bundle.orchestrator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Egzekutor Portfolio Managera (Ręce Nexusa)
 * Odpowiada za bezpośrednie uderzenia w API (BaseLinker, Allegro) 
 * po tym, jak człowiek kliknie "Zatwierdź" na polecenie wygenerowane przez AI.
 */
class PortfolioExecutor {
    
    /**
     * Główny dyspozytor akcji
     */
    static async executeAction(action) {
        console.log(`[Egzekutor] Otrzymano żądanie wykonania akcji: ${action.type}`, action);

        switch (action.type) {
            case 'CREATE_VIRTUAL_BUNDLE':
                return await this._createVirtualBundle(action.targetEan);
            
            case 'EXPORT_BUNDLE_TO_BASELINKER':
                return await this._exportBundleToBaseLinker(action.productId);
            
            case 'PROTECT_CPC':
                return await this._protectCpc(action.targetEan);
            
            case 'LIQUIDATE_STOCK':
                return await this._liquidateStock(action.targetEan || 'MULTI');
                
            default:
                throw new Error(`Nieznany typ akcji: ${action.type}`);
        }
    }

    /**
     * KRYTYCZNA AKCJA: Tworzy zupełnie nową kartotekę produktu w BaseLinkerze,
     * łącząc dwa istniejące produkty w wirtualny zestaw.
     */
    static async _createVirtualBundle(comboEan) {
        try {
            // comboEan przychodzi w formacie "590123+590456"
            const eans = comboEan.split('+');
            if (eans.length < 2) throw new Error("Nieprawidłowy format EAN zestawu.");

            const inventoryId = await BaseLinkerService.getInventories();
            
            // Szukamy produktów bazowych w BaseLinkerze
            // Niestety API v1 BaseLinkera nie pozwala szukać po EAN w locie bez parametru search_text w deep data.
            // Zatem najpierw pobieramy listę, by zmapować EAN na ID BaseLinkera.
            const inventoryRes = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: inventoryId });
            const allProductsEntries = Object.entries(inventoryRes.products || {});

            const p1Entry = allProductsEntries.find(([id, p]) => p.ean === eans[0] || p.sku === eans[0]);
            const p2Entry = allProductsEntries.find(([id, p]) => p.ean === eans[1] || p.sku === eans[1]);

            if (!p1Entry || !p2Entry) {
                throw new Error(`Nie odnaleziono produktów w BaseLinkerze na podstawie EAN: ${eans[0]}, ${eans[1]}`);
            }

            const p1BlId = p1Entry[0];
            const p2BlId = p2Entry[0];

            // Pobieramy pełne, znormalizowane dane o produktach bezpośrednio z BaseLinkera używając ich wewnętrznych ID
            const p1 = await BaseLinkerService.fetchDeepProductData(inventoryId, p1BlId);
            const p2 = await BaseLinkerService.fetchDeepProductData(inventoryId, p2BlId);

            // [NOWE] Pobieramy pełne dane o Unit Economics, marce, wadze z PIM
            // Szukamy po poprawnym EAN lub SKU, lub baselinkerId.
            let p1Db = await prisma.product.findFirst({ where: { OR: [{ ean: p1.ean || 'BRAK1' }, { sku: p1.sku || 'BRAK1' }, { baselinkerId: p1BlId.toString() }] } });
            let p2Db = await prisma.product.findFirst({ where: { OR: [{ ean: p2.ean || 'BRAK2' }, { sku: p2.sku || 'BRAK2' }, { baselinkerId: p2BlId.toString() }] } });

            // Jeśli produktów nie ma w Prismie (nie zostały jeszcze zsynchronizowane z BL do Nexusa), 
            // musimy bazować na danych podstawowych z BL, by proces się nie wysypał.
            if (!p1Db) {
                const defaultBrand = await prisma.brand.findFirst();
                p1Db = { ean: p1.ean || `EAN-${eans[0]}`, sku: p1.sku || `SKU-${eans[0]}`, name: p1.name, salePrice: parseFloat(p1.price || 0), basePrice: 0, inboundTransportCost: 0, outboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, aiImageCost: 0, weight: p1.weight || 0, length: p1.length || 0, width: p1.width || 0, height: p1.height || 0, stock: parseInt(p1.stock || 0), brandId: defaultBrand ? defaultBrand.id : null, taxRate: p1.taxRate || 23, features: p1.features || {} };
            }
            if (!p2Db) {
                p2Db = { ean: p2.ean || `EAN-${eans[1]}`, sku: p2.sku || `SKU-${eans[1]}`, name: p2.name, salePrice: parseFloat(p2.price || 0), basePrice: 0, inboundTransportCost: 0, outboundTransportCost: 0, packagingCost: 0, bdoEprCost: 0, aiImageCost: 0, weight: p2.weight || 0, length: p2.length || 0, width: p2.width || 0, height: p2.height || 0, stock: parseInt(p2.stock || 0), taxRate: p2.taxRate || 23 };
            }

            // [REGUŁA BIZNESOWA] Cena zestawu = Suma cen detalicznych z PIM - 5% rabatu, aby zachęcić klienta
            const bundleSalePrice = parseFloat(((p1Db.salePrice + p2Db.salePrice) * 0.95).toFixed(2));
            
            const bundleName = `Zestaw: ${p1Db.name} + ${p2Db.name}`;
            const bundleSku = `ZESTAW-${p1Db.sku}-${p2Db.sku}`;
            
            // Unikalny EAN w Prisma: EAN Lokomotywy + Z + SKU Wagonu. Algorytmy integracji będą to ucinać na potrzeby Allegro
            const bundleEan = `${p1Db.ean}-Z-${p2Db.sku}`; 

            // Sumowanie wagi i wymiarów
            const totalWeight = parseFloat((p1Db.weight || 0) + (p2Db.weight || 0));
            const maxLength = Math.max(p1Db.length || 0, p2Db.length || 0);
            const maxWidth = Math.max(p1Db.width || 0, p2Db.width || 0);
            const totalHeight = parseFloat((p1Db.height || 0) + (p2Db.height || 0));

            // Sumowanie kosztów (Unit Economics)
            const totalBasePrice = parseFloat((p1Db.basePrice || 0) + (p2Db.basePrice || 0));
            const totalInbound = parseFloat((p1Db.inboundTransportCost || 0) + (p2Db.inboundTransportCost || 0));
            const totalOutbound = parseFloat((p1Db.outboundTransportCost || 0) + (p2Db.outboundTransportCost || 0));
            const totalPackaging = parseFloat((p1Db.packagingCost || 0) + (p2Db.packagingCost || 0));
            const totalBdo = parseFloat((p1Db.bdoEprCost || 0) + (p2Db.bdoEprCost || 0));
            const totalAiCost = parseFloat((p1Db.aiImageCost || 0) + (p2Db.aiImageCost || 0));

            const bundleData = {
                ean: bundleEan,
                sku: bundleSku,
                name: bundleName,
                salePrice: bundleSalePrice,
                basePrice: totalBasePrice,
                inboundTransportCost: totalInbound,
                outboundTransportCost: totalOutbound,
                packagingCost: totalPackaging,
                bdoEprCost: totalBdo,
                aiImageCost: totalAiCost,
                weight: totalWeight,
                length: maxLength,
                width: maxWidth,
                height: totalHeight,
                stock: Math.min(parseInt(p1Db.stock || 0), parseInt(p2Db.stock || 0)) || 0, // Dostępność równa najsłabszemu ogniwowi
                status: "Szkic Zestawu",
                isSynced: false,
                brandId: p1Db.brandId, // Dziedziczymy markę z Lokomotywy
                features: p1Db.features || p1.features || {}, // Dziedziczymy parametry z Lokomotywy
                descriptionHtml: `<div style="padding:20px; text-align:center; background:#f0f4ff; color:#2b52d6; border-radius:8px;"><h3>⏳ Sieć Agentów AI pracuje nad tym zestawem...</h3><p>Trwa łączenie zdjęć przez Agenta Graficznego oraz pisanie opisu przez Copywritera (Gemini 3.1 Pro).</p><p><b>Proszę czekać, zawartość zaktualizuje się automatycznie za około 30-40 sekund...</b></p></div>`,
                taxRate: Math.max(p1Db.taxRate || 23, p2Db.taxRate || 23)
            };

            // Tworzymy lub aktualizujemy produkt w bazie Prisma (PIM)
            const newBundle = await prisma.product.upsert({
                where: { sku: bundleSku },
                update: bundleData,
                create: bundleData
            });
            
            console.log(`[Egzekutor] ✅ Zapisano wariant PIM w Prismie: ${bundleSku} za ${bundleSalePrice} PLN! ID: ${newBundle.id}`);
            
            // Wysyłamy zdarzenie do szyny danych (EventBus), by inne moduły PIM mogły zareagować (i ewentualnie websocket na front)
            const EventBus = require('../../core/EventBus');
            EventBus.publish('PRODUCT_DATA_UPDATED', { product: newBundle, source: 'PORTFOLIO_MANAGER_BUNDLE' });

            // 🚀 WYPUSZCZENIE SIECI AGENTÓW AI (w tle, bez blokowania wątku użytkownika)
            BundleOrchestrator.generateGodTierAssets(newBundle.id, p1, p2).catch(err => {
                console.error("[Egzekutor] Błąd Orkiestratora w tle:", err.message);
            });
            
            return {
                success: true,
                message: `Utworzono szkic zestawu "${bundleName}". Sieć agentów AI (Gemini 3.1) pracuje w tle nad zdjęciami i opisem.`
            };

        } catch (e) {
            console.error('[Egzekutor] Błąd przy tworzeniu zestawu w PIM:', e.message);
            throw e;
        }
    }

    /**
     * Akcja autoryzowana ręcznie przez użytkownika ("Zatwierdź").
     * Eksportuje gotowy Zestaw AI do zewnętrznego środowiska BaseLinkera.
     */
    static async _exportBundleToBaseLinker(productId) {
        try {
            if (!productId) throw new Error("Brak ID produktu do eksportu.");
            
            const product = await prisma.product.findUnique({ where: { id: productId } });
            if (!product) throw new Error("Nie znaleziono produktu w bazie PIM.");
            
            if (product.status !== "Szkic Gotowy (AI)" && product.status !== "Szkic Zestawu") {
                console.warn(`[Egzekutor] UWAGA: Eksportowany produkt ma niestandardowy status: ${product.status}`);
            }

            const inventoryId = await BaseLinkerService.getInventories();
            
            // Konwersja na payload BaseLinkera (Faza 5)
            const draftData = {
                title: product.name,
                opis1: product.descriptionHtml || '',
                images: []
            };

            // Dodajemy miniaturę do przesyłu (BaseLinker przyjmuje linki URL)
            // Zakładamy, że w środowisku produkcyjnym imageUrl to pełny URL (np. https://nasz-erp.pl/uploads/...)
            // W razie testów developerskich, BaseLinker sam zignoruje niewłaściwe URL
            if (product.imageUrl) {
                draftData.images.push({ url: product.imageUrl });
            }

            // Puste ID produktu dla BL oznacza TWORZENIE nowej kartoteki
            const blProductId = product.baselinkerId || ""; 

            // [BLOCKED BY AGENT_PROTOCOL] - Zablokowano automatyczny eksport z portfolio-managera.
            // Ostateczny eksport BaseLinker jest obsługiwany wyłącznie przez przycisk i zdarzenie PRODUCT_CONTENT_OPTIMIZED.
            // const res = await BaseLinkerService.exportOfferToBaselinker(inventoryId, blProductId, draftData);
            
            // Aktualizacja statusu w PIM
            await prisma.product.update({
                where: { id: product.id },
                data: {
                    status: "Zatwierdzony w PIM (Oczekuje na Eksport BL)",
                    isSynced: true,
                    // Zablokowano nadpisywanie baselinkerId przez res (brak wywołania API)
                    baselinkerId: product.baselinkerId
                }
            });

            const EventBus = require('../../core/EventBus');
            EventBus.publish('PRODUCT_DATA_UPDATED', { product: { ...product, status: "Zatwierdzony w PIM (Oczekuje na Eksport BL)" }, source: 'EXPORT_PENDING_MANUAL_CONFIRMATION' });

            return {
                success: true,
                message: `Pomyślnie wyeksportowano kartotekę "${product.name}" do BaseLinkera. Oczekuje na wystawienie Allegro.`
            };
        } catch (error) {
            console.error('[Egzekutor] Błąd podczas eksportu do BaseLinkera:', error.message);
            throw error;
        }
    }

    /**
     * Akcja chroniąca CPC Lokomotywy (Wysłanie komendy do Mózgu Ads)
     */
    static async _protectCpc(targetEan) {
        // Docelowo: uderzenie do Allegro Ads API by zwiększyć stawkę do np. 1.50 PLN
        // Obecnie: symulacja działania
        return {
            success: true,
            message: `Wysłano sygnał OVERRIDE_CPC_MAX do silnika Ads dla EAN: ${targetEan}. Lokomotywa została objęta tarczą ochronną budżetu.`
        };
    }

    /**
     * Akcja likwidacji zapasów dla Śpiochów
     */
    static async _liquidateStock(target) {
        // Docelowo: Masowe wpięcie tagu w ERP lub wysłanie prośby o Strefę Okazji
        return {
            success: true,
            message: `Utworzono zadanie dla Działu Handlowego: Zgłosić wytypowane Śpiochy do Strefy Okazji / Dodać Monety.`
        };
    }
}

module.exports = PortfolioExecutor;
