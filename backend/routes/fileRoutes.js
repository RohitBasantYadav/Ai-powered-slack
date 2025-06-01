const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const fileController = require('../controllers/fileController');

// Upload a file
router.post('/upload', protect, upload.single('file'), handleMulterError, fileController.uploadFile);

// Delete a file
router.delete('/:public_id', protect, fileController.deleteFile);

module.exports = router; 