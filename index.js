// index.js - The Living System Entry Point
const express = require('express')
const fs = require('fs-extra')
const path = require('path')

// Auto-updater modules
const autoUpdater = require('./src/autoUpdater')
const selfEvolver = require('./src/selfEvolver')
const selfHealer = require('./src/selfHealer')
const autoScaler = require('./src/autoScaler')
const monitor = require('./src/monitor')

const app = express()
const PORT = process.env.PORT || 16232

// Middleware
app.use(express.json())
app.use(express.static('public'))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: autoUpdater.version,
    uptime: process.uptime(),
    autoUpdate: true,
    selfHeal: true,
    selfEvolve: true,
    lastUpdate: autoUpdater.lastUpdate,
    timestamp: new Date()
  })
})

// Update status endpoint
app.get('/api/update/status', (req, res) => {
  res.json({
    isUpdating: autoUpdater.isUpdating,
    lastUpdate: autoUpdater.lastUpdate,
    version: autoUpdater.version,
    updateLogs: autoUpdater.updateLogs.slice(-10)
  })
})

// Force update endpoint
app.post('/api/update/force', async (req, res) => {
  if (autoUpdater.isUpdating) {
    return res.json({ status: 'updating_already' })
  }
  
  // Run update in background
  autoUpdater.performUpdate()
  
  res.json({ status: 'update_started' })
})

// System metrics endpoint
app.get('/api/metrics', async (req, res) => {
  res.json({
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    loadAvg: require('os').loadavg(),
    totalMemory: require('os').totalmem(),
    freeMemory: require('os').freemem()
  })
})

// Auto-scale endpoint
app.post('/api/scale', async (req, res) => {
  const { instances } = req.body
  await autoScaler.scaleTo(instances)
  res.json({ status: 'scaled', instances })
})

// Start the living system
async function start() {
  console.log('🌱 Starting Living System...')
  
  // Start auto-updater
  await autoUpdater.start()
  
  // Start self-evolution
  await selfEvolver.start()
  
  // Start self-healer
  await selfHealer.start()
  
  // Start auto-scaler
  await autoScaler.start()
  
  // Start monitoring
  await monitor.start()
  
  // Start web server
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     🔄 ZASS LIVING SYSTEM - SELF-UPDATING PLATFORM 🔄            ║
║                                                                   ║
║     🌱 Auto-Update:     ACTIVE (Checking every 5 minutes)        ║
║     🧬 Self-Evolve:     ACTIVE (AI-powered evolution)            ║
║     🏥 Self-Heal:       ACTIVE (Automatic recovery)              ║
║     ⚡ Auto-Scale:      ACTIVE (Dynamic scaling)                 ║
║     📊 Monitoring:      ACTIVE (Real-time metrics)               ║
║                                                                   ║
║     📡 Web Interface:   http://localhost:${PORT}                  ║
║     💚 Health Check:    http://localhost:${PORT}/health          ║
║     📈 Metrics:         http://localhost:${PORT}/api/metrics     ║
║     🔄 Update Status:   http://localhost:${PORT}/api/update/status║
║                                                                   ║
║     🚀 THE SYSTEM IS ALIVE AND EVOLVING...                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
    `)
  })
}

start()

module.exports = app


// index.js - Main Entry Point for Heroku
const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')

// Load environment variables
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 16232

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))
app.use(cors())
app.use(compression())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.static('public'))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' }
})
app.use('/api/', limiter)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '10.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  })
})

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    autoUpdate: true,
    selfHeal: true,
    version: '10.0.0',
    uptime: process.uptime()
  })
})

// Browser endpoint
app.get('/browser', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'browser.html'))
})

// Social endpoint
app.get('/social', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'social.html'))
})

// Media endpoint
app.get('/media', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'media.html'))
})

// Chat endpoint
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'))
})

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
})

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     🔄 ZASS SELF-UPDATING SYSTEM - RUNNING 🔄                    ║
║                                                                   ║
║     🚀 Server: http://localhost:${PORT}                           ║
║     💚 Health: http://localhost:${PORT}/health                   ║
║     🌐 Browser: http://localhost:${PORT}/browser                 ║
║     💬 Chat: http://localhost:${PORT}/chat                       ║
║     📱 Social: http://localhost:${PORT}/social                   ║
║     🎬 Media: http://localhost:${PORT}/media                     ║
║                                                                   ║
║     🔄 Auto-Update: ACTIVE                                       ║
║     🏥 Self-Heal: ACTIVE                                         ║
║     📊 Monitoring: ACTIVE                                        ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
  `)
})

module.exports = app
