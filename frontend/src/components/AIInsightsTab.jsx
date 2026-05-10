import { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../utils/api';
import {
  IconLoader2,
  IconAlertCircle,
  IconRefresh,
  IconBulb,
  IconSparkles,
  IconLayoutColumns,
  IconCloudCheck,
} from '@tabler/icons-react';
import { scoreColor } from '../utils/chartData.js';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-white mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-sky-400 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-white mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-gray-300">$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex gap-2 text-gray-300 text-sm"><span class="text-sky-400 mt-0.5 shrink-0">•</span><span>$1</span></li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="flex gap-2 text-gray-300 text-sm"><span class="text-purple-400 font-bold shrink-0">$1.</span><span>$2</span></li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="space-y-1.5 my-2">$&</ul>')
    .replace(/\n\n/g, '</p><p class="text-gray-400 text-sm mb-2">')
    .replace(/^/, '<p class="text-gray-400 text-sm mb-2">')
    .replace(/$/, '</p>');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    model: 'gemini-2.0-flash',
    models: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.0-pro-exp',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
    ],
    emoji: '✨',
    color: 'sky',
    activeBg: 'bg-sky-500/15 border-sky-500/50',
    cardBorder: 'border-sky-500/20',
    headerText: 'text-sky-400',
    spinnerColor: 'text-sky-400',
    badgeBg: 'bg-sky-500/20 text-sky-300',
  },
  bigmodel: {
    id: 'bigmodel',
    label: 'BigModel GLM',
    model: 'glm-4-flash',
    emoji: '🧠',
    color: 'violet',
    activeBg: 'bg-violet-500/15 border-violet-500/50',
    cardBorder: 'border-violet-500/20',
    headerText: 'text-violet-400',
    spinnerColor: 'text-violet-400',
    badgeBg: 'bg-violet-500/20 text-violet-300',
  },
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Single Provider Pane                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function ProviderPane({ providerKey, data, uploadId, triggerGenerate }) {
  const p = PROVIDERS[providerKey];
  const preloaded = data.savedInsights?.[providerKey];

  const [status, setStatus] = useState(preloaded ? 'done' : 'idle');
  const [insights, setInsights] = useState(preloaded?.insights || '');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(preloaded?.generatedAt || null);
  const [modelUsed, setModelUsed] = useState(preloaded?.model || '');
  const [selectedModel, setSelectedModel] = useState(p.models?.[0] || '');

  // Allow parent (AIInsightsTab) to trigger generation (used by "Generate Both")
  useEffect(() => {
    if (triggerGenerate > 0 && status === 'idle') {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerGenerate]);

  const generate = async () => {
    setStatus('loading');
    setError('');
    try {
      const { data: res } = await axios.post(`${API_BASE_URL}/analyze/insights`, {
        cleanedRows: data.cleanedRows,
        scoreResult: data.scoreResult,
        dates: data.dates,
        provider: providerKey,
        model: providerKey === 'gemini' ? selectedModel : undefined,
      });
      setInsights(res.insights);
      setModelUsed(res.model || p.model);
      setStatus('done');
      setSavedAt(null); // newly generated, not "saved" yet

      // Persist to history DB if we have an upload id
      if (uploadId) {
        try {
          await axios.post(`${API_BASE_URL}/history/${uploadId}/insights`, {
            provider: providerKey,
            modelName: res.model || p.model,
            insights: res.insights,
          });
          setSavedAt(new Date().toISOString());
        } catch {
          /* silently skip DB save failure */
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{p.emoji}</span>
          <h3 className={`font-bold text-base ${p.headerText}`}>{p.label}</h3>
          {preloaded && status === 'done' && !insights.startsWith(preloaded.insights?.slice(0, 20) ?? '') === false && savedAt && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <IconCloudCheck size={12} />
              Saved
            </span>
          )}
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <IconCloudCheck size={12} />
              Saved {fmtDate(savedAt)}
            </span>
          )}
        </div>
        {status === 'done' && (
          <button
            onClick={generate}
            className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 transition-colors"
          >
            <IconRefresh size={12} />
            Regenerate
          </button>
        )}
      </div>

      {providerKey === 'gemini' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Model to test:</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200"
          >
            {p.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {/* Idle */}
      {status === 'idle' && (
        <div className={`rounded-2xl border-2 p-8 flex flex-col items-center text-center gap-5 border-dashed border-gray-700`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-${p.color}-500/10`}>
            <IconBulb size={28} className={`text-${p.color}-400`} />
          </div>
          <div>
            <p className="text-white font-semibold">Ask {p.label}</p>
            <p className="text-gray-500 text-xs mt-1 max-w-xs">
              Analyzes your Opportunity Score, gig data, and time-series to give
              you actionable title, pricing, and growth advice.
            </p>
          </div>
          <button
            onClick={generate}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all
              bg-${p.color}-500/20 hover:bg-${p.color}-500/30 border border-${p.color}-600/50 hover:border-${p.color}-500 text-${p.color}-300`}
          >
            <IconSparkles size={15} />
            Generate {p.label} Insights
          </button>
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div className="rounded-2xl border border-gray-700 bg-gray-900/40 p-10 flex flex-col items-center gap-4 text-center">
          <IconLoader2 size={32} className={`animate-spin ${p.spinnerColor}`} />
          <div>
            <p className="text-white font-semibold text-sm">{p.label} is thinking…</p>
            <p className="text-gray-500 text-xs mt-1">Analyzing your data. Usually 5–20 seconds.</p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 text-sm">
            <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Failed</p>
              <p className="text-red-500/80 text-xs mt-0.5">{error}</p>
              {error.includes('API_KEY') && (
                <p className="mt-2 text-red-400/70 text-xs">
                  Check that{' '}
                  <code className="bg-red-900/30 px-1 rounded">
                    {providerKey === 'bigmodel' ? 'BIGMODEL_API_KEY' : 'GEMINI_API_KEY'}
                  </code>{' '}
                  is set in <code className="bg-red-900/30 px-1 rounded">backend/.env</code> and restart.
                </p>
              )}
            </div>
          </div>
          <button onClick={generate} className="btn-secondary flex items-center gap-2 text-sm">
            <IconRefresh size={14} />
            Try Again
          </button>
        </div>
      )}

      {/* Result */}
      {status === 'done' && insights && (
        <div className={`card p-5 border ${p.cardBorder}`}>
          <div
            className="prose prose-invert prose-sm max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(insights) }}
          />
          <p className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-600 flex items-center gap-1.5">
            <span>{p.emoji}</span>
            Generated by {p.label}
            {modelUsed && <span>({modelUsed})</span>}
            <span>· Always verify AI advice with your own research.</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main AIInsightsTab                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function AIInsightsTab({ data }) {
  const { scoreResult } = data;
  const uploadId = data.id || null;

  // Sub-tab: 'gemini' | 'bigmodel' | 'compare'
  const [activePane, setActivePane] = useState('gemini');

  // Counters used to signal ProviderPanes to auto-generate (for "Ask Both")
  const [geminiTrigger, setGeminiTrigger] = useState(0);
  const [bigmodelTrigger, setBigmodelTrigger] = useState(0);

  const colors = scoreColor(scoreResult.label);

  const askBoth = () => {
    setGeminiTrigger((n) => n + 1);
    setBigmodelTrigger((n) => n + 1);
    setActivePane('compare');
  };

  const SUB_TABS = [
    { id: 'gemini', label: 'Google Gemini', emoji: '✨' },
    { id: 'bigmodel', label: 'BigModel GLM', emoji: '🧠' },
    { id: 'compare', label: 'Side by Side', icon: IconLayoutColumns },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">AI Insights</h2>
          <p className="text-gray-400 text-sm">
            Two independent AI models — each analyzes your data separately so you
            can compare perspectives and make a more informed decision.
          </p>
        </div>
        <div className={`shrink-0 px-4 py-2 rounded-xl border ${colors.border} ${colors.text} text-sm font-bold`}>
          Score: {scoreResult.score} — {scoreResult.label}
        </div>
      </div>

      {/* Sub-tab selector + "Ask Both" button */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-gray-900 rounded-xl p-1 border border-gray-800">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const active = activePane === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActivePane(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
                  ${active
                    ? t.id === 'bigmodel'
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                      : t.id === 'compare'
                        ? 'bg-gray-700 text-white border border-gray-600'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                {t.emoji && <span>{t.emoji}</span>}
                {Icon && <Icon size={14} />}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={askBoth}
          className="flex items-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-600/40 hover:border-purple-500/60 text-purple-300 hover:text-purple-200 rounded-xl px-4 py-2 text-sm font-medium transition-all"
        >
          <IconSparkles size={14} />
          Ask Both Simultaneously
        </button>

        {uploadId && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600 ml-auto">
            <IconCloudCheck size={13} className="text-green-600" />
            Insights auto-saved to history
          </span>
        )}
      </div>

      {/* ── Gemini pane ─────────────────────────────────────────────────────── */}
      {activePane === 'gemini' && (
        <ProviderPane
          key={`gemini-${data.id}`}
          providerKey="gemini"
          data={data}
          uploadId={uploadId}
          triggerGenerate={geminiTrigger}
        />
      )}

      {/* ── BigModel pane ───────────────────────────────────────────────────── */}
      {activePane === 'bigmodel' && (
        <ProviderPane
          key={`bigmodel-${data.id}`}
          providerKey="bigmodel"
          data={data}
          uploadId={uploadId}
          triggerGenerate={bigmodelTrigger}
        />
      )}

      {/* ── Side-by-side compare ─────────────────────────────────────────────── */}
      {activePane === 'compare' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProviderPane
            key={`gemini-cmp-${data.id}`}
            providerKey="gemini"
            data={data}
            uploadId={uploadId}
            triggerGenerate={geminiTrigger}
          />
          <ProviderPane
            key={`bigmodel-cmp-${data.id}`}
            providerKey="bigmodel"
            data={data}
            uploadId={uploadId}
            triggerGenerate={bigmodelTrigger}
          />
        </div>
      )}

    </div>
  );
}
