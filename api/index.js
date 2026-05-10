require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const BACKEND_VERSION = '1.3.5';
const FRONTEND_VERSION = '1.2.1';

const app = express();

console.log('[API] Starting');
console.log('[API] DATABASE_URL:', process.env.DATABASE_URL ? '✓ SET' : '✗ NOT SET');
console.log('[API] NODE_ENV:', process.env.NODE_ENV);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// Health check - simple test (no dependencies)
app.get('/api/health', (req, res) => {
  console.log('[API] ✓ Health check OK');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: process.env.DATABASE_URL ? 'configured' : 'not configured',
    version: BACKEND_VERSION
  });
});

// Version endpoint
app.get('/api/version', (req, res) => {
  console.log('[API] ✓ Version called');
  res.json({ 
    backend: BACKEND_VERSION, 
    frontend: FRONTEND_VERSION, 
    timestamp: new Date().toISOString() 
  });
});

// Load backend routes - lazy load with proper error handling
let analyzeRouterLoaded = false;
let historyRouterLoaded = false;
let dbInitError = null;

app.use('/api/analyze', async (req, res, next) => {
  if (!analyzeRouterLoaded) {
    try {
      console.log('[API] Loading analyze router...');
      const analyzeRouter = require('../backend/src/routes/analyze');
      console.log('[API] ✓ Analyze router loaded');
      analyzeRouterLoaded = true;
      analyzeRouter(req, res, next);
    } catch (error) {
      console.error('[API] ✗ Failed to load analyze router:', error.message);
      dbInitError = error.message;
      res.status(500).json({ error: 'Failed to load analyze router', details: error.message });
    }
  } else {
    next();
  }
});

app.use('/api/history', async (req, res, next) => {
  if (!historyRouterLoaded) {
    try {
      console.log('[API] Loading history router...');
      const historyRouter = require('../backend/src/routes/history');
      console.log('[API] ✓ History router loaded');
      historyRouterLoaded = true;
      historyRouter(req, res, next);
    } catch (error) {
      console.error('[API] ✗ Failed to load history router:', error.message);
      dbInitError = error.message;
      res.status(500).json({ error: 'Failed to load history router', details: error.message });
    }
  } else {
    next();
  }
});

// Initialize DB in the background
try {
  const { initDB } = require('../backend/src/db');
  initDB().catch((err) => {
    console.error('[DB] Init error:', err.message);
    dbInitError = err.message;
  });
} catch (error) {
  console.error('[API] Failed to load DB module:', error.message);
  dbInitError = error.message;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[API] ✗ Error:', {
    message: err.message,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ 
    error: err.message,
    type: err.constructor.name
  });
});

// 404 handler
app.use((req, res) => {
  console.log('[API] ✗ 404 - path not found:', req.path);
  res.status(404).json({ error: 'Not found', path: req.path });
});

console.log('[API] ✓ Express app configured and ready');

// Export for Vercel serverless
module.exports = app;
