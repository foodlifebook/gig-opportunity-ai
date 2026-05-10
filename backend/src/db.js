/**
 * db.js — PostgreSQL connection pool + schema initialisation.
 *
 * The history feature is optional: if DATABASE_URL is not set or the
 * server is unreachable, initDB() logs a warning and sets dbAvailable=false.
 * All callers should check pool.available before doing DB work.
 */

const { Pool } = require('pg');

const fallbackDatabaseUrl = 'postgresql://postgres:@localhost:5434/gigopportunity?sslmode=disable';
const databaseUrl = process.env.DATABASE_URL || fallbackDatabaseUrl;

const pool = new Pool({
  connectionString: databaseUrl,
  // Short connection timeout so a missing DB doesn't stall startup
  connectionTimeoutMillis: 5000,
});

pool.available = false; // set to true after initDB succeeds

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] DATABASE_URL not set — trying fallback local PostgreSQL URL.');
  }

  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_history (
        id                  SERIAL PRIMARY KEY,
        filename            TEXT NOT NULL,
        uploaded_at         TIMESTAMPTZ DEFAULT NOW(),
        row_count           INTEGER DEFAULT 0,
        opportunity_score   NUMERIC(12, 4),
        score_label         TEXT,
        avg_queue           NUMERIC(12, 4),
        avg_growth          NUMERIC(12, 4),
        repair_stats        JSONB,
        cleaned_csv_text    TEXT,
        score_result        JSONB,
        cleaned_rows        JSONB,
        dates               JSONB,
        series_fields       JSONB
      );

      CREATE TABLE IF NOT EXISTS ai_insights (
        id           SERIAL PRIMARY KEY,
        upload_id    INTEGER REFERENCES upload_history(id) ON DELETE CASCADE,
        provider     TEXT NOT NULL,
        model_name   TEXT,
        insights     TEXT NOT NULL,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (upload_id, provider)
      );
    `);
    pool.available = true;
    console.log(`[DB] Schema ready — history enabled (${process.env.DATABASE_URL ? 'DATABASE_URL' : 'fallback URL'}).`);
  } catch (err) {
    console.warn('[DB] Schema init failed —', err.message, '— history disabled.');
  } finally {
    if (client) client.release();
  }
}

module.exports = { pool, initDB };
