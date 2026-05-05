const analyticsService = require('./analytics.service');

async function getProductForecast(req, res) {
    try {
        const { productId } = req.params;
        const forecast = await analyticsService.generateDemandForecast(productId);
        res.status(200).json({ success: true, data: forecast });
    } catch (err) {
        console.error("Analytics Controller Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    getProductForecast
};
