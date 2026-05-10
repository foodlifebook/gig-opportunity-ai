/**
 * xlsxToCSV.js
 * Converts an XLSX (or XLS) file buffer to a CSV string using SheetJS.
 * Reads the first worksheet only.
 */

const XLSX = require('xlsx');

/**
 * @param {Buffer} buffer  - Raw file buffer from multer
 * @returns {string}       - CSV text ready for cleanCSV()
 */
function xlsxToCSV(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('XLSX file contains no worksheets.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // sheet_to_csv produces a standard CSV string with quoted fields where needed
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, RS: '\n' });
  return csv;
}

module.exports = { xlsxToCSV };
