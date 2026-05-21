// server.js - Full featured for Heroku
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { createBullBoard } = require('bull-board');
const { BullAdapter } = require('bull-board/bullAdapter');
const Queue = require('bull');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const winston = require('winston');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const axios = require('axios');
const ytdl = require('ytdl-core');
const { OpenAI } = require('openai');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ LOGGING SETUP ============
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// ============ DATABASE CONNECTION ============
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    logger.info('MongoDB connected successfully');
  }).catch(err => {
    logger.error('MongoDB connection error:', err);
  });
}

// ============ REDIS CONNECTION ============
let redisClient = null;
let myQueue = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
  myQueue = new Queue('my-queue', process.env.REDIS_URL);
  
  // Bull Board UI
  const { router } = createBullBoard([new BullAdapter(myQueue)]);
  app.use('/admin/queues', router);
}

// ============ MIDDLEWARE ============
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    node_version: process.version,
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient ? 'connected' : 'not configured',
      queue: myQueue ? 'ready' : 'not configured'
    }
  };
  res.status(200).json(health);
});

// ============ API ROUTES ============
app.get('/', (req, res) => {
  res.json({
    name: 'ZASS Mega Ecosystem',
    version: '15.0.0',
    status: 'running on Heroku',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      docs: '/api/docs',
      queue_dashboard: '/admin/queues'
    },
    features: [
      'Browser Engine',
      'Social Media Suite',
      'AI Search & Chat',
      'Download Manager',
      'Video/Audio Streaming',
      'E-commerce Platform',
      'Crypto & NFT Support',
      'Machine Learning',
      'Real-time Analytics'
    ]
  });
});

// API Status
app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'operational',
    environment: process.env.NODE_ENV || 'development',
    platform: 'Heroku',
    version: '15.0.0',
    timestamp: new Date().toISOString()
  });
});

// AI Chat endpoint
app.post('/api/v1/ai/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Check if OpenAI is configured
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
        max_tokens: 500
      });
      return res.json({ response: completion.choices[0].message.content });
    }
    
    // Fallback response
    res.json({ 
      response: `AI is ready! You said: "${message}". To enable full AI features, add OPENAI_API_KEY to environment variables.`,
      note: "AI features are limited without API key"
    });
  } catch (error) {
    logger.error('AI Chat error:', error);
    res.status(500).json({ error: 'AI service temporarily unavailable' });
  }
});

// YouTube download endpoint
app.post('/api/v1/download/youtube', async (req, res) => {
  try {
    const { url, quality = 'highest' } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality });
    
    res.json({
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      thumbnail: info.videoDetails.thumbnails[0].url,
      downloadUrl: format.url,
      quality: format.qualityLabel
    });
  } catch (error) {
    logger.error('YouTube download error:', error);
    res.status(500).json({ error: 'Failed to process YouTube URL' });
  }
});

// Queue job example
app.post('/api/v1/queue/job', async (req, res) => {
  if (!myQueue) {
    return res.status(503).json({ error: 'Queue service not configured' });
  }
  
  const job = await myQueue.add('process-data', req.body);
  res.json({ 
    message: 'Job added to queue',
    jobId: job.id,
    status: 'pending'
  });
});

// ============ CRON JOBS ============
cron.schedule('*/30 * * * *', () => {
  logger.info('Cron job executed every 30 minutes');
  // Add your cron tasks here
});

cron.schedule('0 0 * * *', () => {
  logger.info('Daily cron job executed at midnight');
  // Daily cleanup tasks
});

// ============ BACKGROUND QUEUE PROCESSOR ============
if (myQueue) {
  myQueue.process('process-data', async (job) => {
    logger.info(`Processing job ${job.id}:`, job.data);
    // Add your processing logic here
    return { success: true, processedAt: new Date() };
  });
}

// ============ EMAIL SERVICE ============
if (process.env.SMTP_HOST) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  app.post('/api/v1/email/send', async (req, res) => {
    try {
      const { to, subject, text, html } = req.body;
      await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
      res.json({ message: 'Email sent successfully' });
    } catch (error) {
      logger.error('Email error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });
}

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ============ START SERVER ============
const server = app.listen(PORT, () => {
  console.log(`🚀 ZASS Mega Ecosystem running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Queue dashboard: ${process.env.REDIS_URL ? 'http://localhost:' + PORT + '/admin/queues' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    if (redisClient) {
      await redisClient.quit();
    }
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
