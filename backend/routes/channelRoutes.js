const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const channelController = require('../controllers/channelController');

// Get all channels
router.get('/', protect, channelController.getAllChannels);

// Get a single channel
router.get('/:id', protect, channelController.getChannel);

// Create a new channel
router.post('/', protect, channelController.createChannel);

// Join a channel
router.post('/:id/join', protect, channelController.joinChannel);

// Leave a channel
router.post('/:id/leave', protect, channelController.leaveChannel);

// Delete a channel (admin only)
router.delete('/:id', protect, restrictTo('admin'), channelController.deleteChannel);

// Get channel members
router.get('/:id/members', protect, channelController.getChannelMembers);

// Create or get DM channel
router.post('/dm', protect, channelController.createDmChannel);

module.exports = router; 