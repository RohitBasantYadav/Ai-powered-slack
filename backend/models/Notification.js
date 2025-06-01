const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient user ID is required']
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender user ID is required']
  },
  type: {
    type: String,
    enum: ['mention', 'message', 'reply', 'channel_invite'],
    required: [true, 'Notification type is required']
  },
  message_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  channel_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    default: null
  },
  content: {
    type: String,
    required: [true, 'Notification content is required']
  },
  is_read: {
    type: Boolean,
    default: false
  },
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

// Create index for better performance
notificationSchema.index({ recipient_id: 1, is_read: 1, created_at: -1 });

// Create TTL index for notification expiry (7 days)
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 604800 }); // 7 days

// Static method to create a notification
notificationSchema.statics.createNotification = async function(data) {
  return await this.create(data);
};

// Static method to mark notifications as read
notificationSchema.statics.markAsRead = async function(recipientId, notificationIds = []) {
  const filter = { recipient_id: recipientId };
  
  if (notificationIds.length > 0) {
    filter._id = { $in: notificationIds };
  }
  
  return await this.updateMany(filter, { is_read: true });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification; 