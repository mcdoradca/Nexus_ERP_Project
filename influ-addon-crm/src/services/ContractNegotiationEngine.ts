import { CrmIntegrationService } from './CrmIntegrationService';
import { DataMapping } from './DataMapping';

export class ContractNegotiationEngine {
    /**
     * Ocenia jak silny finansowo trzeba przypiąć deal i wypluwa wektor
     */
    static evaluateDealType(influencerData: any) {
        // Nano to Barter. Wszystko powyzej micro to Paid.
        let dealModel = "PAID";
        if (influencerData.followersCount < 10000) {
            dealModel = "BARTER_PRODUCT_SEEDING";
        }
        
        return {
            recommendedModel: dealModel,
            projectedCostUSD: dealModel === "PAID" ? influencerData.estimatedPricePerPostUSD : 0,
            productValueUSD: dealModel === "BARTER_PRODUCT_SEEDING" ? 150 : 0
        };
    }

    /**
     * Podbija automatyczne pipeline w zewnętrznym narzędziu
     */
    static async finalizeAgreement(influencerData: any, campaign: any) {
        // Tłumaczenie na Hubspot
        const evaluation = this.evaluateDealType(influencerData);
        
        // Zapis rekordu do chmury Hubspota
        const hubspotContactId = (await CrmIntegrationService.pushContact(DataMapping.toHubSpotContact(influencerData))).hubspotContactId;
        
        const dealPayload = { ...campaign, isBarter: evaluation.recommendedModel.includes('BARTER'), proposedFee: evaluation.projectedCostUSD };
        const hubspotDeal = await CrmIntegrationService.pushDeal(DataMapping.toHubSpotDeal(dealPayload, hubspotContactId));

        return {
            status: 'AGREEMENT_LOCKED',
            model: evaluation.recommendedModel,
            remoteDealId: hubspotDeal.hubspotDealId
        };
    }
}
