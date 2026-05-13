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

// Flaga i stan zapobiegająca Race Condition
let isRmaSyncRunning = false;
let syncProgress = {
    processedTotal: 0,
    currentDate: null
};

const getSyncStatus = () => {
    return {
        isRunning: isRmaSyncRunning,
        processedTotal: syncProgress.processedTotal,
        currentDate: syncProgress.currentDate
    };
};

async function syncReturnsFromBaselinker(forceDateFrom = null) {
    if (isRmaSyncRunning) {
        console.log('[RMA] Proces synchronizacji już trwa. Pomijam uruchomienie...');
        return false;
    }
    
    isRmaSyncRunning = true;
    syncProgress.processedTotal = 0;
    syncProgress.currentDate = null;

    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        const blToken = process.env.BASELINKER_TOKEN || (tokenRecord ? tokenRecord.value : null);
        if (!blToken) {
            console.log("[RMA TELEMETRY] BŁĄD: Brak tokena BASELINKER_TOKEN ani w process.env, ani w bazie danych.");
            return false;
        }
        console.log(`[RMA TELEMETRY] Token odczytany pomyślnie. Zaczyna się na: ${blToken.substring(0,8)}...`);

        const lastLogSetting = await prisma.systemSetting.findUnique({ where: { key: 'rma_last_return_date' } });
        // Domyślnie cofamy się o 30 dni jeśli brak historii
        const lastDate = forceDateFrom || (lastLogSetting ? parseInt(lastLogSetting.value) : Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60));

        let currentDateFrom = lastDate;
        let hasMore = true;
        let maxDateProcessed = currentDateFrom;
        console.log(`[RMA TELEMETRY] START PĘTLI. lastDate/forceDateFrom: ${lastDate} (${new Date(lastDate * 1000).toISOString()})`);

        while (hasMore) {
            const apiParams = { date_from: currentDateFrom };
            const fetchParams = new URLSearchParams({
                method: 'getOrderReturns',
                parameters: JSON.stringify(apiParams)
            });

            console.log(`[RMA TELEMETRY] WYWOŁANIE API: getOrderReturns z date_from: ${currentDateFrom} (${new Date(currentDateFrom * 1000).toISOString()})`);

            const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
                headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            console.log(`[RMA TELEMETRY] ODPOWIEDŹ HTTP: Status ${response.status}, payload.status: ${response.data.status}`);

            if (response.data.status !== 'SUCCESS') {
                throw new Error(response.data.error_message);
            }

            const returns = response.data.returns || [];
            console.log(`[RMA TELEMETRY] Pobrano zwrotów w tej paczce: ${returns.length}`);
            
            // Limit BaseLinkera (zazwyczaj 100), jeśli mniej, nie ma więcej stron
            if (returns.length < 100) {
                console.log(`[RMA TELEMETRY] Paczka < 100 elementów. Oznaczam koniec (hasMore = false).`);
                hasMore = false;
            }

            if (returns.length === 0) {
                console.log(`[RMA TELEMETRY] Paczka pustych danych (0 zwrotów). Wyrywam się z pętli (break).`);
                break;
            }

            // KRYTYCZNA POPRAWKA: Pobranie najstarszej daty (do paginacji) na podstawie WSZYSTKICH zwrotów w paczce
            for (const r of returns) {
                if (r.date_add > maxDateProcessed) {
                    maxDateProcessed = r.date_add;
                }
            }

            syncProgress.processedTotal += returns.length;
            syncProgress.currentDate = new Date(maxDateProcessed * 1000).toISOString();

            // Izolowanie zwrotów wyłącznie z Allegro
            const allegroReturns = returns.filter(r => r.order_return_source === 'allegro');
            console.log(`[RMA TELEMETRY] Wyizolowano zwrotów z Allegro w tej paczce: ${allegroReturns.length}`);

            for (const rmaData of allegroReturns) {
                const login = rmaData.customer_login || rmaData.customer_email;
                if (!login) continue;

                // Sprawdzenie, czy ten konkretny zwrot już kiedykolwiek był pobrany
                const existingReturn = await prisma.returnRecord.findUnique({
                    where: { baselinkerId: rmaData.return_id.toString() }
                });

                let profile = null;
                const product = rmaData.products && rmaData.products.length > 0 ? rmaData.products[0] : null;
                const reasonComment = product?.return_reason_comment || rmaData.reason || 'Brak podanego powodu';

                // Aktualizacja analityki TYLKO jeśli to jest nowo wykryty zwrot
                if (!existingReturn) {
                    // Aktualizacja profilu Ryzyka (CustomerRiskProfile)
                    profile = await prisma.customerRiskProfile.upsert({
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

                // Rejestracja/Aktualizacja Rekordu Zwrotu (nadpisuje status lub kwotę jeśli zwrot powrócił w syncu)
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
            }

            // Zabezpieczenie przed zapętleniem - inkrementacja timestampu o 1 sekundę by zablokować stare rekordy
            console.log(`[RMA TELEMETRY] Koniec pętli for. Obliczanie nowego offsetu: maxDateProcessed = ${maxDateProcessed}`);
            currentDateFrom = maxDateProcessed + 1; 

            // Tarcza Ochronna API (Rate Limit Preserver) - Max 30 zapytań na minutę
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`[RMA TELEMETRY] Zapis stanu na koniec procesu. maxDateProcessed: ${maxDateProcessed}, lastDate: ${lastDate}`);
        // Zapis ostatecznego wskaźnika
        if (maxDateProcessed > lastDate) {
            await prisma.systemSetting.upsert({
                where: { key: 'rma_last_return_date' },
                update: { value: maxDateProcessed.toString() },
                create: { key: 'rma_last_return_date', value: maxDateProcessed.toString() }
            });
        }

    } catch (err) {
        console.error('[RMA Fraud Agent] TWARDY BŁĄD pobierania logów z BL:', err.stack || err.message);
    } finally {
        isRmaSyncRunning = false;
        console.log(`[RMA TELEMETRY] Flaga isRmaSyncRunning ustawiona na FALSE. Wyjście z demona.`);
    }
}

module.exports = {
    syncReturnsFromBaselinker,
    executeFraudBlacklistProtocol,
    getSyncStatus
};
