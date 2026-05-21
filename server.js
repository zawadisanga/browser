const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node: process.version,
    env: process.env.NODE_ENV
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'ZASS Mega Ecosystem',
    version: '15.0.0',
    status: 'running',
    endpoints: { health: '/health', api: '/api/v1' }
  });
});

// API
app.get('/api/v1/status', (req, res) => {
  res.json({ status: 'operational', timestamp: new Date().toISOString() });
});

// Error handlers
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing...');
  server.close(() => process.exit(0));
});

module.exports = app;
