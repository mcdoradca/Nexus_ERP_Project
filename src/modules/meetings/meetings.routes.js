const express = require('express');
const router = express.Router();
const { getAvailableSlots, bookMeeting, getAdminBookings, updateBookingStatus, getAvailabilities, setAvailability } = require('./meetings.controller');
const { authenticateToken, requireSuperUser } = require('../../middlewares/auth.middleware');

// Publiczne - bez tokena (dla rekruterów z zewnątrz z linku)
router.get('/public/availability', getAvailableSlots);
router.post('/public/book', bookMeeting);

// Administracyjne wewnątrz Nexus ERP
router.get('/admin/bookings', authenticateToken, getAdminBookings);
router.patch('/admin/bookings/:id', authenticateToken, updateBookingStatus);
router.get('/admin/availability', authenticateToken, getAvailabilities);
router.post('/admin/availability', authenticateToken, requireSuperUser, setAvailability);

module.exports = router;
