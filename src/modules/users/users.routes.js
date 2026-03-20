const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const { authenticateToken, requireSuperUser } = require('../../middlewares/auth.middleware');

// GET /api/users - Lista użytkowników dla wszystkich zalogowanych
router.get('/', authenticateToken, usersController.getUsers);

// POST i PATCH - Tylko Admin i Prezes
router.post('/', authenticateToken, requireSuperUser, usersController.createUser);
router.patch('/:id', authenticateToken, requireSuperUser, usersController.updateUser);

module.exports = router;