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
