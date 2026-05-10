require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDB } = require('./db');
const analyzeRouter = require('./routes/analyze');
const historyRouter = require('./routes/history');

const BACKEND_VERSION = '1.3.5'; // Updated for new tab behavior, screenshot exports, and keyword headlines

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const FRONTEND_VERSION = '1.2.1';

app.get('/api/version', (req, res) => {
  console.log('Version endpoint called');
  res.json({ 
    backend: BACKEND_VERSION, 
    frontend: FRONTEND_VERSION, 
    timestamp: new Date().toISOString() 
  });
});

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/history', historyRouter);

// Initialise DB schema then start listening
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`GigOpportunity AI backend running on port ${PORT}`);
  });
}).catch((err) => {
  // DB init failure is non-fatal — start anyway
  console.error('[DB] Fatal init error:', err.message);
  app.listen(PORT, () => {
    console.log(`GigOpportunity AI backend running on port ${PORT} (DB unavailable)`);
  });
});
