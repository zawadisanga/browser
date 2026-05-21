// services/analyticsService.js - Real-time Analytics Service
const { getRedisManager } = require('../config/redis');
const { getPostgreSQL } = require('../config/database');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/analytics.log' })
  ]
});

const redisManager = getRedisManager();
const pgPool = getPostgreSQL();

class AnalyticsService {
  constructor() {
    this.trackInterval = null;
  }

  // Track page view
  async trackPageView(data) {
    try {
      const { userId, page, referrer, userAgent, ip, device, browser, os } = data;
      
      const analyticsData = {
        userId: userId || null,
        page,
        referrer: referrer || null,
        userAgent,
        ip,
        device,
        browser,
        os,
        timestamp: new Date().toISOString()
      };
      
      // Store in PostgreSQL for long-term
      await pgPool.query(
        `INSERT INTO analytics (user_id, page, referrer, user_agent, ip, device, browser, os, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, page, referrer, userAgent, ip, device, browser, os, new Date()]
      );
      
      // Update real-time stats in Redis
      await redisManager.hincrby('stats:pages', page, 1);
      await redisManager.hincrby('stats:devices', device, 1);
      await redisManager.hincrby('stats:browsers', browser, 1);
      await redisManager.incr('stats:total_views');
      
      // Update user stats if logged in
      if (userId) {
        await redisManager.hincrby(`user:${userId}:stats`, 'page_views', 1);
        await redisManager.zincrby('users:active', 1, userId);
      }
      
      return true;
    } catch (error) {
      logger.error('Track page view error:', error);
      return false;
    }
  }

  // Track event
  async trackEvent(data) {
    try {
      const { userId, event, properties, value } = data;
      
      await pgPool.query(
        `INSERT INTO analytics_events (user_id, event, properties, value, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, event, JSON.stringify(properties), value, new Date()]
      );
      
      // Update event counter in Redis
      await redisManager.hincrby('stats:events', event, 1);
      
      return true;
    } catch (error) {
      logger.error('Track event error:', error);
      return false;
    }
  }

  // Track download
  async trackDownload(data) {
    try {
      const { userId, url, filename, size, type } = data;
      
      await pgPool.query(
        `INSERT INTO downloads (user_id, url, filename, file_size, type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, url, filename, size, type, new Date()]
      );
      
      await redisManager.incr('stats:total_downloads');
      await redisManager.hincrby('stats:downloads_by_type', type, 1);
      
      return true;
    } catch (error) {
      logger.error('Track download error:', error);
      return false;
    }
  }

  // Track search
  async trackSearch(data) {
    try {
      const { userId, query, engine, resultsCount } = data;
      
      await pgPool.query(
        `INSERT INTO search_history (user_id, query, engine, results_count, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, query, engine, resultsCount, new Date()]
      );
      
      await redisManager.incr('stats:total_searches');
      await redisManager.zincrby('stats:popular_searches', 1, query);
      
      return true;
    } catch (error) {
      logger.error('Track search error:', error);
      return false;
    }
  }

  // Track user session
  async trackSession(data) {
    try {
      const { userId, sessionId, startTime, endTime, duration, pagesVisited } = data;
      
      await pgPool.query(
        `INSERT INTO user_sessions (user_id, session_id, start_time, end_time, duration, pages_visited, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, sessionId, startTime, endTime, duration, pagesVisited, new Date()]
      );
      
      return true;
    } catch (error) {
      logger.error('Track session error:', error);
      return false;
    }
  }

  // Get real-time stats
  async getRealtimeStats() {
    try {
      const [totalViews, totalDownloads, totalSearches, activeUsers, topPages, topDevices] = await Promise.all([
        redisManager.get('stats:total_views'),
        redisManager.get('stats:total_downloads'),
        redisManager.get('stats:total_searches'),
        redisManager.zcard('users:active'),
        redisManager.hgetall('stats:pages'),
        redisManager.hgetall('stats:devices')
      ]);
      
      return {
        totalViews: parseInt(totalViews) || 0,
        totalDownloads: parseInt(totalDownloads) || 0,
        totalSearches: parseInt(totalSearches) || 0,
        activeUsers: activeUsers || 0,
        topPages: Object.entries(topPages || {}).sort((a,b) => b[1] - a[1]).slice(0, 10),
        topDevices: Object.entries(topDevices || {}).sort((a,b) => b[1] - a[1])
      };
    } catch (error) {
      logger.error('Get realtime stats error:', error);
      return null;
    }
  }

  // Get daily stats
  async getDailyStats(date = new Date()) {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const result = await pgPool.query(
        `SELECT 
           COUNT(*) as total_views,
           COUNT(DISTINCT user_id) as unique_visitors,
           COUNT(DISTINCT ip) as unique_ips,
           COUNT(CASE WHEN page = '/' THEN 1 END) as homepage_views,
           COUNT(CASE WHEN page LIKE '/browser%' THEN 1 END) as browser_views,
           COUNT(CASE WHEN page LIKE '/social%' THEN 1 END) as social_views,
           COUNT(CASE WHEN page LIKE '/media%' THEN 1 END) as media_views
         FROM analytics 
         WHERE created_at BETWEEN $1 AND $2`,
        [startDate, endDate]
      );
      
      return result.rows[0];
    } catch (error) {
      logger.error('Get daily stats error:', error);
      return null;
    }
  }

  // Get weekly stats
  async getWeeklyStats() {
    try {
      const result = await pgPool.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as views,
           COUNT(DISTINCT user_id) as unique_users
         FROM analytics 
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Get weekly stats error:', error);
      return [];
    }
  }

  // Get popular searches
  async getPopularSearches(limit = 10) {
    try {
      const popular = await redisManager.zrevrange('stats:popular_searches', 0, limit - 1);
      const scores = await Promise.all(popular.map(p => redisManager.zscore('stats:popular_searches', p)));
      
      return popular.map((term, index) => ({
        term,
        count: parseInt(scores[index]) || 0
      }));
    } catch (error) {
      logger.error('Get popular searches error:', error);
      return [];
    }
  }

  // Get user activity timeline
  async getUserActivity(userId, days = 30) {
    try {
      const result = await pgPool.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as activities,
           array_agg(DISTINCT page) as pages
         FROM analytics 
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Get user activity error:', error);
      return [];
    }
  }

  // Clean old analytics data (keep last 90 days)
  async cleanOldData() {
    try {
      const result = await pgPool.query(
        `DELETE FROM analytics 
         WHERE created_at < NOW() - INTERVAL '90 days'
         RETURNING *`
      );
      
      logger.info(`Cleaned ${result.rowCount} old analytics records`);
      return result.rowCount;
    } catch (error) {
      logger.error('Clean old data error:', error);
      return 0;
    }
  }

  // Start scheduled tasks
  startScheduledTasks() {
    // Clean old data daily at 3 AM
    const cron = require('node-cron');
    cron.schedule('0 3 * * *', () => {
      this.cleanOldData();
    });
    
    logger.info('Analytics scheduled tasks started');
  }
}

module.exports = new AnalyticsService();
