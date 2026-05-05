const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./idp.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // limit do 20MB na PDF
});

router.post('/process-invoice', authenticateToken, upload.single('invoice'), controller.processInvoice);
router.get('/invoices', authenticateToken, controller.getInvoices);

module.exports = router;
