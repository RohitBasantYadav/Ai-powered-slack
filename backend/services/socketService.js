const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('./emailService');

/**
 * Initialize Socket.IO with authentication
 * @param {Object} server - HTTP server instance
 * @returns {Object} Socket.IO instance
 */
const initializeSocket = (server) => {
  const io = require('socket.io')(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.IO middleware for authentication
  io.use(async (socket, next) => {
    try {
      // Get token from socket handshake
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token not provided'));
      }
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user exists
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      // Set user data on socket
      socket.user = {
        id: user._id,
        email: user.email,
        display_name: user.display_name,
        role: user.role
      };
      
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connection
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.display_name} (${socket.id})`);
    
    // Update user online status
    updateUserStatus(socket.user.id, true);
    
    // Join user to their channels
    joinUserChannels(socket);
    
    // Handle events
    setupMessageEvents(io, socket);
    setupTypingEvents(io, socket);
    setupChannelEvents(io, socket);
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.display_name} (${socket.id})`);
      updateUserStatus(socket.user.id, false);
    });
  });

  return io;
};

/**
 * Update user online status
 * @param {string} userId - User ID
 * @param {boolean} isOnline - Online status
 */
const updateUserStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, {
      is_online: isOnline,
      last_seen: Date.now()
    });
  } catch (error) {
    console.error('Error updating user status:', error);
  }
};

/**
 * Join user to their channels
 * @param {Object} socket - Socket instance
 */
const joinUserChannels = async (socket) => {
  try {
    const Channel = require('../models/Channel');
    
    // Find all channels the user is a member of
    const channels = await Channel.find({
      members: socket.user.id
    });
    
    // Join each channel room
    channels.forEach(channel => {
      socket.join(`channel:${channel._id}`);
      console.log(`${socket.user.display_name} joined channel: ${channel.name}`);
    });
  } catch (error) {
    console.error('Error joining channels:', error);
  }
};

/**
 * Setup message-related socket events
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket instance
 */
const setupMessageEvents = (io, socket) => {
  const Message = require('../models/Message');
  const Notification = require('../models/Notification');
  
  // New message
  socket.on('message:send', async (data, callback) => {
    try {
      const { content, channel_id, thread_parent_id } = data;
      
      // Create new message
      const message = await Message.create({
        content,
        author_id: socket.user.id,
        channel_id,
        thread_parent_id: thread_parent_id || null
      });
      
      // Populate author details
      await message.populate('author_id', 'display_name email');
      
      // Emit to channel
      io.to(`channel:${channel_id}`).emit('message:new', message);
      
      // If it's a thread reply, emit to thread subscribers
      if (thread_parent_id) {
        io.to(`thread:${thread_parent_id}`).emit('thread:new_reply', message);
      }
      
      // Process mentions and create notifications
      processMentions(message);
      
      // Send acknowledgment
      if (callback) callback({ success: true, message });
    } catch (error) {
      console.error('Error sending message:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
  
  // Edit message
  socket.on('message:edit', async (data, callback) => {
    try {
      const { message_id, content } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if user is author
      if (message.author_id.toString() !== socket.user.id) {
        if (callback) return callback({ success: false, error: 'Not authorized to edit this message' });
        return;
      }
      
      // Check if message can be edited (within 5 minutes)
      if (!message.canBeEdited()) {
        if (callback) return callback({ success: false, error: 'Message can only be edited within 5 minutes of sending' });
        return;
      }
      
      // Update message
      message.content = content;
      message.is_edited = true;
      message.updated_at = Date.now();
      await message.save();
      
      // Populate author details
      await message.populate('author_id', 'display_name email');
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:edited', message);
      
      // Send acknowledgment
      if (callback) callback({ success: true, message });
    } catch (error) {
      console.error('Error editing message:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
  
  // Delete message
  socket.on('message:delete', async (data, callback) => {
    try {
      const { message_id } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if user is author
      if (message.author_id.toString() !== socket.user.id) {
        if (callback) return callback({ success: false, error: 'Not authorized to delete this message' });
        return;
      }
      
      // Soft delete message
      message.is_deleted = true;
      message.content = '[This message has been deleted]';
      await message.save();
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:deleted', { message_id });
      
      // Send acknowledgment
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
  
  // Join thread
  socket.on('thread:join', (thread_id) => {
    socket.join(`thread:${thread_id}`);
  });
  
  // Leave thread
  socket.on('thread:leave', (thread_id) => {
    socket.leave(`thread:${thread_id}`);
  });

  // Add reaction
  socket.on('message:add_reaction', async (data, callback) => {
    try {
      const { message_id, emoji } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if message is deleted
      if (message.is_deleted) {
        if (callback) return callback({ success: false, error: 'Cannot react to a deleted message' });
        return;
      }
      
      // Add reaction
      await message.addReaction(emoji, socket.user.id);
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:reaction_added', {
        message_id: message._id,
        emoji,
        user: {
          _id: socket.user.id,
          display_name: socket.user.display_name
        }
      });
      
      // Send acknowledgment
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error adding reaction:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // Remove reaction
  socket.on('message:remove_reaction', async (data, callback) => {
    try {
      const { message_id, emoji } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if message is deleted
      if (message.is_deleted) {
        if (callback) return callback({ success: false, error: 'Cannot remove reaction from a deleted message' });
        return;
      }
      
      // Remove reaction
      await message.removeReaction(emoji, socket.user.id);
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:reaction_removed', {
        message_id: message._id,
        emoji,
        user_id: socket.user.id
      });
      
      // Send acknowledgment
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error removing reaction:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // Pin message
  socket.on('message:pin', async (data, callback) => {
    try {
      const { message_id } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if message is deleted
      if (message.is_deleted) {
        if (callback) return callback({ success: false, error: 'Cannot pin a deleted message' });
        return;
      }
      
      // Pin message
      message.is_pinned = true;
      await message.save();
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:pinned', {
        message_id: message._id,
        pinned_by: socket.user.id
      });
      
      // Send acknowledgment
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error pinning message:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // Unpin message
  socket.on('message:unpin', async (data, callback) => {
    try {
      const { message_id } = data;
      
      // Find message
      const message = await Message.findById(message_id);
      
      // Check if message exists
      if (!message) {
        if (callback) return callback({ success: false, error: 'Message not found' });
        return;
      }
      
      // Check if message is pinned
      if (!message.is_pinned) {
        if (callback) return callback({ success: false, error: 'Message is not pinned' });
        return;
      }
      
      // Unpin message
      message.is_pinned = false;
      await message.save();
      
      // Emit to channel
      io.to(`channel:${message.channel_id}`).emit('message:unpinned', {
        message_id: message._id,
        unpinned_by: socket.user.id
      });
      
      // Send acknowledgment
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error unpinning message:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
};

/**
 * Setup typing-related socket events
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket instance
 */
const setupTypingEvents = (io, socket) => {
  // Typing start
  socket.on('typing:start', (channel_id) => {
    socket.to(`channel:${channel_id}`).emit('typing:start', {
      user_id: socket.user.id,
      display_name: socket.user.display_name
    });
  });
  
  // Typing stop
  socket.on('typing:stop', (channel_id) => {
    socket.to(`channel:${channel_id}`).emit('typing:stop', {
      user_id: socket.user.id
    });
  });
};

/**
 * Setup channel-related socket events
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket instance
 */
const setupChannelEvents = (io, socket) => {
  // Join channel
  socket.on('channel:join', async (channel_id) => {
    socket.join(`channel:${channel_id}`);
  });
  
  // Leave channel
  socket.on('channel:leave', (channel_id) => {
    socket.leave(`channel:${channel_id}`);
  });
};

/**
 * Process mentions in message and create notifications
 * @param {Object} message - Message object
 */
const processMentions = async (message) => {
  try {
    // Extract mentions from message content (e.g., @username)
    const mentionRegex = /@(\w+)/g;
    const mentions = message.content.match(mentionRegex) || [];
    
    if (mentions.length === 0) return;
    
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const Channel = require('../models/Channel');
    
    for (const mention of mentions) {
      const username = mention.substring(1); // Remove @ symbol
      
      // Find user by display name
      const user = await User.findOne({ 
        display_name: { $regex: new RegExp(`^${username}$`, 'i') } 
      });
      
      if (user && user._id.toString() !== message.author_id.toString()) {
        // Get sender details
        const sender = await User.findById(message.author_id);
        
        // Get channel details
        const channel = await Channel.findById(message.channel_id);
        
        // Create notification
        await Notification.createNotification({
          recipient_id: user._id,
          sender_id: message.author_id,
          type: 'mention',
          message_id: message._id,
          channel_id: message.channel_id,
          content: `${sender.display_name} mentioned you in a message`
        });
        
        // Send email notification (stub)
        try {
          await emailService.sendMentionEmail({
            recipient: user,
            sender,
            message,
            channel
          });
        } catch (emailError) {
          console.error('Error sending email notification:', emailError);
        }
      }
    }
  } catch (error) {
    console.error('Error processing mentions:', error);
  }
};

module.exports = {
  initializeSocket
}; 