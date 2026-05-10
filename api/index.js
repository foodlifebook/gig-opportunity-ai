/*
  Vercel serverless handler for the existing Express backend.
  This file mounts the existing routers and exports the Express app
  so Vercel can invoke it as a Serverless Function. Keep logic minimal
  here to avoid cold-start overhead.
*/
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Basic health endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), database: process.env.DATABASE_URL ? 'configured' : 'missing' }));

// Version endpoint
const BACKEND_VERSION = '1.3.5';
const FRONTEND_VERSION = '1.2.1';

app.get('/api/version', (req, res) => {
  res.json({ 
    backend: BACKEND_VERSION, 
    frontend: FRONTEND_VERSION, 
    timestamp: new Date().toISOString() 
  });
});

// Mount existing backend routers from /backend/src
try {
  const analyzeRouter = require('../backend/src/routes/analyze');
  const historyRouter = require('../backend/src/routes/history');
  app.use('/api/analyze', analyzeRouter);
  app.use('/api/history', historyRouter);
} catch (err) {
  console.error('[API] Failed to mount routers:', err && err.message ? err.message : err);
  
  // Define fallback routes in case of import failures
  app.post('/api/analyze/upload', (req, res) => {
    console.error('[Fallback] Analyze endpoint failed to load properly');
    res.status(500).json({ error: 'Analysis service temporarily unavailable' });
  });
  
  app.post('/api/analyze/clean', (req, res) => {
    console.error('[Fallback] Clean endpoint failed to load properly');
    res.status(500).json({ error: 'Clean service temporarily unavailable' });
  });
  
  app.post('/api/analyze/description', (req, res) => {
    console.error('[Fallback] Description endpoint failed to load properly');
    res.status(500).json({ error: 'Description service temporarily unavailable' });
  });
  
  app.post('/api/analyze/insights', (req, res) => {
    console.error('[Fallback] Insights endpoint failed to load properly');
    res.status(500).json({ error: 'Insights service temporarily unavailable' });
  });
  
  app.get('/api/history/list', (req, res) => {
    console.error('[Fallback] History endpoint failed to load properly');
    res.status(500).json({ error: 'History service temporarily unavailable' });
  });
}

// Simple error handler
app.use((err, req, res, next) => {
  console.error('[API] Error:', err && err.message ? err.message : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal error' });
});

module.exports = app;