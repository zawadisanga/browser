// server.js - ZASS ULTIMATE COMPLETE ECOSYSTEM
// Fixed for Heroku - No dependency conflicts

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cheerio = require('cheerio');
const ytdl = require('ytdl-core');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// ============ INITIALIZATION ============
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 16232;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// ============ DATA STORAGE (In-memory with Persistence) ============
let data = {
  users: [],
  posts: [],
  messages: [],
  downloads: [],
  analytics: [],
  bookmarks: [],
  history: []
};

const DATA_FILE = './data.json';
if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data = { ...data, ...saved };
  } catch(e) { console.log('No existing data file, starting fresh'); }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Default Admin User
const defaultAdmin = {
  id: 'admin-001',
  username: 'admin',
  email: 'admin@zass.com',
  password: bcrypt.hashSync('admin123', 10),
  role: 'super_admin',
  avatar: 'https://ui-avatars.com/api/?name=Admin&background=667eea&color=fff',
  createdAt: new Date().toISOString(),
  stats: { posts: 0, downloads: 0 }
};

if (!data.users.find(u => u.username === 'admin')) {
  data.users.push(defaultAdmin);
  saveData();
}

// ============ MIDDLEWARE ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: ['http://localhost:3000', 'https://*.herokuapp.com', 'https://*.zass.website'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static('public', { maxAge: '1d' }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'zass-super-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProd, 
    httpOnly: true, 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Logging
app.use(morgan('combined'));

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' }
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts', code: 'AUTH_RATE_LIMIT' }
});
app.use('/api/auth/', authLimiter);

// File Upload Setup
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ============ AUTH MIDDLEWARE ============
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.session?.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'zass-secret-key-2024');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '10.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    features: [
      'browser', 'search', 'media_downloader', 'social', 'chat',
      'ai_chatbot', 'file_upload', 'analytics', 'authentication',
      'admin_panel', 'bookmarks', 'history'
    ],
    timestamp: new Date().toISOString()
  });
});

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (data.users.find(u => u.username === username || u.email === email)) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }
  
  const newUser = {
    id: uuidv4(),
    username,
    email,
    password: bcrypt.hashSync(password, 10),
    role: 'user',
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`,
    createdAt: new Date().toISOString(),
    stats: { posts: 0, downloads: 0 }
  };
  
  data.users.push(newUser);
  saveData();
  
  const token = jwt.sign(
    { id: newUser.id, username: newUser.username, role: newUser.role },
    process.env.JWT_SECRET || 'zass-secret-key-2024',
    { expiresIn: '30d' }
  );
  
  res.json({
    success: true,
    token,
    user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role, avatar: newUser.avatar }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = data.users.find(u => u.username === username || u.email === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'zass-secret-key-2024',
    { expiresIn: '30d' }
  );
  
  req.session.token = token;
  
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    success: true,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar, stats: user.stats }
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out' });
});

// ============ BROWSER ROUTES ============
app.get('/api/browser/browse', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  
  try {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 30000
    });
    
    const result = {
      success: true,
      url: targetUrl,
      content: response.data,
      status: response.status,
      contentType: response.headers['content-type'],
      size: response.data.length,
      timestamp: new Date().toISOString()
    };
    
    // Save to history if authenticated
    if (req.user) {
      data.history.push({
        userId: req.user.id,
        url: targetUrl,
        title: result.title || targetUrl,
        timestamp: new Date().toISOString()
      });
      if (data.history.length > 1000) data.history = data.history.slice(-1000);
      saveData();
    }
    
    // Track analytics
    data.analytics.push({
      type: 'browse',
      url: targetUrl,
      timestamp: new Date().toISOString(),
      userId: req.user?.id
    });
    saveData();
    
    res.json(result);
  } catch (error) {
    res.json({
      success: false,
      url: targetUrl,
      error: error.message,
      fallback: true
    });
  }
});

// Browser history
app.get('/api/browser/history', authMiddleware, (req, res) => {
  const userHistory = data.history.filter(h => h.userId === req.user.id).slice(-100);
  res.json({ success: true, history: userHistory });
});

app.delete('/api/browser/history', authMiddleware, (req, res) => {
  data.history = data.history.filter(h => h.userId !== req.user.id);
  saveData();
  res.json({ success: true, message: 'History cleared' });
});

// Bookmarks
app.get('/api/browser/bookmarks', authMiddleware, (req, res) => {
  const userBookmarks = data.bookmarks.filter(b => b.userId === req.user.id);
  res.json({ success: true, bookmarks: userBookmarks });
});

app.post('/api/browser/bookmarks', authMiddleware, (req, res) => {
  const { url, title } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const bookmark = {
    id: uuidv4(),
    userId: req.user.id,
    url,
    title: title || url,
    createdAt: new Date().toISOString()
  };
  
  data.bookmarks.push(bookmark);
  saveData();
  
  res.json({ success: true, bookmark });
});

app.delete('/api/browser/bookmarks/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  data.bookmarks = data.bookmarks.filter(b => b.id !== id);
  saveData();
  res.json({ success: true, message: 'Bookmark deleted' });
});

// ============ SEARCH ROUTES ============
app.get('/api/search/web', async (req, res) => {
  const { q, engine = 'google', limit = 30 } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Search query required' });
  }
  
  const searchEngines = {
    google: `https://www.google.com/search?q=${encodeURIComponent(q)}&num=${limit}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=${limit}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
  };
  
  try {
    const searchUrl = searchEngines[engine] || searchEngines.google;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    let results = [];
    
    if (engine === 'google') {
      $('div.g').each((i, el) => {
        const title = $(el).find('h3').text();
        let link = $(el).find('a').attr('href');
        const snippet = $(el).find('.VwiC3b').text() || $(el).find('.IsZvec').text();
        
        if (link && link.startsWith('/url?q=')) {
          link = decodeURIComponent(link.replace('/url?q=', '').split('&')[0]);
        }
        
        if (title && link && link.startsWith('http') && i < limit) {
          results.push({ title, url: link, snippet: snippet.substring(0, 300) });
        }
      });
    } else if (engine === 'bing') {
      $('li.b_algo').each((i, el) => {
        const title = $(el).find('h2').text();
        const link = $(el).find('a').attr('href');
        const snippet = $(el).find('.b_caption p').text();
        if (title && link && i < limit) {
          results.push({ title, url: link, snippet: snippet?.substring(0, 300) || '' });
        }
      });
    } else if (engine === 'youtube') {
      $('ytd-video-renderer').each((i, el) => {
        const title = $(el).find('#video-title').text();
        const link = 'https://youtube.com' + $(el).find('#video-title').attr('href');
        const thumbnail = $(el).find('#img').attr('src');
        if (title && link && i < limit) {
          results.push({ title, url: link, thumbnail, type: 'video' });
        }
      });
    }
    
    res.json({
      success: true,
      query: q,
      engine,
      results,
      total: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ success: false, query: q, error: error.message, results: [] });
  }
});

app.get('/api/search/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json({ suggestions: [] });
  }
  
  try {
    const response = await axios.get(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`);
    res.json({ suggestions: response.data[1] });
  } catch (error) {
    res.json({ suggestions: [] });
  }
});

// ============ MEDIA ROUTES (Video Downloader) ============
app.get('/api/media/info', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  try {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const info = await ytdl.getInfo(url);
      res.json({
        success: true,
        platform: 'youtube',
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        author: info.videoDetails.author.name,
        views: info.videoDetails.viewCount,
        formats: info.formats.filter(f => f.hasVideo || f.hasAudio).slice(0, 10).map(f => ({
          quality: f.qualityLabel || f.quality,
          container: f.container,
          hasVideo: f.hasVideo,
          hasAudio: f.hasAudio
        }))
      });
    } else {
      res.json({ success: false, error: 'Unsupported platform. Supported: YouTube' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/media/download', async (req, res) => {
  const { url, quality = 'highest', audioOnly = 'false' } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  try {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
      const filename = audioOnly === 'true' ? `${title}.mp3` : `${title}.mp4`;
      
      let options = { quality };
      if (audioOnly === 'true') {
        options = { filter: 'audioonly', quality: 'highestaudio' };
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', audioOnly === 'true' ? 'audio/mpeg' : 'video/mp4');
      
      ytdl(url, options).pipe(res);
    } else {
      res.status(400).json({ error: 'Unsupported platform' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SOCIAL MEDIA ROUTES ============
app.get('/api/social/feed', authMiddleware, (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const start = (page - 1) * limit;
  const paginated = data.posts.slice(start, start + limit);
  
  res.json({
    success: true,
    posts: paginated,
    total: data.posts.length,
    page: parseInt(page),
    limit: parseInt(limit),
    hasMore: start + limit < data.posts.length
  });
});

app.post('/api/social/post', authMiddleware, (req, res) => {
  const { content, type = 'text', mediaUrl } = req.body;
  
  if (!content && !mediaUrl) {
    return res.status(400).json({ error: 'Content or media required' });
  }
  
  const newPost = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    content: content || '',
    type,
    mediaUrl,
    likes: 0,
    comments: [],
    shares: 0,
    createdAt: new Date().toISOString()
  };
  
  data.posts.unshift(newPost);
  
  // Update user stats
  const user = data.users.find(u => u.id === req.user.id);
  if (user) user.stats.posts = (user.stats.posts || 0) + 1;
  
  saveData();
  
  res.status(201).json({ success: true, post: newPost });
});

app.post('/api/social/like/:postId', authMiddleware, (req, res) => {
  const { postId } = req.params;
  const post = data.posts.find(p => p.id === postId);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  post.likes++;
  saveData();
  
  res.json({ success: true, likes: post.likes });
});

app.post('/api/social/comment/:postId', authMiddleware, (req, res) => {
  const { postId } = req.params;
  const { comment } = req.body;
  
  if (!comment) {
    return res.status(400).json({ error: 'Comment required' });
  }
  
  const post = data.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  const newComment = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    content: comment,
    createdAt: new Date().toISOString()
  };
  
  post.comments.push(newComment);
  saveData();
  
  res.status(201).json({ success: true, comment: newComment });
});

// ============ CHAT ROUTES ============
app.get('/api/chat/messages', authMiddleware, (req, res) => {
  const { limit = 50, room = 'general' } = req.query;
  const roomMessages = data.messages.filter(m => m.room === room);
  const recent = roomMessages.slice(-limit);
  
  res.json({ success: true, messages: recent, total: roomMessages.length });
});

app.post('/api/chat/send', authMiddleware, (req, res) => {
  const { message, type = 'text', room = 'general' } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }
  
  const newMessage = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    message,
    type,
    room,
    timestamp: new Date().toISOString()
  };
  
  data.messages.push(newMessage);
  saveData();
  
  res.status(201).json({ success: true, message: newMessage });
});

// ============ AI CHATBOT ROUTE ============
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }
  
  const responses = {
    greeting: ["Hello! How can I help you today?", "Hi there! Welcome to ZASS!", "Hey! What can I do for you?"],
    browser: ["You can browse any website using our browser. No restrictions, no limits!", "Go to the Browser tab and enter any URL you want!"],
    download: ["You can download videos from YouTube by pasting the URL in Media section!", "Supported platforms: YouTube (more coming soon)"],
    search: ["Use the search bar to find anything across Google, Bing, YouTube, and more!"],
    social: ["Create posts, share content, like and comment on others' posts!", "Connect with friends on ZASS Social!"],
    chat: ["Join chat rooms and talk with other users in real-time!", "Create private rooms or join public conversations."],
    help: ["I can help you with:\n- Web browsing\n- Downloading videos\n- Searching the web\n- Social media posts\n- Chat with friends\n\nWhat would you like to do?"],
    default: ["I'm here to help! Try asking about browsing, downloads, search, social media, or chat!"]
  };
  
  const lowerMsg = message.toLowerCase();
  let intent = 'default';
  
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) intent = 'greeting';
  else if (lowerMsg.includes('browse') || lowerMsg.includes('website') || lowerMsg.includes('url')) intent = 'browser';
  else if (lowerMsg.includes('download') || lowerMsg.includes('video') || lowerMsg.includes('youtube')) intent = 'download';
  else if (lowerMsg.includes('search') || lowerMsg.includes('find') || lowerMsg.includes('google')) intent = 'search';
  else if (lowerMsg.includes('social') || lowerMsg.includes('post') || lowerMsg.includes('feed')) intent = 'social';
  else if (lowerMsg.includes('chat') || lowerMsg.includes('message')) intent = 'chat';
  else if (lowerMsg.includes('help')) intent = 'help';
  
  const responseList = responses[intent];
  const reply = responseList[Math.floor(Math.random() * responseList.length)];
  
  res.json({ success: true, reply, intent });
});

// ============ FILE UPLOAD ROUTES ============
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  
  res.json({
    success: true,
    file: {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl
    }
  });
});

app.use('/uploads', express.static('uploads'));

// ============ DASHBOARD STATS ============
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  const userPosts = data.posts.filter(p => p.userId === req.user.id);
  const userMessages = data.messages.filter(m => m.userId === req.user.id);
  
  res.json({
    success: true,
    stats: {
      totalUsers: data.users.length,
      totalPosts: data.posts.length,
      totalMessages: data.messages.length,
      totalDownloads: data.downloads.length,
      userPosts: userPosts.length,
      userMessages: userMessages.length,
      userRole: req.user.role,
      joinedAt: user?.createdAt,
      serverUptime: process.uptime()
    }
  });
});

// ============ ADMIN ROUTES ============
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const safeUsers = data.users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    stats: u.stats,
    createdAt: u.createdAt
  }));
  
  res.json({ success: true, users: safeUsers, total: safeUsers.length });
});

app.put('/api/admin/users/:userId/role', authMiddleware, adminMiddleware, (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  
  const user = data.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.role = role;
  saveData();
  
  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, (req, res) => {
  const { userId } = req.params;
  
  const index = data.users.findIndex(u => u.id === userId);
  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (data.users[index].role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete super admin' });
  }
  
  data.users.splice(index, 1);
  saveData();
  
  res.json({ success: true, message: 'User deleted' });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  res.json({
    success: true,
    stats: {
      totalUsers: data.users.length,
      totalPosts: data.posts.length,
      totalMessages: data.messages.length,
      totalAnalytics: data.analytics.length,
      activeUsers: data.analytics.filter(a => new Date(a.timestamp) > new Date(Date.now() - 24*60*60*1000)).map(a => a.userId).filter((v,i,a) => a.indexOf(v) === i).length
    }
  });
});

// ============ STATIC PAGES ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/browser', (req, res) => res.sendFile(path.join(__dirname, 'public', 'browser.html')));
app.get('/social', (req, res) => res.sendFile(path.join(__dirname, 'public', 'social.html')));
app.get('/media', (req, res) => res.sendFile(path.join(__dirname, 'public', 'media.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ============ FALLBACK ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                                                  ║
║                         🔥 ZASS ULTIMATE ECOSYSTEM - RUNNING ON HEROKU 🔥                                        ║
║                                                                                                                  ║
║                                    THE COMPLETE PLATFORM - EVERYTHING UNLIMITED                                  ║
║                                                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                                  ║
║  🚀 Server:      http://localhost:${PORT}                                                                         ║
║  💚 Health:      http://localhost:${PORT}/health                                                                 ║
║  🌐 Browser:     http://localhost:${PORT}/browser                                                                ║
║  🔍 Search:      http://localhost:${PORT}/api/search/web?q=test                                                  ║
║  🎬 Media:       http://localhost:${PORT}/media                                                                  ║
║  📱 Social:      http://localhost:${PORT}/social                                                                 ║
║  💬 Chat:        http://localhost:${PORT}/chat                                                                   ║
║  📊 Dashboard:   http://localhost:${PORT}/dashboard                                                              ║
║  👑 Admin:       http://localhost:${PORT}/admin                                                                  ║
║  🤖 AI Chat:     http://localhost:${PORT}/api/ai/chat (POST)                                                     ║
║                                                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                                  ║
║  🔐 DEFAULT LOGIN:                                                                                               ║
║     Username: admin                                                                                              ║
║     Password: admin123                                                                                           ║
║                                                                                                                  ║
║  📊 SYSTEM STATUS:                                                                                               ║
║     • Uptime: ${Math.floor(process.uptime())} seconds                                                              ║
║     • Users: ${data.users.length}                                                                                ║
║     • Posts: ${data.posts.length}                                                                                ║
║     • Messages: ${data.messages.length}                                                                          ║
║                                                                                                                  ║
║                              🔥 THE ULTIMATE PLATFORM IS READY! 🔥                                               ║
║                                                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;


// Mwishoni mwa server.js, hakikisha unatumia PORT kutoka Heroku
const PORT = process.env.PORT || 16232;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
