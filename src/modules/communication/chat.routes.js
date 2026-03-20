const express = require('express');
const router = express.Router();
const chatController = require('./chat.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/unread', authenticateToken, chatController.getUnreadDMs);
router.get('/:mode', authenticateToken, chatController.getMessages);
router.get('/:mode/:id', authenticateToken, chatController.getMessages);
router.post('/:mode/files', authenticateToken, upload.single('file'), chatController.uploadMessageFile);
router.post('/:mode/:id/files', authenticateToken, upload.single('file'), chatController.uploadMessageFile);
module.exports = router;