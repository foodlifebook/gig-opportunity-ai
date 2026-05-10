/**
 * routes/history.js
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { calculateOpportunityScore } = require('../utils/calculateOpportunityScore');

router.get('/', async (req, res) => {
  if (!pool.available) return res.json({ success: true, history: [], dbDisabled: true });

  const { sort = 'date', order = 'desc', label } = req.query;

  const sortMap = {
    date: 'h.uploaded_at',
    score: 'h.opportunity_score',
    filename: 'h.filename',
    rows: 'h.row_count',
  };
  const col = sortMap[sort] || 'h.uploaded_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';

  try {
    const whereParts = [];
    const params = [];
    if (label && ['GREEN', 'YELLOW', 'RED'].includes(String(label).toUpperCase())) {
      whereParts.push(`h.score_label = $${params.length + 1}`);
      params.push(String(label).toUpperCase());
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         h.id, h.filename, h.uploaded_at, h.row_count,
         h.opportunity_score, h.score_label,
         h.avg_queue, h.avg_growth,
         h.repair_stats, h.dates, h.series_fields, h.score_result,
         COALESCE(
           json_agg(
             json_build_object(
               'provider', i.provider,
               'model_name', i.model_name,
               'generated_at', i.generated_at
             ) ORDER BY i.generated_at
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'
         ) AS saved_insights_meta
       FROM upload_history h
       LEFT JOIN ai_insights i ON i.upload_id = h.id
       ${whereClause}
       GROUP BY h.id
       ORDER BY ${col} ${dir} NULLS LAST`,
      params
    );

    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error('[History] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  if (!pool.available) return res.status(503).json({ error: 'History is disabled (no DB).' });

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const [histRow, insightsRows] = await Promise.all([
      pool.query('SELECT * FROM upload_history WHERE id = $1', [id]),
      pool.query('SELECT provider, model_name, insights, generated_at FROM ai_insights WHERE upload_id = $1', [id]),
    ]);

    if (histRow.rows.length === 0) return res.status(404).json({ error: 'Upload not found.' });

    const h = histRow.rows[0];
    const savedInsights = {};
    for (const r of insightsRows.rows) {
      savedInsights[r.provider] = {
        insights: r.insights,
        model: r.model_name,
        generatedAt: r.generated_at,
      };
    }

    res.json({
      success: true,
      data: {
        id: h.id,
        filename: h.filename,
        uploadedAt: h.uploaded_at,
        rowCount: h.row_count,
        scoreResult: h.score_result,
        dates: h.dates,
        seriesFields: h.series_fields,
        repairStats: h.repair_stats,
        cleanedCsvText: h.cleaned_csv_text,
        cleanedRows: h.cleaned_rows,
        savedInsights,
      },
    });
  } catch (err) {
    console.error('[History] Get error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!pool.available) return res.status(503).json({ error: 'History is disabled (no DB).' });

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });
    await pool.query('DELETE FROM upload_history WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[History] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/insights', async (req, res) => {
  if (!pool.available) return res.status(503).json({ error: 'History is disabled (no DB).' });

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const { provider, modelName, insights } = req.body;
    if (!provider || !insights) {
      return res.status(400).json({ error: 'provider and insights are required.' });
    }

    await pool.query(
      `INSERT INTO ai_insights (upload_id, provider, model_name, insights)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (upload_id, provider)
       DO UPDATE SET
         insights     = EXCLUDED.insights,
         model_name   = EXCLUDED.model_name,
         generated_at = NOW()`,
      [id, provider, modelName || null, insights]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[History] Save insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/reanalyze', async (req, res) => {
  if (!pool.available) return res.status(503).json({ error: 'History is disabled (no DB).' });

  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required.' });
    }

    const safeIds = ids
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isInteger(x) && x > 0);

    if (safeIds.length === 0) {
      return res.status(400).json({ error: 'No valid ids provided.' });
    }

    const result = await pool.query(
      `SELECT id, cleaned_rows, series_fields
       FROM upload_history
       WHERE id = ANY($1::int[])`,
      [safeIds]
    );

    const updated = [];
    for (const row of result.rows) {
      const cleanedRows = row.cleaned_rows || [];
      const seriesFields = row.series_fields || [];
      const next = calculateOpportunityScore({ cleanedRows, seriesFields });

      await pool.query(
        `UPDATE upload_history
         SET row_count = $2,
             opportunity_score = $3,
             score_label = $4,
             avg_queue = $5,
             avg_growth = $6,
             score_result = $7
         WHERE id = $1`,
        [
          row.id,
          cleanedRows.length,
          next.score,
          next.label,
          next.avgQueue,
          next.avgGrowth,
          JSON.stringify(next),
        ]
      );

      updated.push({ id: row.id, score: next.score, label: next.label });
    }

    return res.json({ success: true, updatedCount: updated.length, updated });
  } catch (err) {
    console.error('[History] Reanalyze error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
