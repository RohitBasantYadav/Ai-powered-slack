const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Channel name is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Channel name must be at least 3 characters'],
    maxlength: [50, 'Channel name cannot exceed 50 characters'],
    match: [/^[a-z0-9-_]+$/, 'Channel name can only contain lowercase letters, numbers, hyphens and underscores']
  },
  type: {
    type: String,
    enum: ['public', 'dm'],
    required: [true, 'Channel type is required']
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Channel creator is required']
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Pre-save hook to ensure creator is in members
channelSchema.pre('save', function(next) {
  // Add creator to members if not already there
  if (this.isNew && this.created_by && !this.members.includes(this.created_by)) {
    this.members.push(this.created_by);
  }
  next();
});

// Static method to check if channel limit is reached
channelSchema.statics.isChannelLimitReached = async function() {
  const count = await this.countDocuments({ type: 'public' });
  return count >= 10; // Maximum 10 public channels as per requirements
};

// Static method to find DM channel between two users
channelSchema.statics.findDmChannel = async function(user1Id, user2Id) {
  return this.findOne({
    type: 'dm',
    members: { $all: [user1Id, user2Id], $size: 2 }
  });
};

const Channel = mongoose.model('Channel', channelSchema);

module.exports = Channel; 