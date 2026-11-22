const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { resolveBaseLinkerToken } = require('../../utils/secretVault');
const { ensureDefaultWorkspace } = require('../../services/workspace.service');

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

// Stan i blokady wyścigów izolowane per workspaceId
const syncStateByWorkspace = new Map();

function getOrCreateSyncState(key) {
    if (!syncStateByWorkspace.has(key)) {
        syncStateByWorkspace.set(key, {
            isRunning: false,
            processedTotal: 0,
            currentDate: null
        });
    }
    return syncStateByWorkspace.get(key);
}

const getSyncStatus = (workspaceId = null) => {
    const key = workspaceId || 'default';
    const state = syncStateByWorkspace.get(key);
    return {
        workspaceId: workspaceId || null,
        isRunning: Boolean(state?.isRunning),
        processedTotal: state?.processedTotal || 0,
        currentDate: state?.currentDate || null
    };
};

async function syncReturnsFromBaselinker(forceDateFrom = null, workspaceId = null) {
    let targetWs = null;
    if (workspaceId) {
        targetWs = await prisma.workspace.findFirst({ where: { id: workspaceId, isActive: true } });
    } else {
        targetWs = await ensureDefaultWorkspace(prisma);
    }
    if (!targetWs) {
        console.log(`[RMA TELEMETRY] Pominięto sync zwrotów — nieaktywny lub nieznany workspace (${workspaceId || 'default'}).`);
        return false;
    }

    const wsId = targetWs.id;
    const syncState = getOrCreateSyncState(wsId);
    if (syncState.isRunning) {
        console.log(`[RMA] Proces synchronizacji dla workspace ${wsId} już trwa. Pomijam uruchomienie...`);
        return false;
    }
    
    syncState.isRunning = true;
    syncState.processedTotal = 0;
    syncState.currentDate = null;

    try {
        const resolvedToken = await resolveBaseLinkerToken(prisma, { workspaceId: wsId });
        const blToken = resolvedToken.token;
        if (!blToken) {
            console.log(`[RMA TELEMETRY] Klient "${targetWs.name}" (${wsId}) nie ma skonfigurowanego tokena BaseLinker — pomijam sync zwrotów.`);
            return false;
        }
        console.log(`[RMA TELEMETRY] Token BaseLinker dla workspace ${wsId} odczytany bezpiecznie (źródło: ${resolvedToken.source}, szyfrowany: ${resolvedToken.encrypted}).`);

        const watermarkKey = `rma_last_return_date:${wsId}`;
        let lastLogSetting = await prisma.systemSetting.findUnique({ where: { key: watermarkKey } });
        if (!lastLogSetting && targetWs.isDefault) {
            lastLogSetting = await prisma.systemSetting.findUnique({ where: { key: 'rma_last_return_date' } });
        }
        // Domyślnie cofamy się o 30 dni jeśli brak historii
        const lastDate = forceDateFrom || (lastLogSetting ? parseInt(lastLogSetting.value, 10) : Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60));

        let currentDateFrom = lastDate;
        let hasMore = true;
        let maxDateProcessed = currentDateFrom;
        console.log(`[RMA TELEMETRY] START PĘTLI (${wsId}). lastDate/forceDateFrom: ${lastDate} (${new Date(lastDate * 1000).toISOString()})`);

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
                const dateAddInt = parseInt(r.date_add, 10);
                if (dateAddInt > maxDateProcessed) {
                    maxDateProcessed = dateAddInt;
                }
            }

            syncState.processedTotal += returns.length;
            syncState.currentDate = new Date(maxDateProcessed * 1000).toISOString();

            // Izolowanie zwrotów wyłącznie z Allegro
            const allegroReturns = returns.filter(r => r.order_return_source === 'allegro');
            console.log(`[RMA TELEMETRY] Wyizolowano zwrotów z Allegro w tej paczce: ${allegroReturns.length}`);

            for (const rmaData of allegroReturns) {
                const login = rmaData.customer_login || rmaData.customer_email;
                if (!login) continue;

                // Sprawdzenie, czy ten konkretny zwrot już kiedykolwiek był pobrany w kontekście danego klienta (workspaceId)
                const existingReturn = await prisma.returnRecord.findUnique({
                    where: {
                        workspaceId_baselinkerId: {
                            workspaceId: wsId,
                            baselinkerId: rmaData.return_id.toString()
                        }
                    }
                });

                let profile = null;
                const product = rmaData.products && rmaData.products.length > 0 ? rmaData.products[0] : null;
                const reasonComment = product?.return_reason_comment || rmaData.reason || 'Brak podanego powodu';

                // Aktualizacja analityki TYLKO jeśli to jest nowo wykryty zwrot
                if (!existingReturn) {
                    // Aktualizacja profilu Ryzyka (CustomerRiskProfile)
                    profile = await prisma.customerRiskProfile.upsert({
                        where: {
                            workspaceId_allegroLogin: {
                                workspaceId: wsId,
                                allegroLogin: login
                            }
                        },
                        update: {
                            totalReturns: { increment: 1 },
                            lastReturnDate: new Date(rmaData.date_add * 1000)
                        },
                        create: {
                            workspaceId: wsId,
                            allegroLogin: login,
                            maskedEmail: rmaData.customer_email || 'brak@danych.pl',
                            totalReturns: 1,
                            lastReturnDate: new Date(rmaData.date_add * 1000)
                        }
                    });

                    // Zasilanie analityki PIM (Zliczanie zwrotów na SKU w obrębie danego klienta)
                    if (product?.ean || product?.sku) {
                        try {
                            const condition = product.ean
                                ? { workspaceId: wsId, ean: product.ean }
                                : { workspaceId: wsId, sku: product.sku };
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
                    where: {
                        workspaceId_baselinkerId: {
                            workspaceId: wsId,
                            baselinkerId: rmaData.return_id.toString()
                        }
                    },
                    update: {
                        refundAmount: parseFloat(rmaData.refund_done) || 0.0,
                        reason: reasonComment,
                        status: rmaData.status_id?.toString() || 'UPDATED'
                    },
                    create: {
                        workspaceId: wsId,
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

        console.log(`[RMA TELEMETRY] Zapis stanu na koniec procesu (${wsId}). maxDateProcessed: ${maxDateProcessed}, lastDate: ${lastDate}`);
        // Zapis ostatecznego wskaźnika izolowanego per workspace
        if (maxDateProcessed > lastDate) {
            await prisma.systemSetting.upsert({
                where: { key: watermarkKey },
                update: { value: maxDateProcessed.toString() },
                create: { key: watermarkKey, value: maxDateProcessed.toString() }
            });
        }

    } catch (err) {
        console.error('[RMA Fraud Agent] TWARDY BŁĄD pobierania logów z BL:', err.stack || err.message);
    } finally {
        syncState.isRunning = false;
        console.log(`[RMA TELEMETRY] Flaga isRunning dla workspace ${wsId} ustawiona na FALSE. Wyjście z demona.`);
    }
}

module.exports = {
    syncReturnsFromBaselinker,
    executeFraudBlacklistProtocol,
    getSyncStatus
};
