require('dotenv').config();
const express = require('express');
const cors = require('cors');

const BACKEND_VERSION = '1.3.5';
const FRONTEND_VERSION = '1.2.1';

const app = express();

console.log('[API] Starting - DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check - simple test
app.get('/api/health', (req, res) => {
  console.log('[API] Health check called');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: process.env.DATABASE_URL ? 'configured' : 'not configured'
  });
});

// Version endpoint
app.get('/api/version', (req, res) => {
  console.log('[API] Version called');
  res.json({ 
    backend: BACKEND_VERSION, 
    frontend: FRONTEND_VERSION, 
    timestamp: new Date().toISOString() 
  });
});

// Try to load backend routes - with error handling
try {
  const { initDB } = require('../backend/src/db');
  const analyzeRouter = require('../backend/src/routes/analyze');
  const historyRouter = require('../backend/src/routes/history');
  
  console.log('[API] Backend modules loaded successfully');
  
  // Initialize DB
  initDB().catch((err) => {
    console.error('[DB] Init error:', err.message);
  });
  
  // Routes
  app.use('/api/analyze', analyzeRouter);
  app.use('/api/history', historyRouter);
} catch (error) {
  console.error('[API] Failed to load backend modules:', error.message);
  console.error('[API] Stack:', error.stack);
  
  // Provide fallback routes that return an error
  app.use('/api/analyze', (req, res) => {
    res.status(500).json({ error: 'Backend modules not loaded', details: error.message });
  });
  app.use('/api/history', (req, res) => {
    res.status(500).json({ error: 'Backend modules not loaded', details: error.message });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[API] Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: err.stack
  });
  res.status(500).json({ 
    error: err.message,
    type: err.constructor.name,
    path: req.path
  });
});

// 404 handler
app.use((req, res) => {
  console.log('[API] 404 - path not found:', req.path);
  res.status(404).json({ error: 'Not found', path: req.path });
});

console.log('[API] Express app configured');

// Export for Vercel serverless
module.exports = app;
