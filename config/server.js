// server.js - ZASS Mega Ecosystem Main Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');

// Import configurations
const CONSTANTS = require('./config/constants');
const { connectDatabases } = require('./config/database');
const { initRedis } = require('./config/redis');

// Enterprise Middleware
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const passport = require('passport');

// Database
const mongoose = require('mongoose');
const { Pool } = require('pg');

// Queue System
const Queue = require('bull');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// WebSocket
const socketIo = require('socket.io');

// GraphQL
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');

// AI & ML
const tf = require('@tensorflow/tfjs-node');
const natural = require('natural');
const { OpenAI } = require('openai');

// Monitoring
const promClient = require('prom-client');
const Sentry = require('@sentry/node');
const winston = require('winston');

// Custom middleware
const { authMiddleware, roleMiddleware } = require('./middleware/auth');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');

// Controllers
const authController = require('./controllers/authController');
const browserController = require('./controllers/browserController');
const searchController = require('./controllers/searchController');
const mediaController = require('./controllers/mediaController');
const socialController = require('./controllers/socialController');
const chatController = require('./controllers/chatController');
const fileController = require('./controllers/fileController');
const adminController = require('./controllers/adminController');

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ============ INITIALIZATION ============
const PORT = process.env.PORT || 16232;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Initialize Sentry for error tracking
if (isProd) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: NODE_ENV,
    tracesSampleRate: 1.0
  });
}

// Setup Logger
const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.prettyPrint()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// ============ DATABASE CONNECTION ============
connectDatabases().catch(err => {
  logger.error('Database connection failed:', err);
  process.exit(1);
});

// Redis Client
const redisClient = initRedis();

// ============ MIDDLEWARE ============

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
app.use(cors({
  origin: CONSTANTS.SECURITY.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: CONSTANTS.SERVER.MAX_PAYLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: CONSTANTS.SERVER.MAX_PAYLOAD_SIZE }));
app.use(express.static('public', { maxAge: '1d' }));

// Session
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    maxAge: CONSTANTS.AUTH.SESSION_MAX_AGE,
    sameSite: 'lax'
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Rate Limiting
app.use(rateLimitMiddleware);

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path || req.path, res.statusCode).observe(duration);
  });
  next();
});

// ============ GRAPHQL SCHEMA ============
const graphqlSchema = buildSchema(`
  type User {
    id: ID!
    username: String!
    email: String!
    fullName: String
    avatar: String
    role: String
    createdAt: String
  }
  
  type Content {
    id: ID!
    title: String
    content: String
    type: String
    likes: Int
    views: Int
    createdAt: String
  }
  
  type Query {
    getUser(id: ID!): User
    getUsers(limit: Int): [User]
    searchContent(query: String!): [Content]
    getTrending: [Content]
  }
  
  type Mutation {
    createUser(username: String!, email: String!, password: String!): User
    updateUser(id: ID!, fullName: String, avatar: String): User
    deleteUser(id: ID!): Boolean
    createContent(title: String, content: String, type: String): Content
    likeContent(id: ID!): Content
  }
`);

const graphqlRoot = {
  getUser: async ({ id }) => {
    return await User.findById(id);
  },
  getUsers: async ({ limit = 10 }) => {
    return await User.find().limit(limit);
  },
  searchContent: async ({ query }) => {
    return await Content.find({ $text: { $search: query } }).limit(20);
  },
  createUser: async ({ username, email, password }) => {
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    return user;
  }
};

app.use('/graphql', graphqlHTTP({
  schema: graphqlSchema,
  rootValue: graphqlRoot,
  graphiql: !isProd
}));

// ============ QUEUE SYSTEM ============
const browserQueue = new Queue('browser', process.env.REDIS_URL);
const downloadQueue = new Queue('download', process.env.REDIS_URL);
const emailQueue = new Queue('email', process.env.REDIS_URL);
const videoQueue = new Queue('video', process.env.REDIS_URL);
const scrapingQueue = new Queue('scraping', process.env.REDIS_URL);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(browserQueue),
    new BullAdapter(downloadQueue),
    new BullAdapter(emailQueue),
    new BullAdapter(videoQueue),
    new BullAdapter(scrapingQueue)
  ],
  serverAdapter: serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());

// ============ API ROUTES ============

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: CONSTANTS.SYSTEM.VERSION,
    environment: NODE_ENV
  });
});

app.get('/ready', async (req, res) => {
  const checks = {
    mongodb: mongoose.connection.readyState === 1,
    redis: redisClient.isOpen,
    server: true
  };
  
  const allReady = Object.values(checks).every(v => v === true);
  
  if (allReady) {
    res.json({ ready: true, checks });
  } else {
    res.status(503).json({ ready: false, checks });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// ============ AUTH ROUTES ============
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/logout', authMiddleware, authController.logout);
app.post('/api/auth/refresh', authController.refreshToken);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', authController.resetPassword);
app.post('/api/auth/verify-email/:token', authController.verifyEmail);
app.get('/api/auth/me', authMiddleware, authController.getMe);
app.put('/api/auth/me', authMiddleware, authController.updateMe);
app.put('/api/auth/change-password', authMiddleware, authController.changePassword);
app.post('/api/auth/change-email', authMiddleware, authController.changeEmail);
app.post('/api/auth/2fa/enable', authMiddleware, authController.enable2FA);
app.post('/api/auth/2fa/verify', authMiddleware, authController.verify2FA);
app.post('/api/auth/2fa/disable', authMiddleware, authController.disable2FA);

// Social login
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), authController.socialLogin);
app.get('/api/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
app.get('/api/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login' }), authController.socialLogin);
app.get('/api/auth/twitter', passport.authenticate('twitter'));
app.get('/api/auth/twitter/callback', passport.authenticate('twitter', { failureRedirect: '/login' }), authController.socialLogin);
app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/api/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), authController.socialLogin);

// ============ BROWSER ROUTES ============
app.get('/api/browser/browse', authMiddleware, browserController.browse);
app.post('/api/browser/browse', authMiddleware, browserController.browsePost);
app.get('/api/browser/screenshot', authMiddleware, browserController.screenshot);
app.get('/api/browser/pdf', authMiddleware, browserController.generatePDF);
app.post('/api/browser/execute', authMiddleware, browserController.executeScript);
app.get('/api/browser/history', authMiddleware, browserController.getHistory);
app.post('/api/browser/history', authMiddleware, browserController.saveHistory);
app.delete('/api/browser/history/:id', authMiddleware, browserController.deleteHistory);
app.get('/api/browser/bookmarks', authMiddleware, browserController.getBookmarks);
app.post('/api/browser/bookmarks', authMiddleware, browserController.addBookmark);
app.delete('/api/browser/bookmarks/:id', authMiddleware, browserController.deleteBookmark);
app.get('/api/browser/downloads', authMiddleware, browserController.getDownloads);
app.post('/api/browser/download', authMiddleware, browserController.downloadFile);
app.get('/api/browser/cookies', authMiddleware, browserController.getCookies);
app.post('/api/browser/cookies', authMiddleware, browserController.setCookies);
app.delete('/api/browser/cookies', authMiddleware, browserController.clearCookies);
app.get('/api/browser/local-storage', authMiddleware, browserController.getLocalStorage);
app.post('/api/browser/local-storage', authMiddleware, browserController.setLocalStorage);

// ============ SEARCH ROUTES ============
app.get('/api/search/web', authMiddleware, searchController.webSearch);
app.get('/api/search/images', authMiddleware, searchController.imageSearch);
app.get('/api/search/videos', authMiddleware, searchController.videoSearch);
app.get('/api/search/news', authMiddleware, searchController.newsSearch);
app.get('/api/search/maps', authMiddleware, searchController.mapSearch);
app.get('/api/search/shopping', authMiddleware, searchController.shoppingSearch);
app.get('/api/search/suggest', authMiddleware, searchController.getSuggestions);
app.get('/api/search/trending', authMiddleware, searchController.getTrending);
app.get('/api/search/ai', authMiddleware, searchController.aiSearch);
app.get('/api/search/voice', authMiddleware, searchController.voiceSearch);
app.post('/api/search/image', authMiddleware, searchController.reverseImageSearch);
app.get('/api/search/similar', authMiddleware, searchController.findSimilar);
app.get('/api/search/related', authMiddleware, searchController.getRelated);

// ============ MEDIA ROUTES ============
app.get('/api/media/info', authMiddleware, mediaController.getMediaInfo);
app.get('/api/media/download', authMiddleware, mediaController.downloadMedia);
app.post('/api/media/upload', authMiddleware, mediaController.uploadMedia);
app.get('/api/media/stream/:id', mediaController.streamMedia);
app.get('/api/media/thumbnail/:id', mediaController.getThumbnail);
app.post('/api/media/convert', authMiddleware, mediaController.convertMedia);
app.post('/api/media/compress', authMiddleware, mediaController.compressMedia);
app.post('/api/media/crop', authMiddleware, mediaController.cropImage);
app.post('/api/media/resize', authMiddleware, mediaController.resizeImage);
app.post('/api/media/filter', authMiddleware, mediaController.applyFilter);
app.get('/api/media/youtube/info', authMiddleware, mediaController.getYouTubeInfo);
app.get('/api/media/youtube/download', authMiddleware, mediaController.downloadYouTube);
app.get('/api/media/spotify/info', authMiddleware, mediaController.getSpotifyInfo);
app.get('/api/media/tiktok/info', authMiddleware, mediaController.getTikTokInfo);
app.get('/api/media/instagram/info', authMiddleware, mediaController.getInstagramInfo);

// ============ SOCIAL ROUTES ============
app.get('/api/social/feed', authMiddleware, socialController.getFeed);
app.post('/api/social/post', authMiddleware, socialController.createPost);
app.put('/api/social/post/:id', authMiddleware, socialController.updatePost);
app.delete('/api/social/post/:id', authMiddleware, socialController.deletePost);
app.get('/api/social/post/:id', authMiddleware, socialController.getPost);
app.post('/api/social/post/:id/like', authMiddleware, socialController.likePost);
app.post('/api/social/post/:id/unlike', authMiddleware, socialController.unlikePost);
app.post('/api/social/post/:id/share', authMiddleware, socialController.sharePost);
app.post('/api/social/post/:id/comment', authMiddleware, socialController.addComment);
app.delete('/api/social/comment/:id', authMiddleware, socialController.deleteComment);
app.post('/api/social/user/:id/follow', authMiddleware, socialController.followUser);
app.post('/api/social/user/:id/unfollow', authMiddleware, socialController.unfollowUser);
app.get('/api/social/user/:id', authMiddleware, socialController.getUserProfile);
app.get('/api/social/trending', authMiddleware, socialController.getTrending);
app.get('/api/social/hashtag/:tag', authMiddleware, socialController.getHashtagFeed);
app.get('/api/social/suggestions', authMiddleware, socialController.getSuggestions);

// ============ CHAT ROUTES ============
app.get('/api/chat/rooms', authMiddleware, chatController.getRooms);
app.post('/api/chat/rooms', authMiddleware, chatController.createRoom);
app.get('/api/chat/rooms/:roomId', authMiddleware, chatController.getRoom);
app.put('/api/chat/rooms/:roomId', authMiddleware, chatController.updateRoom);
app.delete('/api/chat/rooms/:roomId', authMiddleware, chatController.deleteRoom);
app.post('/api/chat/rooms/:roomId/join', authMiddleware, chatController.joinRoom);
app.post('/api/chat/rooms/:roomId/leave', authMiddleware, chatController.leaveRoom);
app.get('/api/chat/rooms/:roomId/messages', authMiddleware, chatController.getMessages);
app.post('/api/chat/rooms/:roomId/messages', authMiddleware, chatController.sendMessage);
app.put('/api/chat/messages/:messageId', authMiddleware, chatController.editMessage);
app.delete('/api/chat/messages/:messageId', authMiddleware, chatController.deleteMessage);
app.post('/api/chat/rooms/:roomId/typing', authMiddleware, chatController.typingIndicator);
app.post('/api/chat/rooms/:roomId/read', authMiddleware, chatController.markAsRead);
app.get('/api/chat/users', authMiddleware, chatController.getUsers);
app.post('/api/chat/users/:userId/block', authMiddleware, chatController.blockUser);
app.post('/api/chat/users/:userId/unblock', authMiddleware, chatController.unblockUser);

// ============ FILE ROUTES ============
app.get('/api/files', authMiddleware, fileController.listFiles);
app.post('/api/files/upload', authMiddleware, fileController.uploadFile);
app.get('/api/files/:id', authMiddleware, fileController.downloadFile);
app.delete('/api/files/:id', authMiddleware, fileController.deleteFile);
app.put('/api/files/:id', authMiddleware, fileController.renameFile);
app.post('/api/files/:id/move', authMiddleware, fileController.moveFile);
app.post('/api/files/:id/copy', authMiddleware, fileController.copyFile);
app.get('/api/files/search', authMiddleware, fileController.searchFiles);
app.get('/api/files/info/:id', authMiddleware, fileController.getFileInfo);
app.post('/api/files/folder', authMiddleware, fileController.createFolder);
app.delete('/api/files/folder/:id', authMiddleware, fileController.deleteFolder);
app.get('/api/files/starred', authMiddleware, fileController.getStarred);
app.post('/api/files/:id/star', authMiddleware, fileController.starFile);
app.post('/api/files/:id/unstar', authMiddleware, fileController.unstarFile);
app.get('/api/files/shared', authMiddleware, fileController.getShared);
app.post('/api/files/:id/share', authMiddleware, fileController.shareFile);
app.delete('/api/files/:id/share', authMiddleware, fileController.unshareFile);

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getUsers);
app.get('/api/admin/users/:id', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getUser);
app.put('/api/admin/users/:id', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.updateUser);
app.delete('/api/admin/users/:id', authMiddleware, roleMiddleware('superadmin'), adminController.deleteUser);
app.post('/api/admin/users/:id/suspend', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.suspendUser);
app.post('/api/admin/users/:id/unsuspend', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.unsuspendUser);
app.post('/api/admin/users/:id/role', authMiddleware, roleMiddleware('superadmin'), adminController.changeRole);
app.get('/api/admin/stats', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getStats);
app.get('/api/admin/logs', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getLogs);
app.get('/api/admin/analytics', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getAnalytics);
app.get('/api/admin/system-info', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getSystemInfo);
app.post('/api/admin/backup', authMiddleware, roleMiddleware('superadmin'), adminController.createBackup);
app.post('/api/admin/restore', authMiddleware, roleMiddleware('superadmin'), adminController.restoreBackup);
app.post('/api/admin/clear-cache', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.clearCache);
app.get('/api/admin/queues', authMiddleware, roleMiddleware('admin', 'superadmin'), adminController.getQueues);
app.post('/api/admin/broadcast', authMiddleware, roleMiddleware('superadmin'), adminController.broadcastMessage);

// ============ WEBHOOKS ============
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookController.handleStripe);
app.post('/webhooks/paypal', webhookController.handlePaypal);
app.post('/webhooks/razorpay', webhookController.handleRazorpay);
app.post('/webhooks/mpesa', webhookController.handleMpesa);

// ============ WEB SOCKET EVENTS ============
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Invalid token'));
  }
  
  socket.userId = decoded.id;
  next();
});

io.on('connection', (socket) => {
  logger.info(`User ${socket.userId} connected`);
  
  // Join user's personal room
  socket.join(`user:${socket.userId}`);
  
  // Browser events
  socket.on('browser:navigate', async (data) => {
    const result = await browserController.browseWebSocket(data.url, data.options);
    socket.emit('browser:result', result);
  });
  
  socket.on('browser:screenshot', async (data) => {
    const screenshot = await browserController.takeScreenshot(data.url);
    socket.emit('browser:screenshot', screenshot);
  });
  
  socket.on('browser:evaluate', async (data) => {
    const result = await browserController.evaluateScript(data.url, data.script);
    socket.emit('browser:evaluate', result);
  });
  
  // Chat events
  socket.on('chat:join', (roomId) => {
    socket.join(`chat:${roomId}`);
    io.to(`chat:${roomId}`).emit('chat:user-joined', { userId: socket.userId });
  });
  
  socket.on('chat:leave', (roomId) => {
    socket.leave(`chat:${roomId}`);
    io.to(`chat:${roomId}`).emit('chat:user-left', { userId: socket.userId });
  });
  
  socket.on('chat:message', async (data) => {
    const message = await chatController.saveMessage(data);
    io.to(`chat:${data.roomId}`).emit('chat:message', message);
  });
  
  socket.on('chat:typing', (data) => {
    socket.to(`chat:${data.roomId}`).emit('chat:typing', { userId: socket.userId, isTyping: data.isTyping });
  });
  
  // Social events
  socket.on('social:like', async (data) => {
    await socialController.likePost(data.postId, socket.userId);
    io.emit('social:liked', { postId: data.postId, userId: socket.userId });
  });
  
  socket.on('social:comment', async (data) => {
    const comment = await socialController.addComment(data.postId, socket.userId, data.comment);
    io.emit('social:commented', comment);
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    logger.info(`User ${socket.userId} disconnected`);
  });
});

// ============ STATIC FILES ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/browser', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'browser.html'));
});

app.get('/social', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'social.html'));
});

app.get('/media', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'media.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', authMiddleware, roleMiddleware('admin', 'superadmin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============ ERROR HANDLING ============
app.use(errorHandler);

// ============ START SERVER ============
server.listen(PORT, '0.0.0.0', async () => {
  logger.info(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ZASS MEGA ECOSYSTEM - RUNNING                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  🚀 Server: http://localhost:${PORT}                                          ║
║  🌐 Browser: http://localhost:${PORT}/browser                                 ║
║  💬 Chat: http://localhost:${PORT}/chat                                       ║
║  📱 Social: http://localhost:${PORT}/social                                   ║
║  🎬 Media: http://localhost:${PORT}/media                                     ║
║  📊 Dashboard: http://localhost:${PORT}/dashboard                             ║
║  👑 Admin: http://localhost:${PORT}/admin                                     ║
║                                                                               ║
║  📈 API: http://localhost:${PORT}/api                                         ║
║  🔍 GraphQL: http://localhost:${PORT}/graphql                                 ║
║  📊 Metrics: http://localhost:${PORT}/metrics                                 ║
║  💚 Health: http://localhost:${PORT}/health                                   ║
║  📋 Bull Board: http://localhost:${PORT}/admin/queues                         ║
║                                                                               ║
║  ✨ FEATURES:                                                                 ║
║  ✅ Unlimited Web Browsing (No limits)                                        ║
║  ✅ Search Everything (Google, Bing, YouTube, etc)                            ║
║  ✅ Video Downloader (YouTube, TikTok, Instagram)                             ║
║  ✅ Social Media Feed                                                         ║
║  ✅ Real-time Chat                                                             ║
║  ✅ File Manager with Cloud Storage                                           ║
║  ✅ AI-Powered Search                                                         ║
║  ✅ Adult Content Allowed                                                     ║
║  ✅ No Censorship, No Limits                                                  ║
║                                                                               ║
║  🔐 Default Login: admin / admin123 (Change immediately!)                     ║
║  📧 Support: support@zass.website                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await mongoose.connection.close();
    await redisClient.quit();
    logger.info('Server closed');
    process.exit(0);
  });
});
