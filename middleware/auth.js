// middleware/auth.js - Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getRedisManager } = require('../config/redis');

const redisManager = getRedisManager();

// Verify JWT token
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zass-secret');
    
    // Check if token is blacklisted
    const isBlacklisted = await redisManager.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
};

// Main authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header or cookie
    let token = req.headers.authorization?.split(' ')[1];
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }
    
    const decoded = await verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Account is ${user.status}`,
        code: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Update last active
    user.lastActive = new Date();
    await user.save();
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Optional auth (doesn't require authentication)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.split(' ')[1];
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }
    
    if (token) {
      const decoded = await verifyToken(token);
      if (decoded) {
        const user = await User.findById(decoded.id).select('-password');
        if (user && user.status === 'active') {
          req.user = user;
        }
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

// Role-based middleware
const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    next();
  };
};

// Owner or admin middleware
const ownerOrAdminMiddleware = (getResourceUserId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }
    
    const resourceUserId = typeof getResourceUserId === 'function'
      ? await getResourceUserId(req)
      : getResourceUserId;
    
    if (req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.id === resourceUserId) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'You do not own this resource',
        code: 'NOT_OWNER'
      });
    }
  };
};

// Rate limit per user middleware
const userRateLimitMiddleware = (limit, windowMs) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requests.has(userId)) {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId).filter(t => t > windowStart);
    
    if (userRequests.length >= limit) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Max ${limit} requests per ${windowMs / 1000} seconds`,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    userRequests.push(now);
    requests.set(userId, userRequests);
    next();
  };
};

// Blacklist token (logout)
const blacklistToken = async (token, expiresIn = 86400) => {
  try {
    await redisManager.set(`blacklist:${token}`, 'true', expiresIn);
    return true;
  } catch (error) {
    console.error('Blacklist token error:', error);
    return false;
  }
};

// Generate JWT token
const generateToken = (user, expiresIn = '30d') => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET || 'zass-secret',
    { expiresIn }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      type: 'refresh'
    },
    process.env.JWT_SECRET || 'zass-secret',
    { expiresIn: '90d' }
  );
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  roleMiddleware,
  ownerOrAdminMiddleware,
  userRateLimitMiddleware,
  blacklistToken,
  generateToken,
  generateRefreshToken,
  verifyToken
};
