// config/redis.js - Redis Cache & Queue Configuration
const { createClient } = require('redis');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/redis.log' })
  ]
});

class RedisManager {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
  }
  
  async connect() {
    try {
      const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisPassword = process.env.REDIS_PASSWORD;
      
      this.client = createClient({
        url: redisURL,
        password: redisPassword,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 20) {
              logger.error('Redis max reconnection attempts reached');
              return new Error('Redis max reconnection');
            }
            return Math.min(retries * 100, 5000);
          }
        }
      });
      
      this.subscriber = createClient({
        url: redisURL,
        password: redisPassword
      });
      
      this.client.on('error', (err) => logger.error('Redis client error:', err));
      this.client.on('connect', () => logger.info('Redis client connected'));
      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info('Redis ready');
      });
      
      this.subscriber.on('error', (err) => logger.error('Redis subscriber error:', err));
      this.subscriber.on('connect', () => logger.info('Redis subscriber connected'));
      
      await this.client.connect();
      await this.subscriber.connect();
      
      return this.client;
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw error;
    }
  }
  
  // Cache methods
  async set(key, value, ttlSeconds = 3600) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      if (ttlSeconds > 0) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  }
  
  async get(key) {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  }
  
  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error:', error);
      return false;
    }
  }
  
  async exists(key) {
    try {
      return await this.client.exists(key) === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  }
  
  async expire(key, seconds) {
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis expire error:', error);
      return false;
    }
  }
  
  async ttl(key) {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis ttl error:', error);
      return -2;
    }
  }
  
  // Hash methods
  async hset(key, field, value) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      await this.client.hSet(key, field, serialized);
      return true;
    } catch (error) {
      logger.error('Redis hset error:', error);
      return false;
    }
  }
  
  async hget(key, field) {
    try {
      const value = await this.client.hGet(key, field);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis hget error:', error);
      return null;
    }
  }
  
  async hgetall(key) {
    try {
      const data = await this.client.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(data)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      logger.error('Redis hgetall error:', error);
      return {};
    }
  }
  
  async hdel(key, ...fields) {
    try {
      await this.client.hDel(key, ...fields);
      return true;
    } catch (error) {
      logger.error('Redis hdel error:', error);
      return false;
    }
  }
  
  // List methods
  async lpush(key, value) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      await this.client.lPush(key, serialized);
      return true;
    } catch (error) {
      logger.error('Redis lpush error:', error);
      return false;
    }
  }
  
  async rpush(key, value) {
    try {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      await this.client.rPush(key, serialized);
      return true;
    } catch (error) {
      logger.error('Redis rpush error:', error);
      return false;
    }
  }
  
  async lpop(key) {
    try {
      const value = await this.client.lPop(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis lpop error:', error);
      return null;
    }
  }
  
  async rpop(key) {
    try {
      const value = await this.client.rPop(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis rpop error:', error);
      return null;
    }
  }
  
  async lrange(key, start, stop) {
    try {
      const values = await this.client.lRange(key, start, stop);
      return values.map(v => {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      logger.error('Redis lrange error:', error);
      return [];
    }
  }
  
  async llen(key) {
    try {
      return await this.client.lLen(key);
    } catch (error) {
      logger.error('Redis llen error:', error);
      return 0;
    }
  }
  
  // Set methods
  async sadd(key, ...members) {
    try {
      const serialized = members.map(m => typeof m === 'object' ? JSON.stringify(m) : m);
      await this.client.sAdd(key, serialized);
      return true;
    } catch (error) {
      logger.error('Redis sadd error:', error);
      return false;
    }
  }
  
  async srem(key, ...members) {
    try {
      const serialized = members.map(m => typeof m === 'object' ? JSON.stringify(m) : m);
      await this.client.sRem(key, serialized);
      return true;
    } catch (error) {
      logger.error('Redis srem error:', error);
      return false;
    }
  }
  
  async smembers(key) {
    try {
      const members = await this.client.sMembers(key);
      return members.map(m => {
        try {
          return JSON.parse(m);
        } catch {
          return m;
        }
      });
    } catch (error) {
      logger.error('Redis smembers error:', error);
      return [];
    }
  }
  
  async sismember(key, member) {
    try {
      const serialized = typeof member === 'object' ? JSON.stringify(member) : member;
      return await this.client.sIsMember(key, serialized);
    } catch (error) {
      logger.error('Redis sismember error:', error);
      return false;
    }
  }
  
  // Sorted Set methods
  async zadd(key, score, member) {
    try {
      const serialized = typeof member === 'object' ? JSON.stringify(member) : member;
      await this.client.zAdd(key, { score, value: serialized });
      return true;
    } catch (error) {
      logger.error('Redis zadd error:', error);
      return false;
    }
  }
  
  async zrange(key, start, stop, withScores = false) {
    try {
      const results = await this.client.zRange(key, start, stop, { REV: false });
      if (withScores) {
        // Handle with scores
        return results;
      }
      return results.map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return r;
        }
      });
    } catch (error) {
      logger.error('Redis zrange error:', error);
      return [];
    }
  }
  
  async zrevrange(key, start, stop, withScores = false) {
    try {
      const results = await this.client.zRange(key, start, stop, { REV: true });
      return results.map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return r;
        }
      });
    } catch (error) {
      logger.error('Redis zrevrange error:', error);
      return [];
    }
  }
  
  // Pub/Sub methods
  async publish(channel, message) {
    try {
      const serialized = typeof message === 'object' ? JSON.stringify(message) : message;
      await this.client.publish(channel, serialized);
      return true;
    } catch (error) {
      logger.error('Redis publish error:', error);
      return false;
    }
  }
  
  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch {
          callback(message);
        }
      });
      return true;
    } catch (error) {
      logger.error('Redis subscribe error:', error);
      return false;
    }
  }
  
  async unsubscribe(channel) {
    try {
      await this.subscriber.unsubscribe(channel);
      return true;
    } catch (error) {
      logger.error('Redis unsubscribe error:', error);
      return false;
    }
  }
  
  // Utility methods
  async flushAll() {
    try {
      await this.client.flushAll();
      logger.warn('Redis flushed all data');
      return true;
    } catch (error) {
      logger.error('Redis flushAll error:', error);
      return false;
    }
  }
  
  async info() {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('Redis info error:', error);
      return null;
    }
  }
  
  async ping() {
    try {
      return await this.client.ping() === 'PONG';
    } catch (error) {
      return false;
    }
  }
  
  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Redis disconnect error:', error);
    }
  }
}

// Singleton instance
let redisManager = null;

const getRedisManager = () => {
  if (!redisManager) {
    redisManager = new RedisManager();
  }
  return redisManager;
};

module.exports = {
  RedisManager,
  getRedisManager
};
