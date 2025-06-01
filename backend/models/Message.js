const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  emoji: {
    type: String,
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

const fileMetadataSchema = new mongoose.Schema({
  public_id: String,
  size: Number,
  width: Number,
  height: Number
});

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  author_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Message author is required']
  },
  channel_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: [true, 'Channel is required']
  },
  thread_parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  file_url: {
    type: String,
    default: null
  },
  file_type: {
    type: String,
    default: null
  },
  file_metadata: {
    type: fileMetadataSchema,
    default: null
  },
  reactions: [reactionSchema],
  is_deleted: {
    type: Boolean,
    default: false
  },
  is_edited: {
    type: Boolean,
    default: false
  },
  is_pinned: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create index for better performance
messageSchema.index({ channel_id: 1, created_at: -1 });
messageSchema.index({ author_id: 1, created_at: -1 });
messageSchema.index({ thread_parent_id: 1 });

// Create TTL index for 30-day message retention
messageSchema.index({ created_at: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

// Method to check if message can be edited (within 5 minutes)
messageSchema.methods.canBeEdited = function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.created_at > fiveMinutesAgo && !this.is_deleted;
};

// Method to add a reaction
messageSchema.methods.addReaction = async function(emoji, userId) {
  // Check if user already reacted with this emoji
  const existingReaction = this.reactions.find(
    reaction => reaction.emoji === emoji && reaction.user_id.toString() === userId.toString()
  );
  
  if (existingReaction) {
    return this;
  }
  
  // Add reaction
  this.reactions.push({
    emoji,
    user_id: userId
  });
  
  return this.save();
};

// Method to remove a reaction
messageSchema.methods.removeReaction = async function(emoji, userId) {
  // Filter out the reaction
  this.reactions = this.reactions.filter(
    reaction => !(reaction.emoji === emoji && reaction.user_id.toString() === userId.toString())
  );
  
  return this.save();
};

// Virtual for thread replies count
messageSchema.virtual('reply_count').get(function() {
  return this._replyCount || 0;
});

// Virtual for reactions count
messageSchema.virtual('reactions_count').get(function() {
  return this.reactions.length;
});

messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 