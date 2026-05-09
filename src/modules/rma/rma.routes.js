const express = require('express');
const router = express.Router();
const { getBlacklist, getReturns } = require('./rma.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/blacklist', authenticateToken, getBlacklist);
router.get('/returns', authenticateToken, getReturns);

module.exports = router;
