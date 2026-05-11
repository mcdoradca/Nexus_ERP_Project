const express = require('express');
const router = express.Router();
const notificationsController = require('./notifications.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/', authenticateToken, notificationsController.getNotifications);
router.patch('/read', authenticateToken, notificationsController.markAsRead);
router.patch('/:id/status', authenticateToken, notificationsController.toggleReadStatus);
router.delete('/:id', authenticateToken, notificationsController.deleteNotification);

module.exports = router;