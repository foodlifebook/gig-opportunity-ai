const express = require('express');
const multer = require('multer');
const router = express.Router();

const { cleanCSV } = require('../utils/cleanCSV');
const { xlsxToCSV } = require('../utils/xlsxToCSV');
const { preprocessCSVText } = require('../utils/preprocessFile');
const { calculateOpportunityScore } = require('../utils/calculateOpportunityScore');
// Removed AI dependencies: const { getGeminiInsights } = require('../gemini');
// Removed AI dependencies: const { getBigModelInsights } = require('../bigmodel');
const { pool } = require('../db');

// Store uploads in memory (no disk writes needed)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCSV = file.mimetype === 'text/csv' || name.endsWith('.csv');
    const isXLSX =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');
    if (isCSV || isXLSX) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and XLSX files are accepted.'));
    }
  },
});

/** Determine raw CSV text from an uploaded file (CSV or XLSX). */
function resolveCSVText(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return xlsxToCSV(file.buffer);
  }
  return file.buffer.toString('utf-8');
}

/**
 * POST /api/analyze/upload
 * Accepts a CSV or XLSX file, repairs spilled rows, cleans, calculates opportunity score.
 */
router.post('/upload', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const csvText = resolveCSVText(req.file);
    const { csvText: preprocessedCsvText } = preprocessCSVText(csvText);
    const { cleanedRows, dates, seriesFields, repairStats, repairedCsvText } = cleanCSV(preprocessedCsvText);
    const scoreResult = calculateOpportunityScore({ cleanedRows, seriesFields });

    // ── Persist to history (non-fatal: app works fine without DB) ──────────
    let uploadId = null;
    if (pool.available) {
      try {
        const dbResult = await pool.query(
          `INSERT INTO upload_history
             (filename, row_count, opportunity_score, score_label, avg_queue, avg_growth,
              repair_stats, cleaned_csv_text, score_result, cleaned_rows, dates, series_fields)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            req.file.originalname,
            cleanedRows.length,
            scoreResult.score,
            scoreResult.label,
            scoreResult.avgQueue,
            scoreResult.avgGrowth,
            JSON.stringify(repairStats),
            repairedCsvText,
            JSON.stringify(scoreResult),
            JSON.stringify(cleanedRows),
            JSON.stringify(dates),
            JSON.stringify(seriesFields),
          ]
        );
        uploadId = dbResult.rows[0].id;
      } catch (dbErr) {
        console.warn('[DB] Could not save upload to history:', dbErr.message);
      }
    }

    return res.json({
      success: true,
      id: uploadId,
      filename: req.file.originalname,
      rowCount: cleanedRows.length,
      dates,
      seriesFields,
      scoreResult,
      repairStats,
      cleanedRows,
      cleanedCsvText: repairedCsvText,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze/clean
 * Cleans/repairs a CSV or XLSX file and returns the repaired CSV text.
 * Does NOT run the full analysis — use this to preview fixes and enable download.
 * Body: multipart with field name "file".
 */
router.post('/clean', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const csvText = resolveCSVText(req.file);
    const { csvText: preprocessedCsvText } = preprocessCSVText(csvText);
    const { cleanedRows, repairStats, repairedCsvText } = cleanCSV(preprocessedCsvText);

    // Return a 5-row preview as plain objects (strip internal _series_ arrays)
    const previewRows = cleanedRows.slice(0, 5).map((row) => {
      const plain = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.startsWith('_series_') && k !== '_rowIndex') plain[k] = v;
      }
      return plain;
    });

    return res.json({
      success: true,
      rowCount: cleanedRows.length,
      repairStats,
      cleanedCsvText: repairedCsvText,
      previewRows,
    });
  } catch (err) {
    console.error('Clean error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze/description
 * Extracts the description column from the uploaded CSV/XLSX file.
 * Optional query param row selects a single data row by 1-based index.
 */
router.post('/description', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const csvText = resolveCSVText(req.file);
    const { descriptionRows, descriptionHeader, descriptionColumnRemoved, parseErrors } = preprocessCSVText(csvText);

    if (!descriptionColumnRemoved) {
      return res.json({
        success: true,
        descriptionColumnRemoved: false,
        descriptionHeader: null,
        descriptionRows: [],
        parseErrors,
      });
    }

    const requestedRow = req.query.row !== undefined ? Number(req.query.row) : null;
    if (requestedRow !== null && Number.isInteger(requestedRow)) {
      const row = descriptionRows.find(r => r.rowIndex === requestedRow);
      if (!row) {
        return res.status(404).json({ error: `Row ${requestedRow} not found.` });
      }
      return res.json({ success: true, descriptionHeader, row });
    }

    return res.json({
      success: true,
      descriptionColumnRemoved: true,
      descriptionHeader,
      descriptionRows: descriptionRows.slice(0, 20),
      totalRows: descriptionRows.length,
      parseErrors,
    });
  } catch (err) {
    console.error('Description error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze/insights
 * This endpoint has been disabled as AI dependencies have been removed
 */
router.post('/insights', async (req, res) => {
  try {
    return res.status(501).json({ 
      error: 'AI insights functionality has been removed from this deployment',
      message: 'This feature is not available in this version of the application'
    });
  } catch (err) {
    console.error('Insights error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/gemini-models', (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Feature not available',
    message: 'AI models feature has been removed from this deployment'
  });
});

module.exports = router;