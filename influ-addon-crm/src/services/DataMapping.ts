export class DataMapping {
    /**
     * Tłumacz Encję Wewnętrzną "Twórca" na standardowy Contact HubSpota
     */
    static toHubSpotContact(influencer: any) {
        return {
            properties: {
                firstname: influencer.name,
                email: influencer.email || 'brak@agencja.pl',
                influencer_handle: influencer.handle,
                followers: influencer.followers,
                platform: influencer.platform,
                engagement_rate: influencer.engagementRate,
                bot_score: influencer.authenticityScore || 1.0,
                preferred_model: influencer.preferredCollab || 'BARTER'
            }
        };
    }

    /**
     * Tłumacz Kampanię Wewnętrzną "Brief" na Deal / Opportunity HubSpota
     */
    static toHubSpotDeal(campaign: any, hubspotContactId: string) {
        return {
            properties: {
                dealname: `Współpraca Influencer: ${campaign.campaignName}`,
                pipeline: "influencer_pipeline_01",
                dealstage: campaign.isBarter ? "presentationscheduled" : "contractsent",
                amount: campaign.proposedFee || 0,
                hubspot_owner_id: campaign.ownerId || "admin"
            },
            associations: [
                {
                    to: { id: hubspotContactId },
                    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] // 3 = Contact to Deal w Hubspot
                }
            ]
        };
    }
}
