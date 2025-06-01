const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Upload a file
 * @route POST /api/files/upload
 * @access Private
 */
exports.uploadFile = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }
    
    // Upload file to Cloudinary
    const result = await uploadToCloudinary(req.file);
    
    // Return file details
    res.status(200).json({
      status: 'success',
      data: {
        file: {
          url: result.url,
          public_id: result.public_id,
          format: result.format,
          size: result.size
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a file
 * @route DELETE /api/files/:public_id
 * @access Private
 */
exports.deleteFile = async (req, res, next) => {
  try {
    const { public_id } = req.params;
    
    // Delete file from Cloudinary
    await deleteFromCloudinary(public_id);
    
    res.status(200).json({
      status: 'success',
      message: 'File deleted successfully',
      data: null
    });
  } catch (error) {
    next(error);
  }
}; 