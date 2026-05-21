// middleware/security.js - Advanced Security Middleware
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const xss = require('xss');
const crypto = require('crypto');
const { getRedisManager } = require('../config/redis');

let rateLimiterRedis = null;
const redisManager = getRedisManager();

// Initialize Redis rate limiter
const initRateLimiter = async () => {
  if (!rateLimiterRedis) {
    rateLimiterRedis = new RateLimiterRedis({
      storeClient: redisManager.client,
      keyPrefix: 'rl',
      points: 100,
      duration: 60,
      blockDuration: 60 * 5
    });
  }
  return rateLimiterRedis;
};

// Advanced rate limiter by IP
const ipRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests from this IP', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiter for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts', code: 'AUTH_RATE_LIMIT' }
});

// Rate limiter for API endpoints
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'API rate limit exceeded', code: 'API_RATE_LIMIT' }
});

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key].trim());
      }
    }
  }
  if (req.query) {
    for (let key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key].trim());
      }
    }
  }
  next();
};

// CSRF Protection
const csrfProtection = (req, res, next) => {
  const token = req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;
  
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    if (!token || token !== sessionToken) {
      return res.status(403).json({ error: 'Invalid CSRF token', code: 'CSRF_INVALID' });
    }
  }
  next();
};

// Generate CSRF token
const generateCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};

// Security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
});

// Request validation
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message, code: 'VALIDATION_ERROR' });
    }
    next();
  };
};

// SQL Injection prevention
const preventSqlInjection = (req, res, next) => {
  const sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|UNION|JOIN|WHERE|FROM|INTO)\b)|(--|;|\|\||&&)/gi;
  
  const checkValue = (value) => {
    if (typeof value === 'string' && sqlPattern.test(value)) {
      return true;
    }
    return false;
  };
  
  if (req.body) {
    for (let key in req.body) {
      if (checkValue(req.body[key])) {
        return res.status(400).json({ error: 'Invalid input detected', code: 'SQL_INJECTION_ATTEMPT' });
      }
    }
  }
  
  if (req.query) {
    for (let key in req.query) {
      if (checkValue(req.query[key])) {
        return res.status(400).json({ error: 'Invalid input detected', code: 'SQL_INJECTION_ATTEMPT' });
      }
    }
  }
  
  next();
};

// Bot detection
const botDetection = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const botPatterns = /bot|crawler|spider|scraper|headless|selenium|puppeteer|playwright/i;
  
  if (botPatterns.test(userAgent)) {
    req.isBot = true;
    // Optional: log bot requests
  }
  next();
};

// Device fingerprinting
const deviceFingerprint = (req, res, next) => {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    acceptLanguage: req.headers['accept-language'],
    acceptEncoding: req.headers['accept-encoding']
  })).digest('hex');
  
  req.deviceFingerprint = fingerprint;
  next();
};

// Request logging with sensitive data masking
const secureLogging = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?._id
    };
    
    // Don't log sensitive endpoints fully
    if (req.url.includes('/auth/') || req.url.includes('/payment/')) {
      logData.sensitive = true;
    }
    
    console.log(JSON.stringify(logData));
  });
  
  next();
};

// Session security
const sessionSecurity = (req, res, next) => {
  if (req.session) {
    // Regenerate session ID periodically
    if (req.session.lastRegeneration && (Date.now() - req.session.lastRegeneration) > 3600000) {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.lastRegeneration = Date.now();
        next();
      });
    } else if (!req.session.lastRegeneration) {
      req.session.lastRegeneration = Date.now();
      next();
    } else {
      next();
    }
  } else {
    next();
  }
};

// Two-factor authentication middleware
const twoFactorMiddleware = async (req, res, next) => {
  if (req.user && req.user.twoFactorEnabled && !req.session.twoFactorVerified) {
    const path = req.path;
    if (!path.includes('/auth/2fa') && !path.includes('/auth/logout')) {
      return res.status(403).json({
        error: 'Two-factor authentication required',
        code: '2FA_REQUIRED',
        redirect: '/auth/2fa/verify'
      });
    }
  }
  next();
};

// IP whitelisting for admin routes
const ipWhitelist = (allowedIPs) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) return next();
    
    const clientIP = req.ip || req.connection.remoteAddress;
    if (allowedIPs.includes(clientIP)) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied from this IP', code: 'IP_NOT_ALLOWED' });
    }
  };
};

module.exports = {
  ipRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  sanitizeInput,
  csrfProtection,
  generateCsrfToken,
  securityHeaders,
  validateRequest,
  preventSqlInjection,
  botDetection,
  deviceFingerprint,
  secureLogging,
  sessionSecurity,
  twoFactorMiddleware,
  ipWhitelist,
  initRateLimiter
};
