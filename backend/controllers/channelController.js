const Channel = require('../models/Channel');
const User = require('../models/User');
const Message = require('../models/Message');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get all channels
 * @route GET /api/channels
 * @access Private
 */
exports.getAllChannels = async (req, res, next) => {
  try {
    // Get all public channels
    const publicChannels = await Channel.find({ type: 'public' })
      .sort({ name: 1 })
      .populate('created_by', 'display_name email');
    
    // Get user's DM channels
    const dmChannels = await Channel.find({
      type: 'dm',
      members: req.user._id
    })
      .sort({ created_at: -1 })
      .populate('members', 'display_name email is_online last_seen');
    
    // Format DM channels to show the other user's name
    const formattedDmChannels = dmChannels.map(channel => {
      const otherUser = channel.members.find(
        member => member._id.toString() !== req.user._id.toString()
      );
      
      return {
        ...channel.toObject(),
        display_name: otherUser ? otherUser.display_name : 'Deleted User',
        other_user: otherUser || null
      };
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        public: publicChannels,
        direct: formattedDmChannels
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single channel
 * @route GET /api/channels/:id
 * @access Private
 */
exports.getChannel = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find channel
    const channel = await Channel.findById(id)
      .populate('created_by', 'display_name email')
      .populate('members', 'display_name email is_online last_seen');
    
    // Check if channel exists
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member of the channel
    if (!channel.members.some(member => member._id.toString() === req.user._id.toString())) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    // Format DM channels to show the other user's name
    if (channel.type === 'dm') {
      const otherUser = channel.members.find(
        member => member._id.toString() !== req.user._id.toString()
      );
      
      channel.display_name = otherUser ? otherUser.display_name : 'Deleted User';
      channel.other_user = otherUser || null;
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        channel
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new channel
 * @route POST /api/channels
 * @access Private
 */
exports.createChannel = async (req, res, next) => {
  try {
    const { name, type = 'public' } = req.body;
    
    // Validate channel name
    if (!name || name.trim() === '') {
      return next(new AppError('Channel name is required', 400));
    }
    
    // Check if channel name is valid
    const nameRegex = /^[a-z0-9-_]+$/;
    if (!nameRegex.test(name)) {
      return next(new AppError('Channel name can only contain lowercase letters, numbers, hyphens and underscores', 400));
    }
    
    // Check if channel name is already taken
    const existingChannel = await Channel.findOne({ name: name.toLowerCase() });
    if (existingChannel) {
      return next(new AppError('Channel name already exists', 400));
    }
    
    // Check if channel limit is reached (max 10 public channels)
    if (type === 'public' && await Channel.isChannelLimitReached()) {
      return next(new AppError('Channel limit reached (max 10 public channels)', 400));
    }
    
    // Create new channel
    const channel = await Channel.create({
      name: name.toLowerCase(),
      type,
      created_by: req.user._id,
      members: [req.user._id]
    });
    
    // Populate created_by field
    await channel.populate('created_by', 'display_name email');
    
    res.status(201).json({
      status: 'success',
      data: {
        channel
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Join a channel
 * @route POST /api/channels/:id/join
 * @access Private
 */
exports.joinChannel = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find channel
    const channel = await Channel.findById(id);
    
    // Check if channel exists
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if channel is public
    if (channel.type !== 'public') {
      return next(new AppError('Cannot join a non-public channel', 400));
    }
    
    // Check if user is already a member
    if (channel.members.includes(req.user._id)) {
      return next(new AppError('You are already a member of this channel', 400));
    }
    
    // Add user to channel members
    channel.members.push(req.user._id);
    await channel.save();
    
    // Populate channel details
    await channel.populate('created_by', 'display_name email');
    await channel.populate('members', 'display_name email');
    
    res.status(200).json({
      status: 'success',
      data: {
        channel
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Leave a channel
 * @route POST /api/channels/:id/leave
 * @access Private
 */
exports.leaveChannel = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find channel
    const channel = await Channel.findById(id);
    
    // Check if channel exists
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if channel is public
    if (channel.type !== 'public') {
      return next(new AppError('Cannot leave a non-public channel', 400));
    }
    
    // Check if user is a member
    if (!channel.members.includes(req.user._id)) {
      return next(new AppError('You are not a member of this channel', 400));
    }
    
    // Check if user is the creator and there are other members
    if (channel.created_by.toString() === req.user._id.toString() && channel.members.length > 1) {
      // Find oldest member to make new creator
      const oldestMember = await User.findOne({
        _id: { $in: channel.members, $ne: req.user._id }
      }).sort({ created_at: 1 });
      
      if (oldestMember) {
        channel.created_by = oldestMember._id;
      }
    }
    
    // Remove user from channel members
    channel.members = channel.members.filter(
      memberId => memberId.toString() !== req.user._id.toString()
    );
    
    // If no members left, delete the channel
    if (channel.members.length === 0) {
      await Channel.findByIdAndDelete(id);
      
      res.status(200).json({
        status: 'success',
        message: 'Channel deleted as no members remain',
        data: null
      });
    } else {
      await channel.save();
      
      res.status(200).json({
        status: 'success',
        message: 'Successfully left channel',
        data: null
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a channel (admin only)
 * @route DELETE /api/channels/:id
 * @access Private (Admin)
 */
exports.deleteChannel = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find channel
    const channel = await Channel.findById(id);
    
    // Check if channel exists
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if it's the general channel
    if (channel.name === 'general') {
      return next(new AppError('Cannot delete the general channel', 400));
    }
    
    // Delete channel
    await Channel.findByIdAndDelete(id);
    
    // Delete all messages in the channel
    await Message.deleteMany({ channel_id: id });
    
    res.status(200).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get channel members
 * @route GET /api/channels/:id/members
 * @access Private
 */
exports.getChannelMembers = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find channel
    const channel = await Channel.findById(id)
      .populate('members', 'display_name email is_online last_seen');
    
    // Check if channel exists
    if (!channel) {
      return next(new AppError('Channel not found', 404));
    }
    
    // Check if user is a member
    if (!channel.members.some(member => member._id.toString() === req.user._id.toString())) {
      return next(new AppError('You are not a member of this channel', 403));
    }
    
    res.status(200).json({
      status: 'success',
      results: channel.members.length,
      data: {
        members: channel.members
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or get DM channel
 * @route POST /api/channels/dm
 * @access Private
 */
exports.createDmChannel = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    
    // Check if user exists
    const otherUser = await User.findById(user_id);
    if (!otherUser) {
      return next(new AppError('User not found', 404));
    }
    
    // Check if DM channel already exists
    const existingChannel = await Channel.findDmChannel(req.user._id, user_id);
    
    if (existingChannel) {
      // Populate members
      await existingChannel.populate('members', 'display_name email is_online last_seen');
      
      // Format channel to show the other user's name
      const otherUserDetails = existingChannel.members.find(
        member => member._id.toString() !== req.user._id.toString()
      );
      
      existingChannel.display_name = otherUserDetails ? otherUserDetails.display_name : 'Deleted User';
      existingChannel.other_user = otherUserDetails || null;
      
      return res.status(200).json({
        status: 'success',
        data: {
          channel: existingChannel
        }
      });
    }
    
    // Create new DM channel
    const channel = await Channel.create({
      name: `dm-${req.user._id}-${user_id}`,
      type: 'dm',
      created_by: req.user._id,
      members: [req.user._id, user_id]
    });
    
    // Populate members
    await channel.populate('members', 'display_name email is_online last_seen');
    
    // Format channel to show the other user's name
    const otherUserDetails = channel.members.find(
      member => member._id.toString() !== req.user._id.toString()
    );
    
    channel.display_name = otherUserDetails ? otherUserDetails.display_name : 'Deleted User';
    channel.other_user = otherUserDetails || null;
    
    res.status(201).json({
      status: 'success',
      data: {
        channel
      }
    });
  } catch (error) {
    next(error);
  }
}; 