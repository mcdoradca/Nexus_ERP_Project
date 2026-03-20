const express = require('express');
const router = express.Router();
const projectsController = require('./projects.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.get('/', authenticateToken, projectsController.getAll);
router.get('/:id', authenticateToken, projectsController.getOne);
router.post('/', authenticateToken, projectsController.create);
router.patch('/:id', authenticateToken, projectsController.update);

module.exports = router;