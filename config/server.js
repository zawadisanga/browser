// server.js - Heroku optimized entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (required by Heroku)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '20.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'ZASS Mega Ecosystem Ultimate',
    version: '20.0.0',
    status: 'running on Heroku',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      docs: '/docs'
    }
  });
});

// API routes
app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'operational',
    environment: process.env.NODE_ENV || 'development',
    platform: 'Heroku',
    services: {
      database: process.env.MONGODB_URI ? 'configured' : 'pending',
      redis: process.env.REDIS_URL ? 'configured' : 'pending'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 ZASS Ultimate running on port ${PORT}`);
  console.log(`📡 Health check: https://your-app.herokuapp.com/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown for Heroku
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
