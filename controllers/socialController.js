// controllers/socialController.js - Social Media Feed Controller
const Content = require('../models/Content');
const User = require('../models/User');
const { getRedisManager } = require('../config/redis');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/social.log' })
  ]
});

const redisManager = getRedisManager();

// Get user feed
exports.getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = { status: 'published' };
    
    if (type !== 'all') {
      query.type = type;
    }
    
    // Check cache
    const cacheKey = `feed:${req.user?._id || 'public'}:${type}:${page}`;
    const cached = await redisManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    let posts = await Content.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'username fullName avatar');
    
    // Get user's following for personalized feed
    if (req.user) {
      const user = await User.findById(req.user._id);
      const following = user.stats?.following || [];
      // Prioritize posts from followed users
      posts = posts.sort((a, b) => {
        if (following.includes(a.userId?._id) && !following.includes(b.userId?._id)) return -1;
        if (!following.includes(a.userId?._id) && following.includes(b.userId?._id)) return 1;
        return 0;
      });
    }
    
    const total = await Content.countDocuments(query);
    
    const result = {
      success: true,
      posts: posts.map(post => ({
        id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        thumbnail: post.thumbnail,
        tags: post.tags,
        hashtags: post.hashtags,
        location: post.location,
        stats: post.stats,
        isAdult: post.isAdult,
        user: post.userId,
        createdAt: post.createdAt,
        likedByUser: req.user ? post.likedBy.includes(req.user._id) : false,
        savedByUser: req.user ? post.savedBy.includes(req.user._id) : false
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
    
    await redisManager.set(cacheKey, result, 60); // Cache for 1 minute
    
    res.json(result);
  } catch (error) {
    logger.error('Get feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create post
exports.createPost = async (req, res) => {
  try {
    const { type, title, content, mediaUrls, thumbnail, tags, hashtags, location, privacy, isAdult } = req.body;
    
    const post = new Content({
      userId: req.user._id,
      type: type || 'post',
      title,
      content,
      mediaUrls: mediaUrls || [],
      thumbnail,
      tags: tags || [],
      hashtags: (hashtags || []).map(h => h.toLowerCase()),
      location,
      privacy: privacy || 'public',
      isAdult: isAdult || false,
      publishedAt: new Date()
    });
    
    await post.save();
    
    // Update user stats
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.posts': 1 } });
    
    // Invalidate feed cache
    await redisManager.delPattern('feed:*');
    
    res.status(201).json({
      success: true,
      post: {
        id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        createdAt: post.createdAt
      }
    });
  } catch (error) {
    logger.error('Create post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update post
exports.updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, mediaUrls, thumbnail, tags, hashtags, privacy } = req.body;
    
    const post = await Content.findOne({ _id: id, userId: req.user._id });
    if (!post) {
      return res.status(404).json({ error: 'Post not found or not yours' });
    }
    
    if (title) post.title = title;
    if (content) post.content = content;
    if (mediaUrls) post.mediaUrls = mediaUrls;
    if (thumbnail) post.thumbnail = thumbnail;
    if (tags) post.tags = tags;
    if (hashtags) post.hashtags = hashtags.map(h => h.toLowerCase());
    if (privacy) post.privacy = privacy;
    
    post.editHistory.push({
      content: content,
      editedAt: new Date(),
      editorId: req.user._id
    });
    post.version += 1;
    post.updatedAt = new Date();
    
    await post.save();
    
    // Invalidate caches
    await redisManager.delPattern('feed:*');
    
    res.json({ success: true, post });
  } catch (error) {
    logger.error('Update post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete post
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findOne({ _id: id, userId: req.user._id });
    if (!post) {
      return res.status(404).json({ error: 'Post not found or not yours' });
    }
    
    post.status = 'deleted';
    await post.save();
    
    // Update user stats
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.posts': -1 } });
    
    // Invalidate caches
    await redisManager.delPattern('feed:*');
    
    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    logger.error('Delete post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single post
exports.getPost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findOne({ _id: id, status: 'published' })
      .populate('userId', 'username fullName avatar stats');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Increment view count
    await post.incrementView();
    
    res.json({
      success: true,
      post: {
        id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        thumbnail: post.thumbnail,
        tags: post.tags,
        hashtags: post.hashtags,
        location: post.location,
        stats: post.stats,
        user: post.userId,
        createdAt: post.createdAt,
        likedByUser: req.user ? post.likedBy.includes(req.user._id) : false,
        savedByUser: req.user ? post.savedBy.includes(req.user._id) : false
      }
    });
  } catch (error) {
    logger.error('Get post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Like post
exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const liked = await post.like(req.user._id);
    
    if (liked) {
      // Create notification
      if (post.userId.toString() !== req.user._id.toString()) {
        await createNotification({
          userId: post.userId,
          type: 'like',
          fromUser: req.user._id,
          contentId: post._id,
          content: `${req.user.username} liked your post`
        });
      }
    }
    
    res.json({ success: true, liked, likesCount: post.stats.likes });
  } catch (error) {
    logger.error('Like post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Unlike post
exports.unlikePost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const unliked = await post.unlike(req.user._id);
    
    res.json({ success: true, unliked, likesCount: post.stats.likes });
  } catch (error) {
    logger.error('Unlike post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Share post
exports.sharePost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    post.stats.shares += 1;
    await post.save();
    
    res.json({ success: true, sharesCount: post.stats.shares });
  } catch (error) {
    logger.error('Share post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add comment
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    
    if (!comment || comment.length > 1000) {
      return res.status(400).json({ error: 'Invalid comment' });
    }
    
    const post = await Content.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // For simplicity, storing comments in a separate collection would be better
    // This is a simplified version
    post.stats.comments += 1;
    await post.save();
    
    // Create notification
    if (post.userId.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: post.userId,
        type: 'comment',
        fromUser: req.user._id,
        contentId: post._id,
        content: `${req.user.username} commented on your post: ${comment.substring(0, 100)}`
      });
    }
    
    res.status(201).json({
      success: true,
      comment: {
        id: Date.now(),
        text: comment,
        user: {
          id: req.user._id,
          username: req.user.username,
          avatar: req.user.avatar
        },
        createdAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Add comment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete comment
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await Content.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    post.stats.comments = Math.max(0, post.stats.comments - 1);
    await post.save();
    
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    logger.error('Delete comment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Follow user
exports.followUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    const userToFollow = await User.findById(id);
    if (!userToFollow) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser.stats.following.includes(id)) {
      currentUser.stats.following.push(id);
      userToFollow.stats.followers.push(req.user._id);
      
      await currentUser.save();
      await userToFollow.save();
      
      // Create notification
      await createNotification({
        userId: userToFollow._id,
        type: 'follow',
        fromUser: req.user._id,
        content: `${req.user.username} started following you`
      });
    }
    
    res.json({
      success: true,
      following: true,
      followersCount: userToFollow.stats.followers.length
    });
  } catch (error) {
    logger.error('Follow user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Unfollow user
exports.unfollowUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const currentUser = await User.findById(req.user._id);
    const userToUnfollow = await User.findById(id);
    
    if (!userToUnfollow) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    currentUser.stats.following = currentUser.stats.following.filter(
      uid => uid.toString() !== id
    );
    userToUnfollow.stats.followers = userToUnfollow.stats.followers.filter(
      uid => uid.toString() !== req.user._id.toString()
    );
    
    await currentUser.save();
    await userToUnfollow.save();
    
    res.json({
      success: true,
      following: false,
      followersCount: userToUnfollow.stats.followers.length
    });
  } catch (error) {
    logger.error('Unfollow user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .select('-password -sessions -apiKeys -twoFactorSecret -backupCodes');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's posts
    const posts = await Content.find({ userId: user._id, status: 'published' })
      .sort({ createdAt: -1 })
      .limit(20);
    
    // Check if current user follows this user
    let isFollowing = false;
    if (req.user) {
      const currentUser = await User.findById(req.user._id);
      isFollowing = currentUser.stats.following.includes(user._id);
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        avatar: user.avatar,
        coverPhoto: user.coverPhoto,
        location: user.location,
        website: user.website,
        stats: user.stats,
        createdAt: user.createdAt,
        isFollowing
      },
      posts: posts.map(post => ({
        id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        thumbnail: post.thumbnail,
        stats: post.stats,
        createdAt: post.createdAt
      }))
    });
  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get trending content
exports.getTrending = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Check cache
    const cacheKey = 'trending:content';
    const cached = await redisManager.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const trending = await Content.getTrending(parseInt(limit));
    
    const result = {
      success: true,
      trending: trending.map(post => ({
        id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        stats: post.stats,
        user: post.userId,
        createdAt: post.createdAt,
        trendingScore: post.finalScore
      }))
    };
    
    await redisManager.set(cacheKey, result, 1800); // Cache for 30 minutes
    
    res.json(result);
  } catch (error) {
    logger.error('Get trending error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get hashtag feed
exports.getHashtagFeed = async (req, res) => {
  try {
    const { tag, limit = 50 } = req.params;
    
    const posts = await Content.getForHashtag(tag, parseInt(limit));
    
    res.json({
      success: true,
      hashtag: tag,
      posts: posts.map(post => ({
        id: post._id,
        title: post.title,
        content: post.content,
        mediaUrls: post.mediaUrls,
        stats: post.stats,
        user: post.userId,
        createdAt: post.createdAt
      }))
    });
  } catch (error) {
    logger.error('Get hashtag feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get user suggestions
exports.getSuggestions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const currentUser = await User.findById(req.user._id);
    const following = currentUser.stats.following || [];
    
    // Find users not followed
    const suggestions = await User.find({
      _id: { $nin: [...following, req.user._id] },
      status: 'active'
    })
      .sort({ 'stats.followers': -1 })
      .limit(parseInt(limit))
      .select('username fullName avatar stats');
    
    res.json({
      success: true,
      suggestions: suggestions.map(user => ({
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar,
        followersCount: user.stats.followers.length
      }))
    });
  } catch (error) {
    logger.error('Get suggestions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to create notification
async function createNotification(data) {
  try {
    const Notification = require('../models/Notification');
    const notification = new Notification(data);
    await notification.save();
    
    // Emit via WebSocket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${data.userId}`).emit('notification', notification);
    }
  } catch (error) {
    logger.error('Create notification error:', error);
  }
}
