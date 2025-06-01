const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
  },
  password_hash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false // Don't return password in queries by default
  },
  display_name: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    minlength: [2, 'Display name must be at least 2 characters'],
    maxlength: [50, 'Display name cannot exceed 50 characters']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [200, 'Bio cannot exceed 200 characters']
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  is_online: {
    type: Boolean,
    default: false
  },
  last_seen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { 
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password_hash')) return next();
  
  try {
    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password_hash);
};

// Make first user an admin
userSchema.pre('save', async function(next) {
  // Check if this is the first user
  if (this.isNew) {
    const count = await mongoose.models.User.countDocuments();
    if (count === 0) {
      this.role = 'admin';
    }
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User; 