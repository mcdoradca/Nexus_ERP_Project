const express = require('express');
const router = express.Router();
const { getBlacklist, getReturns, banUser, dismissUser } = require('./rma.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/blacklist', authenticateToken, getBlacklist);
router.get('/returns', authenticateToken, getReturns);
router.post('/blacklist/:id/ban', authenticateToken, banUser);
router.post('/blacklist/:id/dismiss', authenticateToken, dismissUser);

module.exports = router;
