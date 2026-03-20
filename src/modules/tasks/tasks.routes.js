const express = require('express');
const router = express.Router();
const tasksController = require('./tasks.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Main Task Operations
router.get('/', authenticateToken, tasksController.getAll);
router.post('/', authenticateToken, tasksController.create);
router.patch('/:id', authenticateToken, tasksController.updateDetails);

// Work & State Flags
router.patch('/:id/status', authenticateToken, tasksController.updateStatus);
router.patch('/:id/block', authenticateToken, tasksController.blockTask);
router.patch('/:id/work', authenticateToken, tasksController.toggleWork);

// Chat & Files
router.post('/:taskId/comments', authenticateToken, tasksController.addComment);
router.post('/:taskId/files', authenticateToken, upload.single('file'), tasksController.uploadFile);

// Archive & Hard Delete
router.get('/archive/list', authenticateToken, tasksController.getArchived);
router.patch('/:taskId/archive', authenticateToken, tasksController.archiveTask);
router.patch('/:taskId/restore', authenticateToken, tasksController.restoreTask);
router.delete('/:taskId', authenticateToken, tasksController.deleteHard);

module.exports = router;