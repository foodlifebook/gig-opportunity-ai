require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDB } = require('../backend/src/db');
const analyzeRouter = require('../backend/src/routes/analyze');
const historyRouter = require('../backend/src/routes/history');

const BACKEND_VERSION = '1.3.5';
const FRONTEND_VERSION = '1.2.1';

const app = express();

// Initialize DB on startup
initDB().catch((err) => {
  console.error('[DB] Init error:', err.message);
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Version endpoint
app.get('/api/version', (req, res) => {
  console.log('Version endpoint called');
  res.json({ 
    backend: BACKEND_VERSION, 
    frontend: FRONTEND_VERSION, 
    timestamp: new Date().toISOString() 
  });
});

// Routes (with /api prefix since Vercel routes /api/* to this function)
app.use('/api/analyze', analyzeRouter);
app.use('/api/history', historyRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message, err.stack);
  res.status(500).json({ 
    error: err.message,
    type: err.constructor.name 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Export for Vercel serverless
module.exports = app;
