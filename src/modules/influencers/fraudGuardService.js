// fraudGuardService.js
// Odrzuca wyniki fałszywe i ocenia skalę zaufania psychograficznego (Authenticity checks).

class FraudGuardService {
    // Ewaluuje "Integrity/Fraud Score" profilu
    evaluateAuthenticity(followers, engagementRate) {
        let authenticityScore = 1.0;
        
        // Logika oparta o dysproporcje gwałtownych anomalii
        if (followers > 1000000) {
            // Konta milionowe z ogromnym zaangażowaniem rzędu 20% to matematyczna anomalia w Europie wskazująca na farmę botów w Indiach/Brazylii
            if (engagementRate > 0.15) {
                authenticityScore -= 0.6; // Silna penalizacja na skali zaufania psychograficznego
            }
        }

        if (followers < 50000 && followers > 5000) {
            // Windowanie (boosting) nano i mikro influencerów przy solidnych 5-10% zaangażowania
            if (engagementRate >= 0.04 && engagementRate <= 0.12) {
                authenticityScore += 0.3; 
            }
        }

        // Dodatkowa tarcza dekapitacji kont kompletnie martwych z napompowanym followers ratio
        if (followers > 100000 && engagementRate < 0.001) {
            authenticityScore -= 0.8;
        }

        // Zwracamy clampowane do (0, 1.5 - max boost)
        return Math.max(0, Math.min(authenticityScore, 1.5));
    }

    validateProfile(profileData) {
        const { followers, engagementRate } = profileData;
        const score = this.evaluateAuthenticity(followers, engagementRate);
        const isFraudRisk = score < 0.4;
        
        return {
            isValid: !isFraudRisk,
            score,
            warning: isFraudRisk ? "WYSOKIE RYZYKO ANOMALII. Zablokowany dostęp do DealIRM." : null
        };
    }
}

module.exports = new FraudGuardService();
