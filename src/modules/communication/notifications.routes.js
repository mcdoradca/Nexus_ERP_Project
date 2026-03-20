const express = require('express');
const router = express.Router();
const notificationsController = require('./notifications.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/', authenticateToken, notificationsController.getNotifications);
router.patch('/read', authenticateToken, notificationsController.markAsRead);

module.exports = router;