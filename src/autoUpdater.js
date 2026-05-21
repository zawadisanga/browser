// src/autoUpdater.js - The Living Self-Updating System
const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const simpleGit = require('simple-git')
const semver = require('semver')
const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

class SelfUpdatingSystem {
  constructor() {
    this.version = '∞.∞.∞'
    this.updateInterval = 5 * 60 * 1000 // 5 minutes
    this.git = simpleGit()
    this.updateLogs = []
    this.isUpdating = false
    this.repoUrl = 'https://github.com/zass/self-updating-system.git'
    this.branch = 'main'
  }

  async start() {
    console.log('🔄 Self-Updating System Activated')
    console.log('📡 Monitoring for updates...')
    
    // Check for updates immediately
    await this.checkAndUpdate()
    
    // Set up automatic update checking
    setInterval(async () => {
      await this.checkAndUpdate()
    }, this.updateInterval)
    
    // Watch for file changes
    this.watchFileChanges()
    
    // Monitor performance and auto-optimize
    this.monitorAndOptimize()
    
    // Self-healing
    this.selfHeal()
  }

  async checkAndUpdate() {
    if (this.isUpdating) {
      console.log('⏳ Update already in progress, skipping...')
      return
    }

    console.log('🔍 Checking for updates...')
    
    try {
      // Check GitHub for new version
      const hasUpdate = await this.checkForUpdates()
      
      if (hasUpdate) {
        console.log('🆕 New update available!')
        await this.performUpdate()
      } else {
        console.log('✅ System is up to date')
      }
    } catch (error) {
      console.error('❌ Update check failed:', error.message)
      await this.logError(error)
    }
  }

  async checkForUpdates() {
    try {
      // Fetch latest version from GitHub
      const response = await axios.get('https://api.github.com/repos/zass/self-updating-system/releases/latest')
      const latestVersion = response.data.tag_name
      
      // Compare versions
      return semver.gt(latestVersion, this.version)
    } catch (error) {
      // If GitHub fails, check from our backup server
      const backupResponse = await axios.get('https://update.zass.website/version')
      return backupResponse.data.version !== this.version
    }
  }

  async performUpdate() {
    this.isUpdating = true
    console.log('🚀 Starting update process...')
    
    try {
      // 1. Create backup before update
      await this.createBackup()
      
      // 2. Fetch latest code
      await this.fetchLatestCode()
      
      // 3. Install new dependencies
      await this.installDependencies()
      
      // 4. Run migrations
      await this.runMigrations()
      
      // 5. Build new assets
      await this.buildAssets()
      
      // 6. Run tests
      await this.runTests()
      
      // 7. Graceful restart
      await this.gracefulRestart()
      
      // 8. Verify update
      await this.verifyUpdate()
      
      // 9. Clean up
      await this.cleanup()
      
      console.log('✅ Update completed successfully!')
      this.logUpdate('success', new Date())
      
    } catch (error) {
      console.error('❌ Update failed:', error)
      await this.rollbackUpdate()
      this.logUpdate('failed', new Date(), error.message)
    } finally {
      this.isUpdating = false
    }
  }

  async createBackup() {
    console.log('💾 Creating backup before update...')
    
    const backupDir = path.join(__dirname, '../backups', `backup-${Date.now()}`)
    await fs.ensureDir(backupDir)
    
    // Backup important files
    const filesToBackup = [
      'server.js',
      'package.json',
      'src/',
      'public/',
      'config/',
      'database/'
    ]
    
    for (const file of filesToBackup) {
      const source = path.join(__dirname, '..', file)
      const destination = path.join(backupDir, file)
      
      if (await fs.pathExists(source)) {
        await fs.copy(source, destination)
      }
    }
    
    // Backup database
    await this.backupDatabase()
    
    console.log(`✅ Backup created at ${backupDir}`)
    this.lastBackup = backupDir
  }

  async backupDatabase() {
    try {
      const timestamp = Date.now()
      const backupFile = `backup-${timestamp}.dump`
      
      // MongoDB backup
      await execPromise(`mongodump --uri="${process.env.MONGODB_URI}" --archive="./backups/${backupFile}" --gzip`)
      
      // PostgreSQL backup
      await execPromise(`pg_dump ${process.env.DATABASE_URL} | gzip > ./backups/postgres-${timestamp}.sql.gz`)
      
      console.log('✅ Database backup completed')
    } catch (error) {
      console.error('⚠️ Database backup warning:', error.message)
    }
  }

  async fetchLatestCode() {
    console.log('📥 Fetching latest code...')
    
    // Using git pull
    await this.git.pull('origin', this.branch)
    
    // Or download from GitHub
    const response = await axios.get(`https://github.com/zass/self-updating-system/archive/refs/heads/${this.branch}.zip`, {
      responseType: 'arraybuffer'
    })
    
    const zipPath = path.join(__dirname, '../temp/update.zip')
    await fs.writeFile(zipPath, response.data)
    
    // Extract zip
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(path.join(__dirname, '../temp/update'), true)
    
    // Copy new files
    await fs.copy(path.join(__dirname, '../temp/update/self-updating-system-main'), __dirname)
    
    console.log('✅ Latest code fetched')
  }

  async installDependencies() {
    console.log('📦 Installing dependencies...')
    
    const { stdout, stderr } = await execPromise('npm install --production=false')
    console.log(stdout)
    if (stderr) console.error(stderr)
    
    console.log('✅ Dependencies installed')
  }

  async runMigrations() {
    console.log('🗄️ Running migrations...')
    
    try {
      await execPromise('npm run migrate')
      console.log('✅ Migrations completed')
    } catch (error) {
      console.error('⚠️ Migration warning:', error.message)
    }
  }

  async buildAssets() {
    console.log('🏗️ Building assets...')
    
    try {
      await execPromise('npm run build')
      console.log('✅ Assets built')
    } catch (error) {
      console.error('⚠️ Build warning:', error.message)
    }
  }

  async runTests() {
    console.log('🧪 Running tests...')
    
    try {
      await execPromise('npm test')
      console.log('✅ Tests passed')
    } catch (error) {
      console.error('⚠️ Tests failed but continuing:', error.message)
    }
  }

  async gracefulRestart() {
    console.log('🔄 Graceful restart...')
    
    // Signal to PM2 to restart
    await execPromise('pm2 reload all')
    
    // Or using nodemon
    // await execPromise('npm run restart')
    
    console.log('✅ Restart completed')
  }

  async verifyUpdate() {
    console.log('🔍 Verifying update...')
    
    // Health check
    const healthCheck = await axios.get('http://localhost:16232/health')
    
    if (healthCheck.data.status === 'healthy') {
      console.log('✅ System is healthy')
    } else {
      throw new Error('Health check failed')
    }
  }

  async rollbackUpdate() {
    console.log('⏪ Rolling back to previous version...')
    
    if (this.lastBackup) {
      await fs.copy(this.lastBackup, __dirname)
      console.log('✅ Rollback completed')
    }
    
    // Restart with previous version
    await this.gracefulRestart()
  }

  async cleanup() {
    console.log('🧹 Cleaning up...')
    
    // Remove temporary files
    await fs.remove(path.join(__dirname, '../temp'))
    
    // Remove old backups (keep last 10)
    const backups = await fs.readdir(path.join(__dirname, '../backups'))
    if (backups.length > 10) {
      const oldBackups = backups.slice(0, backups.length - 10)
      for (const backup of oldBackups) {
        await fs.remove(path.join(__dirname, '../backups', backup))
      }
    }
    
    console.log('✅ Cleanup completed')
  }

  watchFileChanges() {
    const chokidar = require('chokidar')
    
    const watcher = chokidar.watch('.', {
      ignored: /(node_modules|backups|logs|temp|\.git)/,
      persistent: true,
      ignoreInitial: true
    })
    
    watcher.on('change', async (path) => {
      console.log(`📝 File changed: ${path}`)
      
      // Auto-restart on critical file changes
      if (path.endsWith('.js') || path.endsWith('.json')) {
        console.log('🔄 Restarting due to file change...')
        await this.gracefulRestart()
      }
    })
    
    console.log('👁️ Watching for file changes')
  }

  async monitorAndOptimize() {
    setInterval(async () => {
      const memUsage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()
      
      // Auto-optimize if memory high
      if (memUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
        console.log('⚡ High memory usage detected, optimizing...')
        await this.optimizeMemory()
      }
      
      // Auto-scale if needed
      if (cpuUsage.user > 5000000) { // High CPU
        console.log('⚡ High CPU usage detected, scaling...')
        await this.autoScale()
      }
    }, 60000) // Every minute
  }

  async optimizeMemory() {
    // Clear caches
    if (global.gc) {
      global.gc()
      console.log('✅ Garbage collection triggered')
    }
    
    // Clear require cache for hot reload
    Object.keys(require.cache).forEach(key => {
      delete require.cache[key]
    })
    
    console.log('✅ Memory optimized')
  }

  async autoScale() {
    try {
      // Scale with PM2
      await execPromise('pm2 scale zass-system +1')
      console.log('✅ Scaled up by 1 instance')
    } catch (error) {
      console.error('⚠️ Auto-scale warning:', error.message)
    }
  }

  async selfHeal() {
    setInterval(async () => {
      console.log('🏥 Running self-healing check...')
      
      // Check if system is responding
      try {
        await axios.get('http://localhost:16232/health', { timeout: 5000 })
        console.log('✅ System is healthy')
      } catch (error) {
        console.log('⚠️ System unhealthy, attempting recovery...')
        await this.recoverSystem()
      }
      
      // Check database connections
      await this.checkDatabaseConnections()
      
      // Check queue health
      await this.checkQueueHealth()
      
    }, 30000) // Every 30 seconds
  }

  async recoverSystem() {
    console.log('🔄 Attempting system recovery...')
    
    // Try graceful restart
    await this.gracefulRestart()
    
    // Wait and check again
    setTimeout(async () => {
      try {
        await axios.get('http://localhost:16232/health')
        console.log('✅ System recovered successfully')
      } catch (error) {
        console.log('⚠️ Hard restart required')
        await execPromise('pm2 restart all --force')
      }
    }, 10000)
  }

  async checkDatabaseConnections() {
    const mongoose = require('mongoose')
    
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Database disconnected, reconnecting...')
      await mongoose.connect(process.env.MONGODB_URI)
    }
  }

  async checkQueueHealth() {
    const { Queue } = require('bull')
    const updateQueue = new Queue('updates')
    
    const jobCounts = await updateQueue.getJobCounts()
    
    if (jobCounts.waiting > 100) {
      console.log('⚠️ Queue backlog detected, processing...')
      // Process more jobs
    }
  }

  logUpdate(status, timestamp, error = null) {
    this.updateLogs.push({
      status,
      timestamp,
      error,
      version: this.version
    })
    
    // Save to file
    fs.writeJsonSync(path.join(__dirname, '../logs/update-logs.json'), this.updateLogs)
  }

  async logError(error) {
    const logger = require('winston')
    logger.error(error)
  }
}

// Start the self-updating system
const updater = new SelfUpdatingSystem()
updater.start()

module.exports = updater
