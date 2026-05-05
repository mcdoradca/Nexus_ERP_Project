const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EventBus = require('../../core/EventBus');

/**
 * 🛡️ Data Purity Guard (Strażnik Czystości Danych)
 * Cel: Wyłapywanie czeskich błędów ludzkich w bazie PIM (np. cena 0.50 zamiast 50.00).
 * Adversarial AI: Działa niezależnie od ludzi i blokuje wadliwe kartoteki przed synchronizacją z BaseLinkerem.
 */
class DataPurityGuard {
    
    /**
     * Główny proces audytu bazy PIM
     */
    static async auditDatabase() {
        console.log('🕵️ [Data Purity Guard] Rozpoczynam audyt czystości danych w PIM...');
        
        let violations = 0;
        const products = await prisma.product.findMany({
            where: { status: { not: 'Zablokowany - Błąd Danych' } }
        });

        for (const prod of products) {
            const issues = this._inspectProduct(prod);
            
            if (issues.length > 0) {
                violations++;
                console.warn(`🚨 [Data Purity Guard] Wykryto anomalię w produkcie [${prod.sku}]:`, issues.join(', '));
                
                // Twarda blokada (Hard Lock)
                const updated = await prisma.product.update({
                    where: { id: prod.id },
                    data: {
                        status: 'Zablokowany - Błąd Danych',
                        descriptionHtml: `<div style="color:red; padding:15px; border:2px solid red;"><b>Blokada systemowa:</b> Błędne dane w kartotece PIM. ${issues.join(', ')}</div>` + (prod.descriptionHtml || '')
                    }
                });

                EventBus.publish('PRODUCT_DATA_UPDATED', { product: updated, source: 'DATA_PURITY_GUARD' });
                EventBus.publish('SYSTEM_ALERT', { level: 'CRITICAL', message: `Zablokowano produkt ${prod.sku}. Błąd danych PIM.` });
            }
        }

        console.log(`✅ [Data Purity Guard] Audyt zakończony. Przeskanowano: ${products.length}. Zablokowano: ${violations}.`);
        return { scanned: products.length, violations };
    }

    /**
     * Wewnętrzny silnik detekcji błędów statystycznych i logicznych
     */
    static _inspectProduct(product) {
        const issues = [];

        // 1. Cena zakupu (COGS) vs Cena sprzedaży
        if (product.basePrice > 0 && product.salePrice > 0) {
            if (product.basePrice > product.salePrice) {
                issues.push(`Cena zakupu netto (${product.basePrice} PLN) jest wyższa niż cena sprzedaży (${product.salePrice} PLN)!`);
            }
            // Zbyt wysoka marża (potencjalny błąd wpisania przecinka np. 0.50 zamiast 50)
            if (product.salePrice > product.basePrice * 20) {
                issues.push(`Podejrzanie wysoka przebitka (x20+). Cena zakupu ${product.basePrice} PLN vs Cena sprzedaży ${product.salePrice} PLN. Prawdopodobny czeski błąd.`);
            }
        }

        // 2. Zerowe koszty ukryte (wymagamy pełnego Unit Economics)
        if (product.weight > 0 && product.packagingCost === 0) {
            issues.push(`Produkt ma wagę fizyczną (${product.weight} kg), ale koszt pakowania wynosi 0 PLN. Niezgodne ze standardem Unit Economics.`);
        }

        // 3. Gabaryty
        if (product.weight !== null && (product.weight <= 0 || product.weight > 150)) {
            issues.push(`Waga produktu (${product.weight} kg) jest poza akceptowalnym zakresem e-commerce (0-150 kg).`);
        }

        // 4. Stawka VAT
        const validVats = [0, 5, 8, 23];
        if (product.taxRate !== null && !validVats.includes(product.taxRate)) {
            issues.push(`Nieistniejąca stawka VAT: ${product.taxRate}%`);
        }

        return issues;
    }
}

module.exports = DataPurityGuard;
