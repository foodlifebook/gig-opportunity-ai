import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from 'recharts';
import {
  buildTotalOrdersLineData,
  buildQueueBarData,
  buildSaturationPieData,
  scoreColor,
  fmtDate,
} from '../utils/chartData.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs shadow-xl">
        <p className="text-gray-400 mb-1">{fmtDate(label)}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
            {p.name}: {p.value?.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function ScoreGauge({ score, label }) {
  const colors = scoreColor(label);
  const max = 100;
  const pct = Math.min(score / max, 1);

  const gaugeData = [
    { name: 'score', value: Math.round(pct * 100), fill: colors.hex },
    { name: 'empty', value: 100 - Math.round(pct * 100), fill: '#1f2937' },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative w-44 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="90%"
            startAngle={210}
            endAngle={-30}
            data={gaugeData}
            barSize={16}
          >
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#1f2937' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${colors.text}`}>{score}</span>
          <span className="text-xs text-gray-500 mt-0.5">Score</span>
        </div>
      </div>
      <div className={`px-4 py-1.5 rounded-full text-sm font-bold ${colors.bg} text-white shadow-lg`}>
        {label === 'GREEN' ? '🟢 Strong Opportunity' : label === 'YELLOW' ? '🟡 Moderate' : '🔴 Saturated — Avoid'}
      </div>
    </div>
  );
}

export default function DashboardTab({ data }) {
  const { cleanedRows, dates, scoreResult } = data;
  const dashboardRef = useRef(null);
  const [savingImage, setSavingImage] = useState(false);

  const lineData = useMemo(() => buildTotalOrdersLineData(cleanedRows, dates), [cleanedRows, dates]);
  const barData = useMemo(() => buildQueueBarData(cleanedRows, dates), [cleanedRows, dates]);
  const pieData = useMemo(() => buildSaturationPieData(cleanedRows), [cleanedRows]);

  const colors = scoreColor(scoreResult.label);
  const formulaVariants = scoreResult.formulas ? Object.values(scoreResult.formulas) : [];
  const reportTitle = data.keyword || data.filename?.replace(/\.(csv|xlsx?)$/i, '') || 'Live Dashboard';

  const handleScreenshot = async () => {
    if (!dashboardRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        backgroundColor: '#0b1120',
        scale: 2,
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${reportTitle.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}_dashboard.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.warn('Dashboard screenshot failed:', err);
      alert('Could not capture the dashboard image.');
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <div ref={dashboardRef} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-400">Live Dashboard</p>
          <h1 className="text-4xl font-black text-white tracking-tight">{reportTitle}</h1>
          {data.keyword ? (
            <p className="text-gray-400 mt-1 text-sm">Keyword report for {data.keyword}</p>
          ) : data.filename ? (
            <p className="text-gray-400 mt-1 text-sm">File: {data.filename}</p>
          ) : null}
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={handleScreenshot}
            disabled={savingImage}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {savingImage ? 'Saving…' : 'Export JPEG'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Gigs Analyzed', value: cleanedRows.length.toLocaleString(), sub: 'rows in dataset' },
          { label: 'Date Range', value: dates.length, sub: 'tracking days' },
          { label: 'Avg Queue', value: scoreResult.avgQueue, sub: 'orders/day unmet' },
          { label: 'Daily Growth', value: `+${scoreResult.avgGrowth}`, sub: 'orders/day avg' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-gray-500 text-xs">{s.label}</p>
            <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
            <p className="text-gray-600 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Demand Growth Line Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">📈 Demand Growth — Total Orders Over Time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="totalOrders"
                name="Total Orders"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#0ea5e9' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Queue Bar Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">📦 Total Orders in Queue (Unmet Demand)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ordersInQueue" name="Queue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Saturation Pie */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">🥧 Saturation Breakdown</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: '#374151' }}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
              No order volume data found in this CSV.
            </div>
          )}
        </div>

        {/* 4. Score Gauge */}
        <div className="card p-5 flex flex-col items-center justify-center gap-4">
          <h3 className="font-semibold text-white text-sm self-start">🎯 Opportunity Score</h3>
          <ScoreGauge score={scoreResult.score} label={scoreResult.label} />
          <div className="w-full border-t border-gray-800 pt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { band: '< 35', color: 'text-red-400', label: 'Weak' },
              { band: '35–59', color: 'text-yellow-400', label: 'Moderate' },
              { band: '≥ 60', color: 'text-green-400', label: 'Strong' },
            ].map((b) => (
              <div key={b.band}>
                <p className={`text-xs font-bold ${b.color}`}>{b.band}</p>
                <p className="text-gray-600 text-xs">{b.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Score Scale Details (Bottom) */}
      <div>
        <h3 className="font-semibold text-white mb-3">Opportunity Score Scale</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { range: 'Score ≥ 60', label: 'GREEN', desc: 'Strong Opportunity — Enter now', bg: 'bg-green-500/10 border-green-500/30 text-green-400' },
            { range: 'Score 35–59', label: 'YELLOW', desc: 'Moderate — Entry with strategy', bg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
            { range: 'Score < 35', label: 'RED', desc: 'Weak or saturated — consider alternatives', bg: 'bg-red-500/10 border-red-500/30 text-red-400' },
          ].map((b) => (
            <div key={b.label} className={`rounded-xl border p-4 ${b.bg}`}>
              <p className="font-bold text-sm">{b.label}</p>
              <p className="text-xs opacity-80 mt-0.5">{b.range}</p>
              <p className="text-xs opacity-60 mt-1">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {formulaVariants.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-white">Alternative Formula Results</h3>
          <p className="text-xs text-gray-500">
            Same file, different scoring logic — compare these to decide how strict or optimistic you want to be.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {formulaVariants.map((variant, index) => {
              const variantColor = scoreColor(variant.label);
              const key = variant.id || variant.name || index;
              return (
                <div key={key} className="card p-4 border border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-white font-semibold">{variant.name}</p>
                    <span className={`text-sm font-bold ${variantColor.text}`}>
                      {variant.score} · {variant.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {variant.interpretation || 'A combined estimate of demand, competition quality, and queue strength.'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
