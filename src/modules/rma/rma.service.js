const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const EventBus = require('../../core/EventBus');

/**
 * Zapadnia Obronna (3 Strikes Rule) - God-Tier Execution
 * @param {Object} profile - CustomerRiskProfile
 */
async function executeFraudBlacklistProtocol(profile) {
    console.log(`[FRAUD AGENT] Uruchomiono protokół tarczy anty-wyłudzeniowej dla loginu: ${profile.allegroLogin}`);
    
    // Zablokuj konto lokalnie w systemie
    await prisma.customerRiskProfile.update({
        where: { id: profile.id },
        data: { isBlacklisted: true, fraudScore: 100 }
    });

    // 1. Zgłoszenie na Tablicę Kanban (Ostrzeżenie Operatora)
    try {
        const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (admin) {
            await prisma.task.create({
                data: {
                    title: `ALARM FRAUD: Klient ${profile.allegroLogin} zgłosił 3 zwroty!`,
                    description: `Zapadnia "3 Strikes Rule" została aktywowana.\nAgent automatycznie zgłosił próbę zablokowania kupującego na Allegro z powodu nagminnych zwrotów.\nZweryfikuj to ręcznie.`,
                    status: "TODO",
                    priority: "URGENT",
                    creatorId: admin.id
                }
            });
        }
    } catch (dbErr) {
        console.error(`[FRAUD AGENT] Błąd tworzenia zadania Kanban: ${dbErr.message}`);
    }

    // 2. API Allegro Blacklist Protocol (God-Tier Execution)
    // UWAGA: Tarcza Błędów (Defensive AI) try-catch
    try {
        const allegroToken = process.env.ALLEGRO_TOKEN;
        if (!allegroToken) {
            console.log("[FRAUD AGENT] Brak tokena Allegro. Zablokowano tylko lokalnie.");
            return;
        }

        // Zgodnie z ADR-005, uderzamy pod POST /sale/blacklisted-users
        await axios.post('https://api.allegro.pl/sale/blacklisted-users', {
            user: { login: profile.allegroLogin },
            note: "Użytkownik zablokowany automatycznie przez moduł Nexus Fraud Prevention (3 Strikes Rule)."
        }, {
            headers: {
                'Authorization': `Bearer ${allegroToken}`,
                'Accept': 'application/vnd.allegro.public.v1+json',
                'Content-Type': 'application/vnd.allegro.public.v1+json'
            }
        });

        console.log(`[FRAUD AGENT] Pomyślnie dopisano ${profile.allegroLogin} do Czarnej Listy Allegro.`);
    } catch (allegroError) {
        // Tarcza defensywna chroniąca przed awarią całego procesu, gdy Allegro np. rzuci 404
        console.error(`[FRAUD AGENT] Błąd API Allegro podczas blokowania: ${allegroError.response?.data?.message || allegroError.message}`);
    }
}

/**
 * Przetwarzanie pojedynczego zwrotu z BaseLinkera
 * @param {string} returnId 
 * @param {string} blToken 
 */
async function processSingleReturn(returnId, blToken) {
    try {
        const params = new URLSearchParams({
            method: 'getReturnJournalList', // Używamy zwrotów, tu symulacja pobrania pojedynczego rekordu RMA
            // ... (W rzeczywistości używamy getReturns)
        });
        
        const fetchParams = new URLSearchParams({
            method: 'getReturns',
            parameters: JSON.stringify({ return_id: parseInt(returnId) })
        });
        
        const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
            headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const rmaData = response.data.returns?.[0];
        if (!rmaData) return;

        const login = rmaData.customer_login || rmaData.customer_email; // Fallback
        if (!login) return;

        // 1. Aktualizacja profilu klienta w CustomerRiskProfile
        const profile = await prisma.customerRiskProfile.upsert({
            where: { allegroLogin: login },
            update: {
                totalReturns: { increment: 1 },
                lastReturnDate: new Date(rmaData.date_add ? rmaData.date_add * 1000 : Date.now())
            },
            create: {
                allegroLogin: login,
                maskedEmail: rmaData.customer_email || 'brak@danych.pl',
                totalReturns: 1,
                lastReturnDate: new Date(rmaData.date_add ? rmaData.date_add * 1000 : Date.now())
            }
        });

        // 2. Dodanie rekordu do dziennika zwrotów
        const product = rmaData.products && rmaData.products.length > 0 ? rmaData.products[0] : null;
        
        await prisma.returnRecord.create({
            data: {
                baselinkerId: rmaData.return_id.toString(),
                orderId: rmaData.order_id ? rmaData.order_id.toString() : 'BRAK',
                customerLogin: login,
                customerEmail: rmaData.customer_email,
                reason: rmaData.reason || 'Brak podanego powodu',
                status: 'NEW',
                productId: product?.product_id?.toString() || null,
                productEan: product?.ean || null,
                refundAmount: parseFloat(rmaData.refund_amount) || 0.0
            }
        });

        console.log(`[RMA] Zarejestrowano zwrot dla loginu: ${login}. Suma zwrotów: ${profile.totalReturns}`);

        // 3. ZAPADNIA OBRONNA (3 Strikes Rule)
        if (profile.totalReturns >= 3 && !profile.isBlacklisted) {
            await executeFraudBlacklistProtocol(profile);
        }

    } catch (error) {
        console.error(`[RMA] Błąd przetwarzania zwrotu ID ${returnId}:`, error.message);
    }
}

/**
 * Główna pętla odpytująca Dziennik Zdarzeń (getReturnJournalList)
 * Uruchamiana przez CRON
 */
async function checkReturnsFromBaselinker() {
    try {
        const blToken = process.env.BASELINKER_TOKEN;
        if (!blToken) {
            console.log("[RMA] Brak tokena BASELINKER_TOKEN.");
            return;
        }

        // Tarcza wydajnościowa (ADR-005): Pobieramy tylko różnice logów (Rate Limit Protection)
        const lastLogSetting = await prisma.systemSetting.findUnique({ where: { key: 'rma_last_log_id' } });
        const lastLogId = lastLogSetting ? parseInt(lastLogSetting.value) : 0;

        const params = new URLSearchParams({
            method: 'getReturnJournalList',
            parameters: JSON.stringify({ last_log_id: lastLogId })
        });
        
        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
            headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.data.status !== 'SUCCESS') {
           throw new Error(response.data.error_message);
        }

        const logs = response.data.logs || [];
        if (logs.length === 0) return; // Brak nowych zwrotów

        let newLastLogId = lastLogId;

        // Przetwarzanie logów
        for (const log of logs) {
            newLastLogId = log.log_id;
            
            // log_type 1 = nowy zwrot
            if (log.log_type === 1) {
                await processSingleReturn(log.return_id, blToken);
            }
        }

        // Zapis stanu do DB
        if (newLastLogId !== lastLogId) {
            await prisma.systemSetting.upsert({
                where: { key: 'rma_last_log_id' },
                update: { value: newLastLogId.toString() },
                create: { key: 'rma_last_log_id', value: newLastLogId.toString() }
            });
        }

    } catch (err) {
        console.error('[RMA Fraud Agent] Błąd pobierania logów zwrotów z BL:', err.message);
    }
}

module.exports = {
    checkReturnsFromBaselinker,
    processSingleReturn,
    executeFraudBlacklistProtocol
};
