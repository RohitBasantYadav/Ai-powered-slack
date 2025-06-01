const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const messageController = require('../controllers/messageController');

// Get messages for a channel
router.get('/channel/:channelId', protect, messageController.getChannelMessages);

// Get thread messages
router.get('/thread/:messageId', protect, messageController.getThreadMessages);

// Create a new message
router.post('/', protect, upload.single('file'), messageController.createMessage);

// Edit a message
router.patch('/:id', protect, messageController.editMessage);

// Delete a message
router.delete('/:id', protect, messageController.deleteMessage);

// Add a reaction to a message
router.post('/:id/reactions', protect, messageController.addReaction);

// Remove a reaction from a message
router.delete('/:id/reactions/:emoji', protect, messageController.removeReaction);

// Pin a message
router.post('/:id/pin', protect, messageController.pinMessage);

// Unpin a message
router.post('/:id/unpin', protect, messageController.unpinMessage);

module.exports = router; 