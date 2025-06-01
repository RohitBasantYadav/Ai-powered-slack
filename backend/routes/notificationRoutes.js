const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// Get all notifications for the current user
router.get('/', protect, notificationController.getNotifications);

// Mark notifications as read
router.patch('/read', protect, notificationController.markAsRead);

// Mark a single notification as read
router.patch('/:id/read', protect, notificationController.markOneAsRead);

module.exports = router; 