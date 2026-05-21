// models/Content.js - Content Schema (Posts, Videos, Articles)
const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  // Basic Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['post', 'video', 'image', 'article', 'link', 'story', 'reel', 'live'],
    required: true
  },
  
  // Content
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    maxlength: 50000
  },
  excerpt: {
    type: String,
    maxlength: 500
  },
  
  // Media
  mediaUrls: [{
    url: String,
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document']
    },
    size: Number,
    width: Number,
    height: Number,
    thumbnail: String
  }],
  thumbnail: String,
  
  // Links
  link: {
    url: String,
    title: String,
    description: String,
    image: String,
    domain: String
  },
  
  // Metadata
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    index: true
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true,
    index: true
  }],
  location: {
    name: String,
    lat: Number,
    lng: Number,
    placeId: String
  },
  
  // Privacy & Settings
  privacy: {
    type: String,
    enum: ['public', 'friends', 'only_me', 'custom'],
    default: 'public'
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isAdult: {
    type: Boolean,
    default: false
  },
  isSensitive: {
    type: Boolean,
    default: false
  },
  allowComments: {
    type: Boolean,
    default: true
  },
  allowSharing: {
    type: Boolean,
    default: true
  },
  
  // Statistics
  stats: {
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reports: { type: Number, default: 0 }
  },
  
  // Engagement
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reportedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'deleted', 'flagged'],
    default: 'published'
  },
  publishedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  scheduledAt: Date,
  expiresAt: Date,
  
  // For stories/reels (24h expiry)
  isExpiring: { type: Boolean, default: false },
  expiresIn: { type: Number, default: 86400 }, // seconds
  
  // Versioning
  version: { type: Number, default: 1 },
  editHistory: [{
    content: String,
    editedAt: { type: Date, default: Date.now },
    editorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Source
  source: {
    platform: String,
    originalId: String,
    importedAt: Date
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
contentSchema.index({ userId: 1, createdAt: -1 });
contentSchema.index({ hashtags: 1, createdAt: -1 });
contentSchema.index({ tags: 1 });
contentSchema.index({ 'stats.views': -1 });
contentSchema.index({ 'stats.likes': -1 });
contentSchema.index({ publishedAt: -1 });
contentSchema.index({ type: 1, createdAt: -1 });
contentSchema.index({ title: 'text', content: 'text', tags: 'text' });

// Text search
contentSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
  hashtags: 'text'
}, {
  weights: {
    title: 10,
    tags: 5,
    hashtags: 3,
    content: 1
  }
});

// Virtuals
contentSchema.virtual('url').get(function() {
  return `/content/${this._id}`;
});

contentSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

contentSchema.virtual('isTrending').get(function() {
  const hourInMs = 60 * 60 * 1000;
  const age = Date.now() - new Date(this.publishedAt).getTime();
  const score = (this.stats.likes * 2 + this.stats.comments * 3 + this.stats.shares * 5) / (age / hourInMs + 1);
  return score > 100;
});

// Methods
contentSchema.methods.incrementView = async function() {
  this.stats.views += 1;
  await this.save();
};

contentSchema.methods.like = async function(userId) {
  if (!this.likedBy.includes(userId)) {
    this.likedBy.push(userId);
    this.stats.likes += 1;
    await this.save();
    return true;
  }
  return false;
};

contentSchema.methods.unlike = async function(userId) {
  const index = this.likedBy.indexOf(userId);
  if (index > -1) {
    this.likedBy.splice(index, 1);
    this.stats.likes -= 1;
    await this.save();
    return true;
  }
  return false;
};

contentSchema.methods.save = async function(userId) {
  if (!this.savedBy.includes(userId)) {
    this.savedBy.push(userId);
    this.stats.saves += 1;
    await this.save();
    return true;
  }
  return false;
};

contentSchema.methods.report = async function(userId, reason) {
  this.reportedBy.push({ user: userId, reason });
  this.stats.reports += 1;
  
  if (this.stats.reports >= 10) {
    this.status = 'flagged';
  }
  
  await this.save();
};

// Static methods
contentSchema.statics.getTrending = function(limit = 20) {
  const hourInMs = 60 * 60 * 1000;
  return this.aggregate([
    {
      $match: {
        status: 'published',
        publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $addFields: {
        ageHours: {
          $divide: [
            { $subtract: [new Date(), '$publishedAt'] },
            hourInMs
          ]
        },
        trendingScore: {
          $add: [
            { $multiply: ['$stats.likes', 2] },
            { $multiply: ['$stats.comments', 3] },
            { $multiply: ['$stats.shares', 5] },
            { $multiply: ['$stats.views', 1] }
          ]
        }
      }
    },
    {
      $addFields: {
        finalScore: {
          $divide: ['$trendingScore', { $add: ['$ageHours', 1] }]
        }
      }
    },
    { $sort: { finalScore: -1 } },
    { $limit: limit }
  ]);
};

contentSchema.statics.getForHashtag = function(hashtag, limit = 50) {
  return this.find({
    hashtags: hashtag.toLowerCase(),
    status: 'published'
  }).sort({ createdAt: -1 }).limit(limit);
};

contentSchema.statics.getForUser = function(userId, limit = 50) {
  return this.find({
    userId,
    status: { $ne: 'deleted' }
  }).sort({ createdAt: -1 }).limit(limit);
};

const Content = mongoose.model('Content', contentSchema);

module.exports = Content;
