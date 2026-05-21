// config/database.js - Multi-Database Configuration
const mongoose = require('mongoose');
const { Pool } = require('pg');
const { createClient } = require('redis');
const winston = require('winston');

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/database.log' })
  ]
});

// MongoDB Connection
let mongodbConnection = null;
let pgPool = null;
let redisClient = null;

const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zass';
    
    const options = {
      maxPoolSize: 100,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
    
    mongodbConnection = await mongoose.connect(mongoURI, options);
    logger.info('MongoDB connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
    return mongodbConnection;
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
};

// PostgreSQL Connection
const connectPostgreSQL = async () => {
  try {
    const pgConfig = {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'zass',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      max: 50,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    };
    
    pgPool = new Pool(pgConfig);
    
    // Test connection
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('PostgreSQL connected successfully');
    
    // Create tables if not exists
    await createTables();
    
    return pgPool;
  } catch (error) {
    logger.error('PostgreSQL connection failed:', error);
    throw error;
  }
};

// Create PostgreSQL tables
const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(100),
      avatar_url TEXT,
      bio TEXT,
      location VARCHAR(100),
      website VARCHAR(255),
      role VARCHAR(20) DEFAULT 'user',
      status VARCHAR(20) DEFAULT 'active',
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS analytics (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      event_type VARCHAR(50),
      event_data JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS downloads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      url TEXT NOT NULL,
      filename VARCHAR(255),
      file_size BIGINT,
      status VARCHAR(20),
      downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS search_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      query TEXT NOT NULL,
      engine VARCHAR(50),
      results_count INTEGER,
      searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at)`
  ];
  
  for (const query of queries) {
    try {
      await pgPool.query(query);
    } catch (error) {
      logger.error('Error creating table:', error);
    }
  }
  
  logger.info('PostgreSQL tables created/verified');
};

// Redis Connection
const connectRedis = async () => {
  try {
    const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD;
    
    redisClient = createClient({
      url: redisURL,
      password: redisPassword,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Redis max reconnection attempts');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });
    
    redisClient.on('ready', () => {
      logger.info('Redis ready');
    });
    
    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

// Get MongoDB connection
const getMongoDB = () => {
  if (!mongodbConnection) {
    throw new Error('MongoDB not connected');
  }
  return mongodbConnection;
};

// Get PostgreSQL pool
const getPostgreSQL = () => {
  if (!pgPool) {
    throw new Error('PostgreSQL not connected');
  }
  return pgPool;
};

// Get Redis client
const getRedis = () => {
  if (!redisClient) {
    throw new Error('Redis not connected');
  }
  return redisClient;
};

// Close all connections
const closeConnections = async () => {
  if (mongodbConnection) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
  
  if (pgPool) {
    await pgPool.end();
    logger.info('PostgreSQL disconnected');
  }
  
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis disconnected');
  }
};

// Initialize all databases
const initializeDatabases = async () => {
  try {
    await connectMongoDB();
    await connectPostgreSQL();
    await connectRedis();
    logger.info('All databases initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
};

module.exports = {
  connectMongoDB,
  connectPostgreSQL,
  connectRedis,
  getMongoDB,
  getPostgreSQL,
  getRedis,
  closeConnections,
  initializeDatabases
};
