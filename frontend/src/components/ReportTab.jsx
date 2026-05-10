import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { useReactToPrint } from 'react-to-print';
import { IconPrinter, IconPhoto } from '@tabler/icons-react';
import { scoreColor } from '../utils/chartData.js';

function ScoreBadge({ score, label }) {
  const colors = scoreColor(label);
  return (
    <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border-2 ${colors.border} ${colors.text} font-bold text-lg`}>
      <span className="text-3xl font-black">{score}</span>
      <div className="flex flex-col text-left text-xs leading-tight">
        <span>Final Opportunity</span>
        <span>Composite</span>
      </div>
      <span className={`ml-2 px-3 py-1 ${colors.bg} text-white rounded-full text-sm`}>
        {label}
      </span>
    </div>
  );
}

export default function ReportTab({ data }) {
  const { scoreResult } = data;
  const reportRef = useRef();
  const [savingImage, setSavingImage] = useState(false);
  const reportTitle = data.keyword || data.filename?.replace(/\.(csv|xlsx?)$/i, '') || 'Opportunity Report';

  const handlePrint = useReactToPrint({
    content: () => reportRef.current,
    documentTitle: 'GigOpportunity-Report',
  });

  const handleScreenshot = async () => {
    if (!reportRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${reportTitle.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}_report.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.warn('Report screenshot failed:', err);
      alert('Could not export the report image.');
    } finally {
      setSavingImage(false);
    }
  };

  const colors = scoreColor(scoreResult.label);
  const formulas = Object.values(scoreResult.formulas || {});

  const interpretation = {
    GREEN: 'Strong combined signal across demand, competition quality, trend, and feasibility.',
    YELLOW: 'Mixed signal. Opportunity exists, but requires sharper positioning and execution.',
    RED: 'Weak combined signal. Market likely crowded, declining, or hard to penetrate now.',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-400">Opportunity Report</p>
          <h1 className="text-4xl font-black text-white tracking-tight">{reportTitle}</h1>
          {data.filename && !data.keyword && (
            <p className="text-gray-400 mt-1 text-sm">Source file: {data.filename}</p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2 text-sm">
            <IconPrinter size={16} />
            Export PDF
          </button>
          <button
            onClick={handleScreenshot}
            disabled={savingImage}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <IconPhoto size={16} />
            {savingImage ? 'Saving…' : 'Export JPEG'}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="card p-8 space-y-8 print:bg-white print:text-black print:border-none">
        <div className="flex flex-col gap-6">
          <div>
            <ScoreBadge score={scoreResult.score} label={scoreResult.label} />
          </div>

          <div className={`rounded-xl border ${colors.border} p-5 bg-gray-900/50`}>
            <h3 className={`font-bold ${colors.text} mb-2`}>Interpretation — {scoreResult.label}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{interpretation[scoreResult.label]}</p>
            <div className="mt-3 text-xs text-gray-400 grid sm:grid-cols-4 gap-2">
              <div>Avg Queue: <span className="text-gray-200">{scoreResult.avgQueue ?? '—'}</span></div>
              <div>Avg Growth: <span className="text-gray-200">{scoreResult.avgGrowth ?? '—'}</span></div>
              <div>Avg Price: <span className="text-gray-200">{scoreResult.avgPrice ?? '—'}</span></div>
              <div>Avg Rating: <span className="text-gray-200">{scoreResult.avgRating ?? '—'}</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-white font-bold text-lg">Formula Summary</h3>
          <p className="text-xs text-gray-500">These score components are shown as a brief interpretation of what they mean for your niche, without exposing raw formula text.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {formulas.map((variant, index) => {
              const variantColor = scoreColor(variant.label);
              const key = variant.id || variant.name || index;
              return (
                <div key={key} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-white font-semibold">{variant.name}</p>
                    <span className={`text-sm font-bold ${variantColor.text}`}>
                      {variant.score} · {variant.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {variant.interpretation || 'This score reflects the balance of demand, competition quality, and growth potential for the selected niche.'}
                  </p>
                  {variant.note && (
                    <p className="text-xs text-yellow-400/80 mt-1">{variant.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-white font-bold text-lg">Market Criteria Snapshot</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Total Sellers</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.totalSellers ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Orders Queue (All)</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.totalOrdersQueue ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Orders Queue (Top 20)</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.ordersQueueTop20 ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Top Rated Sellers</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.topRatedSellers ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Low-Level Sellers</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.lowLevelSellers ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
              <p className="text-gray-500">Last 10 Orders</p>
              <p className="text-white font-bold mt-1">{scoreResult.details?.last10Orders ?? '—'}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4 text-xs text-gray-600">
          <span>Generated by GigOpportunity AI</span>
        </div>
      </div>
    </div>
  );
}
