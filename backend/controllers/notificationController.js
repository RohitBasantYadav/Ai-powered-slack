const Notification = require('../models/Notification');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get all notifications for the current user
 * @route GET /api/notifications
 * @access Private
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread_only = false } = req.query;
    
    // Build query
    const query = { recipient_id: req.user._id };
    
    // Filter by read status if requested
    if (unread_only === 'true') {
      query.is_read = false;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sender_id', 'display_name email')
      .populate('message_id')
      .populate('channel_id', 'name type');
    
    // Get total count for pagination
    const totalNotifications = await Notification.countDocuments(query);
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient_id: req.user._id,
      is_read: false
    });
    
    res.status(200).json({
      status: 'success',
      results: notifications.length,
      totalPages: Math.ceil(totalNotifications / parseInt(limit)),
      currentPage: parseInt(page),
      unreadCount,
      data: {
        notifications
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark notifications as read
 * @route PATCH /api/notifications/read
 * @access Private
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { ids } = req.body;
    
    // If specific notification IDs provided, mark only those
    if (ids && Array.isArray(ids) && ids.length > 0) {
      await Notification.markAsRead(req.user._id, ids);
    } 
    // Otherwise mark all notifications as read
    else {
      await Notification.markAsRead(req.user._id);
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Notifications marked as read',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a single notification as read
 * @route PATCH /api/notifications/:id/read
 * @access Private
 */
exports.markOneAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find notification
    const notification = await Notification.findById(id);
    
    // Check if notification exists
    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }
    
    // Check if user is the recipient
    if (notification.recipient_id.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized to mark this notification as read', 403));
    }
    
    // Mark as read
    notification.is_read = true;
    await notification.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
      data: null
    });
  } catch (error) {
    next(error);
  }
}; 