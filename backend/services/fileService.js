const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const { AppError } = require('../middleware/errorHandler');

/**
 * Upload file to Cloudinary
 * @param {Object} file - File object from multer
 * @param {String} folder - Folder name in Cloudinary
 * @returns {Object} Cloudinary upload result
 */
const uploadToCloudinary = async (file, folder = 'slack_clone') => {
  try {
    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true
    });
    
    // Remove file from local storage
    fs.unlinkSync(file.path);
    
    return {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes
    };
  } catch (error) {
    // Remove file from local storage if upload fails
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    throw new AppError(`Error uploading file to Cloudinary: ${error.message}`, 500);
  }
};

/**
 * Delete file from Cloudinary
 * @param {String} public_id - Public ID of the file in Cloudinary
 * @returns {Object} Cloudinary delete result
 */
const deleteFromCloudinary = async (public_id) => {
  try {
    const result = await cloudinary.uploader.destroy(public_id);
    return result;
  } catch (error) {
    throw new AppError(`Error deleting file from Cloudinary: ${error.message}`, 500);
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary
}; 