/**
 * cleanCSV.js
 *
 * Stage 0 — Delimiter detection:
 *   Auto-detects whether the uploaded file uses backtick (already cleaned by
 *   Grok/AI) or comma (raw / malformed) as its delimiter.
 *   Backtick files are parsed directly — no repair needed.
 *
 * Stage 1 — Spilled-Row Repair (comma path only):
 *   Reads raw CSV text line-by-line and detects rows where the remaining
 *   date columns were pushed onto the next 1-N lines ("spilled data").
 *   Uses precise date-block stitching: extracts the 4-value numeric block
 *   from each spill line and slots it into the correct date-group column.
 *   Reconstructs description text from continuation fragments.
 *   Output is re-serialized as backtick-delimited CSV.
 *
 * Stage 2 — Normalization:
 *   Converts date-suffixed columns (totalOrders_*, gigReviews_*,
 *   ordersInQueue_*, priceOnDay_*) into sorted time-series arrays.
 *
 * Returns: { cleanedRows, dates, seriesFields, repairStats, repairedCsvText }
 */

const Papa = require('papaparse');

// ---------------------------------------------------------------------------
// Comma-CSV parser (used on raw / malformed input)
// ---------------------------------------------------------------------------

/**
 * Parse a single comma-delimited CSV line respecting double-quoted values
 * and escaped quotes ("").
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch   = line[i];
    const next = line[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseCsvRecords(csvText) {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const result = Papa.parse(normalized, {
    header: false,
    skipEmptyLines: false,
    quoteChar: '"',
    dynamicTyping: false,
    transform: value => (value === undefined || value === null ? '' : String(value)),
  });
  return result.data || [];
}

// ---------------------------------------------------------------------------
// Backtick-CSV helpers (used on pre-cleaned input and as output format)
// ---------------------------------------------------------------------------

/**
 * Detect whether the first CSV line uses backtick or comma as its delimiter.
 * Backtick-delimited files (from Grok/AI cleaning) will have many backticks.
 */
function detectDelimiter(firstLine) {
  const backtickCount = (firstLine.match(/`/g) || []).length;
  const commaCount    = (firstLine.match(/,/g) || []).length;
  return backtickCount >= 5 && backtickCount > commaCount / 2 ? '`' : ',';
}

/** Parse a single backtick-delimited line (fields are never quoted). */
function parseBacktickLine(line) {
  return line.split('`');
}

/**
 * Serialize an array-of-arrays (headerFields + dataRows) as backtick CSV.
 * Any backtick in a value is replaced with a single-quote.
 */
function rowFieldsToBacktickCsv(allRows) {
  return allRows
    .map(row =>
      row
        .map(f => (f === null || f === undefined ? '' : String(f)).replace(/`/g, "'"))
        .join('`')
    )
    .join('\n');
}

/**
 * Serialize an array of row-objects as backtick-delimited CSV.
 */
function rowsToCsvBacktick(rows, headers) {
  const headerList =
    Array.isArray(headers) && headers.length > 0
      ? headers
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach(k => set.add(k));
            return set;
          }, new Set())
        );

  const esc = value =>
    (value === null || value === undefined ? '' : String(value)).replace(/`/g, "'");

  const lines = [headerList.map(esc).join('`')];
  for (const row of rows) {
    lines.push(headerList.map(h => esc(row[h])).join('`'));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Fiverr username pattern: alphanumeric + underscores, 4-30 chars. */
const USERNAME_RE = /^[a-zA-Z0-9_]{4,30}$/;

function looksLikeUsername(value) {
  return USERNAME_RE.test((value || '').trim());
}

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString();
  return null;
}

function toNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const cleaned = String(val).replace(/[$,"'\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalizeKey(key) {
  return key.trim().replace(/\s+/g, ' ');
}

function isEmptyCell(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function hasAnyData(row) {
  return Object.values(row).some(v => !isEmptyCell(v));
}

const DATE_SERIES_RE       = /^(.+?)_(\d{4}-\d{2}-\d{2})$/;
const DATE_SERIES_PREFIXES = ['totalorders', 'gigreviews', 'ordersinqueue', 'priceonday'];

function isDateSeriesKey(key) {
  const lower = key.toLowerCase();
  return DATE_SERIES_RE.test(key) && DATE_SERIES_PREFIXES.some(p => lower.startsWith(p));
}

// ---------------------------------------------------------------------------
// Gig-ID consolidation (multi-row records → single row)
// ---------------------------------------------------------------------------

function detectGigIdKey(rows) {
  if (!rows || rows.length === 0) return null;
  for (const key of Object.keys(rows[0])) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized === 'gigid' || normalized.includes('gigid')) return key;
  }
  return null;
}

function isTimeSeriesField(fieldName) {
  // Time-series fields follow pattern: name_YYYY-MM-DD or name_YYYY-MM-DD_suffix
  return /[^_]+_\d{4}-\d{2}-\d{2}/.test(fieldName);
}

function mergeRowIntoTarget(target, source, gigIdKey) {
  for (const [key, value] of Object.entries(source)) {
    if (isEmptyCell(value)) continue;
    if (key === gigIdKey && !isEmptyCell(target[key])) continue;
    
    // For time-series fields, validate before overwriting
    if (isTimeSeriesField(key)) {
      const targetValue = target[key];
      if (!isEmptyCell(targetValue)) {
        // Both target and source have values - validate before overwriting
        const sourceNum = parseFloat(value);
        const targetNum = parseFloat(targetValue);
        
        if (!isNaN(sourceNum) && !isNaN(targetNum)) {
          // Keep the smaller value (reject spike-inflated values)
          if (sourceNum < targetNum) {
            target[key] = value; // Actually write the smaller correct value
          }
          // Either way, don't fall through to the isEmptyCell check below
          continue;
        }
      }
    }
    
    // Only non-time-series fields or empty targets reach here
    if (isEmptyCell(target[key])) target[key] = value;
  }
}

function consolidateRowsByGigId(rows) {
  const gigIdKey = detectGigIdKey(rows);
  if (!gigIdKey) {
    return {
      rows,
      stats: { gigGroupsFound: 0, continuationRowsMerged: 0, orphanRowsPromoted: 0 },
    };
  }

  const consolidated = [];
  let current = null;
  let continuationRowsMerged = 0;
  let orphanRowsPromoted = 0;

  for (const row of rows) {
    if (!hasAnyData(row)) continue;
    const hasGigId = !isEmptyCell(row[gigIdKey]);
    if (hasGigId) {
      if (current) consolidated.push(current);
      current = { ...row };
    } else if (!current) {
      current = { ...row };
      orphanRowsPromoted++;
    } else {
      mergeRowIntoTarget(current, row, gigIdKey);
      continuationRowsMerged++;
    }
  }
  if (current) consolidated.push(current);

  return {
    rows: consolidated,
    stats: { gigGroupsFound: consolidated.length, continuationRowsMerged, orphanRowsPromoted },
  };
}

/** Legacy comma-output serializer (kept for internal compatibility). */
function rowsToCsv(rows, headers) {
  const headerList =
    Array.isArray(headers) && headers.length > 0
      ? headers
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach(k => set.add(k));
            return set;
          }, new Set())
        );

  const quoteIfNeeded = value => {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const lines = [headerList.map(quoteIfNeeded).join(',')];
  for (const row of rows) {
    lines.push(headerList.map(h => quoteIfNeeded(row[h])).join(','));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Stage 1: Spilled-Row Repair (comma-delimited input only)
// ---------------------------------------------------------------------------

/**
 * Classify a spill line and extract a description fragment and/or a
 * 4-value date block (totalOrders, gigReviews, ordersInQueue, priceOnDay).
 *
 * Pattern A — block visible at end of parsed fields:
 *   [descFrag?, ε×(4*groupIdx), N, N, N, $N, ε×trailing...]
 *   Empty-field count between field-0 and the block → date-group index.
 *
 * Pattern B — block embedded inside field-0 (single quoted value):
 *   Field 0 contains "some text,N,N,N,$N" — split by comma to extract.
 *
 * Returns { descFragment, isDateBlock, dateGroupIdx, blockValues }
 *   dateGroupIdx = -1 when position is unknown; caller fills first empty slot.
 * 
 * @param {Array} fields - Parsed CSV fields
 * @param {number} dateStartCol - Column index where date-series columns begin (to exclude static columns from count)
 */
function classifySpillLine(fields, dateStartCol) {
  if (fields.length === 0) {
    return { descFragment: null, isDateBlock: false, dateGroupIdx: -1, blockValues: null };
  }

  const firstField = (fields[0] || '').trim();

  const isBlock4 = arr =>
    arr.length === 4 &&
    /^\d+$/.test((arr[0] || '').trim()) &&
    /^\d+$/.test((arr[1] || '').trim()) &&
    /^\d+$/.test((arr[2] || '').trim()) &&
    /^\$?\d+(\.\d+)?$/.test((arr[3] || '').trim());

  // ── Pattern A ────────────────────────────────────────────────────────────
  if (fields.length >= 4) {
    let endIdx = fields.length - 1;
    while (endIdx >= 0 && (fields[endIdx] || '').trim() === '') endIdx--;

    if (endIdx >= 3) {
      const cand = [fields[endIdx - 3], fields[endIdx - 2], fields[endIdx - 1], fields[endIdx]];
      if (isBlock4(cand)) {
        // FIX: Start slice at dateStartCol to exclude ~22 static column empties
        // This prevents the ~22 empty static columns from inflating the dateGroupIdx
        const effectiveStart = dateStartCol > 0 ? dateStartCol : 1;
        const middle     = fields.slice(effectiveStart, endIdx - 3);
        const emptyCount = middle.filter(f => (f || '').trim() === '').length;
        const raw        = emptyCount / 4;
        return {
          descFragment: firstField || null,
          isDateBlock:  true,
          dateGroupIdx: Number.isInteger(raw) ? raw : Math.round(raw),
          blockValues:  cand.map(f => (f || '').trim()),
        };
      }
    }
  }

  // ── Pattern B ────────────────────────────────────────────────────────────
  const inner = firstField.split(',').map(s => s.trim());
  if (inner.length >= 5) {
    const last4 = inner.slice(-4);
    if (isBlock4(last4)) {
      return {
        descFragment: inner.slice(0, -4).join(', ').trim() || null,
        isDateBlock:  true,
        dateGroupIdx: -1,
        blockValues:  last4,
      };
    }
  }

  return { descFragment: firstField || null, isDateBlock: false, dateGroupIdx: -1, blockValues: null };
}

/**
 * Repair raw comma-CSV text by merging spilled continuation lines back
 * into their parent rows using precise date-block stitching.
 *
 * Output is backtick-delimited CSV (safe: backtick never appears in gig data).
 *
 * @param {string} csvText
 * @returns {{ repairedText: string, repairStats: object }}
 */
function repairSpilledRows(csvText) {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawRecords = parseCsvRecords(normalized);

  // Locate header line
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawRecords.length, 5); i++) {
    const firstCell = rawRecords[i] && rawRecords[i][0] ? String(rawRecords[i][0]).toLowerCase() : '';
    if (firstCell.startsWith('seller') || firstCell.startsWith('"seller') || firstCell.includes('gigid')) {
      headerIdx = i;
      break;
    }
  }

  const headerFields  = (rawRecords[headerIdx] || []).map(value => (value === undefined || value === null ? '' : String(value)));
  const expectedCount = headerFields.length;

  // Locate description col and date-series start col for stitching
  const descColIdx = headerFields.findIndex(h => h.trim().toLowerCase() === 'description');
  let dateStartCol = -1;
  for (let ci = 0; ci < headerFields.length; ci++) {
    if (isDateSeriesKey(headerFields[ci].trim())) { dateStartCol = ci; break; }
  }
  const dateGroupCount = dateStartCol >= 0
    ? Math.floor((expectedCount - dateStartCol) / 4)
    : 0;

  /** Slot 4 date-block values into rowFields at the correct group position. */
  function slotDateBlock(rowFields, blockValues, groupIdx) {
    if (!blockValues || blockValues.length !== 4 || dateStartCol < 0) return;
    let g = groupIdx;
    if (g < 0 || g >= dateGroupCount) {
      // Fall back to first completely empty slot
      for (let k = 0; k < dateGroupCount; k++) {
        const s = dateStartCol + k * 4;
        if (!rowFields[s] && !rowFields[s + 1] && !rowFields[s + 2] && !rowFields[s + 3]) {
          g = k; break;
        }
      }
    }
    if (g < 0 || g >= dateGroupCount) return;
    const start = dateStartCol + g * 4;
    if (start + 3 >= expectedCount) return;
    for (let offset = 0; offset < 4; offset++) {
      if (!rowFields[start + offset]) rowFields[start + offset] = blockValues[offset];
    }
  }

  const resultRows       = [headerFields];
  let repairedRows       = 0;
  let spilledLinesMerged = 0;
  let totalDataRows      = 0;
  let i = headerIdx + 1;

  while (i < rawRecords.length) {
    const fields = (rawRecords[i] || []).map(value => (value === undefined || value === null ? '' : String(value)));
    if (fields.every(f => f.trim() === '')) { i++; continue; }

    // Skip non-gig lines (spill lines before first gig row)
    if (!looksLikeUsername((fields[0] || '').trim())) { i++; continue; }

    totalDataRows++;

    // Initialise fixed-length row from main line
    const rowFields = new Array(expectedCount).fill('');
    for (let ci = 0; ci < Math.min(fields.length, expectedCount); ci++) {
      rowFields[ci] = fields[ci];
    }

    let wasRepaired = false;
    let j = i + 1;

    // Consume all following spill lines until the next gig row
    while (j < rawRecords.length) {
      const nextFields = (rawRecords[j] || []).map(value => (value === undefined || value === null ? '' : String(value)));
      if (nextFields.every(f => f.trim() === '')) { j++; continue; }

      // Stop at next valid gig row
      if (looksLikeUsername((nextFields[0] || '').trim())) break;

      const { descFragment, isDateBlock, dateGroupIdx, blockValues } =
        classifySpillLine(nextFields, dateStartCol);

      if (isDateBlock && blockValues) {
        slotDateBlock(rowFields, blockValues, dateGroupIdx);
      }

      if (descFragment && descColIdx >= 0) {
        const existing = rowFields[descColIdx] || '';
        if (!existing) {
          rowFields[descColIdx] = descFragment;
        } else if (!existing.includes(descFragment)) {
          rowFields[descColIdx] = existing + '\n' + descFragment;
        }
      }

      j++;
      spilledLinesMerged++;
      wasRepaired = true;
    }

    i = j;
    if (wasRepaired) repairedRows++;
    resultRows.push(rowFields);
  }

  // Output as backtick-delimited CSV
  const repairedText = rowFieldsToBacktickCsv(resultRows);

  return {
    repairedText,
    repairStats: {
      totalRows: totalDataRows,
      repairedRows,
      spilledLinesMerged,
      expectedFieldCount: expectedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Normalize rows into time-series objects
// ---------------------------------------------------------------------------

function extractTimeSeriesColumns(row) {
  const series       = {};
  const staticFields = {};

  for (const [key, val] of Object.entries(row)) {
    const nk    = normalizeKey(key);
    const match = nk.match(DATE_SERIES_RE);

    if (match && isDateSeriesKey(nk)) {
      const fieldName = match[1].trim();
      const date      = match[2];
      if (!series[fieldName]) series[fieldName] = [];
      series[fieldName].push({ date, value: toNumber(val) });
    } else {
      staticFields[nk] = val;
    }
  }

  for (const field of Object.keys(series)) {
    series[field].sort((a, b) => a.date.localeCompare(b.date));
  }

  return { series, staticFields };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main entry point.  Accepts either:
 *   - rawText {string}  — raw CSV file content (preferred)
 *       • Backtick-delimited (pre-cleaned by Grok/AI): parsed directly
 *       • Comma-delimited (raw/malformed): spill-repair applied first
 *   - rawRows {Array}   — pre-parsed PapaParse objects (legacy fallback)
 *
 * @returns {{ cleanedRows, dates, seriesFields, repairStats, repairedCsvText }}
 */
function cleanCSV(rawTextOrRows) {
  let repairStats = {
    totalRows:              0,
    repairedRows:           0,
    spilledLinesMerged:     0,
    expectedFieldCount:     0,
    gigGroupsFound:         0,
    continuationRowsMerged: 0,
    orphanRowsPromoted:     0,
  };

  let rowObjects      = [];
  let headerOrder     = [];
  let repairedCsvText = '';

  // ── Branch A: raw CSV text ───────────────────────────────────────────────
  if (typeof rawTextOrRows === 'string') {
    const normalized     = rawTextOrRows.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const inputDelimiter = detectDelimiter(normalized.split('\n')[0] || '');

    if (inputDelimiter === '`') {
      // ── BACKTICK PATH: already cleaned (Grok/AI output) — parse directly ─
      const rawLines = normalized.split('\n');
      if (rawLines.length < 2) throw new Error('CSV is empty.');

      const headers = parseBacktickLine(rawLines[0]).map(normalizeKey);
      headerOrder   = headers;
      rowObjects    = [];

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line.trim()) continue;
        const fields = parseBacktickLine(line);
        const obj    = {};
        headers.forEach((h, idx) => {
          obj[h] = fields[idx] !== undefined ? fields[idx].trim() : '';
        });
        if (Object.values(obj).every(v => v === '')) continue;
        rowObjects.push(obj);
      }

      repairStats.totalRows = rowObjects.length;
      repairedCsvText       = rawTextOrRows; // already clean — preserve as-is

    } else {
      // ── COMMA PATH: malformed CSV — run spill-repair pipeline ────────────
      const { repairedText, repairStats: stats } = repairSpilledRows(rawTextOrRows);
      repairStats     = stats;
      repairedCsvText = repairedText; // backtick-delimited output

      // Parse the backtick repair output
      const lines = repairedText.split('\n');
      if (lines.length < 2) throw new Error('CSV is empty or could not be repaired.');

      const headers = parseBacktickLine(lines[0]).map(normalizeKey);
      headerOrder   = headers;
      rowObjects    = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const fields = parseBacktickLine(line);
        const obj    = {};
        headers.forEach((h, idx) => {
          obj[h] = fields[idx] !== undefined ? fields[idx] : '';
        });
        if (Object.values(obj).every(v => v === '')) continue;
        rowObjects.push(obj);
      }
    }

  // ── Branch B: pre-parsed PapaParse array (legacy) ────────────────────────
  } else if (Array.isArray(rawTextOrRows)) {
    rowObjects  = rawTextOrRows;
    headerOrder = rowObjects[0] ? Object.keys(rowObjects[0]) : [];
  } else {
    throw new Error('cleanCSV expects a CSV string or an array of row objects.');
  }

  if (rowObjects.length === 0) throw new Error('CSV is empty or invalid.');

  // ── Consolidate multi-row gig records by Gig ID ──────────────────────────
  const consolidation = consolidateRowsByGigId(rowObjects);
  rowObjects   = consolidation.rows;
  repairStats  = { ...repairStats, ...consolidation.stats };

  // Export cleaned CSV as backtick-delimited (for download / history storage)
  repairedCsvText = rowsToCsvBacktick(rowObjects, headerOrder);

  // ── Normalize rows into time-series objects ───────────────────────────────
  const cleanedRows = rowObjects
    .filter(row => Object.values(row).some(v => v !== null && v !== '' && v !== undefined))
    .map((row, index) => {
      const { series, staticFields } = extractTimeSeriesColumns(row);
      const cleaned = { _rowIndex: index };

      for (const [k, v] of Object.entries(staticFields)) {
        const lower = k.toLowerCase();
        if (
          lower.includes('lastupdated') ||
          lower.includes('date') ||
          lower.includes('createdat')
        ) {
          cleaned[k] = parseDate(v) || (v ? v.trim() : null);
        } else {
          cleaned[k] = v !== undefined && v !== '' ? String(v).trim() : null;
        }
      }

      for (const [field, points] of Object.entries(series)) {
        cleaned[`_series_${field}`] = points;
      }

      return cleaned;
    });

  // ── Collect unique dates and series field names ───────────────────────────
  const dateSet        = new Set();
  const seriesFieldSet = new Set();

  for (const row of cleanedRows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_series_')) {
        const fieldName = key.replace('_series_', '');
        seriesFieldSet.add(fieldName);
        row[key].forEach(p => dateSet.add(p.date));
      }
    }
  }

  const dates        = Array.from(dateSet).sort();
  const seriesFields = Array.from(seriesFieldSet);

  return { cleanedRows, dates, seriesFields, repairStats, repairedCsvText };
}

module.exports = { cleanCSV, repairSpilledRows, parseCsvLine };