const express = require('express');
const router = express.Router();
const controller = require('./pricing.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.post('/recalculate/all', authenticateToken, controller.recalculateAll);
router.post('/recalculate/:id', authenticateToken, controller.recalculateProductPrice);
router.get('/recommend/:id', authenticateToken, controller.recommendPrice);

module.exports = router;
