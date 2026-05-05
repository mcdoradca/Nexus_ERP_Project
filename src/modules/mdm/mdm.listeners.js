const EventBus = require('../../core/EventBus');
const mdmService = require('./mdm.service');

function registerMdmListeners() {
    EventBus.subscribe('PRODUCT_COST_UPDATED', mdmService.handleProductCostUpdated);
    EventBus.subscribe('PRODUCT_DATA_UPDATED', mdmService.handleProductDataUpdated);
    EventBus.subscribe('DEAL_MARKETING_COST_UPDATED', mdmService.handleDealMarketingCostUpdated);
    EventBus.subscribe('PRODUCT_CONTENT_OPTIMIZED', mdmService.handleProductContentOptimized);

    console.log('[LISTENERS] MDM (Master Data Management) listeners registered');
}

module.exports = {
    registerMdmListeners
};
