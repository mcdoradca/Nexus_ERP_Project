const economicsService = require('./allegro.economics.service');
const { safeEnableAds } = require('./allegro.compliance.guard');
const qLearningService = require('./allegro.qlearning.service');
const EventBus = require('../../core/EventBus');
const prisma = require('../../core/prisma');

// Stan pamięci Mózgu na mutacje Sentinela (Rozdział 4.3 Autoadaptacja)
let sentinelMatrixConfig = {
    globalCpcMultiplier: 1.0,
    disabledStrategies: []
};

class AllegroBiddingEngine {

    /**
     * Główny Silnik Mózgowy. Przetwarza produkt przez Macierz Decyzyjną
     * i wyznacza strategię oraz konkretną stawkę (Bid) lub ubija kampanię.
     * 
     * @param {string} productId ID produktu z PIM
     * @param {Object} marketData Dane rynkowe (Current CPA, Zasięgi, CR - zwykle z API Allegro, tutaj podawane w argumencie)
     */
    async executeStrategy(productId, marketData = {}, options = {}) {
        try {
            // 1. Zabezpieczenie: TARCZA (Pre-Flight Audit)
            // Jeśli produkt leży merytorycznie lub finansowo, Mózg nie podejmuje gry.
            let maxCpa;
            if (!options.bypassCompliance) {
                const auditResult = await safeEnableAds(productId);
                if (!auditResult.success) {
                    const detailedReason = auditResult.audit && auditResult.audit.errors 
                        ? `[TARCZA OCHRONNA ZADZIAŁAŁA] Odrzucono kampanię. Powody: ${auditResult.audit.errors.join(' | ')}`
                        : 'Produkt nie przeszedł audytu Tarczy Bezpieczeństwa (Hard Block).';
                    return {
                        action: 'BLOCK',
                        reason: detailedReason,
                        strategy: 'NONE',
                        suggestedMaxCpc: 0
                    };
                }
            }

            // 2. Fundament Matematyczny: KREW (Unit Economics)
            const currentCpa = marketData.currentCpaNet || 0;
            const economicsCheck = await economicsService.validateAdProfitability(productId, currentCpa, {
                isSmart: true, // Zwykle odczytane ze statusu oferty
                coinsIssued: marketData.activeCoins || 0,
                inDealZone: marketData.inDealZone || false
            });

            maxCpa = economicsCheck.economics.maxCpaNet;
            const product = await prisma.product.findUnique({ where: { id: productId } });

            // 3. Analiza Danych (Metryki Sklepowe)
            const conversionRate = marketData.conversionRate || 0.01; // CR (domyślnie 1%)
            const stockLevel = product.stock || 0;
            const historyLengthDays = marketData.historyLengthDays || 0; // Ile dni oferta jest na rynku

            // 4. PREDYKCJA POPYTU (Analiza Szeregów Czasowych i Dayparting)
            const currentHour = options.simulatedHour !== undefined ? options.simulatedHour : new Date().getHours();
            const currentDayOfMonth = new Date().getDate();
            let timeMultiplier = 1.0;
            
            // 4A. Dayparting: Piki zakupowe na Allegro
            if (currentHour >= 18 && currentHour <= 22) {
                timeMultiplier = 1.3; // Przebijamy konkurencję w prime-time
            } else if (currentHour >= 1 && currentHour <= 5) {
                timeMultiplier = 0.5; // Oszczędzamy budżet w nocy (śpiący ruch, małe CR)
            }

            // 4B. Wypłaty w Polsce (10. dzień miesiąca): XGBoost proxy pattern
            // Algorytm z wyprzedzeniem alokuje większy budżet, gdyż klienci mają kapitał i skłonność do zakupów
            let demandPredictionMultiplier = 1.0;
            if (currentDayOfMonth >= 8 && currentDayOfMonth <= 12) {
                demandPredictionMultiplier = 1.4; // Silne uderzenie wokół 10. dnia miesiąca
            }

            // 4C. Analiza Konkurencji i Elastyczności Cenowej (Rozdział 2)
            let competitorMultiplier = 1.0;
            const competitorAvgPrice = marketData.competitorAveragePrice || null;
            if (competitorAvgPrice && product.price) {
                if (product.price > competitorAvgPrice * 1.05) {
                    // Jesteśmy ponad 5% drożsi od średniej rynkowej. Obniżamy CPC, bo i tak nie kupią.
                    competitorMultiplier = 0.6; 
                } else if (product.price < competitorAvgPrice * 0.95) {
                    // Jesteśmy ponad 5% tańsi. Silna przewaga cenowa, warto pompować ruch.
                    competitorMultiplier = 1.2;
                }
            }
            
            // Finalny modyfikator trendu rynkowego
            const trendMultiplier = timeMultiplier * demandPredictionMultiplier * competitorMultiplier;

            // 5. MACIERZ DECYZYJNA AI (Strategie)
            let strategy = 'UNKNOWN';
            let action = 'HOLD';
            let suggestedMaxCpc = 0;
            let suggestedMaxCpm = 0; // Dodano obsługę Reklamy Graficznej
            let enableExternalNetwork = false; // Obsługa Google Ads/Meta via Allegro
            let targetCpa = maxCpa; // Punkt wyjścia

            if (sentinelMatrixConfig.disabledStrategies.includes(strategy)) {
                // Jeśli Sentinel uciął strategię bo przestała być opłacalna rynkowo
                strategy = 'DISABLED_BY_SENTINEL';
                action = 'HOLD';
                suggestedMaxCpc = 0;
            } else if (economicsCheck.isBleeding) {
                // STRATEGIA 4: Krwawiące Oferty
                strategy = 'BLEEDING_OFFER';
                action = 'KILL_SWITCH';
                suggestedMaxCpc = 0;
                
                await this._notifyAccountManager(product, 'Kill Switch wyzwolony! Koszty kampanii Ads przekroczyły próg rentowności (Max CPA). Kampania wstrzymana, by zapobiec stratom.', options);
            } 
            else if (stockLevel > 0 && stockLevel < 5) {
                // STRATEGIA 5: Out-of-Stock Protection (Rozdział 3.3)
                // Obniżamy CPC, aby nie wyzerować pozycjonowania organicznego.
                strategy = 'OUT_OF_STOCK_PROTECTION';
                action = 'REDUCE_BID';
                suggestedMaxCpc = (0.2 * targetCpa) * trendMultiplier; 
                await this._notifyAccountManager(product, `Strategia "Out-of-Stock Protection": Zapas spadł do ${stockLevel} szt. System drastycznie obniżył CPC, aby oferta się nie wyprzedała i nie utraciła pozycji organicznej. Uzupełnij magazyn!`, options);
            }
            else if (conversionRate >= 0.03 && maxCpa > 10) {
                // STRATEGIA 1: Dojne Krowy (Wysoka konwersja > 3%, duży zapas marży CPA)
                strategy = 'CASH_COW';
                action = 'AGGRESSIVE_BID';
                suggestedMaxCpc = (conversionRate * targetCpa) * trendMultiplier; 
                enableExternalNetwork = true; // Rozdział 1.1: Agresywny Retargeting Google Ads/Meta
            }
            else if (historyLengthDays < 14 && maxCpa > 5) {
                // STRATEGIA 2: Nowości (Krótka historia sprzedaży)
                strategy = 'NEW_RELEASE';
                action = 'BUILD_REACH';
                // Rozdział 3.2.2 - Kampanie CPM (Reklama Graficzna) dla budowy zasięgu
                suggestedMaxCpc = (0.01 * targetCpa) * trendMultiplier;
                suggestedMaxCpm = 12.00; // Minimalna stawka rynkowa dla góra/dół wyszukiwania
                
                if (marketData.activeCoins === 0) {
                     await this._notifyAccountManager(product, `Strategia "Nowość": Uruchomiono Kampanię Graficzną (CPM). Zalecam również dodanie 3-5 Smart! Monet do oferty w celu sztucznego zbudowania CR dla algorytmów organicznych.`, options);
                }
            }
            else if (stockLevel > 50 && conversionRate < 0.015) {
                // STRATEGIA 3: Śpiochy (Duży stock, słaba rotacja i CR)
                strategy = 'SLEEPER_LONG_TAIL';
                action = 'LOW_BID_DISCOUNT';
                suggestedMaxCpc = (0.005 * targetCpa); // Brak trendMultiplier - i tak przeczekujemy
                
                if (!marketData.inDealZone) {
                    await this._notifyAccountManager(product, `Strategia "Śpioch": Algorytm obniżył CPC do minimum. Wysoki stan magazynowy blokuje zamrożoną gotówkę. Rekomendacja: Zgłoś ofertę do "Strefy Okazji" lub nadaj Kupon Rabatowy.`, options);
                }
            }
            else {
                // Domyślny, spokojny Maintenance
                strategy = 'MAINTENANCE';
                action = 'OPTIMIZE_BID';
                suggestedMaxCpc = (conversionRate * targetCpa * 0.8) * trendMultiplier; 
            }

            // 6. REINFORCEMENT LEARNING (Aplikacja Q-Learningu na wynik bazowy)
            let qAction = 'HOLD';
            if (action !== 'KILL_SWITCH' && action !== 'BLOCK' && strategy !== 'DISABLED_BY_SENTINEL') {
                qAction = qLearningService.chooseAction(strategy, currentHour);
                if (qAction === 'INCREASE_10') {
                    suggestedMaxCpc *= 1.1; // RL nakazuje podnieść stawkę by sprawdzić, czy zwiększy to Reward (ROI)
                } else if (qAction === 'DECREASE_10') {
                    suggestedMaxCpc *= 0.9; // RL nakazuje ciąć stawkę, sprawdzając optymalizację kosztów
                }
            }

            // Aplikacja globalnej mutacji Sentinela
            suggestedMaxCpc *= sentinelMatrixConfig.globalCpcMultiplier;

            // Bezpiecznik dolny (nie możemy licytować mniej niż minimum na Allegro)
            // Zgodnie z raportem Sentinela, minimalne CPC w popularnych kategoriach to ok 0.10 - 0.20 PLN dla długiego ogona
            if (action !== 'KILL_SWITCH' && action !== 'BLOCK' && suggestedMaxCpc < 0.10) {
                // Jeśli opłacałoby nam się licytować np. 5 groszy, ale minimum rynkowe to 10 gr,
                // musimy włączyć kill switcha by uniknąć przepalania.
                action = 'KILL_SWITCH';
                suggestedMaxCpc = 0;
                await this._notifyAccountManager(product, `Sugerowane CPC (z matematyki ROI) wyniosło poniżej minimum rynkowego (0.10 PLN). Wymagane CPC wygeneruje straty finansowe. Kampania wstrzymana.`, options);
            }

            return {
                action,
                strategy,
                suggestedMaxCpc: parseFloat(suggestedMaxCpc.toFixed(2)),
                suggestedMaxCpm: suggestedMaxCpm > 0 ? parseFloat(suggestedMaxCpm.toFixed(2)) : undefined,
                enableExternalNetwork,
                maxCpaLimit: maxCpa,
                currentCpa: currentCpa,
                trendMultiplierApplied: trendMultiplier,
                qLearningAction: qAction
            };

        } catch (error) {
            console.error('[BIDDING ENGINE ERROR]', error);
            throw error;
        }
    }

    async _notifyAccountManager(product, message, options = {}) {
        if (options.bypassCompliance || options.isSimulation) return; // Zabezpieczenie przed backtestingiem
        const systemUser = await prisma.user.findFirst({ where: { email: 'admin@aps.local' } });
        if (systemUser) {
             await prisma.globalMessage.create({
                 data: {
                     content: `🤖 **[MÓZG AI ADS - ${product.sku}]**\n\n${message}`,
                     authorId: systemUser.id,
                     actionType: 'system'
                 }
             });
             EventBus.emit('new_global_message', { system: true });
        }
    }

    /**
     * AUTOADAPTACJA SENTINELA (Rozdział 4.3)
     * Pozwala Sentinelowi na w locie mutowanie wagi decyzyjnej Mózgu, np. kiedy minimalne CPC rośnie 
     * lub dana kampania przestaje się opłacać ze względu na zmiany algorytmów na Allegro.
     */
    applySentinelMutation(mutationData) {
        if (mutationData.disableStrategy) {
            sentinelMatrixConfig.disabledStrategies.push(mutationData.disableStrategy);
            console.log(`[BIDDING ENGINE MUTATION] Sentinel trwale wyłączył strategię: ${mutationData.disableStrategy}`);
        }
        if (mutationData.globalCpcMultiplier) {
            sentinelMatrixConfig.globalCpcMultiplier = mutationData.globalCpcMultiplier;
            console.log(`[BIDDING ENGINE MUTATION] Sentinel skorygował wagi CPC o wskaźnik: ${mutationData.globalCpcMultiplier}`);
        }
    }
}

module.exports = new AllegroBiddingEngine();
