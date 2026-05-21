// middleware/rateLimit.js - Advanced Rate Limiting
const rateLimit = require('express-rate-limit');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const { getRedisManager } = require('../config/redis');

let rateLimiterRedis = null;

// Initialize Redis rate limiter
const initRedisRateLimiter = async () => {
  const redisManager = getRedisManager();
  const redisClient = redisManager.client;
  
  rateLimiterRedis = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl',
    points: 100, // Number of points
    duration: 60, // Per 60 seconds
    blockDuration: 60 * 5 // Block for 5 minutes if exceeded
  });
  
  return rateLimiterRedis;
};

// Express rate limit middleware
const expressRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Stricter rate limit for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT'
  },
  skipSuccessfulRequests: true
});

// Browser rate limit
const browserRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Browser rate limit exceeded. Slow down!',
    code: 'BROWSER_RATE_LIMIT'
  }
});

// Search rate limit
const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: 'Search limit exceeded. Please wait a moment.',
    code: 'SEARCH_RATE_LIMIT'
  }
});

// Download rate limit
const downloadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Download limit exceeded. Too many downloads.',
    code: 'DOWNLOAD_RATE_LIMIT'
  }
});

// API rate limit
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: 'API rate limit exceeded',
    code: 'API_RATE_LIMIT'
  }
});

// Flexible rate limiter for authenticated users
const flexibleRateLimiter = async (req, res, next) => {
  if (!rateLimiterRedis) {
    await initRedisRateLimiter();
  }
  
  try {
    let key = req.ip;
    let points = 100;
    
    // Different limits for authenticated users
    if (req.user) {
      key = `user:${req.user.id}`;
      points = 500; // Higher limit for authenticated users
      
      // Premium users get even higher limits
      if (req.user.subscription?.plan === 'pro') {
        points = 2000;
      } else if (req.user.subscription?.plan === 'enterprise') {
        points = 10000;
      }
    }
    
    await rateLimiterRedis.consume(key, 1);
    next();
  } catch (rejRes) {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
    });
  }
};

// IP-based rate limiter
const ipRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
  message: {
    success: false,
    error: 'Too many requests from this IP',
    code: 'IP_RATE_LIMIT'
  }
});

// Path-specific rate limiter
const createPathRateLimiter = (path, windowMs, max) => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      return `${path}:${req.ip}`;
    },
    skip: (req) => {
      // Skip rate limiting for authenticated premium users
      if (req.user && req.user.subscription?.plan === 'enterprise') {
        return true;
      }
      return false;
    },
    message: {
      success: false,
      error: `Rate limit exceeded for ${path}`,
      code: 'PATH_RATE_LIMIT'
    }
  });
};

module.exports = {
  expressRateLimiter,
  authRateLimiter,
  browserRateLimiter,
  searchRateLimiter,
  downloadRateLimiter,
  apiRateLimiter,
  flexibleRateLimiter,
  ipRateLimiter,
  createPathRateLimiter,
  initRedisRateLimiter
};
