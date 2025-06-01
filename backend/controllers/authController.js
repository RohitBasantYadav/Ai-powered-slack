const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { generateToken } = require('../middleware/auth');

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Public
 */
exports.register = async (req, res, next) => {
  try {
    const { email, password, display_name, bio } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('Email already in use', 400));
    }
    
    // Validate password
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return next(new AppError('Password must be at least 8 characters and contain at least 1 letter and 1 number', 400));
    }
    
    // Create new user
    const user = await User.create({
      email,
      password_hash: password,
      display_name,
      bio
    });
    
    // Generate token
    const token = generateToken(user._id);
    
    // Remove password from output
    user.password_hash = undefined;
    
    res.status(201).json({
      status: 'success',
      token,
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 * @access Public
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password', 400));
    }
    
    // Check if user exists && password is correct
    const user = await User.findOne({ email }).select('+password_hash');
    
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Incorrect email or password', 401));
    }
    
    // Update last seen and online status
    user.last_seen = Date.now();
    user.is_online = true;
    await user.save({ validateBeforeSave: false });
    
    // Generate token
    const token = generateToken(user._id);
    
    // Remove password from output
    user.password_hash = undefined;
    
    res.status(200).json({
      status: 'success',
      token,
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 * @route GET /api/auth/me
 * @access Protected
 */
exports.getCurrentUser = async (req, res, next) => {
  try {
    // User is already available in req.user from protect middleware
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
}; 