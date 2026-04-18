// complianceValidator.js
// Ostatnia linia obrony: UOKiK, RODO/GDPR oraz Digital Fairness Act.
// Uniemożliwia realizację pętli wysyłkowej oraz rozliczeń w przypadku oflagowanego ryzyka prawnego.

class ComplianceValidator {
    constructor() {
        // Symulacyjna klasyfikacja ryzykownych nazw lub kategorii w katalogu PIM
        this.bannedKeywordsDFA = ["tytoń", "vape", "cbd", "farmaceutyk", "leki", "hazard", "kasyno", "alkohol"];
    }

    // Blokada wysyłania paczek / budowy relacji z zakazaną taksonomią (Digital Fairness Act)
    validateDigitalFairness(productName) {
        if (!productName) return { safe: true };
        const normalized = productName.toLowerCase();
        for (const word of this.bannedKeywordsDFA) {
            if (normalized.includes(word)) {
                return {
                    safe: false,
                    reason: `Zablokowane przez Digital Fairness Act. Użycie zakazanej taksonomii towarowej: [${word.toUpperCase()}]`
                };
            }
        }
        return { safe: true };
    }

    // Walidacja logowania zgód RODO na poziomie podmiotu promującego wg wzorca Privacy by Design
    verifyGDPRConsent(influencerProfile) {
        if (!influencerProfile.gdprConsent) {
             return {
                 approved: false,
                 warning: "Brak kryptograficznego opieczętowania zgody RODO w bazie. Relacja bezwzględnie zamrożona."
             };
        }
        return { approved: true };
    }

    // Validator norm UOKiK dla weryfikacji materiałów merytorycznie promocyjnych (Creator Portal Hub)
    evaluateUokikTags(missionDraftText) {
        if (!missionDraftText) return { compliant: false, status: "RYZYKO PRAWNE: TAK" };
        
        const text = missionDraftText.toLowerCase();
        const hasAdTag = text.includes("#wspolpracareklamowa") || 
                         text.includes("#reklama") || 
                         text.includes("materiał sponsorowany") ||
                         text.includes("material sponsorowany");
                         
        if (!hasAdTag) {
            return {
                compliant: false,
                status: "RYZYKO PRAWNE: TAK",
                details: "Ostrzeżenie Prezesa UOKiK! W Draft'cie publikacji brakuje jednoznacznych i legalnych zapisów powiązania materialnego z asortymentem."
            };
        }
        
        return {
            compliant: true,
            status: "RYZYKO PRAWNE: NIE",
            details: "Walidacja tekstu przeszła obostrzenia prawne."
        };
    }
}

module.exports = new ComplianceValidator();
