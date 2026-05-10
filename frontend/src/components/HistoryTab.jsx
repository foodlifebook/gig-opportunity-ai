import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  IconHistory,
  IconDownload,
  IconTrash,
  IconLoader2,
  IconAlertCircle,
  IconRefresh,
  IconArrowUp,
  IconArrowDown,
  IconFilter,
  IconFolderOff,
  IconScale,
  IconX,
  IconExternalLink,
  IconCheck,
  IconListCheck,
  IconCalculator,
  IconArrowBackUp,
  IconCalendar,
  IconTrashX,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';

const LABEL_STYLES = {
  GREEN: {
    bg: 'bg-green-500/15',
    border: 'border-green-500/40',
    text: 'text-green-400',
    dot: 'bg-green-400',
    ring: 'ring-green-500/40',
  },
  YELLOW: {
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/40',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400',
    ring: 'ring-yellow-500/40',
  },
  RED: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
    text: 'text-red-400',
    dot: 'bg-red-400',
    ring: 'ring-red-500/40',
  },
};

/* ───────────────────────────────────────────────────────────────────────────── */
/*  Helper functions for date filtering and batching                            */
/* ───────────────────────────────────────────────────────────────────────────── */

function dateOnly(iso) {
  if (!iso) return null;
  return new Date(iso).toISOString().split('T')[0];
}

function isToday(iso) {
  const today = new Date().toISOString().split('T')[0];
  return dateOnly(iso) === today;
}

function isLastWeek(iso) {
  const date = new Date(iso);
  const today = new Date();
  const weekAgo = new Date(today.setDate(today.getDate() - 7));
  return date >= weekAgo && date <= new Date();
}

function groupByDate(history) {
  const groups = {};
  history.forEach((item) => {
    const date = dateOnly(item.uploaded_at);
    if (!date) return;
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return groups;
}

function groupByBatch(historyItems) {
  if (!historyItems.length) return [];
  
  const batches = [];
  let currentBatch = [historyItems[0]];
  const batchTimeWindow = 5 * 60 * 1000; // 5 minutes to group items together
  
  for (let i = 1; i < historyItems.length; i++) {
    const prevTime = new Date(currentBatch[currentBatch.length - 1].uploaded_at).getTime();
    const currTime = new Date(historyItems[i].uploaded_at).getTime();
    
    if (currTime - prevTime <= batchTimeWindow) {
      currentBatch.push(historyItems[i]);
    } else {
      batches.push(currentBatch);
      currentBatch = [historyItems[i]];
    }
  }
  
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

function labelStyle(label) {
  return LABEL_STYLES[label?.toUpperCase()] || LABEL_STYLES.YELLOW;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ScoreBadge({ score, label, small }) {
  const s = labelStyle(label);
  const numericScore = Number(score);
  const displayScore = Number.isFinite(numericScore) ? numericScore.toFixed(1) : '—';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border font-bold
        ${s.bg} ${s.border} ${s.text}
        ${small ? 'text-xs' : 'text-sm'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {displayScore} — {label || 'N/A'}
    </span>
  );
}

function ScoreBar({ score, label }) {
  const s = labelStyle(label);
  const pct = Math.min(100, ((score || 0) / 100) * 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
      <div className={`h-full rounded-full ${s.dot}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ComparePanel({ items, onClose }) {
  const sorted = [...items].sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));

  const METRICS = [
    { key: 'opportunity_score', label: 'Final Score', fmt: (v) => (v != null ? Number(v).toFixed(2) : '—') },
    { key: 'score_label', label: 'Rating', fmt: (v) => v || '—' },
    { key: 'row_count', label: 'Total Gigs', fmt: (v) => v ?? '—' },
    { key: 'avg_queue', label: 'Avg Queue', fmt: (v) => (v != null ? Number(v).toFixed(2) : '—') },
    { key: 'avg_growth', label: 'Avg Growth', fmt: (v) => (v != null ? Number(v).toFixed(4) : '—') },
    { key: 'uploaded_at', label: 'Uploaded', fmt: (v) => fmtDate(v) },
  ];

  return (
    <div className="card border border-sky-500/30 bg-sky-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconScale size={18} className="text-sky-400" />
          <h3 className="font-bold text-white text-sm">Comparing {sorted.length} Uploads</h3>
          <span className="text-gray-500 text-xs">(sorted highest → lowest score)</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <IconX size={16} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 pr-4 text-gray-500 font-medium w-36">Metric</th>
              {sorted.map((item) => {
                const s = labelStyle(item.score_label);
                return (
                  <th key={item.id} className={`text-left py-2 pr-4 font-medium ${s.text} whitespace-nowrap`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
                      <span className="truncate max-w-[140px]" title={item.filename}>{item.filename}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                <td className="py-2 pr-4 text-gray-500 font-medium">{m.label}</td>
                {sorted.map((item) => {
                  const val = m.fmt(item[m.key]);
                  return (
                    <td key={item.id} className="py-2 pr-4 text-gray-200 font-mono">
                      {m.key === 'opportunity_score' ? (
                        <div className="space-y-1">
                          <span>{val}</span>
                          <ScoreBar score={item.opportunity_score} label={item.score_label} />
                        </div>
                      ) : val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryCard({ item, selected, onToggleSelect, onOpen, onDelete, loadingId, deletingId }) {
  const s = labelStyle(item.score_label);
  const isLoading = loadingId === item.id;
  const isDeleting = deletingId === item.id;

  const downloadCSV = (e) => {
    e.stopPropagation();
    if (!item.cleaned_csv_text) return;
    const blob = new Blob([item.cleaned_csv_text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename.replace(/\.(csv|xlsx?)$/i, '_cleaned.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`card p-5 space-y-4 transition-all duration-150 border ${selected ? `ring-2 ${s.ring} border-transparent` : 'border-gray-800'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleSelect(item.id)}
          className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-sky-500 border-sky-500 text-white' : 'border-gray-600 hover:border-gray-400'}`}
        >
          {selected && <IconCheck size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate" title={item.filename}>{item.filename}</p>
          <p className="text-gray-500 text-xs mt-0.5">{fmtDate(item.uploaded_at)}</p>
        </div>

        <ScoreBadge score={item.opportunity_score} label={item.score_label} small />
      </div>

      <ScoreBar score={item.opportunity_score} label={item.score_label} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-800/50 px-2 py-2">
          <p className="text-white font-bold text-base">{item.row_count}</p>
          <p className="text-gray-500 text-xs mt-0.5">Gigs</p>
        </div>
        <div className="rounded-lg bg-gray-800/50 px-2 py-2">
          <p className="text-white font-bold text-base">{item.avg_queue != null ? Number(item.avg_queue).toFixed(1) : '—'}</p>
          <p className="text-gray-500 text-xs mt-0.5">Avg Queue</p>
        </div>
        <div className="rounded-lg bg-gray-800/50 px-2 py-2">
          <p className="text-white font-bold text-base">{item.avg_growth != null ? Number(item.avg_growth).toFixed(3) : '—'}</p>
          <p className="text-gray-500 text-xs mt-0.5">Avg Growth</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
        <button
          onClick={() => onOpen(item.id)}
          disabled={isLoading || isDeleting}
          className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-600/40 hover:border-sky-500/60 text-sky-400 hover:text-sky-300 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Load & View'}
          {isLoading ? <IconLoader2 size={13} className="animate-spin" /> : <IconExternalLink size={13} />}
        </button>

        {item.cleaned_csv_text && (
          <button
            onClick={downloadCSV}
            disabled={isDeleting}
            className="flex items-center justify-center gap-1.5 bg-gray-800/70 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-300 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50"
            title="Download cleaned CSV"
          >
            <IconDownload size={13} />
          </button>
        )}

        <button
          onClick={() => onDelete(item.id)}
          disabled={isLoading || isDeleting}
          className="flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-800/40 hover:border-red-700/60 text-red-500 hover:text-red-400 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50"
          title="Delete"
        >
          {isDeleting ? <IconLoader2 size={13} className="animate-spin" /> : <IconTrash size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function HistoryTab({ onLoadAnalysis }) {
  const [history, setHistory] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('loading');
  const [fetchError, setFetchError] = useState('');

  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState('desc');
  const [labelFilter, setLabelFilter] = useState('');
  const [search, setSearch] = useState('');
  
  // New date filtering state
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'custom'
  const [customDate, setCustomDate] = useState('');
  const [expandedBatches, setExpandedBatches] = useState(new Set());

  const [selected, setSelected] = useState(new Set());
  const [comparing, setComparing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Load filter/sort settings from localStorage on mount
  useEffect(() => {
    const savedSort = localStorage.getItem('historySort');
    const savedOrder = localStorage.getItem('historyOrder');
    const savedLabelFilter = localStorage.getItem('historyLabelFilter');
    const savedSearch = localStorage.getItem('historySearch');
    const savedDateFilter = localStorage.getItem('historyDateFilter');
    const savedCustomDate = localStorage.getItem('historyCustomDate');

    if (savedSort) setSort(savedSort);
    if (savedOrder) setOrder(savedOrder);
    if (savedLabelFilter) setLabelFilter(savedLabelFilter);
    if (savedSearch) setSearch(savedSearch);
    if (savedDateFilter) setDateFilter(savedDateFilter);
    if (savedCustomDate) setCustomDate(savedCustomDate);
  }, []);

  // Save filter/sort settings to localStorage on changes
  useEffect(() => {
    localStorage.setItem('historySort', sort);
  }, [sort]);

  useEffect(() => {
    localStorage.setItem('historyOrder', order);
  }, [order]);

  useEffect(() => {
    localStorage.setItem('historyLabelFilter', labelFilter);
  }, [labelFilter]);

  useEffect(() => {
    localStorage.setItem('historySearch', search);
  }, [search]);

  useEffect(() => {
    localStorage.setItem('historyDateFilter', dateFilter);
  }, [dateFilter]);

  useEffect(() => {
    localStorage.setItem('historyCustomDate', customDate);
  }, [customDate]);

  const fetchHistory = useCallback(async () => {
    setFetchStatus('loading');
    setFetchError('');
    try {
      const params = { sort, order };
      if (labelFilter) params.label = labelFilter;
      const { data } = await axios.get('/api/history', { params });
      if (data.dbDisabled) {
        setFetchStatus('disabled');
        return;
      }
      setHistory(data.history || []);
      setFetchStatus('done');
    } catch (err) {
      setFetchError(err.response?.data?.error || err.message);
      setFetchStatus('error');
    }
  }, [sort, order, labelFilter]);

  useEffect(() => {
    fetchHistory();
    setSelected(new Set());
    setComparing(false);
  }, [fetchHistory]);

  const toggleSort = (field) => {
    if (sort === field) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(field);
      setOrder(field === 'filename' ? 'asc' : 'desc');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Helper: Sort items based on current sort preference and order
  const sortItems = (items) => {
    const sorted = [...items];
    
    if (sort === 'score') {
      sorted.sort((a, b) => {
        // Parse scores as numbers (they come as strings like "44.0700")
        const scoreA = parseFloat(a.opportunity_score || 0);
        const scoreB = parseFloat(b.opportunity_score || 0);
        return order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
    } else if (sort === 'filename') {
      sorted.sort((a, b) => {
        const nameA = (a.filename || '').toLowerCase();
        const nameB = (b.filename || '').toLowerCase();
        const comparison = nameA.localeCompare(nameB);
        return order === 'desc' ? -comparison : comparison;
      });
    } else if (sort === 'rows') {
      sorted.sort((a, b) => {
        const rowsA = a.row_count || 0;
        const rowsB = b.row_count || 0;
        return order === 'desc' ? rowsB - rowsA : rowsA - rowsB;
      });
    } else {
      // Default: sort by date
      sorted.sort((a, b) => {
        const timeA = new Date(a.uploaded_at).getTime();
        const timeB = new Date(b.uploaded_at).getTime();
        return order === 'desc' ? timeB - timeA : timeA - timeB;
      });
    }
    
    return sorted;
  };

  const clearSelection = () => {
    setSelected(new Set());
    setComparing(false);
  };

  const resetToHistory = () => {
    setSort('date');
    setOrder('desc');
    setLabelFilter('');
    setSearch('');
    setDateFilter('all');
    setCustomDate('');
    setComparing(false);
    setSelected(new Set());
    setExpandedBatches(new Set());
  };

  const handleSelectAllVisible = (visible) => {
    setSelected(new Set(visible.map((h) => h.id)));
    if (visible.length < 2) setComparing(false);
  };

  const handleOpenDashboard = (id) => {
    setLoadingId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('historyId', id);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
    setTimeout(() => setLoadingId(null), 500);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this upload from history? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/history/${id}`);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  const handleReanalyzeSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setReanalyzing(true);
    try {
      await axios.post('/api/history/reanalyze', { ids });
      await fetchHistory();
      alert(`Reanalyzed ${ids.length} item(s) with all opportunity formulas.`);
    } catch (err) {
      alert('Reanalysis failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setReanalyzing(false);
    }
  };

  const handleBulkDelete = async (ids) => {
    const count = ids.length;
    if (!window.confirm(`Delete ${count} upload${count !== 1 ? 's' : ''} from history? This cannot be undone.`)) return;

    setBulkDeleting(true);
    try {
      for (const id of ids) {
        await axios.delete(`/api/history/${id}`);
      }
      setHistory((prev) => prev.filter((h) => !ids.includes(h.id)));
      setSelected(new Set());
      alert(`Deleted ${count} upload${count !== 1 ? 's' : ''} successfully.`);
    } catch (err) {
      alert('Bulk delete failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setBulkDeleting(false);
    }
  };

  // Filter by date
  const filteredByDate = useMemo(() => {
    return history.filter((h) => {
      if (dateFilter === 'today') return isToday(h.uploaded_at);
      if (dateFilter === 'week') return isLastWeek(h.uploaded_at);
      if (dateFilter === 'custom' && customDate) {
        return dateOnly(h.uploaded_at) === customDate;
      }
      return true;
    });
  }, [history, dateFilter, customDate]);

  const visible = filteredByDate.filter(
    (h) => !search || (h.filename || '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedItems = visible.filter((h) => selected.has(h.id));
  const allVisibleSelected = visible.length > 0 && visible.every((h) => selected.has(h.id));

  const showBackButton =
    comparing || search || labelFilter || sort !== 'date' || order !== 'desc' || selected.size > 0;

  const SortBtn = ({ field, label }) => {
    const active = sort === field;
    const Icon = order === 'asc' ? IconArrowUp : IconArrowDown;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          active
            ? 'bg-sky-500/20 border-sky-600/50 text-sky-300'
            : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-300 hover:border-gray-600'
        }`}
      >
        {label}
        {active && <Icon size={11} />}
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Upload History</h2>
          <p className="text-gray-400 text-sm">
            Select items, compare, and reanalyze with all opportunity formulas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showBackButton && (
            <button onClick={resetToHistory} className="btn-secondary flex items-center gap-2 text-xs">
              <IconArrowBackUp size={14} />
              Back to History
            </button>
          )}
          {fetchStatus === 'done' && (
            <button onClick={fetchHistory} className="btn-secondary flex items-center gap-2 text-xs shrink-0">
              <IconRefresh size={14} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {fetchStatus === 'disabled' && (
        <div className="card p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
            <IconFolderOff size={28} className="text-gray-600" />
          </div>
          <div>
            <p className="text-white font-semibold">History requires a database</p>
            <p className="text-gray-500 text-sm mt-1 max-w-md">
              Start the app via Docker Compose so PostgreSQL is available.
            </p>
          </div>
        </div>
      )}

      {fetchStatus === 'loading' && (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
          <IconLoader2 size={20} className="animate-spin text-sky-400" />
          <span className="text-sm">Loading history…</span>
        </div>
      )}

      {fetchStatus === 'error' && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">
          <IconAlertCircle size={18} className="shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Could not load history</p>
            <p className="text-red-500/80 text-xs mt-0.5">{fetchError}</p>
          </div>
          <button onClick={fetchHistory} className="shrink-0 text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
            <IconRefresh size={12} /> Retry
          </button>
        </div>
      )}

      {fetchStatus === 'done' && history.length > 0 && (
        <div className="space-y-3">
          {/* Date Filter Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-500 text-xs font-medium">Filter by date:</span>
            <button
              onClick={() => {
                setDateFilter('all');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFilter === 'all'
                  ? 'bg-sky-500/20 border-sky-600/50 text-sky-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setDateFilter('today');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFilter === 'today'
                  ? 'bg-sky-500/20 border-sky-600/50 text-sky-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                setDateFilter('week');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFilter === 'week'
                  ? 'bg-sky-500/20 border-sky-600/50 text-sky-300'
                  : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              Last Week
            </button>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setDateFilter('custom');
                }}
                className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-600"
              />
              {customDate && (
                <button
                  onClick={() => {
                    setCustomDate('');
                    setDateFilter('all');
                  }}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Main filter controls */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename…"
              className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-600 w-48"
            />

            <div className="flex items-center gap-1.5">
              <IconFilter size={14} className="text-gray-500" />
              <span className="text-gray-500 text-xs">Sort:</span>
              <SortBtn field="date" label="Date" />
              <SortBtn field="score" label="Score" />
              <SortBtn field="filename" label="Name" />
              <SortBtn field="rows" label="Gigs" />
            </div>

            <div className="flex gap-1.5 ml-auto">
              {['', 'GREEN', 'YELLOW', 'RED'].map((lbl) => {
                const s = lbl ? labelStyle(lbl) : null;
                return (
                  <button
                    key={lbl || 'ALL'}
                    onClick={() => setLabelFilter(lbl)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      labelFilter === lbl
                        ? lbl
                          ? `${s.bg} ${s.border} ${s.text}`
                          : 'bg-sky-500/20 border-sky-600/50 text-sky-300'
                        : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {lbl || 'All'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {fetchStatus === 'done' && visible.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => (allVisibleSelected ? clearSelection() : handleSelectAllVisible(visible))}
            className="flex items-center gap-1.5 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            <IconListCheck size={13} />
            {allVisibleSelected ? 'Clear All' : `Select All (${visible.length})`}
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 flex-wrap">
          <span className="text-sky-300 text-sm font-medium">
            {selected.size} upload{selected.size !== 1 ? 's' : ''} selected
          </span>

          <button
            onClick={() => setComparing(true)}
            disabled={selected.size < 2}
            className="flex items-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-600/50 text-sky-300 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <IconScale size={13} />
            Compare {selected.size >= 2 ? `(${selected.size})` : '(select ≥ 2)'}
          </button>

          <button
            onClick={handleReanalyzeSelected}
            disabled={reanalyzing}
            className="flex items-center gap-1.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-600/50 text-violet-300 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
          >
            {reanalyzing ? <IconLoader2 size={13} className="animate-spin" /> : <IconCalculator size={13} />}
            {reanalyzing ? 'Reanalyzing…' : 'Reanalyze Selected'}
          </button>

          <button
            onClick={() => {
              const selectedIds = Array.from(selected);
              handleBulkDelete(selectedIds);
            }}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-600/50 text-red-300 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
          >
            {bulkDeleting ? <IconLoader2 size={13} className="animate-spin" /> : <IconTrashX size={13} />}
            {bulkDeleting ? 'Deleting…' : 'Delete Selected'}
          </button>

          <button
            onClick={clearSelection}
            className="ml-auto text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1"
          >
            <IconX size={12} /> Clear selection
          </button>
        </div>
      )}

      {comparing && selectedItems.length >= 2 && (
        <ComparePanel items={selectedItems} onClose={() => setComparing(false)} />
      )}

      {fetchStatus === 'done' && visible.length === 0 && (
        <div className="card p-12 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
            <IconHistory size={28} className="text-gray-600" />
          </div>
          <div>
            <p className="text-white font-semibold">{search ? 'No uploads match your search' : 'No uploads saved yet'}</p>
            <p className="text-gray-500 text-sm mt-1">
              {search ? 'Try a different filename.' : 'Upload and analyze a file to save it in history.'}
            </p>
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="text-sky-400 hover:text-sky-300 text-sm">
              Clear search
            </button>
          )}
        </div>
      )}

      {fetchStatus === 'done' && visible.length > 0 && (
        <>
          <div className="text-gray-500 text-xs">
            Showing {visible.length} of {history.length} upload{history.length !== 1 ? 's' : ''}
            {labelFilter && ` · filtered: ${labelFilter}`}
            {dateFilter !== 'all' && ` · date filtered`}
          </div>

          {/* Batch Grouping Display */}
          {visible.length > 0 && (
            <div className="space-y-3">
              {(() => {
                // Sort visible items based on user's sort preference
                const sorted = sortItems(visible);
                
                // Group by batch (5-minute windows)
                const batches = groupByBatch(sorted);
                
                return batches.map((batch, batchIndex) => {
                  const batchId = `batch-${batchIndex}`;
                  const isExpanded = expandedBatches.has(batchId);
                  const firstItem = batch[0];
                  const batchDate = dateOnly(firstItem.uploaded_at);
                  const isBatchToday = isToday(firstItem.uploaded_at);
                  const batchLabel = isBatchToday ? 'Today' : batchDate;
                  
                  return (
                    <div key={batchId} className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                      {/* Batch Header */}
                      <button
                        onClick={() => {
                          setExpandedBatches((prev) => {
                            const next = new Set(prev);
                            if (next.has(batchId)) {
                              next.delete(batchId);
                            } else {
                              next.add(batchId);
                            }
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <IconChevronDown size={16} className="text-sky-400" />
                          ) : (
                            <IconChevronRight size={16} className="text-gray-500" />
                          )}
                          <div className="text-left">
                            <div className="text-sm font-semibold text-white">
                              Batch {batchIndex + 1} {batchLabel && `— ${batchLabel}`}
                            </div>
                            <div className="text-xs text-gray-500">
                              {batch.length} file{batch.length !== 1 ? 's' : ''} uploaded at{' '}
                              {new Date(firstItem.uploaded_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">
                            {batch.length}
                          </span>
                        </div>
                      </button>

                      {/* Batch Content - Expandable */}
                      {isExpanded && (
                        <div className="border-t border-gray-700 p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {batch.map((item) => (
                              <HistoryCard
                                key={item.id}
                                item={item}
                                selected={selected.has(item.id)}
                                onToggleSelect={toggleSelect}
                                onOpen={handleOpenDashboard}
                                onDelete={handleDelete}
                                loadingId={loadingId}
                                deletingId={deletingId}
                              />
                            ))}
                          </div>

                          {/* Batch Bulk Delete Option */}
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-700">
                            <button
                              onClick={() => {
                                const batchIds = batch.map((item) => item.id);
                                handleBulkDelete(batchIds);
                              }}
                              disabled={bulkDeleting}
                              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-600/50 text-red-300 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                            >
                              <IconTrashX size={13} />
                              {bulkDeleting ? 'Deleting…' : `Delete Batch (${batch.length})`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
