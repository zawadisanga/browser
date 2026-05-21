// workers/cronJobs.js - Scheduled Cron Jobs
const cron = require('node-cron');
const mongoose = require('mongoose');
const { getRedisManager } = require('../config/redis');
const winston = require('winston');
const User = require('../models/User');
const Content = require('../models/Content');
const { ChatMessage, ChatRoom } = require('../models/Chat');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/cron.log' })
  ]
});

const redisManager = getRedisManager();

// Clean up expired sessions - Every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Running session cleanup...');
  
  try {
    // Clean up expired browser sessions
    const expiredSessions = await mongoose.connection.collection('browsersessions')
      .deleteMany({ expiresAt: { $lt: new Date() } });
    
    logger.info(`Deleted ${expiredSessions.deletedCount} expired browser sessions`);
    
    // Clean up expired refresh tokens from Redis
    // Redis handles TTL automatically
    
  } catch (error) {
    logger.error(`Session cleanup failed: ${error.message}`);
  }
});

// Delete expired stories/reels - Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  logger.info('Checking for expired stories...');
  
  try {
    const expiredStories = await Content.updateMany(
      {
        type: { $in: ['story', 'reel'] },
        expiresAt: { $lt: new Date() },
        status: 'published'
      },
      { status: 'archived' }
    );
    
    if (expiredStories.modifiedCount > 0) {
      logger.info(`Archived ${expiredStories.modifiedCount} expired stories`);
    }
  } catch (error) {
    logger.error(`Story cleanup failed: ${error.message}`);
  }
});

// Update trending scores - Every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  logger.info('Updating trending scores...');
  
  try {
    const trendingContent = await Content.getTrending(100);
    
    // Store in Redis for quick access
    await redisManager.set('trending:content', trendingContent, 1800);
    
    logger.info(`Updated trending scores for ${trendingContent.length} items`);
  } catch (error) {
    logger.error(`Trending update failed: ${error.message}`);
  }
});

// Send daily digest emails - Every day at 8 AM
cron.schedule('0 8 * * *', async () => {
  logger.info('Sending daily digest emails...');
  
  try {
    // Get active users from last 7 days
    const activeUsers = await User.find({
      lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      'preferences.notifications.email': true
    }).limit(1000);
    
    logger.info(`Found ${activeUsers.length} users for digest`);
    
    // Queue emails for processing
    const emailQueue = new Queue('email', process.env.REDIS_URL);
    
    for (const user of activeUsers) {
      await emailQueue.add({
        to: user.email,
        subject: 'Your Daily ZASS Digest',
        template: 'daily-digest',
        data: {
          username: user.username,
          date: new Date().toLocaleDateString()
        }
      });
    }
    
    logger.info(`Queued ${activeUsers.length} digest emails`);
  } catch (error) {
    logger.error(`Daily digest failed: ${error.message}`);
  }
});

// Backup database - Every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('Starting database backup...');
  
  try {
    const backupDir = './backups';
    const filename = `backup-${new Date().toISOString().replace(/:/g, '-')}.gz`;
    
    // Create backup using mongodump
    const { exec } = require('child_process');
    exec(`mongodump --uri="${process.env.MONGODB_URI}" --archive="${backupDir}/${filename}" --gzip`, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Backup failed: ${error.message}`);
      } else {
        logger.info(`Backup completed: ${filename}`);
        
        // Delete backups older than 30 days
        exec(`find ${backupDir} -name "*.gz" -mtime +30 -delete`);
      }
    });
  } catch (error) {
    logger.error(`Backup failed: ${error.message}`);
  }
});

// Clean up old logs - Every day at 3 AM
cron.schedule('0 3 * * *', async () => {
  logger.info('Cleaning up old logs...');
  
  const fs = require('fs');
  const path = require('path');
  const logsDir = './logs';
  
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    logger.info(`Deleted ${deletedCount} old log files`);
  } catch (error) {
    logger.error(`Log cleanup failed: ${error.message}`);
  }
});

// Update analytics - Every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Updating analytics...');
  
  try {
    // Get various stats
    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      totalContent,
      totalMessages
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
      Content.countDocuments(),
      ChatMessage.countDocuments()
    ]);
    
    const analytics = {
      timestamp: new Date(),
      totalUsers,
      activeUsers,
      newUsersToday,
      totalContent,
      totalMessages,
      userGrowth: activeUsers / totalUsers * 100
    };
    
    // Store analytics in Redis
    await redisManager.set('analytics:daily', analytics, 86400);
    
    logger.info('Analytics updated', analytics);
  } catch (error) {
    logger.error(`Analytics update failed: ${error.message}`);
  }
});

// Check system health - Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const checks = {
      mongodb: mongoose.connection.readyState === 1,
      redis: await redisManager.ping(),
      timestamp: new Date()
    };
    
    const isHealthy = checks.mongodb && checks.redis;
    
    if (!isHealthy) {
      logger.error('System health check failed', checks);
      
      // Send alert (email, webhook, etc.)
      // Add your alerting logic here
    } else {
      logger.debug('System health check passed');
    }
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
  }
});

logger.info('Cron jobs started');

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('Cron worker shutting down...');
  process.exit(0);
});




// workers/cronJobs.js - Cron jobs worker
console.log('🕐 Cron jobs worker started');

const cron = require('node-cron');

// Run every hour
cron.schedule('0 * * * *', () => {
  console.log('Hourly cron job executed:', new Date().toISOString());
});

// Run every day at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Daily cron job executed:', new Date().toISOString());
});

process.on('SIGTERM', () => {
  console.log('Cron worker received SIGTERM, shutting down');
  process.exit(0);
});
