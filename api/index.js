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
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Mount existing backend routers from /backend/src
try {
  const analyzeRouter = require('../backend/src/routes/analyze');
  const historyRouter = require('../backend/src/routes/history');
  app.use('/api/analyze', analyzeRouter);
  app.use('/api/history', historyRouter);
} catch (err) {
  console.error('[API] Failed to mount routers:', err && err.message ? err.message : err);
}

// Simple error handler
app.use((err, req, res, next) => {
  console.error('[API] Error:', err && err.message ? err.message : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal error' });
});

module.exports = app;
