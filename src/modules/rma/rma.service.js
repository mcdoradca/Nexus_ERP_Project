const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function executeFraudBlacklistProtocol(profile) {
    console.log(`[FRAUD AGENT] Klient ${profile.allegroLogin} spełnił warunki ryzyka. Przekazano do weryfikacji ręcznej.`);
    
    // Oznacz profil do weryfikacji
    await prisma.customerRiskProfile.update({
        where: { id: profile.id },
        data: { fraudScore: 100, reviewStatus: 'WARNING' }
    });

    // Zgłoszenie na Tablicę Kanban (Ostrzeżenie Operatora)
    try {
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (admin) {
            await prisma.task.create({
                data: {
                    title: `ALARM FRAUD: Decyzja o blokadzie klienta ${profile.allegroLogin}`,
                    description: `Klient wykonał nagminną liczbę zwrotów.\nAgent wstępnie ocenił ryzyko. Zaloguj się do Zero-Bleed Hub i podejmij decyzję (Zablokuj/Odrzuć).`,
                    status: "TODO",
                    priority: "URGENT",
                    creatorId: admin.id
                }
            });
        }
    } catch (dbErr) {
        console.error(`[FRAUD AGENT] Błąd tworzenia zadania Kanban: ${dbErr.message}`);
    }
}

// Flaga zapobiegająca Race Condition
let isRmaSyncRunning = false;

async function syncReturnsFromBaselinker() {
    if (isRmaSyncRunning) {
        console.log('[RMA] Proces synchronizacji już trwa. Pomijam uruchomienie crona.');
        return;
    }
    isRmaSyncRunning = true;

    try {
        const blToken = process.env.BASELINKER_TOKEN;
        if (!blToken) {
            console.log("[RMA] Brak tokena BASELINKER_TOKEN.");
            return;
        }

        const lastLogSetting = await prisma.systemSetting.findUnique({ where: { key: 'rma_last_return_date' } });
        // Domyślnie cofamy się o 30 dni jeśli brak historii
        const lastDate = lastLogSetting ? parseInt(lastLogSetting.value) : Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

        let currentDateFrom = lastDate;
        let hasMore = true;
        let maxDateProcessed = currentDateFrom;

        while (hasMore) {
            const apiParams = { date_from: currentDateFrom };
            const fetchParams = new URLSearchParams({
                method: 'getOrderReturns',
                parameters: JSON.stringify(apiParams)
            });

            const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
                headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (response.data.status !== 'SUCCESS') {
                throw new Error(response.data.error_message);
            }

            const returns = response.data.returns || [];
            
            // Limit BaseLinkera (zazwyczaj 100), jeśli mniej, nie ma więcej stron
            if (returns.length < 100) {
                hasMore = false;
            }

            if (returns.length === 0) {
                break;
            }

            // Izolowanie zwrotów wyłącznie z Allegro
            const allegroReturns = returns.filter(r => r.order_return_source === 'allegro');

            for (const rmaData of allegroReturns) {
                // Tracking daty do paginacji (aby zapobiec duplikatom)
                if (rmaData.date_add > maxDateProcessed) {
                    maxDateProcessed = rmaData.date_add;
                }

                const login = rmaData.customer_login || rmaData.customer_email;
                if (!login) continue;

                // Aktualizacja profilu Ryzyka (CustomerRiskProfile)
                const profile = await prisma.customerRiskProfile.upsert({
                    where: { allegroLogin: login },
                    update: {
                        totalReturns: { increment: 1 },
                        lastReturnDate: new Date(rmaData.date_add * 1000)
                    },
                    create: {
                        allegroLogin: login,
                        maskedEmail: rmaData.customer_email || 'brak@danych.pl',
                        totalReturns: 1,
                        lastReturnDate: new Date(rmaData.date_add * 1000)
                    }
                });

                const product = rmaData.products && rmaData.products.length > 0 ? rmaData.products[0] : null;
                const reasonComment = product?.return_reason_comment || rmaData.reason || 'Brak podanego powodu';

                // Rejestracja Rekordu Zwrotu (będzie to Upsert by aktualizować kwoty ze starego zwrotu)
                await prisma.returnRecord.upsert({
                    where: { baselinkerId: rmaData.return_id.toString() },
                    update: {
                        refundAmount: parseFloat(rmaData.refund_done) || 0.0,
                        reason: reasonComment,
                        status: rmaData.status_id?.toString() || 'UPDATED'
                    },
                    create: {
                        baselinkerId: rmaData.return_id.toString(),
                        orderId: rmaData.order_id?.toString() || 'BRAK',
                        customerLogin: login,
                        customerEmail: rmaData.customer_email,
                        reason: reasonComment,
                        status: 'NEW',
                        productId: product?.product_id?.toString() || null,
                        productEan: product?.ean || null,
                        refundAmount: parseFloat(rmaData.refund_done) || 0.0
                    }
                });

                // Zasilanie analityki PIM (Zliczanie zwrotów na SKU)
                if (product?.ean || product?.sku) {
                    try {
                        const condition = product.ean ? { ean: product.ean } : { sku: product.sku };
                        await prisma.product.updateMany({
                            where: condition,
                            data: {
                                returnCount: { increment: 1 }
                            }
                        });
                    } catch (err) {
                        console.error(`[RMA] Błąd zasilania PIM dla produktu EAN: ${product?.ean}`, err.message);
                    }
                }

                // Zapadnia Obronna - Uruchomienie alertu przy >= 2 zwrotach (Oczekuje na Człowieka)
                if (profile.totalReturns >= 2 && !profile.isBlacklisted && profile.reviewStatus === 'SAFE') {
                    await executeFraudBlacklistProtocol(profile);
                }
            }

            // Zabezpieczenie przed zapętleniem - inkrementacja timestampu o 1 sekundę by zablokować stare rekordy
            currentDateFrom = maxDateProcessed + 1; 
        }

        // Zapis ostatecznego wskaźnika
        if (maxDateProcessed > lastDate) {
            await prisma.systemSetting.upsert({
                where: { key: 'rma_last_return_date' },
                update: { value: maxDateProcessed.toString() },
                create: { key: 'rma_last_return_date', value: maxDateProcessed.toString() }
            });
        }

    } catch (err) {
        console.error('[RMA Fraud Agent] Błąd pobierania logów zwrotów z BL:', err.message);
    } finally {
        isRmaSyncRunning = false;
    }
}

module.exports = {
    syncReturnsFromBaselinker,
    executeFraudBlacklistProtocol
};
