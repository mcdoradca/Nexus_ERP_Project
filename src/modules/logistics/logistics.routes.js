const express = require('express');
const router = express.Router();
const { getSuppliers } = require('./logistics.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/suppliers', authenticateToken, getSuppliers);

module.exports = router;
