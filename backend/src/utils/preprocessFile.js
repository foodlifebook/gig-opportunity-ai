const Papa = require('papaparse');

function detectDelimiter(firstLine) {
  const backtickCount = (firstLine.match(/`/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return backtickCount >= 5 && backtickCount > commaCount / 2 ? '`' : ',';
}

function normalizeKey(key) {
  return String(key || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function quoteIfNeeded(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCommaCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headerRow = rows[0];
  const lines = [headerRow.map(quoteIfNeeded).join(',')];
  for (let i = 1; i < rows.length; i++) {
    lines.push(rows[i].map(quoteIfNeeded).join(','));
  }
  return lines.join('\n');
}

function preprocessCSVText(rawCsvText) {
  if (typeof rawCsvText !== 'string') {
    throw new Error('preprocessCSVText expects a string.');
  }

  const normalized = rawCsvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = normalized.split('\n')[0] || '';
  const delimiter = detectDelimiter(firstLine);

  const parsed = Papa.parse(normalized, {
    header: false,
    skipEmptyLines: false,
    quoteChar: '"',
    delimiter,
    dynamicTyping: false,
    transform: value => (value === undefined || value === null ? '' : String(value)),
  });

  if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) {
    return {
      csvText: normalized,
      descriptionRows: [],
      descriptionHeader: null,
      descriptionColumnRemoved: false,
      parseErrors: parsed.errors || [],
    };
  }

  const rows = parsed.data;
  const headerRow = rows[0].map(value => String(value || '').trim());
  const descIndex = headerRow.findIndex(h => normalizeKey(h) === 'description');

  if (descIndex < 0) {
    return {
      csvText: normalized,
      descriptionRows: [],
      descriptionHeader: null,
      descriptionColumnRemoved: false,
      parseErrors: parsed.errors || [],
    };
  }

  const descriptionRows = rows.slice(1).map((row, idx) => ({
    rowIndex: idx + 1,
    description: row[descIndex] !== undefined ? String(row[descIndex]) : '',
  }));

  const rowsWithoutDescription = rows.map(row => row.filter((_, index) => index !== descIndex));
  const csvText = rowsToCommaCsv(rowsWithoutDescription);

  return {
    csvText,
    descriptionRows,
    descriptionHeader: headerRow[descIndex],
    descriptionColumnRemoved: true,
    descriptionColumnIndex: descIndex,
    parseErrors: parsed.errors || [],
  };
}

module.exports = { preprocessCSVText };
