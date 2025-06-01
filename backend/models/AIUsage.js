const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  date: {
    type: Date,
    default: Date.now
  },
  request_count: {
    type: Number,
    default: 0
  },
  feature_type: {
    type: String,
    enum: ['reply', 'tone', 'summary', 'orgbrain'],
    required: [true, 'Feature type is required']
  }
});

// Create index for better performance
aiUsageSchema.index({ user_id: 1, date: 1 });

// Static method to check if user has reached daily limit
aiUsageSchema.statics.hasReachedDailyLimit = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const totalUsage = await this.aggregate([
    {
      $match: {
        user_id: mongoose.Types.ObjectId(userId),
        date: {
          $gte: today,
          $lt: tomorrow
        }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$request_count' }
      }
    }
  ]);
  
  const limit = parseInt(process.env.AI_RATE_LIMIT) || 20;
  return totalUsage.length > 0 && totalUsage[0].total >= limit;
};

// Static method to increment usage count
aiUsageSchema.statics.trackUsage = async function(userId, featureType) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find or create usage record for today
  const usage = await this.findOne({
    user_id: userId,
    feature_type: featureType,
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    }
  });
  
  if (usage) {
    usage.request_count += 1;
    await usage.save();
    return usage;
  } else {
    return await this.create({
      user_id: userId,
      feature_type: featureType,
      request_count: 1,
      date: new Date()
    });
  }
};

const AIUsage = mongoose.model('AIUsage', aiUsageSchema);

module.exports = AIUsage; 