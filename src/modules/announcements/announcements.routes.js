const express = require('express');
const router = express.Router();
const announcementsController = require('./announcements.controller');
const { authenticateToken, requireSuperUser } = require('../../middlewares/auth.middleware');

router.get('/', authenticateToken, announcementsController.getAll);
router.get('/unread-mandatory', authenticateToken, announcementsController.getUnreadMandatory);

router.post('/:id/read', authenticateToken, announcementsController.markAsRead); // Endpoint do podpisu cyfrowego "Zrozumiałem"

router.post('/', authenticateToken, requireSuperUser, announcementsController.create);

module.exports = router;