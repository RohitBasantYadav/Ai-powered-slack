const Message = require('../models/Message');
const Channel = require('../models/Channel');
const { AppError } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../services/fileService');

/**
 * Get messages for a channel
 * @route GET /api/messages/channel/:channelId
 * @access Private
 */
exports.getChannelMessages = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get messages (excluding thread replies)
    const messages = await Message.find({
      channel_id: channelId,
      thread_parent_id: null,
      is_deleted: false
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author_id', 'display_name email');
    
    // Get total count for pagination
    const totalMessages = await Message.countDocuments({
      channel_id: channelId,
      thread_parent_id: null,
      is_deleted: false
    });
    
    // Calculate thread reply counts for each message
    const messagesWithCounts = await Promise.all(messages.map(async (message) => {
      const replyCount = await Message.countDocuments({
        thread_parent_id: message._id,
        is_deleted: false
      });
      
      // Add reply count to message
      const messageObj = message.toObject();
      messageObj._replyCount = replyCount;
      return messageObj;
    }));
    
    res.status(200).json({
      status: 'success',
      results: messages.length,
      totalPages: Math.ceil(totalMessages / parseInt(limit)),
      currentPage: parseInt(page),
      data: {
        messages: messagesWithCounts
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get thread messages
 * @route GET /api/messages/thread/:messageId
 * @access Private
 */
exports.getThreadMessages = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    
    // Check if parent message exists
    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
      return next(new AppError('Message not found', 404));
    }
    
    // Get channel to check membership
    const channel = await Channel.findById(parentMessage.channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Get thread messages
    const threadMessages = await Message.find({
      thread_parent_id: messageId,
      is_deleted: false
    })
      .sort({ created_at: 1 })
      .populate('author_id', 'display_name email');
    
    // Include parent message
    const allMessages = [parentMessage, ...threadMessages];
    
    res.status(200).json({
      status: 'success',
      results: allMessages.length,
      data: {
        messages: allMessages
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new message
 * @route POST /api/messages
 * @access Private
 */
exports.createMessage = async (req, res, next) => {
  try {
    const { content, channel_id, thread_parent_id } = req.body;
    
    // Validate content or file
    if ((!content || content.trim() === '') && !req.file) {
      return next(new AppError('Message must have content or a file attachment', 400));
    }
    
    if (content && content.length > 2000) {
      return next(new AppError('Message cannot exceed 2000 characters', 400));
    }
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Check if it's a DM channel for file uploads
    if (req.file && channel.type !== 'dm') {
      return next(new AppError('File uploads are only allowed in direct messages', 400));
    }
    
    // If it's a thread reply, check if parent message exists
    if (thread_parent_id) {
      const parentMessage = await Message.findById(thread_parent_id);
      if (!parentMessage) {
        return next(new AppError('Parent message not found', 404));
      }
      
      // Check thread depth (max 3 levels)
      if (parentMessage.thread_parent_id && parentMessage.thread_parent_id.thread_parent_id) {
        return next(new AppError('Thread depth limit reached (max 3 levels)', 400));
      }
    }
    
    // Create message object
    const messageData = {
      content: content || '',
      author_id: req.user._id,
      channel_id,
      thread_parent_id: thread_parent_id || null
    };
    
    // Upload file if provided
    if (req.file) {
      const fileResult = await uploadToCloudinary(req.file);
      messageData.file_url = fileResult.url;
      messageData.file_type = fileResult.format;
      messageData.file_metadata = {
        public_id: fileResult.public_id,
        size: fileResult.size,
        width: fileResult.width,
        height: fileResult.height
      };
    }
    
    // Create new message
    const message = await Message.create(messageData);
    
    // Populate author details
    await message.populate('author_id', 'display_name email');
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${channel_id}`).emit('message:new', message);
      
      if (thread_parent_id) {
        io.to(`thread:${thread_parent_id}`).emit('thread:new_reply', message);
      }
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Edit a message
 * @route PATCH /api/messages/:id
 * @access Private
 */
exports.editMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    // Validate content
    if (!content || content.trim() === '') {
      return next(new AppError('Message content is required', 400));
    }
    
    if (content.length > 2000) {
      return next(new AppError('Message cannot exceed 2000 characters', 400));
    }
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if user is author
    if (message.author_id.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized to edit this message', 403));
    }
    
    // Check if message can be edited (within 5 minutes)
    if (!message.canBeEdited()) {
      return next(new AppError('Message can only be edited within 5 minutes of sending', 400));
    }
    
    // Update message
    message.content = content;
    message.is_edited = true;
    message.updated_at = Date.now();
    await message.save();
    
    // Populate author details
    await message.populate('author_id', 'display_name email');
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:edited', message);
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a message
 * @route DELETE /api/messages/:id
 * @access Private
 */
exports.deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if user is author
    if (message.author_id.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized to delete this message', 403));
    }
    
    // Soft delete message
    message.is_deleted = true;
    message.content = '[This message has been deleted]';
    await message.save();
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:deleted', { message_id: id });
    }
    
    res.status(200).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a reaction to a message
 * @route POST /api/messages/:id/reactions
 * @access Private
 */
exports.addReaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    
    // Validate emoji
    if (!emoji) {
      return next(new AppError('Emoji is required', 400));
    }
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if message is deleted
    if (message.is_deleted) {
      return next(new AppError('Cannot react to a deleted message', 400));
    }
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(message.channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Add reaction
    await message.addReaction(emoji, req.user._id);
    
    // Populate author details and reactions
    await message.populate('author_id', 'display_name email');
    await message.populate('reactions.user_id', 'display_name email');
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:reaction_added', {
        message_id: message._id,
        emoji,
        user: {
          _id: req.user._id,
          display_name: req.user.display_name
        }
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a reaction from a message
 * @route DELETE /api/messages/:id/reactions/:emoji
 * @access Private
 */
exports.removeReaction = async (req, res, next) => {
  try {
    const { id, emoji } = req.params;
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if message is deleted
    if (message.is_deleted) {
      return next(new AppError('Cannot remove reaction from a deleted message', 400));
    }
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(message.channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Remove reaction
    await message.removeReaction(emoji, req.user._id);
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:reaction_removed', {
        message_id: message._id,
        emoji,
        user_id: req.user._id
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pin a message
 * @route POST /api/messages/:id/pin
 * @access Private
 */
exports.pinMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if message is deleted
    if (message.is_deleted) {
      return next(new AppError('Cannot pin a deleted message', 400));
    }
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(message.channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Pin message
    message.is_pinned = true;
    await message.save();
    
    // Populate author details
    await message.populate('author_id', 'display_name email');
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:pinned', {
        message_id: message._id,
        pinned_by: req.user._id
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unpin a message
 * @route POST /api/messages/:id/unpin
 * @access Private
 */
exports.unpinMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find message
    const message = await Message.findById(id);
    
    // Check if message exists
    if (!message) {
      return next(new AppError('Message not found', 404));
    }
    
    // Check if message is pinned
    if (!message.is_pinned) {
      return next(new AppError('Message is not pinned', 400));
    }
    
    // Check if channel exists and user is a member
    const channel = await Channel.findById(message.channel_id);
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Unpin message
    message.is_pinned = false;
    await message.save();
    
    // Emit to socket.io if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`channel:${message.channel_id}`).emit('message:unpinned', {
        message_id: message._id,
        unpinned_by: req.user._id
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
}; 