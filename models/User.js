// models/User.js - User Schema (Full)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic Information
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_]+$/
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Profile Information
  fullName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  avatar: {
    type: String,
    default: '/assets/default-avatar.png'
  },
  coverPhoto: String,
  bio: {
    type: String,
    maxlength: 500
  },
  location: String,
  website: String,
  birthDate: Date,
  phoneNumber: {
    type: String,
    match: /^(\+255|0)[67]\d{8}$/
  },
  
  // Social Links
  socialLinks: {
    twitter: String,
    facebook: String,
    instagram: String,
    youtube: String,
    github: String,
    linkedin: String,
    tiktok: String,
    telegram: String,
    whatsapp: String
  },
  
  // Account Status
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin', 'superadmin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned', 'deleted'],
    default: 'active'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  
  // Preferences
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'Africa/Dar_es_Salaam'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      browser: { type: Boolean, default: true }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public'
      },
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: false }
    },
    safeSearch: {
      type: Boolean,
      default: false
    },
    adultContent: {
      type: Boolean,
      default: true
    }
  },
  
  // Security
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  backupCodes: [String],
  apiKeys: [{
    key: String,
    name: String,
    createdAt: Date,
    lastUsed: Date,
    expiresAt: Date
  }],
  
  // Session Management
  sessions: [{
    token: String,
    device: String,
    browser: String,
    os: String,
    ip: String,
    location: String,
    lastActive: Date,
    createdAt: Date
  }],
  
  // Statistics
  stats: {
    posts: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    searches: { type: Number, default: 0 },
    loginCount: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 } // in seconds
  },
  
  // Subscription
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    autoRenew: { type: Boolean, default: false },
    paymentMethod: String,
    paymentId: String
  },
  
  // Storage
  storageUsed: {
    type: Number,
    default: 0 // in bytes
  },
  storageLimit: {
    type: Number,
    default: 1024 * 1024 * 1024 // 1GB for free users
  },
  
  // Verification Tokens
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Timestamps
  lastLogin: Date,
  lastActive: Date,
  lastIP: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'stats.followers': -1 });
userSchema.index({ 'subscription.plan': 1 });
userSchema.index({ 'preferences.language': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = token;
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

// Generate API key
userSchema.methods.generateApiKey = function(name) {
  const key = crypto.randomBytes(32).toString('hex');
  this.apiKeys.push({
    key: crypto.createHash('sha256').update(key).digest('hex'),
    name: name,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  });
  return key; // Return raw key (store only hash)
};

// Verify API key
userSchema.methods.verifyApiKey = function(rawKey) {
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
  const apiKey = this.apiKeys.find(k => k.key === hashedKey && k.expiresAt > new Date());
  if (apiKey) {
    apiKey.lastUsed = new Date();
    return true;
  }
  return false;
};

// To JSON transform
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    delete ret.emailVerificationToken;
    delete ret.emailVerificationExpires;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.twoFactorSecret;
    delete ret.backupCodes;
    delete ret.apiKeys;
    return ret;
  }
});

// Static methods
userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier.toLowerCase() }
    ]
  });
};

userSchema.statics.getActiveUsers = function(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return this.find({
    lastActive: { $gte: since },
    status: 'active'
  }).countDocuments();
};

userSchema.statics.getNewUsers = function(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return this.find({
    createdAt: { $gte: since }
  }).countDocuments();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
