import { useState, useRef } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import {
  IconUpload,
  IconFile,
  IconX,
  IconLoader2,
  IconCircleCheck,
  IconAlertCircle,
  IconTool,
  IconBrush,
  IconDownload,
  IconChartBar,
  IconTrash,
  IconWand,
} from '@tabler/icons-react';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Stat card helper                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */
function StatCard({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-center ${
        highlight
          ? 'bg-amber-500/10 border border-amber-500/30'
          : 'bg-gray-800/60'
      }`}
    >
      <p className={`text-xl font-bold ${highlight ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function UploadTab({ onAnalysisComplete }) {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);

  /**
   * status:
   *   idle      – nothing uploaded
   *   parsing   – papaparse client-side preview
   *   ready     – file selected, 3 action buttons visible
   *   cleaning  – /upload endpoint in progress (clean mode)
   *   uploading – /upload endpoint in progress (analyze mode)
   *   done      – completed
   *   error     – something went wrong
   */
  const [status, setStatus] = useState('idle');
  const [actionMode, setActionMode] = useState(null); // 'analyze' | 'clean'
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [repairStats, setRepairStats] = useState(null);
  const [cleanedCsvText, setCleanedCsvText] = useState(null);
  const [cleanedTableRows, setCleanedTableRows] = useState([]);
  const [cleanedTableColumns, setCleanedTableColumns] = useState([]);
  const [batchResults, setBatchResults] = useState([]);

  const inputRef = useRef();

  /* ── Reset everything ────────────────────────────────────────────────── */
  const reset = () => {
    setFile(null);
    setFiles([]);
    setStatus('idle');
    setActionMode(null);
    setError('');
    setPreview(null);
    setRepairStats(null);
    setCleanedCsvText(null);
    setCleanedTableRows([]);
    setCleanedTableColumns([]);
    setBatchResults([]);
  };

  /* ── Accept files (drag-drop or browse) ─────────────────────────────── */
  const handleFiles = (incomingFiles) => {
    const list = Array.from(incomingFiles || []);
    if (list.length === 0) return;

    const valid = list.filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
    });

    if (valid.length === 0) {
      setError('Please upload .csv or .xlsx files.');
      return;
    }

    setFiles(valid);
    setFile(valid[0]);
    setError('');
    setRepairStats(null);
    setCleanedCsvText(null);
    setBatchResults([]);

    const first = valid[0];
    const name = first.name.toLowerCase();
    const isCSV = name.endsWith('.csv');

    if (isCSV) {
      setStatus('parsing');
      const reader = new FileReader();
      const runParse = (delimiter) => {
        Papa.parse(first, {
          header: true,
          skipEmptyLines: true,
          preview: 5,
          delimiter,
          complete: (results) => { setPreview(results); setStatus('ready'); },
          error: (err) => { setError('Failed to parse CSV: ' + err.message); setStatus('error'); },
        });
      };
      reader.onload = (e) => {
        const sample    = e.target.result || '';
        const firstLine = sample.split('\n')[0] || '';
        const btCount   = (firstLine.match(/`/g) || []).length;
        const cmCount   = (firstLine.match(/,/g) || []).length;
        runParse(btCount >= 5 && btCount > cmCount / 2 ? '`' : ',');
      };
      reader.onerror = () => runParse(',');
      reader.readAsText(first.slice(0, 1024));
    } else {
      // XLSX — no client-side preview without the xlsx lib
      setPreview(null);
      setStatus('ready');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  /* ── Download the repaired CSV ───────────────────────────────────────── */
  const downloadCleanedCSV = () => {
    if (!cleanedCsvText) return;
    const blob = new Blob([cleanedCsvText], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = file
      ? file.name.replace(/\.(csv|xlsx?)$/i, '_cleaned.csv')
      : 'cleaned.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── Shared upload logic ─────────────────────────────────────────────── */
  const doUpload = async (mode) => {
    if (files.length === 0) return;
    setActionMode(mode);
    setStatus(mode === 'clean' ? 'cleaning' : 'uploading');
    setError('');
    setBatchResults([]);

    if (mode === 'clean' && files.length > 1) {
      setError('Clean Up supports one file at a time. For multiple files, use Analyze.');
      setStatus('ready');
      return;
    }

    if (mode === 'analyze' && files.length > 1) {
      const results = await Promise.allSettled(
        files.map(async (f) => {
          const formData = new FormData();
          formData.append('csv', f);
          const { data } = await axios.post('/api/analyze/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          return { ok: true, filename: f.name, data };
        })
      );

      const normalized = results.map((r, idx) => {
        if (r.status === 'fulfilled') return r.value;
        return {
          ok: false,
          filename: files[idx]?.name || `file-${idx + 1}`,
          error: r.reason?.response?.data?.error || r.reason?.message || 'Unknown error',
        };
      });

      setBatchResults(normalized);
      setStatus('done');
      const firstSuccess = normalized.find((r) => r.ok && r.data);
      if (firstSuccess) {
        onAnalysisComplete(firstSuccess.data, { mode: 'batch' });
      }
      return;
    }

    const formData = new FormData();
    formData.append('csv', files[0]);

    try {
      const { data } = await axios.post('/api/analyze/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStatus('done');
      if (data.repairStats) setRepairStats(data.repairStats);
      if (data.cleanedCsvText) setCleanedCsvText(data.cleanedCsvText);

      const plainRows = (data.cleanedRows || []).map((row) => {
        const plain = {};
        for (const [k, v] of Object.entries(row)) {
          if (!k.startsWith('_series_') && k !== '_rowIndex') plain[k] = v;
        }
        return plain;
      });

      const colSet = new Set();
      plainRows.forEach((row) => Object.keys(row).forEach((key) => colSet.add(key)));
      setCleanedTableRows(plainRows);
      setCleanedTableColumns(Array.from(colSet));

      onAnalysisComplete(data, { mode });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      setStatus('error');
    }
  };

  const isLoading = status === 'cleaning' || status === 'uploading' || status === 'parsing';
  const showButtons = files.length > 0 && status === 'ready';
  const showDone = status === 'done';

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Upload Your File</h2>
        <p className="text-gray-400 text-sm">
          Upload a Fiverr niche research CSV or XLSX — then choose to analyze it directly or
          clean &amp; repair it first.
        </p>
      </div>

      {/* ── Drop Zone ──────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isLoading && files.length === 0 && inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center
          ${!file ? 'cursor-pointer' : ''}
          ${dragging ? 'border-sky-400 bg-sky-500/10' : 'border-gray-700 hover:border-sky-600 hover:bg-gray-900/60'}
          ${files.length > 0 ? 'border-sky-600 bg-sky-500/5' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {files.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
              <IconUpload size={28} className="text-sky-400" />
            </div>
            <div>
              <p className="text-white font-semibold">Drop your file here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            </div>
            <p className="text-gray-600 text-xs">Max 10 MB · CSV or XLSX</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <IconFile size={24} className="text-sky-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold">
                {files.length === 1 ? files[0].name : `${files.length} files selected`}
              </p>
              <p className="text-gray-500 text-sm">
                {files.length === 1
                  ? `${(files[0].size / 1024).toFixed(1)} KB`
                  : 'Will analyze all files simultaneously'}
              </p>
            </div>
          </div>
        )}
      </div>

      {files.length > 1 && status === 'ready' && (
        <div className="text-xs text-gray-500">
          Batch mode ready: click <span className="text-sky-400 font-medium">Analyze</span> to process all files in parallel and save each to History.
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
          <IconAlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Raw CSV preview table ───────────────────────────────────────── */}
      {preview && preview.data.length > 0 && status === 'ready' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">
              Raw Preview{' '}
              <span className="text-gray-500 font-normal">(first 5 rows, before cleaning)</span>
            </h3>
            <button onClick={reset} className="text-gray-500 hover:text-gray-300">
              <IconX size={16} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-400">
              <thead>
                <tr className="border-b border-gray-800">
                  {preview.meta.fields.slice(0, 8).map((f) => (
                    <th key={f} className="text-left py-2 pr-4 text-gray-500 font-medium whitespace-nowrap">
                      {f.length > 22 ? f.slice(0, 22) + '…' : f}
                    </th>
                  ))}
                  {preview.meta.fields.length > 8 && (
                    <th className="text-gray-600 text-left py-2">
                      +{preview.meta.fields.length - 8} more cols
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.data.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    {preview.meta.fields.slice(0, 8).map((f) => (
                      <td key={f} className="py-2 pr-4 whitespace-nowrap max-w-[140px] truncate">
                        {String(row[f] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-600 text-xs">{preview.meta.fields.length} columns detected</p>
        </div>
      )}

      {/* ── Loading progress card ───────────────────────────────────────── */}
      {(status === 'cleaning' || status === 'uploading') && (
        <div className="card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
            <IconLoader2 size={20} className="animate-spin text-sky-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">
              {status === 'cleaning'
                ? 'Cleaning & Repairing Your File…'
                : 'Analyzing Your Data…'}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              {status === 'cleaning'
                ? 'Detecting spilled rows, merging continuation lines, normalizing columns…'
                : 'Calculating Opportunity Score, extracting time-series data…'}
            </p>
          </div>
        </div>
      )}

      {/* ── THREE ACTION BUTTONS ───────────────────────────────────────── */}
      {showButtons && (
        <div className="card p-5 space-y-4">
          <p className="text-sm text-gray-400 font-medium">Choose how to process your file:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* 1 ── Analyze */}
            <button
              onClick={() => doUpload('analyze')}
              className="group flex flex-col items-center gap-3 rounded-xl border border-sky-700 bg-sky-500/10 hover:bg-sky-500/20 hover:border-sky-500 px-4 py-5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
                <IconChartBar size={20} className="text-sky-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Analyze</p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Calculate Opportunity Score and generate charts
                </p>
              </div>
            </button>

            {/* 2 ── Clean Up File */}
            <button
              onClick={() => doUpload('clean')}
              disabled={files.length > 1}
              className="group flex flex-col items-center gap-3 rounded-xl border border-purple-700 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-500 px-4 py-5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                <IconBrush size={20} className="text-purple-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Clean Up File</p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  {files.length > 1
                    ? 'Single file only in clean mode'
                    : 'Repair spilled rows, fix columns, then analyze'}
                </p>
              </div>
            </button>

            {/* 3 ── Clear Upload */}
            <button
              onClick={reset}
              className="group flex flex-col items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/40 hover:bg-red-500/10 hover:border-red-700 px-4 py-5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                <IconTrash size={20} className="text-gray-500 group-hover:text-red-400 transition-colors" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Clear Upload</p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Remove this file and start over
                </p>
              </div>
            </button>

          </div>
        </div>
      )}

      {/* ── Post-clean detailed report card ────────────────────────────── */}
      {showDone && actionMode === 'clean' && repairStats && (
        <div className="card p-5 space-y-4 border border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center gap-2">
            <IconWand size={18} className="text-purple-400" />
            <h3 className="font-semibold text-white text-sm">Clean-Up Report</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Rows" value={repairStats.totalRows} />
            <StatCard
              label="Rows Repaired"
              value={repairStats.repairedRows}
              highlight={repairStats.repairedRows > 0}
            />
            <StatCard label="Lines Merged" value={repairStats.spilledLinesMerged} />
            <StatCard label="Columns" value={repairStats.expectedFieldCount} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Gig Groups" value={repairStats.gigGroupsFound ?? 0} />
            <StatCard label="Rows Merged by Gig ID" value={repairStats.continuationRowsMerged ?? 0} />
            <StatCard label="Orphan Rows Promoted" value={repairStats.orphanRowsPromoted ?? 0} />
          </div>

          {repairStats.repairedRows > 0 ? (
            <div className="flex items-start gap-2 text-amber-400/90 text-xs">
              <IconTool size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong>{repairStats.repairedRows}</strong> rows had data spilled across multiple
                lines — all merged back into the correct structure.{' '}
                <strong>{repairStats.spilledLinesMerged}</strong> continuation line
                {repairStats.spilledLinesMerged !== 1 ? 's' : ''} stitched together.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-400/90 text-xs">
              <IconCircleCheck size={14} />
              <span>Your file was already clean — no structural issues found.</span>
            </div>
          )}

          {cleanedCsvText && (
            <button
              onClick={downloadCleanedCSV}
              className="flex items-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-600/50 hover:border-purple-500 text-purple-300 hover:text-purple-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 w-fit"
            >
              <IconDownload size={15} />
              Download Cleaned CSV{' '}
              <span className="opacity-50 font-normal text-xs">(backtick-delimited)</span>
            </button>
          )}
        </div>
      )}

      {/* ── Cleaned data verification table ───────────────────────────── */}
      {showDone && actionMode === 'clean' && cleanedTableRows.length > 0 && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">
              Cleaned Data Verification
            </h3>
            <p className="text-gray-500 text-xs">
              {cleanedTableRows.length} rows · {cleanedTableColumns.length} columns
            </p>
          </div>

          <p className="text-gray-500 text-xs">
            Scroll horizontally and vertically to inspect all cleaned rows and columns.
          </p>

          <div className="overflow-auto max-h-[460px] rounded-xl border border-gray-800">
            <table className="text-xs text-gray-300 min-w-max w-full">
              <thead className="bg-gray-900 sticky top-0 z-10">
                <tr className="border-b border-gray-800">
                  {cleanedTableColumns.map((col) => (
                    <th key={col} className="text-left py-2 px-3 text-gray-500 font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cleanedTableRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    {cleanedTableColumns.map((col) => (
                      <td key={`${rowIndex}-${col}`} className="py-2 px-3 whitespace-nowrap align-top">
                        {row[col] === null || row[col] === undefined || row[col] === '' ? '—' : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Post-analyze light repair notice ───────────────────────────── */}
      {showDone && actionMode === 'analyze' && repairStats?.repairedRows > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 text-sm">
          <IconTool size={18} className="shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold">Auto-Repair Applied</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              {repairStats.repairedRows} rows had spilled data that was automatically merged before
              analysis.
            </p>
          </div>
          {cleanedCsvText && (
            <button
              onClick={downloadCleanedCSV}
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-xs font-medium shrink-0 transition-colors"
            >
              <IconDownload size={13} />
              Download
            </button>
          )}
        </div>
      )}

      {/* ── Batch analysis summary ─────────────────────────────────────── */}
      {showDone && actionMode === 'analyze' && batchResults.length > 0 && (
        <div className="card p-5 space-y-3 border border-sky-500/30 bg-sky-500/5">
          <h3 className="text-sm font-semibold text-white">Batch Analysis Results</h3>
          <p className="text-xs text-gray-500">
            {batchResults.filter((r) => r.ok).length} succeeded · {batchResults.filter((r) => !r.ok).length} failed.
            Successful files are already saved in History.
          </p>
          <div className="max-h-56 overflow-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs text-gray-300">
              <thead className="bg-gray-900 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500">File</th>
                  <th className="text-left px-3 py-2 text-gray-500">Status</th>
                  <th className="text-left px-3 py-2 text-gray-500">Primary Score</th>
                  <th className="text-left px-3 py-2 text-gray-500">Label</th>
                </tr>
              </thead>
              <tbody>
                {batchResults.map((r, i) => (
                  <tr key={`${r.filename}-${i}`} className="border-t border-gray-800/60">
                    <td className="px-3 py-2">{r.filename}</td>
                    <td className={`px-3 py-2 ${r.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {r.ok ? 'Saved' : 'Failed'}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? r.data?.scoreResult?.score ?? '—' : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? r.data?.scoreResult?.label ?? '—' : (r.error || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Done state ─────────────────────────────────────────────────── */}
      {showDone && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
            <IconCircleCheck size={18} />
            {actionMode === 'clean'
              ? 'File cleaned & analyzed — review cleaned table below or open Dashboard when ready'
              : batchResults.length > 0
                ? 'Batch analysis complete — open History to review all files'
                : 'Analysis complete — see the Dashboard tab'}
          </div>
          <button onClick={reset} className="btn-secondary flex items-center gap-2 text-xs">
            <IconUpload size={14} />
            Upload Another File
          </button>
        </div>
      )}

      {/* ── Info card ──────────────────────────────────────────────────── */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">What does "Clean Up File" fix?</h3>
        <ul className="space-y-1.5 text-sm text-gray-400">
          {[
            'Spilled rows — date columns that wrapped onto the next line are merged back',
            'Column names — extra spaces, mixed casing, and inconsistent formatting normalized',
            'Price strings — "$100" → 100, removes commas and currency symbols',
            'Empty numeric cells — filled with 0 so charts and scores work correctly',
            'Date-series columns — e.g. totalOrders_2026-03-11 extracted into time series',
            'Outputs a fresh, downloadable .csv with every issue resolved',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}
